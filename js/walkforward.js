// Walk-forward — pilih ambang pada data LATIH, lapor prestasi pada data UJI.
//
// KENAPA MODUL INI WUJUD: setiap nombor prestasi lain dalam app ini adalah in-sample.
// Pemberat dan ambang direka oleh manusia, kemudian diuji atas data yang sama. Kadar
// menang yang terhasil optimistik secara sistematik, dan tiada jumlah ujian unit boleh
// membetulkannya — ia masalah metodologi, bukan masalah kod.
//
// Walk-forward membetulkannya dengan cara yang paling mudah yang masih sah: potong
// sejarah pada satu titik masa, pilih ambang menggunakan HANYA bahagian awal, kemudian
// lapor prestasi menggunakan HANYA bahagian akhir yang tidak pernah dilihat semasa
// pemilihan. Kalau angka uji runtuh berbanding angka latih, ambang itu memuatkan bunyi
// bising — dan itulah maklumat paling berharga yang app ini boleh beri anda.
//
// HAD YANG KEKAL JUJUR: pemberat baldi sendiri masih direka oleh manusia sambil melihat
// keseluruhan data. Walk-forward di sini mengesahkan pemilihan AMBANG, bukan pemilihan
// pemberat. Ia mengecilkan bias optimistik; ia tidak menghapuskannya.

import { backtestAsync } from "./backtest.js";
import { ringkasan } from "./analytics.js";

// Bilangan dagangan minimum dalam segmen sebelum statistiknya dilayan sebagai isyarat
// dan bukan bunyi bising. Di bawah ini kita katakan "tidak tahu".
export const MIN_DAGANGAN = 20;

// Ambang calon lalai. Julat sengaja luas — kalau yang terbaik jatuh di hujung julat,
// itu sendiri memberitahu sesuatu tentang enjin.
export const AMBANG_CALON = [55, 60, 65, 70, 75, 80];

// Cap masa yang memisahkan segmen latih dan uji.
// Dipisah mengikut INDEKS LILIN, bukan bilangan dagangan: memisah ikut dagangan akan
// membocorkan maklumat kerana bilangan dagangan itu sendiri bergantung pada ambang.
export function masaPisah(candles, pecahanLatih = 0.7) {
  const n = Array.isArray(candles) ? candles.length : 0;
  if (!n) return null;
  const idx = Math.floor(n * pecahanLatih);
  const c = candles[Math.max(0, Math.min(n - 1, idx))];
  return typeof c.t === "number" ? c.t : Date.parse(c.t);
}

// Bahagi dagangan kepada latih / uji mengikut cap masa kemasukan. Tulen.
export function bahagiDagangan(trades, tsPisah) {
  const latih = [];
  const uji = [];
  for (const t of Array.isArray(trades) ? trades : []) {
    if (!t) continue;
    (t.ts <= tsPisah ? latih : uji).push(t);
  }
  return { latih, uji };
}

// Statistik satu segmen + sama ada ia boleh dipercayai.
export function statSegmen(trades) {
  const r = ringkasan(trades);
  return {
    n: trades.length,
    menang: r.menang,
    kalah: r.kalah,
    kadarMenang: r.kadarMenang,
    expectancyR: r.expectancyR,
    profitFactor: r.profitFactor,
    jumlahR: r.jumlahR,
    cukup: trades.length >= MIN_DAGANGAN,
  };
}

// Jalankan walk-forward penuh.
//
//   candles     — siri TF-entry (menaik)
//   opts        — sama seperti backtestAsync (pairId, slMult, rr, kosHarga, mula, …)
//   buatSkorFn  — (ambang) => skorFn. WAJIB membina enjin dengan ambangMasuk itu,
//                 supaya setiap ambang diuji dengan verdict sebenar enjin, bukan
//                 dengan penapis skor yang ditampal selepasnya.
//
// Pulang { tsPisah, jadual:[...], terbaik, lalai } — `terbaik` ialah baris ambang yang
// dipilih atas segmen LATIH sahaja, berserta statistik UJI-nya untuk dibandingkan.
export async function walkForward(
  candles,
  opts,
  { buatSkorFn, ambangCalon = AMBANG_CALON, pecahanLatih = 0.7, onKemajuan } = {}
) {
  const tsPisah = masaPisah(candles, pecahanLatih);
  if (tsPisah == null || typeof buatSkorFn !== "function") {
    return { tsPisah: null, jadual: [], terbaik: null };
  }

  const jadual = [];
  for (let i = 0; i < ambangCalon.length; i++) {
    const ambang = ambangCalon[i];
    const trades = await backtestAsync(
      candles,
      { ...opts, skorFn: buatSkorFn(ambang), threshold: ambang },
      (frac) => {
        if (onKemajuan) onKemajuan((i + frac) / ambangCalon.length);
      }
    );
    const { latih, uji } = bahagiDagangan(trades, tsPisah);
    jadual.push({ ambang, latih: statSegmen(latih), uji: statSegmen(uji) });
  }
  if (onKemajuan) onKemajuan(1);

  // Pemilihan menggunakan SEGMEN LATIH SAHAJA. Melihat lajur uji untuk memilih akan
  // memusnahkan keseluruhan tujuan modul ini.
  const layak = jadual.filter((b) => b.latih.cukup && b.latih.expectancyR != null);
  const terbaik = layak.length
    ? layak.reduce((a, b) => (b.latih.expectancyR > a.latih.expectancyR ? b : a))
    : null;

  return { tsPisah, jadual, terbaik };
}

// Adakah keputusan uji mengesahkan pilihan latih?
// Tiga hasil, dan "tidak tahu" adalah salah satu daripadanya — itu penting.
export function penilaian(terbaik) {
  if (!terbaik) return { status: "tiada", teks: "Tiada ambang mengumpul dagangan yang cukup." };
  if (!terbaik.uji.cukup) {
    return {
      status: "tidak-tahu",
      teks: `Segmen uji hanya ada ${terbaik.uji.n} dagangan (perlu ${MIN_DAGANGAN}) — belum boleh disahkan. Muatkan lebih banyak lilin.`,
    };
  }
  const latih = terbaik.latih.expectancyR;
  const uji = terbaik.uji.expectancyR;
  if (uji <= 0) {
    return {
      status: "gagal",
      teks: `Expectancy runtuh di luar sampel: ${latih.toFixed(2)}R semasa latih → ${uji.toFixed(2)}R semasa uji. Ambang ini memuatkan bunyi bising, bukan kelebihan.`,
    };
  }
  if (uji < latih * 0.5) {
    return {
      status: "lemah",
      teks: `Expectancy bertahan tetapi merosot teruk: ${latih.toFixed(2)}R → ${uji.toFixed(2)}R. Layan angka latih sebagai optimistik.`,
    };
  }
  return {
    status: "bertahan",
    teks: `Expectancy bertahan di luar sampel: ${latih.toFixed(2)}R → ${uji.toFixed(2)}R.`,
  };
}
