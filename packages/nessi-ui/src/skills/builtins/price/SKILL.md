---
name: price
description: "Live metal/crypto prices, jewelry valuation by weight+purity, currency conversion. Use for gold, silver, platinum prices, jewelry value, or exchange rates."
metadata:
  nessi:
    command: price
    enabled: true
---

# Price

Live prices for precious metals and crypto. Calculate the value of jewelry or scrap metal by weight and purity. Also converts currencies at live rates.

## When to use this skill

Use `price` whenever the user asks about:
- Current gold, silver, platinum, or crypto prices
- The value of jewelry, coins, or scrap metal (by weight, purity, karat)
- Currency conversion (e.g., "100 USD in EUR")

## Commands

### Get current price per troy ounce

```bash
price gold
price silver --currency EUR
price platinum --currency CHF
price bitcoin
```

Available metals/assets: gold, silver, platinum, palladium, copper, bitcoin, ethereum. Use `price list` to see all.

### Calculate value of metal by weight and purity

This is the most important command. It calculates the exact value — **you never need to do the math yourself**.

```bash
price value gold --weight 23 --purity 750 --currency EUR
price value gold --weight 5.5 --unit oz --purity 999
price value silver --weight 100 --purity 925 --currency EUR
```

**Parameters:**
- `--weight` (required) — weight as a number
- `--unit` — `g` (default), `kg`, `oz` (troy ounce = 31.1035g), `dwt` (pennyweight = 1.555g)
- `--purity` (required) — fineness or karat. Accepts: `333`, `585`, `750`, `999`, `8K`, `14K`, `18K`, `24K`, or decimal like `0.75`. **Always ask the user for purity if they didn't specify it.**
- `--currency` — output currency (default: EUR). Any ISO code: USD, EUR, GBP, CHF, etc.

### Convert currency

```bash
price convert 100 --from USD --to EUR
price convert 500 --from CHF --to GBP
```

### List available assets

```bash
price list
```

## How to handle user questions

When the user asks about the value of a piece of jewelry or metal, you need three things:

1. **What metal?** — gold, silver, platinum (default: gold)
2. **How heavy?** — weight in grams (ask if not given)
3. **What purity?** — karat or fineness stamp (ask if not given — common stamps: 333, 585, 750, 916, 999)

If the user doesn't specify purity, **ask them**. Common purity marks are stamped on jewelry (e.g., "750" or "18K" inside a ring). Don't assume 999 for jewelry — that would overestimate the value.

### Purity reference

| Stamp | Karat | Purity | Typical use |
|-------|-------|--------|-------------|
| 333 | 8K | 33.3% | Budget jewelry (common in Germany) |
| 375 | 9K | 37.5% | UK jewelry |
| 585 | 14K | 58.5% | Standard jewelry |
| 750 | 18K | 75.0% | Fine jewelry |
| 900 | 21.6K | 90.0% | Coins |
| 916 | 22K | 91.6% | Indian/Middle Eastern jewelry |
| 999 | 24K | 99.9% | Pure gold bars/coins |

## Presenting results

After running a price command, use the `card` tool (metric layout) to display the result visually instead of writing it as plain text. The card tool is a direct tool — call it by name, not via bash.

For a single price lookup, use a single metric card. For a valuation with weight and purity, use multiple metrics (items array) to show the key values (weight, purity, material value) at a glance. Add subtitles for context (e.g. "per troy ounce", "33.75g pure gold"). Use icons like `ti-coin`, `ti-currency-euro`, or `ti-scale`.

### Example conversation flow

User: "Ich habe eine Goldkette, 23 Gramm, was ist die wert?"
→ You don't know the purity yet. Ask: "Welche Feinheit hat die Kette? Das steht oft als Stempel drauf — z.B. 333, 585, oder 750."
User: "750"
→ Run: `price value gold --weight 23 --purity 750 --currency EUR`
→ Show the result with the `card` tool (metric layout with items for weight, purity, and value), then add a brief interpretation.
