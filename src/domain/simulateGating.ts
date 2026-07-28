import { subordinateLayer } from "./layers";
import type { EvaluationQuestion } from "./schema";

/**
 * Gating for the Simulate Judgement window (Slice 14, R-SIM-1). The sandbox can
 * only fold values that have levels and conditions to fold, so it is reachable
 * only when **every evidence-bearing (subordinate) node** uses a Rubric-type
 * evidence tier (no Data Description Lists — they have no levels) **and** carries
 * at least one open cell with a Slice-13 Boolean condition (a prose-only or
 * condition-less node can't be evaluated mechanically).
 *
 * Superior-layer and Overall-Judgement Boolean conditions are *optional* (the
 * owner keeps the prose path, Q61): where they're absent the fold simply stops
 * with a read-only prose note — it doesn't block entry.
 *
 * When a check fails the entry point stays visible but disabled, naming the
 * specific blocking node(s) — never hidden silently.
 */

export interface BlockingNode {
  nodeId: string;
  nodeName: string;
  reason: string;
}

export interface GateResult {
  allowed: boolean;
  blockingNodes: BlockingNode[];
}

export function canSimulate(doc: EvaluationQuestion): GateResult {
  const subordinate = subordinateLayer(doc);
  const blockingNodes: BlockingNode[] = [];

  if (!subordinate || subordinate.nodes.length === 0) {
    return { allowed: false, blockingNodes: [] };
  }

  for (const node of subordinate.nodes) {
    const name = node.name || "(unnamed)";
    const tier = node.evidenceTier;
    if (!tier) {
      blockingNodes.push({
        nodeId: node.id,
        nodeName: name,
        reason: `“${name}” has no evidence tier yet — Simulate Judgement needs a conditioned rubric on every node.`,
      });
      continue;
    }
    if (tier.shape === "list") {
      blockingNodes.push({
        nodeId: node.id,
        nodeName: name,
        reason: `“${name}” uses a Data Description List — a list has no levels to fold, so Simulate Judgement needs every node to use a rubric.`,
      });
      continue;
    }
    const hasCondition = node.cells.some(
      (c) => c.included && c.condition?.mode === "boolean" && c.condition.booleanLogic,
    );
    if (!hasCondition) {
      blockingNodes.push({
        nodeId: node.id,
        nodeName: name,
        reason: `“${name}” has no cell with a Boolean condition — add one so its conclusion can be simulated.`,
      });
    }
  }

  return { allowed: blockingNodes.length === 0, blockingNodes };
}
