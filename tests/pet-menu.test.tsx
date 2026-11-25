// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RadialMenu } from "../src/components/RadialMenu";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("the pet's menu", () => {
  it("offers three things to do and two places to go, and says what each will do", () => {
    const onAction = vi.fn(), onClose = vi.fn();
    act(() => root.render(<RadialMenu open position="bl" break={0} name="Goro" rest="about 6 minutes, together"
      expand={{ label: "needs rest first", ready: false }} onAction={onAction} onClose={onClose} />));
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons.map(b => b.querySelector("span")?.textContent ?? b.textContent)).toEqual(["Rest", "Focus", "Expand", "Home", "Settings"]);
    expect(host.textContent).toContain("needs rest first");
    expect(host.querySelector("button.spent")).not.toBeNull();
    act(() => buttons[0].click());
    expect(onClose).toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith("rest");
  });
  it("offers to end a rest instead of starting one", () => {
    act(() => root.render(<RadialMenu open position="bl" break={Date.now()} onAction={() => {}} onClose={() => {}} />));
    expect(host.textContent).toContain("I’m back");
    expect(host.textContent).not.toContain("Rest");
  });
});
