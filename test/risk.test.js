import { describe, it, expect } from "vitest";
import { pendedahanMataWang, amaranPendedahan, bakiRisikoHarian } from "../js/risk.js";

describe("pendedahanMataWang", () => {
  it("gabung pendedahan mata wang dari posisi terbuka", () => {
    const net = pendedahanMataWang([
      { pairId: "EURUSD", arah: "Buy", hasil: "open" }, // +EUR −USD
      { pairId: "GBPUSD", arah: "Buy", hasil: "open" }, // +GBP −USD
    ]);
    expect(net.USD).toBe(-2);
    expect(net.EUR).toBe(1);
    expect(net.GBP).toBe(1);
  });

  it("Sell menyongsangkan tanda", () => {
    const net = pendedahanMataWang([{ pairId: "USDJPY", arah: "Sell", hasil: "open" }]);
    expect(net.USD).toBe(-1);
    expect(net.JPY).toBe(1);
  });

  it("guna saiz lot sebagai berat", () => {
    const net = pendedahanMataWang([{ pairId: "EURUSD", arah: "Buy", lot: 0.5, hasil: "open" }]);
    expect(net.EUR).toBe(0.5);
    expect(net.USD).toBe(-0.5);
  });

  it("abai dagangan tertutup", () => {
    const net = pendedahanMataWang([{ pairId: "EURUSD", arah: "Buy", hasil: "win" }]);
    expect(Object.keys(net)).toHaveLength(0);
  });

  it("pendedahan yang saling batal hilang", () => {
    const net = pendedahanMataWang([
      { pairId: "EURUSD", arah: "Buy", hasil: "open" },
      { pairId: "EURUSD", arah: "Sell", hasil: "open" },
    ]);
    expect(Object.keys(net)).toHaveLength(0);
  });
});

describe("amaranPendedahan", () => {
  it("bendera mata wang melepasi ambang", () => {
    const a = amaranPendedahan(
      [
        { pairId: "EURUSD", arah: "Buy", hasil: "open" },
        { pairId: "GBPUSD", arah: "Buy", hasil: "open" },
      ],
      2
    );
    const usd = a.find((x) => x.mataWang === "USD");
    expect(usd.net).toBe(-2);
    expect(usd.arah).toBe("short");
  });
});

describe("bakiRisikoHarian", () => {
  const now = new Date("2026-01-14T20:00:00Z");
  it("jumlahkan loss hari ini vs had", () => {
    const r = bakiRisikoHarian(
      [
        { hasil: "loss", ts: "2026-01-14T10:00:00Z", amaunRisiko: 10 },
        { hasil: "loss", ts: "2026-01-14T12:00:00Z", amaunRisiko: 15 },
        { hasil: "loss", ts: "2026-01-13T12:00:00Z", amaunRisiko: 99 }, // semalam
        { hasil: "win", ts: "2026-01-14T09:00:00Z", amaunRisiko: 10 }, // menang
      ],
      now,
      50
    );
    expect(r.digunakan).toBe(25);
    expect(r.baki).toBe(25);
    expect(r.melebihi).toBe(false);
    expect(r.peratus).toBe(50);
  });

  it("tanda melebihi bila had dicapai", () => {
    const r = bakiRisikoHarian(
      [{ hasil: "loss", ts: "2026-01-14T10:00:00Z", amaunRisiko: 60 }],
      now,
      50
    );
    expect(r.melebihi).toBe(true);
    expect(r.baki).toBe(-10);
  });

  it("had null bila tiada had diset", () => {
    const r = bakiRisikoHarian([], now, 0);
    expect(r.had).toBeNull();
    expect(r.baki).toBeNull();
  });
});
