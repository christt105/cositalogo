import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { debounce } from "./debounce.js";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("does not run until ms have passed without another call", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 150);
    debounced();
    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("restarts the delay on every call", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 150);
    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("calls fn with the arguments of the last call", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 150);
    debounced(1);
    debounced(2);
    vi.advanceTimersByTime(150);
    expect(fn.mock.calls).toEqual([[2]]);
  });

  test("independent call sites do not share a timer", () => {
    const fn = vi.fn();
    const a = debounce(fn, 150);
    const b = debounce(fn, 150);
    a();
    b();
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
