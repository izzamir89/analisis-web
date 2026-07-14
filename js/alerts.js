// Alert harga ringkas — client-side sahaja.
//
// HAD (jujur): pendekatan widget-sahaja tiada akses harga masa-nyata. Helper ini
// guna sumber kadar PERCUMA tanpa key (frankfurter.dev = kadar harian ECB) yang
// ditinjau HANYA semasa app dibuka. Maka:
//   • Hanya berfungsi semasa app aktif (tab dibuka).
//   • Kadar dikemas kini sekali sehari (hari bekerja) — bukan intraday.
//   • Emas (XAUUSD) TIDAK disokong oleh sumber ini.
// Untuk alert masa-nyata sebenar, guna alert asli dalam carta TradingView (perlu
// akaun TV percuma) — dipaparkan sebagai cadangan utama dalam UI.
import { PAIRS } from "./pairs.js";
import { bacaJSON, simpanJSON } from "./store.js";

const KUNCI = "forex_alerts";
const API = "https://api.frankfurter.dev/v1/latest";
const SOKONG = (id) => id !== "XAUUSD"; // frankfurter tiada emas

const baca = () => bacaJSON(KUNCI, []);
const simpan = (list) => simpanJSON(KUNCI, list);

export async function mintaKebenaran() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
}

function notify(tajuk, badan) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(tajuk, { body: badan, icon: "./icons/icon-192.png" });
  } else {
    alert(`${tajuk}\n${badan}`);
  }
}

// Ambil kadar semasa satu pasangan dari frankfurter (USD-base atau quote).
async function kadarSemasa(id) {
  const base = id.slice(0, 3);
  const quote = id.slice(3);
  const res = await fetch(`${API}?base=${base}&symbols=${quote}`);
  if (!res.ok) throw new Error("Gagal ambil kadar");
  const data = await res.json();
  return data.rates && data.rates[quote];
}

// Semak semua alert; pecat notifikasi & buang alert yang dipicu.
export async function semakAlerts() {
  const list = baca();
  let berubah = false;
  for (const a of list) {
    if (a.dipicu || !SOKONG(a.pairId)) continue;
    try {
      const harga = await kadarSemasa(a.pairId);
      if (harga == null) continue;
      const kena = a.arah === "atas" ? harga >= a.harga : harga <= a.harga;
      if (kena) {
        a.dipicu = true;
        berubah = true;
        notify(
          `Alert ${a.pairId}`,
          `Harga ${harga} ${a.arah === "atas" ? "≥" : "≤"} sasaran ${a.harga}`
        );
      }
    } catch {
      /* abai ralat rangkaian */
    }
  }
  if (berubah) simpan(list);
  return baca();
}

let pemasa = null;
export function mulaTinjauan(intervalMs = 60000) {
  if (pemasa) return;
  semakAlerts();
  pemasa = setInterval(semakAlerts, intervalMs);
}
export function hentiTinjauan() {
  if (pemasa) {
    clearInterval(pemasa);
    pemasa = null;
  }
}

// Bina UI alert dalam `host`.
export function renderAlerts(host) {
  const opsiPair = PAIRS.map(
    (p) =>
      `<option value="${p.id}" ${SOKONG(p.id) ? "" : "disabled"}>${p.id}${SOKONG(p.id) ? "" : " (tak disokong)"}</option>`
  ).join("");
  host.innerHTML = `
    <div class="kotak nota">
      <b>Cadangan utama:</b> untuk alert masa-nyata sebenar, buka skrin <b>Carta</b> → ikon loceng dalam carta TradingView (perlu akaun TV percuma).<br><br>
      Helper di bawah ialah alert ringkas: <b>hanya berfungsi semasa app dibuka</b>, guna kadar harian ECB (bukan intraday), dan <b>tiada emas</b>.
    </div>
    <form id="form-alert" class="kira">
      <label>Pasangan<select name="pairId">${opsiPair}</select></label>
      <div class="grid2">
        <label>Syarat<select name="arah"><option value="atas">Harga ≥</option><option value="bawah">Harga ≤</option></select></label>
        <label>Harga sasaran<input name="harga" type="number" step="any" inputmode="decimal" required></label>
      </div>
      <button type="submit" class="btn-utama">Tambah alert</button>
    </form>
    <button id="btn-uji" class="btn-kedua">Uji notifikasi</button>
    <div id="senarai-alert"></div>
  `;

  const senaraiEl = host.querySelector("#senarai-alert");
  function lukisSenarai() {
    const list = baca();
    if (!list.length) {
      senaraiEl.innerHTML = `<p class="nota">Tiada alert lagi.</p>`;
      return;
    }
    senaraiEl.innerHTML = list
      .map(
        (a, i) => `
      <div class="kotak alert-baris">
        <span>${a.pairId} ${a.arah === "atas" ? "≥" : "≤"} ${a.harga} ${a.dipicu ? "✅ dipicu" : "⏳"}</span>
        <button data-i="${i}" class="btn-buang">Buang</button>
      </div>`
      )
      .join("");
    senaraiEl.querySelectorAll(".btn-buang").forEach((b) =>
      b.addEventListener("click", () => {
        const list = baca();
        list.splice(Number(b.dataset.i), 1);
        simpan(list);
        lukisSenarai();
      })
    );
  }

  host.querySelector("#form-alert").addEventListener("submit", async (e) => {
    e.preventDefault();
    await mintaKebenaran();
    const d = Object.fromEntries(new FormData(e.target).entries());
    const list = baca();
    list.push({ pairId: d.pairId, arah: d.arah, harga: Number(d.harga), dipicu: false });
    simpan(list);
    e.target.reset();
    lukisSenarai();
    mulaTinjauan();
  });
  host.querySelector("#btn-uji").addEventListener("click", async () => {
    await mintaKebenaran();
    notify("Notifikasi ujian", "Alert forex anda berfungsi ✅");
  });

  lukisSenarai();
}
