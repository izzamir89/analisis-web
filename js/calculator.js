// Kalkulator dagangan rule-based — 100% tempatan, tiada AI.
// SL = ATR × pengganda; TP = jarak SL × nisbah R:R; saiz lot dari risiko %.
// Konsep R:R minimum dicermin dari engine/core/risk.py (RISK_MIN_RR, lalai 1.5).
// Panel risiko (had kerugian harian + pendedahan) & setup tersimpan turut di sini.
import { PAIRS, cariPair } from "./pairs.js";
import { tambah as tambahJurnal, baca as bacaJurnal } from "./journal.js";
import { statusMasaOrder } from "./sessions.js";
import { bacaJSON, simpanJSON, escapeHtml } from "./store.js";
import { amaranPendedahan, bakiRisikoHarian } from "./risk.js";
import { ambilOHLC, bacaTetapanApi, simpanTetapanApi } from "./marketdata.js";
import { atr as kiraAtr } from "./indicators.js";

export const RR_MIN = 1.5;

const KUNCI_HAD = "risk_daily_limit";
const KUNCI_SETUP = "forex_setups";
// Mata wang akaun yang disokong frankfurter (kadar harian ECB) untuk penukaran pip.
const AKAUN = ["USD", "EUR", "GBP", "AUD", "JPY", "SGD", "MYR"];

// Saiz kontrak satu lot standard: forex = 100,000 unit; emas = 100 oz.
function saizKontrak(id) {
  return id === "XAUUSD" ? 100 : 100000;
}

// Nilai satu pip bagi satu lot standard, dalam USD (anggapan akaun USD).
export function nilaiPipSeLot(pair, harga) {
  const cs = saizKontrak(pair.id);
  const quote = pair.id.slice(3); // 3 huruf terakhir = mata wang sebut harga
  if (pair.id === "XAUUSD") return pair.pip * cs; // 0.1 × 100 = $10
  if (quote === "USD") return pair.pip * cs; // XXX/USD → ~$10 sepip
  // USD/XXX → tukar ke USD ikut harga semasa
  return (pair.pip * cs) / harga;
}

// Kira cadangan dagangan. Pulangkan objek lengkap + amaran jika R:R rendah.
// input.kadarUsd: 1 unit mata wang akaun = kadarUsd USD (lalai 1 = akaun USD).
export function kiraDagangan(input) {
  const pair = cariPair(input.pairId);
  const arah = input.arah; // "Buy" | "Sell"
  const entry = Number(input.entry);
  const atr = Number(input.atr);
  const pengganda = Number(input.pengganda) || 1.5;
  const rr = Number(input.rr) || 2;
  // TP2 pada nisbah lebih tinggi (lalai 3, atau rr+1 jika rr sudah tinggi).
  const rr2 = Number(input.rr2) > rr ? Number(input.rr2) : Math.max(3, rr + 1);
  const baki = Number(input.baki);
  const risikoPct = Number(input.risikoPct);
  const kadarUsd = Number(input.kadarUsd) > 0 ? Number(input.kadarUsd) : 1;

  const ralat = [];
  if (!(entry > 0)) ralat.push("Harga masuk tidak sah.");
  if (!(atr > 0)) ralat.push("Nilai ATR tidak sah (baca dari carta).");
  if (ralat.length) return { ralat };

  const jarakSL = atr * pengganda; // dalam unit harga
  const jarakTP1 = jarakSL * rr;
  const jarakTP2 = jarakSL * rr2;
  const arahNaik = arah === "Buy";
  const sl = arahNaik ? entry - jarakSL : entry + jarakSL;
  const tp1 = arahNaik ? entry + jarakTP1 : entry - jarakTP1;
  const tp2 = arahNaik ? entry + jarakTP2 : entry - jarakTP2;

  const slPip = jarakSL / pair.pip;
  const tp1Pip = jarakTP1 / pair.pip;
  const tp2Pip = jarakTP2 / pair.pip;

  let lot = null;
  let amaunRisiko = null;
  if (baki > 0 && risikoPct > 0) {
    amaunRisiko = (baki * risikoPct) / 100; // dalam mata wang akaun
    // Nilai pip ditukar ke mata wang akaun: pipUSD ÷ (USD per unit akaun).
    const nilaiPipAkaun = nilaiPipSeLot(pair, entry) / kadarUsd;
    const risikoSeLot = slPip * nilaiPipAkaun;
    lot = risikoSeLot > 0 ? amaunRisiko / risikoSeLot : null;
  }

  const amaran = [];
  if (rr < RR_MIN) {
    amaran.push(`Nisbah R:R (${rr.toFixed(2)}) di bawah minimum disarankan ${RR_MIN}.`);
  }

  const tp1R = round(tp1, pair.digit);
  const tp1PipR = round(tp1Pip, 1);
  return {
    pair,
    arah,
    entry,
    sl: round(sl, pair.digit),
    slPip: round(slPip, 1),
    // TP1 utama + alias `tp`/`tpPip` (jimat-belakang untuk jurnal & ujian sedia ada).
    tp1: tp1R,
    tp1Pip: tp1PipR,
    tp2: round(tp2, pair.digit),
    tp2Pip: round(tp2Pip, 1),
    tp: tp1R,
    tpPip: tp1PipR,
    rr,
    rr2,
    lot: lot != null ? round(lot, 2) : null,
    amaunRisiko: amaunRisiko != null ? round(amaunRisiko, 2) : null,
    amaran,
  };
}

function round(x, d) {
  const f = Math.pow(10, d);
  return Math.round(x * f) / f;
}

// ---- Setup tersimpan ----
const bacaSetups = () => bacaJSON(KUNCI_SETUP, []);
function simpanSetup(nama, nilai) {
  const list = bacaSetups().filter((s) => s.nama !== nama);
  list.push({ nama, ...nilai });
  simpanJSON(KUNCI_SETUP, list);
}

// Bina UI borang kalkulator dalam `host`.
export function renderKalkulator(host) {
  const opsiPair = PAIRS.map((p) => `<option value="${p.id}">${p.id} — ${p.nama}</option>`).join(
    ""
  );
  const opsiAkaun = AKAUN.map((c) => `<option value="${c}">${c}</option>`).join("");
  host.innerHTML = `
    <div class="kotak risiko-panel" id="panel-risiko"></div>

    <div class="setup-bar">
      <select id="muat-setup" aria-label="Muat setup tersimpan"></select>
      <button type="button" class="btn-kecil" id="simpan-setup">💾 Simpan setup</button>
    </div>

    <details class="kotak tetapan-api" id="tetapan-api">
      <summary>⚙️ Kunci API data pasaran (pilihan)</summary>
      <p class="nota">Masukkan kunci <b>Twelve Data</b> (tier percuma) untuk isi ATR & harga secara automatik. <b>Amaran:</b> kunci disimpan di peranti ini dan boleh dilihat sesiapa yang ada akses peranti/devtools — guna kunci percuma tanpa bil. Kosongkan untuk kekal input manual.</p>
      <label>Kunci API<input id="api-key" type="password" autocomplete="off" placeholder="cth. abcd1234..."></label>
      <button type="button" class="btn-kecil" id="simpan-api">💾 Simpan kunci</button>
      <span id="status-api" class="nota"></span>
    </details>

    <form id="form-kira" class="kira">
      <p class="nota">Baca <b>harga semasa</b> dan <b>ATR(14)</b> dari carta TradingView (atau tekan <b>Auto</b> jika kunci API disetkan), kemudian masukkan di bawah. Semua pengiraan dibuat di telefon — tiada data dihantar ke mana-mana (kecuali data pasaran & kadar tukaran bila diminta).</p>
      <label>Pasangan
        <select name="pairId">${opsiPair}</select>
      </label>
      <div class="grid2">
        <label>Arah
          <select name="arah"><option value="Buy">Beli (Buy)</option><option value="Sell">Jual (Sell)</option></select>
        </label>
        <label>Mata wang akaun
          <select name="akaun">${opsiAkaun}</select>
        </label>
      </div>
      <div class="grid2">
        <label>Harga masuk<input name="entry" type="number" step="any" inputmode="decimal" placeholder="cth. 1.08500"></label>
        <label>ATR(14)
          <span class="atr-baris">
            <input name="atr" type="number" step="any" inputmode="decimal" placeholder="cth. 0.00120">
            <button type="button" class="btn-kecil" id="muat-atr">⤓ Auto</button>
          </span>
        </label>
      </div>
      <p id="status-atr" class="nota" aria-live="polite"></p>
      <div class="grid2">
        <label>Pengganda ATR (SL)<input name="pengganda" type="number" step="any" inputmode="decimal" value="1.5"></label>
        <label>Nisbah R:R (TP1)<input name="rr" type="number" step="any" inputmode="decimal" value="2"></label>
      </div>
      <label>Nisbah R:R (TP2)<input name="rr2" type="number" step="any" inputmode="decimal" value="3"></label>
      <div class="grid2">
        <label>Baki akaun<input name="baki" type="number" step="any" inputmode="decimal" placeholder="cth. 1000"></label>
        <label>Risiko %<input name="risikoPct" type="number" step="any" inputmode="decimal" value="1"></label>
      </div>
      <button type="submit" class="btn-utama">Kira</button>
    </form>
    <div id="hasil-kira"></div>
  `;

  const form = host.querySelector("#form-kira");
  const hasil = host.querySelector("#hasil-kira");
  const panelRisiko = host.querySelector("#panel-risiko");
  const muatEl = host.querySelector("#muat-setup");

  // ---- Tetapan kunci API (Twelve Data) ----
  const apiKeyEl = host.querySelector("#api-key");
  const statusApiEl = host.querySelector("#status-api");
  apiKeyEl.value = bacaTetapanApi().apikey;
  statusApiEl.textContent = apiKeyEl.value ? "✅ Kunci disetkan." : "";
  host.querySelector("#simpan-api").addEventListener("click", () => {
    simpanTetapanApi({ apikey: apiKeyEl.value.trim() });
    statusApiEl.textContent = apiKeyEl.value.trim() ? "✅ Kunci disimpan." : "Kunci dikosongkan.";
  });

  // ---- Auto-ATR: ambil OHLC 1J → kira ATR(14) → isi medan (harga juga jika kosong) ----
  const statusAtrEl = host.querySelector("#status-atr");
  host.querySelector("#muat-atr").addEventListener("click", async (e) => {
    const btn = e.target;
    const pair = cariPair(form.elements.pairId.value);
    if (!bacaTetapanApi().apikey) {
      statusAtrEl.textContent = "⚠️ Tiada kunci API — buka ⚙️ di atas atau isi ATR manual.";
      return;
    }
    btn.disabled = true;
    statusAtrEl.textContent = "⏳ Mengambil data…";
    const { candles, sumber, ralat } = await ambilOHLC(pair.id, "60");
    btn.disabled = false;
    if (!candles || !candles.length) {
      statusAtrEl.textContent = `⚠️ ${ralat || "Gagal ambil data"} — isi ATR manual.`;
      return;
    }
    const nilaiAtr = kiraAtr(candles, 14)
      .filter((v) => v != null)
      .pop();
    if (nilaiAtr == null) {
      statusAtrEl.textContent = "⚠️ Data tak cukup untuk ATR(14) — isi manual.";
      return;
    }
    form.elements.atr.value = round(nilaiAtr, pair.digit);
    if (!form.elements.entry.value) {
      form.elements.entry.value = round(candles[candles.length - 1].c, pair.digit);
    }
    const lbl = { api: "langsung", cache: "cache" }[sumber] || sumber;
    statusAtrEl.textContent = `✅ ATR(14) & harga diisi (sumber: ${lbl}). Boleh disunting.`;
  });

  // ---- Panel risiko: had kerugian harian + pendedahan mata wang terbuka ----
  function lukisRisiko() {
    const jurnal = bacaJurnal();
    const had = Number(bacaJSON(KUNCI_HAD, 0)) || 0;
    const rk = bakiRisikoHarian(jurnal, new Date(), had);
    const pendedahan = amaranPendedahan(jurnal, 2);

    const barHtml =
      rk.had != null
        ? `<div class="risk-bar"><div class="risk-bar-isi ${rk.melebihi ? "bahaya" : ""}" style="width:${rk.peratus}%"></div></div>
           <div class="nota">Digunakan ${rk.digunakan} / had ${rk.had} · baki <b>${rk.baki}</b>${rk.melebihi ? " — ⛔ HAD DICAPAI, berhenti dagang hari ini" : ""}</div>`
        : `<div class="nota">Set had untuk menjejak kerugian harian.</div>`;

    const pendedahanHtml = pendedahan.length
      ? `<div class="kotak amaran" style="margin-top:10px">⚠️ Pendedahan berkorelasi: ${pendedahan
          .map(
            (p) => `<b>${p.net > 0 ? "+" : ""}${p.net} ${escapeHtml(p.mataWang)}</b> (${p.arah})`
          )
          .join(", ")}. Posisi terbuka anda tertumpu pada mata wang ini.</div>`
      : "";

    panelRisiko.innerHTML = `
      <h3>🛡️ Pengurus Risiko</h3>
      <label class="nota">Had kerugian harian (mata wang akaun)
        <input id="had-harian" type="number" step="any" inputmode="decimal" value="${had || ""}" placeholder="cth. 30">
      </label>
      ${barHtml}
      ${pendedahanHtml}`;

    panelRisiko.querySelector("#had-harian").addEventListener("change", (e) => {
      simpanJSON(KUNCI_HAD, Number(e.target.value) || 0);
      lukisRisiko();
    });
  }

  // ---- Setup tersimpan ----
  function lukisSetups() {
    const list = bacaSetups();
    muatEl.innerHTML =
      `<option value="">— Muat setup —</option>` +
      list
        .map((s) => `<option value="${escapeHtml(s.nama)}">${escapeHtml(s.nama)}</option>`)
        .join("");
  }
  muatEl.addEventListener("change", () => {
    const s = bacaSetups().find((x) => x.nama === muatEl.value);
    if (!s) return;
    for (const k of ["pairId", "arah", "akaun", "pengganda", "rr", "baki", "risikoPct"]) {
      const el = form.elements[k];
      if (el && s[k] != null) el.value = s[k];
    }
  });
  host.querySelector("#simpan-setup").addEventListener("click", () => {
    const nama = prompt("Nama setup (cth. London breakout):");
    if (!nama) return;
    const d = Object.fromEntries(new FormData(form).entries());
    simpanSetup(nama.trim(), {
      pairId: d.pairId,
      arah: d.arah,
      akaun: d.akaun,
      pengganda: d.pengganda,
      rr: d.rr,
      baki: d.baki,
      risikoPct: d.risikoPct,
    });
    lukisSetups();
    muatEl.value = nama.trim();
  });

  // ---- Kira ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const akaun = data.akaun || "USD";
    data.kadarUsd = 1;
    let notaAkaun = "";
    if (akaun !== "USD") {
      try {
        const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${akaun}&symbols=USD`);
        const j = await res.json();
        const kadar = j.rates && j.rates.USD;
        if (kadar > 0) {
          data.kadarUsd = kadar;
          notaAkaun = `Kadar ${akaun}→USD ≈ ${kadar} (harian ECB).`;
        } else {
          notaAkaun = "Gagal dapat kadar tukaran — saiz lot guna anggapan USD.";
        }
      } catch {
        notaAkaun = "Luar talian — saiz lot guna anggapan USD.";
      }
    }

    const r = kiraDagangan(data);
    if (r.ralat) {
      hasil.innerHTML = `<div class="kotak ralat">${r.ralat.join("<br>")}</div>`;
      return;
    }
    const lotBaris =
      r.lot != null
        ? `<tr><td>Saiz lot</td><td><b>${r.lot}</b> lot</td></tr><tr><td>Amaun risiko</td><td>${r.amaunRisiko} ${escapeHtml(akaun)}</td></tr>`
        : `<tr><td>Saiz lot</td><td><i>isi baki & risiko %</i></td></tr>`;
    const amaranHtml = r.amaran.length
      ? `<div class="kotak amaran">⚠️ ${r.amaran.join("<br>")}</div>`
      : "";
    const akaunHtml = notaAkaun ? `<p class="nota">${escapeHtml(notaAkaun)}</p>` : "";
    hasil.innerHTML = `
      <div class="kotak">
        <h3>${r.pair.id} — ${r.arah}</h3>
        <table class="hasil">
          <tr><td>Harga masuk</td><td>${r.entry}</td></tr>
          <tr><td>Stop Loss</td><td class="sl">${r.sl} <span class="pip">(${r.slPip} pip)</span></td></tr>
          <tr><td>Take Profit 1</td><td class="tp">${r.tp1} <span class="pip">(${r.tp1Pip} pip · R:R ${r.rr})</span></td></tr>
          <tr><td>Take Profit 2</td><td class="tp">${r.tp2} <span class="pip">(${r.tp2Pip} pip · R:R ${r.rr2})</span></td></tr>
          ${lotBaris}
        </table>
        ${amaranHtml}
        ${akaunHtml}
        <button type="button" class="btn-kedua" id="simpan-jurnal">📒 Simpan ke Jurnal</button>
      </div>`;

    hasil.querySelector("#simpan-jurnal").addEventListener("click", (ev) => {
      tambahJurnal({
        pairId: r.pair.id,
        arah: r.arah,
        entry: r.entry,
        sl: r.sl,
        tp: r.tp,
        tp2: r.tp2,
        rr: r.rr,
        lot: r.lot,
        amaunRisiko: r.amaunRisiko,
        sesi: statusMasaOrder(new Date()).label,
      });
      ev.target.textContent = "✅ Disimpan ke Jurnal";
      ev.target.disabled = true;
      lukisRisiko(); // pendedahan/baki mungkin berubah
    });
  });

  lukisRisiko();
  lukisSetups();
}
