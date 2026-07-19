// Backtest ringkas — 100% tulen. Main semula enjin skor bar demi bar atas lilin
// sejarah, buka dagangan maya bila verdict BUY/SELL, selesai bila SL/TP kena.
// Output = array entri BERBENTUK SAMA seperti jurnal → boleh suap terus ke
// analytics.js (ringkasan, ikutKumpulan, kelukEkuiti, streak).
//
// JUJUR: ini kekal IN-SAMPLE. Ambang dan pemberat enjin direka oleh manusia,
// kemudian diuji pada data yang sama — kadar menang yang terhasil optimistik
// secara sistematik. Baca sebagai "prestasi sejarah pada data ini", bukan ramalan.
//
// Teras ialah penjana supaya versi segerak dan tak segerak berkongsi logik yang
// SAMA — backtest yang berbeza daripada enjin langsung ialah backtest yang bohong.

import { atr as kiraAtr } from "./indicators.js";

function keTs(t) {
  if (typeof t === "number") return t;
  const p = Date.parse(t);
  return Number.isNaN(p) ? 0 : p;
}

// Teras: hasilkan dagangan satu demi satu, dengan kemajuan untuk pemanggil tak segerak.
function* jalan(candles, opts) {
  const {
    skorFn,
    threshold = 70,
    slMult = 1.5,
    rr = 2,
    atrPeriod = 14,
    pairId = "EURUSD",
    mula = 50,
    // Hadkan tetingkap yang dilihat skorFn. Tanpa ini setiap bar menyalin
    // keseluruhan sejarah → O(n²) dan membekukan UI pada 5000 lilin.
    // 400 bar sudah memadai: EMA200 & ATR14 lama menumpu sebelum itu.
    lookback = 400,
  } = opts;

  const n = Array.isArray(candles) ? candles.length : 0;
  if (!skorFn || n < mula + 2) return;

  const atrArr = kiraAtr(candles, atrPeriod);
  let i = Math.max(mula, atrPeriod + 1);

  while (i < n) {
    const awal = lookback > 0 ? Math.max(0, i + 1 - lookback) : 0;
    const sig = skorFn(candles.slice(awal, i + 1), i);
    const verdict = sig && sig.verdict;
    const lulusSkor = !sig || sig.skor == null || sig.skor >= threshold;
    if (!(verdict === "BUY" || verdict === "SELL") || !lulusSkor) {
      yield { kemajuan: i / n };
      i++;
      continue;
    }
    const a = atrArr[i];
    if (!(a > 0)) {
      yield { kemajuan: i / n };
      i++;
      continue;
    }
    const arah = verdict === "BUY" ? "Buy" : "Sell";
    const naik = arah === "Buy";
    const entry = candles[i].c;
    const jarakSL = slMult * a;
    const sl = naik ? entry - jarakSL : entry + jarakSL;
    const tp = naik ? entry + jarakSL * rr : entry - jarakSL * rr;

    // Maju cari resolusi. SL disemak DAHULU: bar yang menyentuh kedua-duanya
    // dikira kalah. Anggapan konservatif — kita tidak tahu urutan dalam bar.
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
    if (!hasil) return; // tiada resolusi sehingga hujung data → berhenti

    yield {
      kemajuan: i / n,
      dagangan: {
        pairId,
        arah,
        entry,
        sl,
        tp,
        rr,
        hasil,
        ts: keTs(candles[i].t),
        rSebenar: hasil === "win" ? rr : -1,
        // Skor semasa masuk — dipakai kebarangkalian.js untuk menjalurkan keputusan.
        skor: sig && typeof sig.skor === "number" ? sig.skor : null,
      },
    };
    i = keluarI + 1; // masuk semula selepas dagangan sebelumnya ditutup
  }
}

// candles: [{t,o,h,l,c}] menaik. opts.skorFn(windowCandles, i) → { verdict, skor? }.
// Pulang array entri jurnal maya.
export function backtest(candles, opts = {}) {
  const trades = [];
  for (const langkah of jalan(candles, opts)) {
    if (langkah.dagangan) trades.push(langkah.dagangan);
  }
  return trades;
}

// Versi tak segerak: beri laluan kepada gelung peristiwa setiap `ketulan` bar
// supaya UI kekal responsif dan bar kemajuan boleh dilukis.
// onKemajuan(pecahan 0..1) dipanggil pada setiap jeda.
export async function backtestAsync(candles, opts = {}, onKemajuan) {
  const { ketulan = 150 } = opts;
  const trades = [];
  let kira = 0;
  for (const langkah of jalan(candles, opts)) {
    if (langkah.dagangan) trades.push(langkah.dagangan);
    if (++kira % ketulan === 0) {
      if (onKemajuan) onKemajuan(langkah.kemajuan);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (onKemajuan) onKemajuan(1);
  return trades;
}
