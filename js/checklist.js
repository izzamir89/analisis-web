// Panel Go/No-Go — gabung isyarat tempatan jadi SATU keputusan masuk order.
// 100% tempatan: jam sistem + sessions.js + news.js + R:R. Tiada widget dibaca.
import { statusMasaOrder, masaTutupLilin, formatBaki } from "./sessions.js";
import { jarakBerita, AMARAN_MINIT } from "./news.js";
import { RR_MIN } from "./calculator.js";

// Senarai semak manual — tak boleh diauto sebab perlu baca carta dengan mata.
const MANUAL = [
  { id: "trend", teks: "Trend TF tinggi (4J/Harian) selari dengan arah order" },
  { id: "teknikal", teks: "Tolok teknikal tidak bercanggah dengan arah" },
  { id: "paras", teks: "Harga di paras penting (sokongan / rintangan)" },
];

// Kira semua item AUTO pada masa `now`. Pulang array {id,label,status,sebab}.
// status: "pass" | "warn" | "fail".
function itemAuto(now, interval, rr) {
  const items = [];

  // 1) Kecairan sesi
  const st = statusMasaOrder(now);
  items.push({
    id: "sesi", label: "Kecairan sesi",
    status: st.tahap === "elok" ? "pass" : st.tahap === "hati" ? "warn" : "fail",
    sebab: st.sebab,
  });

  // 2) Timing tutup lilin
  const { saatBaki } = masaTutupLilin(now, interval);
  items.push({
    id: "timing", label: "Timing lilin",
    status: saatBaki < 60 ? "warn" : "pass",
    sebab: saatBaki < 60
      ? `Lilin hampir tutup (${saatBaki}s) — tunggu lilin baru.`
      : `Lilin tutup dalam ${formatBaki(saatBaki)}.`,
  });

  // 3) Jarak berita merah
  const b = jarakBerita(now);
  if (!b.ada) {
    items.push({ id: "berita", label: "Berita impak tinggi", status: "warn",
      sebab: "Masa berita tidak diset — semak kalendar & isi di bawah." });
  } else if (b.bahaya) {
    items.push({ id: "berita", label: "Berita impak tinggi", status: "fail",
      sebab: b.lalu
        ? `Baru ${Math.abs(Math.round(b.minit))} min selepas berita — pasaran tak menentu.`
        : `Berita merah dalam ${Math.round(b.minit)} min — elak masuk.` });
  } else {
    items.push({ id: "berita", label: "Berita impak tinggi", status: "pass",
      sebab: b.lalu ? "Tiada berita hampir." : `Berita seterusnya dalam ${Math.round(b.minit)} min (>${AMARAN_MINIT} min).` });
  }

  // 4) Nisbah R:R
  items.push({
    id: "rr", label: "Nisbah R:R",
    status: rr >= RR_MIN ? "pass" : "fail",
    sebab: rr >= RR_MIN ? `R:R ${rr.toFixed(2)} ≥ minimum ${RR_MIN}.` : `R:R ${rr.toFixed(2)} di bawah minimum ${RR_MIN}.`,
  });

  return items;
}

// Tentukan verdict dari item auto + keadaan kotak manual.
function nilaiVerdict(auto, manualSemua) {
  const adaFail = auto.some((x) => x.status === "fail");
  const adaWarn = auto.some((x) => x.status === "warn");
  if (adaFail) return { tahap: "elak", label: "JANGAN MASUK", lulus: false };
  if (adaWarn || !manualSemua) return { tahap: "hati", label: "BERHATI", lulus: false };
  return { tahap: "elok", label: "BOLEH MASUK", lulus: true };
}

const IKON = { pass: "🟢", warn: "🟡", fail: "🔴" };

let pemasa = null;
export function hentiChecklist() {
  if (pemasa) { clearInterval(pemasa); pemasa = null; }
}

// Bina panel dalam `host`. getInterval() pulang interval carta semasa ("60"/"240"/"D").
// Pulang { snapshot() } supaya pemanggil boleh baca keadaan semasa untuk jurnal.
export function renderChecklist(host, { getInterval }) {
  hentiChecklist();
  host.innerHTML = `
    <div class="kotak gng">
      <div class="gng-verdict badge-order" id="gng-verdict"></div>
      <div class="gng-rr">
        <label>Nisbah R:R rancangan
          <input id="gng-rr" type="number" step="any" inputmode="decimal" value="2">
        </label>
      </div>
      <ul class="gng-list" id="gng-list"></ul>
      <div class="gng-manual" id="gng-manual">
        ${MANUAL.map((m) => `
          <label class="gng-check"><input type="checkbox" data-id="${m.id}"><span>${m.teks}</span></label>`).join("")}
      </div>
    </div>`;

  const rrEl = host.querySelector("#gng-rr");
  const listEl = host.querySelector("#gng-list");
  const verdictEl = host.querySelector("#gng-verdict");
  const checks = [...host.querySelectorAll(".gng-manual input[type=checkbox]")];

  // Keadaan semasa (dikongsi untuk snapshot ke jurnal).
  let auto = [];
  let verdict = { tahap: "hati", label: "BERHATI", lulus: false };

  const kemas = () => {
    const rr = Number(rrEl.value) || 0;
    auto = itemAuto(new Date(), getInterval(), rr);
    const manualSemua = checks.every((c) => c.checked);
    verdict = nilaiVerdict(auto, manualSemua);

    verdictEl.className = `gng-verdict badge-order ${verdict.tahap}`;
    verdictEl.innerHTML = `<span class="bo-label">${IKON[verdict.tahap === "elok" ? "pass" : verdict.tahap === "hati" ? "warn" : "fail"]} ${verdict.label}</span>`;

    listEl.innerHTML = auto.map((x) =>
      `<li class="gng-item ${x.status}"><span class="gng-ikon">${IKON[x.status]}</span>
         <span class="gng-teks"><b>${x.label}</b><span>${x.sebab}</span></span></li>`).join("");
  };

  rrEl.addEventListener("input", kemas);
  checks.forEach((c) => c.addEventListener("change", kemas));
  kemas();
  pemasa = setInterval(kemas, 1000); // timing & countdown berita hidup

  return {
    snapshot: () => ({
      rr: Number(rrEl.value) || 0,
      verdict: verdict.label,
      lulus: verdict.lulus,
      manual: Object.fromEntries(checks.map((c) => [c.dataset.id, c.checked])),
      auto: auto.map((x) => ({ id: x.id, status: x.status })),
    }),
  };
}
