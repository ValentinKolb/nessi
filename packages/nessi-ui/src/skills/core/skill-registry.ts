import { db } from "../../shared/db/db.js";
import { dbEvents } from "../../shared/db/db-events.js";
import { skillDoc } from "./skill-doc.js";
import type { SkillEntry } from "./skill.types.js";

const DIRECT_TOOL_SKILL_IDS = new Set(["web"]);

const BUILTIN_SKILL_DOCS = import.meta.glob("../builtins/*/SKILL.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const BUILTIN_SKILL_SOURCES = import.meta.glob("../builtins/*/skill.js", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

let cache: SkillEntry[] | null = null;

const parseSkillDoc = (raw: string): Omit<SkillEntry, "id" | "builtin"> | null => {
  const parsed = skillDoc.readMeta(raw);
  if (!parsed) return null;

  return {
    name: parsed.name,
    description: parsed.description,
    doc: raw,
    command: parsed.command,
    enabled: parsed.enabled,
    code: undefined,
  };
};

const builtinSourceForFolder = (folder: string) => {
  const path = Object.keys(BUILTIN_SKILL_SOURCES).find((entry) => entry.includes(`/builtins/${folder}/skill.js`));
  return path ? BUILTIN_SKILL_SOURCES[path] : undefined;
};

const builtinSeedFromPath = (path: string, raw: string): SkillEntry | null => {
  const parsed = parseSkillDoc(raw);
  if (!parsed) return null;

  const folder = path.match(/\/builtins\/([^/]+)\/SKILL\.md$/)?.[1] ?? parsed.name;
  const id = skillDoc.slugifyCommand(parsed.name || folder);
  const code = builtinSourceForFolder(folder);

  return {
    id,
    ...parsed,
    code,
    builtin: true,
  };
};

const builtinSeeds = () => {
  const seeds = new Map<string, SkillEntry>();
  for (const [path, raw] of Object.entries(BUILTIN_SKILL_DOCS)) {
    const entry = builtinSeedFromPath(path, raw);
    if (entry && !DIRECT_TOOL_SKILL_IDS.has(entry.id)) seeds.set(entry.id, entry);
  }
  return [...seeds.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const loadFromDb = async () => {
  await db.init();
  const seeds = builtinSeeds();
  const stored = await db.instance.skills.toArray();
  const byId = new Map(stored.map((skill) => [skill.id, skill] as const));

  const merged: SkillEntry[] = [];
  for (const seed of seeds) {
    const override = byId.get(seed.id);
    if (override) {
      merged.push({
        ...seed,
        ...override,
        id: seed.id,
        builtin: true,
      });
      byId.delete(seed.id);
    } else {
      merged.push(seed);
    }
  }

  for (const extra of byId.values()) {
    if (!extra.builtin) merged.push({ ...extra });
  }

  cache = merged;
  return merged;
};

const ensureLoaded = async () => cache ?? loadFromDb();

const list = async () => [...await ensureLoaded()];

const snapshot = () => cache ?? builtinSeeds();

const saveAll = async (entries: SkillEntry[]) => {
  await db.init();
  const now = new Date().toISOString();
  await db.instance.skills.clear();
  if (entries.length > 0) {
    await db.instance.skills.bulkPut(entries.map((entry) => ({
      ...entry,
      updatedAt: now,
    })));
  }
  cache = null;
  await ensureLoaded();
  dbEvents.emit({ scope: "skills" });
};

const ensureUniqueId = (base: string, existing: SkillEntry[]) => {
  const root = skillDoc.slugifyCommand(base);
  let id = root;
  let count = 2;
  const seen = new Set(existing.map((entry) => entry.id));
  while (seen.has(id)) {
    id = `${root}-${count++}`;
  }
  return id;
};

const enabled = async () => (await ensureLoaded()).filter((entry) => entry.enabled);

const enabledSnapshot = () => snapshot().filter((entry) => entry.enabled);

export const skillRegistry = {
  ensureLoaded,
  list,
  snapshot,
  saveAll,
  enabled,
  enabledSnapshot,
  ensureUniqueId,
} as const;
