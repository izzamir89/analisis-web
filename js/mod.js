// Preset "mod dagangan" — susunan timeframe + tetapan skor/kalkulator per gaya.
// 100% tulen (data sahaja), boleh diuji. Enjin skor (scoring.js) diparametrikan
// oleh nilai di sini supaya SATU pipeline (dashboard.js) melayani banyak mod.
//
// Setiap mod menetapkan triad TF: lo (entry) · mid · hi (konteks trend). Nama slot
// "lo/mid/hi" sengaja generik — scoring.js masih terima slot ind1h/ind4h/indD tetapi
// memetakan lo→ind1h, mid→ind4h, hi→indD. Momentum & corak lilin baca TF-entry (lo).
//
// KEKANGAN LIPUTAN `saiz` (sama seperti komen dalam dashboard.js): TF-tinggi mesti
// meliputi julat masa TF-entry DITAMBAH ~260 lilin pemanasan EMA200, jika tidak gate
// "data tidak lengkap" menyala setiap bar backtest → SIFAR dagangan.

export const MOD = {
  // Gaya asal aplikasi — tingkah laku 1J/4J/Harian yang sedia ada, tak berubah.
  swing: {
    id: "swing",
    label: "Swing",
    tf: { lo: "60", mid: "240", hi: "D" }, // interval dalaman marketdata.js
    tfLabel: { lo: "1J", mid: "4J", hi: "Harian" },
    bobotTrend: { hi: 20, mid: 10, lo: 10 }, // jumlah = 40 (MAKS.trend)
    saiz: { lo: 1500, mid: 750, hi: 400 },
    // Di-anchor semula dari 70 → 65 apabila baldi berita diturunkan 10 → 5 markah.
    // Ini ARITMETIK, bukan pelonggaran: setiap skor kehilangan sehingga 5 markah pada
    // penimbangan semula, jadi mengekalkan ambang 70 akan secara senyap menjadikan
    // kemasukan lebih ketat, bukan sama. Diukur: ambang 65 memberi 23.9% kadar isyarat
    // berbanding 18.6% pada enjin asal — lebih banyak isyarat daripada enjin yang
    // gate-nya lebih baik, bukan daripada memindahkan tiang gol.
    //
    // Ini kekal nilai PERMULAAN. Gunakan walk-forward (js/walkforward.js) atas data
    // anda sendiri untuk menalanya — itulah satu-satunya cara jujur menetapkan ambang.
    ambangMasuk: 65,
    atrMelonjak: 0.012,
    kalk: { pengganda: 1.5, rr: 2 },
    backtest: { mula: 260, lookback: 400 },
    ingatKunci: "db_pair",
    rute: "dashboard",
  },

  // Scalping — entry M5, konteks M15 + H1. H1 sudah disokong → jimat kuota.
  //   lo=M5 × 1500 ≈ 5.2 hari
  //   hi=H1 400     — perlu 5.2 hari + 260j = 385j  ✅
  //   mid=M15 760   — perlu 500 M15 (=1500 M5) + 260 = 760  ✅
  scalp: {
    id: "scalp",
    label: "Scalping",
    tf: { lo: "5", mid: "15", hi: "60" },
    tfLabel: { lo: "M5", mid: "M15", hi: "H1" },
    bobotTrend: { hi: 20, mid: 10, lo: 10 }, // H1 20 · M15 10 · M5 10
    saiz: { lo: 1500, mid: 760, hi: 400 },
    ambangMasuk: 65, // di-anchor semula bersama swing — lihat nota di atas
    // Kekal sebagai jaring keselamatan sahaja. Gate volatiliti sebenar kini RELATIF
    // (ATR semasa vs median terkini, lihat ATR_LONJAK_NISBAH dalam scoring.js) kerana
    // ambang mutlak terukur tidak pernah menyala: ATR% 1J purata 0.092% berbanding gate
    // swing 1.2%, dan M5 lebih kecil lagi berbanding gate 0.4% ini.
    atrMelonjak: 0.004,
    kalk: { pengganda: 1.0, rr: 1.5 }, // SL/TP lebih ketat untuk scalp
    backtest: { mula: 260, lookback: 500 },
    ingatKunci: "sc_pair",
    rute: "scalp",
  },
};

// Ambil preset mod dengan selamat; id tak dikenali → swing (default).
export function ambilMod(id) {
  return MOD[id] || MOD.swing;
}
