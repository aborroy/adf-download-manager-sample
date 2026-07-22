# Deployment: ADF Download Manager test stack

A self-contained Docker Compose stack that runs **Alfresco Content Services (ACS) Community 26.1** behind a Traefik proxy, fronted by a custom build of this repo's ACA that ships the **ADF Download Manager** extension. Tuned end-to-end for testing **uploads and downloads of files of any size**.

Based on the official [ACS community compose template](https://github.com/Alfresco/acs-deployment/blob/master/docker-compose/community-compose.yaml).

## Stack

| Service | Image | Purpose |
|---------|-------|---------|
| `proxy` | `traefik:3.6` | Reverse proxy on `:8080`, **streams** bodies (no buffering) |
| `content-app` | built from `../aca` | ACA + Download Manager extension |
| `alfresco` | `alfresco-content-repository-community:26.1.0` | Repository + REST API |
| `transform-core-aio` | `alfresco-transform-core-aio:5.4.2` | Document transforms |
| `postgres` | `postgres:17.9` | Database |
| `solr6` | `alfresco-search-services:2.0.20` | Search index |
| `activemq` | `alfresco-activemq:6.2.6` | Messaging |

Share and Control Center from the upstream template are omitted: neither is needed to exercise the Download Manager, and dropping them frees ~1.1 GB of RAM. Add them back from the upstream template if you need them.

## Prerequisites

- Docker with **~7 GB** of memory available (Docker Desktop -> Settings -> Resources), plus disk for your test files. The ACA bundle builds inside Docker, so no host Node is required. The ACS image just downloads the addon's prebuilt JAR, so no JDK/Maven is required either.

## Usage

The ACA bundle builds **inside Docker**, and the ACS image fetches the addon JAR from its GitHub release, so the whole stack starts with a single command. No host Node/Nx/Maven steps are needed.

```bash
cd deployment
cp .env.example .env            # optional: tweak tags / memory
docker compose up --build -d    # builds the ACA image and fetches the addon, then starts everything
docker compose logs -f alfresco # watch ACS come up (~2-3 min on first run)
```

> **First build is slow** (downloads npm deps and compiles the Angular SPA in-Docker, plus fetches the addon JAR); later runs are layer-cached. `docker compose` automatically uses `compose.yaml` in this folder. The custom builds are: `deployment/alfresco/Dockerfile` (fetches the addon JAR from its [GitHub release](https://github.com/aborroy/alfresco-download-streaming-repo/releases) -> baked into the ACS image) and `deployment/aca/Dockerfile` (Node stage -> `nx build content-ce` -> nginx).

| URL | What |
|-----|------|
| http://localhost:8080 | ACA + Download Manager: log in `admin` / `admin` |
| http://localhost:8080/alfresco | ACS REST API |
| http://localhost:8161 | ActiveMQ console (`admin` / `admin`) |
| http://localhost:8888 | Traefik dashboard |

> **Rebuild after changing code:** images are built from source at `docker compose build` time. After editing the frontend, `docker compose up --build -d content-app`. The addon lives in a separate repository ([alfresco-download-streaming-repo](https://github.com/aborroy/alfresco-download-streaming-repo)); to pick up a new addon release, bump `ADDON_VERSION` in `deployment/alfresco/Dockerfile` and re-run `docker compose up --build -d alfresco`.

## What makes large files work

Out of the box, multi-GB transfers fail at several independent layers. All are addressed here:

### 0. The ~1 GB ACS download ceiling (server-side)

A stock single, un-ranged content download makes the repository allocate the whole file and **fails at ~1 GB** (empirically confirmed at Alfresco DevCon 2018, *"Moving Gigantic Files In & Out of the Repository"*). The **streaming download addon** (a separate project, [alfresco-download-streaming-repo](https://github.com/aborroy/alfresco-download-streaming-repo), fetched from its GitHub release and baked into the `alfresco` image: see [`alfresco/Dockerfile`](alfresco/Dockerfile)) exposes `GET|HEAD /alfresco/s/adf-download-manager/download/{nodeId}` which streams content from the content store in bounded buffers and honours HTTP `Range`, so the JVM heap stays flat at any file size. The ADF Download Manager auto-detects this endpoint and prefers it; if the addon is absent it falls back to chunked Range against the stock content API.

### 1. App size limit

The library default `blockSizeThreshold` is now **`null` (unlimited)**. Large downloads (over `largeSizeThreshold`, 100 MB) use **chunked Range requests** (64 MB chunks via `chunkSizeBytes`) and **stream each chunk straight to a disk-backed OPFS file** rather than buffering in the JS heap: so neither ACS (single-allocation OOM) nor the browser tab is a memory constraint, at any file size. See `DownloadManagerService.runChunkedDownload` -> `openDiskSink` and `BrowserCapabilityService.streamToDisk`.

> On a browser **without** OPFS write support, the manager falls back to an in-memory buffer and re-applies a safety ceiling (`inMemoryMaxBytes`, 900 MB) so the tab can't OOM. All current evergreen browsers (Chromium, Firefox, Safari 16+) have OPFS, so large files work there regardless of size.

The host app only nudges the *warn* threshold (the confirmation prompt) up to 2 GB for convenience: **not** the block cap: in [`aca/app/src/app/extensions.module.ts`](../aca/app/src/app/extensions.module.ts):

```ts
{
  provide: DOWNLOAD_MANAGER_CONFIG,
  useValue: {
    warnSizeThreshold: 2_147_483_648  // 2 GB: confirm before starting
  }
}
```

This streaming-to-disk path is what `REQUIREMENTS.md` US-02 / AC-02 specify, and it also makes **resume** correct for large files: partial bytes live in the OPFS temp file across pause/reload, so resume continues from the exact persisted offset instead of losing the already-downloaded portion.

> **Upload note:** uploads (`UploadManagerService`) already stream from disk: the browser sends the `File` object directly as the `PUT` body via XHR, so multi-GB uploads never load into the heap. No change was needed there.

### 2. Proxy must stream, not buffer

The upstream template routes ACS through a Traefik `limit` middleware that buffers up to 5 GB of request body **in proxy RAM**: which OOM-kills the proxy on large uploads. This stack omits that middleware entirely, so Traefik streams bodies straight through. Proxy timeouts are raised to 1 h (`respondingTimeouts`) for slow transfers.

### 3. ACS content-size limit

`alfresco` runs with `-Dsystem.content.maximumFileSizeLimit=0` (unlimited) so the repository itself doesn't reject large uploads.

## Testing checklist

1. Open http://localhost:8080, log in `admin` / `admin`.
2. **Upload:** open the upload panel (toolbar) and add a large file. Watch progress/speed; the body streams to ACS via `PUT /nodes/{id}/content`.
3. **Download (large):** right-click the uploaded file -> **Download**. Files over 100 MB use chunked Range mode (64 MB chunks).
4. **Pause / resume:** pause an active download; resume should continue from the saved byte offset (server must advertise `Accept-Ranges: bytes`).
5. **ZIP:** multi-select files or pick a folder -> download as ZIP (polls `POST /downloads`).
6. **Persistence:** reload mid-download: paused/queued tasks restore from `localStorage`.

## Generate large test files

```bash
# large sparse-ish file: adjust count/size for whatever you want to test
dd if=/dev/urandom of=test-large.bin bs=1m count=5120        # macOS
# head -c 5G /dev/urandom > test-large.bin                    # Linux
```

## Lifecycle

```bash
docker compose ps                 # status
docker compose logs -f alfresco   # follow repo logs
docker compose down               # stop, KEEP volumes (data persists)
docker compose down -v            # stop and WIPE all data + content
```

Data lives in named volumes (`alf-content`, `db-data`, `solr-data`); `down` without `-v` preserves it across restarts.
