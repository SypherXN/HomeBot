import { describe, expect, it } from "vitest";
import { moveIdToTarget, orderChanged } from "./accountOrder";

const list = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe("moveIdToTarget", () => {
  it("moves an item forward", () => {
    expect(moveIdToTarget(list, 1, 3).map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("moves an item backward", () => {
    expect(moveIdToTarget(list, 3, 1).map((x) => x.id)).toEqual([3, 1, 2]);
  });

  it("returns the same array when ids match or are missing", () => {
    expect(moveIdToTarget(list, 2, 2)).toBe(list);
    expect(moveIdToTarget(list, 9, 1)).toBe(list);
  });
});

describe("orderChanged", () => {
  it("detects a different sequence", () => {
    expect(orderChanged(list, [{ id: 2 }, { id: 1 }, { id: 3 }])).toBe(true);
    expect(orderChanged(list, list)).toBe(false);
  });
});
