/** ToastQueue policy: dedupe repeats into ×N, cap the stack, expire on time. */
import { describe, expect, it } from "vitest";
import { MAX_VISIBLE, TOAST_LIFE_MS, ToastQueue } from "../src/ui/toasts";

describe("ToastQueue", () => {
  it("adds distinct toasts as separate entries", () => {
    const q = new ToastQueue();
    q.add("Fed the tank.", "good", 0);
    const list = q.add("Water change done.", "good", 10);
    expect(list.length).toBe(2);
    expect(list[0].count).toBe(1);
  });

  it("DEDUPES an identical message into a ×N counter instead of stacking", () => {
    const q = new ToastQueue();
    q.add("The glass is getting grimy.", "warn", 0);
    q.add("The glass is getting grimy.", "warn", 100);
    const list = q.add("The glass is getting grimy.", "warn", 200);
    expect(list.length).toBe(1);
    expect(list[0].count).toBe(3);
  });

  it("a repeat refreshes the toast's life", () => {
    const q = new ToastQueue();
    q.add("Saved.", "info", 0);
    q.add("Saved.", "info", TOAST_LIFE_MS - 100); // bump just before expiry
    const alive = q.list(TOAST_LIFE_MS + 200); // old expiry passed, new one not
    expect(alive.length).toBe(1);
    expect(alive[0].count).toBe(2);
  });

  it("same text with a DIFFERENT tone is a different toast", () => {
    const q = new ToastQueue();
    q.add("Feeding.", "info", 0);
    const list = q.add("Feeding.", "warn", 1);
    expect(list.length).toBe(2);
  });

  it("caps the visible stack, retiring the oldest", () => {
    const q = new ToastQueue();
    for (let i = 0; i < MAX_VISIBLE + 2; i++) q.add(`msg ${i}`, "info", i);
    const list = q.list(10);
    expect(list.length).toBe(MAX_VISIBLE);
    expect(list[0].message).toBe("msg 2"); // 0 and 1 retired early
  });

  it("expires entries after their life", () => {
    const q = new ToastQueue();
    q.add("bye", "info", 0);
    expect(q.list(TOAST_LIFE_MS - 1).length).toBe(1);
    expect(q.list(TOAST_LIFE_MS + 1).length).toBe(0);
  });
});
