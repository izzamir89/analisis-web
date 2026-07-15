// Indikator teknikal — 100% tulen (tiada I/O), dikira dari lilin OHLC tempatan.
// Guna oleh scoring.js & skrin Dashboard. Semua fungsi kawal array pendek: pulang
// null (bukan throw) supaya UI boleh degradasi anggun ke input manual.
//
// Lilin (candle) berbentuk { t, o, h, l, c } menaik ikut masa.
// `closes` = array harga tutup sahaja.

// Ambil nilai bukan-null terakhir dari array (indikator diselaraskan ikut indeks lilin).
function akhir(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}

// EMA — purata bergerak eksponen. Seed = SMA `period` nilai pertama, then k=2/(p+1).
// Pulang array sepanjang `values`; null sehingga cukup data.
export function ema(values, period) {
  const n = Array.isArray(values) ? values.length : 0;
  const out = new Array(n).fill(null);
  if (n < period || period < 1) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// EMA nilai terakhir sahaja (kemudahan).
export function emaLast(values, period) {
  return akhir(ema(values, period));
}

function nilaiRsi(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// RSI (penghalusan Wilder). Pulang array sepanjang `closes`; null sehingga seed.
export function rsi(closes, period = 14) {
  const n = Array.isArray(closes) ? closes.length : 0;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = nilaiRsi(avgGain, avgLoss);
  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = nilaiRsi(avgGain, avgLoss);
  }
  return out;
}

// True Range setiap lilin (index 0 = null kerana perlu tutup sebelumnya).
function trueRange(candles) {
  const n = candles.length;
  const tr = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const h = candles[i].h;
    const l = candles[i].l;
    const pc = candles[i - 1].c;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return tr;
}

// ATR (penghalusan Wilder). Gantikan input ATR manual di kalkulator bila data ada.
export function atr(candles, period = 14) {
  const n = Array.isArray(candles) ? candles.length : 0;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;
  const tr = trueRange(candles);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

// MACD = EMA(fast) − EMA(slow); signal = EMA(macd); hist = macd − signal.
export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const n = Array.isArray(closes) ? closes.length : 0;
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) macdLine[i] = emaFast[i] - emaSlow[i];
  }
  const signal = new Array(n).fill(null);
  const hist = new Array(n).fill(null);
  const mula = macdLine.findIndex((v) => v != null);
  if (mula >= 0) {
    const bahagian = macdLine.slice(mula); // segmen bukan-null bersambung
    const sigVals = ema(bahagian, signalPeriod);
    for (let i = 0; i < sigVals.length; i++) {
      const idx = mula + i;
      signal[idx] = sigVals[i];
      if (sigVals[i] != null) hist[idx] = macdLine[idx] - sigVals[i];
    }
  }
  return { macd: macdLine, signal, hist };
}

// ADX + arah (+DI/−DI), penghalusan Wilder. Perlu ≥ 2×period lilin untuk satu nilai ADX.
export function adx(candles, period = 14) {
  const n = Array.isArray(candles) ? candles.length : 0;
  const kosong = {
    adx: new Array(n).fill(null),
    plusDI: new Array(n).fill(null),
    minusDI: new Array(n).fill(null),
  };
  if (n < 2 * period) return kosong;

  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const naik = candles[i].h - candles[i - 1].h;
    const turun = candles[i - 1].l - candles[i].l;
    plusDM[i] = naik > turun && naik > 0 ? naik : 0;
    minusDM[i] = turun > naik && turun > 0 ? turun : 0;
    const pc = candles[i - 1].c;
    tr[i] = Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - pc),
      Math.abs(candles[i].l - pc)
    );
  }

  let atrS = 0;
  let pdmS = 0;
  let mdmS = 0;
  for (let i = 1; i <= period; i++) {
    atrS += tr[i];
    pdmS += plusDM[i];
    mdmS += minusDM[i];
  }
  const plusDI = new Array(n).fill(null);
  const minusDI = new Array(n).fill(null);
  const dx = new Array(n).fill(null);
  const kira = (idx) => {
    const pDI = atrS === 0 ? 0 : 100 * (pdmS / atrS);
    const mDI = atrS === 0 ? 0 : 100 * (mdmS / atrS);
    plusDI[idx] = pDI;
    minusDI[idx] = mDI;
    const jum = pDI + mDI;
    dx[idx] = jum === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / jum;
  };
  kira(period);
  for (let i = period + 1; i < n; i++) {
    atrS = atrS - atrS / period + tr[i];
    pdmS = pdmS - pdmS / period + plusDM[i];
    mdmS = mdmS - mdmS / period + minusDM[i];
    kira(i);
  }

  const adxArr = new Array(n).fill(null);
  const idxPertama = 2 * period - 1; // ADX pertama = purata period DX pertama
  let sum = 0;
  for (let i = period; i <= idxPertama; i++) sum += dx[i];
  let prev = sum / period;
  adxArr[idxPertama] = prev;
  for (let i = idxPertama + 1; i < n; i++) {
    prev = (prev * (period - 1) + dx[i]) / period;
    adxArr[i] = prev;
  }
  return { adx: adxArr, plusDI, minusDI };
}

// Ringkasan sekali-panggil untuk satu siri lilin — dipakai scoring & UI.
// Pulang null jika tiada lilin langsung.
export function ringkasanIndikator(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const closes = candles.map((c) => c.c);
  const m = macd(closes);
  const a = adx(candles, 14);
  return {
    harga: closes[closes.length - 1],
    ema20: emaLast(closes, 20),
    ema50: emaLast(closes, 50),
    ema200: emaLast(closes, 200),
    rsi: akhir(rsi(closes, 14)),
    macd: akhir(m.macd),
    signal: akhir(m.signal),
    macdHist: akhir(m.hist),
    adx: akhir(a.adx),
    plusDI: akhir(a.plusDI),
    minusDI: akhir(a.minusDI),
    atr: akhir(atr(candles, 14)),
  };
}

// Kekuatan mata wang 0–10 dari % gerakan baru-baru setiap pasangan.
// perubahanPct: { EURUSD: 0.35, USDJPY: -0.12, ... } (peratus, boleh +/−).
// Cermin logik pengumpulan risk.js: BASE +pct, QUOTE −pct; emas (XAU) dilangkau.
export function kekuatanMataWang(perubahanPct) {
  const skor = {};
  const tambah = (mw, v) => {
    skor[mw] = (skor[mw] || 0) + v;
  };
  for (const [id, pct] of Object.entries(perubahanPct || {})) {
    if (String(id).length < 6) continue;
    const p = Number(pct);
    if (!isFinite(p)) continue;
    const base = id.slice(0, 3);
    const quote = id.slice(3, 6);
    if (base === "XAU" || quote === "XAU") continue; // emas: bukan mata wang fiat
    tambah(base, p);
    tambah(quote, -p);
  }
  const keys = Object.keys(skor);
  if (!keys.length) return {};
  const vals = keys.map((k) => skor[k]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;
  const out = {};
  for (const k of keys) {
    out[k] = span === 0 ? 5 : Math.round(((skor[k] - min) / span) * 100) / 10;
  }
  return out;
}
