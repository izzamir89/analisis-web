// Jurnal dagangan — 100% tempatan (localStorage), tiada rangkaian.
// Tangkap setup dari kalkulator sekali tekan; analitik bantu cari kelebihan (edge).
import { bacaJSON, simpanJSON, escapeHtml } from "./store.js";
import { ringkasan, ikutKumpulan, kelukEkuiti, streak, sesiEntri } from "./analytics.js";

const KUNCI = "forex_journal";

const HASIL = [
  { v: "open", t: "Terbuka" },
  { v: "win", t: "Menang" },
  { v: "loss", t: "Kalah" },
  { v: "be", t: "Seri (BE)" },
];

export function baca() {
  return bacaJSON(KUNCI, []);
}
function simpan(list) {
  simpanJSON(KUNCI, list);
}

// Tambah entri baru (id + cap masa diisi automatik). Pulang entri tersimpan.
export function tambah(entri) {
  const list = baca();
  const rekod = { id: Date.now(), ts: new Date().toISOString(), hasil: "open", nota: "", ...entri };
  list.unshift(rekod);
  simpan(list);
  return rekod;
}
export function padam(id) {
  simpan(baca().filter((e) => e.id !== id));
}
export function kemasHasil(id, hasil) {
  const list = baca();
  const e = list.find((x) => x.id === id);
  if (e) {
    e.hasil = hasil;
    simpan(list);
  }
}
export function kemasNota(id, nota) {
  const list = baca();
  const e = list.find((x) => x.id === id);
  if (e) {
    e.nota = nota;
    simpan(list);
  }
}
// R sebenar yang dicapai (pilihan) — kosong = anggaran automatik dari keputusan.
export function kemasRSebenar(id, nilai) {
  const list = baca();
  const e = list.find((x) => x.id === id);
  if (!e) return;
  const n = Number(nilai);
  if (nilai === "" || Number.isNaN(n)) delete e.rSebenar;
  else e.rSebenar = n;
  simpan(list);
}

function tarikhPendek(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Muat turun jurnal semasa sebagai fail JSON (sandaran).
function eksport() {
  const data = JSON.stringify(baca(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const cap = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `jurnal-forex-${cap}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import fail JSON → gabung dengan jurnal sedia ada (buang pendua ikut id). Pulang bilangan ditambah.
function importGabung(teks) {
  const masuk = JSON.parse(teks);
  if (!Array.isArray(masuk)) throw new Error("Format tidak sah — jangkakan array.");
  const sedia = baca();
  const idSedia = new Set(sedia.map((e) => e.id));
  const baharu = masuk.filter((e) => e && e.id != null && !idSedia.has(e.id));
  const gabung = [...baharu, ...sedia].sort((a, b) => (b.id || 0) - (a.id || 0));
  simpan(gabung);
  return baharu.length;
}

// Keluk ekuiti sebagai SVG sparkline sebaris (tiada pustaka).
function sparkline(points) {
  if (points.length < 2)
    return `<p class="nota">Perlu ≥2 dagangan tertutup untuk keluk ekuiti.</p>`;
  const vals = points.map((p) => p.kumulatif);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const W = 300;
  const H = 60;
  const pad = 4;
  const rng = max - min || 1;
  const x = (i) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - min) / rng) * (H - 2 * pad);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const akhir = vals[vals.length - 1];
  return `<svg class="ekuiti" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Keluk ekuiti ${akhir.toFixed(1)} R">
      <line x1="0" y1="${y(0).toFixed(1)}" x2="${W}" y2="${y(0).toFixed(1)}" class="ekuiti-sifar"/>
      <path d="${d}" class="ekuiti-garis ${akhir >= 0 ? "naik" : "turun"}"/>
    </svg>`;
}

// Jadual pecahan prestasi (ikut sesi / pasangan / arah).
function jadualKumpulan(tajuk, rows) {
  if (!rows.length) return "";
  const baris = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.kunci)}</td>
        <td>${r.count}</td>
        <td>${r.kadarMenang == null ? "—" : r.kadarMenang + "%"}</td>
        <td class="${r.expectancyR >= 0 ? "tp" : "sl"}">${r.expectancyR.toFixed(2)}R</td>
      </tr>`
    )
    .join("");
  return `<div class="kump">
      <h4>${tajuk}</h4>
      <table class="hasil kump-t">
        <tr><th>—</th><th>N</th><th>Menang</th><th>Exp</th></tr>
        ${baris}
      </table>
    </div>`;
}

function fmtR(x) {
  return x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}R`;
}

// Bina UI jurnal dalam `host`.
export function renderJurnal(host) {
  host.innerHTML = `
    <div class="jurnal-alat">
      <button type="button" class="btn-kecil" id="jurnal-eksport">⬇️ Eksport JSON</button>
      <button type="button" class="btn-kecil" id="jurnal-import">⬆️ Import JSON</button>
      <input type="file" id="jurnal-fail" accept="application/json,.json" hidden>
    </div>
    <div class="kotak" id="jurnal-stat"></div><div id="jurnal-senarai"></div>`;
  const statEl = host.querySelector("#jurnal-stat");
  const senaraiEl = host.querySelector("#jurnal-senarai");
  const failEl = host.querySelector("#jurnal-fail");

  host.querySelector("#jurnal-eksport").addEventListener("click", eksport);
  host.querySelector("#jurnal-import").addEventListener("click", () => failEl.click());
  failEl.addEventListener("change", async () => {
    const f = failEl.files && failEl.files[0];
    if (!f) return;
    try {
      const n = importGabung(await f.text());
      alert(n ? `${n} entri diimport.` : "Tiada entri baharu (semua sudah wujud).");
      lukis();
    } catch (err) {
      alert(`Gagal import: ${err.message}`);
    }
    failEl.value = "";
  });

  function lukisStat(list) {
    const s = ringkasan(list);
    const st = streak(list);
    const pf = s.profitFactor;
    const pfTeks = pf == null ? "—" : pf === Infinity ? "∞" : pf.toFixed(2);
    const expKelas = s.expectancyR == null ? "" : s.expectancyR >= 0 ? "tp" : "sl";
    const streakTeks =
      st.semasa === 0
        ? "—"
        : st.semasa > 0
          ? `${st.semasa} menang berturut`
          : `${-st.semasa} kalah berturut`;

    statEl.innerHTML = `
      <h3>📊 Analisis Prestasi</h3>
      <div class="metrik">
        <div class="metrik-sel"><span class="mv ${expKelas}">${fmtR(s.expectancyR)}</span><span class="ml">Expectancy / dagangan</span></div>
        <div class="metrik-sel"><span class="mv">${s.kadarMenang == null ? "—" : s.kadarMenang + "%"}</span><span class="ml">Kadar menang</span></div>
        <div class="metrik-sel"><span class="mv">${pfTeks}</span><span class="ml">Profit factor</span></div>
        <div class="metrik-sel"><span class="mv">${streakTeks}</span><span class="ml">Streak semasa</span></div>
      </div>
      <table class="hasil">
        <tr><td>Jumlah dagangan</td><td>${s.jumlah} (ditutup ${s.ditutup})</td></tr>
        <tr><td>Menang / Kalah / BE</td><td>${s.menang} / ${s.kalah} / ${s.be}</td></tr>
        <tr><td>Jumlah R terkumpul</td><td class="${s.jumlahR >= 0 ? "tp" : "sl"}"><b>${fmtR(s.jumlahR)}</b></td></tr>
      </table>
      <h4>Keluk ekuiti (R terkumpul)</h4>
      ${sparkline(kelukEkuiti(list))}
      ${jadualKumpulan("Ikut sesi", ikutKumpulan(list, sesiEntri))}
      ${jadualKumpulan(
        "Ikut pasangan",
        ikutKumpulan(list, (e) => e.pairId)
      )}
      ${jadualKumpulan(
        "Ikut arah",
        ikutKumpulan(list, (e) => e.arah)
      )}
      <p class="nota">Expectancy = purata R setiap dagangan. Isi <b>R sebenar</b> pada setiap baris untuk ketepatan; jika kosong, dianggarkan (menang = +R:R, kalah = −1, BE = 0).</p>`;
  }

  function lukis() {
    const list = baca();
    lukisStat(list);

    if (!list.length) {
      senaraiEl.innerHTML = `<p class="nota">Tiada entri lagi. Kira satu setup di Kalkulator → "Simpan ke Jurnal".</p>`;
      return;
    }

    senaraiEl.innerHTML = list
      .map(
        (e) => `
      <div class="kotak jurnal-baris" data-id="${escapeHtml(e.id)}">
        <div class="jb-head">
          <b>${escapeHtml(e.pairId)} · ${escapeHtml(e.arah)}</b>
          <span class="jb-masa">${escapeHtml(tarikhPendek(e.ts))}</span>
        </div>
        <div class="jb-detail">
          Masuk ${escapeHtml(e.entry)} · <span class="sl">SL ${escapeHtml(e.sl)}</span> · <span class="tp">TP ${escapeHtml(e.tp)}</span> · R:R ${escapeHtml(e.rr)}${e.lot != null ? ` · ${escapeHtml(e.lot)} lot` : ""}${e.amaunRisiko != null ? ` · risiko ${escapeHtml(e.amaunRisiko)}` : ""}
          ${e.sesi ? `<br><span class="nota">Sesi semasa simpan: ${escapeHtml(e.sesi)}</span>` : ""}
        </div>
        <div class="jb-aksi">
          <select class="jb-hasil">${HASIL.map((h) => `<option value="${h.v}" ${e.hasil === h.v ? "selected" : ""}>${h.t}</option>`).join("")}</select>
          <input class="jb-rsebenar" type="number" step="any" inputmode="decimal" placeholder="R sebenar" value="${e.rSebenar != null ? escapeHtml(e.rSebenar) : ""}">
          <button class="btn-buang jb-padam">Padam</button>
        </div>
        <input class="jb-nota" placeholder="Nota / sebab masuk…" value="${escapeHtml(e.nota)}">
      </div>`
      )
      .join("");

    senaraiEl.querySelectorAll(".jurnal-baris").forEach((row) => {
      const id = Number(row.dataset.id);
      row.querySelector(".jb-hasil").addEventListener("change", (ev) => {
        kemasHasil(id, ev.target.value);
        lukis();
      });
      row.querySelector(".jb-rsebenar").addEventListener("change", (ev) => {
        kemasRSebenar(id, ev.target.value);
        lukisStat(baca());
      });
      row.querySelector(".jb-padam").addEventListener("click", () => {
        padam(id);
        lukis();
      });
      row
        .querySelector(".jb-nota")
        .addEventListener("change", (ev) => kemasNota(id, ev.target.value));
    });
  }

  lukis();
}
