# Integration Guide: Adding ADF Download Manager to Your ACA/ADW Project

This guide shows you how to integrate the ADF Download Manager library into your own Alfresco Content Application (ACA) or Alfresco Digital Workspace (ADW) project.

## Prerequisites

Before integrating, ensure your project meets these requirements:

### Required

- **Angular:** 17+ (tested with 17.3)
- **ADF:** 6.x (tested with 6.10)
- **Angular Material:** 17+
- **TypeScript:** 5.x
- **Node.js:** 24.x (for build)

### Recommended

- **NgRx:** Already included in ACA/ADW (for extension effects)
- **RxJS:** 7.x (for reactive state management)

### Browser Support

The library works on all modern evergreen browsers:

- [x] Chrome/Edge 119+ (full OPFS support)
- [x] Firefox 111+ (full OPFS support)
- [x] Safari 17+ (full OPFS support)
- [!] Safari 16.4-16.9 (limited OPFS, memory fallback)
- [!] iOS Safari (no OPFS, 900 MB memory cap)

## Installation

The library is currently **source-only** (npm package publication is planned). You'll integrate it by copying the source into your project.

### Step 1: Copy Library Source

Copy the `adf-download-manager` directory into your Angular workspace:

```bash
# From the root of this repository
cp -r adf-download-manager /path/to/your-project/projects/

# Or if you're using a monorepo structure like Nx:
cp -r adf-download-manager /path/to/your-project/libs/
```

Your project structure should look like:

```
your-project/
|-- projects/                        # Or libs/ for Nx
|   `-- adf-download-manager/
|       |-- src/
|       |   |-- lib/
|       |   |   |-- components/
|       |   |   |-- services/
|       |   |   |-- engine/
|       |   |   |-- sinks/
|       |   |   |-- store/
|       |   |   `-- ...
|       |   `-- public-api.ts
|       `-- README.md
|-- src/
|   `-- app/
`-- angular.json
```

### Step 2: Configure TypeScript Path Mapping

Add a path mapping in `tsconfig.json` so Angular can resolve the library:

```json
{
  "compilerOptions": {
    "paths": {
      "@alfresco/adf-download-manager": [
        "projects/adf-download-manager/src/public-api.ts"
      ]
    }
  }
}
```

If you're using an Nx monorepo, the paths may be auto-configured via `tsconfig.base.json`.

### Step 3: Configure Asset Copying

The library includes i18n translation files and a plugin configuration JSON that must be copied to your application's assets directory.

Edit `angular.json` (or `project.json` for Nx):

```json
{
  "projects": {
    "your-app": {
      "architect": {
        "build": {
          "options": {
            "assets": [
              // Your existing assets
              "src/favicon.ico",
              "src/assets",
              
              // Add these for the download manager:
              {
                "glob": "**/*",
                "input": "projects/adf-download-manager/src/lib/i18n",
                "output": "/assets/adf-download-manager/i18n"
              },
              {
                "glob": "adf-download-manager.plugin.json",
                "input": "projects/adf-download-manager/src/lib",
                "output": "/assets/plugins"
              }
            ]
          }
        }
      }
    }
  }
}
```

This ensures:

- Translation files are copied to `assets/adf-download-manager/i18n/`
- Plugin config is copied to `assets/plugins/`

### Step 4: Register the Provider

In your app configuration file (e.g., `app.config.ts` or `extensions.module.ts`), register the library's provider:

**For standalone apps (Angular 17+):**

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideAdfDownloadManagerExtension } from '@alfresco/adf-download-manager';

export const appConfig: ApplicationConfig = {
  providers: [
    // Your existing providers
    // ...
    
    // Add the download manager extension
    ...provideAdfDownloadManagerExtension()
  ]
};
```

**For module-based apps (legacy):**

```typescript
// src/app/extensions.module.ts
import { NgModule } from '@angular/core';
import { provideAdfDownloadManagerExtension } from '@alfresco/adf-download-manager';

@NgModule({
  providers: [
    ...provideAdfDownloadManagerExtension()
  ]
})
export class ExtensionsModule {}
```

The `provideAdfDownloadManagerExtension()` function registers:

- Services (download manager, upload manager, browser capability detection)
- NgRx effects (for handling extension actions)
- Translation loader (i18n)
- Component registrations (for extensibility framework)

### Step 5: Configure Options (Optional)

You can customize the download manager behavior by providing a configuration object:

```typescript
// src/app/app.config.ts
import { DOWNLOAD_MANAGER_CONFIG } from '@alfresco/adf-download-manager';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... other providers
    
    // Override default configuration
    {
      provide: DOWNLOAD_MANAGER_CONFIG,
      useValue: {
        maxParallelDownloads: 5,              // Concurrent downloads (default: 3)
        largeSizeThreshold: 200_000_000,      // 200 MB - use chunked above this
        chunkSizeBytes: 100_000_000,          // 100 MB chunks
        warnSizeThreshold: 5_000_000_000,     // 5 GB - confirm before starting
        blockSizeThreshold: null,             // null = unlimited (default)
        inMemoryMaxBytes: 943_718_400,        // 900 MB - memory cap (default)
        retryDelayMs: 3000,                   // Retry delay (default: 2000)
        retryMaxDelayMs: 60_000,              // Max retry delay (default: 30000)
        retryMaxAttempts: 10,                 // Max retries (default: 5)
        useStreamingAddon: true,              // Detect addon (default: true)
        addonDownloadPath: '/s/adf-download-manager/download', // Addon path
        zipPollIntervalMs: 5000,              // ZIP polling (default: 3000)
        requestPersistentStorage: true        // OPFS eviction protection
      }
    },
    
    ...provideAdfDownloadManagerExtension()
  ]
};
```

**Configuration reference:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxParallelDownloads` | number | 3 | Max concurrent downloads |
| `largeSizeThreshold` | number | 100 MB | Use chunked mode above this size |
| `chunkSizeBytes` | number | 64 MB | Size of each Range request chunk |
| `warnSizeThreshold` | number | null | Show confirmation dialog above this size |
| `blockSizeThreshold` | number | null | Hard block above this size (null = unlimited) |
| `inMemoryMaxBytes` | number | 900 MB | Memory cap for browsers without OPFS |
| `retryDelayMs` | number | 2000 | Initial retry delay (exponential backoff) |
| `retryMaxDelayMs` | number | 30000 | Max retry delay |
| `retryMaxAttempts` | number | 5 | Max retry attempts before failing |
| `useStreamingAddon` | boolean | true | Detect and prefer streaming addon |
| `addonDownloadPath` | string | (see above) | Addon endpoint path |
| `zipPollIntervalMs` | number | 3000 | Polling interval for ZIP creation |
| `requestPersistentStorage` | boolean | true | Request OPFS persistence |

## Installing the Repository Addon (Optional but Recommended)

The frontend library works **with or without** the server-side streaming addon, but performance is much better with it. The addon is a separate project, published at:
https://github.com/aborroy/alfresco-download-streaming-repo

### Download the JAR

Get the latest release from:
https://github.com/aborroy/alfresco-download-streaming-repo/releases

### Install in ACS

**Option 1: Add to Docker image (recommended)**

```dockerfile
# Dockerfile
ARG ADDON_VERSION=1.0.0
FROM alfresco/alfresco-content-repository-community:26.1.0

# Fetch addon JAR directly from its GitHub release. --chown/--chmod are
# required: ADD from a URL defaults to root:root 0600, which the alfresco
# runtime user can't read.
ADD --chown=alfresco:Alfresco --chmod=644 \
    https://github.com/aborroy/alfresco-download-streaming-repo/releases/download/v${ADDON_VERSION}/alfresco-download-streaming-repo-${ADDON_VERSION}.jar \
    /usr/local/tomcat/webapps/alfresco/WEB-INF/lib/alfresco-download-streaming-repo.jar
```

**Option 2: Mount as volume (for testing)**

Download the JAR from the releases page above, then:

```yaml
# docker-compose.yaml
services:
  alfresco:
    image: alfresco/alfresco-content-repository-community:26.1.0
    volumes:
      - ./addons/alfresco-download-streaming-repo-1.0.0.jar:/usr/local/tomcat/webapps/alfresco/WEB-INF/lib/alfresco-download-streaming-repo-1.0.0.jar
```

**Option 3: Manual install**

```bash
# Download the JAR from the releases page above, then copy it to the Tomcat lib directory
cp alfresco-download-streaming-repo-1.0.0.jar \
   $TOMCAT_DIR/webapps/alfresco/WEB-INF/lib/

# Restart Alfresco
```

### Verify Installation

After starting ACS, check the logs:

```
INFO  [repo.module.ModuleServiceImpl] Starting module 'alfresco-download-streaming-repo' version 1.0.0.
```

Test the endpoint:

```bash
curl -u admin:admin \
  -I http://localhost:8080/alfresco/s/adf-download-manager/download/some-node-id
```

You should get a `401` (expected without valid node ID) or `200`/`206`, not `404`.

## Testing the Integration

### 1. Build Your Application

```bash
npm install
npm run build
# or
npm start  # for dev server
```

### 2. Verify Assets are Copied

Check that these files exist in your build output:

```
dist/your-app/
|-- assets/
|   |-- adf-download-manager/
|   |   `-- i18n/
|   |       |-- en.json
|   |       |-- es.json
|   |       `-- ...
|   `-- plugins/
|       `-- adf-download-manager.plugin.json
```

### 3. Test in Browser

1. Log in to your ACA/ADW application
2. Navigate to a folder with files
3. Right-click a file, then select **Download**
4. Observe the Downloads panel opens on the right
5. Test pause/resume functionality

### 4. Verify Addon Detection

Open browser DevTools Console and check for:

```
[DownloadManagerService] Streaming addon detected: true
```

If you see `detected: false`, the addon is not installed or the endpoint is unreachable.

## Advanced Integration

### Custom UI Integration

If you don't want to use the default extension UI (toolbar buttons, panels), you can use the service directly:

```typescript
import { Component, inject } from '@angular/core';
import { DownloadManagerService } from '@alfresco/adf-download-manager';

@Component({
  selector: 'app-custom-download',
  template: `
    <button (click)="downloadFile()">Download Large File</button>
  `
})
export class CustomDownloadComponent {
  private downloadManager = inject(DownloadManagerService);
  
  downloadFile() {
    const nodeId = 'your-node-id';
    const fileName = 'large-file.bin';
    const totalBytes = 4_000_000_000; // example: a multi-gigabyte file
    
    const taskId = this.downloadManager.downloadFile(nodeId, fileName, totalBytes);
    
    // Subscribe to task updates
    this.downloadManager.tasks$.subscribe(tasks => {
      const myTask = tasks.find(t => t.id === taskId);
      console.log('Progress:', myTask?.downloadedBytes, '/', myTask?.totalBytes);
    });
  }
}
```

### Programmatic Control

```typescript
import { DownloadManagerService } from '@alfresco/adf-download-manager';

// Pause a download
downloadManager.pause(taskId);

// Resume a paused download
await downloadManager.resume(taskId);

// Cancel a download
downloadManager.cancel(taskId);

// Retry a failed download
await downloadManager.retry(taskId);

// Pause all active downloads
downloadManager.pauseAll();

// Resume all paused downloads
downloadManager.resumeAll();

// Clear completed/cancelled downloads
downloadManager.clearCompleted();
```

### Subscribe to Queue State

```typescript
import { DownloadManagerService } from '@alfresco/adf-download-manager';

downloadManager.tasks$.subscribe(tasks => {
  const active = tasks.filter(t => t.status === 'active');
  const paused = tasks.filter(t => t.status === 'paused');
  const completed = tasks.filter(t => t.status === 'completed');
  
  console.log(`Active: ${active.length}, Paused: ${paused.length}, Done: ${completed.length}`);
});
```

### Handle Session Expiry

The library auto-pauses downloads when it detects session expiry (401 responses). After the user re-authenticates, resume manually:

```typescript
// After successful re-authentication
authService.onLogin.subscribe(() => {
  const pausedTasks = downloadManager.tasks$.value.filter(t => 
    t.status === 'paused' && t.error?.code === 'AUTH_FAILED'
  );
  
  pausedTasks.forEach(task => {
    downloadManager.resumeAfterAuth(task.id);
  });
});
```

## Next Steps

- **Read the architecture docs:** [adf-download-manager/ARCHITECTURE.md](adf-download-manager/ARCHITECTURE.md)
- **Explore the API:** [adf-download-manager/README.md](adf-download-manager/README.md)
- **See a working example:** Check `aca/app/src/app/extensions.module.ts`
- **Report issues:** https://github.com/aborroy/adf-download-manager-sample/issues