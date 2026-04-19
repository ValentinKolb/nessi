export default function create(api) {
  const { defineCommand, ok, err, parseArgs, positionalArgs } = api;

  const hashText = async (text, algo) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const algoMap = { sha256: "SHA-256", sha1: "SHA-1", sha512: "SHA-512" };
    const cryptoAlgo = algoMap[algo];
    if (!cryptoAlgo) {
      // MD5 fallback (simple implementation for non-security use)
      return `MD5 not available via Web Crypto. Use sha256 instead.`;
    }
    const hashBuffer = await crypto.subtle.digest(cryptoAlgo, data);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const decodeJwt = (token) => {
    const parts = token.split(".");
    if (parts.length < 2) throw new Error("Invalid JWT format.");
    const decode = (s) => JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/")));
    return { header: decode(parts[0]), payload: decode(parts[1]) };
  };

  return defineCommand("dev", async (args) => {
    const sub = (args[0] || "").toLowerCase();
    const rest = args.slice(1);
    const pos = positionalArgs(rest);
    const opts = parseArgs(rest);

    if (sub === "--help" || sub === "-h" || !sub) {
      return ok([
        "dev - Developer utilities",
        "",
        '  dev base64 encode|decode "text"',
        '  dev url encode|decode "text"',
        '  dev jwt "eyJ..."',
        '  dev hash "text" [--algo sha256|sha1|sha512]',
        "  dev uuid",
        "  dev password [--length 20] [--no-symbols]",
        "  dev timestamp [unix|iso]",
        '  dev regex "pattern" "text"',
        "",
      ].join("\n"));
    }

    // ── base64
    if (sub === "base64") {
      const action = (pos[0] || "").toLowerCase();
      const input = pos.slice(1).join(" ") || opts.get("text") || "";
      if (!input) return err('Usage: dev base64 encode "text"');
      if (action === "encode") return ok(btoa(unescape(encodeURIComponent(input))) + "\n");
      if (action === "decode") {
        try { return ok(decodeURIComponent(escape(atob(input))) + "\n"); }
        catch { return err("Invalid Base64 input."); }
      }
      return err("Use: dev base64 encode|decode");
    }

    // ── url
    if (sub === "url") {
      const action = (pos[0] || "").toLowerCase();
      const input = pos.slice(1).join(" ") || "";
      if (!input) return err('Usage: dev url encode "text"');
      if (action === "encode") return ok(encodeURIComponent(input) + "\n");
      if (action === "decode") return ok(decodeURIComponent(input) + "\n");
      return err("Use: dev url encode|decode");
    }

    // ── jwt
    if (sub === "jwt") {
      const token = pos[0] || "";
      if (!token) return err('Usage: dev jwt "eyJ..."');
      try {
        const { header, payload } = decodeJwt(token);
        const lines = [
          "Header:", JSON.stringify(header, null, 2), "",
          "Payload:", JSON.stringify(payload, null, 2),
        ];
        if (payload.exp) lines.push("", `Expires: ${new Date(payload.exp * 1000).toISOString()}`);
        if (payload.iat) lines.push(`Issued: ${new Date(payload.iat * 1000).toISOString()}`);
        return ok(lines.join("\n") + "\n");
      } catch (e) {
        return err(e instanceof Error ? e.message : "JWT decode failed.");
      }
    }

    // ── hash
    if (sub === "hash") {
      const input = pos[0] || "";
      if (!input) return err('Usage: dev hash "text" [--algo sha256]');
      const algo = (opts.get("algo") || "sha256").toLowerCase();
      try {
        const hash = await hashText(input, algo);
        return ok(`${algo}: ${hash}\n`);
      } catch (e) {
        return err(e instanceof Error ? e.message : "Hashing failed.");
      }
    }

    // ── uuid
    if (sub === "uuid") {
      return ok(crypto.randomUUID() + "\n");
    }

    // ── password
    if (sub === "password") {
      const length = parseInt(opts.get("length") || "20", 10);
      const noSymbols = rest.includes("--no-symbols");
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" + (noSymbols ? "" : "!@#$%^&*_-+=");
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      const pw = Array.from(array, (b) => chars[b % chars.length]).join("");
      return ok(pw + "\n");
    }

    // ── timestamp
    if (sub === "timestamp" || sub === "ts") {
      const input = pos[0];
      if (!input) {
        const now = Date.now();
        return ok(`Unix:  ${Math.floor(now / 1000)}\nISO:   ${new Date(now).toISOString()}\nLocal: ${new Date(now).toLocaleString()}\n`);
      }
      const num = Number(input);
      if (!isNaN(num)) {
        const ms = num < 1e12 ? num * 1000 : num;
        const d = new Date(ms);
        return ok(`ISO:   ${d.toISOString()}\nLocal: ${d.toLocaleString()}\n`);
      }
      const d = new Date(input);
      if (isNaN(d.getTime())) return err(`Cannot parse: "${input}"`);
      return ok(`Unix:  ${Math.floor(d.getTime() / 1000)}\nISO:   ${d.toISOString()}\n`);
    }

    // ── regex
    if (sub === "regex") {
      const pattern = pos[0];
      const text = pos[1] || "";
      if (!pattern) return err('Usage: dev regex "pattern" "text"');
      try {
        const re = new RegExp(pattern, "g");
        const matches = [...text.matchAll(re)];
        if (matches.length === 0) return ok("No matches.\n");
        const lines = matches.map((m, i) => {
          let s = `Match ${i + 1}: "${m[0]}" at index ${m.index}`;
          if (m.length > 1) s += `  Groups: ${m.slice(1).map((g, j) => `$${j + 1}="${g}"`).join(", ")}`;
          return s;
        });
        return ok(lines.join("\n") + "\n");
      } catch (e) {
        return err(`Invalid regex: ${e instanceof Error ? e.message : "syntax error"}`);
      }
    }

    return err(`Unknown subcommand: ${sub}. Use 'dev --help'.`);
  });
}
