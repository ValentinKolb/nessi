export default function create(api) {
  const { defineCommand, ok, err, parseArgs, positionalArgs } = api;

  const GEO_API = "https://geocoding-api.open-meteo.com/v1";
  const WEATHER_API = "https://api.open-meteo.com/v1";

  // ── Cache ──────────────────────────────────────────────────────────────

  const cache = new Map();
  const cached = async (key, fetcher) => {
    const e = cache.get(key);
    if (e && Date.now() - e.ts < 300_000) return e.data; // 5 min TTL
    const data = await fetcher();
    cache.set(key, { data, ts: Date.now() });
    return data;
  };

  // ── Geocoding ──────────────────────────────────────────────────────────

  const geocode = async (query) => {
    return cached(`geo:${query}`, async () => {
      const res = await fetch(`${GEO_API}/search?name=${encodeURIComponent(query)}&count=1&language=en`);
      if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
      const data = await res.json();
      if (!data.results || data.results.length === 0) throw new Error(`Location not found: "${query}"`);
      return data.results[0];
    });
  };

  // ── Weather ────────────────────────────────────────────────────────────

  const fetchWeather = async (lat, lon, days) => {
    const url = `${WEATHER_API}/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
      `&forecast_days=${days}&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API failed: ${res.status}`);
    return res.json();
  };

  const WMO_CODES = {
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
    80: "Rain showers", 81: "Moderate showers", 82: "Heavy showers",
    95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Severe thunderstorm",
  };

  const describeWeather = (code) => WMO_CODES[code] || `Code ${code}`;

  // ── Distance ───────────────────────────────────────────────────────────

  const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // ── Timezone helper ────────────────────────────────────────────────────

  const getLocalTime = (tz) => {
    try {
      return new Date().toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return "—";
    }
  };

  const getLocalDate = (tz) => {
    try {
      return new Date().toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
    } catch {
      return "";
    }
  };

  // ── Command ────────────────────────────────────────────────────────────

  return defineCommand("geo", async (args) => {
    const sub = (args[0] || "").toLowerCase();

    // ── geo weather <city> [--days 3]
    if (sub === "weather") {
      const rest = args.slice(1);
      const city = positionalArgs(rest).join(" ");
      if (!city) return err("Usage: geo weather Berlin [--days 3]");
      const opts = parseArgs(rest);
      const days = Math.min(parseInt(opts.get("days") || "3", 10), 14);

      try {
        const loc = await geocode(city);
        const w = await fetchWeather(loc.latitude, loc.longitude, days);
        const c = w.current;

        const lines = [
          `${loc.name}, ${loc.country} — ${describeWeather(c.weather_code)}`,
          `Temperature: ${c.temperature_2m}°C`,
          `Humidity: ${c.relative_humidity_2m}%  Wind: ${c.wind_speed_10m} km/h`,
          c.precipitation > 0 ? `Precipitation: ${c.precipitation} mm` : "",
          "",
          `Forecast (${days} days):`,
        ].filter(Boolean);

        const d = w.daily;
        for (let i = 0; i < d.time.length; i++) {
          lines.push(`  ${d.time[i]}  ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C  ${describeWeather(d.weather_code[i])}  ${d.precipitation_sum[i]}mm`);
        }

        return ok(lines.join("\n") + "\n");
      } catch (e) {
        return err(e instanceof Error ? e.message : "Weather lookup failed.");
      }
    }

    // ── geo time <city>[,city2,city3]
    if (sub === "time") {
      const rest = args.slice(1);
      const input = rest.filter((a) => !a.startsWith("--")).join(" ");
      if (!input) return err("Usage: geo time Tokyo  or  geo time London,Berlin,Tokyo");
      const cities = input.split(",").map((c) => c.trim()).filter(Boolean);

      try {
        const results = await Promise.all(cities.map(geocode));
        const lines = results.map((loc) => {
          const time = getLocalTime(loc.timezone);
          const date = getLocalDate(loc.timezone);
          return `${loc.name}, ${loc.country}  ${time}  ${date}  (${loc.timezone})`;
        });
        return ok(lines.join("\n") + "\n");
      } catch (e) {
        return err(e instanceof Error ? e.message : "Timezone lookup failed.");
      }
    }

    // ── geo distance <cityA> <cityB>
    if (sub === "distance") {
      const rest = args.slice(1);
      const parts = rest.filter((a) => !a.startsWith("--"));
      if (parts.length < 2) return err('Usage: geo distance Berlin Tokyo');
      const cityA = parts[0];
      const cityB = parts.slice(1).join(" ");

      try {
        const [a, b] = await Promise.all([geocode(cityA), geocode(cityB)]);
        const km = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
        const mi = km * 0.621371;

        return ok([
          `${a.name}, ${a.country} → ${b.name}, ${b.country}`,
          `Distance: ${km.toFixed(0)} km (${mi.toFixed(0)} mi)`,
        ].join("\n") + "\n");
      } catch (e) {
        return err(e instanceof Error ? e.message : "Distance calculation failed.");
      }
    }

    // ── geo locate <query>
    if (sub === "locate" || sub === "find" || sub === "search") {
      const rest = args.slice(1);
      const query = rest.filter((a) => !a.startsWith("--")).join(" ");
      if (!query) return err("Usage: geo locate Berlin");

      try {
        const loc = await geocode(query);
        return ok([
          `${loc.name}, ${loc.admin1 || ""}, ${loc.country}`,
          `Coordinates: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`,
          `Timezone: ${loc.timezone}`,
          `Elevation: ${loc.elevation ?? "—"}m`,
          `Population: ${loc.population ? loc.population.toLocaleString() : "—"}`,
        ].join("\n") + "\n");
      } catch (e) {
        return err(e instanceof Error ? e.message : "Location lookup failed.");
      }
    }

    // ── geo --help
    if (sub === "--help" || sub === "-h" || !sub) {
      return ok([
        "geo - Location, weather, timezone, and distance",
        "",
        "  geo weather <city> [--days N]    Current weather + forecast",
        "  geo time <city>[,city2,...]      Local time in timezone(s)",
        "  geo distance <cityA> <cityB>     Straight-line distance",
        "  geo locate <query>               Coordinates + info",
        "",
      ].join("\n"));
    }

    return err(`Unknown subcommand: ${sub}. Use 'geo --help'.`);
  });
}
