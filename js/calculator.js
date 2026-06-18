// Kalkulator dagangan rule-based — 100% tempatan, tiada rangkaian, tiada AI.
// SL = ATR × pengganda; TP = jarak SL × nisbah R:R; saiz lot dari risiko %.
// Konsep R:R minimum dicermin dari engine/core/risk.py (RISK_MIN_RR, lalai 1.5).
import { PAIRS, cariPair } from "./pairs.js";

export const RR_MIN = 1.5;

// Saiz kontrak satu lot standard: forex = 100,000 unit; emas = 100 oz.
function saizKontrak(id) {
  return id === "XAUUSD" ? 100 : 100000;
}

// Nilai satu pip bagi satu lot standard, dalam USD (anggapan akaun USD).
function nilaiPipSeLot(pair, harga) {
  const cs = saizKontrak(pair.id);
  const quote = pair.id.slice(3); // 3 huruf terakhir = mata wang sebut harga
  if (pair.id === "XAUUSD") return pair.pip * cs; // 0.1 × 100 = $10
  if (quote === "USD") return pair.pip * cs; // XXX/USD → ~$10 sepip
  // USD/XXX → tukar ke USD ikut harga semasa
  return (pair.pip * cs) / harga;
}

// Kira cadangan dagangan. Pulangkan objek lengkap + amaran jika R:R rendah.
export function kiraDagangan(input) {
  const pair = cariPair(input.pairId);
  const arah = input.arah; // "Buy" | "Sell"
  const entry = Number(input.entry);
  const atr = Number(input.atr);
  const pengganda = Number(input.pengganda) || 1.5;
  const rr = Number(input.rr) || 2;
  const baki = Number(input.baki);
  const risikoPct = Number(input.risikoPct);

  const ralat = [];
  if (!(entry > 0)) ralat.push("Harga masuk tidak sah.");
  if (!(atr > 0)) ralat.push("Nilai ATR tidak sah (baca dari carta).");
  if (ralat.length) return { ralat };

  const jarakSL = atr * pengganda; // dalam unit harga
  const jarakTP = jarakSL * rr;
  const arahNaik = arah === "Buy";
  const sl = arahNaik ? entry - jarakSL : entry + jarakSL;
  const tp = arahNaik ? entry + jarakTP : entry - jarakTP;

  const slPip = jarakSL / pair.pip;
  const tpPip = jarakTP / pair.pip;

  let lot = null;
  let amaunRisiko = null;
  if (baki > 0 && risikoPct > 0) {
    amaunRisiko = (baki * risikoPct) / 100;
    const risikoSeLot = slPip * nilaiPipSeLot(pair, entry);
    lot = risikoSeLot > 0 ? amaunRisiko / risikoSeLot : null;
  }

  const amaran = [];
  if (rr < RR_MIN) {
    amaran.push(`Nisbah R:R (${rr.toFixed(2)}) di bawah minimum disarankan ${RR_MIN}.`);
  }

  return {
    pair,
    arah,
    entry,
    sl: round(sl, pair.digit),
    tp: round(tp, pair.digit),
    slPip: round(slPip, 1),
    tpPip: round(tpPip, 1),
    rr,
    lot: lot != null ? round(lot, 2) : null,
    amaunRisiko: amaunRisiko != null ? round(amaunRisiko, 2) : null,
    amaran,
  };
}

function round(x, d) {
  const f = Math.pow(10, d);
  return Math.round(x * f) / f;
}

// Bina UI borang kalkulator dalam `host`.
export function renderKalkulator(host) {
  const opsiPair = PAIRS.map((p) => `<option value="${p.id}">${p.id} — ${p.nama}</option>`).join("");
  host.innerHTML = `
    <form id="form-kira" class="kira">
      <p class="nota">Baca <b>harga semasa</b> dan <b>ATR(14)</b> dari carta TradingView, kemudian masukkan di bawah. Semua pengiraan dibuat di telefon — tiada data dihantar ke mana-mana.</p>
      <label>Pasangan
        <select name="pairId">${opsiPair}</select>
      </label>
      <label>Arah
        <select name="arah"><option value="Buy">Beli (Buy)</option><option value="Sell">Jual (Sell)</option></select>
      </label>
      <div class="grid2">
        <label>Harga masuk<input name="entry" type="number" step="any" inputmode="decimal" placeholder="cth. 1.08500"></label>
        <label>ATR(14)<input name="atr" type="number" step="any" inputmode="decimal" placeholder="cth. 0.00120"></label>
      </div>
      <div class="grid2">
        <label>Pengganda ATR (SL)<input name="pengganda" type="number" step="any" inputmode="decimal" value="1.5"></label>
        <label>Nisbah R:R<input name="rr" type="number" step="any" inputmode="decimal" value="2"></label>
      </div>
      <div class="grid2">
        <label>Baki akaun (USD)<input name="baki" type="number" step="any" inputmode="decimal" placeholder="cth. 1000"></label>
        <label>Risiko %<input name="risikoPct" type="number" step="any" inputmode="decimal" value="1"></label>
      </div>
      <button type="submit" class="btn-utama">Kira</button>
    </form>
    <div id="hasil-kira"></div>
  `;

  const form = host.querySelector("#form-kira");
  const hasil = host.querySelector("#hasil-kira");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const r = kiraDagangan(data);
    if (r.ralat) {
      hasil.innerHTML = `<div class="kotak ralat">${r.ralat.join("<br>")}</div>`;
      return;
    }
    const lotBaris = r.lot != null
      ? `<tr><td>Saiz lot</td><td><b>${r.lot}</b> lot</td></tr><tr><td>Amaun risiko</td><td>$${r.amaunRisiko}</td></tr>`
      : `<tr><td>Saiz lot</td><td><i>isi baki & risiko %</i></td></tr>`;
    const amaranHtml = r.amaran.length
      ? `<div class="kotak amaran">⚠️ ${r.amaran.join("<br>")}</div>` : "";
    hasil.innerHTML = `
      <div class="kotak">
        <h3>${r.pair.id} — ${r.arah}</h3>
        <table class="hasil">
          <tr><td>Harga masuk</td><td>${r.entry}</td></tr>
          <tr><td>Stop Loss</td><td class="sl">${r.sl} <span class="pip">(${r.slPip} pip)</span></td></tr>
          <tr><td>Take Profit</td><td class="tp">${r.tp} <span class="pip">(${r.tpPip} pip)</span></td></tr>
          <tr><td>R:R</td><td>${r.rr}</td></tr>
          ${lotBaris}
        </table>
        ${amaranHtml}
      </div>`;
  });
}
