// Analitik jurnal — cari kelebihan (edge) dari data dagangan anda sendiri.
// 100% tempatan & tulen (tiada rangkaian). Semua fungsi terima senarai entri jurnal.
import { sesiAktif } from "./sessions.js";

// Adakah entri sudah ditutup (ada keputusan menang/kalah/BE)?
export function ditutup(e) {
  return e.hasil === "win" || e.hasil === "loss" || e.hasil === "be";
}

// R terealisasi bagi satu dagangan.
// Guna `rSebenar` (nombor) jika pengguna isi; jika tidak anggarkan dari keputusan:
//   menang → +rr (anggap TP kena), kalah → −1 (anggap SL kena), BE → 0.
export function rTrade(e) {
  if (typeof e.rSebenar === "number" && !Number.isNaN(e.rSebenar)) return e.rSebenar;
  if (e.hasil === "win") return Number(e.rr) > 0 ? Number(e.rr) : 1;
  if (e.hasil === "loss") return -1;
  return 0; // be / open
}

// Sesi utama semasa dagangan dibuka (derive dari cap masa — jalan untuk entri lama).
export function sesiEntri(e) {
  const aktif = sesiAktif(new Date(e.ts));
  return aktif[0] || "Luar sesi";
}

// Ringkasan prestasi keseluruhan.
export function ringkasan(list) {
  const tutup = list.filter(ditutup);
  const menang = tutup.filter((e) => e.hasil === "win");
  const kalah = tutup.filter((e) => e.hasil === "loss");
  const rSemua = tutup.map(rTrade);
  const jumlahR = rSemua.reduce((a, b) => a + b, 0);

  const rMenang = menang.map(rTrade);
  const rKalah = kalah.map(rTrade);
  const untung = rMenang.reduce((a, b) => a + b, 0);
  const rugi = Math.abs(rKalah.reduce((a, b) => a + b, 0));

  const menangKalah = menang.length + kalah.length;
  return {
    jumlah: list.length,
    ditutup: tutup.length,
    menang: menang.length,
    kalah: kalah.length,
    be: tutup.filter((e) => e.hasil === "be").length,
    // Kadar menang dikira antara menang vs kalah (BE dikecualikan).
    kadarMenang: menangKalah ? Math.round((menang.length / menangKalah) * 100) : null,
    // Expectancy: purata R setiap dagangan tertutup — >0 bermaksud sistem positif.
    expectancyR: tutup.length ? jumlahR / tutup.length : null,
    avgMenangR: rMenang.length ? untung / rMenang.length : null,
    avgKalahR: rKalah.length ? -rugi / rKalah.length : null,
    // Profit factor: jumlah untung R ÷ jumlah rugi R.
    profitFactor: rugi > 0 ? untung / rugi : untung > 0 ? Infinity : null,
    jumlahR,
  };
}

// Pecahan prestasi mengikut kunci (pasangan / arah / sesi). Pulang array diisih ikut count.
export function ikutKumpulan(list, keyFn) {
  const peta = new Map();
  for (const e of list.filter(ditutup)) {
    const k = keyFn(e);
    if (!peta.has(k)) peta.set(k, []);
    peta.get(k).push(e);
  }
  return [...peta.entries()]
    .map(([kunci, entri]) => {
      const menang = entri.filter((e) => e.hasil === "win").length;
      const kalah = entri.filter((e) => e.hasil === "loss").length;
      const jumlahR = entri.map(rTrade).reduce((a, b) => a + b, 0);
      return {
        kunci,
        count: entri.length,
        menang,
        kalah,
        kadarMenang: menang + kalah ? Math.round((menang / (menang + kalah)) * 100) : null,
        expectancyR: entri.length ? jumlahR / entri.length : 0,
        jumlahR,
      };
    })
    .sort((a, b) => b.count - a.count);
}

// Keluk ekuiti: R terkumpul mengikut urutan kronologi dagangan tertutup.
// Pulang [{i, ts, r, kumulatif}] — sesuai untuk sparkline.
export function kelukEkuiti(list) {
  const tutup = list
    .filter(ditutup)
    .slice()
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
  let kumulatif = 0;
  return tutup.map((e, i) => {
    kumulatif += rTrade(e);
    return { i, ts: e.ts, r: rTrade(e), kumulatif: Math.round(kumulatif * 100) / 100 };
  });
}

// Streak menang/kalah: semasa (bertanda +/−) & maksimum setiap arah.
export function streak(list) {
  const tutup = list
    .filter((e) => e.hasil === "win" || e.hasil === "loss")
    .slice()
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
  let semasa = 0;
  let maksMenang = 0;
  let maksKalah = 0;
  for (const e of tutup) {
    if (e.hasil === "win") {
      semasa = semasa > 0 ? semasa + 1 : 1;
      maksMenang = Math.max(maksMenang, semasa);
    } else {
      semasa = semasa < 0 ? semasa - 1 : -1;
      maksKalah = Math.max(maksKalah, -semasa);
    }
  }
  return { semasa, maksMenang, maksKalah };
}
