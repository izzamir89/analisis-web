// Paras sokongan/rintangan + zon supply/demand — 100% tulen & HEURISTIK.
//
// Dibina atas swingPoints() sedia ada dalam smc.js — jangan tulis semula pengesan
// ayun. Idea teras: banyak ayun pada harga yang HAMPIR SAMA sebenarnya satu paras.
// Kelompokkan ayun dalam toleransi ATR, dan kira sentuhan: paras yang diuji 4 kali
// lebih bermakna daripada satu ayun terpencil.

import { swingPoints } from "./smc.js";

// Kelompokkan senarai {i, price} jadi paras. Kembalikan diisih menaik ikut harga.
function kelompok(titik, toleransi) {
  if (!titik.length) return [];
  const isih = [...titik].sort((a, b) => a.price - b.price);
  const keluar = [];
  let semasa = [isih[0]];
  for (let i = 1; i < isih.length; i++) {
    if (isih[i].price - semasa[semasa.length - 1].price <= toleransi) {
      semasa.push(isih[i]);
    } else {
      keluar.push(semasa);
      semasa = [isih[i]];
    }
  }
  keluar.push(semasa);
  return keluar.map((g) => ({
    harga: g.reduce((s, x) => s + x.price, 0) / g.length,
    sentuhan: g.length,
    iAkhir: Math.max(...g.map((x) => x.i)),
  }));
}

// Ekstrak paras S/R relatif kepada harga semasa.
// atrNilai diperlukan untuk toleransi pengelompokan; tanpanya pulang senarai kosong.
export function arasSR(candles, atrNilai, k = 2, toleransATR = 0.5) {
  const n = Array.isArray(candles) ? candles.length : 0;
  if (n < 2 * k + 2 || !(atrNilai > 0)) return { sokongan: [], rintangan: [] };
  const swings = swingPoints(candles, k);
  const harga = candles[n - 1].c;
  const toleransi = toleransATR * atrNilai;

  const semua = kelompok([...swings.highs, ...swings.lows], toleransi);
  // Paras di ATAS harga semasa = rintangan; di BAWAH = sokongan. Satu paras boleh
  // bertukar peranan apabila harga menembusinya — itulah sebabnya kita mengelompok
  // high & low bersama-sama, bukan berasingan.
  return {
    sokongan: semua.filter((a) => a.harga < harga).sort((a, b) => b.harga - a.harga),
    rintangan: semua.filter((a) => a.harga > harga).sort((a, b) => a.harga - b.harga),
  };
}

// Zon supply/demand: julat lilin asas terakhir sebelum gerakan impuls.
// Impuls = lilin yang julatnya >= 1.5× ATR. Lilin sebelumnya ialah zon asal.
export function zonSupplyDemand(candles, atrNilai, imbasan = 60) {
  const n = Array.isArray(candles) ? candles.length : 0;
  if (n < 3 || !(atrNilai > 0)) return [];
  const zon = [];
  const mula = Math.max(1, n - imbasan);
  for (let i = n - 1; i >= mula; i--) {
    const c = candles[i];
    const julat = c.h - c.l;
    if (julat < 1.5 * atrNilai) continue;
    const asas = candles[i - 1];
    const naik = c.c > c.o;
    zon.push({
      atas: asas.h,
      bawah: asas.l,
      jenis: naik ? "demand" : "supply",
      i: i - 1,
    });
    if (zon.length >= 3) break; // zon lama makin tidak relevan
  }
  return zon;
}

// Di mana harga berdiri relatif kepada paras terdekat.
// "Hampir" = dalam 0.5 × ATR. Ini yang mencetuskan peraturan "tunggu breakout".
export function kedudukanAras(harga, aras, atrNilai, zon = []) {
  const kosong = {
    sokongan: null,
    rintangan: null,
    jarakSokongan: null,
    jarakRintangan: null,
    hampirSokongan: false,
    hampirRintangan: false,
    dalamZon: null,
  };
  if (!(harga > 0) || !(atrNilai > 0) || !aras) return kosong;

  const s = aras.sokongan && aras.sokongan.length ? aras.sokongan[0] : null;
  const r = aras.rintangan && aras.rintangan.length ? aras.rintangan[0] : null;
  const ambang = 0.5 * atrNilai;
  const jarakS = s ? harga - s.harga : null;
  const jarakR = r ? r.harga - harga : null;

  const dalamZon = (zon || []).find((z) => harga <= z.atas && harga >= z.bawah) || null;

  return {
    sokongan: s,
    rintangan: r,
    jarakSokongan: jarakS,
    jarakRintangan: jarakR,
    hampirSokongan: jarakS != null && jarakS <= ambang,
    hampirRintangan: jarakR != null && jarakR <= ambang,
    dalamZon,
  };
}
