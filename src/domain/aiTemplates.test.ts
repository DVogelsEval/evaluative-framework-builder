import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  defaultTemplateSource,
} from "./aiTemplateDefaults";
import {
  AI_APPLIES_TO,
  mergeTemplateOverrides,
  parseTemplate,
  renderPrompt,
} from "./aiTemplates";

const SAMPLE = `---
id: sample-template
title: A sample template
appliesTo: mesoNode
version: 2
---
Body about {{nodeName}} on {{continuumTable}}.
RESPOND EXACTLY: ...`;

describe("parseTemplate (R-141)", () => {
  it("splits frontmatter from body and parses the metadata", () => {
    const t = parseTemplate(SAMPLE);
    expect(t.id).toBe("sample-template");
    expect(t.title).toBe("A sample template");
    expect(t.appliesTo).toBe("mesoNode");
    expect(t.version).toBe(2);
    expect(t.body.startsWith("Body about")).toBe(true);
    expect(t.body).not.toContain("---");
  });

  it("defaults version to 1 and keeps the full source", () => {
    const t = parseTemplate(SAMPLE.replace("version: 2\n", ""));
    expect(t.version).toBe(1);
    expect(t.source).toContain("id: sample-template");
  });

  it("tolerates CRLF line endings", () => {
    const t = parseTemplate(SAMPLE.replace(/\n/g, "\r\n"));
    expect(t.id).toBe("sample-template");
    expect(t.body).toContain("{{nodeName}}");
  });

  it("throws on missing frontmatter, missing id, or an invalid appliesTo", () => {
    expect(() => parseTemplate("no frontmatter here")).toThrow(/frontmatter/);
    expect(() =>
      parseTemplate("---\ntitle: x\nappliesTo: mesoNode\n---\nbody"),
    ).toThrow(/id/);
    expect(() =>
      parseTemplate("---\nid: x\ntitle: y\nappliesTo: nonsense\n---\nbody"),
    ).toThrow(/appliesTo/);
  });
});

describe("renderPrompt (R-140)", () => {
  it("substitutes known placeholders and tolerates inner whitespace", () => {
    const out = renderPrompt("Hi {{nodeName}} / {{ continuumTable }}", {
      nodeName: "Teaching quality",
      continuumTable: "Low | High",
    });
    expect(out).toBe("Hi Teaching quality / Low | High");
  });

  it("leaves an unknown placeholder untouched rather than blanking it", () => {
    const out = renderPrompt("Keep {{mystery}} here", { nodeName: "x" });
    expect(out).toBe("Keep {{mystery}} here");
  });
});

describe("mergeTemplateOverrides (R-141, ⚠Q57)", () => {
  const base = parseTemplate(SAMPLE);

  it("applies a valid override, pinned to the overridden id/appliesTo", () => {
    const override = SAMPLE.replace("A sample template", "My edited title");
    const merged = mergeTemplateOverrides([base], { "sample-template": override });
    expect(merged[0]!.title).toBe("My edited title");
    expect(merged[0]!.id).toBe("sample-template");
    expect(merged[0]!.appliesTo).toBe("mesoNode");
  });

  it("falls back to the default when an override fails to parse", () => {
    const merged = mergeTemplateOverrides([base], { "sample-template": "broken" });
    expect(merged[0]!.title).toBe("A sample template");
  });

  it("keeps the default id even if the override tries to re-target it", () => {
    const override = "---\nid: hijacked\ntitle: T\nappliesTo: continuum\n---\nbody";
    const merged = mergeTemplateOverrides([base], { "sample-template": override });
    expect(merged[0]!.id).toBe("sample-template");
    expect(merged[0]!.appliesTo).toBe("mesoNode");
  });
});

describe("bundled defaults T1–T6 (AI-HANDOFF.md §5)", () => {
  it("ships six templates that all parse with valid metadata", () => {
    expect(DEFAULT_TEMPLATES).toHaveLength(6);
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.id).not.toBe("");
      expect(t.title).not.toBe("");
      expect(AI_APPLIES_TO).toContain(t.appliesTo);
      expect(t.body).toContain("RESPOND EXACTLY");
    }
  });

  it("covers each documented appliesTo and has unique ids", () => {
    const ids = DEFAULT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const kinds = new Set(DEFAULT_TEMPLATES.map((t) => t.appliesTo));
    expect(kinds).toContain("continuum");
    expect(kinds).toContain("mesoNode");
    expect(kinds).toContain("evaluationQuestion");
    expect(kinds).toContain("overallJudgement");
  });

  it("exposes each default's source for reset-to-default", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(defaultTemplateSource(t.id)).toBe(t.source);
    }
  });
});
