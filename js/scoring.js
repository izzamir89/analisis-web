// AI Score v3 — enjin peraturan berwajaran, 100% tulen & deterministik (BUKAN AI/ML).
// Nama "AI Score" ialah label produk; di dalamnya ialah peraturan yang boleh dibaca,
// diuji, dan diperdebatkan. Tiada model, tiada latihan, tiada rambang.
//
// 100 mata: Trend 40 · Momentum 20 · Smart Money 20 · Corak Lilin 10 · Berita 10.
//
// PERBEZAAN PENTING DARI v2:
//  1. Data hilang = 0 markah, bukan separuh kredit. v2 memberi ~26 markah kepada
//     input yang kosong sepenuhnya — skor yang tidak boleh dipercayai.
//  2. Gate MTF sebenar: timeframe yang BERTENTANGAN → NO TRADE, bukan sekadar
//     markah rendah. Timeframe neutral hanya mengurangkan markah.
//  3. ATR, sesi, dan kekuatan mata wang tidak lagi memberi markah — ia jadi gate
//     dan amaran. Memberi markah kepada perkara di luar tesis dagangan hanya
//     mengaburkan maksud skor.
//
// Pemanggil hantar nilai yang SUDAH dikira supaya modul kekal tulen & boleh diuji.
// input = {
//   pairId, arah?("Buy"|"Sell" — jika tiada, arah dominan diagak),
//   ind1h, ind4h, indD,   // ringkasanIndikator() setiap TF (boleh null)
//   candles1h,            // lilin 1J mentah — untuk tekanan & corak lilin
//   kekuatan,             // { USD:.., EUR:.. } — konteks & undian arah sahaja
//   smc,                  // analisaSMC()
//   aras, zon,            // arasSR() & zonSupplyDemand()
//   statusSesi,           // statusMasaOrder(now) { tahap:"elok"|"hati"|"elak" }
//   berita,               // jarakAcara(now) { bahaya, amaran, seterusnya, senarai }
//   pasaranTutup,         // boolean
// }

import { tekananPasaran } from "./tekanan.js";
import { coraklilin } from "./patterns.js";
import { kedudukanAras } from "./aras.js";

export const AMBANG_MASUK = 70; // skor minimum untuk verdict BUY/SELL
export const ATR_MELONJAK = 0.012; // atr/harga di atas ini = terlalu volatil untuk masuk

const MAKS = { trend: 40, momentum: 20, smartMoney: 20, lilin: 10, berita: 10 };

function jepit(x, min, max) {
  return Math.max(min, Math.min(max, x));
}
function b1(x) {
  return Math.round(x * 10) / 10;
}

// Arah satu timeframe dari ringkasan indikator.
// null bermakna TIADA DATA — berbeza daripada "neutral" (ada data, belum jelas).
export function arahTf(ind) {
  if (!ind || ind.harga == null || ind.ema200 == null || ind.ema20 == null || ind.ema50 == null) {
    return null;
  }
  const naik = ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200 && ind.harga > ind.ema200;
  const turun = ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200 && ind.harga < ind.ema200;
  if (naik) return "bull";
  if (turun) return "bear";
  return "neutral";
}

// Arah dominan diagak dari undian isyarat (guna bila pemanggil tak tetapkan arah).
export function arahDominan(input) {
  const { ind1h, ind4h, indD, kekuatan, pairId, smc } = input;
  let undi = 0;
  for (const ind of [ind1h, ind4h, indD]) {
    if (!ind) continue;
    if (ind.harga != null && ind.ema200 != null) undi += ind.harga > ind.ema200 ? 1 : -1;
    if (ind.macdHist != null) undi += ind.macdHist > 0 ? 1 : -1;
    if (ind.plusDI != null && ind.minusDI != null) undi += ind.plusDI > ind.minusDI ? 1 : -1;
  }
  if (kekuatan && pairId && pairId.length >= 6) {
    const b = pairId.slice(0, 3);
    const q = pairId.slice(3, 6);
    if (kekuatan[b] != null && kekuatan[q] != null) undi += kekuatan[b] > kekuatan[q] ? 1 : -1;
  }
  if (smc && smc.bias) undi += smc.bias === "bull" ? 1 : smc.bias === "bear" ? -1 : 0;
  return undi >= 0 ? "Buy" : "Sell";
}

// --- Baldi skor ---

// Trend (40): Harian 20 · 4J 10 · 1J 10.
// TF bertentangan → konflik (gate NO TRADE). TF hilang → tiadaData (gate NO TRADE).
// TF neutral → 40% markah, gate masih lulus.
function skorTrend(indD, ind4h, ind1h, arah) {
  const mahu = arah === "Buy" ? "bull" : "bear";
  const tf = [
    ["Harian", indD, 20],
    ["4J", ind4h, 10],
    ["1J", ind1h, 10],
  ];
  let markah = 0;
  let konflik = false;
  let tiadaData = false;
  const nota = [];
  for (const [label, ind, maks] of tf) {
    const a = arahTf(ind);
    if (a === null) {
      tiadaData = true;
      nota.push(`${label} tiada data`);
    } else if (a === mahu) {
      markah += maks;
      nota.push(`${label} ${a}`);
    } else if (a === "neutral") {
      markah += maks * 0.4;
      nota.push(`${label} neutral`);
    } else {
      konflik = true;
      nota.push(`${label} ${a} (bertentangan)`);
    }
  }
  return { markah: b1(markah), sebab: nota.join(", ") + ".", konflik, tiadaData };
}

// Momentum (20): RSI 5 · MACD 5 · ADX 5 · Tekanan Pasaran 5.
function skorMomentum(ind1h, candles1h, arah) {
  if (!ind1h) return { markah: 0, sebab: "Tiada data momentum 1J.", tiadaData: true };
  let markah = 0;
  const nota = [];

  // RSI (5) — hukum keadaan terlebih beli/jual, bukan hanya arah.
  if (ind1h.rsi != null) {
    const r = ind1h.rsi;
    const f =
      arah === "Buy"
        ? r >= 70
          ? 0.3
          : r >= 50
            ? 1
            : r >= 40
              ? 0.6
              : 0.2
        : r <= 30
          ? 0.3
          : r <= 50
            ? 1
            : r <= 60
              ? 0.6
              : 0.2;
    markah += 5 * f;
    nota.push(`RSI ${r.toFixed(0)}`);
  }

  // MACD histogram (5)
  if (ind1h.macdHist != null) {
    const h = ind1h.macdHist;
    const selari = arah === "Buy" ? h > 0 : h < 0;
    markah += 5 * (Math.abs(h) < 1e-9 ? 0.5 : selari ? 1 : 0);
    nota.push(`MACD ${h > 0 ? "+" : ""}${h.toFixed(5)}`);
  }

  // ADX + arah DI (5)
  if (ind1h.adx != null) {
    const a = ind1h.adx;
    let f = a >= 25 ? 1 : a >= 20 ? 0.7 : a >= 15 ? 0.4 : 0.15;
    const diSelari =
      ind1h.plusDI != null && ind1h.minusDI != null
        ? arah === "Buy"
          ? ind1h.plusDI > ind1h.minusDI
          : ind1h.minusDI > ind1h.plusDI
        : true;
    if (!diSelari) f *= 0.5;
    markah += 5 * f;
    nota.push(`ADX ${a.toFixed(0)}`);
  }

  // Tekanan Pasaran (5) — proxy untuk volume yang forex spot tiada.
  const tk = tekananPasaran(candles1h, arah);
  if (tk) {
    markah += 5 * tk.skorFrac;
    nota.push(`Tekanan ${Math.round(tk.skorFrac * 100)}%`);
  }

  return {
    markah: b1(jepit(markah, 0, MAKS.momentum)),
    sebab: nota.length ? nota.join(", ") + "." : "Data momentum terhad.",
    tekanan: tk,
  };
}

// Smart Money (20): bias struktur 8 · kedudukan vs paras 7 · zon supply/demand 5.
function skorSmartMoney(smc, aras, zon, harga, atrNilai, arah) {
  const mahu = arah === "Buy" ? "bull" : "bear";
  let markah = 0;
  const nota = [];
  const amaran = [];
  let tungguBreakout = false;

  // Bias struktur (8) — BOS/CHoCH/liquidity grab yang sudah diringkaskan smc.js.
  if (!smc || !smc.bias) {
    nota.push("struktur tidak dinilai");
  } else if (smc.bias === mahu) {
    markah += 8;
    nota.push(`struktur ${smc.bias} selari`);
  } else if (smc.bias === "neutral") {
    markah += 3;
    nota.push("struktur neutral");
  } else {
    nota.push(`struktur ${smc.bias} menentang`);
  }

  // Kedudukan vs paras S/R (7) — inilah peraturan "tunggu breakout".
  const k = kedudukanAras(harga, aras, atrNilai, zon);
  const hampirLawan = arah === "Buy" ? k.hampirRintangan : k.hampirSokongan;
  const hampirSokong = arah === "Buy" ? k.hampirSokongan : k.hampirRintangan;
  if (!aras || (!k.sokongan && !k.rintangan)) {
    nota.push("paras tidak dikesan");
  } else if (hampirLawan) {
    tungguBreakout = true;
    const paras = arah === "Buy" ? k.rintangan : k.sokongan;
    const nama = arah === "Buy" ? "rintangan" : "sokongan";
    amaran.push(`Hampir ${nama} ${paras.harga.toFixed(5)} — tunggu breakout.`);
    nota.push(`hampir ${nama}`);
  } else if (hampirSokong) {
    markah += 7;
    nota.push(arah === "Buy" ? "memantul dari sokongan" : "ditolak dari rintangan");
  } else {
    markah += 4;
    nota.push("ruang bebas ke paras terdekat");
  }

  // Zon supply/demand (5).
  // "Luar zon" hanya boleh diberi markah jika kita BENAR-BENAR mengimbas zon.
  // Tanpa data zon, tiada markah — jangan ganjari ketidaktahuan.
  const adaDataZon = Array.isArray(zon);
  const zonMahu = arah === "Buy" ? "demand" : "supply";
  if (!adaDataZon) {
    nota.push("zon tidak diimbas");
  } else if (k.dalamZon) {
    if (k.dalamZon.jenis === zonMahu) {
      markah += 5;
      nota.push(`dalam zon ${k.dalamZon.jenis}`);
    } else {
      nota.push(`dalam zon ${k.dalamZon.jenis} (menentang)`);
    }
  } else {
    markah += 2;
    nota.push("luar zon");
  }

  return {
    markah: b1(jepit(markah, 0, MAKS.smartMoney)),
    sebab: nota.join(", ") + ".",
    amaran,
    tungguBreakout,
    kedudukan: k,
  };
}

// Corak Lilin (10): corak dikesan 6 · bonus konfluens dengan paras 4.
function skorLilin(candles1h, aras, atrNilai, harga, arah, zon) {
  const corak = coraklilin(candles1h);
  if (!corak) return { markah: 0, sebab: "Tiada corak lilin jelas.", corak: null };
  const mahu = arah === "Buy" ? "bull" : "bear";
  if (corak.arah !== mahu) {
    return {
      markah: 0,
      sebab: `${corak.nama} menentang arah ${arah}.`,
      corak,
    };
  }
  let markah = 6 * corak.kekuatan;
  const nota = [corak.nama];

  // Konfluens: corak pembalikan bullish di sokongan (atau bearish di rintangan)
  // jauh lebih bermakna daripada corak yang sama di tengah-tengah julat.
  const k = kedudukanAras(harga, aras, atrNilai, zon);
  const diParas = arah === "Buy" ? k.hampirSokongan : k.hampirRintangan;
  if (diParas) {
    markah += 4;
    nota.push(arah === "Buy" ? "di sokongan" : "di rintangan");
  }

  return { markah: b1(jepit(markah, 0, MAKS.lilin)), sebab: nota.join(" ") + ".", corak };
}

// Berita (10). Menerima hasil jarakAcara().
//
// Bezakan dua keadaan yang v2 campur adukkan:
//   berita tiada langsung  → kita TIDAK TAHU → 0 markah
//   senarai acara kosong   → pengguna sahkan tiada acara → markah penuh
function skorBerita(berita) {
  if (!berita || !Array.isArray(berita.senarai)) {
    return { markah: 0, sebab: "Status berita tidak diketahui.", tiadaData: true };
  }
  if (berita.bahaya) {
    return { markah: 0, sebab: "⛔ Dalam zon bahaya berita impak tinggi.", bahaya: true };
  }
  if (berita.amaran) {
    return { markah: b1(MAKS.berita * 0.5), sebab: "Acara impak sederhana berdekatan." };
  }
  const s = berita.seterusnya;
  if (s && !s.lalu && s.impak === "tinggi" && s.minit <= 60) {
    return {
      markah: b1(MAKS.berita * 0.5),
      sebab: `${s.nama} (${s.mataWang || "?"}) dalam ${Math.round(s.minit)} min.`,
    };
  }
  return { markah: MAKS.berita, sebab: "Tiada acara impak tinggi berhampiran." };
}

// Gred Kualiti Dagangan dari skor.
export function gredDariSkor(skor) {
  if (skor >= 95) return "A+";
  if (skor >= 85) return "A";
  if (skor >= 70) return "B";
  if (skor >= 50) return "C";
  return "D";
}

// Kira skor penuh + verdict + gate + pecahan + peraturan menyala.
export function skorSetup(input) {
  const arah = input.arah || arahDominan(input);
  const harga = input.ind1h ? input.ind1h.harga : null;
  const atrNilai = input.ind1h ? input.ind1h.atr : null;

  const baldi = {
    trend: skorTrend(input.indD, input.ind4h, input.ind1h, arah),
    momentum: skorMomentum(input.ind1h, input.candles1h, arah),
    smartMoney: skorSmartMoney(input.smc, input.aras, input.zon, harga, atrNilai, arah),
    lilin: skorLilin(input.candles1h, input.aras, atrNilai, harga, arah, input.zon),
    berita: skorBerita(input.berita),
  };

  const skor = b1(Object.values(baldi).reduce((s, b) => s + b.markah, 0));
  const gred = gredDariSkor(skor);

  // --- Gate keras: tesis dagangan rosak, skor tidak relevan → NO TRADE ---
  const sebabGate = [];
  if (input.pasaranTutup) sebabGate.push("Pasaran tutup.");
  if (baldi.trend.konflik) sebabGate.push("Timeframe bertentangan arah.");
  if (baldi.trend.tiadaData)
    sebabGate.push("Data timeframe tidak lengkap — tidak boleh sahkan penjajaran.");
  if (baldi.berita.bahaya) sebabGate.push("Berita impak tinggi dalam zon bahaya.");
  const atrPct = harga > 0 && atrNilai > 0 ? atrNilai / harga : null;
  if (atrPct != null && atrPct > ATR_MELONJAK) {
    sebabGate.push(`Volatiliti melonjak (ATR ${(atrPct * 100).toFixed(2)}%) — terlalu berisiko.`);
  }

  // --- Amaran: tidak membunuh dagangan, tetapi mesti dilihat pengguna ---
  const amaran = [...baldi.smartMoney.amaran];
  if (input.statusSesi && input.statusSesi.tahap === "elak") {
    amaran.push("Kecairan sesi rendah — spread mungkin lebar.");
  }
  if (atrPct != null && atrPct < 0.0001) {
    amaran.push("Volatiliti sangat rendah — gerakan mungkin tersekat.");
  }
  if (input.kekuatan && input.pairId && input.pairId.length >= 6) {
    const b = input.pairId.slice(0, 3);
    const q = input.pairId.slice(3, 6);
    if (input.kekuatan[b] != null && input.kekuatan[q] != null) {
      const beza = input.kekuatan[b] - input.kekuatan[q];
      const menyokong = arah === "Buy" ? beza > 0 : beza < 0;
      if (!menyokong) amaran.push(`Kekuatan mata wang menentang ${arah}.`);
    }
  }

  const gate = { lulus: sebabGate.length === 0, sebab: sebabGate };

  let verdict;
  if (!gate.lulus) verdict = "NO TRADE";
  else if (baldi.smartMoney.tungguBreakout) verdict = "WAIT";
  else if (skor >= AMBANG_MASUK) verdict = arah === "Buy" ? "BUY" : "SELL";
  else verdict = "WAIT";

  const firedRules = Object.entries(baldi).map(([id, b]) => {
    const maks = MAKS[id];
    const frac = maks > 0 ? b.markah / maks : 0;
    const status =
      b.konflik || b.tiadaData || b.markah === 0 ? "gagal" : frac < 0.6 ? "amaran" : "ok";
    return { id, label: LABEL[id], markah: b.markah, maks, sebab: b.sebab, status };
  });

  return {
    skor,
    gred,
    verdict,
    arah,
    arahCadangan: arahDominan(input),
    pecahan: Object.fromEntries(Object.entries(baldi).map(([k, v]) => [k, v.markah])),
    maks: { ...MAKS },
    firedRules,
    gate,
    amaran,
    gateGagal: !gate.lulus, // jimat-belakang
    corak: baldi.lilin.corak,
    tekanan: baldi.momentum.tekanan,
    kedudukan: baldi.smartMoney.kedudukan,
  };
}

const LABEL = {
  trend: "Trend (MTF)",
  momentum: "Momentum",
  smartMoney: "Smart Money",
  lilin: "Corak Lilin",
  berita: "Berita",
};

// Susun prosa penerangan Bahasa Melayu (deterministik, bukan LLM).
export function jelaskan(hasil) {
  if (!hasil) return "";
  if (!hasil.gate.lulus) {
    return `NO TRADE — ${hasil.gate.sebab.join(" ")} Skor ${hasil.skor} tidak relevan selagi ini benar.`;
  }
  const teratas = [...hasil.firedRules].sort((a, b) => b.markah - a.markah).slice(0, 3);
  const ayat = teratas.map((r) => `${r.label}: ${r.sebab}`).join(" ");
  const amaran = hasil.amaran.length ? ` Amaran: ${hasil.amaran.join(" ")}` : "";
  return `Skor ${hasil.skor} (Gred ${hasil.gred}). ${ayat}${amaran} Cadangan: ${hasil.verdict}.`;
}
