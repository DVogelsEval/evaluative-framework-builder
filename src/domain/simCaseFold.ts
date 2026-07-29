import { subordinateLayer } from "./layers";
import { foldFramework } from "./simulateEvaluate";
import type { EvaluationQuestion, SimCase } from "./schema";

/**
 * "The framework's placement" for a SimCase — shared by the review artefact
 * (blind-first reveal) and the critique-import disagreement map, so the two
 * can never compute a different answer for the same case.
 *
 * BOUNDARY (docs/SPEC_MAPPING.md §3.3): this module imports
 * simulateEvaluate.ts. It must NEVER be imported by store.ts,
 * persistence/local.ts, domain/output.ts, domain/serialize.ts, or
 * domain/aiContext.ts — only by views and by reviewArtefact.ts, none of
 * which simulateBoundary.test.ts checks. That tripwire must stay green.
 *
 * SCOPING (flagged, not silent — same decision as reviewArtefact.ts v1):
 * the Overall Judgement's resolved column when one is configured and
 * resolves; otherwise, if the framework has exactly one subordinate node,
 * that node's own resolved column; otherwise `null` ("not resolvable" for
 * multi-criterion frameworks in v1) — never fabricates an answer.
 */
export function frameworkPlacementForCase(doc: EvaluationQuestion, simCase: SimCase): string | null {
  const layer = subordinateLayer(doc);
  const singleNode = layer && layer.nodes.length === 1 ? layer.nodes[0] : undefined;
  const result = foldFramework(doc, simCase.values);

  if (result.overall?.status === "resolved" && result.overall.columnId) {
    return result.overall.columnId;
  }
  if (singleNode) {
    const nodeResult = result.byNode[singleNode.id];
    if (nodeResult?.status === "resolved" && nodeResult.columnId) {
      return nodeResult.columnId;
    }
  }
  return null;
}
