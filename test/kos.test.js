import { describe, it, expect, beforeEach } from "vitest";
import {
  KOS_GATE,
  KOS_AMARAN,
  SPREAD_LALAI,
  bacaKos,
  simpanKos,
  kosPip,
  kosDalamR,
  rrBersih,
  kadarPulangModal,
  nilaiKos,
  rekodSpread,
  bacaBacaan,
  padamBacaan,
  ringkasBacaan,
  spreadBerkesan,
  sesiLabel,
  median,
} from "../js/kos.js";

beforeEach(() => {
  localStorage.clear();
});

describe("tetapan kos", () => {
  it("tanpa tetapan tersimpan → spread lalai, belum disahkan", () => {
    const t = bacaKos();
    expect(t.spread.EURUSD).toBe(SPREAD_LALAI.EURUSD);
    expect(t.disahkan).toBe(false);
  });

  it("simpan menimpa satu pasangan tanpa memadam yang lain", () => {
    simpanKos({ spread: { EURUSD: 0.2 } });
    const t = bacaKos();
    expect(t.spread.EURUSD).toBe(0.2);
    expect(t.spread.GBPUSD).toBe(SPREAD_LALAI.GBPUSD);
  });

  it("kosPip menjumlahkan spread + komisen", () => {
    simpanKos({ spread: { EURUSD: 0.2 }, komisen: { EURUSD: 0.7 } });
    expect(kosPip("EURUSD")).toBeCloseTo(0.9, 10);
  });

  it("pasangan tidak dikenali → 0, bukan NaN", () => {
    expect(kosPip("ZZZZZZ")).toBe(0);
  });
});

describe("kosDalamR", () => {
  it("kos sebagai pecahan jarak SL", () => {
    expect(kosDalamR(20, 1)).toBeCloseTo(0.05, 10);
    expect(kosDalamR(3, 1)).toBeCloseTo(0.3333, 3);
  });

  it("SL tidak sah → null, bukan Infinity", () => {
    expect(kosDalamR(0, 1)).toBe(null);
    expect(kosDalamR(-5, 1)).toBe(null);
    expect(kosDalamR(null, 1)).toBe(null);
  });
});

describe("rrBersih", () => {
  it("kos menghakis R:R dari kedua-dua belah", () => {
    // RR 2, kos 10% daripada R → (2 − 0.1) / (1 + 0.1) ≈ 1.727
    expect(rrBersih(2, 0.1)).toBeCloseTo(1.7273, 3);
  });

  it("kos sifar → R:R tidak berubah", () => {
    expect(rrBersih(2, 0)).toBeCloseTo(2, 10);
  });

  it("scalp M5: SL 3 pip dengan spread 1 pip memusnahkan jidar", () => {
    const kosR = kosDalamR(3, 1); // 0.333
    const bersih = rrBersih(1.5, kosR);
    // RR 1.5 yang dipapar sebenarnya hanya ~0.875 selepas kos.
    expect(bersih).toBeLessThan(0.9);
    // Perlu menang >50% sekadar pulang modal — pada setup yang dijual sebagai 1:1.5.
    expect(kadarPulangModal(bersih)).toBeGreaterThan(0.5);
  });
});

describe("kadarPulangModal", () => {
  it("R:R 2 perlukan 33% menang; R:R 1 perlukan 50%", () => {
    expect(kadarPulangModal(2)).toBeCloseTo(1 / 3, 5);
    expect(kadarPulangModal(1)).toBeCloseTo(0.5, 5);
  });

  it("R:R tak sah → null", () => {
    expect(kadarPulangModal(0)).toBe(null);
    expect(kadarPulangModal(-1)).toBe(null);
  });
});

describe("nilaiKos — gate", () => {
  const tetapan = { spread: { EURUSD: 1.0 }, komisen: {}, disahkan: true };

  it("swing (SL 15 pip, spread 1) → lulus tanpa amaran", () => {
    const k = nilaiKos({ pairId: "EURUSD", slPip: 15, rr: 2, tetapan });
    expect(k.kosR).toBeCloseTo(1 / 15, 5);
    expect(k.gate).toBe(false);
    expect(k.amaran).toBe(false);
  });

  it("SL sederhana-rapat (5 pip) → amaran, belum gate", () => {
    const k = nilaiKos({ pairId: "EURUSD", slPip: 5, rr: 2, tetapan });
    expect(k.kosR).toBeCloseTo(0.2, 10);
    expect(k.kosR).toBeGreaterThan(KOS_AMARAN);
    expect(k.kosR).toBeLessThan(KOS_GATE);
    expect(k.gate).toBe(false);
    expect(k.amaran).toBe(true);
  });

  it("scalp M5 (SL 3 pip) → gate keras", () => {
    const k = nilaiKos({ pairId: "EURUSD", slPip: 3, rr: 1.5, tetapan });
    expect(k.kosR).toBeGreaterThan(KOS_GATE);
    expect(k.gate).toBe(true);
    expect(k.sebab).toMatch(/terlalu rapat/);
  });

  it("spread ECN rendah menyelamatkan setup scalp yang sama", () => {
    const ecn = { spread: { EURUSD: 0.2 }, komisen: { EURUSD: 0.2 }, disahkan: true };
    const k = nilaiKos({ pairId: "EURUSD", slPip: 3, rr: 1.5, tetapan: ecn });
    expect(k.gate).toBe(false);
  });

  it("SL tidak diketahui → tiada gate, tetapi ditandakan tidak dinilai", () => {
    const k = nilaiKos({ pairId: "EURUSD", slPip: null, rr: 2, tetapan });
    expect(k.gate).toBe(false);
    expect(k.kosR).toBe(null);
    expect(k.sebab).toMatch(/tidak dapat dinilai/);
  });
});

describe("bacaan spread yang diukur", () => {
  // Rabu 12 Jun 2024. Liputan sesi dalam UTC (musim panus utara):
  //   Sydney 21-06 · Tokyo 00-09 · London 07-16 · New York 12-21
  // Jadi hari bekerja SENTIASA ada sekurang-kurangnya satu sesi aktif — forex 24/5.
  // "Luar sesi" hanya wujud pada hujung minggu.
  const overlap = new Date("2024-06-12T14:00:00Z"); // London + New York
  const asia = new Date("2024-06-12T02:00:00Z"); // Sydney + Tokyo
  const sunyi = new Date("2024-06-12T22:00:00Z"); // Sydney sahaja — paling nipis
  const hujungMinggu = new Date("2024-06-15T12:00:00Z"); // Sabtu

  it("menandakan bacaan dengan sesi yang betul", () => {
    expect(sesiLabel(overlap)).toBe("London-NY");
    expect(sesiLabel(sunyi)).toBe("Sydney");
    expect(["Tokyo", "Sydney"]).toContain(sesiLabel(asia));
    expect(sesiLabel(hujungMinggu)).toBe("Luar sesi");
  });

  it("merakam & membaca semula bacaan setiap pasangan", () => {
    rekodSpread("EURUSD", 0.9, overlap);
    rekodSpread("XAUUSD", 25, overlap);
    expect(bacaBacaan("EURUSD").length).toBe(1);
    expect(bacaBacaan("XAUUSD").length).toBe(1);
    expect(bacaBacaan().length).toBe(2);
  });

  it("menolak input tidak sah tanpa menyimpan", () => {
    expect(rekodSpread("EURUSD", "abc", overlap)).toBe(null);
    expect(rekodSpread("EURUSD", -1, overlap)).toBe(null);
    expect(bacaBacaan().length).toBe(0);
  });

  it("median tahan terhadap satu bacaan tersalah taip", () => {
    // 30 dan bukan 3.0 — purata jadi 12.0, median kekal waras.
    expect(median([0.9, 1.0, 1.1, 30])).toBeCloseTo(1.05, 5);
  });

  it("guna median sesi SEMASA apabila cukup bacaan", () => {
    rekodSpread("EURUSD", 0.8, overlap);
    rekodSpread("EURUSD", 1.0, overlap);
    rekodSpread("EURUSD", 6.0, sunyi); // sesi sunyi jauh lebih lebar
    const b = spreadBerkesan(bacaBacaan("EURUSD"), 1.5, overlap);
    expect(b.pip).toBeCloseTo(0.9, 5);
    expect(b.sumber).toBe("diukur-sesi");
  });

  it("sesi yang BELUM diukur jatuh ke bacaan terburuk, bukan terbaik", () => {
    rekodSpread("EURUSD", 0.8, overlap);
    rekodSpread("EURUSD", 1.0, overlap);
    // Menilai semasa sesi sunyi yang tiada bacaan → guna maksimum yang pernah dilihat.
    const b = spreadBerkesan(bacaBacaan("EURUSD"), 1.5, sunyi);
    expect(b.pip).toBeCloseTo(1.0, 5);
    expect(b.sumber).toBe("maks-diukur");
  });

  it("satu bacaan sahaja bagi satu sesi belum dipercayai", () => {
    rekodSpread("EURUSD", 0.8, overlap);
    const b = spreadBerkesan(bacaBacaan("EURUSD"), 1.5, overlap);
    expect(b.sumber).toBe("maks-diukur"); // bukan "diukur-sesi"
  });

  it("tanpa bacaan langsung → spread tetapan", () => {
    const b = spreadBerkesan([], 1.3, overlap);
    expect(b.pip).toBeCloseTo(1.3, 5);
    expect(b.sumber).toBe("lalai");
  });

  it("ringkasBacaan mengumpul ikut sesi dengan julat", () => {
    rekodSpread("EURUSD", 0.8, overlap);
    rekodSpread("EURUSD", 1.2, overlap);
    rekodSpread("EURUSD", 6.0, sunyi);
    const r = ringkasBacaan(bacaBacaan("EURUSD"));
    expect(r.ikutSesi["London-NY"].n).toBe(2);
    expect(r.ikutSesi["London-NY"].median).toBeCloseTo(1.0, 5);
    expect(r.ikutSesi["London-NY"].min).toBeCloseTo(0.8, 5);
    expect(r.ikutSesi["Sydney"].cukup).toBe(false);
    expect(r.maks).toBeCloseTo(6.0, 5);
  });

  it("padamBacaan menyasarkan satu pasangan sahaja", () => {
    rekodSpread("EURUSD", 0.9, overlap);
    rekodSpread("GBPUSD", 1.4, overlap);
    padamBacaan("EURUSD");
    expect(bacaBacaan("EURUSD").length).toBe(0);
    expect(bacaBacaan("GBPUSD").length).toBe(1);
  });

  it("bacaan yang diukur mengalir ke nilaiKos dan mengatasi anggaran", () => {
    const tetapan = { spread: { EURUSD: 2.0 }, komisen: { EURUSD: 0 }, disahkan: false };
    // Tanpa bacaan: guna anggaran 2.0 pip pada SL 10 pip = 20% → amaran.
    const anggaran = nilaiKos({ pairId: "EURUSD", slPip: 10, rr: 2, tetapan, now: overlap });
    expect(anggaran.kosPip).toBeCloseTo(2.0, 5);
    expect(anggaran.sebab).toContain("anggaran");

    // Selepas mengukur 0.8/1.0 pada sesi ini: 0.9 pip = 9% → tiada amaran.
    rekodSpread("EURUSD", 0.8, overlap);
    rekodSpread("EURUSD", 1.0, overlap);
    const diukur = nilaiKos({ pairId: "EURUSD", slPip: 10, rr: 2, tetapan, now: overlap });
    expect(diukur.kosPip).toBeCloseTo(0.9, 5);
    expect(diukur.amaran).toBe(false);
    expect(diukur.sebab).toContain("diukur London-NY");
  });

  it("komisen ditambah pada spread yang diukur, bukan diganti", () => {
    const tetapan = { spread: { EURUSD: 2.0 }, komisen: { EURUSD: 0.6 }, disahkan: true };
    rekodSpread("EURUSD", 0.4, overlap);
    rekodSpread("EURUSD", 0.4, overlap);
    expect(kosPip("EURUSD", tetapan, overlap)).toBeCloseTo(1.0, 5);
  });
});
