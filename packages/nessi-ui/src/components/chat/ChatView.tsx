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
import { MessageList } from "./MessageList.js";
import { MessageInput } from "./MessageInput.js";
import { TerminalView } from "./TerminalView.js";
import { ChatFilesModal } from "./ChatFilesModal.js";
import { NextcloudBrowserModal } from "./NextcloudBrowserModal.js";
import { GitHubBrowserModal } from "./GitHubBrowserModal.js";
import { createMainBashRuntime } from "../../lib/skills.js";
import { getActivePrompt, resolvePrompt } from "../../lib/prompts.js";
import { createProvider, getActiveProviderEntry } from "../../lib/provider.js";
import { contentPartsToUIContent, uiContentText, type UIUserContentPart } from "../../lib/chat-content.js";
import { createProviderContextStore, loadPersistedEntries, persistentSessionStore, truncatePersistedEntries } from "../../lib/store.js";
import { isAlwaysAllowed, setAlwaysAllowed } from "../../lib/tool-approvals.js";
import { getTopicSuggestions } from "../../lib/memory.js";
import { ensureChatMeta } from "../../lib/chat-storage.js";
import { registerCommand } from "../../lib/slash-commands.js";
import { createDefaultCompactFn } from "../../lib/compaction.js";
import { loadCompactionSettings, getCompactionPrompt } from "../../lib/compaction-settings.js";
import { prepareImageUpload } from "../../lib/image-resize.js";
import { createChatFileService } from "../../lib/file-service.js";
import {
  attachFilesToMessage,
  buildFileInfo,
  clearMessageFileRefs,
  classifyPendingChatFile,
  downloadChatFile,
  fileMetasForMessage,
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
import { parseSurveyQuestions } from "../../lib/tools/survey-tool.js";
import { isNextcloudConfigured, type NextcloudRef } from "../../lib/nextcloud.js";
import { hasGitHubToken, fetchIssueDetail, fetchPRDetail, formatIssueForPrompt, formatPRForPrompt, type GitHubRef } from "../../lib/github.js";
import type { UIMessage as UIMsg } from "./types.js";

const TopicSuggestions = (props: { messages: UIMsg[]; onSelect: (text: string) => void }) => {
  const [topics, setTopics] = createSignal<string[]>([]);
  const refreshTopics = async () => {
    const memoryTopics = await getTopicSuggestions();
    const { getSuggestions } = await import("../../lib/jobs/suggest-topics.js");
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

const compactPreview = (text: string, max = 1200) =>
  text.length <= max ? text : `${text.slice(0, max)}...`;

const summaryTextFromEntry = (entry: StoreEntry): string | undefined => {
  const message = entry.message;

  if (message.role === "assistant") {
    const text = message.content
      .filter((block): block is Extract<typeof message.content[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return text || undefined;
  }

  if (message.role === "user") {
    const text = message.content
      .map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : ""))
      .join("\n")
      .trim();
    return text || undefined;
  }

  return undefined;
};

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

/** Rebuild UI messages from persisted nessi-core StoreEntry format. */
const loadMessages = async (chatId: string): Promise<UIMessage[]> => {
  const entries = await loadPersistedEntries(chatId);

  const toolResults = new Map<string, { result: unknown; isError?: boolean }>();
  for (const entry of entries) {
    if (entry.kind === "summary") continue;
    const message = entry.message;
    if (message.role === "tool_result" && message.callId) {
      toolResults.set(message.callId, { result: message.result, isError: message.isError });
    }
  }

  const messages: UIMessage[] = [];
  let lastUserTimestamp: string | undefined;
  for (const entry of entries) {
    if (entry.kind === "summary") {
      const summaryText = summaryTextFromEntry(entry);
      if (summaryText) {
        messages.push({
          id: msgId(),
          role: "assistant",
          blocks: [{
            type: "compaction",
            title: "Checkpoint summary",
            message: "Older history was condensed into a checkpoint summary.",
            sessionName: "main",
            applied: true,
            reason: "stop",
            summaryPreview: compactPreview(summaryText),
          }],
          meta: {
            entrySeq: entry.seq,
            timestamp: entry.createdAt,
          },
        });
      }
      continue;
    }
    const message = entry.message;

    if (message.role === "user") {
      const fileParts = (await fileMetasForMessage(chatId, entry.seq)).map((file) => ({
        type: "file" as const,
        fileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      }));
      messages.push({
        id: msgId(),
        role: "user",
        content: [...contentPartsToUIContent(message.content), ...fileParts],
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
};

const textPart = (text: string): ContentPart => ({ type: "text", text });

const MAX_IMAGES_PER_MESSAGE = 6;

type Runtime = {
  store: SessionStore;
  tools: Tool[];
  compactFn: CompactFn;
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
}) => {
  const [state, setState] = createStore<ChatState>({ messages: [], streaming: false });
  const [pendingImages, setPendingImages] = createSignal<Array<Extract<UIUserContentPart, { type: "image" }>>>([]);
  const [pendingFiles, setPendingFiles] = createSignal<PendingChatFile[]>([]);
  const [inputFiles, setInputFiles] = createSignal<ChatFileMeta[]>([]);
  const [outputFiles, setOutputFiles] = createSignal<ChatFileMeta[]>([]);
  const [filesModalOpen, setFilesModalOpen] = createSignal(false);
  const [nextcloudBrowserOpen, setNextcloudBrowserOpen] = createSignal(false);
  const [nextcloudRefs, setNextcloudRefs] = createSignal<NextcloudRef[]>([]);
  const [githubBrowserOpen, setGitHubBrowserOpen] = createSignal(false);
  const [terminalOpen, setTerminalOpen] = createSignal(false);
  const [githubRefs, setGitHubRefs] = createSignal<GitHubRef[]>([]);
  const { isDragging: dropActive, handlers: dropHandlers } = dropzone.create({
    onDrop: (files) => void addPendingFiles(files),
  });

  let runtime: Runtime | null = null;
  let activeLoop: NessiLoop | null = null;
  let currentAssistantStartedAt: string | undefined;
  let pendingAutoCompactionEntriesBefore: number | null = null;
  let resetVersion = 0;
  let attentionFeedbackSentForTurn = false;
  let streamFeedbackStartedForTurn = false;
  let lastStreamFeedbackAt = 0;
  let streamedCharsSinceFeedback = 0;

  let assistantIdx = -1;
  const toolBlockIndices = new Map<string, { idx: number; name: string }>();
  const surveyBlockIndices = new Map<string, number>();
  const approvalBlockIndices = new Map<string, number>();

  const clearPendingCallMappings = () => {
    toolBlockIndices.clear();
    surveyBlockIndices.clear();
    approvalBlockIndices.clear();
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
      const bashRuntime = createMainBashRuntime({
        initialFiles,
        fileService,
        afterExec: async (bash) => {
          await syncRuntimeOutputs(props.chatId, bash);
        },
      });
      runtime = {
        store: persistentSessionStore(props.chatId),
        tools: bashRuntime.tools,
        compactFn: createDefaultCompactFn({
          minMessages: settings.autoCompactAfterMessages,
          keepRecentLoops: settings.keepRecentLoops,
          maxToolChars: settings.maxToolChars,
          maxSourceChars: settings.maxSourceChars,
          compactionPrompt: await getCompactionPrompt(),
        }),
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
    const images = incoming.filter((file) => file.type.startsWith("image/"));
    const documents = incoming
      .map((file) => {
        const pending = classifyPendingChatFile(file);
        if (pending && file.webkitRelativePath) {
          pending.relativePath = file.webkitRelativePath;
        }
        return pending;
      })
      .filter((file): file is PendingChatFile => Boolean(file));

    const unsupportedCount = incoming.length - images.length - documents.length;
    if (unsupportedCount > 0) {
      appendStatusMessage("Some files were ignored. Only images, text/code files, CSV/XLSX spreadsheets, and PDFs are supported.");
    }

    if (documents.length > 0) {
      setPendingFiles((current) => [...current, ...documents]);
    }

    if (images.length === 0) return;
    if (!providerSupportsImages()) {
      appendStatusMessage("The active provider does not support image inputs.");
      return;
    }

    const remainingSlots = Math.max(0, MAX_IMAGES_PER_MESSAGE - pendingImages().length);
    if (remainingSlots === 0) {
      appendStatusMessage(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`);
      return;
    }

    const nextImages = images.slice(0, remainingSlots);
    if (nextImages.length < images.length) {
      appendStatusMessage(`Only the first ${MAX_IMAGES_PER_MESSAGE} images are attached.`);
    }

    try {
      const prepared = await Promise.all(nextImages.map(prepareImageUpload));
      setPendingImages((current) => [...current, ...prepared]);
    } catch (error) {
      appendStatusMessage(error instanceof Error ? error.message : String(error));
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

    if (action === "always") await setAlwaysAllowed(toolEntry.name);
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

    const blockIdx = surveyBlockIndices.get(callId);
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

          if (await isAlwaysAllowed(event.name)) {
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
          const args = event.args as { title?: string; questions?: string | Array<{ question: string; options: string[] }> };
          const questions = typeof args.questions === "string"
            ? parseSurveyQuestions(args.questions)
            : Array.isArray(args.questions) ? args.questions : [];
          if (questions.length === 0) {
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
            break;
          }
          const idx = appendBlock({
            type: "survey",
            callId: event.callId,
            title: args.title,
            questions,
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
        // Update meta with latest model/usage info, but do NOT close the
        // streaming message or fire notifications — the loop may continue
        // with another turn (tool_call → execution → next provider call).
        const persistedAssistant = [...await loadPersistedEntries(props.chatId)]
          .reverse()
          .find((entry) => entry.kind === "message" && entry.message.role === "assistant");
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
        haptics.error();
        appendStatusMessage(`Error: ${event.error}`);
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
        break;
      }

      case "compaction_end": {
        try {
          const entriesAfter = await runtime?.store.load();
          const afterCount = entriesAfter?.length;
          const summaryPreview = entriesAfter ? summaryPreviewFromEntries(entriesAfter) : undefined;
          const reduced = typeof afterCount === "number" && typeof pendingAutoCompactionEntriesBefore === "number"
            ? Math.max(0, pendingAutoCompactionEntriesBefore - afterCount)
            : undefined;

          appendCompactionBlock({
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
          appendCompactionBlock({
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
      haptics.error();
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
    } finally {
      runtime = null;
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

    await ensureChatMeta(props.chatId, uiContentText(content) || attachedFiles[0]?.name || images[0]?.name || "Files chat");
    clearPendingCallMappings();
    assistantIdx = -1;
    setPendingImages([]);
    setPendingFiles([]);
    setNextcloudRefs([]);
    setGitHubRefs([]);
    setState("streaming", true);

    const store = createProviderContextStore(ensured.runtime.store, await latestPersistedSeq());
    const prompt = await resolvePrompt(await getActivePrompt(), {
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
    });

    activeLoop = loop;

    try {
      for await (const event of loop) {
        await handleNessiEvent(event);
      }
    } catch (error) {
      haptics.error();
      appendStatusMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
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
