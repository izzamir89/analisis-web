// Backtest ringkas — 100% tulen. Main semula enjin skor bar demi bar atas lilin
// sejarah, buka dagangan maya bila verdict BUY/SELL, selesai bila SL/TP kena.
// Output = array entri BERBENTUK SAMA seperti jurnal → boleh suap terus ke
// analytics.js (ringkasan, ikutKumpulan, kelukEkuiti, streak).
//
// JUJUR: tier percuma hanya ~250 lilin/panggilan, jadi ini SEMAKAN TETINGKAP-PENDEK
// (cth ~250 bar 1J ≈ 10 hari dagangan), bukan backtest sejarah penuh.

import { atr as kiraAtr } from "./indicators.js";

function keTs(t) {
  if (typeof t === "number") return t;
  const p = Date.parse(t);
  return Number.isNaN(p) ? 0 : p;
}

// candles: [{t,o,h,l,c}] menaik. opts.skorFn(windowCandles, i) → { verdict, skor? }.
// Pulang array entri jurnal maya.
export function backtest(candles, opts = {}) {
  const {
    skorFn,
    threshold = 70,
    slMult = 1.5,
    rr = 2,
    atrPeriod = 14,
    pairId = "EURUSD",
    mula = 50,
  } = opts;

  const n = Array.isArray(candles) ? candles.length : 0;
  const trades = [];
  if (!skorFn || n < mula + 2) return trades;

  const atrArr = kiraAtr(candles, atrPeriod);
  let i = Math.max(mula, atrPeriod + 1);

  while (i < n) {
    const sig = skorFn(candles.slice(0, i + 1), i);
    const verdict = sig && sig.verdict;
    const lulusSkor = !sig || sig.skor == null || sig.skor >= threshold;
    if (!(verdict === "BUY" || verdict === "SELL") || !lulusSkor) {
      i++;
      continue;
    }
    const a = atrArr[i];
    if (!(a > 0)) {
      i++;
      continue;
    }
    const arah = verdict === "BUY" ? "Buy" : "Sell";
    const naik = arah === "Buy";
    const entry = candles[i].c;
    const jarakSL = slMult * a;
    const sl = naik ? entry - jarakSL : entry + jarakSL;
    const tp = naik ? entry + jarakSL * rr : entry - jarakSL * rr;

    // Maju cari resolusi (SL atau TP kena dahulu ikut high/low).
    let hasil = null;
    let keluarI = null;
    for (let j = i + 1; j < n; j++) {
      const c = candles[j];
      if (naik) {
        if (c.l <= sl) {
          hasil = "loss";
          keluarI = j;
          break;
        }
        if (c.h >= tp) {
          hasil = "win";
          keluarI = j;
          break;
        }
      } else {
        if (c.h >= sl) {
          hasil = "loss";
          keluarI = j;
          break;
        }
        if (c.l <= tp) {
          hasil = "win";
          keluarI = j;
          break;
        }
      }
    }
    if (!hasil) break; // tiada resolusi sehingga hujung data → berhenti

    trades.push({
      pairId,
      arah,
      entry,
      sl,
      tp,
      rr,
      hasil,
      ts: keTs(candles[i].t),
      rSebenar: hasil === "win" ? rr : -1,
    });
    i = keluarI + 1; // masuk semula selepas dagangan sebelumnya ditutup
  }
  return trades;
}
