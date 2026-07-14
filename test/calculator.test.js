import { describe, it, expect } from "vitest";
import { kiraDagangan, RR_MIN } from "../js/calculator.js";

describe("kiraDagangan — arah & paras", () => {
  it("Buy: SL di bawah, TP di atas entry", () => {
    const r = kiraDagangan({
      pairId: "EURUSD",
      arah: "Buy",
      entry: 1.085,
      atr: 0.0012,
      pengganda: 1.5,
      rr: 2,
      baki: 1000,
      risikoPct: 1,
    });
    expect(r.ralat).toBeUndefined();
    expect(r.sl).toBeCloseTo(1.0832, 4); // 1.085 - 0.0018
    expect(r.tp).toBeCloseTo(1.0886, 4); // 1.085 + 0.0036
    expect(r.slPip).toBeCloseTo(18, 1);
    expect(r.tpPip).toBeCloseTo(36, 1);
  });

  it("Sell: SL di atas, TP di bawah entry", () => {
    const r = kiraDagangan({
      pairId: "EURUSD",
      arah: "Sell",
      entry: 1.085,
      atr: 0.0012,
      pengganda: 1.5,
      rr: 2,
    });
    expect(r.sl).toBeCloseTo(1.0868, 4);
    expect(r.tp).toBeCloseTo(1.0814, 4);
  });
});

describe("kiraDagangan — amaran & ralat", () => {
  it("amaran bila R:R di bawah minimum", () => {
    const r = kiraDagangan({
      pairId: "EURUSD",
      arah: "Buy",
      entry: 1.085,
      atr: 0.0012,
      rr: 1,
    });
    expect(r.amaran.length).toBeGreaterThan(0);
    expect(r.rr).toBeLessThan(RR_MIN);
  });

  it("tiada amaran bila R:R cukup", () => {
    const r = kiraDagangan({
      pairId: "EURUSD",
      arah: "Buy",
      entry: 1.085,
      atr: 0.0012,
      rr: 2,
    });
    expect(r.amaran).toEqual([]);
  });

  it("ralat bila harga masuk tidak sah", () => {
    const r = kiraDagangan({ pairId: "EURUSD", arah: "Buy", entry: 0, atr: 0.0012 });
    expect(r.ralat).toBeTruthy();
    expect(r.ralat.length).toBeGreaterThan(0);
  });

  it("ralat bila ATR tidak sah", () => {
    const r = kiraDagangan({ pairId: "EURUSD", arah: "Buy", entry: 1.085, atr: 0 });
    expect(r.ralat).toBeTruthy();
  });
});

describe("saiz lot — nilai pip mengikut jenis pasangan", () => {
  it("XXX/USD (EURUSD): pip ≈ $10/lot", () => {
    const r = kiraDagangan({
      pairId: "EURUSD",
      arah: "Buy",
      entry: 1.085,
      atr: 0.0012,
      pengganda: 1.5,
      rr: 2,
      baki: 1000,
      risikoPct: 1,
    });
    // risiko $10; SL 18 pip; $10/pip → risiko/lot = $180 → 0.06 lot.
    expect(r.lot).toBeCloseTo(0.06, 2);
    expect(r.amaunRisiko).toBeCloseTo(10, 2);
  });

  it("USD/JPY: nilai pip ditukar ikut harga", () => {
    const r = kiraDagangan({
      pairId: "USDJPY",
      arah: "Buy",
      entry: 150,
      atr: 0.3,
      pengganda: 1.5,
      rr: 2,
      baki: 1000,
      risikoPct: 1,
    });
    // pip 0.01; SL 0.45 → 45 pip; pip=$6.667 → risiko/lot=$300 → 0.033 lot.
    expect(r.lot).toBeCloseTo(0.03, 2);
  });

  it("XAUUSD: pip $10/lot (100 oz × 0.1)", () => {
    const r = kiraDagangan({
      pairId: "XAUUSD",
      arah: "Buy",
      entry: 2000,
      atr: 5,
      pengganda: 1.5,
      rr: 2,
      baki: 1000,
      risikoPct: 1,
    });
    // SL 7.5 → 75 pip; $10/pip → risiko/lot=$750 → 0.0133 → 0.01 lot.
    expect(r.lot).toBeCloseTo(0.01, 2);
  });

  it("lot null bila baki/risiko tidak diisi", () => {
    const r = kiraDagangan({ pairId: "EURUSD", arah: "Buy", entry: 1.085, atr: 0.0012 });
    expect(r.lot).toBeNull();
  });
});
