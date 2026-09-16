// Kebarangkalian berjaya dari BACKTEST SEBENAR — bukan lengkung rekaan dari skor.
//
// Kenapa ini penting: mudah untuk memetakan "skor 88" → "88% peluang menang" dan ia
// nampak meyakinkan. Nombor itu tidak bermakna apa-apa. Skor ialah jumlah markah
// peraturan; kebarangkalian ialah kekerapan sejarah. Menyamakan keduanya bermakna
// menipu diri sendiri dengan angka yang kelihatan tepat.
//
// Jadi: kumpulkan keputusan backtest sebenar ke dalam jalur skor, dan lapor kadar
// menang jalur itu berserta SAIZ SAMPEL. Bawah minimum → katakan "tidak mencukupi".
//
// BATASAN JUJUR: ini kekal in-sample. Ambang dan pemberat direka oleh manusia,
// kemudian diuji pada data yang sama — kadar menang optimistik secara sistematik.
// Ia mengukur "prestasi sejarah pada data ini", bukan ramalan.

import { bacaJSON, simpanJSON } from "./store.js";

// v2: kunci per-MOD, jalur atas SKOR TERAS (tanpa berita, maks 90).
// Snapshot v1 sengaja tidak dimigrasi — ia dikumpul di bawah takrifan jalur yang
// berbeza DAN tercemar oleh dua pepijat (mod bercampur, sampel menggelembung), jadi
// membawanya ke hadapan bermakna membawa nombor yang salah ke hadapan.
const KUNCI = "bt_jalur_v2";

// Jalur atas skor teras TERNORMAL (0-100). Normalisasi bermakna jalur ini kekal
// bermakna walaupun berat baldi ditala semula kemudian — tanpanya setiap pelarasan
// berat secara senyap memindahkan dagangan sejarah antara jalur.
export const JALUR = [
  [60, 69],
  [70, 79],
  [80, 89],
  [90, 100],
];
export const MIN_SAMPEL = 30;

export function namaJalur(skor) {
  for (const [bawah, atas] of JALUR) {
    if (skor >= bawah && skor <= atas) return `${bawah}-${atas}`;
  }
  return null;
}

// Kumpulkan dagangan backtest ikut jalur skor TERAS. Tulen.
// Dagangan tanpa skor atau di luar semua jalur diabaikan.
export function kumpulJalur(trades) {
  const keluar = {};
  for (const [bawah, atas] of JALUR) keluar[`${bawah}-${atas}`] = { n: 0, menang: 0 };
  for (const t of Array.isArray(trades) ? trades : []) {
    if (!t) continue;
    // Utamakan skor teras TERNORMAL; jatuh balik ke teras mentah, kemudian skor penuh.
    const nilai =
      typeof t.skorTerasNorm === "number"
        ? t.skorTerasNorm
        : typeof t.skorTeras === "number"
          ? t.skorTeras
          : t.skor;
    if (typeof nilai !== "number") continue;
    const nama = namaJalur(nilai);
    if (!nama) continue;
    keluar[nama].n += 1;
    if (t.hasil === "win") keluar[nama].menang += 1;
  }
  return keluar;
}

// Cantum banyak snapshot jadi satu agregat. Tulen.
// Snapshot ialah objek { "70-79": {n, menang}, ... }.
export function gabungSnapshot(snapshots) {
  const keluar = {};
  for (const [bawah, atas] of JALUR) keluar[`${bawah}-${atas}`] = { n: 0, menang: 0 };
  for (const s of Array.isArray(snapshots) ? snapshots : []) {
    if (!s) continue;
    for (const k of Object.keys(keluar)) {
      if (!s[k]) continue;
      keluar[k].n += Number(s[k].n) || 0;
      keluar[k].menang += Number(s[k].menang) || 0;
    }
  }
  return keluar;
}

// Selang keyakinan Wilson 95% untuk perkadaran.
// Dipilih berbanding selang normal kerana ia kekal waras pada sampel kecil dan
// tidak pernah menghasilkan sempadan di luar 0..1 — betul-betul keadaan kita.
export function kadarWilson(menang, n) {
  if (!(n > 0)) return { kadar: null, bawah: null, atas: null };
  const z = 1.96;
  const p = menang / n;
  const penyebut = 1 + (z * z) / n;
  const tengah = p + (z * z) / (2 * n);
  const sebaran = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    kadar: p,
    bawah: Math.max(0, (tengah - sebaran) / penyebut),
    atas: Math.min(1, (tengah + sebaran) / penyebut),
  };
}

// --- Storan (I/O) ---
//
// Dikunci "{modId}:{pairId}" — DUA pembetulan berbanding v1:
//
//  1. `modId` dalam kunci, dan agregat ditapis mengikutnya. Sebelum ini dagangan
//     scalp M5 dan swing Harian jatuh ke dalam kolam yang sama, jadi "kadar menang
//     62%" pada skrin Swing EURUSD boleh sebenarnya berasal dari Scalp XAUUSD.
//
//  2. Cap masa data DIBUANG dari kunci. Dalam v1 kunci ialah "{pair}:{tsLilinAkhir}",
//     jadi menjalankan backtest semula esok mencipta snapshot BAHARU walaupun 99%
//     dagangannya adalah dagangan sejarah yang sama. Backtest harian selama sebulan
//     menggelembungkan n ~30× dengan sampel yang hampir sepenuhnya bertindih, dan
//     selang Wilson — satu-satunya sebab angka ini boleh dipercayai — menjadi
//     palsu-sempit. Sekarang satu pasangan setiap mod menyumbang tepat satu
//     snapshot, sentiasa yang terkini.

export function simpanSnapshot(modId, pairId, jalur, meta = {}) {
  const semua = bacaSemuaSnapshot();
  semua[`${modId}:${pairId}`] = {
    jalur,
    tsData: meta.tsData ?? null,
    bilLilin: meta.bilLilin ?? null,
    disimpan: Date.now(),
  };
  simpanJSON(KUNCI, semua);
}

export function bacaSemuaSnapshot() {
  const semua = bacaJSON(KUNCI, {});
  return semua && typeof semua === "object" ? semua : {};
}

export function padamSnapshot() {
  simpanJSON(KUNCI, {});
}

// Agregat merentas snapshot bagi SATU mod. Tanpa modId, gabung semua (paparan sahaja).
export function agregat(modId = null) {
  const semua = bacaSemuaSnapshot();
  const dipilih = Object.entries(semua)
    .filter(([kunci]) => modId == null || kunci.startsWith(`${modId}:`))
    .map(([, v]) => (v && v.jalur ? v.jalur : v));
  return gabungSnapshot(dipilih);
}

// Pasangan yang menyumbang kepada agregat satu mod — untuk paparan asal-usul.
export function sumberJalur(modId = null) {
  return Object.entries(bacaSemuaSnapshot())
    .filter(([kunci]) => modId == null || kunci.startsWith(`${modId}:`))
    .map(([kunci, v]) => ({
      pairId: kunci.split(":")[1] || kunci,
      tsData: v && v.tsData != null ? v.tsData : null,
      bilLilin: v && v.bilLilin != null ? v.bilLilin : null,
    }));
}

// Statistik untuk satu skor TERAS tertentu — inilah yang dipaparkan dashboard.
// Pulang { cukup:false } bila sampel di bawah MIN_SAMPEL: lebih baik berkata
// "tidak tahu" daripada memberi peratusan yang tidak boleh dipertahankan.
export function bacaJalur(skorTeras, modId = null) {
  const nama = namaJalur(skorTeras);
  if (!nama) {
    return { nama: null, cukup: false, n: 0, menang: 0, min: MIN_SAMPEL, pasangan: [] };
  }
  const a = agregat(modId)[nama] || { n: 0, menang: 0 };
  const w = kadarWilson(a.menang, a.n);
  return {
    nama,
    n: a.n,
    menang: a.menang,
    min: MIN_SAMPEL,
    cukup: a.n >= MIN_SAMPEL,
    kadar: w.kadar,
    bawah: w.bawah,
    atas: w.atas,
    pasangan: sumberJalur(modId).map((s) => s.pairId),
  };
}
