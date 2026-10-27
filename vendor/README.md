# Reviewed local package candidates

These archives were built from the local package sources on 2026-10-19 and 2026-10-20. They are unpublished and pinned by path and SHA-512 integrity in package-lock.json. npm ci installs these bytes without fetching an unpublished version from the registry. No release tags were created for this refresh.

- sunaissu-calculator-1.1.0-rc.2.tgz
  SHA-256: e6c0c9bf0e2de40470d4c6cdc218aa6df899d6a9d75381c217a50a5f7a87b4d5
- sunaissu-document-editor-1.1.0-rc.5.tgz
  SHA-256: 4c0b21931efa619216fb5b4d6af24c64381ddfc6415823d60e74ff5458305dfd
- sunaissu-noteboard-3.0.0-rc.2.tgz
  SHA-256: ba2f80633047b2b95f270162bf2e12e96b1461b9c608a77d59fda3bfb263932c

All three packages expose scrollbar customization helpers. Noteboard leaves whole-board recovery to the host app and includes metadata validation plus PDF export dependencies. Its 3.0 release still requires coordinated Yjs text migration and updated clients. Keep the backend and frontend release candidates together.

The initial refresh passed each package's tests and build: calculator 19 tests, document editor 53, and Noteboard 96. The offline install added 27 packages for Noteboard's jspdf and svg2pdf.js dependency trees, with no cache misses or unrelated version changes.

Document editor rc.5 fixes collaboration caret movement, preserves active empty paragraphs and pending spaces during peer updates, and keeps unrelated Markdown normalization out of shared text edits. Its 80 tests and build passed. The offline install changed only this package; the frontend type check and all 51 unit tests passed. Seven browser tests with two accounts also passed, including four complete lines typed during concurrent editing and verified in both live views, saved content, and reloaded sessions.

Rebuild through each source package's npm test and npm pack, copy the archives here, update dependency paths, and refresh the lockfile with npm install --offline --ignore-scripts --no-audit --no-fund. Review the resulting archive checksums before committing. Do not edit an archive in place or reuse its version for different bytes.
