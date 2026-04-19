---
name: geo
description: "Location lookup, weather, distance, and timezone conversion. Use for any question about places, weather forecasts, time in other cities, or distances between locations."
metadata:
  nessi:
    command: geo
    enabled: true
---

# Geo

Location-aware utilities: weather, timezone, distance, and geocoding. All data from free APIs — no key needed.

## Commands

### Weather (current + forecast)

```bash
geo weather Berlin
geo weather "New York" --days 3
geo weather Tokyo --days 7
```

Returns current conditions (temperature, humidity, wind, precipitation) and daily forecast.

### Timezone / local time

```bash
geo time Tokyo
geo time "Los Angeles"
geo time London,Berlin,Tokyo
```

Shows current local time for one or multiple cities. Great for scheduling across timezones.

### Distance between two places

```bash
geo distance Berlin Tokyo
geo distance "New York" London
```

Returns straight-line distance in km and miles.

### Location lookup

```bash
geo locate Berlin
geo locate "1600 Pennsylvania Ave"
```

Returns coordinates, country, timezone, and elevation.

## Notes

- Weather data from Open-Meteo (free, no API key)
- Geocoding from Open-Meteo Geocoding API
- All distances are straight-line (great circle), not driving distances
- Temperature in Celsius by default
