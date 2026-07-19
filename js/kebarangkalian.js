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

const KUNCI = "bt_jalur";
export const JALUR = [
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

// Kumpulkan dagangan backtest ikut jalur skor. Tulen.
// Dagangan tanpa `skor` atau di luar semua jalur diabaikan.
export function kumpulJalur(trades) {
  const keluar = {};
  for (const [bawah, atas] of JALUR) keluar[`${bawah}-${atas}`] = { n: 0, menang: 0 };
  for (const t of Array.isArray(trades) ? trades : []) {
    if (!t || typeof t.skor !== "number") continue;
    const nama = namaJalur(t.skor);
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
// Dikunci "{pairId}:{tsLilinTerakhir}" supaya menjalankan backtest berulang kali
// pada data yang SAMA menggantikan, bukan menambah. Tanpa ini pengguna boleh
// menggelembungkan saiz sampel sendiri hanya dengan menekan butang berkali-kali —
// dan saiz sampel ialah satu-satunya sebab angka ini boleh dipercayai.

export function simpanSnapshot(pairId, tsData, jalur) {
  const semua = bacaJSON(KUNCI, {});
  semua[`${pairId}:${tsData}`] = jalur;
  simpanJSON(KUNCI, semua);
}

export function bacaSemuaSnapshot() {
  const semua = bacaJSON(KUNCI, {});
  return semua && typeof semua === "object" ? semua : {};
}

export function padamSnapshot() {
  simpanJSON(KUNCI, {});
}

// Agregat merentas semua snapshot tersimpan.
export function agregat() {
  return gabungSnapshot(Object.values(bacaSemuaSnapshot()));
}

// Statistik untuk satu skor tertentu — inilah yang dipaparkan dashboard.
// Pulang { cukup:false } bila sampel di bawah MIN_SAMPEL: lebih baik berkata
// "tidak tahu" daripada memberi peratusan yang tidak boleh dipertahankan.
export function bacaJalur(skor) {
  const nama = namaJalur(skor);
  if (!nama) return { nama: null, cukup: false, n: 0, menang: 0, min: MIN_SAMPEL };
  const a = agregat()[nama] || { n: 0, menang: 0 };
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
  };
}
