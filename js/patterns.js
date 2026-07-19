// Corak lilin — 100% tulen & HEURISTIK. Dikesan pada lilin TERAKHIR sahaja
// (Morning/Evening Star melihat 3 lilin terakhir).
//
// Semua ambang saiz diskalakan dengan ATR, bukan nilai harga mutlak. Ini wajib:
// badan 0.0010 ialah lilin besar pada EURUSD tetapi bunyi bising pada XAUUSD.
//
// Pulang corak TERKUAT sahaja bila lebih daripada satu padan — memaparkan senarai
// corak bertindih hanya mencipta ilusi konfluens daripada satu lilin yang sama.

import { atr } from "./indicators.js";

// Lilin mesti sekurang-kurangnya sebesar ini (× ATR) sebelum dikira bermakna.
const MIN_JULAT_ATR = 0.5;

function bahagian(c) {
  const julat = c.h - c.l;
  const badan = Math.abs(c.c - c.o);
  const atas = c.h - Math.max(c.o, c.c);
  const bawah = Math.min(c.o, c.c) - c.l;
  return { julat, badan, atas, bawah, naik: c.c > c.o, turun: c.c < c.o };
}

function jepit01(x) {
  return Math.max(0, Math.min(1, x));
}

// Kesan corak pada hujung siri lilin.
// Pulang { nama, arah:"bull"|"bear", kekuatan:0..1, i } atau null.
export function coraklilin(candles, period = 14) {
  const n = Array.isArray(candles) ? candles.length : 0;
  if (n < 3) return null;
  const siriAtr = atr(candles, period);
  const atrNilai = siriAtr ? siriAtr[siriAtr.length - 1] : null;
  if (!(atrNilai > 0)) return null;

  const c3 = candles[n - 3];
  const c2 = candles[n - 2];
  const c1 = candles[n - 1];
  const b1 = bahagian(c1);
  const b2 = bahagian(c2);
  const b3 = bahagian(c3);
  const i = n - 1;

  if (!(b1.julat > 0)) return null;
  // Lilin terlalu kecil relatif ATR → bukan isyarat, cuma bunyi bising.
  if (b1.julat < MIN_JULAT_ATR * atrNilai) return null;

  const calon = [];

  // --- Engulfing: badan lilin terakhir menelan badan lilin sebelumnya ---
  if (b2.badan > 0 && b1.badan > b2.badan) {
    const nisbah = b1.badan / b2.badan;
    if (b1.naik && b2.turun && c1.c >= c2.o && c1.o <= c2.c) {
      calon.push({
        nama: "Bullish Engulfing",
        arah: "bull",
        kekuatan: jepit01(0.5 + (nisbah - 1) * 0.35),
        i,
      });
    }
    if (b1.turun && b2.naik && c1.c <= c2.o && c1.o >= c2.c) {
      calon.push({
        nama: "Bearish Engulfing",
        arah: "bear",
        kekuatan: jepit01(0.5 + (nisbah - 1) * 0.35),
        i,
      });
    }
  }

  // --- Hammer / Shooting Star: badan kecil, satu sumbu panjang ---
  if (b1.badan > 0) {
    const badanKecil = b1.badan <= 0.35 * b1.julat;
    if (badanKecil && b1.bawah >= 2 * b1.badan && b1.atas <= 0.8 * b1.badan) {
      calon.push({
        nama: "Hammer",
        arah: "bull",
        kekuatan: jepit01(0.45 + (b1.bawah / b1.julat - 0.5) * 1.1),
        i,
      });
    }
    if (badanKecil && b1.atas >= 2 * b1.badan && b1.bawah <= 0.8 * b1.badan) {
      calon.push({
        nama: "Shooting Star",
        arah: "bear",
        kekuatan: jepit01(0.45 + (b1.atas / b1.julat - 0.5) * 1.1),
        i,
      });
    }
  }

  // --- Morning / Evening Star: 3 lilin, badan tengah kecil ---
  const tengahKecil = b2.badan <= 0.5 * b3.badan && b2.badan <= 0.5 * b1.badan;
  const c3Besar = b3.badan >= 0.4 * atrNilai;
  const c1Besar = b1.badan >= 0.4 * atrNilai;
  if (tengahKecil && c3Besar && c1Besar) {
    const tengah3 = (c3.o + c3.c) / 2;
    if (b3.turun && b1.naik && c1.c > tengah3) {
      calon.push({
        nama: "Morning Star",
        arah: "bull",
        kekuatan: jepit01(0.6 + ((c1.c - tengah3) / b3.badan) * 0.4),
        i,
      });
    }
    if (b3.naik && b1.turun && c1.c < tengah3) {
      calon.push({
        nama: "Evening Star",
        arah: "bear",
        kekuatan: jepit01(0.6 + ((tengah3 - c1.c) / b3.badan) * 0.4),
        i,
      });
    }
  }

  if (!calon.length) return null;
  calon.sort((a, b) => b.kekuatan - a.kekuatan);
  return calon[0];
}
