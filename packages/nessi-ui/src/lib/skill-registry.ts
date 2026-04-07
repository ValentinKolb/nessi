import { readJson, writeJson } from "./json-storage.js";
import { readSkillDocMeta, slugifySkillCommand } from "./skill-doc.js";
import { BUILTIN_SKILL_CODES } from "./skill-templates.js";

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  doc: string;
  command: string;
  enabled: boolean;
  code?: string;
  builtin?: boolean;
}

const STORAGE_KEY = "nessi:skills:v2";
const LEGACY_IMPLS_KEY = "nessi:skill-impls:v2";

const BUILTIN_SKILL_DOCS = import.meta.glob("../assets/skills/*/SKILL.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseSkillDoc(raw: string): Omit<SkillEntry, "id" | "builtin"> | null {
  const parsed = readSkillDocMeta(raw);
  if (!parsed) return null;

  return {
    name: parsed.name,
    description: parsed.description,
    doc: raw,
    command: parsed.command,
    enabled: parsed.enabled,
    code: undefined,
  };
}

function builtinSeedFromPath(path: string, raw: string): SkillEntry | null {
  const parsed = parseSkillDoc(raw);
  if (!parsed) return null;

  const folder = path.match(/\/skills\/([^/]+)\/SKILL\.md$/)?.[1] ?? parsed.name;
  const id = slugifySkillCommand(parsed.name || folder);

  return {
    id,
    ...parsed,
    code: BUILTIN_SKILL_CODES[id],
    builtin: true,
  };
}

function builtinSeeds(): SkillEntry[] {
  const seeds: SkillEntry[] = [];
  for (const [path, raw] of Object.entries(BUILTIN_SKILL_DOCS)) {
    const entry = builtinSeedFromPath(path, raw);
    if (entry) seeds.push(entry);
  }
  return seeds.sort((a, b) => a.name.localeCompare(b.name));
}

type StoredSkillEntry = SkillEntry & { legacyImplId?: string };

function normalizeStored(entry: unknown): StoredSkillEntry | null {
  const o = asRecord(entry);
  if (!o) return null;

  const id = asString(o.id);
  const name = asString(o.name);
  const description = asString(o.description);
  const doc = asString(o.doc);
  if (!id || !name || !description || !doc) return null;

  const command = asString(o.command) ?? slugifySkillCommand(name);
  const enabled = typeof o.enabled === "boolean" ? o.enabled : true;
  const builtin = o.builtin === true;
  const code = asString(o.code) ?? undefined;
  const legacyImplId = asString(o.implId) ?? undefined;

  return { id, name, description, doc, command, enabled, builtin, code, legacyImplId };
}

function loadStored(): StoredSkillEntry[] {
  const parsed = readJson<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizeStored)
    .filter((x): x is StoredSkillEntry => Boolean(x));
}

function saveStored(entries: SkillEntry[]) {
  writeJson(STORAGE_KEY, entries);
}

function loadLegacyImplCodes(): Map<string, string> {
  const parsed = readJson<unknown>(LEGACY_IMPLS_KEY, []);
  if (!Array.isArray(parsed)) return new Map();

  const codes = new Map<string, string>();
  for (const entry of parsed) {
    const record = asRecord(entry);
    const id = asString(record?.id);
    const code = asString(record?.code);
    if (id && code) codes.set(id, code);
  }
  return codes;
}

/** Load merged skill registry (built-ins + user overrides). */
export function loadSkills(): SkillEntry[] {
  const seeds = builtinSeeds();
  const stored = loadStored();
  const legacyImplCodes = loadLegacyImplCodes();
  const byId = new Map(stored.map((s) => [s.id, s]));

  const merged: SkillEntry[] = [];
  for (const seed of seeds) {
    const override = byId.get(seed.id);
    if (override) {
      const legacyCode = override.legacyImplId ? legacyImplCodes.get(override.legacyImplId) : undefined;
      merged.push({
        ...seed,
        ...override,
        id: seed.id,
        code: override.code ?? legacyCode ?? seed.code,
        builtin: true,
      });
      byId.delete(seed.id);
    } else {
      merged.push(seed);
    }
  }

  for (const extra of byId.values()) {
    if (!extra.builtin) {
      const legacyCode = extra.legacyImplId ? legacyImplCodes.get(extra.legacyImplId) : undefined;
      merged.push({
        ...extra,
        code: extra.code ?? legacyCode,
      });
    }
  }

  return merged;
}

export function saveSkills(entries: SkillEntry[]) {
  saveStored(entries);
}

/** Generate a unique skill id from a base label. */
export function ensureUniqueSkillId(base: string, existing: SkillEntry[]): string {
  const root = slugifySkillCommand(base);
  let id = root;
  let n = 2;
  const seen = new Set(existing.map((s) => s.id));
  while (seen.has(id)) {
    id = `${root}-${n++}`;
  }
  return id;
}

export function getEnabledSkills(): SkillEntry[] {
  return loadSkills().filter((s) => s.enabled);
}

/** Virtual path used inside bash for skill documentation. */
export function skillPath(id: string): string {
  return `/skills/${id}/SKILL.md`;
}
