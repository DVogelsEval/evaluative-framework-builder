import { useStore } from "../store/store";
import { previousWizardView } from "../store/wizard";

/**
 * The shared wizard footer: Back on the left, Continue on the right. Back is
 * never gated — revisiting and redoing earlier work is always allowed; the
 * hosting view supplies Continue's step-completion gate, and because Continue
 * only advances one gated step, it can never skip past the furthest-reached
 * step of the current linear pass (`firstIncompleteView`, derived not stored).
 */
export function WizardNav(props: {
  continueTestId: string;
  continueLabel?: string;
  onContinue: () => void;
}) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const prev = previousWizardView(view);

  return (
    <div className="wizard-nav">
      <button
        type="button"
        className="secondary"
        data-testid="wizard-back"
        disabled={!prev}
        title={prev ? "Return to the previous step" : "This is the first step"}
        onClick={() => prev && setView(prev)}
      >
        ← Back
      </button>
      <button
        type="button"
        data-testid={props.continueTestId}
        onClick={props.onContinue}
      >
        {props.continueLabel ?? "Continue"}
      </button>
    </div>
  );
}
