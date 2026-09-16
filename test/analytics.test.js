import { describe, it, expect } from "vitest";
import {
  rTrade,
  ringkasan,
  ikutKumpulan,
  kelukEkuiti,
  streak,
  sesiEntri,
  kalahBerturutHariIni,
} from "../js/analytics.js";

// Fikstur: cap masa tetap (UTC). Rabu 14:00 UTC = sesi London aktif.
const t = (jam) => `2026-01-14T${String(jam).padStart(2, "0")}:00:00Z`;

const dagangan = [
  { id: 1, ts: t(14), pairId: "EURUSD", arah: "Buy", rr: 2, hasil: "win" },
  { id: 2, ts: t(15), pairId: "EURUSD", arah: "Sell", rr: 2, hasil: "loss" },
  { id: 3, ts: t(16), pairId: "GBPUSD", arah: "Buy", rr: 3, hasil: "win" },
  { id: 4, ts: t(17), pairId: "EURUSD", arah: "Buy", rr: 2, hasil: "be" },
  { id: 5, ts: t(18), pairId: "GBPUSD", arah: "Buy", rr: 2, hasil: "open" }, // belum tutup
];

describe("rTrade", () => {
  it("guna rSebenar bila diisi", () => {
    expect(rTrade({ hasil: "win", rr: 2, rSebenar: 1.4 })).toBe(1.4);
  });
  it("anggar dari keputusan bila tiada rSebenar", () => {
    expect(rTrade({ hasil: "win", rr: 2 })).toBe(2);
    expect(rTrade({ hasil: "loss", rr: 2 })).toBe(-1);
    expect(rTrade({ hasil: "be", rr: 2 })).toBe(0);
  });
});

describe("ringkasan", () => {
  const s = ringkasan(dagangan);
  it("kira dagangan tertutup (kecuali open)", () => {
    expect(s.ditutup).toBe(4); // win, loss, win, be
    expect(s.menang).toBe(2);
    expect(s.kalah).toBe(1);
    expect(s.be).toBe(1);
  });
  it("kadar menang antara menang vs kalah (BE dikecualikan)", () => {
    expect(s.kadarMenang).toBe(67); // 2/(2+1)
  });
  it("expectancy = purata R semua tertutup", () => {
    // R: +2, −1, +3, 0 → jumlah 4 ÷ 4 = 1.0
    expect(s.expectancyR).toBeCloseTo(1.0, 5);
  });
  it("profit factor = untung ÷ rugi", () => {
    // untung 5R, rugi 1R → 5
    expect(s.profitFactor).toBeCloseTo(5, 5);
  });
});

describe("ikutKumpulan", () => {
  it("kumpul ikut pasangan", () => {
    const g = ikutKumpulan(dagangan, (e) => e.pairId);
    const eur = g.find((x) => x.kunci === "EURUSD");
    expect(eur.count).toBe(3); // win, loss, be
    expect(eur.menang).toBe(1);
    expect(eur.kalah).toBe(1);
  });
  it("kumpul ikut arah", () => {
    const g = ikutKumpulan(dagangan, (e) => e.arah);
    const buy = g.find((x) => x.kunci === "Buy");
    expect(buy.count).toBe(3); // 2 win + 1 be
  });
});

describe("kelukEkuiti", () => {
  it("R terkumpul ikut kronologi", () => {
    const k = kelukEkuiti(dagangan);
    expect(k.map((p) => p.kumulatif)).toEqual([2, 1, 4, 4]); // +2, −1, +3, 0
  });
});

describe("streak", () => {
  it("kesan streak semasa & maksimum", () => {
    const s = streak(dagangan); // win, loss, win (BE & open dikecualikan)
    expect(s.maksMenang).toBe(1);
    expect(s.maksKalah).toBe(1);
    expect(s.semasa).toBe(1); // dagangan tertutup terakhir (id 3) = win
  });
});

describe("sesiEntri", () => {
  it("derive sesi dari cap masa", () => {
    // Rabu 14:00 UTC (musim sejuk): London & New York aktif → utama = London.
    expect(sesiEntri({ ts: t(14) })).toBe("London");
  });
});

describe("kalahBerturutHariIni", () => {
  const now = new Date("2024-06-12T18:00:00Z");
  const jam = (h, hasil) => ({ ts: `2024-06-12T${String(h).padStart(2, "0")}:00:00Z`, hasil });

  it("mengira rentetan SEMASA dari dagangan terbaharu ke belakang", () => {
    expect(kalahBerturutHariIni([jam(9, "loss"), jam(10, "loss"), jam(11, "loss")], now)).toBe(3);
  });

  it("kemenangan memutuskan rentetan walaupun banyak kalah lebih awal", () => {
    // 3 kalah, kemudian menang → rentetan semasa ialah 0, bukan 3.
    const list = [jam(9, "loss"), jam(10, "loss"), jam(11, "loss"), jam(12, "win")];
    expect(kalahBerturutHariIni(list, now)).toBe(0);
  });

  it("mengira semula selepas kemenangan", () => {
    const list = [jam(9, "loss"), jam(10, "win"), jam(11, "loss"), jam(12, "loss")];
    expect(kalahBerturutHariIni(list, now)).toBe(2);
  });

  it("kekalahan semalam tidak dikira", () => {
    const semalam = [
      { ts: "2024-06-11T09:00:00Z", hasil: "loss" },
      { ts: "2024-06-11T10:00:00Z", hasil: "loss" },
      { ts: "2024-06-11T11:00:00Z", hasil: "loss" },
    ];
    expect(kalahBerturutHariIni(semalam, now)).toBe(0);
  });

  it("BE dilangkau, bukan dikira sebagai pemutus rentetan", () => {
    const list = [jam(9, "loss"), jam(10, "be"), jam(11, "loss")];
    expect(kalahBerturutHariIni(list, now)).toBe(2);
  });

  it("dagangan terbuka diabaikan", () => {
    const list = [jam(9, "loss"), jam(10, "loss"), jam(13, "open")];
    expect(kalahBerturutHariIni(list, now)).toBe(2);
  });

  it("senarai kosong / tak sah → 0, tiada throw", () => {
    expect(kalahBerturutHariIni([], now)).toBe(0);
    expect(kalahBerturutHariIni(null, now)).toBe(0);
  });
});
