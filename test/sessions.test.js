import { describe, it, expect } from "vitest";
import {
  sesiAktif,
  statusMasaOrder,
  masaTutupLilin,
  pasaranTutup,
  formatBaki,
  TUTUP_HARIAN_UTC,
} from "../js/sessions.js";

// Guna tarikh tetap (UTC) supaya ujian deterministik merentas zon mesin.
const d = (iso) => new Date(iso);

describe("pasaranTutup", () => {
  it("tutup pada Sabtu (UTC)", () => {
    expect(pasaranTutup(d("2026-01-17T12:00:00Z"))).toBe(true); // Sabtu
  });
  it("tutup pada Ahad sebelum 21:00 UTC", () => {
    expect(pasaranTutup(d("2026-01-18T12:00:00Z"))).toBe(true); // Ahad tengah hari
  });
  it("buka semula Ahad selepas 21:00 UTC", () => {
    expect(pasaranTutup(d("2026-01-18T22:00:00Z"))).toBe(false); // Ahad malam
  });
  it("tutup Jumaat selepas 21:00 UTC", () => {
    expect(pasaranTutup(d("2026-01-16T22:00:00Z"))).toBe(true); // Jumaat lewat
  });
  it("buka pada hari bekerja biasa", () => {
    expect(pasaranTutup(d("2026-01-14T12:00:00Z"))).toBe(false); // Rabu
  });
});

describe("statusMasaOrder", () => {
  it("PASARAN TUTUP pada hujung minggu", () => {
    const st = statusMasaOrder(d("2026-01-17T12:00:00Z"));
    expect(st.tutup).toBe(true);
    expect(st.label).toBe("PASARAN TUTUP");
    expect(st.tahap).toBe("elak");
  });
  it("ELOK semasa overlap London & New York", () => {
    // Rabu 14:00 UTC (musim sejuk, tiada DST): London 14:00, NY 09:00 — kedua aktif.
    const st = statusMasaOrder(d("2026-01-14T14:00:00Z"));
    expect(st.tahap).toBe("elok");
    expect(st.label).toBe("ELOK");
  });
  it("ELAK bila tiada sesi aktif pada hari bekerja", () => {
    // Rabu 03:00 UTC: London/NY tutup; Sydney/Tokyo — semak ia bukan tutup pasaran.
    const st = statusMasaOrder(d("2026-01-14T23:30:00Z"));
    expect(st.tutup).toBeUndefined();
  });
});

describe("sesiAktif", () => {
  it("kembali senarai kosong pada Sabtu (waktu tempatan kota hujung minggu)", () => {
    expect(sesiAktif(d("2026-01-17T12:00:00Z"))).toEqual([]);
  });
  it("London aktif pada Rabu 14:00 UTC", () => {
    expect(sesiAktif(d("2026-01-14T14:00:00Z"))).toContain("London");
  });
});

describe("masaTutupLilin", () => {
  it("lilin harian tutup pada 21:00 UTC hari sama jika masih awal", () => {
    const { saatBaki } = masaTutupLilin(d("2026-01-14T10:00:00Z"), "D");
    expect(saatBaki).toBe((TUTUP_HARIAN_UTC - 10) * 3600); // 11 jam
  });
  it("lilin harian melangkau ke esok jika sudah lepas 21:00 UTC", () => {
    const { saatBaki } = masaTutupLilin(d("2026-01-14T22:00:00Z"), "D");
    expect(saatBaki).toBe((24 - 22 + TUTUP_HARIAN_UTC) * 3600); // 23 jam
  });
  it("lilin 1 jam (60) ke sempadan jam UTC seterusnya", () => {
    const { saatBaki } = masaTutupLilin(d("2026-01-14T10:30:00Z"), "60");
    expect(saatBaki).toBe(30 * 60);
  });
  it("lilin 4 jam (240) diselaras dari 00:00 UTC", () => {
    // 10:30 → sempadan 4J seterusnya = 12:00 UTC = 90 minit.
    const { saatBaki } = masaTutupLilin(d("2026-01-14T10:30:00Z"), "240");
    expect(saatBaki).toBe(90 * 60);
  });
});

describe("formatBaki", () => {
  it("format saat → HH:MM:SS", () => {
    expect(formatBaki(3661)).toBe("01:01:01");
    expect(formatBaki(0)).toBe("00:00:00");
  });
});
