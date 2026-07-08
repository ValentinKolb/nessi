// ============================================================================
// nessi – Public API
// ============================================================================

import { nessi as createNessiLoop } from "./nessi.js";
import { structured, StructuredOutputError } from "./structured.js";

export const nessi = Object.assign(createNessiLoop, { structured });
export { structured, StructuredOutputError };
export { compact } from "./compact.js";
export { defineTool, toolToJsonSchema, toolToSpec } from "./tools.js";
export { memoryStore } from "./stores.js";
export { estimateTokens, truncateMiddle, truncateToolResults } from "./utils.js";
export { cloneLoopAggregate, cloneUsage, mergeLoopAggregates, mergeUsage } from "./aggregates.js";

export type {
  // Core
  NessiOptions,
  NessiLoop,
  StructuredInput,
  StructuredMeta,
  StructuredMode,
  StructuredOptions,
  StructuredResult,
  // Content
  ContentPart,
  JsonSchemaObject,
  Input,
  // Events
  OutboundEvent,
  InboundEvent,
  DoneReason,
  LoopAggregate,
  LoopTurnAggregate,
  LoopToolCallAggregate,
  LoopToolIssueAggregate,
  // Messages
  Message,
  UserMessage,
  AssistantMessage,
  AssistantStopReason,
  ToolResultMessage,
  AssistantContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolCallBlock,
  ToolStreamIssue,
  ToolStreamIssueKind,
  ToolStreamIssueReason,
  Usage,
  // Tools
  ToolDefinition,
  ServerTool,
  ClientTool,
  Tool,
  ToolContext,
  // Provider
  Provider,
  ProviderRequest,
  ProviderEvent,
  ResponseFormat,
  // Store
  StoreEntry,
  SessionStore,
  // Compaction
  CompactFn,
  CompactContext,
  CompactOptions,
  CompactResult,
  CompactDoneReason,
  CompactEvent,
  CompactLoop,
  // Credits
  CreditStore,
} from "./types.js";
