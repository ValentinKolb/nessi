// ============================================================================
// nessi – Types
// ============================================================================

import type { z } from "zod";
import type {
  AssistantMessage,
  ContentPart,
  GenerateRequest,
  Message,
  Provider,
  StreamEvent,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "nessi-ai";
export type {
  AssistantContentBlock,
  AssistantMessage,
  AssistantStopReason,
  ContentPart,
  Message,
  Provider,
  TextBlock,
  ThinkingBlock,
  ToolCallBlock,
  ToolResultMessage,
  ToolSpec,
  Usage,
  UserMessage,
} from "nessi-ai";

export type ProviderEvent = StreamEvent;
export type ProviderRequest = GenerateRequest;

// ----------------------------------------------------------------------------
// 1. Content
// ----------------------------------------------------------------------------

export type Input = string | ContentPart[];

// ----------------------------------------------------------------------------
// 2. Events – Bidirektional
// ----------------------------------------------------------------------------

export type OutboundEvent =
  | { type: "turn_start"; agentId: string }
  | { type: "text"; agentId: string; delta: string }
  | { type: "thinking"; agentId: string; delta: string }
  | { type: "tool_start"; agentId: string; callId: string; name: string }
  | { type: "tool_call"; agentId: string; callId: string; name: string; args: unknown }
  | { type: "tool_end"; agentId: string; callId: string; name: string; result: unknown; isError?: boolean }
  | { type: "turn_end"; agentId: string; message: AssistantMessage }
  | {
      type: "action_request";
      agentId: string;
      kind: "approval" | "client_tool" | "custom_approval";
      callId: string;
      name: string;
      args: unknown;
      message?: string;
    }
  | { type: "error"; agentId: string; error: string; retryable: boolean; contextOverflow?: boolean }
  | { type: "steer_applied"; agentId: string; message: string }
  | { type: "compaction_start"; agentId: string }
  | { type: "compaction_end"; agentId: string }
  | { type: "done"; agentId: string; reason: DoneReason };

export type InboundEvent =
  | { type: "approval_response"; callId: string; approved: boolean }
  | { type: "tool_result"; callId: string; result: unknown };

export type DoneReason = "stop" | "no_credits" | "max_turns" | "context_overflow" | "error" | "aborted";

// ----------------------------------------------------------------------------
// 3. Tools
// ----------------------------------------------------------------------------

export type ToolDefinition<TInput extends z.ZodType = z.ZodType, TOutput extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema?: TOutput;
  needsApproval?: boolean;

  server(execute: (input: z.infer<TInput>, ctx: ToolContext) => Promise<z.infer<TOutput>>): ServerTool<TInput, TOutput>;

  client(
    execute: (input: z.infer<TInput>) => z.infer<TOutput> | Promise<z.infer<TOutput>>,
  ): ClientTool<TInput, TOutput>;
}

export type ServerTool<TInput extends z.ZodType = z.ZodType, TOutput extends z.ZodType = z.ZodType> = {
  readonly kind: "server";
  readonly def: ToolDefinition<TInput, TOutput>;
  execute(input: z.infer<TInput>, ctx: ToolContext): Promise<z.infer<TOutput>>;
}

export type ClientTool<TInput extends z.ZodType = z.ZodType, TOutput extends z.ZodType = z.ZodType> = {
  readonly kind: "client";
  readonly def: ToolDefinition<TInput, TOutput>;
  execute(input: z.infer<TInput>): z.infer<TOutput> | Promise<z.infer<TOutput>>;
}

export type Tool = ServerTool | ClientTool;

export type ToolContext = {
  signal: AbortSignal;
  /** Request user approval mid-execution. Returns true if approved, false if denied. */
  requestApproval(message: string): Promise<boolean>;
  /** Request a client-side tool execution mid-execution. */
  requestClientTool<T = unknown>(name: string, args: unknown): Promise<T>;
}

// ----------------------------------------------------------------------------
// 4. nessi()
// ----------------------------------------------------------------------------

export type NessiOptions = {
  agentId?: string;
  input: Input;
  provider: Provider;
  systemPrompt: string;
  tools?: Tool[];
  store: SessionStore;
  creditStore?: CreditStore;
  compact?: CompactFn;
  maxTurns?: number;
  signal?: AbortSignal;
}

export type NessiLoop = {
  [Symbol.asyncIterator](): AsyncIterator<OutboundEvent>;
  subscribe(listener: (event: OutboundEvent) => void): () => void;
  push(event: InboundEvent): void;
  steer(message: string): void;
  abort(): void;
}

// ----------------------------------------------------------------------------
// 5. SessionStore
// ----------------------------------------------------------------------------

export type StoreEntry = {
  seq: number;
  kind: "message" | "summary";
  message: Message;
}

export type SessionStore = {
  load(): Promise<StoreEntry[]>;
  append(message: Message, opts?: { seq?: number; kind?: "message" | "summary" }): Promise<void>;
}

// ----------------------------------------------------------------------------
// 6. Compaction
// ----------------------------------------------------------------------------

export type CompactFn = (ctx: CompactContext) => null | Promise<void>;

export type CompactContext = {
  entries: StoreEntry[];
  store: SessionStore;
  provider: Provider;
  usage: Usage;
  force: boolean;
}

export type CompactOptions = {
  agentId?: string;
  store: SessionStore;
  provider: Provider;
  compact: CompactFn;
  usage?: Usage;
  force?: boolean;
  signal?: AbortSignal;
}

export type CompactResult = {
  applied: boolean;
  entriesBefore: number;
  entriesAfter: number;
  forced: boolean;
}

export type CompactDoneReason = "stop" | "error" | "aborted";

export type CompactEvent =
  | { type: "compaction_start"; agentId: string }
  | { type: "compaction_end"; agentId: string }
  | { type: "error"; agentId: string; error: string; retryable: false }
  | { type: "done"; agentId: string; reason: CompactDoneReason; result: CompactResult };

export type CompactLoop = {
  [Symbol.asyncIterator](): AsyncIterator<CompactEvent>;
  subscribe(listener: (event: CompactEvent) => void): () => void;
  abort(): void;
}

// ----------------------------------------------------------------------------
// 7. CreditStore
// ----------------------------------------------------------------------------

export type CreditStore = {
  remaining(): Promise<number>;
  deduct(credits: number): Promise<void>;
}
