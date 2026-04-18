---
name: stock
description: "Live stock quotes, historical prices, and multi-stock comparison. Use for any question about stock prices, market data, or portfolio tracking. Outputs CSV for direct chart pipeline."
metadata:
  nessi:
    command: stock
    enabled: true
---

# Stock

Live stock market data via Twelve Data API. Look up current quotes, pull historical prices as CSV, and compare multiple stocks.

Requires an API key — the user can get a free one at [twelvedata.com](https://twelvedata.com) and add it in Settings → API Keys.

## Commands

### Current quote

```bash
stock AAPL
stock MSFT
stock BTC/USD
```

Returns: price, change, percent change, open, high, low, volume, 52-week range.

### Historical prices (CSV output for chart pipeline)

```bash
stock history AAPL --range 1mo --output /output/aapl.csv
stock history TSLA --range 3mo --interval 1wk --output /output/tsla_weekly.csv
stock history BTC/USD --range 1y --output /output/btc.csv
```

**Ranges:** `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`
**Intervals:** `1day` (default), `1week`, `1month`

### Compare multiple stocks

```bash
stock compare AAPL,MSFT,GOOGL --range 1mo --output /output/tech.csv
```

Outputs a single CSV with columns: `date`, `AAPL`, `MSFT`, `GOOGL` (close prices).

## Pipeline: stock → chart

```bash
stock history AAPL --range 3mo --output /output/aapl.csv
chart line /output/aapl.csv --x "date" --y "close" --title "AAPL 3 Months"
present /output/line-chart.svg
```

```bash
stock compare AAPL,MSFT --range 6mo --output /output/compare.csv
chart line /output/compare.csv --x "date" --y "AAPL,MSFT" --title "AAPL vs MSFT"
present /output/line-chart.svg
```

## What to ask the user

If the user asks about a stock but doesn't specify a ticker symbol, ask them. Common examples:
- Apple → AAPL
- Microsoft → MSFT
- Tesla → TSLA
- Google/Alphabet → GOOGL
- Amazon → AMZN
- Bitcoin → BTC/USD
- Ethereum → ETH/USD

## Presenting results

For current stock quotes, use the `card` tool (metric layout) to display the result visually. The card tool is a direct tool — call it by name, not via bash.

- Single stock: metric card with price as value, change as subtitle. Use `ti-trending-up` or `ti-trending-down` based on direction.
- Multiple stocks compared: metric card with items array, one per ticker.

For historical data and charts, use the chart pipeline (stock → chart → present) as shown above.

## Notes

- All data from Twelve Data API (free tier: 800 requests/day, 8 per minute)
- Prices cached for 60 seconds to avoid rate limits
- If you get an API key error, tell the user to add their key in Settings → API Keys → Twelve Data
