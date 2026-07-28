import type { EvidenceMethod, MixedMethodsType } from "./schema";

/**
 * The canonical mixed-methods strategy labels (R-166, Q28). Lives in the domain
 * so both the J9 editor (MixedMethodsView) and the outputs serialiser can name a
 * strategy the same way without the view owning shared vocabulary.
 */
export const MIXED_TYPE_LABELS: Record<MixedMethodsType, string> = {
  convergent: "Convergent",
  explanatorySequential: "Explanatory sequential",
  exploratorySequential: "Exploratory sequential",
  embedded: "Embedded",
  multistage: "Multistage (multiple linked phases over time)",
  caseStudy: "Case Study",
  other: "Other (name your own)",
};

/**
 * A mixed-methods source's strategy, resolved for the outputs (Q51 orphaned-data
 * audit): the enum's label, or the user's own name when the type is "other".
 * `undefined` for a plain (non-mixed) method. Before Slice 8's post-fixes this
 * typed data (`mixedMethodsType`/`mixedMethodsCustomName`) appeared in no output.
 */
export function mixedStrategyLabel(method: EvidenceMethod): string | undefined {
  if (!method.isMixedMethodsSource) return undefined;
  if (method.mixedMethodsType === "other") {
    const name = method.mixedMethodsCustomName?.trim();
    return name && name !== "" ? name : "Mixed methods (custom)";
  }
  if (method.mixedMethodsType !== undefined) {
    return MIXED_TYPE_LABELS[method.mixedMethodsType];
  }
  return "Mixed methods";
}
