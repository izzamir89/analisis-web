import { describe, it, expect } from "vitest";
import {
  gabungLilin,
  mulaHariUTC,
  mulaTempoh,
  siriPadaMasa,
  TEMPOH_4J,
  TEMPOH_HARI,
  JAM,
} from "../js/mtf.js";

const c = (t, o, h, l, cl) => ({ t, o, h, l, c: cl });

describe("gabungLilin", () => {
  it("o pertama, c terakhir, h max, l min, t pertama", () => {
    const g = gabungLilin([
      c(10, 1.0, 1.5, 0.9, 1.2),
      c(20, 1.2, 1.8, 1.1, 1.6),
      c(30, 1.6, 1.7, 0.8, 1.4),
    ]);
    expect(g).toEqual({ t: 10, o: 1.0, h: 1.8, l: 0.8, c: 1.4 });
  });
  it("kumpulan kosong → null", () => {
    expect(gabungLilin([])).toBe(null);
    expect(gabungLilin(null)).toBe(null);
  });
});

describe("mulaTempoh", () => {
  it("hari UTC", () => {
    const t = Date.UTC(2026, 2, 15, 17, 30);
    expect(mulaTempoh(t, TEMPOH_HARI)).toBe(Date.UTC(2026, 2, 15));
    expect(mulaHariUTC(t)).toBe(Date.UTC(2026, 2, 15));
  });
  it("baldi 4J sejajar epoch (00,04,08… UTC)", () => {
    const t = Date.UTC(2026, 2, 15, 9, 45);
    expect(mulaTempoh(t, TEMPOH_4J)).toBe(Date.UTC(2026, 2, 15, 8));
  });
});

describe("siriPadaMasa", () => {
  const H = (hari, jam = 0) => Date.UTC(2026, 0, hari, jam);
  // Lilin harian sebenar 1–5 Jan.
  const harian = [
    c(H(1), 1.0, 1.1, 0.9, 1.05),
    c(H(2), 1.05, 1.2, 1.0, 1.15),
    c(H(3), 1.15, 1.25, 1.1, 1.2),
    c(H(4), 1.2, 1.3, 1.15, 1.25),
    c(H(5), 1.25, 1.4, 1.2, 1.35), // hari "semasa" dalam ujian di bawah
  ];
  // Lilin 1J untuk 5 Jan, jam 0–5.
  const jam5 = [
    c(H(5, 0), 1.25, 1.27, 1.24, 1.26),
    c(H(5, 1), 1.26, 1.28, 1.25, 1.27),
    c(H(5, 2), 1.27, 1.31, 1.26, 1.3),
    c(H(5, 3), 1.3, 1.33, 1.29, 1.32),
    c(H(5, 4), 1.32, 1.36, 1.31, 1.35),
    c(H(5, 5), 1.35, 1.38, 1.34, 1.37),
  ];

  it("gabungkan hari lengkap + lilin separa hari semasa dari 1J", () => {
    const t = H(5, 3); // pukul 03:00 pada 5 Jan
    const siri = siriPadaMasa(harian, jam5, t, TEMPOH_HARI);
    expect(siri).toHaveLength(5); // 4 hari lengkap + 1 separa
    // Empat yang pertama ialah lilin harian sebenar 1–4 Jan.
    expect(siri.slice(0, 4)).toEqual(harian.slice(0, 4));
    // Yang terakhir dibina dari jam 00–03 SAHAJA.
    expect(siri[4]).toEqual({ t: H(5, 0), o: 1.25, h: 1.33, l: 1.24, c: 1.32 });
  });

  it("TIADA lookahead — lilin separa tidak pernah menyentuh data selepas t", () => {
    const t = H(5, 1);
    const siri = siriPadaMasa(harian, jam5, t, TEMPOH_HARI);
    const separa = siri[siri.length - 1];
    // High sebenar hari itu ialah 1.40 dan 1J kemudian mencecah 1.38 —
    // pada 01:00 kita hanya patut nampak 1.28.
    expect(separa.h).toBe(1.28);
    expect(separa.c).toBe(1.27);
    expect(separa.h).toBeLessThan(harian[4].h);
  });

  it("lilin harian yang mengandungi t TIDAK PERNAH digunakan secara mentah", () => {
    const t = H(5, 5);
    const siri = siriPadaMasa(harian, jam5, t, TEMPOH_HARI);
    expect(siri).not.toContainEqual(harian[4]);
    expect(siri[siri.length - 1].h).toBe(1.38); // dari 1J, bukan 1.40 harian
  });

  it("tiada lilin 1J dalam tempoh semasa → hari lengkap sahaja", () => {
    const siri = siriPadaMasa(harian, [], H(5, 0), TEMPOH_HARI);
    expect(siri).toEqual(harian.slice(0, 4));
  });

  it("hari semasa ditentukan oleh t, bukan oleh hujung siri", () => {
    // Sesaat sebelum 5 Jan bermakna kita masih pada 4 Jan → lengkap = 1–3 Jan.
    const siri = siriPadaMasa(harian, [], H(5, 0) - 1, TEMPOH_HARI);
    expect(siri).toEqual(harian.slice(0, 3));
  });

  it("hadkan bilangan lilin lengkap yang disimpan", () => {
    const banyak = Array.from({ length: 500 }, (_, i) => c(H(1) + i * TEMPOH_HARI, 1, 2, 0, 1.5));
    const t = H(1) + 499 * TEMPOH_HARI;
    expect(siriPadaMasa(banyak, [], t, TEMPOH_HARI, 260)).toHaveLength(260);
  });

  it("berfungsi untuk baldi 4J", () => {
    const empat = [c(H(5, 0), 1, 1.1, 0.9, 1.05), c(H(5, 4), 1.05, 1.2, 1.0, 1.15)];
    const t = H(5, 5); // dalam baldi 04:00–08:00
    const siri = siriPadaMasa(empat, jam5, t, TEMPOH_4J);
    expect(siri).toHaveLength(2); // baldi 00:00 lengkap + separa 04:00
    expect(siri[0]).toEqual(empat[0]);
    expect(siri[1].t).toBe(H(5, 4));
    expect(siri[1].c).toBe(1.37); // tutup 1J pukul 05:00
  });

  it("input tak sah → array kosong, tiada throw", () => {
    expect(siriPadaMasa(null, jam5, H(5, 3), TEMPOH_HARI)).toEqual([]);
    expect(siriPadaMasa(harian, null, 0, TEMPOH_HARI)).toEqual([]);
    expect(siriPadaMasa([], [], H(5, 3), TEMPOH_HARI)).toEqual([]);
  });

  it("JAM dieksport untuk pengiraan tempoh", () => {
    expect(JAM).toBe(3600000);
    expect(TEMPOH_4J).toBe(4 * JAM);
  });
});
