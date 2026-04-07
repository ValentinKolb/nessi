import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { humanId } from "human-id";
import { compact, nessi } from "nessi-core";
import type {
  ContentPart,
  CompactEvent,
  CompactFn,
  NessiLoop,
  OutboundEvent,
  SessionStore,
  StoreEntry,
  Tool,
} from "nessi-core";
import type { ChatState, UIMessage, UIBlock, UIAssistantMessage, UICompactionBlock } from "./types.js";
import { MessageList } from "./MessageList.js";
import { MessageInput } from "./MessageInput.js";
import { createMainTools } from "../../lib/skills.js";
import { getActivePrompt, resolvePrompt } from "../../lib/prompts.js";
import { createProvider, getActiveProviderEntry } from "../../lib/provider.js";
import { contentPartsToUIContent, uiContentText, type UIUserContentPart } from "../../lib/chat-content.js";
import { loadPersistedEntries, localStorageStore } from "../../lib/store.js";
import { isAlwaysAllowed, setAlwaysAllowed } from "../../lib/tool-approvals.js";
import { ensureChatMeta } from "../../lib/chat-storage.js";
import { registerCommand } from "../../lib/slash-commands.js";
import { createDefaultCompactFn } from "../../lib/compaction.js";
import { refreshChatTitlesInBackground } from "../../lib/chat-titles.js";

function msgId(): string {
  return humanId({ separator: "-", capitalize: false });
}

function isAssistantMessage(message: UIMessage | undefined): message is UIAssistantMessage {
  return Boolean(message && message.role === "assistant");
}

function compactPreview(text: string, max = 1200): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function summaryPreviewFromEntries(entries: StoreEntry[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.kind !== "summary") continue;
    const message = entry.message;

    if (message.role === "assistant") {
      const textParts: string[] = [];
      for (const block of message.content) {
        if (block.type === "text") textParts.push(block.text);
      }
      const text = textParts.join("\n").trim();
      if (text) return compactPreview(text);
    }

    if (message.role === "user") {
      const text = message.content
        .map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : ""))
        .join("\n")
        .trim();
      if (text) return compactPreview(text);
    }
  }

  return undefined;
}

/** Rebuild UI messages from persisted nessi-core StoreEntry format. */
function loadMessages(chatId: string): UIMessage[] {
  const entries = loadPersistedEntries(chatId);

  const toolResults = new Map<string, { result: unknown; isError?: boolean }>();
  for (const entry of entries) {
    const message = entry.message;
    if (message.role === "tool_result" && message.callId) {
      toolResults.set(message.callId, { result: message.result, isError: message.isError });
    }
  }

  const messages: UIMessage[] = [];
  let lastUserTimestamp: string | undefined;
  for (const entry of entries) {
    const message = entry.message;

    if (message.role === "user") {
      messages.push({
        id: msgId(),
        role: "user",
        content: contentPartsToUIContent(message.content),
        timestamp: entry.createdAt,
        entrySeq: entry.seq,
      });
      lastUserTimestamp = entry.createdAt;
      continue;
    }

    if (message.role !== "assistant") continue;
    const content = message.content as Array<{
      type: string;
      text?: string;
      thinking?: string;
      name?: string;
      args?: unknown;
      id?: string;
    }>;

    const blocks: UIBlock[] = [];
    for (const block of content) {
      if (block.type === "text" && block.text) {
        blocks.push({ type: "text", text: block.text });
      } else if (block.type === "thinking" && block.thinking) {
        blocks.push({ type: "thinking", text: block.thinking });
      } else if (block.type === "tool_call" && block.id && block.name) {
        const result = toolResults.get(block.id);
        blocks.push({
          type: "tool_call",
          callId: block.id,
          name: block.name,
          args: block.args ?? {},
          result: result?.result,
          isError: result?.isError,
        });
      }
    }

    const durationMs = lastUserTimestamp && entry.createdAt
      ? Math.max(0, new Date(entry.createdAt).getTime() - new Date(lastUserTimestamp).getTime())
      : undefined;

    messages.push({
      id: msgId(),
      role: "assistant",
      blocks,
      meta: {
        entrySeq: entry.seq,
        timestamp: entry.createdAt,
        startedAt: lastUserTimestamp,
        model: message.model,
        usage: message.usage,
        stopReason: message.stopReason,
        durationMs,
      },
    });
  }

  return messages;
}

function textPart(text: string): ContentPart {
  return { type: "text", text };
}

function hasFiles(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer?.types && Array.from(dataTransfer.types).includes("Files"));
}

function readFileAsBase64(file: File): Promise<Extract<UIUserContentPart, { type: "image" }>> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`${file.name} is not an image.`));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, base64 = ""] = result.split(",", 2);
      resolve({
        type: "image",
        src: result,
        data: base64,
        mediaType: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  });
}

type Runtime = {
  store: SessionStore;
  tools: Tool[];
  compactFn: CompactFn;
};

/** Main chat runtime built directly on nessi-core loop (single main session, no subagents). */
export function ChatView(props: { chatId: string; providerId: string; onOpenSettings?: () => void }) {
  const [state, setState] = createStore<ChatState>({ messages: [], streaming: false });
  const [pendingImages, setPendingImages] = createSignal<Array<Extract<UIUserContentPart, { type: "image" }>>>([]);
  const [dropActive, setDropActive] = createSignal(false);

  let runtime: Runtime | null = null;
  let activeLoop: NessiLoop | null = null;
  let currentAssistantStartedAt: string | undefined;
  let dragDepth = 0;

  let assistantIdx = -1;
  const toolBlockIndices = new Map<string, { idx: number; name: string }>();
  const surveyBlockIndices = new Map<string, number>();
  const approvalBlockIndices = new Map<string, number>();

  function clearPendingCallMappings() {
    toolBlockIndices.clear();
    surveyBlockIndices.clear();
    approvalBlockIndices.clear();
  }

  function closeStreamingAssistantMessage() {
    mapMessages((messages) => {
      const current = messages[assistantIdx];
      if (!isAssistantMessage(current) || !current.streaming) return messages;
      const next = [...messages];
      next[assistantIdx] = { ...current, streaming: false };
      return next;
    });
  }

  function resetRuntime(chatId: string) {
    activeLoop?.abort();
    activeLoop = null;
    runtime = null;

    setState({ messages: loadMessages(chatId), streaming: false });
    setPendingImages([]);
    currentAssistantStartedAt = undefined;
    dragDepth = 0;
    setDropActive(false);
    assistantIdx = -1;
    clearPendingCallMappings();
  }

  function mapMessages(mutator: (messages: UIMessage[]) => UIMessage[]) {
    setState("messages", (messages) => mutator(messages));
  }

  function appendStatusMessage(text: string) {
    mapMessages((messages) => [
      ...messages,
      {
        id: msgId(),
        role: "assistant",
        blocks: [{ type: "text", text }],
      },
    ]);
  }

  function appendCompactionBlock(block: UICompactionBlock) {
    mapMessages((messages) => [
      ...messages,
      {
        id: msgId(),
        role: "assistant",
        blocks: [block],
      },
    ]);
  }

  function ensureAssistantTurnMessage() {
    const current = state.messages[assistantIdx];
    if (isAssistantMessage(current)) return;

    mapMessages((messages) => [
      ...messages,
      {
        id: msgId(),
        role: "assistant",
        blocks: [],
        streaming: true,
        meta: {
          startedAt: currentAssistantStartedAt,
        },
      },
    ]);
    assistantIdx = state.messages.length - 1;
  }

  function getCurrentBlocks(): UIBlock[] {
    const assistant = state.messages[assistantIdx];
    if (!isAssistantMessage(assistant)) return [];
    return assistant.blocks;
  }

  function appendBlock(block: UIBlock): number | null {
    ensureAssistantTurnMessage();
    const idx = getCurrentBlocks().length;

    mapMessages((messages) => {
      const current = messages[assistantIdx];
      if (!isAssistantMessage(current)) return messages;
      const next = [...messages];
      next[assistantIdx] = { ...current, blocks: [...current.blocks, block] };
      return next;
    });

    return idx;
  }

  function updateBlock(blockIdx: number, updater: (block: UIBlock) => UIBlock) {
    mapMessages((messages) => {
      const current = messages[assistantIdx];
      if (!isAssistantMessage(current)) return messages;
      const block = current.blocks[blockIdx];
      if (!block) return messages;

      const nextBlocks = [...current.blocks];
      nextBlocks[blockIdx] = updater(block);

      const next = [...messages];
      next[assistantIdx] = { ...current, blocks: nextBlocks };
      return next;
    });
  }

  function ensureRuntime(): { provider: ReturnType<typeof createProvider>; runtime: Runtime } | null {
    const providerEntry = getActiveProviderEntry();
    if (!providerEntry) return null;

    if (!runtime) {
      runtime = {
        store: localStorageStore(props.chatId),
        tools: createMainTools(),
        compactFn: createDefaultCompactFn(),
      };
    }

    return { provider: createProvider(providerEntry), runtime };
  }

  function providerSupportsImages() {
    const providerEntry = getActiveProviderEntry();
    return providerEntry ? createProvider(providerEntry).capabilities.images : false;
  }

  async function addPendingImages(files: FileList | File[]) {
    if (!providerSupportsImages()) return;
    const nextFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (nextFiles.length === 0) return;

    try {
      const images = await Promise.all(nextFiles.map(readFileAsBase64));
      setPendingImages((current) => [...current, ...images]);
    } catch (error) {
      appendStatusMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function removePendingImage(index: number) {
    setPendingImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
  }

  function updateAssistantMeta(updater: (meta: NonNullable<UIAssistantMessage["meta"]>) => NonNullable<UIAssistantMessage["meta"]>) {
    mapMessages((messages) => {
      const current = messages[assistantIdx];
      if (!isAssistantMessage(current)) return messages;

      const next = [...messages];
      next[assistantIdx] = {
        ...current,
        meta: updater(current.meta ?? {}),
      };
      return next;
    });
  }

  async function handleApproval(callId: string, action: "deny" | "allow" | "always") {
    const loop = activeLoop;
    const customApprovalIdx = approvalBlockIndices.get(callId);
    const toolEntry = toolBlockIndices.get(callId);
    if (!loop) {
      if (typeof customApprovalIdx === "number") {
        updateBlock(customApprovalIdx, (block) =>
          block.type === "approval" ? { ...block, status: "denied" } : block,
        );
      }
      if (toolEntry) {
        updateBlock(toolEntry.idx, (block) =>
          block.type === "tool_call" ? { ...block, approval: "denied" } : block,
        );
      }
      appendStatusMessage("This approval request is no longer active.");
      return;
    }
    const approved = action !== "deny";
    if (typeof customApprovalIdx === "number") {
      loop.push({ type: "approval_response", callId, approved });
      updateBlock(customApprovalIdx, (block) =>
        block.type === "approval" ? { ...block, status: approved ? "approved" : "denied" } : block,
      );
      return;
    }

    if (!toolEntry) return;

    if (action === "always") setAlwaysAllowed(toolEntry.name);
    loop.push({ type: "approval_response", callId, approved });

    updateBlock(toolEntry.idx, (block) =>
      block.type === "tool_call" ? { ...block, approval: approved ? "approved" : "denied" } : block,
    );
  }

  async function handleSurveySubmit(callId: string, answers: Record<string, string>) {
    const loop = activeLoop;
    if (!loop) {
      appendStatusMessage("This survey is no longer active.");
      return;
    }

    const blockIdx = surveyBlockIndices.get(callId);
    if (typeof blockIdx !== "number") return;

    const result = Object.entries(answers)
      .map(([question, answer]) => `${question}\n${answer}`)
      .join("\n\n");

    loop.push({ type: "tool_result", callId, result: { result } });
    updateBlock(blockIdx, (block) =>
      block.type === "survey" ? { ...block, submitted: true, answers } : block,
    );
  }

  async function handleNessiEvent(event: OutboundEvent) {
    switch (event.type) {
      case "turn_start": {
        currentAssistantStartedAt = new Date().toISOString();
        ensureAssistantTurnMessage();
        break;
      }

      case "text": {
        const blocks = getCurrentBlocks();
        const last = blocks[blocks.length - 1];
        if (last?.type === "text") {
          updateBlock(blocks.length - 1, (block) =>
            block.type === "text" ? { ...block, text: block.text + event.delta } : block,
          );
        } else {
          appendBlock({ type: "text", text: event.delta });
        }
        break;
      }

      case "thinking": {
        const blocks = getCurrentBlocks();
        const last = blocks[blocks.length - 1];
        if (last?.type === "thinking") {
          updateBlock(blocks.length - 1, (block) =>
            block.type === "thinking" ? { ...block, text: block.text + event.delta } : block,
          );
        } else {
          appendBlock({ type: "thinking", text: event.delta });
        }
        break;
      }

      case "tool_start": {
        const idx = appendBlock({
          type: "tool_call",
          callId: event.callId,
          name: event.name,
          args: {},
        });
        if (idx !== null) {
          toolBlockIndices.set(event.callId, { idx, name: event.name });
        }
        break;
      }

      case "tool_call": {
        const entry = toolBlockIndices.get(event.callId);
        if (!entry) break;
        updateBlock(entry.idx, (block) =>
          block.type === "tool_call" ? { ...block, args: event.args } : block,
        );
        break;
      }

      case "action_request": {
        if (event.kind === "approval") {
          const entry = toolBlockIndices.get(event.callId);
          if (!entry) break;

          if (isAlwaysAllowed(event.name)) {
            activeLoop?.push({ type: "approval_response", callId: event.callId, approved: true });
            updateBlock(entry.idx, (block) =>
              block.type === "tool_call" ? { ...block, approval: "approved" } : block,
            );
          } else {
            updateBlock(entry.idx, (block) =>
              block.type === "tool_call" ? { ...block, approval: "pending" } : block,
            );
          }
          break;
        }

        if (event.kind === "custom_approval") {
          const idx = appendBlock({
            type: "approval",
            callId: event.callId,
            message: event.message ?? "Approval required",
            status: "pending",
          });
          if (idx !== null) {
            approvalBlockIndices.set(event.callId, idx);
          }
          break;
        }

        if (event.kind === "client_tool" && event.name === "survey") {
          const args = event.args as {
            title?: string;
            questions: Array<{ question: string; options: string[] }>;
          };
          const idx = appendBlock({
            type: "survey",
            callId: event.callId,
            title: args.title,
            questions: args.questions,
            submitted: false,
          });
          if (idx !== null) {
            surveyBlockIndices.set(event.callId, idx);
          }
        }

        break;
      }

      case "tool_end": {
        const entry = toolBlockIndices.get(event.callId);
        if (!entry) break;
        updateBlock(entry.idx, (block) => {
          if (block.type !== "tool_call") return block;
          return {
            ...block,
            result: event.result,
            isError: event.isError ? true : block.isError,
          };
        });
        break;
      }

      case "turn_end": {
        const persistedAssistant = [...loadPersistedEntries(props.chatId)]
          .reverse()
          .find((entry) => entry.message.role === "assistant");
        const completedAt = persistedAssistant?.createdAt ?? new Date().toISOString();
        updateAssistantMeta((meta) => ({
          ...meta,
          entrySeq: persistedAssistant?.seq ?? meta.entrySeq,
          timestamp: completedAt,
          model: event.message.model,
          usage: event.message.usage,
          stopReason: event.message.stopReason,
          durationMs: meta.startedAt
            ? Math.max(0, new Date(completedAt).getTime() - new Date(meta.startedAt).getTime())
            : undefined,
        }));
        closeStreamingAssistantMessage();
        currentAssistantStartedAt = undefined;
        break;
      }

      case "error": {
        mapMessages((messages) => [
          ...messages,
          {
            id: msgId(),
            role: "assistant",
            blocks: [{ type: "text", text: `Error: ${event.error}` }],
          },
        ]);
        break;
      }

      case "done":
      case "steer_applied":
      case "compaction_start":
      case "compaction_end":
        break;
    }
  }

  async function handleCompactCommand() {
    if (state.streaming) {
      appendStatusMessage("Cannot compact while session is busy.");
      return;
    }

    const ensured = ensureRuntime();
    if (!ensured) {
      appendStatusMessage("Cannot compact: no provider configured.");
      return;
    }

    try {
      const loop = compact({
        agentId: "main",
        store: ensured.runtime.store,
        provider: ensured.provider,
        compact: ensured.runtime.compactFn,
        force: true,
      });

      let doneEvent: Extract<CompactEvent, { type: "done" }> | null = null;
      for await (const event of loop) {
        if (event.type === "done") doneEvent = event;
      }

      if (!doneEvent) {
        appendCompactionBlock({
          type: "compaction",
          title: "Compaction did not finish",
          message: "The operation ended without a completion event.",
          sessionName: "main",
          applied: false,
          reason: "error",
          error: "Missing completion event",
        });
        return;
      }

      if (doneEvent.reason === "aborted") {
        appendCompactionBlock({
          type: "compaction",
          title: "Compaction canceled",
          message: "Stopped before finishing for main session.",
          sessionName: "main",
          applied: false,
          reason: "aborted",
          entriesBefore: doneEvent.result.entriesBefore,
          entriesAfter: doneEvent.result.entriesAfter,
        });
        return;
      }

      if (doneEvent.reason === "error") {
        appendCompactionBlock({
          type: "compaction",
          title: "Compaction failed",
          message: "Could not compact history for main session.",
          sessionName: "main",
          applied: false,
          reason: "error",
          entriesBefore: doneEvent.result.entriesBefore,
          entriesAfter: doneEvent.result.entriesAfter,
        });
        return;
      }

      if (!doneEvent.result.applied) {
        appendCompactionBlock({
          type: "compaction",
          title: "No compaction needed",
          message: "There was not enough older history to compact in main session.",
          sessionName: "main",
          applied: false,
          reason: "stop",
          entriesBefore: doneEvent.result.entriesBefore,
          entriesAfter: doneEvent.result.entriesAfter,
        });
        return;
      }

      const entriesAfter = await ensured.runtime.store.load();
      const summaryPreview = summaryPreviewFromEntries(entriesAfter);
      const reduced = Math.max(0, doneEvent.result.entriesBefore - doneEvent.result.entriesAfter);
      appendCompactionBlock({
        type: "compaction",
        title: "History compacted",
        message: `Older messages were condensed into a checkpoint summary (${reduced} entries reduced).`,
        sessionName: "main",
        applied: true,
        reason: "stop",
        entriesBefore: doneEvent.result.entriesBefore,
        entriesAfter: doneEvent.result.entriesAfter,
        summaryPreview,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendCompactionBlock({
        type: "compaction",
        title: "Compaction failed",
        message: "Could not compact history for main session.",
        sessionName: "main",
        applied: false,
        reason: "error",
        error: message,
      });
    }
  }

  async function runTurn(text: string, images: Array<Extract<UIUserContentPart, { type: "image" }>>) {
    const ensured = ensureRuntime();
    if (!ensured) {
      mapMessages((messages) => [
        ...messages,
        {
          id: msgId(),
          role: "assistant",
          blocks: [{ type: "text", text: "Error: No provider configured. Open Settings to add one." }],
        },
      ]);
      return;
    }

    const content: UIUserContentPart[] = [];
    if (text) content.push({ type: "text", text });
    content.push(...images);

    mapMessages((messages) => [
      ...messages,
      { id: msgId(), role: "user", content, timestamp: new Date().toISOString() },
    ]);

    ensureChatMeta(props.chatId, uiContentText(content) || images[0]?.name || "Image chat");
    clearPendingCallMappings();
    assistantIdx = -1;
    setPendingImages([]);
    setState("streaming", true);

    const loop = nessi({
      agentId: "main",
      input: [
        ...(text ? [textPart(text)] : []),
        ...images.map((image) => ({ type: "file", data: image.data, mediaType: image.mediaType } as const)),
      ],
      provider: ensured.provider,
      systemPrompt: resolvePrompt(getActivePrompt()),
      store: ensured.runtime.store,
      tools: ensured.runtime.tools,
      maxTurns: 10,
      compact: ensured.runtime.compactFn,
    });

    activeLoop = loop;

    try {
      for await (const event of loop) {
        await handleNessiEvent(event);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mapMessages((messages) => [
        ...messages,
        {
          id: msgId(),
          role: "assistant",
          blocks: [{ type: "text", text: `Error: ${message}` }],
        },
      ]);
    } finally {
      activeLoop = null;
      clearPendingCallMappings();
      closeStreamingAssistantMessage();
      currentAssistantStartedAt = undefined;
      assistantIdx = -1;
      setState("streaming", false);
      void refreshChatTitlesInBackground(1);
    }
  }

  function handleSend(text: string) {
    if (state.streaming) return;
    const images = pendingImages();
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    void runTurn(trimmed, images);
  }

  function handleDragEnter(event: DragEvent) {
    if (!providerSupportsImages() || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth++;
    setDropActive(true);
  }

  function handleDragOver(event: DragEvent) {
    if (!providerSupportsImages() || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent) {
    if (!providerSupportsImages() || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDropActive(false);
  }

  function handleDrop(event: DragEvent) {
    if (!providerSupportsImages() || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth = 0;
    setDropActive(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) void addPendingImages(files);
  }

  createEffect(on(() => props.chatId, (id) => resetRuntime(id)));
  createEffect(on(() => props.providerId, () => {
    if (!providerSupportsImages()) setPendingImages([]);
  }));

  onMount(() => {
    resetRuntime(props.chatId);
    registerCommand({
      name: "compact",
      description: "Compact the active session history",
      action: () => handleCompactCommand(),
    });
  });

  onCleanup(() => {
    activeLoop?.abort();
    activeLoop = null;
  });

  return (
    <div
      class="relative flex flex-col h-full"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Show when={dropActive()}>
        <div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-emerald-400 bg-emerald-50/70 text-sm text-emerald-700">
          drop images to attach
        </div>
      </Show>
      <Show when={!getActiveProviderEntry()}>
        <div class="mx-3 mt-2 px-3 py-2 ui-subpanel text-xs text-gh-fg-muted flex items-center gap-2">
          <span class="i ti ti-alert-triangle text-gh-danger" />
          <span>
            No provider configured.{" "}
            <button class="underline text-gh-fg-secondary hover:text-gh-fg cursor-pointer" onClick={() => props.onOpenSettings?.()}>
              Open Settings
            </button>
            {" "}or type <code class="text-gh-fg-subtle">/settings</code> to add one.
          </span>
        </div>
      </Show>
      <MessageList
        messages={state.messages}
        streaming={state.streaming}
        onApproval={handleApproval}
        onSurveySubmit={handleSurveySubmit}
      />
      <MessageInput
        onSend={handleSend}
        onAddImages={addPendingImages}
        onRemoveImage={removePendingImage}
        images={pendingImages()}
        canAttachImages={providerSupportsImages()}
        dropActive={dropActive()}
        disabled={state.streaming}
      />
    </div>
  );
}
