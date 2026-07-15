// Senarai pasangan forex — cermin _FX_PAIRS dari engine/screener.py
// Setiap pasangan dipetakan ke simbol TradingView (provider:simbol) untuk widget.
// Emas (XAUUSD) guna OANDA; pasangan major guna FX_IDC (data percuma TradingView).
// Medan `td` = simbol bentuk-slash untuk API data pasaran (Twelve Data) di marketdata.js.
export const PAIRS = [
  { id: "EURUSD", tv: "FX:EURUSD", td: "EUR/USD", nama: "Euro / Dolar AS", pip: 0.0001, digit: 5 },
  { id: "GBPUSD", tv: "FX:GBPUSD", td: "GBP/USD", nama: "Paun / Dolar AS", pip: 0.0001, digit: 5 },
  { id: "USDJPY", tv: "FX:USDJPY", td: "USD/JPY", nama: "Dolar AS / Yen", pip: 0.01, digit: 3 },
  { id: "USDCHF", tv: "FX:USDCHF", td: "USD/CHF", nama: "Dolar AS / Franc", pip: 0.0001, digit: 5 },
  {
    id: "AUDUSD",
    tv: "FX:AUDUSD",
    td: "AUD/USD",
    nama: "Dolar Australia / Dolar AS",
    pip: 0.0001,
    digit: 5,
  },
  {
    id: "USDCAD",
    tv: "FX:USDCAD",
    td: "USD/CAD",
    nama: "Dolar AS / Dolar Kanada",
    pip: 0.0001,
    digit: 5,
  },
  {
    id: "NZDUSD",
    tv: "FX:NZDUSD",
    td: "NZD/USD",
    nama: "Dolar NZ / Dolar AS",
    pip: 0.0001,
    digit: 5,
  },
  { id: "XAUUSD", tv: "OANDA:XAUUSD", td: "XAU/USD", nama: "Emas / Dolar AS", pip: 0.1, digit: 2 },
];

// Cari pasangan ikut id; lalai ke pasangan pertama jika tiada.
export function cariPair(id) {
  return PAIRS.find((p) => p.id === id) || PAIRS[0];
}
