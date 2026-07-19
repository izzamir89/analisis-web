import { describe, it, expect } from "vitest";
import { coraklilin } from "../js/patterns.js";

// Siri asas berjulat `julat` supaya ATR(14) stabil; skala boleh diubah untuk
// menguji bahawa ambang mengikut ATR, bukan magnitud harga.
function asas(n = 20, paras = 100, julat = 1) {
  const h = julat / 2;
  return Array.from({ length: n }, (_, i) => ({
    t: i * 3600000,
    o: paras,
    h: paras + h,
    l: paras - h,
    c: paras,
  }));
}

describe("coraklilin", () => {
  it("Bullish Engulfing", () => {
    const s = asas();
    s.push({ t: 1, o: 100.6, h: 100.7, l: 99.9, c: 100.0 }); // bearish
    s.push({ t: 2, o: 99.8, h: 101.2, l: 99.7, c: 100.9 }); // menelan
    const r = coraklilin(s);
    expect(r.nama).toBe("Bullish Engulfing");
    expect(r.arah).toBe("bull");
    expect(r.i).toBe(s.length - 1);
  });

  it("Bearish Engulfing", () => {
    const s = asas();
    s.push({ t: 1, o: 100.0, h: 100.7, l: 99.9, c: 100.6 }); // bullish
    s.push({ t: 2, o: 100.9, h: 101.1, l: 99.6, c: 99.8 }); // menelan turun
    const r = coraklilin(s);
    expect(r.nama).toBe("Bearish Engulfing");
    expect(r.arah).toBe("bear");
  });

  it("Hammer — badan kecil di atas, sumbu bawah panjang", () => {
    const s = asas();
    s.push({ t: 1, o: 100.0, h: 100.15, l: 98.8, c: 100.1 });
    const r = coraklilin(s);
    expect(r.nama).toBe("Hammer");
    expect(r.arah).toBe("bull");
  });

  it("Shooting Star — badan kecil di bawah, sumbu atas panjang", () => {
    const s = asas();
    s.push({ t: 1, o: 100.1, h: 101.4, l: 100.0, c: 100.0 });
    const r = coraklilin(s);
    expect(r.nama).toBe("Shooting Star");
    expect(r.arah).toBe("bear");
  });

  it("Morning Star — turun besar, badan kecil, naik besar melepasi tengah", () => {
    const s = asas();
    s.push({ t: 1, o: 101.0, h: 101.1, l: 99.4, c: 99.5 }); // bearish besar
    s.push({ t: 2, o: 99.4, h: 99.6, l: 99.2, c: 99.45 }); // badan kecil
    s.push({ t: 3, o: 99.5, h: 100.9, l: 99.4, c: 100.8 }); // naik melepasi 100.25
    const r = coraklilin(s);
    expect(r.nama).toBe("Morning Star");
    expect(r.arah).toBe("bull");
  });

  it("Evening Star — naik besar, badan kecil, turun besar bawah tengah", () => {
    const s = asas();
    s.push({ t: 1, o: 99.5, h: 101.1, l: 99.4, c: 101.0 }); // bullish besar
    s.push({ t: 2, o: 101.1, h: 101.3, l: 100.9, c: 101.05 }); // badan kecil
    s.push({ t: 3, o: 101.0, h: 101.1, l: 99.6, c: 99.7 }); // turun bawah 100.25
    const r = coraklilin(s);
    expect(r.nama).toBe("Evening Star");
    expect(r.arah).toBe("bear");
  });

  it("lilin biasa → null", () => {
    const s = asas(22);
    expect(coraklilin(s)).toBe(null);
  });

  it("ambang diskalakan ATR — corak sama dikesan pada magnitud XAUUSD & EURUSD", () => {
    // Hammer yang sama, dua skala harga/julat yang jauh berbeza.
    const emas = asas(20, 2400, 12);
    emas.push({ t: 1, o: 2400, h: 2401.8, l: 2384, c: 2401.2 });
    const eur = asas(20, 1.085, 0.005);
    eur.push({ t: 1, o: 1.085, h: 1.08575, l: 1.0783, c: 1.0855 });
    expect(coraklilin(emas).nama).toBe("Hammer");
    expect(coraklilin(eur).nama).toBe("Hammer");
  });

  it("lilin terlalu kecil relatif ATR diabaikan sebagai bunyi bising", () => {
    const s = asas();
    // Bentuk hammer tetapi julat hanya ~0.2× ATR.
    s.push({ t: 1, o: 100.0, h: 100.01, l: 99.8, c: 100.005 });
    expect(coraklilin(s)).toBe(null);
  });

  it("data pendek atau tak sah → null tanpa throw", () => {
    expect(coraklilin([{ t: 0, o: 1, h: 2, l: 0, c: 1 }])).toBe(null);
    expect(coraklilin([])).toBe(null);
    expect(coraklilin(null)).toBe(null);
  });
});
