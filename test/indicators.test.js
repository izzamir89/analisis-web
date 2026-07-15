import { describe, it, expect } from "vitest";
import {
  ema,
  emaLast,
  rsi,
  atr,
  macd,
  adx,
  ringkasanIndikator,
  kekuatanMataWang,
} from "../js/indicators.js";

// Bina lilin dari harga tutup (h/l dijana sekeliling tutup) untuk ujian ringkas.
function lilin(closes, jarak = 1) {
  return closes.map((c) => ({ t: 0, o: c, h: c + jarak / 2, l: c - jarak / 2, c }));
}

describe("ema", () => {
  it("seed = SMA period pertama, kemudian eksponen", () => {
    // [1,2,3,4,5] p=3: seed SMA(1,2,3)=2; k=0.5; 4·.5+2·.5=3; 5·.5+3·.5=4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("pulang semua null bila data kurang dari period", () => {
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });
  it("emaLast pulang nilai terakhir", () => {
    expect(emaLast([1, 2, 3, 4, 5], 3)).toBe(4);
  });
});

describe("rsi (Wilder)", () => {
  it("siri berselang +1/−1 seimbang → RSI 50", () => {
    // 15 nilai, 14 perubahan berselang mula +1: 7 untung, 7 rugi → avgGain=avgLoss → RSI 50
    const closes = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10];
    const r = rsi(closes, 14);
    expect(r[14]).toBeCloseTo(50, 6);
  });
  it("siri menaik tulen → RSI 100 (tiada rugi)", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 1 + i);
    expect(rsi(closes, 14)[14]).toBe(100);
  });
  it("kawal array pendek tanpa throw", () => {
    expect(rsi([1, 2], 14)).toEqual([null, null]);
  });
});

describe("atr (Wilder)", () => {
  it("julat malar → ATR = julat", () => {
    // Setiap lilin h−l=1, tutup di tengah → semua TR=1 → ATR=1
    const candles = lilin(new Array(20).fill(10), 1);
    expect(atr(candles, 14)[14]).toBeCloseTo(1, 6);
  });
  it("kawal data pendek", () => {
    expect(atr(lilin([10, 10], 1), 14)).toEqual([null, null]);
  });
});

describe("macd", () => {
  it("siri malar → macd/signal/hist = 0", () => {
    const closes = new Array(40).fill(5);
    const m = macd(closes);
    const last = m.hist.length - 1;
    expect(m.macd[last]).toBeCloseTo(0, 9);
    expect(m.signal[last]).toBeCloseTo(0, 9);
    expect(m.hist[last]).toBeCloseTo(0, 9);
  });
});

describe("adx", () => {
  it("siri menaik mantap → +DI > −DI dan ADX nombor sah", () => {
    const candles = lilin(
      Array.from({ length: 40 }, (_, i) => 10 + i),
      0.5
    );
    const a = adx(candles, 14);
    const last = a.adx.length - 1;
    expect(a.plusDI[last]).toBeGreaterThan(a.minusDI[last]);
    expect(Number.isFinite(a.adx[last])).toBe(true);
  });
  it("siri malar → ADX 0", () => {
    const candles = lilin(new Array(40).fill(10), 0);
    expect(adx(candles, 14).adx[39]).toBeCloseTo(0, 6);
  });
});

describe("ringkasanIndikator", () => {
  it("pulang null bila tiada lilin", () => {
    expect(ringkasanIndikator([])).toBeNull();
  });
  it("kembalikan harga tutup terakhir", () => {
    const candles = lilin([1, 2, 3, 4, 5], 1);
    expect(ringkasanIndikator(candles).harga).toBe(5);
  });
});

describe("kekuatanMataWang", () => {
  it("EUR menguat, USD melemah menormal ke 0–10", () => {
    // EURUSD +1 → EUR+1, USD−1 ; USDJPY −1 → USD−1, JPY+1
    // skor: EUR=1, USD=−2, JPY=1 → USD terlemah (0), EUR/JPY terkuat (10)
    const k = kekuatanMataWang({ EURUSD: 1, USDJPY: -1 });
    expect(k.USD).toBe(0);
    expect(k.EUR).toBe(10);
    expect(k.JPY).toBe(10);
  });
  it("langkau emas (XAU) & abai input tak sah", () => {
    const k = kekuatanMataWang({ XAUUSD: 5, EURUSD: "x" });
    expect(k.XAU).toBeUndefined();
    expect(Object.keys(k).length).toBe(0);
  });
});
