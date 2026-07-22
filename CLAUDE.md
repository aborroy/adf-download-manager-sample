# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is a development harness for building the **ADF Download Manager**: a queue-based download/upload manager (pause, resume, retry, progress, ZIP packaging) for Alfresco Content Application (ACA), built to download **files of any size** reliably. This repository provides the **frontend deliverable only** (the ADF library, all UI + the download engine). The companion headless ACS repository addon (a streaming download endpoint) is a **separate project**, published at [alfresco-download-streaming-repo](https://github.com/aborroy/alfresco-download-streaming-repo), and is not part of this repository. Top-level pieces:

- **`adf-download-manager/`**: the standalone Angular library (the frontend deliverable). Publishable via `ng-packagr`.
- **`aca/`**: a full clone of [Alfresco Content App](https://github.com/Alfresco/alfresco-content-app) (Nx workspace, git repo on the `develop` branch). This is the **host application** used to run and test the library in a real ACA. The library is mirrored into `aca/projects/adf-download-manager/`.
- **`deployment/`**: a Docker Compose demo stack. It fetches the addon's prebuilt JAR from its [GitHub release](https://github.com/aborroy/alfresco-download-streaming-repo/releases) and bakes it into the ACS image; no local build of the addon is needed.

### Why a server-side addon exists: the ~1 GB ceiling (DevCon 2018 findings)

A stock single, un-ranged content download from ACS makes the repository allocate the whole file and **fails at ~1 GB**. This is empirically confirmed by the Alfresco DevCon 2018 talk *"Moving Gigantic Files In & Out of the Repository"* (Jeff Potts, Metaversant): an out-of-the-box single-file download **"Did Not Finish"** because *"Alfresco throws an exception at around 1 GB."* The talk's durable fix was **server-side** (its example used GridFTP/Globus parallel TCP streams + the Bulk FileSystem Import Tool, driven from a *separate* app). This project takes the server-side lesson but **keeps all control UI in ADF**:

- **Repository addon (preferred):** streams from the content store in bounded buffers, so the JVM heap stays flat at any size: the ceiling is defeated at the source. The frontend auto-detects it. Lives in the separate `alfresco-download-streaming-repo` repository.
- **Chunked `Range` download (fallback):** when the addon is absent, the engine downloads in sub-1 GB chunks (`chunkSizeBytes`, 64 MB) so each server allocation stays under the ceiling.
- **Parallelism** (the talk's throughput lever: GridFTP's parallel streams) maps to fetching multiple Range chunks concurrently. That is a **v2** option (`parallelChunksPerDownload`, default `1`); v1 is sequential and focuses on correctness.

### Two copies of the library: keep them in sync

`adf-download-manager/src` and `aca/projects/adf-download-manager/src` are byte-for-byte identical copies. **The copy under `aca/projects/adf-download-manager/` is the one that actually gets compiled and served** (see wiring below). When you change library code, edit it there to see it in the running app, and mirror the change back to the top-level `adf-download-manager/` so the deliverable stays current. The top-level directory is not under git; `aca/` is.

## Commands

All commands run from inside `aca/`. Use Node **24.x** (`aca/.nvmrc` pins `24.13.0`; the ACA README's "18.x" is stale for this version).

```sh
cd aca
nvm use                       # Node 24.13.0
npm install --legacy-peer-deps   # REQUIRED: ACA has a marked/ngx-markdown peer-dep clash; plain `npm install` fails

# Running: requires a .env file in aca/ with BASE_URL="<ACS server URL>"
npm start                     # nx serve content-ce on :4200, proxies to BASE_URL via app/proxy.conf.js

# Build
npm run build                 # nx build content-ce
npm run build.release         # production + release config

# Lint (host workspace only: see caveat below)
npm run lint                  # nx run-many --all --target=lint
npm run lintfix               # nx affected:lint --fix

# Tests (Karma + Jasmine)
nx test <project>             # e.g. nx test aca-content
nx test <project> -- --watch  # live-reload + coverage; reports in coverage/<project>
npm run ci:test               # all projects, ChromeHeadless, no watch
```

The library has no Nx project, so its `.spec.ts` files compile inline with `content-ce`. The pure-logic specs (`range-math`, `error-classifier`, `chunked-download.engine`, `memory.sink`, `probe.service`) run under the host's Karma; mock `fetch` via the service's `fetchFn` seam.

Host projects: `content-ce` (the app, root `app/`), `aca-content`, `aca-shared`, `aca-playwright-shared`.

## How the library plugs into ACA

The library is **not** a separate Nx project: there is no `project.json` or `.eslintrc.json` for `adf-download-manager`. It is compiled inline as part of the `content-ce` app build via:

1. **TS path mapping**: `aca/tsconfig.json` maps `@alfresco/adf-download-manager` -> `projects/adf-download-manager/src/public-api.ts`, and the build sets `preserveSymlinks: true`.
2. **Provider registration**: `aca/app/src/app/extensions.module.ts` calls `provideAdfDownloadManagerExtension()` (from `adf-download-manager.module.ts`), which wires up translations, the NgRx effects, the extension plugin config, and component registrations.
3. **Asset copying**: `aca/app/project.json` (`build.options.assets`) copies `adf-download-manager.plugin.json` to `assets/plugins/` and the i18n files to `assets/adf-download-manager/i18n/`. **If you add new assets or i18n files, update these globs** or they won't ship.

### Extension flow (declarative -> action -> effect -> service)

`adf-download-manager.plugin.json` declares toolbar buttons, context-menu items, and a sidebar tab using ADF's extensibility schema (`aca/extension.schema.json`). Each entry references an **action type** string (e.g. `ADF_DOWNLOAD_MANAGER_DOWNLOAD_FILE`). Those constants live in `store/adf-download-manager.actions.ts`, are handled by `store/adf-download-manager.effects.ts` (NgRx effects, `dispatch: false`), and the effects call the services. To add a user-facing entry point: declare it in `plugin.json` -> add the action constant -> handle it in the effects.

## Library architecture (`adf-download-manager/src/lib`)

The download path consumes ACS REST APIs (full table in `REQUIREMENTS.md section 6`) plus the optional streaming **addon** endpoint (preferred when detected). The service is a thin orchestrator; byte movement lives in unit-testable engine/sink modules (each fix below has a co-located `.spec.ts`).

- **`services/download-manager.service.ts`**: orchestrator. Root singleton holding the queue in a `BehaviorSubject<DownloadTask[]>` (`tasks$`). Owns: the **scheduler** (`maxParallelDownloads`), persistence, the resume guard, error handling, the ZIP poll loop, and the frozen public API. Delegates downloads to the engines. The `fetchFn` field is the injection seam tests use to mock `fetch`.
- **`services/probe.service.ts`**: **pre-flight probe** run before the first content byte (the root-cause fix). `GET /nodes/{id}` for authoritative size + fast 403/404; `HEAD` the download URL for ETag / `Accept-Ranges` / `Content-Length`; falls back to a `Range: bytes=0-0` GET when a proxy blocks HEAD. Also `detectAddon()`: one-shot HEAD to the addon path. The probe selects the engine and enables/disables pause **before** downloading, so a fresh large file goes straight to chunked mode (the old code only learned `rangeSupported` *after* a full-file GET -> always hit the ~1 GB ceiling).
- **`services/content-url.builder.ts`**: builds stock vs **addon** URLs (node / version / ZIP) and the `Basic <getToken()>` auth header; central endpoint-selection + fallback (`useAddon`).
- **`engine/chunked-download.engine.ts`** (`runChunkedDownload`): sequential `Range` loop for files over `largeSizeThreshold`, `chunkSizeBytes` at a time (under the ~1 GB ceiling). Reconciles the loop bound against the server's `Content-Range` total (no silent truncation); a later-chunk total change -> `FileChangedError`. **Safe 200-to-Range handling**: at offset 0 accept+stop; at a resume offset `sink.reset()` then write from 0 (never write the whole body at the resume offset: the old corruption bug).
- **`engine/simple-download.engine.ts`** (`runSimpleDownload`): single-GET stream for small files / no-Range servers / ZIP content; opens the sink **after** learning `Content-Length` so a large unknown-size response still streams to disk.
- **`engine/stream-pump.ts`** (`pumpToSink`): reads a response body chunk-by-chunk into the sink; counts bytes only after a successful write; 5 s sliding-window speed.
- **`engine/fetch-with-abort.ts`** (`AbortRegistry`): one `AbortController` per in-flight fetch, removed in a `finally` (fixes the old leak where `delete` ran only on success).
- **`engine/range-math.ts`**: pure helpers: `nextChunkRange`, `parseContentRangeTotal`, `reconcileTotal`, `backoffDelay`. No DOM deps -> the core math is trivially testable.
- **`sinks/`**: `DownloadSink` interface (`write`/`reset`/`close`/`currentLength`/`result`). `opfs.sink.ts` (disk-backed staging, `tempFileName` persists across pause/resume; `reset()` truncates; `diskFileSize()` for the resume guard), `memory.sink.ts` (capped: re-checks `inMemoryMaxBytes` on **every** write -> `MemoryCapExceededError`, so unknown-size ZIPs can't OOM), `sink.factory.ts` (`selectSink` by capability+size; `saveBlob` materializes via a disk-backed `File` + `createObjectURL`: **never `new Blob(parts)` for large files**).
- **`errors/error-classifier.ts`** (`classifyError`): maps thrown values to typed codes: `QuotaExceededError` -> terminal `STORAGE_FULL` (not a retryable network error: old bug); 401 -> session-expired; 403 -> `NO_PERMISSION`; 404 -> `NOT_FOUND`; no-status/5xx -> retryable.
- **Resume guard** (in the service): HEAD-compares stored `ETag` (mismatch -> `FILE_CHANGED`) **and** verifies the on-disk partial length via `diskFileSize` before trusting the offset: never seeks past EOF.
- **Persistence**: on every mutation, paused/queued tasks -> `localStorage` key `adf.downloadManager.queue` (versioned). **Never persist tokens** (AC-19). Calls `navigator.storage.persist()` at init to reduce OPFS eviction.
- **`services/upload-manager.service.ts`**: uploads (unchanged): streams a `File` to ACS in two steps (`POST /nodes/{parent}/children` then `PUT /nodes/{id}/content`) so the file is not read into the heap.
- **`services/browser-capability.service.ts`**: capability matrix: `fetchStreams`, `rangeRequests`, `fsaSaveFilePicker`, `opfsWritableMainThread`, `opfsSyncAccessWorker`; `streamToDisk = main-thread writable || worker sync-access`.
- **`services/download-manager-config.token.ts`**: `DOWNLOAD_MANAGER_CONFIG` token + defaults (now incl. `useStreamingAddon`, `addonDownloadPath`, `parallelChunksPerDownload`, `preferDirectFileSystemSink`, `retry*Ms`, `zipPollIntervalMs`, `requestPersistentStorage`).
- **`models/adf-download-manager.models.ts`**: all types. Immutable tasks; `DownloadErrorCode` now includes `STORAGE_FULL | NOT_FOUND | RANGE_REQUIRED`.
- **`components/` / `services/*-panel.service.ts`**: panels, buttons, and panel open/close state (unchanged).

## Repository addon (separate project)

The headless ACS web script that streams node content honouring HTTP `Range` lives in the separate [alfresco-download-streaming-repo](https://github.com/aborroy/alfresco-download-streaming-repo) repository, not here. This repository only consumes its prebuilt JAR (see `deployment/alfresco/Dockerfile`, which fetches it from a GitHub release) and detects its endpoint at runtime (`services/probe.service.ts` `detectAddon()`, `services/content-url.builder.ts`). If you need to change the addon's behavior, work in that repository.

## Conventions

- **Prettier** (`aca/.prettierrc`): single quotes, no trailing commas, `printWidth: 150`.
- **License headers**: host ACA `.ts` files carry the Hyland/Alfresco LGPL header (enforced by the `license-header` eslint rule). **The library files do not**, and the root eslint config ignores `projects/**/*` with no per-project config for `adf-download-manager`: so library code is currently outside the lint/header enforcement. Match the surrounding file's existing style when editing.
- Library uses `provideExtensions` / standalone components / `inject()` and the modern `provide*` provider functions; the `@NgModule` exports are kept only as `@deprecated` shims.
