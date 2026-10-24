import { labelCanvasSeats } from "./seat-map.service";

describe("labelCanvasSeats", () => {
  it("letters only the grid rows that have seats, nearest the stage first", () => {
    // grid rows 0 and 3 have seats; 1-2 are an empty walkway
    const out = labelCanvasSeats([
      { zone: 0, r: 3, c: 0 },
      { zone: 0, r: 0, c: 0 },
    ]);
    expect(out.find((s) => s.r === 0)?.row).toBe("A");
    expect(out.find((s) => s.r === 3)?.row).toBe("B");
  });

  it("numbers left to right across zones and skips aisles", () => {
    // row: [VIP c1][VIP c2] aisle [STD c4][STD c5]
    const out = labelCanvasSeats([
      { zone: 1, r: 0, c: 5 },
      { zone: 0, r: 0, c: 1 },
      { zone: 1, r: 0, c: 4 },
      { zone: 0, r: 0, c: 2 },
    ]);
    const byCol = Object.fromEntries(out.map((s) => [s.c, `${s.row}${s.number}`]));
    expect(byCol).toEqual({ 1: "A1", 2: "A2", 4: "A3", 5: "A4" });
  });
});
