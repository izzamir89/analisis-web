// Enjin peraturan berwajaran — 100% tulen & deterministik (BUKAN AI/ML).
// Gabung output indicators.js + kekuatan mata wang + SMC + sesi + berita jadi satu
// skor 0–100, verdict BUY/SELL/WAIT, dan Gred Kualiti Dagangan (A+/A/B/C/D).
// `jelaskan()` menyusun prosa Bahasa Melayu bertemplat dari peraturan yang "menyala".
//
// Pemanggil hantar nilai yang SUDAH dikira supaya modul kekal tulen & boleh diuji.
// input = {
//   pairId, arah?("Buy"|"Sell" — jika tiada, arah dominan diagak),
//   ind1h, ind4h, indD,        // ringkasanIndikator() setiap TF (boleh null)
//   kekuatan,                  // { USD:.., EUR:.. } dari kekuatanMataWang()
//   smc,                       // analisaSMC() { bias } (pilihan)
//   statusSesi,                // statusMasaOrder(now) { tahap:"elok"|"hati"|"elak" }
//   berita,                    // jarakBerita(now) { ada, bahaya, minit }
//   pasaranTutup,              // boolean (pilihan)
// }

const AMBANG_MASUK = 70; // skor minimum untuk verdict BUY/SELL

function jepit(x, min, max) {
  return Math.max(min, Math.min(max, x));
}
function b1(x) {
  return Math.round(x * 10) / 10;
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

// --- Baldi skor individu (setiap satu pulang { markah, sebab }) ---

function skorTrend(inds, arah, maxMarkah = 20) {
  const hadir = inds.filter(Boolean);
  if (!hadir.length) return { markah: 0, sebab: "Tiada data trend." };
  let jum = 0;
  let selari = 0;
  for (const ind of hadir) {
    let s = 0;
    if (ind.harga != null && ind.ema200 != null) {
      s += (arah === "Buy" ? ind.harga > ind.ema200 : ind.harga < ind.ema200) ? 0.5 : 0;
    }
    if (ind.ema20 != null && ind.ema50 != null && ind.ema200 != null) {
      const naik = ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200;
      const turun = ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200;
      s += (arah === "Buy" ? naik : turun) ? 0.5 : 0;
    }
    if (s >= 0.75) selari++;
    jum += s;
  }
  const markah = (maxMarkah * jum) / hadir.length;
  return {
    markah: b1(markah),
    sebab: `${selari}/${hadir.length} timeframe selari ${arah === "Buy" ? "naik" : "turun"}.`,
  };
}

function skorKekuatan(kekuatan, pairId, arah, maxMarkah = 15) {
  if (!kekuatan || !pairId || pairId.length < 6) {
    return { markah: b1(maxMarkah * 0.5), sebab: "Kekuatan mata wang tidak diketahui." };
  }
  const b = pairId.slice(0, 3);
  const q = pairId.slice(3, 6);
  if (kekuatan[b] == null || kekuatan[q] == null) {
    return { markah: b1(maxMarkah * 0.5), sebab: "Kekuatan pasangan tak lengkap." };
  }
  const beza = kekuatan[b] - kekuatan[q]; // −10..10
  const bertanda = arah === "Buy" ? beza : -beza;
  const frac = jepit(0.5 + bertanda / 20, 0, 1);
  return {
    markah: b1(maxMarkah * frac),
    sebab: `${b} ${kekuatan[b]} vs ${q} ${kekuatan[q]} (${bertanda >= 0 ? "menyokong" : "menentang"} ${arah}).`,
  };
}

function skorAtr(ind1h, maxMarkah = 10) {
  if (!ind1h || ind1h.atr == null || !(ind1h.harga > 0)) {
    return { markah: 0, sebab: "ATR tiada." };
  }
  const pct = ind1h.atr / ind1h.harga;
  let frac;
  let nota;
  if (pct < 0.0001) {
    frac = 0.3;
    nota = "volatiliti sangat rendah";
  } else if (pct <= 0.006) {
    frac = 1;
    nota = "volatiliti sihat";
  } else if (pct <= 0.012) {
    frac = 0.6;
    nota = "volatiliti tinggi";
  } else {
    frac = 0.3;
    nota = "volatiliti melonjak (berisiko)";
  }
  return { markah: b1(maxMarkah * frac), sebab: `ATR ${(pct * 100).toFixed(2)}% — ${nota}.` };
}

function skorSesi(statusSesi, maxMarkah = 10) {
  const tahap = statusSesi && statusSesi.tahap;
  const peta = { elok: 1, hati: 0.5, elak: 0 };
  const frac = peta[tahap] != null ? peta[tahap] : 0.5;
  return {
    markah: b1(maxMarkah * frac),
    sebab: statusSesi ? statusSesi.sebab || `Kecairan sesi: ${tahap}.` : "Sesi tidak diketahui.",
  };
}

function skorBerita(berita, maxMarkah = 10) {
  if (!berita || !berita.ada)
    return { markah: maxMarkah, sebab: "Tiada berita merah dijadualkan." };
  if (berita.bahaya) return { markah: 0, sebab: "⛔ Dalam zon bahaya berita (±30 min)." };
  if (Math.abs(berita.minit) <= 60) {
    return { markah: b1(maxMarkah * 0.5), sebab: "Berita merah dalam 60 min." };
  }
  return { markah: maxMarkah, sebab: "Tiada berita merah hampir." };
}

function skorSmc(smc, arah, maxMarkah = 5) {
  if (!smc || !smc.bias) return { markah: b1(maxMarkah * 0.4), sebab: "SMC tidak dinilai." };
  const mahu = arah === "Buy" ? "bull" : "bear";
  if (smc.bias === mahu) return { markah: maxMarkah, sebab: `Struktur SMC ${smc.bias} selari.` };
  if (smc.bias === "neutral")
    return { markah: b1(maxMarkah * 0.4), sebab: "Struktur SMC neutral." };
  return { markah: 0, sebab: `Struktur SMC ${smc.bias} menentang arah.` };
}

// Ringkasan teknikal (~30): RSI 8 + MACD 8 + ADX 7 + konfluens MTF 7. Guna 1J untuk momentum.
function skorTeknikal(ind1h, inds, arah, maxMarkah = 30) {
  let markah = 0;
  const nota = [];

  // RSI (8)
  if (ind1h && ind1h.rsi != null) {
    const r = ind1h.rsi;
    let f;
    if (arah === "Buy") f = r >= 70 ? 0.3 : r >= 50 ? 1 : r >= 40 ? 0.6 : 0.3;
    else f = r <= 30 ? 0.3 : r <= 50 ? 1 : r <= 60 ? 0.6 : 0.3;
    markah += 8 * f;
    nota.push(`RSI ${r.toFixed(0)}`);
  } else {
    markah += 4;
  }

  // MACD histogram (8)
  if (ind1h && ind1h.macdHist != null) {
    const h = ind1h.macdHist;
    const selari = arah === "Buy" ? h > 0 : h < 0;
    markah += 8 * (Math.abs(h) < 1e-9 ? 0.5 : selari ? 1 : 0);
    nota.push(`MACD ${h > 0 ? "+" : ""}${h.toFixed(5)}`);
  } else {
    markah += 4;
  }

  // ADX + arah DI (7)
  if (ind1h && ind1h.adx != null) {
    const a = ind1h.adx;
    let base = a >= 25 ? 7 : a >= 20 ? 5 : a >= 15 ? 3 : 1;
    const diSelari =
      ind1h.plusDI != null && ind1h.minusDI != null
        ? arah === "Buy"
          ? ind1h.plusDI > ind1h.minusDI
          : ind1h.minusDI > ind1h.plusDI
        : true;
    if (!diSelari) base *= 0.5;
    markah += base;
    nota.push(`ADX ${a.toFixed(0)}`);
  } else {
    markah += 3.5;
  }

  // Konfluens MTF (7): berapa TF letak harga di sisi arah pada EMA200
  const hadir = inds.filter((i) => i && i.harga != null && i.ema200 != null);
  if (hadir.length) {
    const setuju = hadir.filter((i) =>
      arah === "Buy" ? i.harga > i.ema200 : i.harga < i.ema200
    ).length;
    markah += 7 * (setuju / hadir.length);
    nota.push(`${setuju}/${hadir.length} TF > EMA200`);
  } else {
    markah += 3.5;
  }

  return {
    markah: b1(jepit(markah, 0, maxMarkah)),
    sebab: nota.join(", ") || "Data teknikal terhad.",
  };
}

// Gred Kualiti Dagangan dari skor.
export function gredDariSkor(skor) {
  if (skor >= 95) return "A+";
  if (skor >= 85) return "A";
  if (skor >= 70) return "B";
  if (skor >= 50) return "C";
  return "D";
}

// Kira skor penuh + verdict + gred + pecahan + peraturan menyala.
export function skorSetup(input) {
  const arah = input.arah || arahDominan(input);
  const inds = [input.ind1h, input.ind4h, input.indD];

  const baldi = {
    trend: skorTrend(inds, arah, 20),
    strength: skorKekuatan(input.kekuatan, input.pairId, arah, 15),
    atr: skorAtr(input.ind1h, 10),
    sesi: skorSesi(input.statusSesi, 10),
    berita: skorBerita(input.berita, 10),
    smc: skorSmc(input.smc, arah, 5),
    teknikal: skorTeknikal(input.ind1h, inds, arah, 30),
  };

  const skor = b1(Object.values(baldi).reduce((s, b) => s + b.markah, 0));
  const gred = gredDariSkor(skor);

  const gateGagal = !!input.pasaranTutup || !!(input.berita && input.berita.bahaya);
  let verdict;
  if (gateGagal) verdict = "WAIT";
  else if (skor >= AMBANG_MASUK) verdict = arah === "Buy" ? "BUY" : "SELL";
  else verdict = "WAIT";

  const firedRules = Object.entries(baldi).map(([id, b]) => ({
    id,
    label: LABEL[id],
    markah: b.markah,
    sebab: b.sebab,
  }));

  return {
    skor,
    gred,
    verdict,
    arah,
    arahCadangan: arahDominan(input),
    pecahan: Object.fromEntries(Object.entries(baldi).map(([k, v]) => [k, v.markah])),
    firedRules,
    gateGagal,
  };
}

const LABEL = {
  trend: "Trend",
  strength: "Kekuatan",
  atr: "Volatiliti (ATR)",
  sesi: "Sesi",
  berita: "Berita",
  smc: "Smart Money",
  teknikal: "Teknikal",
};

// Susun prosa penerangan Bahasa Melayu ("AI Coach" deterministik).
export function jelaskan(hasil) {
  if (!hasil) return "";
  const teratas = [...hasil.firedRules].sort((a, b) => b.markah - a.markah).slice(0, 4);
  const ayat = teratas.map((r) => `${r.label}: ${r.sebab} (${r.markah})`).join(" ");
  const gate = hasil.gateGagal ? " Amaran: gate keselamatan aktif — tunggu." : "";
  return `Skor ${hasil.skor} (Gred ${hasil.gred}). ${ayat}${gate} Cadangan: ${hasil.verdict}.`;
}
