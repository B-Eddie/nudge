// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BreakGuidePanel } from "../src/components/BreakGuidePanel";
import { BREAK_ROUTINES } from "../src/types/breakRoutines";

let root: Root;
let host: HTMLDivElement;
let trigger: HTMLButtonElement;
const close = vi.fn();
const start = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  close.mockReset();
  start.mockReset();
  vi.spyOn(HTMLElement.prototype, "getClientRects")
    .mockReturnValue([{ width: 1 }] as unknown as DOMRectList);
  trigger = document.createElement("button");
  trigger.textContent = "Take a break";
  host = document.createElement("div");
  document.body.append(trigger, host);
  trigger.focus();
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  trigger.remove();
  vi.restoreAllMocks();
});

async function open() {
  await act(async () => root.render(<BreakGuidePanel onClose={close} onStart={start} />));
}

describe("Break picker controls", () => {
  it("starts each routine with its own duration and instructions", async () => {
    await open();
    const options = [...host.querySelectorAll<HTMLButtonElement>(".break-routine-option")];
    for (const [index, routine] of BREAK_ROUTINES.entries()) {
      act(() => options[index].click());
      expect(start).toHaveBeenLastCalledWith(routine);
    }
    expect(start).toHaveBeenCalledTimes(4);
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps Tab inside the picker and restores the trigger when closed", async () => {
    await open();
    const first = host.querySelector<HTMLButtonElement>('[aria-label="Close break ideas"]')!;
    const last = host.querySelectorAll<HTMLButtonElement>(".break-routine-option")[3];
    expect(document.activeElement).toBe(first);
    act(() => first.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab", shiftKey: true, bubbles: true, cancelable: true,
    })));
    expect(document.activeElement).toBe(last);
    act(() => last.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab", bubbles: true, cancelable: true,
    })));
    expect(document.activeElement).toBe(first);
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(trigger);
  });

  it("closes with Escape, the close button, or the empty backdrop, but not panel content", async () => {
    await open();
    const closeButton = host.querySelector<HTMLButtonElement>('[aria-label="Close break ideas"]')!;
    act(() => closeButton.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    })));
    expect(close).toHaveBeenCalledTimes(1);
    act(() => closeButton.click());
    expect(close).toHaveBeenCalledTimes(2);
    act(() => host.querySelector<HTMLElement>(".break-guide-panel")!.click());
    expect(close).toHaveBeenCalledTimes(2);
    act(() => host.querySelector<HTMLElement>(".break-guide-backdrop")!.click());
    expect(close).toHaveBeenCalledTimes(3);
  });
});
