// Lapisan data pasaran — ambil lilin OHLC dari API (Twelve Data) untuk disuap ke
// indicators.js. Ini SATU-SATUNYA modul yang buat rangkaian untuk data harga; logik
// parse/cache/kuota dikekalkan tulen supaya boleh diuji tanpa rangkaian.
//
// Reka bentuk adapter: `provider` boleh ditukar; hantar Twelve Data dahulu.
// Degradasi anggun: bila tiada kunci / kuota habis / ralat → sumber "manual" supaya
// UI jatuh balik ke input ATR/harga manual sedia ada (calculator.js).
//
// CAVEAT JUJUR: app sisi-klien tak boleh sembunyi kunci API — sesiapa yang ada
// peranti/devtools boleh baca. Guna kunci PERCUMA tanpa bil.

import { bacaJSON, simpanJSON } from "./store.js";
import { cariPair } from "./pairs.js";

const KUNCI_TETAPAN = "md_tetapan";
const KUNCI_KUOTA = "md_kuota";
const PROVIDER_LALAI = "twelvedata";

// Had kadar tier percuma Twelve Data = 8 req/min; hadkan 7 untuk margin selamat.
const HAD_SEMINIT = 7;

// TTL cache ikut interval (ms) — lilin cuma basi bila bar baharu tutup.
const TTL = { 60: 10 * 60_000, 240: 30 * 60_000, D: 6 * 3_600_000 };

// Peta interval dalaman ("60"/"240"/"D") → simbol interval Twelve Data.
const INTERVAL_TD = { 60: "1h", 240: "4h", D: "1day" };

// ---- Tetapan API (localStorage) ----

export function bacaTetapanApi() {
  const t = bacaJSON(KUNCI_TETAPAN, {});
  return { provider: t.provider || PROVIDER_LALAI, apikey: t.apikey || "" };
}

export function simpanTetapanApi(t) {
  simpanJSON(KUNCI_TETAPAN, { ...bacaTetapanApi(), ...t });
}

// Untuk memutuskan sama ada guna fallback manual.
export function adaKunciApi() {
  return !!bacaTetapanApi().apikey;
}

// ---- Pemetaan simbol & interval ----

export function simbolProvider(pair, provider = PROVIDER_LALAI) {
  if (provider === "twelvedata") return pair.td || pair.id;
  return pair.id;
}

export function petaInterval(interval, provider = PROVIDER_LALAI) {
  if (provider === "twelvedata") return INTERVAL_TD[interval] || "1h";
  return interval;
}

// ---- Cache (tulen) ----

function kunciCache(provider, symbol, interval) {
  return `md_cache:${provider}:${symbol}:${interval}`;
}

export function simpanCache(provider, symbol, interval, candles, now) {
  simpanJSON(kunciCache(provider, symbol, interval), { ts: now, candles });
}

// Pulang candles jika ada & masih segar (now − ts ≤ ttlMs). ttlMs null = abai umur.
export function bacaCache(provider, symbol, interval, now, ttlMs) {
  const e = bacaJSON(kunciCache(provider, symbol, interval), null);
  if (!e || !Array.isArray(e.candles)) return null;
  if (ttlMs != null && now - e.ts > ttlMs) return null;
  return e.candles;
}

// ---- Penormal respons (tulen) ----

// Twelve Data time_series: { values:[{datetime,open,high,low,close}], status }.
// `values` disusun MENURUN (terbaru dahulu) → kita balikkan supaya menaik ikut masa.
export function normalTwelveData(json) {
  if (!json || json.status === "error" || !Array.isArray(json.values)) {
    return { ralat: (json && json.message) || "Respons data tidak sah" };
  }
  const candles = json.values
    .map((v) => ({
      t: v.datetime,
      o: Number(v.open),
      h: Number(v.high),
      l: Number(v.low),
      c: Number(v.close),
    }))
    .filter((c) => [c.o, c.h, c.l, c.c].every(Number.isFinite))
    .reverse();
  return candles.length ? { candles } : { ralat: "Tiada lilin dalam respons" };
}

// ---- Kuota / throttle ----

function minitSekarang(now) {
  return Math.floor(now / 60_000);
}

// Berapa panggilan lagi dibenarkan dalam minit semasa.
export function kuotaBaki(now = Date.now()) {
  const q = bacaJSON(KUNCI_KUOTA, { minit: 0, kira: 0 });
  if (q.minit !== minitSekarang(now)) return HAD_SEMINIT;
  return Math.max(0, HAD_SEMINIT - q.kira);
}

function catatPanggilan(now) {
  const m = minitSekarang(now);
  const q = bacaJSON(KUNCI_KUOTA, { minit: 0, kira: 0 });
  simpanJSON(KUNCI_KUOTA, { minit: m, kira: q.minit === m ? q.kira + 1 : 1 });
}

// ---- Ambil OHLC (I/O) ----

// Pulang { candles: [{t,o,h,l,c}] | null, sumber: "cache"|"api"|"manual", ralat? }.
// `sumber:"manual"` bermaksud UI patut guna input manual (calculator.js).
export async function ambilOHLC(pairId, interval, { paksa = false, outputsize = 250 } = {}) {
  const pair = cariPair(pairId);
  const { provider, apikey } = bacaTetapanApi();
  const symbol = simbolProvider(pair, provider);
  const now = Date.now();

  if (!paksa) {
    const segar = bacaCache(provider, symbol, interval, now, TTL[interval]);
    if (segar) return { candles: segar, sumber: "cache" };
  }
  if (!apikey) {
    return { candles: null, sumber: "manual", ralat: "Tiada kunci API — guna input manual." };
  }
  if (kuotaBaki(now) <= 0) {
    const lama = bacaCache(provider, symbol, interval, now, null);
    return {
      candles: lama,
      sumber: lama ? "cache" : "manual",
      ralat: "Kuota seminit habis — cuba sebentar lagi.",
    };
  }

  try {
    const tf = petaInterval(interval, provider);
    const url =
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${tf}&outputsize=${outputsize}&apikey=${encodeURIComponent(apikey)}`;
    catatPanggilan(now);
    const res = await fetch(url);
    const json = await res.json();
    const hasil = normalTwelveData(json);
    if (hasil.ralat) {
      const lama = bacaCache(provider, symbol, interval, now, null);
      return { candles: lama, sumber: lama ? "cache" : "manual", ralat: hasil.ralat };
    }
    simpanCache(provider, symbol, interval, hasil.candles, now);
    return { candles: hasil.candles, sumber: "api" };
  } catch (e) {
    const lama = bacaCache(provider, symbol, interval, now, null);
    return {
      candles: lama,
      sumber: lama ? "cache" : "manual",
      ralat: String((e && e.message) || e),
    };
  }
}
