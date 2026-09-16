import { describe, it, expect } from "vitest";
import { MOD, ambilMod } from "../js/mod.js";

describe("preset MOD", () => {
  it("mempunyai mod swing & scalp", () => {
    expect(Object.keys(MOD).sort()).toEqual(["scalp", "swing"]);
  });

  it("berat trend setiap mod berjumlah 40 (= MAKS.trend)", () => {
    for (const id of Object.keys(MOD)) {
      const b = MOD[id].bobotTrend;
      expect(b.hi + b.mid + b.lo).toBe(40);
    }
  });

  it("swing kekal 1J/4J/Harian (regresi tingkah laku asal)", () => {
    expect(MOD.swing.tf).toEqual({ lo: "60", mid: "240", hi: "D" });
    // 65, bukan 70: di-anchor semula apabila baldi berita turun 10 → 5 markah supaya
    // penimbangan semula kekal neutral-skala. Lihat nota dalam js/mod.js.
    expect(MOD.swing.ambangMasuk).toBe(65);
    expect(MOD.swing.atrMelonjak).toBe(0.012);
    expect(MOD.swing.rute).toBe("dashboard");
  });

  it("scalp guna M5/M15/H1 dengan interval dalaman yang sah", () => {
    expect(MOD.scalp.tf).toEqual({ lo: "5", mid: "15", hi: "60" });
    expect(MOD.scalp.tfLabel).toEqual({ lo: "M5", mid: "M15", hi: "H1" });
    expect(MOD.scalp.rute).toBe("scalp");
  });

  it("scalp guna ATR-melonjak lebih rendah & SL/RR lebih ketat dari swing", () => {
    expect(MOD.scalp.atrMelonjak).toBeLessThan(MOD.swing.atrMelonjak);
    expect(MOD.scalp.kalk.pengganda).toBeLessThan(MOD.swing.kalk.pengganda);
    expect(MOD.scalp.kalk.rr).toBeLessThanOrEqual(MOD.swing.kalk.rr);
  });

  it("saiz mid scalp memenuhi kekangan liputan (≥ 500 M15 + 260 pemanasan)", () => {
    // 1500 M5 = 500 M15; + 260 lilin EMA200 = 760.
    expect(MOD.scalp.saiz.mid).toBeGreaterThanOrEqual(760);
  });

  it("setiap mod ada kunci ingatan berbeza", () => {
    expect(MOD.swing.ingatKunci).not.toBe(MOD.scalp.ingatKunci);
  });
});

describe("ambilMod", () => {
  it("pulangkan mod yang diminta", () => {
    expect(ambilMod("scalp")).toBe(MOD.scalp);
    expect(ambilMod("swing")).toBe(MOD.swing);
  });

  it("id tak dikenali / kosong → swing (default selamat)", () => {
    expect(ambilMod("entah")).toBe(MOD.swing);
    expect(ambilMod(undefined)).toBe(MOD.swing);
    expect(ambilMod(null)).toBe(MOD.swing);
  });
});
