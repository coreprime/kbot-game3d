# examples

Standalone consumer proofs for the published `@coreprime/kbot-game3d`
package. Each installs the artifact as a downstream project would and
exercises it in a headless browser. Neither is part of the package's
gated CI — they exist to verify the published tarball is consumable.

- **consume-game3d** — bundles the package and drives `createWorld`
  directly, asserting the renderer produces a frame.

  ```sh
  cd consume-game3d && npm install && npm test
  ```

- **consume-pack** — serves a static `kbot pack` extraction over HTTP and
  drives it through `HttpPackProvider` + `createWorld`, proving the
  pack → renderer path with no studio server. Point it at a pack
  directory produced by `kbot pack <install> <dir>`:

  ```sh
  cd consume-pack && npm install
  PACK_DIR=/path/to/pack npm test
  ```

Both need `@coreprime`-scope registry auth to install, and download a
Chromium via Playwright on first run.
