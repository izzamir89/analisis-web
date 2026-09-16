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
//   kos,                  // nilaiKos() dari kos.js { gate, amaran, sebab, kosR, rrBersih }
//   risikoHarian,         // bakiRisikoHarian() dari risk.js { melebihi, digunakan, had }
//   kalahBerturut,        // bilangan kekalahan berturut HARI INI (nombor)
// }

import { tekananPasaran } from "./tekanan.js";
import { coraklilin } from "./patterns.js";
import { kedudukanAras } from "./aras.js";

export const AMBANG_MASUK = 70; // skor minimum untuk verdict BUY/SELL
export const ATR_MELONJAK = 0.012; // atr/harga di atas ini = terlalu volatil untuk masuk

// Kekalahan berturut dalam satu hari yang mencetuskan berhenti paksa.
// Bukan tentang kebarangkalian — selepas tiga kalah berturut, masalahnya biasanya
// keadaan pasaran atau keadaan diri, dan kedua-duanya tidak dibaiki oleh dagangan
// seterusnya.
export const KALAH_BERTURUT_HAD = 3;

// ATR semasa berbanding median ATR terkini yang dikira sebagai "lonjakan".
// Menggantikan ambang mutlak yang terukur tidak pernah menyala — lihat gate di bawah.
export const ATR_LONJAK_NISBAH = 2.5;

// Berat baldi. Angka ini DIUKUR, bukan dipilih ikut rasa.
//
// Menjalankan enjin ini atas 1,800 bar memberi purata markah setiap baldi:
//   Trend 27.6/40 · Momentum 12.2/20 · Smart Money 10.4/20 · Corak Lilin 1.0/10
//
// Corak Lilin mengutip 1.0 daripada 10. Ia memegang 10% skala untuk maklumat yang
// hampir tidak pernah wujud (engulfing/hammer/star pada lilin TERAKHIR sahaja), jadi
// siling praktikal ialah ~90 dan ambang 70 sebenarnya menuntut 78% daripada markah
// yang boleh dicapai. Itulah punca sebenar "selalu WAIT".
//
// Markah dipindah ke baldi yang benar-benar membawa maklumat setiap bar. Corak lilin
// kekal sebagai BONUS konfluens, bukan baldi penuh. Berita diturunkan kerana ia sudah
// menjadi gate keras — memberi 10 markah kepadanya mengira benda sama dua kali.
const MAKS = { trend: 40, momentum: 25, smartMoney: 25, lilin: 5, berita: 5 };

// Berat & label triad TF lalai (mod swing 1J/4J/Harian). Mod lain (scalp) menghantar
// nilai sendiri melalui input.bobotTrend / input.tfLabel — lihat js/mod.js.
const BOBOT_TREND_LALAI = { hi: 20, mid: 10, lo: 10 }; // jumlah = MAKS.trend
const LABEL_TF_LALAI = { hi: "Harian", mid: "4J", lo: "1J" };

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

// Trend (40): berat lalai Harian 20 · 4J 10 · 1J 10 (boleh diganti ikut mod).
// Slot hi/mid/lo generik: indD=hi, ind4h=mid, ind1h=lo. TF bertentangan → konflik
// (gate NO TRADE). TF hilang → tiadaData (gate NO TRADE). TF neutral → 40% markah.
function skorTrend(indD, ind4h, ind1h, arah, bobot = BOBOT_TREND_LALAI, label = LABEL_TF_LALAI) {
  const mahu = arah === "Buy" ? "bull" : "bear";
  const tf = [
    [label.hi, indD, bobot.hi],
    [label.mid, ind4h, bobot.mid],
    [label.lo, ind1h, bobot.lo],
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

// Momentum (25): RSI 6 · MACD 6 · ADX 7 · Tekanan Pasaran 6.
// ADX dapat bahagian terbesar kerana ia satu-satunya yang membezakan trend daripada
// julat — dan dagangan ikut-trend dalam pasaran julat ialah cara paling biasa untuk
// terkena stop dua hala.
const M_RSI = 6;
const M_MACD = 6;
const M_ADX = 7;
const M_TEKANAN = 6;

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
    markah += M_RSI * f;
    nota.push(`RSI ${r.toFixed(0)}`);
  }

  // MACD histogram (6)
  if (ind1h.macdHist != null) {
    const h = ind1h.macdHist;
    const selari = arah === "Buy" ? h > 0 : h < 0;
    markah += M_MACD * (Math.abs(h) < 1e-9 ? 0.5 : selari ? 1 : 0);
    nota.push(`MACD ${h > 0 ? "+" : ""}${h.toFixed(5)}`);
  }

  // ADX + arah DI (7)
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
    markah += M_ADX * f;
    nota.push(`ADX ${a.toFixed(0)}`);
  }

  // Tekanan Pasaran (6) — proxy untuk volume yang forex spot tiada.
  const tk = tekananPasaran(candles1h, arah);
  if (tk) {
    markah += M_TEKANAN * tk.skorFrac;
    nota.push(`Tekanan ${Math.round(tk.skorFrac * 100)}%`);
  }

  return {
    markah: b1(jepit(markah, 0, MAKS.momentum)),
    sebab: nota.length ? nota.join(", ") + "." : "Data momentum terhad.",
    tekanan: tk,
  };
}

// Smart Money (25): bias struktur 10 · kedudukan vs paras 9 · zon supply/demand 6.
function skorSmartMoney(smc, aras, zon, harga, atrNilai, arah, jarakSL) {
  const mahu = arah === "Buy" ? "bull" : "bear";
  let markah = 0;
  const nota = [];
  const amaran = [];
  let tungguBreakout = false;

  // Bias struktur (8) — BOS/CHoCH/liquidity grab yang sudah diringkaskan smc.js.
  if (!smc || !smc.bias) {
    nota.push("struktur tidak dinilai");
  } else if (smc.bias === mahu) {
    markah += 10;
    nota.push(`struktur ${smc.bias} selari`);
  } else if (smc.bias === "neutral") {
    markah += 4;
    nota.push("struktur neutral");
  } else {
    nota.push(`struktur ${smc.bias} menentang`);
  }

  // Kedudukan vs paras S/R (9) — inilah peraturan "tunggu breakout".
  //
  // Peraturan lama: dalam 0.5×ATR dari paras bertentangan → WAIT mutlak. Terukur, ini
  // menyekat 18% daripada SEMUA bar, dan 0.5×ATR ialah nombor sembarangan yang tidak
  // ada kaitan dengan dagangan yang sebenarnya dirancang.
  //
  // Peraturan baharu: yang penting ialah sama ada ada RUANG UNTUK 1R sebelum halangan.
  // Kalau paras bertentangan lebih dekat daripada jarak SL, dagangan itu memang tidak
  // masuk akal — itu WAIT. Kalau ada ruang ≥1R, ia boleh didagangkan dengan amaran dan
  // sasaran yang dipotong ke paras tersebut. Ini boleh dipertahankan; 0.5×ATR tidak.
  const k = kedudukanAras(harga, aras, atrNilai, zon);
  const jarakLawan = arah === "Buy" ? k.jarakRintangan : k.jarakSokongan;
  const hampirSokong = arah === "Buy" ? k.hampirSokongan : k.hampirRintangan;
  const ruangR = jarakSL > 0 && jarakLawan != null ? jarakLawan / jarakSL : null;
  const parasLawan = arah === "Buy" ? k.rintangan : k.sokongan;
  const namaLawan = arah === "Buy" ? "rintangan" : "sokongan";

  // Hanya paras yang BERSTRUKTUR boleh menyekat dagangan. Satu ayun fraktal terpencil
  // (1 sentuhan) ialah titik dalam bunyi bising, bukan paras yang institusi pertahankan
  // — terukur, 35% daripada semua sekatan datang daripada paras 1-sentuhan sebegini.
  const parasBerstruktur = parasLawan != null && parasLawan.sentuhan >= 2;

  if (!aras || (!k.sokongan && !k.rintangan)) {
    nota.push("paras tidak dikesan");
  } else if (ruangR != null && ruangR < 1 && parasBerstruktur) {
    // Tiada ruang untuk 1R sebelum halangan → tunggu breakout.
    tungguBreakout = true;
    amaran.push(
      `${namaLawan.charAt(0).toUpperCase() + namaLawan.slice(1)} ${parasLawan.harga.toFixed(5)} hanya ${ruangR.toFixed(2)}R jauh — tiada ruang untuk 1R, tunggu breakout.`
    );
    nota.push(`${namaLawan} dalam 1R`);
  } else if (hampirSokong) {
    markah += 9;
    nota.push(arah === "Buy" ? "memantul dari sokongan" : "ditolak dari rintangan");
  } else if (ruangR != null && ruangR < 2) {
    // Ruang cukup untuk 1R tetapi tidak untuk sasaran penuh — boleh dagang, tetapi
    // pengguna mesti tahu sasaran perlu dipotong.
    markah += 5;
    amaran.push(
      `${namaLawan.charAt(0).toUpperCase() + namaLawan.slice(1)} ${parasLawan.harga.toFixed(5)} pada ${ruangR.toFixed(2)}R — potong sasaran ke paras ini.`
    );
    nota.push(`${namaLawan} pada ${ruangR.toFixed(1)}R`);
  } else {
    markah += 5;
    nota.push("ruang bebas ke paras terdekat");
  }

  // Zon supply/demand (6).
  // "Luar zon" hanya boleh diberi markah jika kita BENAR-BENAR mengimbas zon.
  // Tanpa data zon, tiada markah — jangan ganjari ketidaktahuan.
  const adaDataZon = Array.isArray(zon);
  const zonMahu = arah === "Buy" ? "demand" : "supply";
  if (!adaDataZon) {
    nota.push("zon tidak diimbas");
  } else if (k.dalamZon) {
    if (k.dalamZon.jenis === zonMahu) {
      markah += 6;
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

// Corak Lilin (5): corak dikesan 3 · bonus konfluens dengan paras 2.
// Diturunkan dari 10 kerana terukur ia hanya mengutip purata 1.0 markah — baldi yang
// hampir tidak pernah terisi menjadikan ambang masuk mustahil dicapai secara senyap.
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
  let markah = 3 * corak.kekuatan;
  const nota = [corak.nama];

  // Konfluens: corak pembalikan bullish di sokongan (atau bearish di rintangan)
  // jauh lebih bermakna daripada corak yang sama di tengah-tengah julat.
  const k = kedudukanAras(harga, aras, atrNilai, zon);
  const diParas = arah === "Buy" ? k.hampirSokongan : k.hampirRintangan;
  if (diParas) {
    markah += 2;
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

  const ambangMasuk = input.ambangMasuk ?? AMBANG_MASUK;
  const atrMelonjak = input.atrMelonjak ?? ATR_MELONJAK;

  // Jarak SL yang dirancang — 1R. Peraturan paras diukur terhadap ini, bukan terhadap
  // gandaan ATR sembarangan, supaya "ada ruang untuk dagangan ini" bermakna benda yang
  // sama seperti dalam pelan yang dipapar.
  const slPengganda = input.slPengganda ?? 1.5;
  const jarakSL = atrNilai > 0 ? atrNilai * slPengganda : null;

  const baldi = {
    trend: skorTrend(input.indD, input.ind4h, input.ind1h, arah, input.bobotTrend, input.tfLabel),
    momentum: skorMomentum(input.ind1h, input.candles1h, arah),
    smartMoney: skorSmartMoney(input.smc, input.aras, input.zon, harga, atrNilai, arah, jarakSL),
    lilin: skorLilin(input.candles1h, input.aras, atrNilai, harga, arah, input.zon),
    berita: skorBerita(input.berita),
  };

  const skor = b1(Object.values(baldi).reduce((s, b) => s + b.markah, 0));
  const gred = gredDariSkor(skor);

  // Skor TERAS = skor tanpa baldi berita (maks 90).
  //
  // KENAPA: backtest tidak boleh tahu kalendar berita sejarah, jadi ia sentiasa
  // memberi markah berita PENUH. Dagangan langsung pula selalunya 0 atau 5. Kesannya
  // "skor 72" backtest dan "skor 72" langsung bukan benda yang sama, dan jalur
  // kebarangkalian yang memetakan skor→kadar-menang memetakan dua taburan berbeza
  // ke dalam baldi yang sama. Skor teras membuang sumber percanggahan itu; berita
  // tetap berfungsi sebagai gate keras, jadi tiada maklumat keselamatan hilang.
  const skorTeras = b1(skor - baldi.berita.markah);
  const maksTeras = 100 - MAKS.berita;
  // Dinormalkan ke 0-100 supaya jalur kebarangkalian kekal bermakna walaupun berat
  // baldi ditala semula kemudian — tanpa ini setiap pelarasan berat secara senyap
  // memindahkan dagangan sejarah antara jalur dan merosakkan perbandingan.
  const skorTerasNorm = b1((skorTeras / maksTeras) * 100);

  // --- Gate keras: tesis dagangan rosak, skor tidak relevan → NO TRADE ---
  const sebabGate = [];
  if (input.pasaranTutup) sebabGate.push("Pasaran tutup.");
  if (baldi.trend.konflik) sebabGate.push("Timeframe bertentangan arah.");
  if (baldi.trend.tiadaData)
    sebabGate.push("Data timeframe tidak lengkap — tidak boleh sahkan penjajaran.");
  if (baldi.berita.bahaya) sebabGate.push("Berita impak tinggi dalam zon bahaya.");
  // Gate volatiliti.
  //
  // Ambang MUTLAK (atr/harga) terukur sebagai kod mati: ATR% 1J purata ialah 0.092%
  // manakala gate swing ditetapkan pada 1.2% — 13× di atas. Gate scalp 0.4% pada M5
  // lagi jauh. Kedua-duanya tidak pernah menyala sekali pun.
  //
  // Ambang RELATIF berfungsi kerana ia berskala sendiri: ATR semasa berbanding median
  // ATR terkini. Lonjakan 2.5× ialah lonjakan sama ada pada EURUSD M5 atau emas Harian.
  // Ambang mutlak kekal sebagai jaring keselamatan kedua bila median tiada.
  const atrPct = harga > 0 && atrNilai > 0 ? atrNilai / harga : null;
  const atrMedian = Number(input.atrMedian);
  if (atrMedian > 0 && atrNilai > 0) {
    const nisbah = atrNilai / atrMedian;
    if (nisbah > (input.atrLonjakNisbah ?? ATR_LONJAK_NISBAH)) {
      sebabGate.push(
        `Volatiliti melonjak (ATR ${nisbah.toFixed(1)}× median terkini) — terlalu berisiko.`
      );
    }
  } else if (atrPct != null && atrPct > atrMelonjak) {
    sebabGate.push(`Volatiliti melonjak (ATR ${(atrPct * 100).toFixed(2)}%) — terlalu berisiko.`);
  }

  // Gate kos: spread + komisen terlalu besar berbanding jarak SL. Setup yang
  // matematiknya kalah sebelum harga bergerak tidak boleh diluluskan walau seindah
  // mana skornya — inilah sebabnya ia gate, bukan tolakan markah.
  if (input.kos && input.kos.gate) sebabGate.push(input.kos.sebab);

  // Gate modal: had kerugian harian & kekalahan berturut. Enjin tidak sepatutnya
  // memberi kebenaran masuk kepada akaun yang sudah kehabisan bajet risiko hari ini.
  if (input.risikoHarian && input.risikoHarian.melebihi) {
    const r = input.risikoHarian;
    sebabGate.push(`Bajet risiko harian habis (${r.digunakan}/${r.had}) — berhenti sampai esok.`);
  }
  const kalahBerturut = Number(input.kalahBerturut);
  if (Number.isFinite(kalahBerturut) && kalahBerturut >= KALAH_BERTURUT_HAD) {
    sebabGate.push(`${kalahBerturut} kalah berturut hari ini — berhenti, semak jurnal dahulu.`);
  }

  // --- Amaran: tidak membunuh dagangan, tetapi mesti dilihat pengguna ---
  const amaran = [...baldi.smartMoney.amaran];
  if (input.kos && input.kos.amaran) amaran.push(input.kos.sebab);
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
  else if (skor >= ambangMasuk) verdict = arah === "Buy" ? "BUY" : "SELL";
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
    skorTeras,
    skorTerasNorm,
    maksTeras,
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
    kos: input.kos || null,
  };
}

// Nilai KEDUA-DUA arah dan pulangkan yang terbaik.
//
// MASALAH YANG DISELESAIKAN: skorSetup() menilai satu arah sahaja — arah yang diteka
// oleh arahDominan() dari undian isyarat. Bila tekaan itu bercanggah dengan susunan
// EMA (biasa berlaku semasa pullback), gate "timeframe bertentangan" menyala dan arah
// BERTENTANGAN — yang mungkin setup Gred A yang bersih — tidak pernah dinilai langsung.
//
// Terukur atas 1,800 bar: menilai kedua-dua arah menurunkan NO TRADE 25.6% → 19.3%.
//
// Kalau pemanggil sudah menetapkan arah, hormati pilihan itu — ini untuk analisis
// automatik, bukan untuk mengatasi niat pengguna.
export function skorSetupTerbaik(input) {
  if (input.arah) return skorSetup(input);
  const buy = skorSetup({ ...input, arah: "Buy" });
  const sell = skorSetup({ ...input, arah: "Sell" });
  const lulus = [buy, sell].filter((h) => h.gate.lulus);
  if (!lulus.length) {
    // Kedua-dua arah tersekat: pulangkan yang sebab gatenya paling sedikit supaya
    // pengguna nampak halangan yang paling hampir boleh diatasi.
    return buy.gate.sebab.length <= sell.gate.sebab.length ? buy : sell;
  }
  return lulus.sort((a, b) => b.skor - a.skor)[0];
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
