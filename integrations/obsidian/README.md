# Obsidian companion

This desktop plugin syncs selected private ThyncSpace documents into a named vault folder. It supports reviewed two-way Markdown changes and optional linked-file downloads. Shared documents and boards remain in the web workspace. Calculator state is never included.

## Install and connect

1. Use Obsidian desktop 1.11.4 or later. Create `.obsidian/plugins/thyncspace-companion` inside your chosen vault.
2. In ThyncSpace, open Commands > Obsidian companion > Install the companion. Download main.js and manifest.json into that folder. Reload Obsidian and enable ThyncSpace companion in Community plugins.
3. Create a named connection in ThyncSpace. Select up to 50 private documents, optionally allow linked-file downloads, and confirm access. Copy the token while it is shown.
4. In the Obsidian plugin settings, add/select the token through Secret Storage. Enter your backend HTTPS origin, without an API path. HTTP is accepted only for loopback development.
5. Choose a named vault folder, connect, select granted documents, and review the first download. Enable automatic sync only after reviewing each selected document.

The build copies these two files into the frontend's public download directory. There is no community-store installation or mobile support in this release. [Secret Storage](https://docs.obsidian.md/plugins/guides/secret-storage) keeps the credential separate from plugin settings. Device-specific settings and sync baselines use Obsidian local storage, so syncing the vault to another device does not copy that device's conflict history. This does not claim operating-system encryption.

## Editing and conflicts

The command Review selected document changes compares saved local and server copies against this device's last successful sync. Initial downloads, conflicting edits and missing local files need review. You can keep either copy after inspecting both. Changes since the preview stop the write. The plugin waits for pending editor text to save and requires a local document tab to be closed before replacing it from the server. Local writes use [Vault.process](https://docs.obsidian.md/Plugins/Vault) to check the current file again.

Renaming or moving a file within the selected folder keeps its note identity. Edit thyncspace_sync_title in its frontmatter to change the server title. Keep the reserved thyncspace_sync_ fields intact. Duplicate IDs stop sync. Deletions are never propagated. A deleted, shared, archived or inaccessible server note leaves its local copy in place.

Optional automatic sync checks every five minutes while Obsidian is running. It updates previously reviewed copies and pauses on errors. Conflicts and missing files still need manual review. Server writes carry the saved revision; other people's changes cannot be silently overwritten. Failed local storage prevents automatic sync from continuing.

## Linked files

When allowed by the connection, linked PNG/JPEG/WebP, PDF and UTF-8 text files download into the chosen folder's Attachments subfolder. IDs and checksums determine filenames; downloaded bytes are checked. Exact, unambiguous filename links in Markdown and wiki syntax point to these local copies, and return to the original filename on upload. Inline/fenced code, external URLs, ambiguous names and unmatched relative paths remain unchanged. The settings list also opens each downloaded file.

Locally edited attachments are preserved and are not uploaded. Add replacements through the ThyncSpace attachment library. Unlinking or disconnecting keeps downloaded files. Review links manually when a document uses a path that does not match an attachment filename.

## Limits and access

Connections expire after 30 days, with five connections per account. The server stores only token hashes. Revocation and password changes invalidate access. Tokens allow only the selected, currently private documents and optional linked-file reads. They cannot create/delete notes, change sharing, or access account settings. Native requests reject redirects and stop after 30 seconds.

Each document has a 1 MiB canonical-content limit. Local Markdown with expanded attachment paths is capped at 4 MiB. The folder scan allows 1,000 Markdown files. Downloads allow 100 files / 50 MiB per note, with 2 MiB per file. Choosing a smaller sync set helps stay within API rate limits.

Disconnect revokes the token when online and keeps all local files. If offline, revoke it from ThyncSpace when connected again. Obsidian Secret Storage entries are not deleted because other plugin configurations may reference them.

## Validation

Run node --test test/obsidianCompanion.test.cjs from the frontend for sync races, device isolation, lost receipts, pending editor buffers, path mapping, storage failures and actual loopback HTTP transport. npm run test:companion exercises web setup, one-time token display, downloads, revocation and 320/390/1440px layouts. Backend integration tests use a disposable MongoDB replica set for scope, concurrent revisions, history, revocation, credential changes, expiry and connection limits. The native Obsidian application has not been exercised in this environment; its Vault, local storage and Secret Storage interfaces follow the official API contract.
