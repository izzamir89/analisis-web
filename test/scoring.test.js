import { describe, it, expect } from "vitest";
import { skorSetup, gredDariSkor, arahDominan, jelaskan } from "../js/scoring.js";

// Ringkasan indikator "bullish kuat" untuk EURUSD.
const bull = {
  harga: 1.1,
  ema20: 1.09,
  ema50: 1.08,
  ema200: 1.05,
  rsi: 58,
  macd: 0.001,
  signal: 0.0005,
  macdHist: 0.0005,
  adx: 30,
  plusDI: 30,
  minusDI: 10,
  atr: 0.0009,
};
// Cerminan bearish.
const bear = {
  ...bull,
  harga: 1.0,
  ema20: 1.01,
  ema50: 1.02,
  ema200: 1.05,
  rsi: 42,
  macdHist: -0.0005,
  plusDI: 10,
  minusDI: 30,
};

const asasBuy = {
  pairId: "EURUSD",
  arah: "Buy",
  ind1h: bull,
  ind4h: bull,
  indD: bull,
  kekuatan: { EUR: 9, USD: 2 },
  statusSesi: { tahap: "elok", sebab: "London–NY" },
  berita: { ada: false },
};

describe("gredDariSkor — sempadan", () => {
  it("peta skor ke gred betul", () => {
    expect(gredDariSkor(95)).toBe("A+");
    expect(gredDariSkor(94.9)).toBe("A");
    expect(gredDariSkor(85)).toBe("A");
    expect(gredDariSkor(84.9)).toBe("B");
    expect(gredDariSkor(70)).toBe("B");
    expect(gredDariSkor(69.9)).toBe("C");
    expect(gredDariSkor(50)).toBe("C");
    expect(gredDariSkor(49.9)).toBe("D");
  });
});

describe("skorSetup", () => {
  it("setup bullish selari → skor tinggi, verdict BUY, gred A", () => {
    const r = skorSetup(asasBuy);
    expect(r.skor).toBeGreaterThanOrEqual(90);
    expect(r.verdict).toBe("BUY");
    expect(r.gred).toBe("A");
    expect(r.pecahan.trend).toBe(20); // 3/3 TF selari
    expect(r.pecahan.sesi).toBe(10);
  });

  it("gate berita bahaya paksa WAIT walau skor tinggi", () => {
    const r = skorSetup({ ...asasBuy, berita: { ada: true, bahaya: true, minit: 5 } });
    expect(r.gateGagal).toBe(true);
    expect(r.verdict).toBe("WAIT");
  });

  it("pasaran tutup paksa WAIT", () => {
    const r = skorSetup({ ...asasBuy, pasaranTutup: true });
    expect(r.verdict).toBe("WAIT");
  });

  it("setup bearish selari → verdict SELL", () => {
    const r = skorSetup({
      ...asasBuy,
      arah: "Sell",
      ind1h: bear,
      ind4h: bear,
      indD: bear,
      kekuatan: { EUR: 2, USD: 9 },
    });
    expect(r.verdict).toBe("SELL");
  });

  it("input kosong → skor rendah, gred D, WAIT", () => {
    const r = skorSetup({ pairId: "EURUSD" });
    expect(r.skor).toBeLessThan(50);
    expect(r.gred).toBe("D");
    expect(r.verdict).toBe("WAIT");
  });
});

describe("arahDominan", () => {
  it("isyarat bullish → Buy", () => {
    expect(arahDominan(asasBuy)).toBe("Buy");
  });
  it("isyarat bearish → Sell", () => {
    expect(
      arahDominan({ pairId: "EURUSD", ind1h: bear, ind4h: bear, kekuatan: { EUR: 2, USD: 9 } })
    ).toBe("Sell");
  });
});

describe("jelaskan", () => {
  it("hasilkan prosa mengandungi skor & verdict", () => {
    const teks = jelaskan(skorSetup(asasBuy));
    expect(teks).toContain("Skor");
    expect(teks).toContain("BUY");
  });
});
