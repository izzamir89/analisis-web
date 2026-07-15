import { describe, it, expect } from "vitest";
import { backtest } from "../js/backtest.js";
import { ringkasan, ditutup } from "../js/analytics.js";

const flat = (t) => ({ t, o: 10, h: 10.5, l: 9.5, c: 10 });

// Opsyen kecil supaya fixtur boleh pendek (atrPeriod 2, mula 3).
const opts = (skorFn, extra = {}) => ({
  skorFn,
  atrPeriod: 2,
  mula: 3,
  slMult: 1,
  rr: 2,
  ...extra,
});

// BUY di i=3 (entry 10, ATR≈1 → SL 9, TP 12); lilin j=5 sentuh 12.5 → menang.
const winCandles = [
  flat(0),
  flat(1),
  flat(2),
  flat(3), // entry
  flat(4),
  { t: 5, o: 10, h: 12.5, l: 10, c: 12 }, // TP kena
  flat(6),
];

// BUY di i=3; lilin j=4 jatuh ke 8.5 (≤ SL 9) → kalah.
const lossCandles = [
  flat(0),
  flat(1),
  flat(2),
  flat(3), // entry
  { t: 4, o: 10, h: 10.5, l: 8.5, c: 9 }, // SL kena
  flat(5),
];

const buyDi3 = (_win, i) => (i === 3 ? { verdict: "BUY" } : { verdict: "WAIT" });

describe("backtest", () => {
  it("dagangan menang → hasil win, rSebenar = rr", () => {
    const t = backtest(winCandles, opts(buyDi3));
    expect(t).toHaveLength(1);
    expect(t[0].hasil).toBe("win");
    expect(t[0].arah).toBe("Buy");
    expect(t[0].rSebenar).toBe(2);
  });

  it("dagangan kalah → hasil loss, rSebenar = −1", () => {
    const t = backtest(lossCandles, opts(buyDi3));
    expect(t).toHaveLength(1);
    expect(t[0].hasil).toBe("loss");
    expect(t[0].rSebenar).toBe(-1);
  });

  it("output serasi analytics.js (ringkasan mengira)", () => {
    const t = backtest(winCandles, opts(buyDi3));
    expect(t.every(ditutup)).toBe(true);
    const r = ringkasan(t);
    expect(r.ditutup).toBe(1);
    expect(r.menang).toBe(1);
    expect(r.kadarMenang).toBe(100);
  });

  it("skorFn WAIT sahaja → tiada dagangan", () => {
    const t = backtest(
      winCandles,
      opts(() => ({ verdict: "WAIT" }))
    );
    expect(t).toEqual([]);
  });

  it("data terlalu pendek / tiada skorFn → []", () => {
    expect(backtest([flat(0), flat(1)], opts(buyDi3))).toEqual([]);
    expect(backtest(winCandles, { atrPeriod: 2, mula: 3 })).toEqual([]);
  });
});
