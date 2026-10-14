# Reviewed local package candidates

These archives are local, unpublished packages from release/2026-10-review. They are pinned by path and SHA-512 integrity in package-lock.json. npm ci installs the reviewed bytes without fetching an unpublished version from the registry.

- sunaissu-calculator-1.1.0-rc.1.tgz
  SHA-256: 9cf728a24cf433a2b7da14c86b446094a7ec119712e8a5f1b1d56a6268aa7a08
- sunaissu-document-editor-1.1.0-rc.1.tgz
  SHA-256: 81aa41c1dd63ab7aabf62769a2cfa316fed87f4dc997b8cd8369e6dcbcfda277
- sunaissu-noteboard-3.0.0-rc.1.tgz
  SHA-256: 1b479e94b182f10efcd4d360a1adf0dbc2d6f2f2395105d3c86f1400db620cb7

The source repositories carry local rc/2026-10-14.1 tags. See ../RELEASE.txt for migration and deployment gates. Noteboard 3.0 requires coordinated Yjs text migration and updated clients. Keep the backend and frontend release candidates together.

Rebuild through each source package's npm test and npm pack, copy the archives here, update dependency paths, and refresh the lockfile with npm install --offline --ignore-scripts --no-audit --no-fund. Review the resulting archive checksums before committing. Do not edit an archive in place or reuse its version for different bytes.
