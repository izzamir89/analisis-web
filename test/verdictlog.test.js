import { describe, it, expect, beforeEach } from "vitest";
import {
  baca,
  rekod,
  selesaikanSatu,
  selesaikan,
  untukAnalitik,
  padamSemua,
} from "../js/verdictlog.js";

beforeEach(() => {
  localStorage.clear();
});

const asas = {
  modId: "swing",
  pairId: "EURUSD",
  verdict: "BUY",
  skor: 78,
  skorTerasNorm: 82,
  arah: "Buy",
  harga: 1.1,
  atr: 0.001,
  slMult: 1.5,
  rr: 2,
  tsLilin: 1000,
};

describe("rekod", () => {
  it("merekod BUY dengan SL/TP dikira dari ATR", () => {
    const r = rekod(asas);
    expect(r.sl).toBeCloseTo(1.1 - 0.0015, 10); // 1.5 × ATR
    expect(r.tp).toBeCloseTo(1.1 + 0.003, 10); // 2R
    expect(r.hasil).toBe("open");
    expect(baca().length).toBe(1);
  });

  it("SELL membalikkan SL/TP", () => {
    const r = rekod({ ...asas, verdict: "SELL", arah: "Sell" });
    expect(r.sl).toBeCloseTo(1.1015, 10);
    expect(r.tp).toBeCloseTo(1.097, 10);
  });

  // Ini pepijat yang sama yang menggelembungkan sampel kebarangkalian. Membuka semula
  // skrin pada lilin yang sama mesti menghasilkan satu rekod, bukan satu setiap lawatan.
  it("dinyahduplikasi mengikut lilin — membuka semula skrin tidak menggandakan rekod", () => {
    rekod(asas);
    rekod(asas);
    rekod(asas);
    expect(baca().length).toBe(1);
  });

  it("lilin baharu mencipta rekod baharu", () => {
    rekod(asas);
    rekod({ ...asas, tsLilin: 2000 });
    expect(baca().length).toBe(2);
  });

  it("mod & pasangan berbeza dijejaki berasingan", () => {
    rekod(asas);
    rekod({ ...asas, modId: "scalp" });
    rekod({ ...asas, pairId: "GBPUSD" });
    expect(baca().length).toBe(3);
  });

  it("WAIT & NO TRADE tidak dilog — tiada hasil untuk disemak", () => {
    expect(rekod({ ...asas, verdict: "WAIT" })).toBe(null);
    expect(rekod({ ...asas, verdict: "NO TRADE" })).toBe(null);
    expect(baca().length).toBe(0);
  });

  it("input tidak sah ditolak tanpa throw", () => {
    expect(rekod({ ...asas, harga: 0 })).toBe(null);
    expect(rekod({ ...asas, atr: null })).toBe(null);
  });
});

describe("selesaikanSatu", () => {
  const r = () => rekod(asas); // entry 1.1, SL 1.0985, TP 1.1030

  it("TP kena → menang, R bersih selepas kos", () => {
    const rec = rekod({ ...asas, kosHarga: 0.00015 }); // kosR = 0.1
    const s = selesaikanSatu(rec, [{ t: 2000, o: 1.1, h: 1.104, l: 1.1, c: 1.103 }]);
    expect(s.hasil).toBe("win");
    expect(s.rSebenar).toBeCloseTo(1.9, 6); // 2 − 0.1
  });

  it("SL kena → kalah", () => {
    const s = selesaikanSatu(r(), [{ t: 2000, o: 1.1, h: 1.1, l: 1.098, c: 1.0985 }]);
    expect(s.hasil).toBe("loss");
    expect(s.rSebenar).toBeCloseTo(-1, 6);
  });

  it("lilin yang menyentuh kedua-duanya dikira kalah (sama seperti backtest)", () => {
    const s = selesaikanSatu(r(), [{ t: 2000, o: 1.1, h: 1.104, l: 1.098, c: 1.1 }]);
    expect(s.hasil).toBe("loss");
  });

  it("lilin SEBELUM keputusan diabaikan — tiada lookahead terbalik", () => {
    // Lilin pada tsLilin itu sendiri (dan lebih awal) tidak boleh menyelesaikan rekod.
    const s = selesaikanSatu(r(), [
      { t: 500, o: 1.1, h: 1.104, l: 1.1, c: 1.103 },
      { t: 1000, o: 1.1, h: 1.104, l: 1.1, c: 1.103 },
    ]);
    expect(s.hasil).toBe("open");
  });

  it("belum sentuh apa-apa → kekal terbuka", () => {
    const s = selesaikanSatu(r(), [{ t: 2000, o: 1.1, h: 1.1005, l: 1.0995, c: 1.1 }]);
    expect(s.hasil).toBe("open");
  });
});

describe("selesaikan — kumpulan", () => {
  it("hanya menyentuh rekod pasangan & mod yang sepadan", () => {
    rekod(asas);
    rekod({ ...asas, pairId: "GBPUSD" });
    const kira = selesaikan("swing", "EURUSD", [{ t: 2000, o: 1.1, h: 1.104, l: 1.1, c: 1.103 }]);
    expect(kira).toBe(1);
    const semua = baca();
    expect(semua.find((x) => x.pairId === "EURUSD").hasil).toBe("win");
    expect(semua.find((x) => x.pairId === "GBPUSD").hasil).toBe("open");
  });

  it("rekod yang sudah selesai tidak diselesaikan semula", () => {
    rekod(asas);
    selesaikan("swing", "EURUSD", [{ t: 2000, o: 1.1, h: 1.104, l: 1.1, c: 1.103 }]);
    expect(selesaikan("swing", "EURUSD", [{ t: 3000, o: 1.1, h: 1.1, l: 1.09, c: 1.09 }])).toBe(0);
    expect(baca()[0].hasil).toBe("win");
  });
});

describe("untukAnalitik", () => {
  it("bentuk sepadan dengan entri jurnal supaya analytics.js boleh guna terus", () => {
    rekod(asas);
    const [e] = untukAnalitik();
    expect(e).toHaveProperty("pairId");
    expect(e).toHaveProperty("arah");
    expect(e).toHaveProperty("hasil");
    expect(e).toHaveProperty("rr");
    expect(typeof e.ts).toBe("string");
  });

  it("menapis ikut mod", () => {
    rekod(asas);
    rekod({ ...asas, modId: "scalp" });
    expect(untukAnalitik("swing").length).toBe(1);
    expect(untukAnalitik().length).toBe(2);
  });

  it("padamSemua mengosongkan log", () => {
    rekod(asas);
    padamSemua();
    expect(baca().length).toBe(0);
  });
});
