import type { Scenario, ScenarioPart } from "./schema";

/**
 * Helpers over a Scenario's token-bearing prose (Q41, ⚠Q43). The same part
 * shape carries Evidence/Method tokens in J10 and criterion tokens in the J11
 * synthesis — resolution of what a token's id names is the caller's concern.
 */

/**
 * A Scenario is *described* only when the user has typed prose — an inserted
 * token alone does not satisfy the R-097 gate, consistent with Q41's
 * "references are encouraged, never gated" (⚠Q43).
 */
export function scenarioDescribed(scenario: Scenario): boolean {
  return scenario.parts.some((p) => p.kind === "text" && p.text.trim() !== "");
}

/** Flatten parts to plain text, resolving token names live at read time. A
 *  token carrying `atColumnId` (Q44 redirect) reads "«name» is «header»". */
export function scenarioPlainText(
  parts: ScenarioPart[],
  nameFor: (targetId: string) => string,
  columnLabelFor?: (columnId: string) => string,
): string {
  return parts
    .map((p) => {
      if (p.kind === "text") return p.text;
      if (p.kind === "token") {
        return p.atColumnId !== undefined && columnLabelFor
          ? `${nameFor(p.targetId)} is ${columnLabelFor(p.atColumnId)}`
          : nameFor(p.targetId);
      }
      return p.label;
    })
    .join("");
}
