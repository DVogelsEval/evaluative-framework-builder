import { sideOf, type ContinuumSide } from "./continuum";
import type { Continuum, MesoNode } from "./schema";

/**
 * Pure meso-node helpers for Slice 2 (J4/J5). A node's reach — which columns
 * its rubric row can conclude at — is stored solely on `Cell.included`; the
 * qualitative importance marks (Q6/Q11) pre-set those defaults and are never
 * a numeric weight.
 */

/** The node's open (included) cells on one side of the Sufficient Bar. */
export function includedCellsOnSide(
  node: MesoNode,
  continuum: Continuum,
  side: ContinuumSide,
): number {
  return node.cells.filter(
    (cell) => cell.included && sideOf(continuum, cell.columnId) === side,
  ).length;
}

/**
 * Whether the cell for `columnId` may be closed. Closing the last open cell on
 * either side of the bar is not possible (SPEC J5; Q7 — every criterion keeps
 * ≥1 reachable column each side; ⚠Q36 provisional reading).
 */
export function canExcludeCell(
  node: MesoNode,
  continuum: Continuum,
  columnId: string,
): boolean {
  const side = sideOf(continuum, columnId);
  if (!side) return false;
  return includedCellsOnSide(node, continuum, side) > 1;
}
