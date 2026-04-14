export default function create(api) {
  const { cli, err, ok, parseArgs, positionalArgs, helpers } = api;

  function isRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeSurvey(input) {
    if (!isRecord(input)) return null;

    const rawQuestions = Array.isArray(input.questions) ? input.questions : null;
    if (!rawQuestions || rawQuestions.length === 0) return null;

    const questions = [];
    for (const item of rawQuestions) {
      if (!isRecord(item) || typeof item.question !== "string") return null;
      const options = Array.isArray(item.options)
        ? item.options.filter((option) => typeof option === "string" && option.trim()).map((option) => option.trim())
        : [];
      if (!item.question.trim() || options.length === 0) return null;
      questions.push({ question: item.question.trim(), options });
    }

    return {
      title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : undefined,
      questions,
    };
  }

  function parseQuestionLine(line) {
    const parts = String(line)
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 3) return null;
    const [question, ...options] = parts;
    if (!question || options.length === 0) return null;
    return { question, options };
  }

  function parsePositionalBatch(args) {
    const items = positionalArgs(args).map((item) => item.trim()).filter(Boolean);
    if (items.length === 0) return null;

    const questions = [];
    for (const item of items) {
      const parsed = parseQuestionLine(item);
      if (!parsed) return null;
      questions.push(parsed);
    }

    return { questions };
  }

  return cli({ name: "survey", description: "Ask structured questions whenever you need user input or decisions" })
    .sub({
      name: "ask",
      usage: "ask \"Question? | Option A | Option B\" [\"Question 2? | Option A | Option B\"] OR ask \"Question?\" --options \"A|B|C\" OR ask --json '{...}'",
      async handler(args) {
        const opts = parseArgs(args);
        const json = opts.get("json");

        let payload;
        if (json) {
          try {
            payload = JSON.parse(json);
          } catch {
            return err("Error: --json is not valid JSON.");
          }
        } else {
          const batchPayload = parsePositionalBatch(args);
          if (batchPayload) {
            payload = batchPayload;
          } else {
            const question = positionalArgs(args).join(" ").trim();
            const optionsRaw = opts.get("options");
            if (!question || !optionsRaw) {
              return err("Usage: survey ask \"Question? | Option A | Option B\" [\"Question 2? | Option A | Option B\"] OR survey ask \"Question?\" --options \"A|B|C\" OR survey ask --json '{...}'");
            }
            payload = {
              questions: [{
                question,
                options: optionsRaw.split("|").map((option) => option.trim()).filter(Boolean),
              }],
            };
          }
        }

        const normalized = normalizeSurvey(payload);
        if (!normalized) {
          return err("Error: invalid survey payload. Use lines like \"Preferred language? | Deutsch | English\".");
        }

        const result = await helpers.requestSurvey(normalized);
        return ok((result.result || "").trim() + "\n");
      },
    });
}
