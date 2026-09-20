import { describe, expect, it } from "vitest";
import { shouldIgnorePageSwipe } from "./pageSwipe";

describe("shouldIgnorePageSwipe", () => {
  it("returns true for a descendant of [data-no-page-swipe]", () => {
    const host = document.createElement("div");
    host.setAttribute("data-no-page-swipe", "");
    const inner = document.createElement("button");
    host.appendChild(inner);
    document.body.appendChild(host);
    try {
      expect(shouldIgnorePageSwipe(inner)).toBe(true);
      expect(shouldIgnorePageSwipe(host)).toBe(true);
    } finally {
      host.remove();
    }
  });

  it("returns false for an unrelated element", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    try {
      expect(shouldIgnorePageSwipe(el)).toBe(false);
    } finally {
      el.remove();
    }
  });

  it("returns true for input and textarea targets", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    document.body.append(input, textarea);
    try {
      expect(shouldIgnorePageSwipe(input)).toBe(true);
      expect(shouldIgnorePageSwipe(textarea)).toBe(true);
    } finally {
      input.remove();
      textarea.remove();
    }
  });

  it("returns false for null", () => {
    expect(shouldIgnorePageSwipe(null)).toBe(false);
  });

  it("uses the parent element when the target is a text node", () => {
    const host = document.createElement("div");
    const text = document.createTextNode("Budget");
    host.appendChild(text);
    document.body.appendChild(host);
    try {
      expect(shouldIgnorePageSwipe(text)).toBe(false);
      host.setAttribute("data-no-page-swipe", "");
      expect(shouldIgnorePageSwipe(text)).toBe(true);
    } finally {
      host.remove();
    }
  });
});
