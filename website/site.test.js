// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initPlayground } from "./site.js";

const pendingFrames = new Map();
let cleanup;

function pointerEvent(type, x, y) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, clientX: x, clientY: y });
  return event;
}

async function decode(source) {
  pendingFrames.get(source)?.();
  await Promise.resolve();
  await Promise.resolve();
}

function setup() {
  document.body.innerHTML = `
    <div id="pet-playground">
      <button id="demo-pet"><img id="demo-pet-image" src="assets/pets/crab/idle.webp"></button>
      <div id="demo-effects"></div><div id="demo-item"></div>
    </div>
    <p id="demo-bubble" role="status"></p><p id="demo-status"></p>
    <p id="demo-caption">Drag your pet.</p>
    <button data-character="crab" aria-pressed="true">Crab</button>
    <button data-character="panda">Panda</button>
    <button data-character="cat">Cat</button>
    <button data-mode="focus" aria-pressed="false">Focus</button>
    <button data-mode="music">Music</button><button data-mode="break">Break</button>
    <button data-action="pet">Pet</button><button data-action="play">Play</button><button data-action="reset">Reset</button>`;
  const stage = document.getElementById("pet-playground");
  const pet = document.getElementById("demo-pet");
  Object.defineProperties(stage, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
  Object.defineProperties(pet, {
    offsetLeft: { value: 448 }, offsetTop: { value: 228 }, offsetWidth: { value: 144 }, offsetHeight: { value: 144 },
  });
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 });
  pet.getBoundingClientRect = () => ({
    left: 376 + Number.parseFloat(pet.style.getPropertyValue("--pet-x") || "0"),
    top: 228 + Number.parseFloat(pet.style.getPropertyValue("--pet-y") || "0"),
    width: 144, height: 144,
  });
  let captured = false;
  pet.setPointerCapture = vi.fn(() => { captured = true; });
  pet.hasPointerCapture = () => captured;
  pet.releasePointerCapture = vi.fn(() => { captured = false; });
  cleanup = initPlayground(stage);
  return { stage, pet, image: document.getElementById("demo-pet-image") };
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  pendingFrames.clear();
  vi.stubGlobal("Image", class {
    decode() {
      return new Promise((resolve) => pendingFrames.set(this.src, resolve));
    }
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("website pet playground", () => {
  it("discards decoded frames from a character that is no longer selected", async () => {
    const { image } = setup();
    document.querySelector('button[data-character="panda"]').click();
    document.querySelector('button[data-character="cat"]').click();
    await decode("assets/pets/cat/idle.webp");
    expect(image.getAttribute("src")).toBe("assets/pets/cat/idle.webp");
    await decode("assets/pets/panda/idle.webp");
    await decode("assets/pets/crab/idle.webp");
    expect(image.getAttribute("src")).toBe("assets/pets/cat/idle.webp");
    expect(document.querySelector('button[data-character="cat"]').getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('button[data-character="panda"]').getAttribute("aria-pressed")).toBe("false");
    expect([...document.querySelectorAll("button[data-mode]")].every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("bounds a captured drag and cleans up when the browser cancels it", () => {
    const { pet } = setup();
    pet.dispatchEvent(pointerEvent("pointerdown", 450, 300));
    pet.dispatchEvent(pointerEvent("pointermove", 2000, -2000));
    expect(pet.style.getPropertyValue("--pet-x")).toBe("268px");
    expect(pet.style.getPropertyValue("--pet-y")).toBe("-216px");
    expect(pet.dataset.dragging).toBe("true");
    pet.dispatchEvent(pointerEvent("pointercancel", 2000, -2000));
    expect(pet.hasAttribute("data-dragging")).toBe(false);
    expect(pet.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(pet.style.getPropertyValue("--pet-y")).toBe("0px");
    const x = pet.style.getPropertyValue("--pet-x");
    pet.dispatchEvent(pointerEvent("pointermove", -2000, 300));
    expect(pet.style.getPropertyValue("--pet-x")).toBe(x);
    expect(document.getElementById("demo-bubble").textContent).toBe("");
  });

  it("provides bounded keyboard placement and Home reset without moving focus", () => {
    const { pet } = setup();
    document.querySelector('button[data-mode="music"]').click();
    pet.focus();
    for (let step = 0; step < 30; step += 1) {
      pet.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    }
    expect(pet.style.getPropertyValue("--pet-x")).toBe("-364px");
    pet.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
    expect(pet.style.getPropertyValue("--pet-x")).toBe("0px");
    expect(pet.style.getPropertyValue("--pet-y")).toBe("0px");
    expect(document.activeElement).toBe(pet);
    expect(document.getElementById("demo-bubble").textContent).toBe("Back in my little spot.");
    expect([...document.querySelectorAll("button[data-mode]")].every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("keeps controls functional when session storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    const { image } = setup();
    expect(() => document.querySelector('button[data-mode="break"]').click()).not.toThrow();
    await decode("assets/pets/crab/sleep.webp");
    expect(image.getAttribute("src")).toBe("assets/pets/crab/sleep.webp");
    expect(document.querySelector('button[data-mode="break"]').getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the play pose stable when movement animation is unavailable", async () => {
    const { image } = setup();
    document.querySelector('button[data-action="play"]').click();
    await Promise.resolve();
    await decode("assets/pets/crab/play.webp");
    expect(image.getAttribute("src")).toBe("assets/pets/crab/play.webp");
    await vi.advanceTimersByTimeAsync(400);
    await decode("assets/pets/crab/walkB.webp");
    await decode("assets/pets/crab/walkA.webp");
    expect(image.getAttribute("src")).toBe("assets/pets/crab/play.webp");
  });
});
