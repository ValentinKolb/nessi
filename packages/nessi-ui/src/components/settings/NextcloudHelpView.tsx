/** Step-by-step guide for creating a Nextcloud app password and configuring CORS. */
export const NextcloudHelpView = () => (
  <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3 space-y-4">
    <p class="text-xs text-gh-fg-muted">
      nessi needs your Nextcloud <strong>server URL</strong>, <strong>username</strong>, and an <strong>app password</strong> to access your files and calendar.
      Additionally, your server must allow CORS requests from nessi.
    </p>

    <div class="space-y-3">
      <div class="ui-subpanel p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-5 h-5 rounded-full bg-gh-fg text-gh-surface text-[10px] font-bold flex items-center justify-center">1</span>
          <span class="text-xs font-medium text-gh-fg-secondary">Create an app password</span>
        </div>
        <div class="text-[11px] text-gh-fg-muted ml-7 space-y-1">
          <p>Log in to your Nextcloud, then go to:</p>
          <p><strong>Settings → Security → Devices & sessions</strong></p>
          <p>Enter a name (e.g. <code class="bg-gh-overlay px-1 rounded">nessi</code>) and click <strong>"Create new app password"</strong>.</p>
          <p>Copy the generated password — you won't see it again.</p>
        </div>
      </div>

      <div class="ui-subpanel p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-5 h-5 rounded-full bg-gh-fg text-gh-surface text-[10px] font-bold flex items-center justify-center">2</span>
          <span class="text-xs font-medium text-gh-fg-secondary">Ask your admin to allow CORS</span>
        </div>
        <div class="text-[11px] text-gh-fg-muted ml-7 space-y-1">
          <p>Your Nextcloud server needs to allow requests from <code class="bg-gh-overlay px-1 rounded">https://nessi.sh</code>. If you're not the server admin, share these instructions with them.</p>
          <p>Add this to the <strong>Apache VirtualHost</strong> config (e.g. <code class="bg-gh-overlay px-1 rounded">/etc/httpd/conf.d/nextcloud-le-ssl.conf</code>):</p>
          <pre class="mt-1 p-2 bg-gh-overlay rounded text-[10px] overflow-x-auto whitespace-pre">
{`# Origin matching
SetEnvIf Origin "^https://nessi\\.sh$" CORS_ORIGIN=$0

# WebDAV / CalDAV
<LocationMatch "^/remote\\.php/dav">
  Header always merge Access-Control-Allow-Origin "%{CORS_ORIGIN}e" env=CORS_ORIGIN
  Header always merge Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PROPFIND, MKCOL, REPORT, OPTIONS" env=CORS_ORIGIN
  Header always merge Access-Control-Allow-Headers "Authorization, Content-Type, Depth, OCS-APIRequest" env=CORS_ORIGIN
  Header always merge Access-Control-Allow-Credentials "true" env=CORS_ORIGIN
</LocationMatch>

# OCS API (Talk, etc.)
<LocationMatch "^/ocs/">
  Header always merge Access-Control-Allow-Origin "%{CORS_ORIGIN}e" env=CORS_ORIGIN
  Header always merge Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" env=CORS_ORIGIN
  Header always merge Access-Control-Allow-Headers "Authorization, Content-Type, OCS-APIRequest" env=CORS_ORIGIN
  Header always merge Access-Control-Allow-Credentials "true" env=CORS_ORIGIN
</LocationMatch>

# Preflight (only for CORS origins)
RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteCond %{ENV:CORS_ORIGIN} .+
RewriteRule ^(.*)$ $1 [R=204,L]`}
          </pre>
          <p class="mt-1">Then reload: <code class="bg-gh-overlay px-1 rounded">sudo systemctl reload httpd</code> (or <code class="bg-gh-overlay px-1 rounded">apache2</code>)</p>
          <p class="mt-1">Key: uses <code class="bg-gh-overlay px-1 rounded">merge</code> instead of <code class="bg-gh-overlay px-1 rounded">set</code> to avoid breaking Nextcloud's own headers.</p>
        </div>
      </div>

      <div class="ui-subpanel p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-5 h-5 rounded-full bg-gh-fg text-gh-surface text-[10px] font-bold flex items-center justify-center">3</span>
          <span class="text-xs font-medium text-gh-fg-secondary">Enter credentials here</span>
        </div>
        <p class="text-[11px] text-gh-fg-muted ml-7">
          Go back to Settings → API Keys, fill in your <strong>server URL</strong> (e.g. <code class="bg-gh-overlay px-1 rounded">https://cloud.example.com</code>), <strong>username</strong>, and the <strong>app password</strong> you just created.
        </p>
      </div>
    </div>

    <div class="ui-note text-[11px]">
      <strong>Security:</strong> The app password is stored in your browser's localStorage and sent directly to your Nextcloud server over HTTPS. You can revoke it anytime in Nextcloud under Settings → Security.
    </div>
  </div>
);
