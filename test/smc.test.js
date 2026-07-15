import { describe, it, expect } from "vitest";
import { swingPoints, detectBOS, analisaSMC } from "../js/smc.js";

const c = (o, h, l, cl) => ({ t: 0, o, h, l, c: cl });

// Siri zigzag: ayun tinggi jelas di i=2 (high 5), lembah di i=4, kemudian
// tutup terakhir (5.8) menembusi ayun tinggi 5.0 → BOS bull.
const bullBreak = [
  c(1.0, 1.5, 0.5, 1.2), // 0
  c(1.2, 3.5, 1.0, 3.0), // 1
  c(3.0, 5.0, 2.5, 4.5), // 2  ayun tinggi 5.0
  c(4.5, 4.6, 2.0, 2.5), // 3  bearish (order block calon)
  c(2.5, 3.0, 1.5, 2.0), // 4  ayun rendah 1.5
  c(2.0, 4.0, 1.8, 3.8), // 5
  c(3.8, 5.2, 3.5, 5.0), // 6
  c(5.0, 6.0, 4.5, 5.8), // 7  tutup 5.8 > 5.0
];

describe("swingPoints", () => {
  it("kesan ayun tinggi & rendah fraktal", () => {
    const s = swingPoints(bullBreak, 2);
    expect(s.highs.some((h) => h.i === 2 && h.price === 5.0)).toBe(true);
    expect(s.lows.some((l) => l.i === 4 && l.price === 1.5)).toBe(true);
  });
});

describe("detectBOS", () => {
  it("tutup menembusi ayun tinggi → BOS bull", () => {
    const s = swingPoints(bullBreak, 2);
    expect(detectBOS(bullBreak, s).arah).toBe("bull");
  });
});

describe("analisaSMC", () => {
  it("siri bullBreak → bias bull, ada order block", () => {
    const r = analisaSMC(bullBreak, 2);
    expect(r.bias).toBe("bull");
    expect(r.bos.arah).toBe("bull");
    expect(r.ob.length).toBeGreaterThan(0);
    expect(r.sebab.join(" ")).toContain("BOS bull");
  });
  it("data terlalu pendek → neutral tanpa throw", () => {
    const r = analisaSMC([c(1, 2, 0, 1)], 2);
    expect(r.bias).toBe("neutral");
    expect(r.sebab[0]).toContain("tak cukup");
  });
});
