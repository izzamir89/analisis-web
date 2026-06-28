// Amaran berita impak tinggi — 100% tempatan, tiada rangkaian.
//
// HAD (jujur): widget kalendar TradingView ialah iframe paparan sahaja —
// tak boleh dibaca secara programatik untuk kira "berapa minit ke berita".
// Maka pengguna SALIN SEKALI masa berita merah seterusnya dari kalendar TV,
// dan kita kira jarak masa secara tempatan untuk menyuap panel Go/No-Go.

const KUNCI = "forex_news_next";
export const AMARAN_MINIT = 30; // zon bahaya sebelum/selepas berita

// Baca masa berita tersimpan → objek Date, atau null jika tiada/tak sah.
export function bacaBerita() {
  try {
    const v = localStorage.getItem(KUNCI);
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

// Simpan masa berita (terima string datetime-local atau Date). null = padam.
export function simpanBerita(nilai) {
  try {
    if (!nilai) { localStorage.removeItem(KUNCI); return; }
    const d = nilai instanceof Date ? nilai : new Date(nilai);
    if (isNaN(d.getTime())) return;
    localStorage.setItem(KUNCI, d.toISOString());
  } catch { /* abai */ }
}

// Jarak ke berita seterusnya pada masa `now`.
// Pulang: { ada, minit, lalu, bahaya, saatBaki }
//   ada     — wujud masa berita tersimpan & masih akan datang (atau dalam zon lalu-bahaya)
//   minit   — minit (boleh negatif jika sudah berlalu)
//   lalu    — berita sudah berlalu
//   bahaya  — dalam ±AMARAN_MINIT dari masa berita
export function jarakBerita(now = new Date()) {
  const d = bacaBerita();
  if (!d) return { ada: false };
  const saatBaki = Math.round((d.getTime() - now.getTime()) / 1000);
  const minit = saatBaki / 60;
  const lalu = saatBaki < 0;
  const bahaya = Math.abs(minit) <= AMARAN_MINIT;
  return { ada: true, minit, lalu, bahaya, saatBaki, masa: d };
}
