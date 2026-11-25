// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readLink, writeLink } from "../src/web/mad";

describe("shared tantrum links", () => {
  it("round-trips and keeps the words after the #", () => {
    const url = writeLink("https://example.com/mad.html#old", { pet: "capybara", at: "taxes & forms #2", kind: "won" });
    expect(new URL(url).search).toBe("");
    expect(readLink(new URL(url).hash)).toEqual({ pet: "capybara", at: "taxes & forms #2", kind: "won" });
  });
  it("ignores pets it doesn't know and trims long words", () => {
    const state = readLink(`#pet=constructor&at=${"x".repeat(90)}`);
    expect(state).toMatchObject({ pet: "crab", kind: "mad" });
    expect(state.at).toHaveLength(28);
  });
});
