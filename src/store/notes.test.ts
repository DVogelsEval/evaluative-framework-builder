import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";

beforeEach(() => {
  useStore.setState({
    project: null,
    doc: null,
    view: "start",
    focusNodeId: null,
    evidenceReturnTo: null,
  });
});

const s = () => useStore.getState();

describe("setNotes (R-030, Q19)", () => {
  it("stores one notes area per EQ and clears the field when emptied", () => {
    s().createEQ("Reading program quality");
    expect(s().doc!.notes).toBeUndefined();
    s().setNotes("Ask the owner about the sample size before finalising evidence.");
    expect(s().doc!.notes).toBe(
      "Ask the owner about the sample size before finalising evidence.",
    );
    // Emptying it drops the field so the saved document stays clean.
    s().setNotes("");
    expect(s().doc!.notes).toBeUndefined();
  });
});
