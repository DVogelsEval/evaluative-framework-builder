import { PROJECT_SCHEMA_VERSION, SCHEMA_VERSION } from "./schema";

/**
 * Every breaking schema change ships a migration (R-012). Keyed by the version
 * the migration upgrades FROM; the chain runs until the document is current.
 */

export class MigrationError extends Error {}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

type Raw = Record<string, unknown>;
const isRaw = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * v1 → v2 (Q41 owner redirect, ⚠Q43): a Scenario's `description` string +
 * structured `evidenceRefs` chips become token-bearing prose `parts`. Each old
 * chip folds into the prose as its method token followed by the chip's
 * "at level" pick (resolved to the rubric Column Header) and note as text —
 * nothing the user authored is dropped.
 */
function migrateV1toV2(doc: Raw): Raw {
  for (const layer of asArray(doc["mesoLayers"])) {
    if (!isRaw(layer)) continue;
    for (const node of asArray(layer["nodes"])) {
      if (!isRaw(node)) continue;
      const labelForColumn = new Map<string, string>();
      const tier = node["evidenceTier"];
      if (isRaw(tier) && tier["shape"] === "rubric" && isRaw(tier["continuum"])) {
        for (const column of asArray((tier["continuum"] as Raw)["columns"])) {
          if (isRaw(column) && typeof column["id"] === "string") {
            labelForColumn.set(column["id"], String(column["label"] ?? ""));
          }
        }
      }
      for (const cell of asArray(node["cells"])) {
        if (!isRaw(cell)) continue;
        for (const scenario of asArray(cell["scenarios"])) {
          if (!isRaw(scenario)) continue;
          const parts: Raw[] = [];
          const pushText = (text: string) => {
            if (text === "") return;
            const last = parts[parts.length - 1];
            if (last !== undefined && last["kind"] === "text") {
              last["text"] = String(last["text"]) + text;
            } else {
              parts.push({ kind: "text", text });
            }
          };
          pushText(String(scenario["description"] ?? ""));
          for (const ref of asArray(scenario["evidenceRefs"])) {
            if (!isRaw(ref) || typeof ref["evidenceMethodId"] !== "string") continue;
            if (parts.length > 0) pushText("\n");
            parts.push({ kind: "token", targetId: ref["evidenceMethodId"] });
            if (typeof ref["atLevelColumnId"] === "string") {
              const label = labelForColumn.get(ref["atLevelColumnId"]);
              pushText(` at "${label !== undefined && label !== "" ? label : "(level)"}"`);
            }
            if (typeof ref["note"] === "string" && ref["note"] !== "") {
              pushText(` — ${ref["note"]}`);
            }
          }
          scenario["parts"] = parts;
          delete scenario["description"];
          delete scenario["evidenceRefs"];
        }
      }
    }
  }
  return { ...doc, schemaVersion: 2 };
}

/**
 * v2 → v3 (Slice 13, R-COND-8): rubric cells gain an optional `condition`.
 * Existing cells default to Prose mode — they were authored before conditions
 * existed, so none carries boolean logic (GWT-COND-8). Applied to every cell in
 * every meso layer; the migration timestamp seeds `lastModified`.
 */
function migrateV2toV3(doc: Raw): Raw {
  const ts = new Date().toISOString();
  for (const layer of asArray(doc["mesoLayers"])) {
    if (!isRaw(layer)) continue;
    for (const node of asArray(layer["nodes"])) {
      if (!isRaw(node)) continue;
      for (const cell of asArray(node["cells"])) {
        if (!isRaw(cell)) continue;
        if (cell["condition"] === undefined) {
          cell["condition"] = { mode: "prose", lastModified: ts };
        }
      }
    }
  }
  return { ...doc, schemaVersion: 3 };
}

/**
 * v3 → v4 (V2 Phases 0+1, ONE bump per docs/OPEN-QUESTIONS.md Q73 — do not
 * split this into two migrations later):
 *
 *  1. Every cell-condition `warrant` (subordinate cells AND Overall-Judgement
 *     `conditionCells`) that is a bare string becomes `{type: null, source:
 *     "", text: <original string>}` (Q63). `type: null` is the migrated-
 *     legacy state — NEVER guess a type. A warrant that is absent or ""
 *     stays absent; no empty warrant objects are manufactured.
 *  2. `records: []` is added.
 *  3. `changeLog` is retired: any entries it holds (in practice always empty
 *     — nothing ever wrote to it) fold into `records` as low-priority,
 *     export-excluded entries rather than being silently dropped (Q64), then
 *     the `changeLog` key is deleted.
 *  4. `distinguishingCase` (cells) and `sufficientBarLabel`/
 *     `sufficientBarDefinition` (continua) are new OPTIONAL fields — absence
 *     is valid, so nothing is manufactured for them here (Q66 point 4).
 */
function migrateV3toV4(doc: Raw): Raw {
  const migrateWarrant = (condition: unknown): void => {
    if (!isRaw(condition)) return;
    const warrant = condition["warrant"];
    if (typeof warrant === "string") {
      condition["warrant"] = { type: null, source: "", text: warrant };
    }
  };

  for (const layer of asArray(doc["mesoLayers"])) {
    if (!isRaw(layer)) continue;
    for (const node of asArray(layer["nodes"])) {
      if (!isRaw(node)) continue;
      for (const cell of asArray(node["cells"])) {
        if (!isRaw(cell)) continue;
        migrateWarrant(cell["condition"]);
      }
    }
  }
  const judgement = doc["overallJudgement"];
  if (isRaw(judgement)) {
    for (const entry of asArray(judgement["conditionCells"])) {
      if (isRaw(entry)) migrateWarrant(entry["condition"]);
    }
  }

  const records: Raw[] = [];
  for (const entry of asArray(doc["changeLog"])) {
    if (!isRaw(entry)) continue;
    const nodeId = typeof entry["nodeId"] === "string" ? entry["nodeId"] : undefined;
    records.push({
      id: entry["id"],
      elementRef: nodeId ? `node:${nodeId}` : "eq",
      timestamp: entry["timestamp"],
      author: "(migrated)",
      changeSummary: String(entry["note"] ?? ""),
      reason: "(migrated — no reason was recorded)",
      prompt: "other",
      includeInExport: false,
    });
  }

  const { changeLog: _drop, ...rest } = doc;
  return { ...rest, records, schemaVersion: 4 };
}

/**
 * v4 → v5 (V2 Phase 2, ONE bump per docs/OPEN-QUESTIONS.md Q73):
 *  1. `simCases: []` and `critiques: []` are added.
 *  2. `comments` is retired (Q65) — it was always empty in practice (an
 *     unused stub, like `changeLog` was), so it is dropped rather than
 *     migrated into anything; `Critique` supersedes it as the review-loop
 *     object.
 */
function migrateV4toV5(doc: Raw): Raw {
  const { comments: _drop, ...rest } = doc;
  return { ...rest, simCases: [], critiques: [], schemaVersion: 5 };
}

const migrations: Record<number, Migration> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
};

/**
 * Project migration (owner 2026-07-25). v1 was a *manifest* of external EQ file
 * refs; v2 embeds full EQ documents in the one file. A local browser app can't
 * read the referenced files during migration, so a v1 manifest upgrades to an
 * empty v2 Project (its refs are dropped) — the user re-opens any standalone
 * `.evalq.json` files to import them. No real data is lost that the app could
 * have reached anyway (the EQ files were always separate on disk).
 */
export function migrateProject(raw: unknown): unknown {
  if (!isRaw(raw)) {
    throw new MigrationError("Not a project file (expected a JSON object).");
  }
  const version = raw["schemaVersion"];
  if (typeof version !== "number") {
    throw new MigrationError("Project file has no schemaVersion at its root.");
  }
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new MigrationError(
      `Project schemaVersion ${version} is newer than this app supports (${PROJECT_SCHEMA_VERSION}).`,
    );
  }
  if (version === 1) {
    const { evaluationQuestionRefs: _drop, ...rest } = raw;
    return { ...rest, schemaVersion: 2, evaluationQuestions: [] };
  }
  return raw;
}

export function migrateEvaluationQuestion(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new MigrationError("Not an .evalq.json document (expected a JSON object).");
  }
  let doc = raw as Record<string, unknown>;
  const rawVersion = doc["schemaVersion"];
  if (typeof rawVersion !== "number") {
    throw new MigrationError("Document has no schemaVersion at its root.");
  }
  let version: number = rawVersion;
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(
      `Document schemaVersion ${version} is newer than this app supports (${SCHEMA_VERSION}).`,
    );
  }
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) {
      throw new MigrationError(`No migration from schemaVersion ${version}.`);
    }
    doc = step(doc);
    version = doc["schemaVersion"] as number;
  }
  return doc;
}
