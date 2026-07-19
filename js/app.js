// Router hash ringkas + navigasi bawah. Tiada framework, tiada langkah build.
import { PAIRS, cariPair } from "./pairs.js";
import * as W from "./widgets.js";
import { renderKalkulator } from "./calculator.js";
import { renderAlerts, mulaTinjauan } from "./alerts.js";
import {
  sesiAktif,
  statusMasaOrder,
  masaTutupLilin,
  formatBaki,
  jamKota,
  SESI,
} from "./sessions.js";
import { renderChecklist, hentiChecklist } from "./checklist.js";
import { renderJurnal } from "./journal.js";
import { bacaAcara, simpanAcara, padamAcara, jarakAcara } from "./news.js";
import { renderDashboard } from "./dashboard.js";
import { escapeHtml } from "./store.js";

const app = document.getElementById("app");
const tajukEl = document.getElementById("tajuk");

// Tetapan timeframe untuk skrin Carta
const TF = [
  { label: "1J", v: "60" },
  { label: "4J", v: "240" },
  { label: "Harian", v: "D" },
];

function setActiveNav(nama) {
  document
    .querySelectorAll(".navbtn")
    .forEach((b) => b.classList.toggle("aktif", b.dataset.rute === nama));
}

// Badge "Status Masuk Order" — berdasarkan kecairan sesi (bukan arah Buy/Sell).
function badgeOrderHtml(d) {
  const st = statusMasaOrder(d);
  const ikon = st.tahap === "elok" ? "🟢" : st.tahap === "hati" ? "🟡" : "🔴";
  return `<div class="badge-order ${st.tahap}" role="status" aria-live="polite">
      <span class="bo-label">${ikon} ${st.label}</span>
      <span class="bo-sebab">${st.sebab}</span>
    </div>`;
}

// Jam langsung + jam berbilang zon + chip sesi + badge status — dibersihkan setiap tukar skrin.
let jamPemasa = null;
function hentiJam() {
  if (jamPemasa) {
    clearInterval(jamPemasa);
    jamPemasa = null;
  }
}
function mulaJam(el) {
  const hari = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
  const bulan = [
    "Jan",
    "Feb",
    "Mac",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Ogos",
    "Sep",
    "Okt",
    "Nov",
    "Dis",
  ];
  const pad = (n) => String(n).padStart(2, "0");
  const tik = () => {
    const d = new Date();
    const tarikh = `${hari[d.getDay()]}, ${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
    const masa = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const aktif = sesiAktif(d);
    const chips = SESI.map(
      (s) => `<span class="sesi-chip ${aktif.includes(s.id) ? "aktif" : ""}">${s.id}</span>`
    ).join("");
    el.innerHTML = `
      <span class="jam-masa">${masa}</span>
      <span class="jam-tarikh">${tarikh}</span>
      <div class="jam-kota">London ${jamKota(d, "Europe/London")} · New York ${jamKota(d, "America/New_York")}</div>
      <div class="sesi-chips">${chips}</div>
      ${badgeOrderHtml(d)}
      <span class="jam-nota">Status berdasarkan kecairan sesi, bukan isyarat arah.</span>`;
  };
  tik();
  jamPemasa = setInterval(tik, 1000);
}

// Countdown tutup lilin untuk skrin Carta — pemasa berasingan, dibersihkan setiap tukar skrin.
let countdownPemasa = null;
function hentiCountdown() {
  if (countdownPemasa) {
    clearInterval(countdownPemasa);
    countdownPemasa = null;
  }
}
function mulaCountdown(el, getInterval) {
  const tik = () => {
    const { saatBaki } = masaTutupLilin(new Date(), getInterval());
    el.textContent = `Lilin tutup dalam ${formatBaki(saatBaki)}`;
  };
  tik();
  countdownPemasa = setInterval(tik, 1000);
}

// ---- Skrin ----

function skrinWatchlist() {
  tajukEl.textContent = "Watchlist Forex";
  app.innerHTML = `
    <div class="jam" id="jam"></div>
    <div class="ticker-wrap" id="ticker"></div>
    <div class="senarai-kad"></div>`;
  mulaJam(app.querySelector("#jam"));
  W.widgetTickerTape(app.querySelector("#ticker"));
  const wrap = app.querySelector(".senarai-kad");
  for (const p of PAIRS) {
    const kad = document.createElement("article");
    kad.className = "kad-pair";
    kad.innerHTML = `
      <header class="kad-head">
        <div><b>${p.id}</b><span class="sub">${p.nama}</span></div>
        <div class="kad-pautan">
          <a class="lihat" href="#mtf/${p.id}">MTF</a>
          <a class="lihat" href="#chart/${p.id}">Carta →</a>
        </div>
      </header>
      <div class="kad-widget"></div>`;
    wrap.appendChild(kad);
    W.widgetTeknikal(kad.querySelector(".kad-widget"), p.tv, "1h");
  }
}

// Skrin Multi-Timeframe — tolok teknikal 1J / 4J / Harian bersebelahan untuk lihat
// konfluens trend sepintas lalu. Tolok visual sahaja (widget iframe tak boleh dibaca).
const MTF_TF = [
  { label: "1 Jam", v: "1h" },
  { label: "4 Jam", v: "4h" },
  { label: "Harian", v: "1D" },
];
function skrinMtf(pairId) {
  const p = cariPair(pairId);
  tajukEl.textContent = `MTF ${p.id}`;
  app.innerHTML = `
    <div class="bar-pilih">
      <select id="pilih-pair">${PAIRS.map(
        (x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${x.id}</option>`
      ).join("")}</select>
      <a class="lihat" href="#chart/${p.id}">Buka Carta →</a>
    </div>
    <p class="nota">Penjajaran trend antara timeframe — cari konfluens (ketiga-tiga selari) sebelum masuk. Tolok visual sahaja.</p>
    <div class="mtf-grid">
      ${MTF_TF.map(
        (t) =>
          `<div class="mtf-sel"><div class="mtf-tajuk">${t.label}</div><div class="mtf-widget" data-tf="${t.v}"></div></div>`
      ).join("")}
    </div>`;
  app.querySelectorAll(".mtf-widget").forEach((el) => {
    W.widgetTeknikal(el, p.tv, el.dataset.tf);
  });
  app.querySelector("#pilih-pair").addEventListener("change", (e) => {
    location.hash = `#mtf/${e.target.value}`;
  });
}

function skrinCarta(pairId) {
  const p = cariPair(pairId);
  tajukEl.textContent = `Carta ${p.id}`;
  app.innerHTML = `
    <div class="bar-pilih">
      <select id="pilih-pair">${PAIRS.map(
        (x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${x.id}</option>`
      ).join("")}</select>
      <div class="tf">${TF.map(
        (t) => `<button class="tfbtn" data-v="${t.v}">${t.label}</button>`
      ).join("")}</div>
    </div>
    <div class="bar-status">
      <div id="badge-carta"></div>
      <span class="countdown" id="countdown"></span>
    </div>
    <div id="gng"></div>
    <div class="carta-wrap" id="carta"></div>
    <div class="kotak berita" id="berita-panel">
      <div class="berita-head">
        <b>📅 Berita impak tinggi</b>
        <button class="btn-kecil" id="berita-toggle">Tunjuk kalendar</button>
      </div>
      <p class="nota">Salin acara dari kalendar TV. Acara <b>impak tinggi</b> dalam ±30 min akan menghalang dagangan (gate NO TRADE); impak sederhana hanya menurunkan markah.</p>
      <ul class="berita-senarai" id="berita-senarai"></ul>
      <div class="berita-tambah">
        <input id="berita-nama" type="text" placeholder="Nama acara (cth. CPI)" aria-label="Nama acara">
        <input id="berita-mw" type="text" maxlength="3" placeholder="USD" aria-label="Mata wang">
        <select id="berita-impak" aria-label="Tahap impak">
          <option value="tinggi">Impak tinggi</option>
          <option value="sederhana">Impak sederhana</option>
          <option value="rendah">Impak rendah</option>
        </select>
        <input id="berita-masa" type="datetime-local" aria-label="Masa acara">
        <button class="btn-kecil" id="berita-tambah">+ Tambah acara</button>
      </div>
      <div class="berita-kal" id="berita-kal" hidden></div>
    </div>
    <p class="nota">Tip: dalam carta, klik ikon loceng untuk set alert masa-nyata TradingView (perlu akaun TV percuma). Baca nilai ATR(14) di sini untuk kalkulator.</p>`;

  app.querySelector("#badge-carta").innerHTML = badgeOrderHtml(new Date());
  const cartaEl = app.querySelector("#carta");
  let interval = "60";
  const lukis = () => W.widgetCarta(cartaEl, cariPair(getSel()).tv, interval);
  const getSel = () => app.querySelector("#pilih-pair").value;
  mulaCountdown(app.querySelector("#countdown"), () => interval);

  app.querySelector("#pilih-pair").addEventListener("change", (e) => {
    location.hash = `#chart/${e.target.value}`;
  });
  app.querySelectorAll(".tfbtn").forEach((b) => {
    b.classList.toggle("aktif", b.dataset.v === interval);
    b.addEventListener("click", () => {
      interval = b.dataset.v;
      app.querySelectorAll(".tfbtn").forEach((x) => x.classList.toggle("aktif", x === b));
      lukis();
    });
  });
  lukis();

  // Panel Go/No-Go — guna interval carta semasa untuk timing lilin.
  renderChecklist(app.querySelector("#gng"), { getInterval: () => interval });

  // Panel berita: senarai acara + kalendar impak-tinggi boleh-lipat.
  const senaraiEl = app.querySelector("#berita-senarai");
  const masaEl = app.querySelector("#berita-masa");
  const namaEl = app.querySelector("#berita-nama");
  const mwEl = app.querySelector("#berita-mw");
  const impakEl = app.querySelector("#berita-impak");

  function lukisAcara() {
    const { senarai } = jarakAcara(new Date());
    if (!senarai.length) {
      senaraiEl.innerHTML = `<li class="nota">Tiada acara direkod.</li>`;
      return;
    }
    senaraiEl.innerHTML = senarai
      .map(
        (a) =>
          `<li class="berita-item impak-${a.impak}${a.bahaya ? " berita-bahaya" : ""}">
             <span class="berita-mw">${escapeHtml(a.mataWang || "—")}</span>
             <span class="berita-nama">${escapeHtml(a.nama)}</span>
             <span class="berita-kira">${a.lalu ? `${Math.abs(Math.round(a.minit))} min lalu` : `${Math.round(a.minit)} min lagi`}</span>
             <button class="btn-kecil berita-buang" data-id="${escapeHtml(a.id)}" aria-label="Buang acara">✕</button>
           </li>`
      )
      .join("");
    senaraiEl.querySelectorAll(".berita-buang").forEach((b) =>
      b.addEventListener("click", () => {
        padamAcara(b.dataset.id);
        lukisAcara();
      })
    );
  }

  app.querySelector("#berita-tambah").addEventListener("click", () => {
    if (!masaEl.value) {
      masaEl.focus();
      return;
    }
    const d = new Date(masaEl.value);
    if (isNaN(d.getTime())) return;
    simpanAcara([
      ...bacaAcara(),
      {
        id: `a-${d.getTime()}-${Math.round(d.getTime() % 9973)}`,
        nama: namaEl.value.trim() || "Berita",
        mataWang: mwEl.value.trim(),
        impak: impakEl.value,
        masa: d,
      },
    ]);
    namaEl.value = "";
    mwEl.value = "";
    masaEl.value = "";
    lukisAcara();
  });
  lukisAcara();
  const kalEl = app.querySelector("#berita-kal");
  const toggleEl = app.querySelector("#berita-toggle");
  toggleEl.addEventListener("click", () => {
    const tunjuk = kalEl.hidden;
    kalEl.hidden = !tunjuk;
    toggleEl.textContent = tunjuk ? "Sembunyi kalendar" : "Tunjuk kalendar";
    if (tunjuk && !kalEl.dataset.dimuat) {
      W.widgetKalendar(kalEl, { importanceFilter: "1" }); // impak tinggi sahaja
      kalEl.dataset.dimuat = "1";
    }
  });
}

function skrinScreener() {
  tajukEl.textContent = "Screener Forex";
  app.innerHTML = `
    <div class="tab-screener">
      <button class="sbtn aktif" data-w="screener">Senarai</button>
      <button class="sbtn" data-w="heat">Heat Map</button>
      <button class="sbtn" data-w="cross">Kadar Silang</button>
      <button class="sbtn" data-w="calendar">Kalendar</button>
    </div>
    <div class="screener-wrap" id="sc-host"></div>`;
  const hostEl = app.querySelector("#sc-host");
  const lukis = (w) => {
    if (w === "heat") W.widgetHeatMap(hostEl);
    else if (w === "cross") W.widgetCrossRates(hostEl);
    else if (w === "calendar") W.widgetKalendar(hostEl);
    else W.widgetScreener(hostEl);
  };
  app.querySelectorAll(".sbtn").forEach((b) =>
    b.addEventListener("click", () => {
      app.querySelectorAll(".sbtn").forEach((x) => x.classList.toggle("aktif", x === b));
      lukis(b.dataset.w);
    })
  );
  lukis("screener");
}

function skrinDashboard(pairId) {
  // Tiada arg (cth tekan tab "Skor") → guna pasangan terakhir dilihat.
  let last = null;
  try {
    last = localStorage.getItem("db_pair");
  } catch {
    /* abai */
  }
  const p = cariPair(pairId || last || "EURUSD");
  tajukEl.textContent = `Dashboard ${p.id}`;
  app.innerHTML = `<div class="padded"></div>`;
  renderDashboard(app.querySelector(".padded"), p.id);
}

function skrinKalkulator(awal) {
  tajukEl.textContent = "Kalkulator Entry / SL / TP";
  app.innerHTML = `<div class="padded"></div>`;
  renderKalkulator(app.querySelector(".padded"), awal);
}

function skrinAlerts() {
  tajukEl.textContent = "Alert";
  app.innerHTML = `<div class="padded"></div>`;
  renderAlerts(app.querySelector(".padded"));
}

function skrinJurnal() {
  tajukEl.textContent = "Jurnal Dagangan";
  app.innerHTML = `<div class="padded"></div>`;
  renderJurnal(app.querySelector(".padded"));
}

// ---- Router ----

function route() {
  const hash = location.hash || "#watchlist";
  // Pisahkan rentetan pertanyaan dahulu: Dashboard menyerahkan pelan dagangan
  // melalui #calc?pair=…&arah=…&entry=…&atr=…
  const [laluan, pertanyaan] = hash.replace(/^#/, "").split("?");
  const [rute, arg] = laluan.split("/");
  const params = Object.fromEntries(new URLSearchParams(pertanyaan || ""));
  window.scrollTo(0, 0);
  hentiJam(); // hentikan jam skrin sebelum (jika ada)
  hentiCountdown(); // hentikan countdown lilin skrin sebelum (jika ada)
  hentiChecklist(); // hentikan pemasa panel Go/No-Go skrin sebelum (jika ada)
  switch (rute) {
    case "dashboard":
      skrinDashboard(arg);
      setActiveNav("dashboard");
      break;
    case "chart":
      skrinCarta(arg);
      setActiveNav("watchlist");
      break;
    case "mtf":
      skrinMtf(arg);
      setActiveNav("watchlist");
      break;
    case "screener":
      skrinScreener();
      setActiveNav("screener");
      break;
    case "calc":
      skrinKalkulator(Object.keys(params).length ? params : null);
      setActiveNav("calc");
      break;
    case "alerts":
      skrinAlerts();
      setActiveNav("alerts");
      break;
    case "jurnal":
      skrinJurnal();
      setActiveNav("jurnal");
      break;
    default:
      skrinWatchlist();
      setActiveNav("watchlist");
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
  route();
  mulaTinjauan(); // semak alert tersimpan semasa app dibuka
  // Daftar service worker (PWA boleh-pasang)
  if ("serviceWorker" in navigator) {
    daftarServiceWorker();
  }
});

// Daftar SW + tunjuk toast "versi baharu" bila SW baharu MENUNGGU. Pengguna kawal
// bila muat semula (elak reload mengejut di tengah kerja).
function daftarServiceWorker() {
  const sw = navigator.serviceWorker;
  // Reload SEKALI selepas SW baharu ambil alih (dicetus oleh SKIP_WAITING).
  let dahReload = false;
  sw.addEventListener("controllerchange", () => {
    if (dahReload) return;
    dahReload = true;
    location.reload();
  });

  sw.register("./service-worker.js", { updateViaCache: "none" })
    .then((reg) => {
      const papar = (worker) => tunjukToastKemasKini(worker);
      // Sudah ada versi menunggu (dikesan sebelum pendaftaran selesai).
      if (reg.waiting && navigator.serviceWorker.controller) papar(reg.waiting);
      // Versi baharu ditemui semasa sesi ini.
      reg.addEventListener("updatefound", () => {
        const baharu = reg.installing;
        if (!baharu) return;
        baharu.addEventListener("statechange", () => {
          if (baharu.state === "installed" && navigator.serviceWorker.controller) papar(baharu);
        });
      });
    })
    .catch(() => {});
}

// Papar toast dengan butang "Muat semula". Tekan → suruh SW menunggu ambil alih.
function tunjukToastKemasKini(worker) {
  const el = document.getElementById("sw-toast");
  if (!el || el.dataset.tunjuk === "1") return;
  el.dataset.tunjuk = "1";
  el.hidden = false;
  el.querySelector("#sw-toast-btn").addEventListener("click", () => {
    worker.postMessage({ type: "SKIP_WAITING" });
    el.hidden = true;
  });
}
