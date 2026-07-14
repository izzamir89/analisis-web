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
import { bacaBerita, simpanBerita } from "./news.js";

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
      <label class="nota">Masa berita merah seterusnya (waktu tempatan) — salin dari kalendar TV sekali, ia menyuap panel Go/No-Go di atas.
        <input id="berita-masa" type="datetime-local">
      </label>
      <button class="btn-kecil" id="berita-padam">Padam masa berita</button>
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

  // Panel berita: input masa berita merah + kalendar impak-tinggi boleh-lipat.
  const masaEl = app.querySelector("#berita-masa");
  const tersimpan = bacaBerita();
  if (tersimpan) masaEl.value = keInputLokal(tersimpan);
  masaEl.addEventListener("change", () => simpanBerita(masaEl.value));
  app.querySelector("#berita-padam").addEventListener("click", () => {
    simpanBerita(null);
    masaEl.value = "";
  });
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

// Tukar Date → string "YYYY-MM-DDTHH:MM" waktu tempatan untuk input datetime-local.
function keInputLokal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function skrinKalkulator() {
  tajukEl.textContent = "Kalkulator Entry / SL / TP";
  app.innerHTML = `<div class="padded"></div>`;
  renderKalkulator(app.querySelector(".padded"));
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
  const [rute, arg] = hash.replace(/^#/, "").split("/");
  window.scrollTo(0, 0);
  hentiJam(); // hentikan jam skrin sebelum (jika ada)
  hentiCountdown(); // hentikan countdown lilin skrin sebelum (jika ada)
  hentiChecklist(); // hentikan pemasa panel Go/No-Go skrin sebelum (jika ada)
  switch (rute) {
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
      skrinKalkulator();
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
    // updateViaCache:"none" → pelayar sentiasa semak SW baharu dari rangkaian
    // (abai cache HTTP 10-minit), jadi deploy baharu dikesan segera.
    navigator.serviceWorker
      .register("./service-worker.js", { updateViaCache: "none" })
      .catch(() => {});
    // Auto-reload SEKALI bila SW baharu ambil alih — elak paparan basi selepas deploy.
    // Hanya reload jika halaman sudah dikawal SW lama (bukan pemasangan pertama).
    const adaController = !!navigator.serviceWorker.controller;
    let dahReload = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (dahReload || !adaController) return;
      dahReload = true;
      location.reload();
    });
  }
});
