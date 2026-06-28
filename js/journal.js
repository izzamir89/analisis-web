// Jurnal dagangan — 100% tempatan (localStorage), tiada rangkaian.
// Tangkap setup dari kalkulator sekali tekan; semak semula untuk perbaiki ketepatan.

const KUNCI = "forex_journal";

const HASIL = [
  { v: "open", t: "Terbuka" },
  { v: "win", t: "Menang" },
  { v: "loss", t: "Kalah" },
  { v: "be", t: "Seri (BE)" },
];

export function baca() {
  try { return JSON.parse(localStorage.getItem(KUNCI)) || []; }
  catch { return []; }
}
function simpan(list) {
  localStorage.setItem(KUNCI, JSON.stringify(list));
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
  if (e) { e.hasil = hasil; simpan(list); }
}
export function kemasNota(id, nota) {
  const list = baca();
  const e = list.find((x) => x.id === id);
  if (e) { e.nota = nota; simpan(list); }
}

// Statistik ringkas: kadar menang antara dagangan yang sudah ditutup.
function statistik(list) {
  const tutup = list.filter((e) => e.hasil === "win" || e.hasil === "loss");
  const menang = tutup.filter((e) => e.hasil === "win").length;
  const kadar = tutup.length ? Math.round((menang / tutup.length) * 100) : null;
  return { jumlah: list.length, ditutup: tutup.length, menang, kadar };
}

function tarikhPendek(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Bina UI jurnal dalam `host`.
export function renderJurnal(host) {
  host.innerHTML = `<div class="kotak" id="jurnal-stat"></div><div id="jurnal-senarai"></div>`;
  const statEl = host.querySelector("#jurnal-stat");
  const senaraiEl = host.querySelector("#jurnal-senarai");

  function lukis() {
    const list = baca();
    const s = statistik(list);
    statEl.innerHTML = `
      <h3>Ringkasan</h3>
      <table class="hasil">
        <tr><td>Jumlah dagangan</td><td>${s.jumlah}</td></tr>
        <tr><td>Ditutup</td><td>${s.ditutup} (menang ${s.menang})</td></tr>
        <tr><td>Kadar menang</td><td><b>${s.kadar == null ? "—" : s.kadar + "%"}</b></td></tr>
      </table>`;

    if (!list.length) { senaraiEl.innerHTML = `<p class="nota">Tiada entri lagi. Kira satu setup di Kalkulator → "Simpan ke Jurnal".</p>`; return; }

    senaraiEl.innerHTML = list.map((e) => `
      <div class="kotak jurnal-baris" data-id="${e.id}">
        <div class="jb-head">
          <b>${e.pairId} · ${e.arah}</b>
          <span class="jb-masa">${tarikhPendek(e.ts)}</span>
        </div>
        <div class="jb-detail">
          Masuk ${e.entry} · <span class="sl">SL ${e.sl}</span> · <span class="tp">TP ${e.tp}</span> · R:R ${e.rr}${e.lot != null ? ` · ${e.lot} lot` : ""}
          ${e.sesi ? `<br><span class="nota">Sesi semasa simpan: ${e.sesi}</span>` : ""}
        </div>
        <div class="jb-aksi">
          <select class="jb-hasil">${HASIL.map((h) => `<option value="${h.v}" ${e.hasil === h.v ? "selected" : ""}>${h.t}</option>`).join("")}</select>
          <button class="btn-buang jb-padam">Padam</button>
        </div>
        <input class="jb-nota" placeholder="Nota / sebab masuk…" value="${(e.nota || "").replace(/"/g, "&quot;")}">
      </div>`).join("");

    senaraiEl.querySelectorAll(".jurnal-baris").forEach((row) => {
      const id = Number(row.dataset.id);
      row.querySelector(".jb-hasil").addEventListener("change", (ev) => { kemasHasil(id, ev.target.value); lukis(); });
      row.querySelector(".jb-padam").addEventListener("click", () => { padam(id); lukis(); });
      row.querySelector(".jb-nota").addEventListener("change", (ev) => kemasNota(id, ev.target.value));
    });
  }

  lukis();
}
