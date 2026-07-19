import { describe, it, expect } from "vitest";
import { tekananPasaran } from "../js/tekanan.js";

// Siri asas: 20 lilin berjulat ~1.0 supaya ATR(14) stabil menghampiri 1.0.
function asas(n = 20) {
  return Array.from({ length: n }, (_, i) => ({
    t: i * 3600000,
    o: 100,
    h: 100.5,
    l: 99.5,
    c: 100,
  }));
}

describe("tekananPasaran", () => {
  it("lilin lebar berbadan penuh sejajar arah → skorFrac tinggi", () => {
    const s = asas();
    s.push({ t: 99, o: 100, h: 102, l: 99.8, c: 101.9 }); // julat 2.2, badan ~86%
    const r = tekananPasaran(s, "Buy");
    expect(r.selari).toBe(true);
    expect(r.ekspansi).toBeGreaterThan(1.5);
    expect(r.skorFrac).toBeGreaterThan(0.9);
    expect(r.sebab).toContain("kuat");
  });

  it("doji sempit → skorFrac rendah", () => {
    const s = asas();
    s.push({ t: 99, o: 100, h: 100.2, l: 99.95, c: 100.02 });
    const r = tekananPasaran(s, "Buy");
    expect(r.skorFrac).toBeLessThan(0.3);
  });

  it("badan menentang arah dikenakan penalti berat", () => {
    const s = asas();
    const lilin = { t: 99, o: 100, h: 102, l: 99.8, c: 101.9 };
    const beli = tekananPasaran([...s, lilin], "Buy");
    const jual = tekananPasaran([...s, lilin], "Sell");
    expect(jual.selari).toBe(false);
    expect(jual.skorFrac).toBeCloseTo(beli.skorFrac * 0.3, 5);
    expect(jual.sebab).toContain("menentang");
  });

  it("data tak cukup untuk ATR → null, tiada throw", () => {
    expect(tekananPasaran([{ t: 0, o: 1, h: 2, l: 0, c: 1 }], "Buy")).toBe(null);
    expect(tekananPasaran([], "Buy")).toBe(null);
    expect(tekananPasaran(null, "Buy")).toBe(null);
  });

  it("lilin tanpa julat → skorFrac 0 tanpa bahagi-sifar", () => {
    const s = asas();
    s.push({ t: 99, o: 100, h: 100, l: 100, c: 100 });
    const r = tekananPasaran(s, "Buy");
    expect(r.skorFrac).toBe(0);
    expect(Number.isFinite(r.badanPct)).toBe(true);
  });
});
