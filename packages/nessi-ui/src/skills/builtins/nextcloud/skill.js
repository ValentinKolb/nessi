export default function create(api) {
  const { cli, ok, err, parseArgs, positionalArgs, helpers } = api;

  const nc = helpers.nextcloud;
  const approve = helpers.requestApproval;

  // ── shared ──

  const toTs = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  const fmtDate = (raw) => {
    if (!raw) return "?";
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}${raw.length >= 13 ? ` ${raw.slice(9, 11)}:${raw.slice(11, 13)}` : ""}`;
  };

  const fmtTs = (ts) => {
    if (!ts) return "?";
    const d = new Date(ts * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // ── talk: resolve name → token ──

  const CONV_API = "ocs/v2.php/apps/spreed/api/v4";
  const CHAT_API = "ocs/v2.php/apps/spreed/api/v1";
  let cachedRooms = null;

  const loadRooms = async () => {
    if (cachedRooms) return cachedRooms;
    const data = await nc.ocs(`${CONV_API}/room`);
    cachedRooms = data?.ocs?.data ?? [];
    return cachedRooms;
  };

  const findRoom = async (query) => {
    const rooms = await loadRooms();
    const q = query.toLowerCase();
    // exact token match
    const byToken = rooms.find((r) => r.token === query);
    if (byToken) return byToken;
    // exact name match (case-insensitive)
    const byName = rooms.find((r) => r.displayName?.toLowerCase() === q);
    if (byName) return byName;
    // partial name match
    const partial = rooms.filter((r) => r.displayName?.toLowerCase().includes(q));
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) throw new Error(`Multiple chats match "${query}": ${partial.map((r) => `"${r.displayName}"`).join(", ")}. Be more specific.`);
    throw new Error(`No chat found matching "${query}". Run "nextcloud talk" to see available chats.`);
  };

  const fmtMessage = (m) => {
    const msg = (m.message ?? "").replace(/\{([^}]*)\}/g, (_, key) => m.messageParameters?.[key]?.name ?? `{${key}}`);
    if (m.systemMessage) return `  [${fmtTs(m.timestamp)}] (system) ${msg}`;
    return `  [${fmtTs(m.timestamp)}] ${m.actorDisplayName || m.actorId || "?"}: ${msg}`;
  };

  return cli({ name: "nextcloud", description: "Nextcloud calendar and talk" })

    // ── calendar ──

    .sub({
      name: "calendar",
      usage: 'calendar [--name personal] [--days 7] | calendar create "title" --start "YYYY-MM-DD HH:MM" [--end ...] [--calendar personal] [--location ...] [--description ...]',
      async handler(args) {
        const sub = positionalArgs(args)[0];

        // ── calendar create ──
        if (sub === "create") {
          const title = positionalArgs(args)[1];
          if (!title) return err('Missing event title. Example: nextcloud calendar create "Meeting" --start "2025-06-15 14:00"');
          const opts = parseArgs(args.slice(1));
          const startStr = opts.get("start");
          if (!startStr) return err('Missing --start. Example: --start "2025-06-15 14:00"');

          const start = new Date(startStr.replace(" ", "T"));
          if (isNaN(start.getTime())) return err(`Invalid start date: "${startStr}". Use format: "YYYY-MM-DD HH:MM"`);

          let end;
          const endStr = opts.get("end");
          if (endStr) {
            end = new Date(endStr.replace(" ", "T"));
            if (isNaN(end.getTime())) return err(`Invalid end date: "${endStr}". Use format: "YYYY-MM-DD HH:MM"`);
          } else {
            end = new Date(start.getTime() + 3600_000);
          }

          const calName = opts.get("calendar") ?? opts.get("name") ?? "personal";
          const location = opts.get("location") ?? "";
          const description = opts.get("description") ?? "";

          const uid = crypto.randomUUID();
          const ics = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//nessi//EN",
            "BEGIN:VEVENT",
            `UID:${uid}`,
            `DTSTAMP:${toTs(new Date())}`,
            `DTSTART:${toTs(start)}`,
            `DTEND:${toTs(end)}`,
            `SUMMARY:${title}`,
            ...(location ? [`LOCATION:${location}`] : []),
            ...(description ? [`DESCRIPTION:${description}`] : []),
            "END:VEVENT",
            "END:VCALENDAR",
          ].join("\r\n");

          try {
            const fmtStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")} ${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
            const fmtEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")} ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
            const approved = await approve(`Create event in "${calName}":\n"${title}"\n${fmtStart} → ${fmtEnd}${location ? `\nLocation: ${location}` : ""}`);
            if (!approved) return err("User denied creating the event.");
            await nc.caldav("PUT", `/${calName}/${uid}.ics`, ics, { "Content-Type": "text/calendar; charset=utf-8" });
            return ok(`Event "${title}" created (${fmtStart} → ${fmtEnd}).\n`);
          } catch (e) {
            return err(e instanceof Error ? e.message : "Failed to create event.");
          }
        }

        // ── calendar list (default) ──
        const opts = parseArgs(args);
        const calName = opts.get("name") ?? "personal";
        const days = parseInt(opts.get("days") ?? "7", 10) || 7;
        const now = new Date();
        const end = new Date(now.getTime() + days * 86400_000);
        try {
          const xml = await nc.caldav("REPORT", `/${calName}/`,
            `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${toTs(now)}" end="${toTs(end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`
          );
          const events = [];
          for (const b of xml.split("BEGIN:VEVENT").slice(1)) {
            const get = (k) => b.match(new RegExp(`${k}[^:]*:(.+)`))?.[1]?.trim() ?? "";
            if (get("SUMMARY")) events.push({ summary: get("SUMMARY"), dtstart: get("DTSTART"), dtend: get("DTEND"), location: get("LOCATION") });
          }
          events.sort((a, b) => a.dtstart.localeCompare(b.dtstart));
          if (events.length === 0) return ok(`No events in the next ${days} days.\n`);
          const lines = events.map((e) => {
            const parts = [`${e.summary}`, `  ${fmtDate(e.dtstart)} → ${fmtDate(e.dtend)}`];
            if (e.location) parts.push(`  ${e.location}`);
            return parts.join("\n");
          });
          return ok(lines.join("\n\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch calendar.");
        }
      },
    })

    // ── talk: list chats ──

    .sub({
      name: "talk",
      usage: 'talk | talk read "name" | talk send "name" "message"',
      async handler(args) {
        const sub = positionalArgs(args)[0];

        // "nextcloud talk" → list chats
        if (!sub || sub === "list") {
          try {
            cachedRooms = null; // refresh
            const rooms = await loadRooms();
            if (rooms.length === 0) return ok("No conversations found.\n");
            const lines = rooms.map((r) => {
              const unread = r.unreadMessages > 0 ? ` (${r.unreadMessages} unread)` : "";
              return `${r.displayName}${unread}`;
            });
            return ok(lines.join("\n") + "\n");
          } catch (e) {
            return err(e instanceof Error ? e.message : "Failed to list chats.");
          }
        }

        // "nextcloud talk read <name> [--limit 20]"
        if (sub === "read") {
          const name = positionalArgs(args)[1];
          if (!name) return err('Missing chat name. Example: nextcloud talk read "General"');
          const opts = parseArgs(args.slice(1));
          const limit = parseInt(opts.get("limit") ?? "20", 10) || 20;
          try {
            const room = await findRoom(name);
            const data = await nc.ocs(`${CHAT_API}/chat/${room.token}?limit=${limit}&lookIntoFuture=0`);
            const messages = (data?.ocs?.data ?? []).reverse();
            if (messages.length === 0) return ok("No messages.\n");
            return ok(`${room.displayName}\n\n${messages.map(fmtMessage).join("\n")}\n`);
          } catch (e) {
            return err(e instanceof Error ? e.message : "Failed to read messages.");
          }
        }

        // "nextcloud talk send <name> <message>"
        if (sub === "send") {
          const name = positionalArgs(args)[1];
          const message = positionalArgs(args)[2];
          if (!name || !message) return err('Usage: nextcloud talk send "chat name" "message"');
          try {
            const room = await findRoom(name);
            const approved = await approve(`Send to "${room.displayName}":\n"${message}"`);
            if (!approved) return err("User denied sending the message.");
            await nc.ocs(`${CHAT_API}/chat/${room.token}`, { method: "POST", body: { message } });
            return ok(`Message sent to "${room.displayName}".\n`);
          } catch (e) {
            return err(e instanceof Error ? e.message : "Failed to send message.");
          }
        }

        return err(`Unknown talk command: ${sub}. Use: talk, talk read "name", talk send "name" "msg"`);
      },
    });
}
