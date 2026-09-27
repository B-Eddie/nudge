import { describe, expect, it } from "vitest";
import { reminderText, distractionText } from "./reminderTone";

describe("reminder tone", () => {
  it("keeps existing playful message by default", () => {
    expect(reminderText("playful", 1)).toBe("You've been on for 1 minute!");
  });
  it("uses distinct supportive and direct copy", () => {
    expect(reminderText("gentle", 30)).toContain("A short break might help");
    expect(reminderText("direct", 30)).toContain("Take a break");
    expect(distractionText("gentle", "snark")).not.toBe("snark");
    expect(distractionText("playful", "snark")).toBe("snark");
  });
});
