import {
  anthropic,
  gemini,
  mistral,
  ollama,
  openAICompatible,
  openai,
  openrouter,
  vllm,
  type Provider,
  type ProviderCapabilities,
} from "nessi-ai";
import { createSignal } from "solid-js";
import { localStorageJson } from "../shared/storage/local-storage.js";
import { newId } from "./utils.js";

/**
 * Reactive version counter — incremented on every provider write.
 * Any SolidJS component that calls a read function (loadProviders,
 * getActiveProviderEntry, etc.) automatically tracks this signal
 * and re-renders when providers change.
 */
const [providerVersion, setProviderVersion] = createSignal(0);
const bumpVersion = () => setProviderVersion((v) => v + 1);

export type ToolCallIdPolicy = "passthrough" | "strict9";
export type ProviderType =
  | "openai-compatible"
  | "openai"
  | "openrouter"
  | "vllm"
  | "ollama"
  | "anthropic"
  | "mistral"
  | "gemini";
export type ProviderPresetId = Exclude<ProviderType, "openai-compatible">;

export type ProviderEntry = {
  id: string;
  type: ProviderType;
  name: string;
  baseURL: string;
  model: string;
  apiKey?: string;
  toolCallIdPolicy: ToolCallIdPolicy;
  /** Model context window in tokens. Used for compaction decisions. */
  contextWindow?: number;
};

export type ProviderPreset = {
  id: ProviderPresetId;
  label: string;
  defaults: Pick<ProviderEntry, "type" | "name" | "baseURL" | "model" | "toolCallIdPolicy">;
};

const PROVIDERS_KEY = "nessi:providers";
const ACTIVE_KEY = "nessi:activeProvider";
const LEGACY_PROVIDER_KEY = "nessi:provider";
const DEFAULT_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "gpt-oss:20b";
const DEFAULT_TYPE: ProviderType = "openai-compatible";
const DEFAULT_POLICY: ToolCallIdPolicy = "passthrough";
const PROVIDER_TYPES = new Set<ProviderType>([
  "openai-compatible",
  "openai",
  "openrouter",
  "vllm",
  "ollama",
  "anthropic",
  "mistral",
  "gemini",
]);

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaults: {
      name: "OpenAI",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      toolCallIdPolicy: "passthrough",
      type: "openai",
    },
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaults: {
      name: "OpenRouter",
      baseURL: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4.1-mini",
      toolCallIdPolicy: "passthrough",
      type: "openrouter",
    },
  },
  {
    id: "vllm",
    label: "vLLM",
    defaults: {
      name: "vLLM",
      baseURL: "http://localhost:8000/v1",
      model: "meta-llama/Llama-3.1-8B-Instruct",
      toolCallIdPolicy: "passthrough",
      type: "vllm",
    },
  },
  {
    id: "ollama",
    label: "Ollama",
    defaults: {
      name: "Ollama",
      baseURL: "http://localhost:11434",
      model: "llama3.1",
      toolCallIdPolicy: "passthrough",
      type: "ollama",
    },
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaults: {
      name: "Anthropic",
      baseURL: "https://api.anthropic.com",
      model: "claude-3-5-sonnet-latest",
      toolCallIdPolicy: "passthrough",
      type: "anthropic",
    },
  },
  {
    id: "mistral",
    label: "Mistral",
    defaults: {
      name: "Mistral",
      baseURL: "https://api.mistral.ai/v1",
      model: "mistral-small-latest",
      toolCallIdPolicy: "strict9",
      type: "mistral",
    },
  },
  {
    id: "gemini",
    label: "Gemini",
    defaults: {
      name: "Gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/models",
      model: "gemini-2.0-flash",
      toolCallIdPolicy: "passthrough",
      type: "gemini",
    },
  },
];

/** Return built-in provider presets for quick onboarding. */
export const getProviderPresets = () => PROVIDER_PRESETS;

/** Get the provider icon URL for a given provider type. */
export const getProviderIconUrl = (type: ProviderType) => `/provider-icons/${type}.svg`;

/** Parse tool-call id policy from unknown storage data. */
const parseToolCallIdPolicy = (value: unknown): ToolCallIdPolicy =>
  value === "strict9" ? "strict9" : "passthrough";

const parseProviderType = (value: unknown): ProviderType =>
  typeof value === "string" && PROVIDER_TYPES.has(value as ProviderType)
    ? (value as ProviderType)
    : DEFAULT_TYPE;

export const validateProviderEntry = (entry: Pick<ProviderEntry, "name" | "baseURL" | "model">) => {
  if (!entry.name.trim()) return "Provider name is required.";
  if (!entry.model.trim()) return "Model is required.";
  if (!entry.baseURL.trim()) return "Base URL is required.";
  try {
    const url = new URL(entry.baseURL);
    if (!/^https?:$/.test(url.protocol)) return "Base URL must use http or https.";
  } catch {
    return "Base URL must be a valid URL.";
  }
  return null;
};

/** Normalize unknown provider data into a stable runtime shape. */
const normalizeProvider = (raw: unknown): ProviderEntry | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id ? obj.id : newId();
  const type = parseProviderType(obj.type);
  const name = typeof obj.name === "string" ? obj.name : "";
  const baseURL = typeof obj.baseURL === "string" && obj.baseURL ? obj.baseURL : DEFAULT_BASE_URL;
  const model = typeof obj.model === "string" && obj.model ? obj.model : DEFAULT_MODEL;
  const apiKey = typeof obj.apiKey === "string" && obj.apiKey ? obj.apiKey : undefined;
  const toolCallIdPolicy = parseToolCallIdPolicy(obj.toolCallIdPolicy);
  const rawCW = typeof obj.contextWindow === "number" ? obj.contextWindow : Number(obj.contextWindow);
  const contextWindow = Number.isFinite(rawCW) && rawCW > 0 ? rawCW : undefined;
  return { id, type, name, baseURL, model, apiKey, toolCallIdPolicy, contextWindow };
};

// Migration: old single-provider format -> new multi-provider
const migrate = () => {
  const old = localStorage.getItem(LEGACY_PROVIDER_KEY);
  if (!old) return;
  try {
    const c = JSON.parse(old);
    const entry: ProviderEntry = {
      id: newId(),
      type: DEFAULT_TYPE,
      name: "Default",
      baseURL: c.baseURL ?? DEFAULT_BASE_URL,
      model: c.model ?? DEFAULT_MODEL,
      apiKey: c.apiKey,
      toolCallIdPolicy: DEFAULT_POLICY,
    };
    saveProviders([entry]);
    setActiveProviderId(entry.id);
    localStorageJson.remove(LEGACY_PROVIDER_KEY);
  } catch { /* ignore */ }
};

/** Load available provider configurations. */
export const loadProviders = () => {
  providerVersion(); // track for reactivity
  migrate();
  const storedRaw = localStorageJson.read<unknown>(PROVIDERS_KEY, []);
  const stored = Array.isArray(storedRaw) ? storedRaw : [];
  const normalized = stored.map(normalizeProvider).filter((entry): entry is ProviderEntry => entry !== null);
  if (!Array.isArray(storedRaw) || JSON.stringify(stored) !== JSON.stringify(normalized)) {
    saveProviders(normalized);
  }
  return normalized;
};

/** Persist provider configurations. */
export const saveProviders = (providers: ProviderEntry[]) => {
  localStorageJson.write(PROVIDERS_KEY, providers);
  bumpVersion();
};

/** Read currently selected provider id. */
export const getActiveProviderId = () => {
  providerVersion(); // track for reactivity
  const value = localStorageJson.readString(ACTIVE_KEY);
  return value || null;
};

/** Set selected provider id. */
export const setActiveProviderId = (id: string) => {
  localStorageJson.writeString(ACTIVE_KEY, id);
  bumpVersion();
};

/** Resolve active provider entry or fall back to first configured provider. */
export const getActiveProviderEntry = () => {
  providerVersion(); // track for reactivity
  const providers = loadProviders();
  const activeId = getActiveProviderId();
  if (activeId) {
    const found = providers.find((p) => p.id === activeId);
    if (found) return found;
  }
  return providers[0] ?? null;
};

const factories: Record<ProviderType, (providerEntry: ProviderEntry) => Provider> = {
  openai: (providerEntry) =>
    openai(providerEntry.model, {
      baseURL: providerEntry.baseURL,
      apiKey: providerEntry.apiKey,
      contextWindow: providerEntry.contextWindow,
      normalizeToolCallIds: providerEntry.toolCallIdPolicy === "strict9" ? "strict9" : "never",
    }),
  openrouter: (providerEntry) =>
    openrouter(providerEntry.model, {
      baseURL: providerEntry.baseURL,
      apiKey: providerEntry.apiKey,
      contextWindow: providerEntry.contextWindow,
    }),
  vllm: (providerEntry) =>
    vllm(providerEntry.model, {
      baseURL: providerEntry.baseURL,
      apiKey: providerEntry.apiKey,
      contextWindow: providerEntry.contextWindow,
    }),
  ollama: (providerEntry) =>
    ollama(providerEntry.model, {
      baseURL: providerEntry.baseURL,
      contextWindow: providerEntry.contextWindow,
    }),
  anthropic: (providerEntry) =>
    anthropic(providerEntry.model, {
      baseURL: providerEntry.baseURL,
      apiKey: providerEntry.apiKey,
      contextWindow: providerEntry.contextWindow,
    }),
  mistral: (providerEntry) =>
    mistral(providerEntry.model, {
      baseURL: providerEntry.baseURL,
      apiKey: providerEntry.apiKey,
      contextWindow: providerEntry.contextWindow,
      normalizeToolCallIds: providerEntry.toolCallIdPolicy === "strict9" ? "strict9" : "never",
    }),
  gemini: (providerEntry) =>
    gemini(providerEntry.model, {
      baseURL: providerEntry.baseURL,
      apiKey: providerEntry.apiKey,
      contextWindow: providerEntry.contextWindow,
    }),
  "openai-compatible": (providerEntry) =>
    openAICompatible({
      name: providerEntry.name || "custom-openai-compatible",
      model: providerEntry.model,
      baseURL: providerEntry.baseURL,
      apiKey: providerEntry.apiKey,
      contextWindow: providerEntry.contextWindow,
      compat: {
        toolCallIdPolicy: providerEntry.toolCallIdPolicy,
        supportsUsageInStreaming: true,
        thinkingFormat: "none",
        maxTokensField: "max_completion_tokens",
      },
    }),
};

/** Build provider runtime adapter for nessi-core. */
export const createProvider = (entry: ProviderEntry): Provider => factories[entry.type](entry);

export const getProviderCapabilities = (entry: ProviderEntry): ProviderCapabilities =>
  createProvider(entry).capabilities;
