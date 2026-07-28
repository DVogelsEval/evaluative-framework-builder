import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvaluationQuestion, createProjectManifest } from "../domain/factory";
import {
  openJsonFromDisk,
  readEvalqFile,
  readProjectFile,
  rememberSaveHandle,
  saveJsonToDisk,
  supportsFileSystemAccess,
} from "./file";

const asFile = (value: unknown, name: string): File =>
  new File([JSON.stringify(value)], name, { type: "application/json" });

describe("readProjectFile — save-file-style Open view (R-008)", () => {
  it("parses a saved Project file with its embedded EQs", async () => {
    const project = createProjectManifest("Demo Project");
    project.evaluationQuestions.push(createEvaluationQuestion("Reading program quality"));
    const parsed = await readProjectFile(asFile(project, "demo-project.project.json"));
    expect(parsed).toEqual(project);
  });

  it("migrates a legacy v1 manifest (file refs) to an empty v2 Project", async () => {
    const legacy = {
      id: crypto.randomUUID(),
      name: "Legacy Project",
      schemaVersion: 1,
      evaluationQuestionRefs: [{ id: crypto.randomUUID(), title: "Old EQ", file: "old.evalq.json" }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed = await readProjectFile(asFile(legacy, "project.json"));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.evaluationQuestions).toEqual([]);
  });

  it("rejects JSON that is not a Project — including an .evalq.json document", async () => {
    await expect(readProjectFile(asFile({ nope: true }, "project.json"))).rejects.toThrow();
    await expect(
      readProjectFile(asFile(createEvaluationQuestion("EQ"), "eq.evalq.json")),
    ).rejects.toThrow();
  });
});

describe("readEvalqFile", () => {
  it("round-trips a factory document and rejects a manifest", async () => {
    const doc = createEvaluationQuestion("EQ");
    await expect(readEvalqFile(asFile(doc, "eq.evalq.json"))).resolves.toEqual(doc);
    await expect(
      readEvalqFile(asFile(createProjectManifest("P"), "project.json")),
    ).rejects.toThrow();
  });
});

describe("saveJsonToDisk — save in place (⚠Q48, 2026-07-14 notes)", () => {
  // A fake File System Access picker: records writes, counts picker calls.
  const fakePicker = (fileName: string, failWrite = false) => {
    const written: string[] = [];
    let pickerCalls = 0;
    const handle = {
      name: fileName,
      createWritable: () =>
        failWrite
          ? Promise.reject(new Error("permission lost"))
          : Promise.resolve({
              write: (data: string) => {
                written.push(data);
                return Promise.resolve();
              },
              close: () => Promise.resolve(),
            }),
    };
    (globalThis as Record<string, unknown>)["showSaveFilePicker"] = () => {
      pickerCalls += 1;
      return Promise.resolve(handle);
    };
    return { written, pickerCalls: () => pickerCalls };
  };

  // downloadJson needs a DOM; give node a minimal stand-in for fallback paths.
  const stubDownloadDom = () => {
    const downloads: string[] = [];
    (globalThis as Record<string, unknown>)["document"] = {
      createElement: () => ({
        click: function (this: { download?: string }) {
          downloads.push(this.download ?? "");
        },
      }),
    };
    const url = URL as unknown as Record<string, unknown>;
    url["createObjectURL"] = () => "blob:stub";
    url["revokeObjectURL"] = () => undefined;
    return downloads;
  };

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)["showSaveFilePicker"];
    delete (globalThis as Record<string, unknown>)["document"];
    vi.restoreAllMocks();
  });

  it("asks where to save once, then overwrites the same file silently", async () => {
    const id = crypto.randomUUID();
    const picker = fakePicker("my.evalq.json");
    const first = await saveJsonToDisk(id, "my.evalq.json", { a: 1 });
    expect(first).toEqual({ result: "saved", fileName: "my.evalq.json" });
    const second = await saveJsonToDisk(id, "my.evalq.json", { a: 2 });
    expect(second).toEqual({ result: "saved", fileName: "my.evalq.json" });
    expect(picker.pickerCalls()).toBe(1); // no re-pick on the second save
    expect(picker.written).toHaveLength(2);
    expect(picker.written[1]).toContain('"a": 2');
  });

  it("cancelling the picker saves nothing and does not remember a handle", async () => {
    const id = crypto.randomUUID();
    (globalThis as Record<string, unknown>)["showSaveFilePicker"] = () =>
      Promise.reject(new DOMException("dismissed", "AbortError"));
    await expect(saveJsonToDisk(id, "x.json", {})).resolves.toEqual({
      result: "cancelled",
    });
    const picker = fakePicker("x.json"); // next save picks afresh
    await expect(saveJsonToDisk(id, "x.json", {})).resolves.toMatchObject({
      result: "saved",
    });
    expect(picker.pickerCalls()).toBe(1);
  });

  it("falls back to a download when the API is missing (Firefox/Safari)", async () => {
    const downloads = stubDownloadDom();
    const outcome = await saveJsonToDisk(crypto.randomUUID(), "fb.json", {});
    expect(outcome).toEqual({ result: "downloaded", fileName: "fb.json" });
    expect(downloads).toEqual(["fb.json"]);
  });

  it("a failed write forgets the handle and never loses the work (R-014)", async () => {
    const id = crypto.randomUUID();
    fakePicker("gone.json", true);
    const downloads = stubDownloadDom();
    const outcome = await saveJsonToDisk(id, "gone.json", { keep: true });
    expect(outcome).toEqual({ result: "downloaded", fileName: "gone.json" });
    expect(downloads).toEqual(["gone.json"]); // the bytes still reached the user
    const picker = fakePicker("gone.json"); // handle forgotten → picks again
    await expect(saveJsonToDisk(id, "gone.json", {})).resolves.toMatchObject({
      result: "saved",
    });
    expect(picker.pickerCalls()).toBe(1);
  });
});

describe("openJsonFromDisk — File System Access open + write-back (R-015)", () => {
  // A fake open picker: returns one handle whose getFile() yields `value` and
  // whose createWritable() records writes — the same handle can be written back.
  const fakeOpenPicker = (fileName: string, value: unknown) => {
    const written: string[] = [];
    let openCalls = 0;
    const handle = {
      name: fileName,
      getFile: () =>
        Promise.resolve(new File([JSON.stringify(value)], fileName, { type: "application/json" })),
      createWritable: () =>
        Promise.resolve({
          write: (data: string) => {
            written.push(data);
            return Promise.resolve();
          },
          close: () => Promise.resolve(),
        }),
    };
    (globalThis as Record<string, unknown>)["showOpenFilePicker"] = () => {
      openCalls += 1;
      return Promise.resolve([handle]);
    };
    return { handle, written, openCalls: () => openCalls };
  };

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)["showOpenFilePicker"];
    delete (globalThis as Record<string, unknown>)["showSaveFilePicker"];
  });

  it("reports support only when the API is present", () => {
    expect(supportsFileSystemAccess()).toBe(false);
    fakeOpenPicker("x.json", {});
    expect(supportsFileSystemAccess()).toBe(true);
  });

  it("returns the picked file + handle, and undefined when unsupported", async () => {
    expect(await openJsonFromDisk()).toBeUndefined(); // no API
    const doc = createEvaluationQuestion("EQ");
    fakeOpenPicker("eq.evalq.json", doc);
    const picked = await openJsonFromDisk();
    expect(picked).toBeDefined();
    expect(await readEvalqFile(picked!.file)).toEqual(doc);
  });

  it("returns undefined when the user dismisses the picker", async () => {
    (globalThis as Record<string, unknown>)["showOpenFilePicker"] = () =>
      Promise.reject(new DOMException("dismissed", "AbortError"));
    expect(await openJsonFromDisk()).toBeUndefined();
  });

  it("registering the opened handle makes the next Save overwrite it in place", async () => {
    const id = crypto.randomUUID();
    const opened = fakeOpenPicker("loop.evalq.json", { a: 1 });
    const picked = await openJsonFromDisk();
    rememberSaveHandle(id, picked!.handle);
    // No save picker is installed — Save must reuse the opened file's handle.
    const outcome = await saveJsonToDisk(id, "loop.evalq.json", { a: 2 });
    expect(outcome).toEqual({ result: "saved", fileName: "loop.evalq.json" });
    expect(opened.written[0]).toContain('"a": 2');
  });
});
