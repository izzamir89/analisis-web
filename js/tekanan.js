// Tekanan Pasaran — proxy untuk "volume" yang forex spot tidak ada.
//
// JUJUR: forex spot tiada volume berpusat. Twelve Data memulangkan 0/null untuk
// medan volume pasangan forex. Daripada memaparkan sifar yang tidak bermakna (atau
// lebih teruk, melabelkannya "Volume"), kita ukur apa yang lilin SENDIRI beritahu
// tentang penyertaan: lilin yang julatnya mengembang melebihi ATR purata dengan
// badan tebal = tekanan sebelah pihak. Julat sempit berbadan nipis = keraguan.
//
// Ini BUKAN volume. Label UI mesti "Tekanan Pasaran", jangan sekali-kali "Volume".

import { atr } from "./indicators.js";

// Pecahan 0..1 daripada pengembangan julat berbanding ATR.
function faktorEkspansi(x) {
  if (x >= 1.5) return 1.0;
  if (x >= 1.0) return 0.7;
  if (x >= 0.7) return 0.4;
  return 0.15;
}

// Pecahan 0..1 daripada nisbah badan (keyakinan lawan sumbu ragu-ragu).
function faktorBadan(x) {
  if (x >= 0.6) return 1.0;
  if (x >= 0.35) return 0.6;
  return 0.25;
}

// Ukur tekanan lilin terakhir relatif kepada arah dagangan yang dicadangkan.
// Pulang null bila data tak cukup untuk ATR — pemanggil layan sebagai "tiada data".
export function tekananPasaran(candles, arah, period = 14) {
  const n = Array.isArray(candles) ? candles.length : 0;
  if (!n) return null;
  const siriAtr = atr(candles, period);
  const atrNilai = siriAtr ? siriAtr[siriAtr.length - 1] : null;
  if (!(atrNilai > 0)) return null;

  const c = candles[n - 1];
  const julat = c.h - c.l;
  if (!(julat > 0)) {
    return {
      skorFrac: 0,
      ekspansi: 0,
      badanPct: 0,
      selari: false,
      sebab: "Lilin tiada julat — tiada tekanan.",
    };
  }

  const ekspansi = julat / atrNilai;
  const badanPct = Math.abs(c.c - c.o) / julat;
  const selari = arah === "Buy" ? c.c > c.o : c.c < c.o;

  const asas = 0.6 * faktorEkspansi(ekspansi) + 0.4 * faktorBadan(badanPct);
  const skorFrac = asas * (selari ? 1 : 0.3);

  const label = ekspansi >= 1.5 ? "kuat" : ekspansi >= 1.0 ? "sederhana" : "lemah";
  const sebab = selari
    ? `Tekanan ${label} (julat ${ekspansi.toFixed(1)}× ATR, badan ${Math.round(badanPct * 100)}%).`
    : `Lilin terakhir menentang arah (julat ${ekspansi.toFixed(1)}× ATR).`;

  return { skorFrac, ekspansi, badanPct, selari, sebab };
}
