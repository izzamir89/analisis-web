import { describe, it, expect, beforeEach } from "vitest";
import { analisaPasangan, susunKeputusan, sebabRingkas } from "../js/analisis.js";
import { ambilMod } from "../js/mod.js";

beforeEach(() => {
  localStorage.clear();
});

const mod = ambilMod("swing");

// Siri menaik stabil: EMA bertindan bullish, cukup panjang untuk EMA200 + ADX.
function siriNaik(n = 300, mula = 1.0) {
  return Array.from({ length: n }, (_, i) => {
    const c = mula + i * 0.0004;
    return { t: i * 3600000, o: c - 0.0001, h: c + 0.0003, l: c - 0.0003, c };
  });
}

describe("analisaPasangan", () => {
  it("menghasilkan keputusan penuh dari lilin sahaja", () => {
    const lo = siriNaik();
    const r = analisaPasangan({
      pairId: "EURUSD",
      mod,
      candlesLo: lo,
      candlesMid: siriNaik(300, 1.0),
      candlesHi: siriNaik(300, 1.0),
      now: new Date("2024-06-12T14:00:00Z"), // Rabu, overlap London/NY
    });
    expect(r).toBeTruthy();
    expect(r).toHaveProperty("verdict");
    expect(r).toHaveProperty("skor");
    expect(r).toHaveProperty("skorTerasNorm");
    expect(["BUY", "SELL", "WAIT", "NO TRADE"]).toContain(r.verdict);
  });

  it("TF konteks hilang → gate data tidak lengkap, bukan separuh kredit", () => {
    const r = analisaPasangan({
      pairId: "EURUSD",
      mod,
      candlesLo: siriNaik(),
      candlesMid: null,
      candlesHi: null,
      now: new Date("2024-06-12T14:00:00Z"),
    });
    expect(r.gate.lulus).toBe(false);
    expect(r.gate.sebab.join(" ")).toContain("tidak lengkap");
  });

  it("tiada lilin TF-entry → null", () => {
    expect(analisaPasangan({ pairId: "EURUSD", mod, candlesLo: [] })).toBe(null);
    expect(analisaPasangan({ pairId: "EURUSD", mod, candlesLo: null })).toBe(null);
  });

  it("mengira kos secara automatik dan menyuapnya ke enjin", () => {
    const r = analisaPasangan({
      pairId: "EURUSD",
      mod,
      candlesLo: siriNaik(),
      candlesMid: siriNaik(),
      candlesHi: siriNaik(),
      now: new Date("2024-06-12T14:00:00Z"),
    });
    expect(r.kos).toBeTruthy();
    expect(r.kos.kosPip).toBeGreaterThan(0);
  });

  it("kos yang disuntik mengatasi bacaan tetapan", () => {
    const kos = { gate: true, amaran: false, kosR: 0.9, sebab: "Kos ujian terlalu tinggi." };
    const r = analisaPasangan({
      pairId: "EURUSD",
      mod,
      candlesLo: siriNaik(),
      candlesMid: siriNaik(),
      candlesHi: siriNaik(),
      now: new Date("2024-06-12T14:00:00Z"),
      kos,
    });
    expect(r.verdict).toBe("NO TRADE");
    expect(r.gate.sebab.join(" ")).toContain("Kos ujian");
  });

  it("gate risiko harian mengalir melalui pipeline", () => {
    const r = analisaPasangan({
      pairId: "EURUSD",
      mod,
      candlesLo: siriNaik(),
      candlesMid: siriNaik(),
      candlesHi: siriNaik(),
      now: new Date("2024-06-12T14:00:00Z"),
      risikoHarian: { melebihi: true, digunakan: 50, had: 50 },
    });
    expect(r.gate.lulus).toBe(false);
    expect(r.gate.sebab.join(" ")).toContain("Bajet risiko harian");
  });
});

describe("susunKeputusan", () => {
  const buat = (id, verdict, skor) => ({ pair: { id }, hasil: { verdict, skor } });

  it("setup boleh-dagang didahulukan walaupun skornya lebih rendah", () => {
    const disusun = susunKeputusan([
      buat("A", "NO TRADE", 95),
      buat("B", "BUY", 68),
      buat("C", "WAIT", 88),
    ]);
    expect(disusun[0].pair.id).toBe("B");
  });

  it("dalam kumpulan yang sama, skor lebih tinggi didahulukan", () => {
    const disusun = susunKeputusan([buat("A", "BUY", 70), buat("B", "SELL", 85)]);
    expect(disusun.map((x) => x.pair.id)).toEqual(["B", "A"]);
  });

  it("keputusan tanpa hasil jatuh ke bawah tanpa throw", () => {
    const disusun = susunKeputusan([{ pair: { id: "X" }, hasil: null }, buat("A", "BUY", 70)]);
    expect(disusun[0].pair.id).toBe("A");
  });
});

describe("sebabRingkas", () => {
  it("gate gagal → sebab gate pertama", () => {
    expect(sebabRingkas({ gate: { lulus: false, sebab: ["Pasaran tutup."] } })).toBe(
      "Pasaran tutup."
    );
  });

  it("WAIT kerana tiada ruang → amaran ruang dikembalikan", () => {
    const r = {
      gate: { lulus: true, sebab: [] },
      verdict: "WAIT",
      skor: 72,
      amaran: ["Rintangan 1.10500 hanya 0.40R jauh — tiada ruang untuk 1R, tunggu breakout."],
    };
    expect(sebabRingkas(r)).toContain("tiada ruang untuk 1R");
  });

  it("WAIT kerana skor rendah → sebut skor", () => {
    const r = { gate: { lulus: true, sebab: [] }, verdict: "WAIT", skor: 55, amaran: [] };
    expect(sebabRingkas(r)).toContain("55");
  });

  it("setup boleh dagang → rentetan kosong", () => {
    expect(sebabRingkas({ gate: { lulus: true, sebab: [] }, verdict: "BUY", amaran: [] })).toBe("");
  });

  it("tiada hasil → mesej data", () => {
    expect(sebabRingkas(null)).toBe("Data tiada.");
  });
});
