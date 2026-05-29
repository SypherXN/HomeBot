import { describe, expect, it } from "vitest";
import { validActorId } from "./validation";

describe("validActorId", () => {
  it("accepts non-zero numeric snowflakes", () => {
    expect(validActorId("100001")).toBe(true);
    expect(validActorId(" 260001 ")).toBe(true);
  });

  it("rejects empty, zero, and non-digits", () => {
    expect(validActorId("")).toBe(false);
    expect(validActorId("0")).toBe(false);
    expect(validActorId("abc")).toBe(false);
    expect(validActorId("12a34")).toBe(false);
  });
});
