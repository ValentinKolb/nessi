import { createEffect, createSignal, on, Show, For, onCleanup } from "solid-js";
import { timed } from "@valentinkolb/stdlib/solid";
import { githubApi, type GitHubRef } from "../../lib/github.js";
import { getFileIcon } from "../../lib/file-icons.js";
import { pprintBytes, formatDateTimeRelative } from "@valentinkolb/stdlib";
import { haptics } from "../../shared/browser/haptics.js";

/* ------------------------------------------------------------------ */
/*  API response types                                                */
/* ------------------------------------------------------------------ */

type RepoInfo = {
  full_name: string;
  name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  default_branch: string;
  private: boolean;
  owner: { login: string; avatar_url: string };
};

type RepoFile = { name: string; path: string; type: "file" | "dir"; size: number };

type Issue = {
  number: number;
  title: string;
  state: string;
  labels: { name: string }[];
  user: { login: string };
  comments: number;
  pull_request?: unknown;
};

type PullRequest = {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  user: { login: string };
  head: { ref: string };
  base: { ref: string };
  merged_at: string | null;
};

type Tab = "files" | "issues" | "prs";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const OWNER_REPO_RE = /^[^/\s]+\/[^/\s]+$/;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const GitHubBrowserModal = (props: {
  open: boolean;
  onClose: () => void;
  onSelect: (refs: GitHubRef[]) => void;
}) => {
  /* ---- signals ---- */

  // Repo picker
  const [query, setQuery] = createSignal("");
  const [userRepos, setUserRepos] = createSignal<RepoInfo[]>([]);
  const [searchResults, setSearchResults] = createSignal<RepoInfo[]>([]);
  const [reposLoading, setReposLoading] = createSignal(false);

  // Repo browser (when a repo is selected)
  const [activeRepo, setActiveRepo] = createSignal<RepoInfo | null>(null);
  const [activeTab, setActiveTab] = createSignal<Tab>("files");
  const [selected, setSelected] = createSignal<Map<string, GitHubRef>>(new Map());
  const [contentLoading, setContentLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Files
  const [currentPath, setCurrentPath] = createSignal("");
  const [files, setFiles] = createSignal<RepoFile[]>([]);

  // Issues + PRs
  const [issues, setIssues] = createSignal<Issue[]>([]);
  const [prs, setPrs] = createSignal<PullRequest[]>([]);

  const selectedCount = () => selected().size;

  /* ---- debounced search ---- */

  const { debouncedFn: debouncedSearch, cancel: cancelSearch } = timed.debounce(
    (q: string) => void searchRepos(q), 350,
  );

  const handleSearchInput = (value: string) => {
    setQuery(value);
    cancelSearch();
    const trimmed = value.trim();

    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    debouncedSearch(trimmed);
  };

  const searchRepos = async (q: string) => {
    setReposLoading(true);
    try {
      if (OWNER_REPO_RE.test(q)) {
        // Direct repo lookup
        try {
          const repo = (await githubApi.fetch(`/repos/${q}`)) as RepoInfo;
          setSearchResults([repo]);
          return;
        } catch {
          /* fall through to search */
        }
      }
      const data = (await githubApi.fetch(
        `/search/repositories?q=${encodeURIComponent(q)}&per_page=20&sort=updated`,
      )) as { items: RepoInfo[] };
      setSearchResults(data.items ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setReposLoading(false);
    }
  };

  /* ---- lifecycle ---- */

  const loadUserRepos = async () => {
    setReposLoading(true);
    try {
      const data = (await githubApi.fetch(
        "/user/repos?sort=updated&per_page=30&affiliation=owner",
      )) as RepoInfo[];
      setUserRepos(data);
    } catch {
      setUserRepos([]);
    } finally {
      setReposLoading(false);
    }
  };

  createEffect(
    on(
      () => props.open,
      (isOpen) => {
        if (isOpen) {
          // Reset everything
          setQuery("");
          setSearchResults([]);
          setActiveRepo(null);
          setActiveTab("files");
          setSelected(new Map());
          setCurrentPath("");
          setFiles([]);
          setIssues([]);
          setPrs([]);
          setError(null);
          // Load user's repos immediately
          void loadUserRepos();
        }
      },
    ),
  );

  /* ---- repo selection ---- */

  const selectRepo = async (repo: RepoInfo) => {
    haptics.tap();
    setActiveRepo(repo);
    setActiveTab("files");
    setError(null);
    setFiles([]);
    setIssues([]);
    setPrs([]);
    setCurrentPath("");
    await loadFiles(repo.full_name, "");
  };

  const goBackToRepos = () => {
    haptics.tap();
    setActiveRepo(null);
    setError(null);
  };

  /* ---- content loading ---- */

  const loadFiles = async (repo: string, path: string) => {
    setContentLoading(true);
    setError(null);
    try {
      const apiPath = path ? `/repos/${repo}/contents/${path}` : `/repos/${repo}/contents`;
      const data = (await githubApi.fetch(apiPath)) as RepoFile[];
      setFiles(Array.isArray(data) ? data : []);
      setCurrentPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setContentLoading(false);
    }
  };

  const loadIssues = async () => {
    const repo = activeRepo();
    if (!repo) return;
    setContentLoading(true);
    setError(null);
    try {
      const data = (await githubApi.fetch(
        `/repos/${repo.full_name}/issues?state=open&per_page=50&sort=updated`,
      )) as Issue[];
      setIssues(data.filter((i) => !i.pull_request));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load issues");
    } finally {
      setContentLoading(false);
    }
  };

  const loadPRs = async () => {
    const repo = activeRepo();
    if (!repo) return;
    setContentLoading(true);
    setError(null);
    try {
      const data = (await githubApi.fetch(
        `/repos/${repo.full_name}/pulls?state=open&per_page=50&sort=updated`,
      )) as PullRequest[];
      setPrs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pull requests");
    } finally {
      setContentLoading(false);
    }
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setError(null);
    const repo = activeRepo();
    if (!repo) return;
    if (tab === "files" && files().length === 0) void loadFiles(repo.full_name, "");
    if (tab === "issues" && issues().length === 0) void loadIssues();
    if (tab === "prs" && prs().length === 0) void loadPRs();
  };

  /* ---- selection ---- */

  const toggle = (key: string, ref: GitHubRef) => {
    haptics.tap();
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, ref);
      return next;
    });
  };

  const toggleFile = (file: RepoFile) => {
    const repo = activeRepo()!;
    toggle(`file:${repo.full_name}:${file.path}`, {
      id: crypto.randomUUID(),
      kind: file.type === "dir" ? "dir" : "file",
      repo: repo.full_name,
      path: file.path,
      ref: repo.default_branch,
      title: file.name,
    });
  };

  const toggleIssue = (issue: Issue) => {
    const repo = activeRepo()!;
    toggle(`issue:${repo.full_name}:${issue.number}`, {
      id: crypto.randomUUID(),
      kind: "issue",
      repo: repo.full_name,
      number: issue.number,
      title: `#${issue.number} ${issue.title}`,
      state: issue.state,
    });
  };

  const togglePR = (pr: PullRequest) => {
    const repo = activeRepo()!;
    toggle(`pr:${repo.full_name}:${pr.number}`, {
      id: crypto.randomUUID(),
      kind: "pr",
      repo: repo.full_name,
      number: pr.number,
      title: `#${pr.number} ${pr.title}`,
      state: pr.merged_at ? "merged" : pr.draft ? "draft" : pr.state,
    });
  };

  const isFileSelected = (f: RepoFile) => selected().has(`file:${activeRepo()?.full_name}:${f.path}`);
  const isIssueSelected = (i: Issue) => selected().has(`issue:${activeRepo()?.full_name}:${i.number}`);
  const isPRSelected = (p: PullRequest) => selected().has(`pr:${activeRepo()?.full_name}:${p.number}`);

  const confirmSelection = () => {
    haptics.success();
    props.onSelect([...selected().values()]);
  };

  /* ---- derived ---- */

  const visibleRepos = () => (query().trim() ? searchResults() : userRepos());

  const breadcrumbs = () => {
    const repo = activeRepo();
    if (!repo) return [];
    const parts = currentPath().split("/").filter(Boolean);
    return [
      { name: repo.name, path: "" },
      ...parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") })),
    ];
  };

  const sortedFiles = () =>
    [...files()].sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  /* ---- shared sub-components ---- */

  const SelectIcon = (p: { selected: boolean; icon: string }) => (
    <span class="w-3.5 shrink-0 flex items-center justify-center">
      <Show
        when={p.selected}
        fallback={
          <>
            <span class={`i ti ${p.icon} text-[13px] text-gh-fg-subtle group-hover:hidden`} />
            <span class="i ti ti-square text-[13px] text-gh-accent hidden group-hover:inline" />
          </>
        }
      >
        <span class="i ti ti-check text-[13px] text-gh-accent group-hover:hidden" />
        <span class="i ti ti-square-check text-[13px] text-gh-accent hidden group-hover:inline" />
      </Show>
    </span>
  );

  const TABS: { id: Tab; label: string }[] = [
    { id: "files", label: "Files" },
    { id: "issues", label: "Issues" },
    { id: "prs", label: "Pull Requests" },
  ];

  /* ================================================================== */
  /*  Render                                                            */
  /* ================================================================== */

  return (
    <Show when={props.open}>
      <div class="modal-backdrop" onClick={() => { haptics.tap(); props.onClose(); }}>
        <div
          class="modal-panel w-[min(520px,94vw)] h-[min(560px,80vh)] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ─── Header ─── */}
          <div class="flex items-center gap-2 px-3 py-2.5 shrink-0">
            <Show when={activeRepo()}>
              <button
                class="flex h-6 w-6 items-center justify-center rounded-md nav-icon"
                onClick={goBackToRepos}
              >
                <span class="i ti ti-arrow-left text-sm" />
              </button>
            </Show>
            <span class="i ti ti-brand-github text-gh-fg-subtle" />
            <span class="flex-1 text-[13px] font-semibold text-gh-fg truncate">
              {activeRepo() ? activeRepo()!.full_name : "GitHub"}
            </span>
            <button
              class="flex h-6 w-6 items-center justify-center rounded-md nav-icon"
              onClick={() => { haptics.tap(); props.onClose(); }}
            >
              <span class="i ti ti-x text-sm" />
            </button>
          </div>

          {/* ─── Repo picker phase ─── */}
          <Show when={!activeRepo()}>
            {/* Search input */}
            <div class="px-1 pb-2 shrink-0">
              <div class="relative mx-2">
                <span class="i ti ti-search text-[13px] text-gh-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  class="w-full bg-gh-canvas border border-gh-border rounded-md pl-8 pr-3 py-1.5 text-[13px] text-gh-fg placeholder:text-gh-fg-subtle focus:outline-none focus:border-gh-accent"
                  placeholder="Search repositories…"
                  value={query()}
                  onInput={(e) => handleSearchInput(e.currentTarget.value)}
                />
              </div>
            </div>

            {/* Repo list */}
            <div class="flex-1 overflow-y-auto hide-scrollbar px-1">
              <Show when={reposLoading() && visibleRepos().length === 0}>
                <div class="px-3 py-8 text-center text-[13px] text-gh-fg-subtle">Loading…</div>
              </Show>

              <Show when={!reposLoading() && visibleRepos().length === 0 && query().trim()}>
                <div class="px-3 py-8 text-center text-[13px] text-gh-fg-subtle">No repositories found</div>
              </Show>

              <Show when={!reposLoading() && visibleRepos().length === 0 && !query().trim()}>
                <div class="px-3 py-8 text-center text-[13px] text-gh-fg-subtle">No repositories</div>
              </Show>

              <For each={visibleRepos()}>
                {(repo) => (
                  <button
                    class="w-full flex items-start gap-2.5 py-2 px-3 text-[13px] rounded-md hover:bg-gh-overlay transition-colors text-left"
                    onClick={() => void selectRepo(repo)}
                  >
                    <img
                      src={repo.owner.avatar_url}
                      alt=""
                      class="w-5 h-5 rounded-full mt-0.5 shrink-0"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span class="text-gh-fg font-medium truncate">{repo.full_name}</span>
                        <Show when={repo.private}>
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full border border-gh-border-muted text-gh-fg-subtle shrink-0">
                            private
                          </span>
                        </Show>
                      </div>
                      <Show when={repo.description}>
                        <div class="text-[12px] text-gh-fg-subtle truncate mt-0.5">{repo.description}</div>
                      </Show>
                      <div class="flex items-center gap-3 mt-0.5 text-[11px] text-gh-fg-subtle">
                        <Show when={repo.language}>
                          <span>{repo.language}</span>
                        </Show>
                        <Show when={repo.stargazers_count > 0}>
                          <span class="flex items-center gap-0.5">
                            <span class="i ti ti-star text-[10px]" />
                            {repo.stargazers_count}
                          </span>
                        </Show>
                        <span>{formatDateTimeRelative(repo.updated_at)}</span>
                      </div>
                    </div>
                    <span class="i ti ti-chevron-right text-[12px] text-gh-fg-subtle mt-1 shrink-0" />
                  </button>
                )}
              </For>
            </div>
          </Show>

          {/* ─── Repo browser phase ─── */}
          <Show when={activeRepo()}>
            {/* Tabs */}
            <div class="flex gap-0 px-3 border-b border-gh-border-muted shrink-0">
              <For each={TABS}>
                {(tab) => (
                  <button
                    class={`px-3 py-1.5 text-[12px] transition-colors border-b-2 ${
                      activeTab() === tab.id
                        ? "border-gh-accent text-gh-fg font-medium"
                        : "border-transparent text-gh-fg-subtle hover:text-gh-fg-muted"
                    }`}
                    onClick={() => switchTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                )}
              </For>
            </div>

            {/* Content */}
            <div class="flex-1 overflow-y-auto hide-scrollbar px-1">
              <Show when={contentLoading()}>
                <div class="px-3 py-8 text-center text-[13px] text-gh-fg-subtle">Loading…</div>
              </Show>

              <Show when={error()}>
                <div class="px-3 py-8 text-center text-[13px] text-gh-danger">{error()}</div>
              </Show>

              <Show when={!contentLoading() && !error()}>
                {/* ─── Files ─── */}
                <Show when={activeTab() === "files"}>
                  <div class="flex items-center gap-1 px-3 py-2 text-[12px] flex-wrap">
                    <For each={breadcrumbs()}>
                      {(crumb, i) => (
                        <>
                          <Show when={i() > 0}>
                            <span class="text-gh-fg-subtle select-none">/</span>
                          </Show>
                          <button
                            class="text-gh-fg-muted hover:text-gh-accent transition-colors truncate max-w-[140px]"
                            onClick={() => { haptics.tap(); void loadFiles(activeRepo()!.full_name, crumb.path); }}
                          >
                            {crumb.name}
                          </button>
                        </>
                      )}
                    </For>
                  </div>

                  <Show when={sortedFiles().length === 0}>
                    <div class="px-3 py-8 text-center text-[13px] text-gh-fg-subtle">Empty directory</div>
                  </Show>

                  <For each={sortedFiles()}>
                    {(file) => (
                      <Show
                        when={file.type === "dir"}
                        fallback={
                          <button
                            class="group w-full flex items-center gap-2 py-1.5 px-3 text-[13px] rounded-md hover:bg-gh-overlay transition-colors text-left"
                            onClick={() => toggleFile(file)}
                          >
                            <SelectIcon selected={isFileSelected(file)} icon={getFileIcon(file.name)} />
                            <span class="text-gh-fg-muted min-w-0 truncate flex-1">{file.name}</span>
                            <span class="text-[11px] text-gh-fg-subtle shrink-0 tabular-nums">
                              {pprintBytes(file.size)}
                            </span>
                          </button>
                        }
                      >
                        <div class="group flex items-center gap-2 py-1.5 px-3 text-[13px] rounded-md hover:bg-gh-overlay transition-colors">
                          <button class="shrink-0" onClick={() => toggleFile(file)}>
                            <SelectIcon selected={isFileSelected(file)} icon="ti-folder" />
                          </button>
                          <button
                            class="text-gh-fg-muted hover:text-gh-fg min-w-0 truncate text-left flex-1"
                            onClick={() => { haptics.tap(); void loadFiles(activeRepo()!.full_name, file.path); }}
                          >
                            {file.name}
                          </button>
                        </div>
                      </Show>
                    )}
                  </For>
                </Show>

                {/* ─── Issues ─── */}
                <Show when={activeTab() === "issues"}>
                  <Show when={issues().length === 0}>
                    <div class="px-3 py-8 text-center text-[13px] text-gh-fg-subtle">No open issues</div>
                  </Show>

                  <For each={issues()}>
                    {(issue) => (
                      <button
                        class="group w-full flex items-center gap-2 py-2 px-3 text-[13px] rounded-md hover:bg-gh-overlay transition-colors text-left"
                        onClick={() => toggleIssue(issue)}
                      >
                        <SelectIcon selected={isIssueSelected(issue)} icon="ti-circle-dot" />
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-1.5">
                            <span class="text-gh-fg-subtle text-[12px] shrink-0">#{issue.number}</span>
                            <span class="text-gh-fg-muted truncate">{issue.title}</span>
                          </div>
                          <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-[11px] text-gh-fg-subtle">{issue.user.login}</span>
                            <Show when={issue.comments > 0}>
                              <span class="flex items-center gap-0.5 text-[11px] text-gh-fg-subtle">
                                <span class="i ti ti-message text-[10px]" />
                                {issue.comments}
                              </span>
                            </Show>
                            <For each={issue.labels.slice(0, 3)}>
                              {(label) => (
                                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gh-muted text-gh-fg-subtle">
                                  {label.name}
                                </span>
                              )}
                            </For>
                          </div>
                        </div>
                      </button>
                    )}
                  </For>
                </Show>

                {/* ─── PRs ─── */}
                <Show when={activeTab() === "prs"}>
                  <Show when={prs().length === 0}>
                    <div class="px-3 py-8 text-center text-[13px] text-gh-fg-subtle">No open pull requests</div>
                  </Show>

                  <For each={prs()}>
                    {(pr) => (
                      <button
                        class="group w-full flex items-center gap-2 py-2 px-3 text-[13px] rounded-md hover:bg-gh-overlay transition-colors text-left"
                        onClick={() => togglePR(pr)}
                      >
                        <SelectIcon selected={isPRSelected(pr)} icon="ti-git-pull-request" />
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-1.5">
                            <span class="text-gh-fg-subtle text-[12px] shrink-0">#{pr.number}</span>
                            <span class="text-gh-fg-muted truncate">{pr.title}</span>
                            <Show when={pr.draft}>
                              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gh-muted text-gh-fg-subtle">
                                draft
                              </span>
                            </Show>
                          </div>
                          <div class="flex items-center gap-2 mt-0.5 text-[11px] text-gh-fg-subtle">
                            <span>{pr.user.login}</span>
                            <span>
                              {pr.head.ref} → {pr.base.ref}
                            </span>
                          </div>
                        </div>
                      </button>
                    )}
                  </For>
                </Show>
              </Show>
            </div>
          </Show>

          {/* ─── Footer ─── */}
          <div class="border-t border-gh-border-muted px-3 py-2 shrink-0 flex items-center justify-end gap-2">
            <button
              class="px-3 py-1.5 text-[12px] text-gh-fg-muted hover:text-gh-fg rounded-md hover:bg-gh-overlay transition-colors"
              onClick={() => { haptics.tap(); props.onClose(); }}
            >
              Cancel
            </button>
            <button
              class={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${
                selectedCount() > 0
                  ? "bg-gh-accent text-white hover:opacity-90"
                  : "bg-gh-muted text-gh-fg-subtle cursor-not-allowed"
              }`}
              disabled={selectedCount() === 0}
              onClick={confirmSelection}
            >
              Attach {selectedCount()} {selectedCount() === 1 ? "item" : "items"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
