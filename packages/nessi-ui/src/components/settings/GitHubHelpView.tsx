/** Step-by-step guide for creating a GitHub Personal Access Token. */
export const GitHubHelpView = () => (
  <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3 space-y-4">
    <p class="text-xs text-gh-fg-muted">
      nessi needs a <strong>Personal Access Token (classic)</strong> to read your repositories, issues, and pull requests.
      The token is stored locally in your browser — it is never sent anywhere except to the GitHub API.
    </p>

    <div class="space-y-3">
      <div class="ui-subpanel p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-5 h-5 rounded-full bg-gh-fg text-gh-surface text-[10px] font-bold flex items-center justify-center">1</span>
          <span class="text-xs font-medium text-gh-fg-secondary">Open GitHub Token Settings</span>
        </div>
        <p class="text-[11px] text-gh-fg-muted ml-7">
          Go to{" "}
          <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">
            github.com/settings/tokens
          </a>
          {" "}and click <strong>"Generate new token (classic)"</strong>.
        </p>
      </div>

      <div class="ui-subpanel p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-5 h-5 rounded-full bg-gh-fg text-gh-surface text-[10px] font-bold flex items-center justify-center">2</span>
          <span class="text-xs font-medium text-gh-fg-secondary">Configure the token</span>
        </div>
        <div class="text-[11px] text-gh-fg-muted ml-7 space-y-1">
          <p><strong>Note:</strong> Enter something like <code class="bg-gh-overlay px-1 rounded">nessi</code></p>
          <p><strong>Expiration:</strong> Choose what you're comfortable with (90 days is a good default)</p>
          <p><strong>Scopes:</strong> Select these:</p>
          <div class="mt-1 ml-2 space-y-0.5 text-[10px]">
            <div class="flex items-center gap-1.5"><span class="i ti ti-check text-status-ok-fg text-xs" /><code class="bg-gh-overlay px-1 rounded">repo</code> — read repositories (public + private)</div>
            <div class="flex items-center gap-1.5"><span class="i ti ti-check text-status-ok-fg text-xs" /><code class="bg-gh-overlay px-1 rounded">read:org</code> — list organizations (optional)</div>
          </div>
          <p class="mt-1.5">For public repos only, <code class="bg-gh-overlay px-1 rounded">public_repo</code> is enough.</p>
        </div>
      </div>

      <div class="ui-subpanel p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-5 h-5 rounded-full bg-gh-fg text-gh-surface text-[10px] font-bold flex items-center justify-center">3</span>
          <span class="text-xs font-medium text-gh-fg-secondary">Generate and copy</span>
        </div>
        <p class="text-[11px] text-gh-fg-muted ml-7">
          Click <strong>"Generate token"</strong> at the bottom. Copy the token (starts with <code class="bg-gh-overlay px-1 rounded">ghp_</code>) — you won't be able to see it again.
        </p>
      </div>

      <div class="ui-subpanel p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-5 h-5 rounded-full bg-gh-fg text-gh-surface text-[10px] font-bold flex items-center justify-center">4</span>
          <span class="text-xs font-medium text-gh-fg-secondary">Paste it here</span>
        </div>
        <p class="text-[11px] text-gh-fg-muted ml-7">
          Go back to Settings → API Keys, paste the token into the GitHub field, and click save.
        </p>
      </div>
    </div>

    <div class="ui-note text-[11px]">
      <strong>Security note:</strong> The token is only stored in your browser's localStorage and sent directly to <code>api.github.com</code> over HTTPS. nessi has no server — your token never leaves your device.
    </div>
  </div>
);
