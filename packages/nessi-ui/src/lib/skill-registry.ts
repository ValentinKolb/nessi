import { readJson, writeJson } from "./json-storage.js";
import { readSkillDocMeta, slugifySkillCommand } from "./skill-doc.js";
import { asRecord, asString } from "./utils.js";
import surveyDoc from "../assets/skills/survey/SKILL.md?raw";
import surveyCode from "../assets/skills/survey/skill.ts?raw";
import webDoc from "../assets/skills/web/SKILL.md?raw";
import webCode from "../assets/skills/web/skill.ts?raw";
import pdfDoc from "../assets/skills/pdf/SKILL.md?raw";
import pdfCode from "../assets/skills/pdf/skill.ts?raw";
import tableDoc from "../assets/skills/table/SKILL.md?raw";
import tableCode from "../assets/skills/table/skill.ts?raw";
import qrDoc from "../assets/skills/qr/SKILL.md?raw";
import qrCode from "../assets/skills/qr/skill.ts?raw";
import calcDoc from "../assets/skills/calc/SKILL.md?raw";
import calcCode from "../assets/skills/calc/skill.ts?raw";
import chartDoc from "../assets/skills/chart/SKILL.md?raw";
import chartCode from "../assets/skills/chart/skill.ts?raw";
import githubDoc from "../assets/skills/github/SKILL.md?raw";
import githubCode from "../assets/skills/github/skill.ts?raw";
import nextcloudDoc from "../assets/skills/nextcloud/SKILL.md?raw";
import nextcloudCode from "../assets/skills/nextcloud/skill.ts?raw";

const DIRECT_TOOL_SKILL_IDS = new Set(["web"]);

export type SkillEntry = {
  id: string;
  name: string;
  description: string;
  doc: string;
  command: string;
  enabled: boolean;
  code?: string;
  builtin?: boolean;
};

const STORAGE_KEY = "nessi:skills:v2";
const LEGACY_IMPLS_KEY = "nessi:skill-impls:v2";

const BUILTIN_SKILL_DOCS = import.meta.glob("../assets/skills/*/SKILL.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const BUILTIN_SKILL_SOURCES = import.meta.glob("../assets/skills/*/skill.ts", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const STATIC_BUILTIN_SKILL_DOCS: Record<string, string> = {
  "../assets/skills/survey/SKILL.md": surveyDoc,
  "../assets/skills/web/SKILL.md": webDoc,
  "../assets/skills/pdf/SKILL.md": pdfDoc,
  "../assets/skills/table/SKILL.md": tableDoc,
  "../assets/skills/qr/SKILL.md": qrDoc,
  "../assets/skills/calc/SKILL.md": calcDoc,
  "../assets/skills/chart/SKILL.md": chartDoc,
  "../assets/skills/github/SKILL.md": githubDoc,
  "../assets/skills/nextcloud/SKILL.md": nextcloudDoc,
};

const STATIC_BUILTIN_SKILL_SOURCES: Record<string, string> = {
  "../assets/skills/survey/skill.ts": surveyCode,
  "../assets/skills/web/skill.ts": webCode,
  "../assets/skills/pdf/skill.ts": pdfCode,
  "../assets/skills/table/skill.ts": tableCode,
  "../assets/skills/qr/skill.ts": qrCode,
  "../assets/skills/calc/skill.ts": calcCode,
  "../assets/skills/chart/skill.ts": chartCode,
  "../assets/skills/github/skill.ts": githubCode,
  "../assets/skills/nextcloud/skill.ts": nextcloudCode,
};

const ALL_BUILTIN_SKILL_DOCS = {
  ...BUILTIN_SKILL_DOCS,
  ...STATIC_BUILTIN_SKILL_DOCS,
};

const ALL_BUILTIN_SKILL_SOURCES = {
  ...BUILTIN_SKILL_SOURCES,
  ...STATIC_BUILTIN_SKILL_SOURCES,
};

const parseSkillDoc = (raw: string): Omit<SkillEntry, "id" | "builtin"> | null => {
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
};

const builtinSourceForFolder = (folder: string) => {
  const path = Object.keys(ALL_BUILTIN_SKILL_SOURCES).find((entry) => entry.includes(`/skills/${folder}/skill.ts`));
  return path ? ALL_BUILTIN_SKILL_SOURCES[path] : undefined;
};

const builtinSeedFromPath = (path: string, raw: string): SkillEntry | null => {
  const parsed = parseSkillDoc(raw);
  if (!parsed) return null;

  const folder = path.match(/\/skills\/([^/]+)\/SKILL\.md$/)?.[1] ?? parsed.name;
  const id = slugifySkillCommand(parsed.name || folder);
  const code = builtinSourceForFolder(folder);

  if (!code) {
    console.warn(`Built-in skill '${id}' is missing skill.ts in assets/skills/${folder}/`);
  }

  return {
    id,
    ...parsed,
    code,
    builtin: true,
  };
};

const builtinSeeds = () => {
  const seeds = new Map<string, SkillEntry>();
  for (const [path, raw] of Object.entries(ALL_BUILTIN_SKILL_DOCS)) {
    const entry = builtinSeedFromPath(path, raw);
    if (entry && !DIRECT_TOOL_SKILL_IDS.has(entry.id)) seeds.set(entry.id, entry);
  }
  return [...seeds.values()].sort((a, b) => a.name.localeCompare(b.name));
};

type StoredSkillEntry = SkillEntry & { legacyImplId?: string };

const normalizeStored = (entry: unknown): StoredSkillEntry | null => {
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
};

const loadStored = () => {
  const parsed = readJson<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizeStored)
    .filter((x): x is StoredSkillEntry => Boolean(x));
};

const saveStored = (entries: SkillEntry[]) => {
  writeJson(STORAGE_KEY, entries);
};

const loadLegacyImplCodes = () => {
  const parsed = readJson<unknown>(LEGACY_IMPLS_KEY, []);
  if (!Array.isArray(parsed)) return new Map<string, string>();

  const codes = new Map<string, string>();
  for (const entry of parsed) {
    const record = asRecord(entry);
    const id = asString(record?.id);
    const code = asString(record?.code);
    if (id && code) codes.set(id, code);
  }
  return codes;
};

/** Load merged skill registry (built-ins + user overrides). */
export const loadSkills = () => {
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
};

export const saveSkills = (entries: SkillEntry[]) => {
  saveStored(entries);
};

/** Generate a unique skill id from a base label. */
export const ensureUniqueSkillId = (base: string, existing: SkillEntry[]) => {
  const root = slugifySkillCommand(base);
  let id = root;
  let n = 2;
  const seen = new Set(existing.map((s) => s.id));
  while (seen.has(id)) {
    id = `${root}-${n++}`;
  }
  return id;
};

export const getEnabledSkills = () => loadSkills().filter((s) => s.enabled);

/** Virtual path used inside bash for skill documentation. */
export const skillPath = (id: string) => `/skills/${id}/SKILL.md`;
