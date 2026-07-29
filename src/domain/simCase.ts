import type { SimCase } from "./schema";

/**
 * Pure `SimCase` helpers (V2 Phase 2, extension spec §5.1; Q62/Q67).
 *
 * BOUNDARY — do not import `simulateEvaluate.ts` here, ever. `SimCase` DATA
 * persists (Q67 amends Q60's "fully ephemeral" rule), but simulate
 * EXECUTION must stay unreachable from store/autosave/export
 * (`simulateBoundary.test.ts`, unmodified, is the enforcement). This module
 * only shapes and labels case data; it never evaluates a condition. See
 * docs/SPEC_MAPPING.md §3.3 before changing this file.
 */

/** Unsuppressible label every SimCase-derived rendering must carry, in every
 *  view and every export (extension spec §2/§5.1) — the boundary that keeps
 *  a persisted hypothetical from ever being mistaken for a real result. */
export const SIMULATED_LABEL = "SIMULATED";

/**
 * Invariant 23 advisory input (extension spec §5.1): a case set with no case
 * the author expects to fail reads as a demonstration, not a genuine test —
 * reviewers will treat it as one. [report] only, checked in invariants.ts.
 */
export function hasExpectedFailureCase(cases: SimCase[]): boolean {
  return cases.some((c) => c.expectedToFail === true);
}
