// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/components/PixelPetSprite", () => ({ PixelPetSprite: () => <canvas /> }));
import { LivingPet } from "../src/components/LivingPet";

let root: Root, host: HTMLDivElement, reduced = false;
const props = {
  character: "cat" as const, name: "Cat", resting: false, hovered: false, dragging: false, petted: 0,
  attention: { x: 0, y: 0, near: false, tracking: false }, busy: false, position: "bl", energy: 5,
  onMenu: () => {}, onPet: () => {},
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("reduce"), media: query,
    addEventListener() {}, removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); reduced = false; });
const stage = () => host.querySelector(".pet-stage")!;
const render = (dragging: boolean) => act(() => root.render(<LivingPet {...props} dragging={dragging} />));

describe("putting the companion down", () => {
  it("squashes on landing, then settles", () => {
    render(false);
    expect(stage().classList.contains("pet-landing")).toBe(false);
    render(true);
    expect(stage().classList.contains("pet-landing")).toBe(false);
    render(false);
    expect(stage().classList.contains("pet-landing")).toBe(true);
    act(() => vi.advanceTimersByTime(450));
    expect(stage().classList.contains("pet-landing")).toBe(false);
  });
  it("does not bounce with Reduce Motion", () => {
    reduced = true;
    render(true); render(false);
    expect(stage().classList.contains("pet-landing")).toBe(false);
  });
  it("tags the stage with the room's light for evening tinting", () => {
    vi.setSystemTime(new Date(2026, 10, 10, 22, 0));
    render(false);
    expect(stage().getAttribute("data-ambient")).toBe("night");
  });
});
