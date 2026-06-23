// Logik sesi pasaran forex & timing — 100% tempatan, tiada rangkaian, tiada AI.
// Semua fungsi terima objek Date supaya mudah diuji dengan masa tetap.
// Zon waktu dikira guna Intl.DateTimeFormat → DST (waktu siang) automatik betul.

// Sesi major: kota + jam buka/tutup mengikut WAKTU TEMPATAN kota itu.
export const SESI = [
  { id: "Sydney", tz: "Australia/Sydney", buka: 7, tutup: 16 },
  { id: "Tokyo", tz: "Asia/Tokyo", buka: 9, tutup: 18 },
  { id: "London", tz: "Europe/London", buka: 8, tutup: 17 },
  { id: "New York", tz: "America/New_York", buka: 8, tutup: 17 },
];

// Dapat bahagian masa satu kota (jam, minit, hari-minggu) pada satu masa mutlak.
function bahagianKota(date, tz) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const hariMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { jam: Number(p.hour), minit: Number(p.minute), hari: hariMap[p.weekday] };
}

// Jam "HH:MM" satu kota — untuk paparan jam berbilang zon.
export function jamKota(date, tz) {
  const b = bahagianKota(date, tz);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(b.jam)}:${pad(b.minit)}`;
}

// Satu sesi dianggap aktif jika waktu tempatan kota dalam [buka, tutup) pada hari bekerja (Isnin–Jumaat).
export function sesiAktif(date) {
  return SESI.filter((s) => {
    const b = bahagianKota(date, s.tz);
    if (b.hari === 0 || b.hari === 6) return false; // hujung minggu kota itu
    return b.jam >= s.buka && b.jam < s.tutup;
  }).map((s) => s.id);
}

// Status timing masuk order — berdasarkan KECAIRAN sesi, bukan arah Buy/Sell.
export function statusMasaOrder(date) {
  const aktif = sesiAktif(date);
  const overlapBesar = aktif.includes("London") && aktif.includes("New York");
  if (overlapBesar) {
    return { tahap: "elok", label: "ELOK", sebab: "Overlap London & New York — kecairan tertinggi." };
  }
  if (aktif.length >= 2) {
    return { tahap: "elok", label: "ELOK", sebab: `Sesi bertindih (${aktif.join(", ")}) — kecairan baik.` };
  }
  if (aktif.length === 1) {
    return { tahap: "hati", label: "BERHATI", sebab: `Hanya sesi ${aktif[0]} aktif — kecairan sederhana.` };
  }
  return { tahap: "elak", label: "ELAK", sebab: "Tiada sesi major aktif — pasaran sunyi / hujung minggu." };
}

// Saat berbaki sebelum lilin timeframe semasa ditutup.
// interval: "60" (1J), "240" (4J), "D" (harian). Sempadan dikira ikut UTC.
// Nota: broker berbeza mungkin ada offset (cth lilin harian tutup 21:00/22:00 UTC) — ini guna 00:00 UTC.
export function masaTutupLilin(date, interval) {
  const ms = date.getTime();
  let tempohMs;
  if (interval === "D") {
    tempohMs = 24 * 3600 * 1000;
  } else {
    tempohMs = Number(interval) * 60 * 1000; // minit → ms
  }
  // Sempadan diselaraskan dari tengah malam UTC (epoch juga jatuh pada 00:00 UTC).
  const masaTutup = Math.ceil((ms + 1) / tempohMs) * tempohMs;
  const saatBaki = Math.max(0, Math.round((masaTutup - ms) / 1000));
  return { saatBaki, masaTutup };
}

// Format saat → "HH:MM:SS" untuk paparan countdown.
export function formatBaki(saat) {
  const j = Math.floor(saat / 3600);
  const m = Math.floor((saat % 3600) / 60);
  const s = saat % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(j)}:${pad(m)}:${pad(s)}`;
}
