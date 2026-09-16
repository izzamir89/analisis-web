import { describe, it, expect, beforeEach } from "vitest";
import { analisaPasangan } from "../js/analisis.js";
import { ambilMod } from "../js/mod.js";
import { simpanKos } from "../js/kos.js";
import { bakiRisikoHarian } from "../js/risk.js";
import { kalahBerturutHariIni } from "../js/analytics.js";
import { simpanSnapshot, bacaJalur, agregat } from "../js/kebarangkalian.js";

// Ujian ini mengesahkan WIRING antara modul, bukan modul individu. Gate kos yang
// berfungsi sempurna dalam kos.js tidak bernilai jika dashboard tidak pernah menyuapnya
// ke enjin — itulah jenis pepijat yang lolos daripada ujian unit tulen.

beforeEach(() => {
  localStorage.clear();
});

// Siri menaik stabil & tenang: EMA bertindan bullish, ATR kecil & konsisten.
function siriNaik(n = 300) {
  return Array.from({ length: n }, (_, i) => {
    const c = 1.0 + i * 0.0004;
    return { t: i * 3600000, o: c - 0.0001, h: c + 0.0003, l: c - 0.0003, c };
  });
}

const rabuPetang = new Date("2024-06-12T14:00:00Z"); // overlap London/NY

function jalankan(modId, tambahan = {}) {
  const mod = ambilMod(modId);
  const lilin = siriNaik();
  return analisaPasangan({
    pairId: "EURUSD",
    mod,
    candlesLo: lilin,
    candlesMid: lilin,
    candlesHi: lilin,
    now: rabuPetang,
    ...tambahan,
  });
}

describe("gate kos hujung-ke-hujung — dari tetapan broker ke verdict", () => {
  // ATR siri ini ≈ 0.0006 → SL scalp (1.0×ATR) ≈ 6 pip, SL swing (1.5×ATR) ≈ 9 pip.

  it("spread standard menyekat scalp tetapi membenarkan swing", () => {
    simpanKos({ spread: { EURUSD: 2.0 }, komisen: { EURUSD: 0 } });
    const scalp = jalankan("scalp");
    expect(scalp.gate.lulus).toBe(false);
    expect(scalp.gate.sebab.join(" ")).toContain("daripada risiko");

    // SL swing lebih lebar → spread yang sama memakan bahagian yang lebih kecil.
    const swing = jalankan("swing");
    expect(swing.gate.sebab.join(" ")).not.toContain("daripada risiko");
  });

  it("menukar spread kepada kadar ECN membuka semula gate yang sama", () => {
    simpanKos({ spread: { EURUSD: 2.0 } });
    expect(jalankan("scalp").gate.lulus).toBe(false);

    simpanKos({ spread: { EURUSD: 0.2 }, komisen: { EURUSD: 0.2 } });
    const selepas = jalankan("scalp");
    expect(selepas.gate.sebab.join(" ")).not.toContain("daripada risiko");
  });

  it("R:R bersih dilaporkan bersama keputusan, bukan hanya R:R mentah", () => {
    simpanKos({ spread: { EURUSD: 1.0 }, komisen: { EURUSD: 0 } });
    const r = jalankan("swing");
    expect(r.kos.rrBersih).toBeLessThan(r.kos.rrBersih === null ? Infinity : 2);
    expect(r.kos.kadarPulangModal).toBeGreaterThan(1 / 3); // lebih tinggi dari RR2 ideal
  });
});

describe("gate risiko hujung-ke-hujung — jurnal ke verdict", () => {
  const hariIni = (jam, hasil, risiko) => ({
    ts: `2024-06-12T${String(jam).padStart(2, "0")}:00:00Z`,
    hasil,
    amaunRisiko: risiko,
  });

  it("tiga kekalahan berturut hari ini menghentikan dagangan", () => {
    const jurnal = [hariIni(9, "loss"), hariIni(10, "loss"), hariIni(11, "loss")];
    const kalah = kalahBerturutHariIni(jurnal, rabuPetang);
    expect(kalah).toBe(3);

    const r = jalankan("swing", { kalahBerturut: kalah });
    expect(r.gate.lulus).toBe(false);
    expect(r.gate.sebab.join(" ")).toContain("kalah berturut");
  });

  it("dua kekalahan diikuti kemenangan tidak menghentikan dagangan", () => {
    const jurnal = [hariIni(9, "loss"), hariIni(10, "loss"), hariIni(11, "win")];
    const r = jalankan("swing", { kalahBerturut: kalahBerturutHariIni(jurnal, rabuPetang) });
    expect(r.gate.sebab.join(" ")).not.toContain("kalah berturut");
  });

  it("bajet risiko harian yang habis menghentikan dagangan", () => {
    const jurnal = [hariIni(9, "loss", 20), hariIni(10, "loss", 15)];
    const rk = bakiRisikoHarian(jurnal, rabuPetang, 30);
    expect(rk.melebihi).toBe(true);

    const r = jalankan("swing", { risikoHarian: rk });
    expect(r.gate.lulus).toBe(false);
    expect(r.gate.sebab.join(" ")).toContain("Bajet risiko harian habis");
  });

  it("bajet yang masih ada baki tidak menghentikan dagangan", () => {
    const jurnal = [hariIni(9, "loss", 10)];
    const r = jalankan("swing", { risikoHarian: bakiRisikoHarian(jurnal, rabuPetang, 30) });
    expect(r.gate.sebab.join(" ")).not.toContain("Bajet risiko harian");
  });
});

describe("pengasingan jalur merentas mod — langkah pengesahan 5", () => {
  it("backtest swing kemudian scalp menghasilkan kolam yang berasingan", () => {
    simpanSnapshot("swing", "EURUSD", { "70-79": { n: 40, menang: 28 } }, { tsData: 1 });
    simpanSnapshot("scalp", "EURUSD", { "70-79": { n: 60, menang: 18 } }, { tsData: 1 });

    const swing = bacaJalur(75, "swing");
    const scalp = bacaJalur(75, "scalp");
    expect(swing.n).toBe(40);
    expect(scalp.n).toBe(60);
    expect(swing.kadar).toBeCloseTo(0.7, 5);
    expect(scalp.kadar).toBeCloseTo(0.3, 5);
  });

  it("menjalankan backtest yang sama dua kali tidak menggandakan n", () => {
    const jalur = { "70-79": { n: 40, menang: 28 } };
    simpanSnapshot("swing", "EURUSD", jalur, { tsData: 1 });
    const selepasSatu = agregat("swing")["70-79"].n;
    // Hari berikutnya: data lebih baharu, dagangan sejarah yang hampir sama.
    simpanSnapshot("swing", "EURUSD", { "70-79": { n: 41, menang: 29 } }, { tsData: 2 });
    const selepasDua = agregat("swing")["70-79"].n;
    expect(selepasSatu).toBe(40);
    expect(selepasDua).toBe(41); // digantikan, bukan 81
  });
});
