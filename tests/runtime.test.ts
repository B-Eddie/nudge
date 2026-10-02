// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
import { isDesktopRuntime } from "../src/types/runtime";
afterEach(() => { Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); });
it("detects older desktop hosts even when the newer isTauri marker is absent", () => {
  expect(isDesktopRuntime()).toBe(false);
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  expect(isDesktopRuntime()).toBe(true);
});
