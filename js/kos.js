// Kos dagangan (spread + komisen) — 100% tulen untuk bahagian matematik, I/O hanya
// pada baca/simpan tetapan.
//
// KENAPA MODUL INI WUJUD: sebelum ini app langsung tidak memodelkan kos. Untuk swing
// (SL ~15 pip) spread 1 pip hanyalah 7% daripada risiko — boleh diabaikan. Untuk scalp
// M5 (SL = 1.0 × ATR ≈ 2-4 pip) spread yang SAMA memakan ~30% daripada 1R, dan sistem
// yang nampak positif pada kertas menjadi negatif di akaun sebenar.
//
// Kos disimpan dalam PIP supaya ia bebas dari saiz lot: 1 pip ialah 1 pip sama ada
// awak dagang 0.01 lot atau 10 lot. Komisen ditukar ke pip-setara oleh pengguna
// (cth $7/lot pusing-balik pada EURUSD ≈ 0.7 pip) supaya kedua-duanya boleh dijumlah.

import { bacaJSON, simpanJSON } from "./store.js";
import { sesiAktif } from "./sessions.js";

const KUNCI = "kos_dagangan";
const KUNCI_BACAAN = "kos_bacaan";

// Bacaan minimum bagi satu sesi sebelum mediannya dipercayai. Satu bacaan boleh jadi
// tersalah taip atau detik pelik; dua sudah memberi sedikit perlindungan.
export const MIN_BACAAN_SESI = 2;

// Ambang: kos berbanding 1R (jarak SL).
// > 0.25 → gate keras. Pada RR 1.5, kos 25% menolak expectancy sistem 60%-menang
//          ke bawah sifar. Ini bukan "kurang optimum", ini matematik yang kalah.
// > 0.15 → amaran sahaja; masih boleh menang tapi jidar sudah nipis.
export const KOS_GATE = 0.25;
export const KOS_AMARAN = 0.15;

// Spread lalai (pip) — ANGGARAN BERHEMAT, bukan kadar broker sebenar.
// Sengaja dipilih di hujung tinggi julat biasa: lebih baik app terlalu berhati-hati
// daripada memberi awak kebenaran masuk yang matematiknya tidak wujud.
// Pengguna WAJIB betulkan ikut broker sendiri — UI menandakannya "anggaran".
export const SPREAD_LALAI = {
  EURUSD: 1.0,
  GBPUSD: 1.0,
  USDJPY: 1.0,
  USDCHF: 1.2,
  AUDUSD: 1.0,
  USDCAD: 1.2,
  NZDUSD: 1.5,
  XAUUSD: 3.0, // pip emas = 0.1 → 3.0 pip = $0.30 sespread
};

// ---- Tetapan (I/O) ----

// Pulang { spread: {PAIR: pip}, komisen: {PAIR: pip}, disahkan: boolean }.
// `disahkan` = pengguna sudah menyemak nilai ini terhadap broker sebenar.
export function bacaKos() {
  const t = bacaJSON(KUNCI, {});
  return {
    spread: { ...SPREAD_LALAI, ...(t && t.spread) },
    komisen: { ...(t && t.komisen) },
    disahkan: !!(t && t.disahkan),
  };
}

export function simpanKos(t) {
  const semasa = bacaKos();
  simpanJSON(KUNCI, {
    spread: { ...semasa.spread, ...(t && t.spread) },
    komisen: { ...semasa.komisen, ...(t && t.komisen) },
    disahkan: t && t.disahkan != null ? !!t.disahkan : semasa.disahkan,
  });
}

// ---- Bacaan spread yang diukur ----
//
// KENAPA INI WUJUD: broker menerbitkan "spread dari 0.8 pip". Perkataan "dari" membawa
// semua beban — itu kes terbaik pada masa paling tenang, bukan apa yang awak bayar.
// Dan spread tidak tetap: ia mungkin 0.8 semasa overlap London-NY dan 4.0 pada pukul 3
// pagi atau ketika berita. Satu nombor statik akan sama ada menyekat dagangan yang baik
// (jika ditetapkan pada kes terburuk) atau meluluskan yang buruk (jika pada kes terbaik).
//
// Jadi: rakam bacaan sebenar, ditandai mengikut sesi, dan gunakan bacaan sesi SEMASA
// semasa menilai setup. Sesi yang belum diukur jatuh kembali ke bacaan terburuk yang
// pernah direkod — jangan andaikan kes terbaik untuk keadaan yang awak tak pernah semak.

// Label sesi untuk penandaan bacaan. Menggunakan semula sesiAktif() supaya tiada takrifan
// sesi kedua wujud dalam app ini.
export function sesiLabel(now = new Date()) {
  const aktif = sesiAktif(now);
  if (aktif.includes("London") && aktif.includes("New York")) return "London-NY";
  if (aktif.length) return aktif[0];
  return "Luar sesi";
}

export function bacaBacaan(pairId = null) {
  const semua = bacaJSON(KUNCI_BACAAN, []);
  const list = Array.isArray(semua) ? semua : [];
  return pairId ? list.filter((b) => b.pairId === pairId) : list;
}

// Rakam satu bacaan spread yang dibaca dari platform broker.
export function rekodSpread(pairId, pip, now = new Date()) {
  const nilai = Number(pip);
  if (!Number.isFinite(nilai) || nilai < 0) return null;
  const b = {
    pairId,
    pip: nilai,
    sesi: sesiLabel(now),
    ts: (now instanceof Date ? now : new Date(now)).toISOString(),
  };
  simpanJSON(KUNCI_BACAAN, [...bacaBacaan(), b]);
  return b;
}

export function padamBacaan(pairId = null) {
  if (!pairId) {
    simpanJSON(KUNCI_BACAAN, []);
    return;
  }
  simpanJSON(
    KUNCI_BACAAN,
    bacaBacaan().filter((b) => b.pairId !== pairId)
  );
}

// Median — dipilih berbanding purata kerana satu bacaan tersalah taip (30 dan bukan 3.0)
// akan mencemarkan purata tetapi hampir tidak menggerakkan median. Tulen.
export function median(nilai) {
  const a = nilai.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const t = Math.floor(a.length / 2);
  return a.length % 2 ? a[t] : (a[t - 1] + a[t]) / 2;
}

// Ringkaskan bacaan mengikut sesi. Tulen — terima senarai bacaan.
export function ringkasBacaan(bacaan) {
  const ikutSesi = {};
  for (const b of Array.isArray(bacaan) ? bacaan : []) {
    if (!b || !Number.isFinite(Number(b.pip))) continue;
    (ikutSesi[b.sesi] ||= []).push(Number(b.pip));
  }
  const keluar = {};
  for (const [sesi, nilai] of Object.entries(ikutSesi)) {
    keluar[sesi] = {
      n: nilai.length,
      median: median(nilai),
      min: Math.min(...nilai),
      maks: Math.max(...nilai),
      cukup: nilai.length >= MIN_BACAAN_SESI,
    };
  }
  const semua = (bacaan || []).map((b) => Number(b.pip)).filter(Number.isFinite);
  return {
    ikutSesi: keluar,
    n: semua.length,
    maks: semua.length ? Math.max(...semua) : null,
    median: median(semua),
  };
}

// Spread berkesan untuk MASA INI. Tulen — terima bacaan & spread lalai.
//
// Keutamaan:
//   1. Median bacaan sesi semasa (≥ MIN_BACAAN_SESI bacaan) — paling tepat.
//   2. Bacaan TERBURUK yang pernah direkod — konservatif untuk sesi belum diukur.
//   3. Spread tetapan/lalai — bila tiada apa-apa diukur.
export function spreadBerkesan(bacaan, spreadTetapan, now = new Date()) {
  const sesi = sesiLabel(now);
  const r = ringkasBacaan(bacaan);
  const s = r.ikutSesi[sesi];
  if (s && s.cukup) return { pip: s.median, sumber: "diukur-sesi", sesi, n: s.n };
  if (r.maks != null) return { pip: r.maks, sumber: "maks-diukur", sesi, n: r.n };
  return { pip: Number(spreadTetapan) || 0, sumber: "lalai", sesi, n: 0 };
}

// Jumlah kos pusing-balik dalam pip bagi satu pasangan, untuk masa `now`.
//
// Bacaan yang diukur mengatasi spread tetapan apabila ia wujud — nombor yang awak baca
// dari platform sendiri sentiasa lebih baik daripada anggaran kami atau "dari X pip"
// broker. Komisen sentiasa datang dari tetapan: ia tetap dan tidak boleh dibaca dari
// paparan spread.
export function kosPip(pairId, tetapan = bacaKos(), now = new Date(), bacaan = null) {
  const s = Number(tetapan.spread && tetapan.spread[pairId]);
  const asas = Number.isFinite(s) && s > 0 ? s : 0;
  const b = bacaan ?? bacaBacaan(pairId);
  const berkesan = spreadBerkesan(b, asas, now);
  const k = Number(tetapan.komisen && tetapan.komisen[pairId]);
  return berkesan.pip + (Number.isFinite(k) && k > 0 ? k : 0);
}

// Seperti kosPip tetapi turut memulangkan ASAL nombor itu, untuk paparan UI.
export function kosPipTerperinci(pairId, tetapan = bacaKos(), now = new Date(), bacaan = null) {
  const s = Number(tetapan.spread && tetapan.spread[pairId]);
  const asas = Number.isFinite(s) && s > 0 ? s : 0;
  const b = bacaan ?? bacaBacaan(pairId);
  const berkesan = spreadBerkesan(b, asas, now);
  const k = Number(tetapan.komisen && tetapan.komisen[pairId]);
  const komisen = Number.isFinite(k) && k > 0 ? k : 0;
  return { jumlah: berkesan.pip + komisen, spread: berkesan, komisen };
}

// ---- Matematik (tulen) ----

// Kos sebagai pecahan 1R. slPip ialah jarak stop dalam pip.
// Pulang null bila slPip tidak sah — pemanggil layan sebagai "tidak diketahui".
export function kosDalamR(slPip, kosPipNilai) {
  const sl = Number(slPip);
  const kos = Number(kosPipNilai);
  if (!(sl > 0) || !Number.isFinite(kos) || kos < 0) return null;
  return kos / sl;
}

// R:R bersih selepas kos.
//
// Kos dibayar DUA KALI dalam istilah R: ia menolak sasaran (awak perlu bergerak
// lebih jauh untuk sampai TP) dan menambah kerugian (SL kena lebih awal). Jadi
// keuntungan bersih = rr − kosR manakala kerugian bersih = 1 + kosR.
export function rrBersih(rr, kosR) {
  const r = Number(rr);
  const k = Number(kosR);
  if (!(r > 0) || !Number.isFinite(k) || k < 0) return null;
  return (r - k) / (1 + k);
}

// Kadar menang pulang-modal bagi satu R:R bersih — "berapa % perlu menang sekadar
// tidak rugi". Alat semak kewarasan yang paling jujur untuk sesuatu setup.
export function kadarPulangModal(rrBersihNilai) {
  const r = Number(rrBersihNilai);
  if (!(r > 0)) return null;
  return 1 / (1 + r);
}

// Penilaian penuh untuk satu setup — inilah yang dipanggil scoring.js & UI.
// Pulang { kosPip, kosR, rrBersih, kadarPulangModal, gate, amaran, sebab }.
export function nilaiKos({ pairId, slPip, rr, tetapan, now = new Date(), bacaan = null }) {
  const t = tetapan || bacaKos();
  const perincian = kosPipTerperinci(pairId, t, now, bacaan);
  const kos = perincian.jumlah;
  const kosR = kosDalamR(slPip, kos);
  if (kosR == null) {
    return {
      kosPip: kos,
      spread: perincian.spread,
      komisen: perincian.komisen,
      kosR: null,
      rrBersih: null,
      kadarPulangModal: null,
      gate: false,
      amaran: false,
      sebab: "Kos tidak dapat dinilai (jarak SL tidak diketahui).",
    };
  }
  const bersih = rrBersih(rr, kosR);
  const pm = kadarPulangModal(bersih);
  const pct = Math.round(kosR * 100);
  const gate = kosR > KOS_GATE;
  const amaran = !gate && kosR > KOS_AMARAN;
  // Nyatakan dari mana nombor spread itu datang. "Kos 1.4 pip" yang diukur pada sesi
  // ini bermakna sesuatu yang sangat berbeza daripada "1.4 pip" yang kami teka.
  const asal = {
    "diukur-sesi": `diukur ${perincian.spread.sesi}`,
    "maks-diukur": `terburuk diukur — ${perincian.spread.sesi} belum diukur`,
    lalai: "anggaran, belum diukur",
  }[perincian.spread.sumber];

  return {
    kosPip: kos,
    spread: perincian.spread,
    komisen: perincian.komisen,
    kosR,
    rrBersih: bersih,
    kadarPulangModal: pm,
    gate,
    amaran,
    sebab: gate
      ? `Kos (spread+komisen ${kos.toFixed(1)} pip, ${asal}) ialah ${pct}% daripada risiko — SL terlalu rapat untuk berbaloi.`
      : amaran
        ? `Kos ${kos.toFixed(1)} pip (${asal}) = ${pct}% daripada risiko — jidar nipis${pm != null ? `, perlu menang ${Math.round(pm * 100)}% sekadar pulang modal` : ""}.`
        : `Kos ${kos.toFixed(1)} pip (${asal}) = ${pct}% daripada risiko.`,
  };
}
