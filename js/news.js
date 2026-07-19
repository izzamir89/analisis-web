// Amaran berita impak tinggi — 100% tempatan, tiada rangkaian.
//
// HAD (jujur): widget kalendar TradingView ialah iframe paparan sahaja —
// tak boleh dibaca secara programatik untuk kira "berapa minit ke berita".
// Maka pengguna SALIN acara berita dari kalendar TV, dan kita kira jarak masa
// secara tempatan untuk menyuap gate skor dan panel Go/No-Go.
//
// SEMPADAN ADAPTER: bacaAcara() ialah SATU-SATUNYA fungsi yang tahu dari mana
// data acara datang. Untuk memasang API kalendar sebenar kelak, ganti fungsi itu
// sahaja — scoring.js dan UI tidak perlu berubah.

const KUNCI = "forex_news_events";
const KUNCI_LAMA = "forex_news_next"; // format satu-acara sebelum v3
export const AMARAN_MINIT = 30; // zon bahaya untuk acara impak tinggi

// Lebar zon bahaya (minit) ikut impak. Impak rendah tidak pernah menggate.
export const ZON_IMPAK = { tinggi: AMARAN_MINIT, sederhana: 15, rendah: 0 };

export const IMPAK = ["tinggi", "sederhana", "rendah"];

function normalImpak(v) {
  return IMPAK.includes(v) ? v : "tinggi";
}

// Migrasi format lama (satu datetime-local) → senarai acara. Dijalankan sekali;
// kunci lama dipadam selepas berjaya supaya tidak berulang.
function migrasiLama() {
  try {
    const v = localStorage.getItem(KUNCI_LAMA);
    if (!v) return [];
    const d = new Date(v);
    localStorage.removeItem(KUNCI_LAMA);
    if (isNaN(d.getTime())) return [];
    const senarai = [
      {
        id: "migrasi-1",
        nama: "Berita merah",
        mataWang: "",
        impak: "tinggi",
        masa: d.toISOString(),
      },
    ];
    localStorage.setItem(KUNCI, JSON.stringify(senarai));
    return senarai;
  } catch {
    return [];
  }
}

// Baca senarai acara, diisih menaik ikut masa. Sentiasa pulang array.
export function bacaAcara() {
  let mentah = null;
  try {
    mentah = localStorage.getItem(KUNCI);
  } catch {
    return [];
  }
  if (!mentah) return migrasiLama();
  let senarai;
  try {
    senarai = JSON.parse(mentah);
  } catch {
    return [];
  }
  if (!Array.isArray(senarai)) return [];
  return senarai
    .filter((a) => a && a.masa && !isNaN(new Date(a.masa).getTime()))
    .map((a) => ({
      id: String(a.id || ""),
      nama: String(a.nama || "Berita"),
      mataWang: String(a.mataWang || "").toUpperCase(),
      impak: normalImpak(a.impak),
      masa: new Date(a.masa).toISOString(),
    }))
    .sort((x, y) => new Date(x.masa) - new Date(y.masa));
}

// Ganti keseluruhan senarai. Hantar [] atau null untuk kosongkan.
export function simpanAcara(senarai) {
  try {
    if (!Array.isArray(senarai) || !senarai.length) {
      localStorage.removeItem(KUNCI);
      return;
    }
    const bersih = senarai
      .filter((a) => a && a.masa && !isNaN(new Date(a.masa).getTime()))
      .map((a, i) => ({
        id: String(a.id || `a${i}-${new Date(a.masa).getTime()}`),
        nama: String(a.nama || "Berita"),
        mataWang: String(a.mataWang || "").toUpperCase(),
        impak: normalImpak(a.impak),
        masa: new Date(a.masa).toISOString(),
      }));
    localStorage.setItem(KUNCI, JSON.stringify(bersih));
  } catch {
    /* abai */
  }
}

// Buang satu acara ikut id.
export function padamAcara(id) {
  simpanAcara(bacaAcara().filter((a) => a.id !== id));
}

// Status berita pada masa `now`.
// Pulang {
//   senarai — setiap acara + { saatBaki, minit, lalu, bahaya }
//   bahaya  — ada acara IMPAK TINGGI dalam zonnya (ini yang menggate dagangan)
//   amaran  — ada acara impak sederhana dalam zonnya (turunkan markah, jangan gate)
//   seterusnya — acara akan datang terdekat (atau yang baru berlalu jika masih bahaya)
// }
export function jarakAcara(now = new Date()) {
  const masaKini = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const senarai = bacaAcara().map((a) => {
    const saatBaki = Math.round((new Date(a.masa).getTime() - masaKini) / 1000);
    const minit = saatBaki / 60;
    const zon = ZON_IMPAK[a.impak];
    return {
      ...a,
      saatBaki,
      minit,
      lalu: saatBaki < 0,
      bahaya: zon > 0 && Math.abs(minit) <= zon,
    };
  });

  const dalamZon = senarai.filter((a) => a.bahaya);
  const bahaya = dalamZon.some((a) => a.impak === "tinggi");
  const amaran = !bahaya && dalamZon.some((a) => a.impak === "sederhana");
  // "Seterusnya" = yang masih dalam zon bahaya diutamakan, jika tidak yang akan datang.
  const seterusnya = dalamZon[0] || senarai.find((a) => !a.lalu) || null;

  return { senarai, bahaya, amaran, seterusnya };
}

// --- Jimat-belakang: API satu-acara yang lama ---
// checklist.js & app.js masih memanggil ini. Dipetakan ke acara impak-tinggi
// akan datang yang terdekat supaya kelakuan sedia ada kekal sama.

export function bacaBerita() {
  const a = bacaAcara().filter((x) => x.impak === "tinggi");
  if (!a.length) return null;
  const now = Date.now();
  const akanDatang = a.find((x) => new Date(x.masa).getTime() >= now - AMARAN_MINIT * 60000);
  return akanDatang ? new Date(akanDatang.masa) : new Date(a[a.length - 1].masa);
}

export function simpanBerita(nilai) {
  if (!nilai) {
    // Padam hanya acara impak tinggi automatik/lama; kekalkan yang lain.
    simpanAcara(bacaAcara().filter((a) => a.impak !== "tinggi"));
    return;
  }
  const d = nilai instanceof Date ? nilai : new Date(nilai);
  if (isNaN(d.getTime())) return;
  const lain = bacaAcara().filter((a) => a.impak !== "tinggi");
  simpanAcara([
    ...lain,
    { id: `t-${d.getTime()}`, nama: "Berita merah", mataWang: "", impak: "tinggi", masa: d },
  ]);
}

export function jarakBerita(now = new Date()) {
  const d = bacaBerita();
  if (!d) return { ada: false };
  const masaKini = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const saatBaki = Math.round((d.getTime() - masaKini) / 1000);
  const minit = saatBaki / 60;
  return {
    ada: true,
    minit,
    lalu: saatBaki < 0,
    bahaya: Math.abs(minit) <= AMARAN_MINIT,
    saatBaki,
    masa: d,
  };
}
