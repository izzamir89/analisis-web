// Skrin Scan — nilaikan KESEMUA pasangan sekali jalan, ranking ikut kebolehdagangan.
//
// KENAPA SKRIN INI WUJUD: dashboard menilai satu pasangan setiap kali, dan enjin ini
// berkata tunggu pada majoriti bar. Mencari setup bermakna membuka lapan pasangan satu
// demi satu dan selalunya menemui sifar. Skrin ini menjadikan kerja itu satu tekanan
// butang, dan — lebih penting — ia memaparkan apa yang DITOLAK berserta sebabnya, jadi
// "tiada apa-apa hari ini" menjadi jawapan yang boleh anda percayai dan bukan jawapan
// yang anda syak disebabkan anda tidak menyemak cukup pasangan.
//
// KUOTA: 3 kredit setiap pasangan (lo/mid/hi) = 24 untuk imbasan penuh. TTL cache dalam
// marketdata.js bermakna mengimbas semula dalam tempoh TTL adalah percuma, jadi tier
// percuma (800/hari) memuatkan ~33 imbasan penuh sehari.

import { PAIRS } from "./pairs.js";
import { ambilOHLC, adaKunciApi, statusKuota } from "./marketdata.js";
import { ambilMod } from "./mod.js";
import { analisaPasangan, susunKeputusan, sebabRingkas } from "./analisis.js";
import { jarakAcara } from "./news.js";
import { bakiRisikoHarian } from "./risk.js";
import { baca as bacaJurnal } from "./journal.js";
import { kalahBerturutHariIni } from "./analytics.js";
import { escapeHtml, bacaJSON } from "./store.js";

const SPINNER = '<span class="spinner" aria-hidden="true"></span>';
const KELAS_VERDICT = {
  BUY: "verdict-buy",
  SELL: "verdict-sell",
  WAIT: "verdict-wait",
  "NO TRADE": "verdict-notrade",
};

export function renderScanner(host, modId = "swing") {
  const mod = ambilMod(modId);

  host.innerHTML = `
    <div class="db-bar">
      <select id="scan-mod" class="db-pair">
        <option value="swing" ${modId === "swing" ? "selected" : ""}>📊 Swing</option>
        <option value="scalp" ${modId === "scalp" ? "selected" : ""}>⚡ Scalp</option>
      </select>
      <button class="btn-utama btn-muat" id="scan-jalan">🔎 Imbas ${PAIRS.length} pasangan</button>
    </div>
    <p class="nota">Menilai kesemua pasangan dengan enjin yang <b>sama</b> seperti skrin Skor.
      ~${PAIRS.length * 3} kredit untuk imbasan penuh; pasangan yang datanya masih segar dalam cache adalah percuma.
      Yang ditolak turut dipaparkan berserta sebab — supaya "tiada setup" ialah jawapan, bukan tekaan.</p>
    <div id="scan-kuota" class="db-kuota"></div>
    <div id="scan-status" class="nota"></div>
    <div id="scan-hasil"></div>`;

  const statusEl = host.querySelector("#scan-status");
  const hasilEl = host.querySelector("#scan-hasil");
  const kuotaEl = host.querySelector("#scan-kuota");

  host.querySelector("#scan-mod").addEventListener("change", (e) => {
    location.hash = `#scan/${e.target.value}`;
  });
  host.querySelector("#scan-jalan").addEventListener("click", imbas);

  function lukisKuota() {
    const q = statusKuota();
    kuotaEl.textContent = `Kuota API — minit ${q.minitBaki}/${q.minitHad} · hari ${q.hariDigunakan}/${q.hariHad}`;
  }

  async function imbas() {
    if (!adaKunciApi()) {
      statusEl.innerHTML = `⚠️ Tiada kunci API. Buka <a href="#calc">Kalkulator → ⚙️ Kunci API</a> untuk kunci Twelve Data percuma.`;
      return;
    }
    const btn = host.querySelector("#scan-jalan");
    btn.disabled = true;
    hasilEl.innerHTML = "";

    const now = new Date();
    const berita = jarakAcara(now);
    const jurnal = bacaJurnal();
    const had = Number(bacaJSON("risk_daily_limit", 0)) || 0;
    const risikoHarian = had > 0 ? bakiRisikoHarian(jurnal, now, had) : null;
    const kalahBerturut = kalahBerturutHariIni(jurnal, now);

    const keputusan = [];
    for (let i = 0; i < PAIRS.length; i++) {
      const pr = PAIRS[i];
      statusEl.innerHTML = `${SPINNER} Mengimbas ${pr.id} (${i + 1}/${PAIRS.length})…`;
      const [rLo, rMid, rHi] = await Promise.all([
        ambilOHLC(pr.id, mod.tf.lo, { outputsize: mod.saiz.lo }),
        ambilOHLC(pr.id, mod.tf.mid, { outputsize: mod.saiz.mid }),
        ambilOHLC(pr.id, mod.tf.hi, { outputsize: mod.saiz.hi }),
      ]);
      const hasil = analisaPasangan({
        pairId: pr.id,
        mod,
        candlesLo: rLo.candles,
        candlesMid: rMid.candles,
        candlesHi: rHi.candles,
        now,
        berita,
        risikoHarian,
        kalahBerturut,
      });
      keputusan.push({ pair: pr, hasil, ralat: rLo.ralat || null });
      lukisKuota();
      lukis(keputusan);
    }

    statusEl.textContent = `Siap — ${keputusan.length} pasangan diimbas pada ${now.toLocaleTimeString()}.`;
    btn.disabled = false;
  }

  function lukis(keputusan) {
    const disusun = susunKeputusan(keputusan);
    const bolehDagang = disusun.filter(
      (r) => r.hasil && (r.hasil.verdict === "BUY" || r.hasil.verdict === "SELL")
    );

    const baris = disusun
      .map((r) => {
        const h = r.hasil;
        if (!h) {
          return `<tr class="scan-mati"><td><b>${escapeHtml(r.pair.id)}</b></td><td>—</td>
            <td class="nota">${escapeHtml(r.ralat || "Data tiada.")}</td></tr>`;
        }
        const kelas = KELAS_VERDICT[h.verdict] || "";
        const boleh = h.verdict === "BUY" || h.verdict === "SELL";
        const sebab = boleh
          ? `Gred ${h.gred} · ${escapeHtml(h.arah)}${h.kos && h.kos.rrBersih != null ? ` · R:R bersih 1:${h.kos.rrBersih.toFixed(2)}` : ""}`
          : escapeHtml(sebabRingkas(h));
        return `<tr class="${boleh ? "scan-boleh" : "scan-mati"}">
            <td><a href="#${mod.rute}/${r.pair.id}"><b>${escapeHtml(r.pair.id)}</b></a></td>
            <td class="${kelas}">${h.verdict} <i class="nota">${h.skor}</i></td>
            <td class="nota">${sebab}</td>
          </tr>`;
      })
      .join("");

    hasilEl.innerHTML = `
      <div class="kotak">
        <h3>${bolehDagang.length ? `${bolehDagang.length} setup boleh dagang` : "Tiada setup boleh dagang"}</h3>
        ${
          bolehDagang.length
            ? ""
            : `<p class="nota">Ini keputusan yang sah, bukan kegagalan. Enjin menolak setiap pasangan atas sebab yang tersenarai di bawah —
                 tiada dagangan ialah jawapan yang betul apabila tiada yang memenuhi syarat.</p>`
        }
        <table class="hasil scan-t">
          <tr><th>Pasangan</th><th>Verdict</th><th>Sebab</th></tr>
          ${baris}
        </table>
        <p class="nota">Tekan pasangan untuk membuka analisis penuhnya. Verdict di sini menggunakan enjin, gate kos
          dan gate risiko yang sama seperti skrin ${mod.label}.</p>
      </div>`;
  }

  lukisKuota();
  if (!adaKunciApi()) {
    statusEl.innerHTML = `Tetapkan kunci API di <a href="#calc">Kalkulator → ⚙️</a> untuk mengimbas.`;
  }
}
