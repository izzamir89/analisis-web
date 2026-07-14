// Helper simpanan tempatan & escape HTML — dikongsi merentas modul.
// Semua data app disimpan di localStorage (100% tempatan, tiada rangkaian).

// Baca nilai JSON dari localStorage. Pulang `lalai` jika tiada / rosak.
export function bacaJSON(kunci, lalai = null) {
  try {
    const v = localStorage.getItem(kunci);
    if (v == null) return lalai;
    return JSON.parse(v);
  } catch {
    return lalai;
  }
}

// Simpan nilai sebagai JSON. Abai ralat kuota / mod privasi.
export function simpanJSON(kunci, nilai) {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai));
  } catch {
    /* abai: kuota penuh atau storan disekat */
  }
}

// Padam satu kunci.
export function padamKunci(kunci) {
  try {
    localStorage.removeItem(kunci);
  } catch {
    /* abai */
  }
}

// Escape teks pengguna sebelum sisip ke HTML (elak XSS / pecah markup).
export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
