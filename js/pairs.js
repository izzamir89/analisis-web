// Senarai pasangan forex — cermin _FX_PAIRS dari engine/screener.py
// Setiap pasangan dipetakan ke simbol TradingView (provider:simbol) untuk widget.
// Emas (XAUUSD) guna OANDA; pasangan major guna FX_IDC (data percuma TradingView).
export const PAIRS = [
  { id: "EURUSD", tv: "FX:EURUSD", nama: "Euro / Dolar AS", pip: 0.0001, digit: 5 },
  { id: "GBPUSD", tv: "FX:GBPUSD", nama: "Paun / Dolar AS", pip: 0.0001, digit: 5 },
  { id: "USDJPY", tv: "FX:USDJPY", nama: "Dolar AS / Yen", pip: 0.01, digit: 3 },
  { id: "USDCHF", tv: "FX:USDCHF", nama: "Dolar AS / Franc", pip: 0.0001, digit: 5 },
  { id: "AUDUSD", tv: "FX:AUDUSD", nama: "Dolar Australia / Dolar AS", pip: 0.0001, digit: 5 },
  { id: "USDCAD", tv: "FX:USDCAD", nama: "Dolar AS / Dolar Kanada", pip: 0.0001, digit: 5 },
  { id: "NZDUSD", tv: "FX:NZDUSD", nama: "Dolar NZ / Dolar AS", pip: 0.0001, digit: 5 },
  { id: "XAUUSD", tv: "OANDA:XAUUSD", nama: "Emas / Dolar AS", pip: 0.1, digit: 2 },
];

// Cari pasangan ikut id; lalai ke pasangan pertama jika tiada.
export function cariPair(id) {
  return PAIRS.find((p) => p.id === id) || PAIRS[0];
}
