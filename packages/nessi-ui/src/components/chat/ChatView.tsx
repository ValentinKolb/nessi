import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
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
import type { Bash } from "just-bash";
import type { ChatState, UIMessage, UIBlock, UIAssistantMessage, UICompactionBlock } from "./types.js";
import { inlineToolHandlers } from "../../lib/inline-tool-blocks.js";
import { MessageList } from "./MessageList.js";
import { MessageInput } from "./MessageInput.js";
import { TerminalView } from "./TerminalView.js";
import { ChatFilesModal } from "./ChatFilesModal.js";
import { NextcloudBrowserModal } from "./NextcloudBrowserModal.js";
import { GitHubBrowserModal } from "./GitHubBrowserModal.js";
import { createMainBashRuntime } from "../../lib/skills.js";
import { promptRepo, promptService } from "../../domains/prompt/index.js";
import { createProvider, getActiveProviderEntry } from "../../lib/provider.js";
import { uiContentText, type UIUserContentPart } from "../../lib/chat-content.js";
import { createProviderContextStore, loadPersistedEntries, persistentSessionStore, truncatePersistedEntries } from "../../lib/store.js";
import { settingsRepo } from "../../domains/settings/index.js";
import { memoryService } from "../../domains/memory/index.js";
import { chatRepo } from "../../domains/chat/index.js";
import { registerCommand } from "../../lib/slash-commands.js";
import { createDefaultCompactFn } from "../../lib/compaction.js";
import { loadCompactionSettings, getCompactionPrompt } from "../../lib/compaction-settings.js";
import { prepareImageUpload, prepareImageForStorage } from "../../lib/image-resize.js";
import { createChatFileService } from "../../lib/file-service.js";
import {
  attachFilesToMessage,
  buildFileInfo,
  clearMessageFileRefs,
  classifyPendingChatFile,
  downloadChatFile,
  listChatFiles,
  listInputFiles,
  listOutputFiles,
  putInputFile,
  putOutputFile,
  readChatFile,
  removeChatFile,
  removeOutputFilesMissingFromPaths,
  type ChatFileMeta,
  type PendingChatFile,
} from "../../lib/chat-files.js";
import { dropzone } from "@valentinkolb/stdlib/solid";
import { haptics } from "../../shared/browser/haptics.js";
import { loadMessages, summaryTextFromEntry, compactPreview } from "../../lib/message-loader.js";
import { isNextcloudConfigured, type NextcloudRef } from "../../domains/nextcloud/index.js";
import { hasGitHubToken, fetchIssueDetail, fetchPRDetail, formatIssueForPrompt, formatPRForPrompt, type GitHubRef } from "../../domains/github/index.js";
import type { UIMessage as UIMsg } from "./types.js";

const TopicSuggestions = (props: { messages: UIMsg[]; onSelect: (text: string) => void }) => {
  const [topics, setTopics] = createSignal<string[]>([]);
  const refreshTopics = async () => {
    const memoryTopics = await memoryService.topicSuggestions();
    const { getSuggestions } = await import("../../domains/scheduler/jobs/suggest-topics.js");
    const aiTopics = getSuggestions();
    // Merge: AI suggestions first, then memory-based, deduplicated
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const t of [...aiTopics, ...memoryTopics]) {
      const key = t.toLowerCase().trim();
      if (!seen.has(key)) { seen.add(key); merged.push(t); }
    }
    setTopics(merged.slice(0, 8));
  };

  createEffect(on(() => props.messages.length, (messageCount) => {
    if (messageCount > 0) {
      setTopics([]);
      return;
    }

    void refreshTopics();
  }, { defer: true }));

  return (
    <Show when={topics().length > 0}>
      <div class="px-3 pb-1">
        <div class="max-w-4xl mx-auto flex flex-wrap gap-1.5">
          <For each={topics()}>
            {(topic) => (
              <button
                class="text-[11px] text-gh-fg-muted hover:text-gh-fg px-2.5 py-1 rounded-lg bg-gh-overlay hover:bg-gh-muted transition-all truncate max-w-52"
                onClick={() => { haptics.tap(); props.onSelect(topic); }}
              >
                {topic}
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
};

import { isAssistantMessage, isUserMessage } from "./guards.js";

const msgId = () => humanId({ separator: "-", capitalize: false });

const summaryPreviewFromEntries = (entries: StoreEntry[]): string | undefined => {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.kind !== "summary") continue;
    const text = summaryTextFromEntry(entry);
    if (text) return compactPreview(text);
  }
  return undefined;
};

const assistantPreviewFromBlocks = (blocks: UIBlock[]) =>
  blocks
    .filter((block): block is Extract<UIBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 180);

const textPart = (text: string): ContentPart => ({ type: "text", text });

const MAX_IMAGES_PER_MESSAGE = 6;

type Runtime = {
  store: SessionStore;
  tools: Tool[];
  compactFn: CompactFn;
  maxToolResultChars?: number;
  bash: Bash;
};

/** Main chat runtime built directly on nessi-core loop (single main session, no subagents). */
import type { ProviderEntry } from "../../lib/provider.js";

export const ChatView = (props: {
  chatId: string;
  providerId: string;
  providers?: ProviderEntry[];
  activeProviderId?: string;
  onProviderChange?: (id: string) => void;
  onOpenSettings?: () => void;
  onSessionComplete?: (payload: { chatId: string; finishedAt: string; preview: string }) => void;
  onNewChat?: () => void;
}) => {
  const [state, setState] = createStore<ChatState>({ messages: [], streaming: false });
  const [toasts, setToasts] = createSignal<Array<{ id: number; text: string }>>([]);
  let toastCounter = 0;

  const showToast = (text: string, durationMs = 6000) => {
    const id = ++toastCounter;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((item) => item.id !== id)), durationMs);
  };

  const dismissToast = (id: number) => setToasts((t) => t.filter((item) => item.id !== id));

  const [pendingImages, setPendingImages] = createSignal<Array<Extract<UIUserContentPart, { type: "image" }>>>([]);
  const [pendingFiles, setPendingFiles] = createSignal<PendingChatFile[]>([]);
  const [inputFiles, setInputFiles] = createSignal<ChatFileMeta[]>([]);
  const [outputFiles, setOutputFiles] = createSignal<ChatFileMeta[]>([]);
  const [filesModalOpen, setFilesModalOpen] = createSignal(false);
  const [nextcloudBrowserOpen, setNextcloudBrowserOpen] = createSignal(false);
  const [nextcloudRefs, setNextcloudRefs] = createSignal<NextcloudRef[]>([]);
  const [githubBrowserOpen, setGitHubBrowserOpen] = createSignal(false);
  const [terminalOpen, setTerminalOpen] = createSignal(false);
  const [lastUsage, setLastUsage] = createSignal<import("nessi-ai").Usage | undefined>(undefined);
  const [githubRefs, setGitHubRefs] = createSignal<GitHubRef[]>([]);
  const { isDragging: dropActive, handlers: dropHandlers } = dropzone.create({
    onDrop: (files) => void addPendingFiles(files),
  });

  let runtime: Runtime | null = null;
  let activeLoop: NessiLoop | null = null;
  let ensuredProvider: ReturnType<typeof createProvider> | null = null;
  let currentAssistantStartedAt: string | undefined;
  let pendingAutoCompactionEntriesBefore: number | null = null;
  let resetVersion = 0;
  let attentionFeedbackSentForTurn = false;
  let streamFeedbackStartedForTurn = false;
  let lastStreamFeedbackAt = 0;
  let streamedCharsSinceFeedback = 0;

  let assistantIdx = -1;
  const toolBlockIndices = new Map<string, { idx: number; name: string }>();
  const companionBlockIndices = new Map<string, number>();
  const approvalBlockIndices = new Map<string, number>();

  const clearPendingCallMappings = () => {
    toolBlockIndices.clear();
    companionBlockIndices.clear();
    approvalBlockIndices.clear();
  };

  /** Run the inline-tool-block registry's fromArgs handler and, if it returns a block, append it as a companion. Idempotent per callId. */
  const appendCompanionFromArgs = (name: string, args: unknown, callId: string) => {
    if (companionBlockIndices.has(callId)) return null;
    const handler = inlineToolHandlers[name];
    const block = handler?.fromArgs?.(args, callId);
    if (!block) return null;
    const idx = appendBlock(block);
    if (idx !== null) companionBlockIndices.set(callId, idx);
    return block;
  };

  /** Run the inline-tool-block registry's fromResult handler; appends a full block or patches the tracked companion. */
  const applyFromResult = (name: string, result: unknown, args: unknown, callId: string) => {
    const handler = inlineToolHandlers[name];
    const produced = handler?.fromResult?.(result, args, callId);
    if (!produced) return;
    if ("type" in produced && typeof produced.type === "string") {
      const idx = appendBlock(produced as UIBlock);
      if (idx !== null) companionBlockIndices.set(callId, idx);
      return;
    }
    const companionIdx = companionBlockIndices.get(callId);
    if (typeof companionIdx !== "number") return;
    const patch = produced as Partial<UIBlock>;
    updateBlock(companionIdx, (block) => ({ ...block, ...patch }) as UIBlock);
  };

  const closeStreamingAssistantMessage = () => {
    mapMessages((messages) => {
      const current = messages[assistantIdx];
      if (!isAssistantMessage(current) || !current.streaming) return messages;
      const next = [...messages];
      next[assistantIdx] = { ...current, streaming: false };
      return next;
    });
  };

  const pulseStreamingFeedback = (delta: string) => {
    if (!delta.trim()) return;
    const now = Date.now();
    streamedCharsSinceFeedback += delta.length;
    if (!streamFeedbackStartedForTurn) {
      streamFeedbackStartedForTurn = true;
      lastStreamFeedbackAt = now;
      streamedCharsSinceFeedback = 0;
      haptics.selection();
      return;
    }
    if (streamedCharsSinceFeedback >= 48 || now - lastStreamFeedbackAt >= 900) {
      streamedCharsSinceFeedback = 0;
      lastStreamFeedbackAt = now;
      haptics.selection();
    }
  };

  const fileService = createChatFileService({
    getChatId: () => props.chatId,
    getBash: () => runtime?.bash ?? null,
    onFilesChanged: () => {
      void refreshChatFiles();
    },
  });

  const resetRuntime = async (chatId: string) => {
    const version = ++resetVersion;
    activeLoop?.abort();
    activeLoop = null;
    runtime = null;
    const [messages, nextInputFiles, nextOutputFiles] = await Promise.all([
      loadMessages(chatId),
      listInputFiles(chatId),
      listOutputFiles(chatId),
    ]);
    if (version !== resetVersion) return;

    // Restore last known usage from loaded messages
    const lastAssistantWithUsage = [...messages]
      .reverse()
      .find((m): m is import("./types.js").UIAssistantMessage => m.role === "assistant" && !!m.meta?.usage);
    setLastUsage(lastAssistantWithUsage?.meta?.usage);

    setState({ messages, streaming: false });
    setPendingImages([]);
    setPendingFiles([]);
    setNextcloudRefs([]);
    setGitHubRefs([]);
    setInputFiles(nextInputFiles);
    setOutputFiles(nextOutputFiles);
    setFilesModalOpen(false);
    setNextcloudBrowserOpen(false);
    setGitHubBrowserOpen(false);
    currentAssistantStartedAt = undefined;
    assistantIdx = -1;
    clearPendingCallMappings();
  };

  const refreshChatFiles = async () => {
    const [nextInputFiles, nextOutputFiles] = await Promise.all([
      listInputFiles(props.chatId),
      listOutputFiles(props.chatId),
    ]);
    setInputFiles(nextInputFiles);
    setOutputFiles(nextOutputFiles);
  };

  const mapMessages = (mutator: (messages: UIMessage[]) => UIMessage[]) => {
    setState("messages", (messages) => mutator(messages));
  };

  const appendStatusMessage = (text: string, isError = true) => {
    mapMessages((messages) => [
      ...messages,
      {
        id: msgId(),
        role: "assistant",
        blocks: [{ type: "text", text, isError }],
      },
    ]);
  };

  const appendCompactionBlock = (block: UICompactionBlock) => {
    mapMessages((messages) => [
      ...messages,
      {
        id: msgId(),
        role: "assistant",
        blocks: [block],
      },
    ]);
  };

  const ensureAssistantTurnMessage = () => {
    const current = state.messages[assistantIdx];
    if (isAssistantMessage(current)) {
      // Re-entering for a follow-up turn — make sure the message stays in
      // streaming state so the actions footer doesn't render mid-conversation.
      if (!current.streaming) {
        mapMessages((messages) => {
          const next = [...messages];
          next[assistantIdx] = { ...current, streaming: true };
          return next;
        });
      }
      return;
    }

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
  };

  const getCurrentBlocks = (): UIBlock[] => {
    const assistant = state.messages[assistantIdx];
    if (!isAssistantMessage(assistant)) return [];
    return assistant.blocks;
  };

  const appendBlock = (block: UIBlock): number | null => {
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
  };

  const updateBlock = (blockIdx: number, updater: (block: UIBlock) => UIBlock) => {
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
  };

  const buildRuntimeInitialFiles = async (chatId: string) => {
    const initialFiles: Record<string, Uint8Array> = {};
    const staleIds: string[] = [];

    for (const meta of await listChatFiles(chatId)) {
      try {
        initialFiles[meta.mountPath] = await readChatFile(meta);
      } catch {
        staleIds.push(meta.id);
      }
    }

    if (staleIds.length > 0) {
      await Promise.all(staleIds.map((fileId) => removeChatFile(chatId, fileId)));
      await refreshChatFiles();
    }

    return initialFiles;
  };

  const syncRuntimeOutputs = async (chatId: string, bash: Bash) => {
    const outputPaths = new Set<string>();

    for (const path of bash.fs.getAllPaths()) {
      if (!path.startsWith("/output/")) continue;

      try {
        const stat = await bash.fs.stat(path);
        if (!stat.isFile) continue;
        const bytes = await bash.fs.readFileBuffer(path);
        await putOutputFile(chatId, path, bytes);
        outputPaths.add(path);
      } catch {
        // Ignore transient fs issues; future turns rebuild from persisted state.
      }
    }

    await removeOutputFilesMissingFromPaths(chatId, outputPaths);
    refreshChatFiles();
  };

  /** Load chat files from DB into the VFS that aren't already present. */
  const syncInputFilesToRuntime = async (bash: Bash) => {
    for (const meta of await listChatFiles(props.chatId)) {
      try {
        if (!(await bash.fs.exists(meta.mountPath))) {
          const bytes = await readChatFile(meta);
          const dir = meta.mountPath.slice(0, meta.mountPath.lastIndexOf("/"));
          if (dir && dir !== "/") await bash.fs.mkdir(dir, { recursive: true });
          await bash.fs.writeFile(meta.mountPath, bytes);
        }
      } catch { /* skip stale files */ }
    }
  };

  const ensureRuntime = async (): Promise<{ provider: ReturnType<typeof createProvider>; runtime: Runtime } | null> => {
    const providerEntry = getActiveProviderEntry();
    if (!providerEntry) return null;

    if (!runtime) {
      const initialFiles = await buildRuntimeInitialFiles(props.chatId);
      const settings = await loadCompactionSettings();
      const chatProvider = createProvider(providerEntry);
      const bashRuntime = createMainBashRuntime({
        initialFiles,
        fileService,
        chatProvider,
        afterExec: async (bash) => {
          await syncRuntimeOutputs(props.chatId, bash);
        },
      });
      runtime = {
        store: persistentSessionStore(props.chatId),
        tools: bashRuntime.tools,
        compactFn: createDefaultCompactFn({
          maxToolChars: settings.maxToolChars,
          maxSourceChars: settings.maxSourceChars,
          compactionPrompt: await getCompactionPrompt(),
        }),
        maxToolResultChars: Number.isFinite(settings.maxToolResultChars) ? settings.maxToolResultChars : undefined,
        bash: bashRuntime.bash,
      };
    }

    return { provider: createProvider(providerEntry), runtime };
  };

  const providerSupportsImages = () => {
    const providerEntry = getActiveProviderEntry();
    return providerEntry ? createProvider(providerEntry).capabilities.images : false;
  };

  const lastUserEntrySeq = () => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const message = state.messages[i];
      if (isUserMessage(message) && message.entrySeq !== undefined) return message.entrySeq;
    }
    return undefined;
  };

  const latestPersistedSeq = async () =>
    (await loadPersistedEntries(props.chatId)).reduce((max, entry) => Math.max(max, entry.seq), 0);

  const addPendingFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files);

    // Resize images before treating them as files
    const imageFiles = incoming.filter((file) => file.type.startsWith("image/"));
    const nonImageFiles = incoming.filter((file) => !file.type.startsWith("image/"));

    let resizedImages: File[] = [];
    if (imageFiles.length > 0) {
      const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
      const supported = imageFiles.filter((f) => SUPPORTED_IMAGE_TYPES.has(f.type));
      const unsupported = imageFiles.filter((f) => !SUPPORTED_IMAGE_TYPES.has(f.type));

      if (unsupported.length > 0) {
        const names = unsupported.map((f) => f.name).join(", ");
        const types = [...new Set(unsupported.map((f) => f.name.split(".").pop()?.toUpperCase()))].join(", ");
        showToast(`Unsupported image format (${types}): ${names}. Use JPEG, PNG, or WebP.`);
      }

      if (supported.length > 0) {
        try {
          resizedImages = await Promise.all(supported.map(prepareImageForStorage));
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error));
        }
      }
    }

    const allFiles = [...nonImageFiles, ...resizedImages];
    const documents = allFiles
      .map((file) => {
        const pending = classifyPendingChatFile(file);
        if (pending && (file as any).webkitRelativePath) {
          pending.relativePath = (file as any).webkitRelativePath;
        }
        return pending;
      })
      .filter((file): file is PendingChatFile => Boolean(file));

    const unsupportedCount = allFiles.length - documents.length;
    if (unsupportedCount > 0) {
      showToast("Some files were ignored. Only images, text/code files, CSV/XLSX spreadsheets, and PDFs are supported.");
    }

    if (documents.length > 0) {
      setPendingFiles((current) => [...current, ...documents]);
    }
  };

  const removePendingImage = (index: number) => {
    setPendingImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((current) => current.filter((file) => file.id !== id));
  };

  const canRetryMessage = (message: UIMessage) =>
    !state.streaming && isUserMessage(message) && message.entrySeq !== undefined;

  const updateAssistantMeta = (updater: (meta: NonNullable<UIAssistantMessage["meta"]>) => NonNullable<UIAssistantMessage["meta"]>) => {
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
  };

  const handleApproval = async (callId: string, action: "deny" | "allow" | "always") => {
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

    if (action === "always") await settingsRepo.setAlwaysAllowed(toolEntry.name);
    loop.push({ type: "approval_response", callId, approved });

    updateBlock(toolEntry.idx, (block) =>
      block.type === "tool_call" ? { ...block, approval: approved ? "approved" : "denied" } : block,
    );
  };

  const handleSurveySubmit = async (callId: string, answers: Record<string, string>) => {
    const loop = activeLoop;
    if (!loop) {
      appendStatusMessage("This survey is no longer active.");
      return;
    }

    const blockIdx = companionBlockIndices.get(callId);
    if (typeof blockIdx !== "number") return;

    const result = Object.entries(answers)
      .map(([question, answer]) => `${question}\n${answer}`)
      .join("\n\n");

    loop.push({ type: "tool_result", callId, result: { result } });
    haptics.success();
    updateBlock(blockIdx, (block) =>
      block.type === "survey" ? { ...block, submitted: true, answers } : block,
    );
  };

  const handleNessiEvent = async (event: OutboundEvent) => {
    switch (event.type) {
      case "turn_start": {
        currentAssistantStartedAt = new Date().toISOString();
        attentionFeedbackSentForTurn = false;
        streamFeedbackStartedForTurn = false;
        lastStreamFeedbackAt = 0;
        streamedCharsSinceFeedback = 0;
        ensureAssistantTurnMessage();
        break;
      }

      case "text": {
        pulseStreamingFeedback(event.delta);
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
        if (!attentionFeedbackSentForTurn) {
          attentionFeedbackSentForTurn = true;
          haptics.nudge();
        }
        const idx = appendBlock({
          type: "tool_call",
          callId: event.callId,
          name: event.name,
          args: {},
          startedAt: new Date().toISOString(),
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
        appendCompanionFromArgs(event.name, event.args, event.callId);
        break;
      }

      case "action_request": {
        if (!attentionFeedbackSentForTurn) {
          attentionFeedbackSentForTurn = true;
          haptics.nudge();
        }
        if (event.kind === "approval") {
          const entry = toolBlockIndices.get(event.callId);
          if (!entry) break;

          if ((await settingsRepo.loadToolApprovals())[event.name] === true) {
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

        if (event.kind === "client_tool") {
          if (event.name === "card") {
            appendCompanionFromArgs(event.name, event.args, event.callId);
            activeLoop?.push({ type: "tool_result", callId: event.callId, result: { displayed: true } });
            break;
          }

          if (event.name === "survey") {
            const produced = appendCompanionFromArgs(event.name, event.args, event.callId);
            if (!produced) {
              activeLoop?.push({
                type: "tool_result",
                callId: event.callId,
                result: {
                  result:
                    "Error: survey questions could not be parsed. Format: each line needs a question followed by 2+ options separated by |. " +
                    "Example: {\"title\":\"Setup\",\"questions\":\"Language? | TypeScript | Python | Go\\nTests? | Yes | No\"}. " +
                    "For a single choice: {\"questions\":\"What to do? | Option A | Option B | Option C\"}",
                },
              });
            }
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
        const args = (() => {
          const msg = state.messages[assistantIdx];
          if (!msg || msg.role !== "assistant") return undefined;
          const b = (msg as UIAssistantMessage).blocks[entry.idx];
          return b?.type === "tool_call" ? b.args : undefined;
        })();
        if (!event.isError) applyFromResult(entry.name, event.result, args, event.callId);
        break;
      }

      case "turn_end": {
        // Update meta with latest model/usage info, but do NOT close the
        // streaming message or fire notifications — the loop may continue
        // with another turn (tool_call → execution → next provider call).
        const persistedAssistant = [...await loadPersistedEntries(props.chatId)]
          .reverse()
          .find((entry) => entry.kind === "message" && entry.message.role === "assistant");
        const completedAt = persistedAssistant?.createdAt ?? new Date().toISOString();
        if (event.message.usage) setLastUsage(event.message.usage);
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
        break;
      }

      case "done": {
        // The entire agent loop has finished — close the message and notify.
        if (streamFeedbackStartedForTurn) haptics.success();
        const preview = assistantPreviewFromBlocks(getCurrentBlocks());
        closeStreamingAssistantMessage();
        currentAssistantStartedAt = undefined;
        streamFeedbackStartedForTurn = false;
        lastStreamFeedbackAt = 0;
        streamedCharsSinceFeedback = 0;
        props.onSessionComplete?.({
          chatId: props.chatId,
          finishedAt: new Date().toISOString(),
          preview,
        });
        break;
      }

      case "error": {
        if (event.contextOverflow) {
          haptics.tap();
          mapMessages((messages) => [
            ...messages,
            {
              id: msgId(),
              role: "assistant",
              blocks: [{
                type: "context_overflow",
                contextWindow: ensuredProvider?.contextWindow,
                lastTotal: lastUsage()?.total,
              }],
            },
          ]);
        } else {
          haptics.error();
          appendStatusMessage(`Error: ${event.error}`);
        }
        break;
      }

      case "steer_applied":
        break;

      case "compaction_start": {
        try {
          pendingAutoCompactionEntriesBefore = (await runtime?.store.load())?.length ?? null;
        } catch {
          pendingAutoCompactionEntriesBefore = null;
        }
        // Show pending compaction block immediately
        appendCompactionBlock({
          type: "compaction",
          title: "Compacting",
          message: "Condensing older history into a checkpoint summary...",
          sessionName: "main",
          applied: false,
          reason: "pending",
          entriesBefore: pendingAutoCompactionEntriesBefore ?? undefined,
        });
        break;
      }

      case "compaction_end": {
        // Update the pending compaction block with final result
        const updateLastCompactionBlock = (block: UICompactionBlock) => {
          mapMessages((messages) => {
            for (let i = messages.length - 1; i >= 0; i--) {
              const msg = messages[i];
              if (msg?.role !== "assistant") continue;
              const blocks = (msg as UIAssistantMessage).blocks;
              const idx = blocks.findLastIndex((b) => b.type === "compaction" && (b as UICompactionBlock).reason === "pending");
              if (idx >= 0) {
                const next = [...messages];
                const nextBlocks = [...blocks];
                nextBlocks[idx] = block;
                next[i] = { ...msg, blocks: nextBlocks } as UIAssistantMessage;
                return next;
              }
            }
            // Fallback: append if no pending block found
            return [...messages, { id: msgId(), role: "assistant" as const, blocks: [block] }];
          });
        };

        try {
          const entriesAfter = await runtime?.store.load();
          const afterCount = entriesAfter?.length;
          const summaryPreview = entriesAfter ? summaryPreviewFromEntries(entriesAfter) : undefined;
          const reduced = typeof afterCount === "number" && typeof pendingAutoCompactionEntriesBefore === "number"
            ? Math.max(0, pendingAutoCompactionEntriesBefore - afterCount)
            : undefined;

          updateLastCompactionBlock({
            type: "compaction",
            title: "Checkpoint summary",
            message: typeof reduced === "number" && reduced > 0
              ? `Older history was condensed into a checkpoint summary (${reduced} entries reduced).`
              : "Older history was condensed into a checkpoint summary.",
            sessionName: "main",
            applied: true,
            reason: "stop",
            entriesBefore: pendingAutoCompactionEntriesBefore ?? undefined,
            entriesAfter: afterCount,
            summaryPreview,
          });
        } catch {
          updateLastCompactionBlock({
            type: "compaction",
            title: "Checkpoint summary",
            message: "Older history was condensed into a checkpoint summary.",
            sessionName: "main",
            applied: true,
            reason: "stop",
          });
        } finally {
          pendingAutoCompactionEntriesBefore = null;
        }
        break;
      }
    }
  };

  const handleCompactCommand = async () => {
    if (state.streaming) {
      appendStatusMessage("Cannot compact while session is busy.");
      return;
    }

    const ensured = await ensureRuntime();
    if (!ensured) {
      appendStatusMessage("Cannot compact: no provider configured.");
      return;
    }

    // Show pending block immediately
    const pendingIdx = appendCompactionBlock({
      type: "compaction",
      title: "Compacting",
      message: "Condensing older history into a checkpoint summary...",
      sessionName: "main",
      applied: false,
      reason: "pending",
    });

    const updatePendingBlock = (block: UICompactionBlock) => {
      mapMessages((messages) => {
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg?.role !== "assistant") continue;
          const blocks = (msg as UIAssistantMessage).blocks;
          const idx = blocks.findLastIndex((b) => b.type === "compaction" && (b as UICompactionBlock).reason === "pending");
          if (idx >= 0) {
            const next = [...messages];
            const nextBlocks = [...blocks];
            nextBlocks[idx] = block;
            next[i] = { ...msg, blocks: nextBlocks } as UIAssistantMessage;
            return next;
          }
        }
        return [...messages, { id: msgId(), role: "assistant" as const, blocks: [block] }];
      });
    };

    try {
      const store = createProviderContextStore(ensured.runtime.store, await latestPersistedSeq());
      const loop = compact({
        agentId: "main",
        store,
        provider: ensured.provider,
        compact: ensured.runtime.compactFn,
        force: true,
      });

      let doneEvent: Extract<CompactEvent, { type: "done" }> | null = null;
      for await (const event of loop) {
        if (event.type === "done") doneEvent = event;
      }

      if (!doneEvent) {
        updatePendingBlock({
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
        updatePendingBlock({
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
        updatePendingBlock({
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
        updatePendingBlock({
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
      updatePendingBlock({
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
      haptics.error();
      const message = error instanceof Error ? error.message : String(error);
      updatePendingBlock({
        type: "compaction",
        title: "Compaction failed",
        message: "Could not compact history for main session.",
        sessionName: "main",
        applied: false,
        reason: "error",
        error: message,
      });
    } finally {
      runtime = null;
    }
  };

  /** Compact & retry: used as CTA from ContextOverflowBlock. */
  const handleCompactAndRetry = async () => {
    await handleCompactCommand();
    // Find the last user message and re-send it
    const lastUserMsg = [...state.messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg && lastUserMsg.role === "user") {
      const textParts = lastUserMsg.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => typeof c === "object" && "type" in c && c.type === "text")
        .map((c) => c.text)
        .join("\n");
      if (textParts) {
        await runTurn(textParts, []);
      }
    }
  };

  const runTurn = async (
    text: string,
    images: Array<Extract<UIUserContentPart, { type: "image" }>>,
    attachedFiles: ChatFileMeta[] = [],
    newFiles: ChatFileMeta[] = [],
    ncRefs: NextcloudRef[] = [],
    githubContext?: string,
  ) => {
    const ensured = await ensureRuntime();
    if (!ensured) {
      haptics.error();
      appendStatusMessage("Error: No provider configured. Open Settings to add one.");
      return;
    }
    ensuredProvider = ensured.provider;

    const content: UIUserContentPart[] = [];
    if (text) content.push({ type: "text", text });
    content.push(...images);
    content.push(...attachedFiles.map((file) => ({
      type: "file" as const,
      fileId: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
    })));

    const predictedUserSeq = await latestPersistedSeq() + 1;
    if (attachedFiles.length > 0) {
      await attachFilesToMessage(props.chatId, predictedUserSeq, attachedFiles.map((file) => file.id));
    }

    mapMessages((messages) => [
      ...messages,
      { id: msgId(), role: "user", content, timestamp: new Date().toISOString(), entrySeq: predictedUserSeq },
    ]);

    await chatRepo.ensureMeta(props.chatId, uiContentText(content) || attachedFiles[0]?.name || images[0]?.name || "Files chat");
    clearPendingCallMappings();
    assistantIdx = -1;
    setPendingImages([]);
    setPendingFiles([]);
    setNextcloudRefs([]);
    setGitHubRefs([]);
    setState("streaming", true);

    const store = createProviderContextStore(ensured.runtime.store, await latestPersistedSeq());
    const prompt = await promptService.resolve(await promptRepo.getActive(), {
      fileInfo: buildFileInfo(newFiles, await listChatFiles(props.chatId), ncRefs, githubContext),
    });
    const input: ContentPart[] = [
      ...(text ? [textPart(text)] : []),
      ...images.map((image) => ({ type: "file", data: image.data, mediaType: image.mediaType } as const)),
    ];

    if (!text && images.length === 0) {
      if (attachedFiles.length > 0) {
        input.push(textPart("The user attached files for this turn."));
      } else if (ncRefs.length > 0) {
        input.push(textPart("The user selected Nextcloud files for this turn."));
      } else if (githubContext) {
        input.push(textPart("The user selected GitHub resources for this turn. See the system prompt for details."));
      }
    }

    const loop = nessi({
      agentId: "main",
      input,
      provider: ensured.provider,
      systemPrompt: prompt,
      store,
      tools: ensured.runtime.tools,
      maxTurns: 40,
      compact: ensured.runtime.compactFn,
      maxToolResultChars: ensured.runtime.maxToolResultChars,
    });

    activeLoop = loop;

    // Interrupt plumbing: synchronous subscribe fires the moment abort() is called,
    // so the UI releases the streaming state even if the for-await is blocked on
    // the provider. Late content events that arrive during the loop's wind-down
    // are dropped by the guard below.
    let currentTurnInterrupted = false;
    const LATE_EVENT_TYPES = new Set(["text", "thinking", "tool_start", "tool_call", "tool_end", "action_request"]);
    const unsubInterrupt = loop.subscribe((event) => {
      if (event.type !== "interrupted") return;
      currentTurnInterrupted = true;
      haptics.tap();
      closeStreamingAssistantMessage();
      setState("streaming", false);
    });

    try {
      for await (const event of loop) {
        if (currentTurnInterrupted && LATE_EVENT_TYPES.has(event.type)) continue;
        await handleNessiEvent(event);
      }
    } catch (error) {
      haptics.error();
      appendStatusMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      unsubInterrupt();
      activeLoop = null;
      clearPendingCallMappings();
      closeStreamingAssistantMessage();
      currentAssistantStartedAt = undefined;
      streamFeedbackStartedForTurn = false;
      lastStreamFeedbackAt = 0;
      streamedCharsSinceFeedback = 0;
      assistantIdx = -1;
      setState("streaming", false);
      runtime = null;
      refreshChatFiles();
    }
  };

  const retryLastUserTurn = async (message: UIMessage) => {
    if (!canRetryMessage(message) || !isUserMessage(message) || message.entrySeq === undefined) return;

    await clearMessageFileRefs(props.chatId, message.entrySeq);
    await truncatePersistedEntries(props.chatId, message.entrySeq);
    clearPendingCallMappings();
    assistantIdx = -1;
    currentAssistantStartedAt = undefined;
    setPendingImages([]);
    setPendingFiles([]);
    runtime = null;
    setState({ messages: await loadMessages(props.chatId), streaming: false });
    await refreshChatFiles();

    const text = uiContentText(message.content);
    const images = message.content.filter((part): part is Extract<UIUserContentPart, { type: "image" }> => part.type === "image");
    const allFiles = await listChatFiles(props.chatId);
    const files = message.content
      .filter((part): part is Extract<UIUserContentPart, { type: "file" }> => part.type === "file")
      .map((part) => allFiles.find((file) => file.id === part.fileId))
      .filter((file): file is ChatFileMeta => Boolean(file));
    void runTurn(text, images, files, []);
  };

  const handleNextcloudSelect = (refs: NextcloudRef[]) => {
    setNextcloudRefs((prev) => [...prev, ...refs]);
    setNextcloudBrowserOpen(false);
  };

  const removeNextcloudRef = (id: string) => {
    setNextcloudRefs((prev) => prev.filter((r) => r.id !== id));
  };

  const handleGitHubSelect = (refs: GitHubRef[]) => {
    setGitHubRefs((prev) => [...prev, ...refs]);
    setGitHubBrowserOpen(false);
  };

  const removeGitHubRef = (id: string) => {
    setGitHubRefs((prev) => prev.filter((r) => r.id !== id));
  };

  /** Mount referenced repos and fetch issue/PR details for prompt injection. */
  const prepareGitHubContext = async (ghRefs: GitHubRef[]): Promise<string> => {
    if (ghRefs.length === 0) return "";

    const repoGroups = new Map<string, GitHubRef[]>();
    for (const ref of ghRefs) {
      const list = repoGroups.get(ref.repo) ?? [];
      list.push(ref);
      repoGroups.set(ref.repo, list);
    }

    const sections = await Promise.all(
      [...repoGroups.entries()].map(async ([repo, refs]) => {
        const repoLines: string[] = [`## GitHub: ${repo}`, ""];
        const fileRefs = refs.filter((r) => r.kind === "file" || r.kind === "dir");
        const issueRefs = refs.filter((r) => r.kind === "issue" && r.number != null);
        const prRefs = refs.filter((r) => r.kind === "pr" && r.number != null);

        if (fileRefs.length > 0) {
          repoLines.push(
            `Repository files are available at \`/github/${repo}/\` (loaded on demand from the GitHub API).`,
            "",
            "The user specifically wants you to look at:",
          );
          for (const ref of fileRefs) {
            const fullPath = `/github/${repo}/${ref.path}`;
            repoLines.push(`- \`${fullPath}\` — read with \`cat ${fullPath}\` or \`read_file ${fullPath}\``);
          }
          repoLines.push("");
        }

        // Fetch issue + PR details in parallel
        const [issueDetails, prDetails] = await Promise.all([
          Promise.all(issueRefs.map((r) => fetchIssueDetail(repo, r.number!))),
          Promise.all(prRefs.map((r) => fetchPRDetail(repo, r.number!))),
        ]);

        for (let i = 0; i < issueRefs.length; i++) {
          const detail = issueDetails[i];
          if (detail) {
            repoLines.push(formatIssueForPrompt(detail, repo), "");
          } else {
            repoLines.push(`### Issue ${issueRefs[i]!.title}`, `> Could not fetch details. Use \`github issue ${repo} ${issueRefs[i]!.number}\` to load.`, "");
          }
        }

        for (let i = 0; i < prRefs.length; i++) {
          const detail = prDetails[i];
          if (detail) {
            repoLines.push(formatPRForPrompt(detail, repo), "");
          } else {
            repoLines.push(`### PR ${prRefs[i]!.title}`, `> Could not fetch details. Use \`github pr ${repo} ${prRefs[i]!.number}\` to load.`, "");
          }
        }

        return repoLines.join("\n");
      }),
    );

    return sections.join("\n\n");
  };

  const handleInterrupt = () => {
    if (!activeLoop) return;
    haptics.tap();
    activeLoop.abort();
  };

  const handleSend = (text: string) => {
    if (state.streaming) return;
    const images = pendingImages();
    const files = pendingFiles();
    const ncRefs = nextcloudRefs();
    const ghRefs = githubRefs();
    const trimmed = text.trim();
    if (!trimmed && images.length === 0 && files.length === 0 && ncRefs.length === 0 && ghRefs.length === 0) return;

    const sendPendingFiles = async () => {
      try {
        const persistedFiles = await Promise.all(files.map((file) => putInputFile(props.chatId, file)));
        await refreshChatFiles();

        // Build GitHub context: auto-clone repos + fetch issue/PR details
        const githubContext = await prepareGitHubContext(ghRefs);

        // Legacy inline images (pendingImages) still supported for backward compat
        await runTurn(trimmed, images, persistedFiles, persistedFiles, ncRefs, githubContext);
      } catch (error) {
        haptics.error();
        appendStatusMessage(error instanceof Error ? error.message : String(error));
      }
    };

    void sendPendingFiles();
  };

  const handleDeleteInputFile = async (file: ChatFileMeta) => {
    try {
      await removeChatFile(props.chatId, file.id);
      runtime = null;
      await refreshChatFiles();
      setState("messages", await loadMessages(props.chatId));
    } catch (error) {
      haptics.error();
      appendStatusMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDownloadOutputFile = async (file: ChatFileMeta) => {
    try {
      await downloadChatFile(file);
    } catch (error) {
      haptics.error();
      appendStatusMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDeleteOutputFile = async (file: ChatFileMeta) => {
    try {
      await removeChatFile(props.chatId, file.id);
      runtime = null;
      await refreshChatFiles();
    } catch (error) {
      haptics.error();
      appendStatusMessage(error instanceof Error ? error.message : String(error));
    }
  };

  createEffect(on(() => props.chatId, (id) => {
    void resetRuntime(id);
  }));
  createEffect(on(() => props.providerId, () => {
    if (!providerSupportsImages()) setPendingImages([]);
  }));

  onMount(() => {
    void resetRuntime(props.chatId);
    registerCommand({
      name: "compact",
      description: "Compact the active session history",
      action: () => { void handleCompactCommand(); },
    });
  });

  onCleanup(() => {
    activeLoop?.abort();
    activeLoop = null;
  });

  return (
    <div
      class="relative flex flex-col h-full"
      {...dropHandlers}
    >
      <Show when={dropActive()}>
        <div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-gh-accent bg-gh-accent-subtle/70 text-sm text-gh-accent">
          drop files to attach
        </div>
      </Show>
      <MessageList
        chatId={props.chatId}
        messages={state.messages}
        streaming={state.streaming}
        canRetryMessage={canRetryMessage}
        onRetryMessage={retryLastUserTurn}
        onApproval={handleApproval}
        onSurveySubmit={handleSurveySubmit}
        onCompact={() => void handleCompactAndRetry()}
      />
      <Show when={!getActiveProviderEntry()}>
        <div class="px-3 pb-1">
          <div class="max-w-4xl mx-auto px-3 py-2.5 rounded-lg border border-gh-danger/20 bg-status-err-bg text-[13px] text-gh-fg-muted flex items-center gap-2">
            <span class="i ti ti-alert-circle text-gh-danger text-base shrink-0" />
            <span>
              No provider configured.{" "}
              <button class="underline text-gh-accent hover:text-gh-fg cursor-pointer font-medium" onClick={() => { haptics.tap(); props.onOpenSettings?.(); }}>
                Open Settings
              </button>
              {" "}to add one.
            </span>
          </div>
        </div>
      </Show>
      <Show when={!terminalOpen()}>
        <TopicSuggestions messages={state.messages} onSelect={handleSend} />
        <MessageInput
          onSend={handleSend}
          onInterrupt={handleInterrupt}
          onAddFiles={addPendingFiles}
          onRemoveImage={removePendingImage}
          onRemovePendingFile={removePendingFile}
          onRemoveNextcloudRef={removeNextcloudRef}
          onRemoveGitHubRef={removeGitHubRef}
          onProviderChange={props.onProviderChange}
          onOpenFiles={() => setFilesModalOpen(true)}
          onOpenNextcloudBrowser={() => setNextcloudBrowserOpen(true)}
          onOpenGitHubBrowser={() => setGitHubBrowserOpen(true)}
          onOpenTerminal={() => setTerminalOpen(true)}
          onNewChat={props.onNewChat}
          images={pendingImages()}
          files={pendingFiles()}
          nextcloudRefs={nextcloudRefs()}
          githubRefs={githubRefs()}
          providers={props.providers}
          activeProviderId={props.activeProviderId}
          inputFileCount={inputFiles().length}
          outputFileCount={outputFiles().length}
          isNextcloudConfigured={isNextcloudConfigured()}
          isGitHubConfigured={hasGitHubToken()}
          dropActive={dropActive()}
          disabled={state.streaming}
          lastUsage={lastUsage()}
          contextWindow={getActiveProviderEntry()?.contextWindow}
          toasts={toasts()}
          onDismissToast={dismissToast}
        />
      </Show>
      <Show when={terminalOpen()}>
        <TerminalView
          getBash={async () => {
            const ensured = await ensureRuntime();
            if (ensured) await syncInputFilesToRuntime(ensured.runtime.bash);
            return ensured?.runtime.bash ?? null;
          }}
          afterExec={async (bash) => {
            await syncRuntimeOutputs(props.chatId, bash);
            await refreshChatFiles();
          }}
          onClose={() => setTerminalOpen(false)}
        />
      </Show>
      <ChatFilesModal
        open={filesModalOpen()}
        inputFiles={inputFiles()}
        outputFiles={outputFiles()}
        onClose={() => setFilesModalOpen(false)}
        onDeleteInput={handleDeleteInputFile}
        onDownloadOutput={handleDownloadOutputFile}
        onDeleteOutput={handleDeleteOutputFile}
      />
      <NextcloudBrowserModal
        open={nextcloudBrowserOpen()}
        onClose={() => setNextcloudBrowserOpen(false)}
        onSelect={handleNextcloudSelect}
      />
      <GitHubBrowserModal
        open={githubBrowserOpen()}
        onClose={() => setGitHubBrowserOpen(false)}
        onSelect={handleGitHubSelect}
      />
    </div>
  );
};
