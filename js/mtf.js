// Siri multi-timeframe "seperti dilihat pada masa T" — 100% tulen.
//
// MASALAH YANG DISELESAIKAN: backtest mesti menjalankan enjin yang SAMA seperti
// dagangan langsung, termasuk gate MTF. Itu memerlukan siri 4J & Harian pada
// setiap bar sejarah. Dua pendekatan naif kedua-duanya gagal:
//
//   (a) Resample 4J/Harian dari tetingkap 1J.
//       Gagal: EMA200 Harian perlukan 200 hari = 4800 lilin 1J. Tetingkap yang
//       cukup besar untuk itu menjadikan backtest O(n²) dan tidak meninggalkan
//       sejarah untuk diuji. Tetingkap kecil → EMA200 null → SETIAP bar jadi
//       "data tidak lengkap" → NO TRADE → sifar dagangan.
//
//   (b) Hiris siri 4J/Harian sebenar dengan t <= sekarang.
//       Gagal: lilin Harian yang MENGANDUNGI masa t membawa high/low/close
//       SEPANJANG HARI itu — termasuk masa depan relatif kepada t. Lookahead
//       bias yang menggelembungkan keputusan backtest secara senyap.
//
// PENYELESAIAN: lilin TF-tinggi yang sudah LENGKAP sebelum tempoh semasa
// (sejarah tulen, tiada lookahead) + lilin SEPARA tempoh semasa yang dibina dari
// lilin 1J sehingga t sahaja. Ini betul-betul apa yang API pulangkan secara
// langsung: sejarah lengkap + satu lilin sedang terbentuk.

export const JAM = 3600000;
export const TEMPOH_4J = 4 * JAM;
export const TEMPOH_HARI = 24 * JAM;

// Berapa lilin TF-tinggi lengkap untuk disimpan. EMA200 perlu 200; lebihan
// memberi ruang penumpuan tanpa menjadikan setiap bar mahal.
const SIMPAN = 260;

export function mulaHariUTC(t) {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Mula tempoh yang mengandungi `t`.
export function mulaTempoh(t, tempohMs) {
  if (tempohMs === TEMPOH_HARI) return mulaHariUTC(t);
  return Math.floor(t / tempohMs) * tempohMs;
}

// Gabung beberapa lilin jadi satu: o pertama, c terakhir, h max, l min.
export function gabungLilin(kumpulan) {
  if (!kumpulan || !kumpulan.length) return null;
  let h = -Infinity;
  let l = Infinity;
  for (const c of kumpulan) {
    if (c.h > h) h = c.h;
    if (c.l < l) l = c.l;
  }
  return { t: kumpulan[0].t, o: kumpulan[0].o, h, l, c: kumpulan[kumpulan.length - 1].c };
}

// Indeks pertama dengan siri[i].t >= masa (carian binari; siri mesti menaik).
function cariIndeks(siri, masa) {
  let lo = 0;
  let hi = siri.length;
  while (lo < hi) {
    const tengah = (lo + hi) >> 1;
    if (siri[tengah].t < masa) lo = tengah + 1;
    else hi = tengah;
  }
  return lo;
}

// Bina siri TF-tinggi seperti dilihat pada masa `t`.
//   siriTF   — lilin TF-tinggi sebenar dari API (menaik)
//   lilin1h  — lilin 1J (menaik) yang meliputi sekurang-kurangnya tempoh semasa
//   t        — masa sekarang (ms)
// Pulang [] bila tiada apa-apa boleh dibina.
export function siriPadaMasa(siriTF, lilin1h, t, tempohMs, simpan = SIMPAN) {
  if (!Array.isArray(siriTF) || !(t > 0)) return [];
  const mula = mulaTempoh(t, tempohMs);
  const idx = cariIndeks(siriTF, mula);
  const lengkap = siriTF.slice(Math.max(0, idx - simpan), idx);

  // Lilin separa tempoh semasa, dibina dari 1J sehingga t SAHAJA.
  const dalamTempoh = [];
  if (Array.isArray(lilin1h)) {
    for (let i = lilin1h.length - 1; i >= 0; i--) {
      const c = lilin1h[i];
      if (c.t > t) continue;
      if (c.t < mula) break;
      dalamTempoh.unshift(c);
    }
  }
  const separa = gabungLilin(dalamTempoh);
  return separa ? [...lengkap, separa] : lengkap;
}
