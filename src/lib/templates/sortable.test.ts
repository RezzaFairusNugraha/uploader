import { describe, expect, it } from "bun:test";
import { arrayMove, generateStableColumnId } from "./sortable";

describe("sortable column helpers", () => {
  it("arrayMove memindahkan elemen ke indeks baru", () => {
    const list = ["A", "B", "C", "D"];
    const moved = arrayMove(list, 1, 2);
    expect(moved).toEqual(["A", "C", "B", "D"]);

    const movedToTop = arrayMove(list, 3, 0);
    expect(movedToTop).toEqual(["D", "A", "B", "C"]);
  });

  it("generateStableColumnId menghasilkan id unik dan konsisten berawalan col-", () => {
    const id1 = generateStableColumnId();
    const id2 = generateStableColumnId();
    expect(id1.startsWith("col-")).toBe(true);
    expect(id2.startsWith("col-")).toBe(true);
    expect(id1).not.toBe(id2);
  });
});
