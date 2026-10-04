// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { PixelPetSprite } from "../src/components/PixelPetSprite";

const clock = vi.hoisted(() => ({ sample: vi.fn(), render: vi.fn() }));
vi.mock("../src/lib/petMotion", async importOriginal => {
  const motion = await importOriginal<typeof import("../src/lib/petMotion")>();
  return {
    ...motion,
    samplePetMotion: (...args: Parameters<typeof motion.samplePetMotion>) => {
      clock.sample(...args);
      return motion.samplePetMotion(...args);
    },
  };
});
vi.mock("../src/lib/spriteAtlas", () => ({
  isolateAtlas: () => ({
    frames: Array.from({ length: 16 }, () => ({ x: 0, y: 0, width: 1, height: 1 })),
    labels: new Uint16Array(16),
  }),
  framePixels: () => new Uint8ClampedArray(4),
}));
vi.mock("../src/lib/petRig", () => ({ getPetRig: () => ({}) }));
vi.mock("../src/lib/petRenderer", () => ({
  prepareSpritePixels: () => ({}),
  renderSpritePixels: (...args: unknown[]) => {
    clock.render(...args);
    return new Uint8ClampedArray(60 * 60 * 4);
  },
}));

type Props = ComponentProps<typeof PixelPetSprite>;
let Sprite: typeof PixelPetSprite;
let root: Root;
let host: HTMLDivElement;
let hidden: boolean;
let images: TestImage[];
let frames: Map<number, ReturnType<typeof setTimeout>>;
let nextFrame: number;
let cancelFrame: ReturnType<typeof vi.fn>;

class TestImage {
  naturalWidth = 4;
  naturalHeight = 4;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() { images.push(this); }
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.resetModules();
  clock.sample.mockClear();
  clock.render.mockClear();
  hidden = false;
  images = [];
  frames = new Map();
  nextFrame = 0;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal("Image", TestImage);
  vi.stubGlobal("ImageData", class {
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
    drawImage: vi.fn(), translate: vi.fn(), scale: vi.fn(), putImageData: vi.fn(),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    imageSmoothingEnabled: true,
  }) as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, setTimeout(() => {
      frames.delete(id);
      callback(performance.now());
    }, 16));
    return id;
  }));
  cancelFrame = vi.fn((id: number) => {
    clearTimeout(frames.get(id));
    frames.delete(id);
  });
  vi.stubGlobal("cancelAnimationFrame", cancelFrame);
  Sprite = (await import("../src/components/PixelPetSprite")).PixelPetSprite;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const elapsed = () => clock.sample.mock.calls.map(call => call[1] as number);
const latestElapsed = () => elapsed().at(-1)!;
const render = async (props: Partial<Props> = {}) => {
  await act(async () => root.render(<Sprite character="panda" pose="focus" animated {...props} />));
};
const load = async (props: Partial<Props> = {}) => {
  await render(props);
  await act(async () => { images[0].onload?.(); });
};

describe("pixel companion activity clock", () => {
  it("keeps typing through continuous mouse attention updates without decoding or restarting", async () => {
    await load();
    const canvas = host.querySelector("canvas");
    for (let frame = 0; frame < 80; frame++) {
      await render({ attention: { x: (frame % 40) / 40, y: -.5, near: false, tracking: true } });
      tick(16);
    }
    expect(images).toHaveLength(1);
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(latestElapsed()).toBeGreaterThan(1200);
    expect(elapsed().every((value, index, values) => index === 0 || value >= values[index - 1])).toBe(true);
    expect(frames.size).toBe(1);
    expect(clock.render).toHaveBeenCalled();
  });

  it("pauses at its current activity frame and resumes without counting the pause", async () => {
    await load();
    tick(512);
    await render({ paused: true });
    tick(16);
    const pausedAt = latestElapsed();
    const samples = clock.sample.mock.calls.length;
    expect(frames.size).toBe(0);
    tick(10000);
    expect(clock.sample).toHaveBeenCalledTimes(samples);
    await render();
    tick(16);
    expect(latestElapsed()).toBe(pausedAt);
    tick(128);
    expect(latestElapsed()).toBeGreaterThanOrEqual(pausedAt + 96);
    expect(latestElapsed()).toBeLessThanOrEqual(pausedAt + 128);
  });

  it.each([
    { name: "static previews", props: { animated: false } },
    { name: "Reduced Motion", props: { reducedMotion: true, attention: { x: 1, y: -1, near: true, tracking: true } } },
  ])("draws $name once without retaining animation frames", async ({ props }) => {
    await load(props);
    tick(16);
    expect(clock.render).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    const samples = clock.sample.mock.calls.length;
    tick(10000);
    expect(clock.sample).toHaveBeenCalledTimes(samples);
    expect(clock.render).toHaveBeenCalledTimes(1);
  });

  it("stops an active loop when Reduced Motion is enabled", async () => {
    await load();
    tick(512);
    expect(frames.size).toBe(1);
    await render({ reducedMotion: true });
    tick(16);
    expect(frames.size).toBe(0);
    const samples = clock.sample.mock.calls.length;
    tick(10000);
    expect(clock.sample).toHaveBeenCalledTimes(samples);
  });

  it("suspends hidden-document work and resumes without advancing by hidden time", async () => {
    await load();
    tick(160);
    const beforeHide = latestElapsed();
    act(() => { hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
    expect(cancelFrame).toHaveBeenCalled();
    expect(frames.size).toBe(0);
    const samples = clock.sample.mock.calls.length;
    tick(10000);
    expect(clock.sample).toHaveBeenCalledTimes(samples);
    act(() => { hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
    tick(16);
    expect(latestElapsed() - beforeHide).toBeLessThanOrEqual(16);
    expect(frames.size).toBe(1);
  });

  it("cancels a queued frame when the companion is removed", async () => {
    await load();
    expect(frames.size).toBe(1);
    await act(async () => root.render(null));
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    tick(1000);
    expect(clock.sample).not.toHaveBeenCalled();
    expect(clock.render).not.toHaveBeenCalled();
  });

  it("ignores artwork that finishes loading after unmount", async () => {
    await render();
    expect(images).toHaveLength(1);
    await act(async () => root.render(null));
    await act(async () => { images[0].onload?.(); });
    tick(1000);
    expect(frames.size).toBe(0);
    expect(clock.sample).not.toHaveBeenCalled();
    expect(clock.render).not.toHaveBeenCalled();
  });
});
