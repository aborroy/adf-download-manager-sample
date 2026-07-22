# Getting Started with ADF Download Manager

This tutorial walks you through running the demo stack and testing large-file downloads in under 10 minutes.

## Prerequisites

Before you begin, ensure you have:

- **Docker Desktop** installed and running
  - Minimum 7 GB RAM allocated to Docker
  - Check: Docker Desktop -> Settings -> Resources -> Memory
- **5-10 GB free disk space** for Docker images and test files
- **Modern web browser** (Chrome, Firefox, Safari 16+, or Edge)

## Step 1: Clone the Repository

```bash
git clone https://github.com/aborroy/adf-download-manager-sample.git
cd adf-download-manager-sample
```

## Step 2: Review the Configuration

The deployment stack uses a `.env` file for configuration. A sample is provided:

```bash
cd deployment
cat .env.example
```

The defaults are suitable for local testing. If you need to customize (e.g., change memory limits), copy `.env.example` to `.env` and edit:

```bash
cp .env.example .env
# Edit .env if needed
```

**Key settings:**

- `TRANSFORM_ROUTER_JAVA_OPTS=-Xms512m -Xmx1g`: Transform service memory
- `POSTGRES_PASSWORD=alfresco`: Database password
- `SOLR_JAVA_OPTS=-Xms1g -Xmx1g`: Search service memory

## Step 3: Start the Stack

From the `deployment/` directory, run:

```bash
docker compose up --build
```

**What happens:**

1. **Build stage** (~5-15 minutes on first run):
   - Downloads base Docker images (ACS, ACA, PostgreSQL, Solr, etc.)
   - Fetches the repository addon JAR from its GitHub release
   - Builds the ACA frontend with library integrated (Nx build inside Docker)
2. **Start stage** (~2-3 minutes):
   - Starts all services
   - Initializes database
   - Waits for ACS to be ready

**Expected output:**

```
[+] Building 360.5s (45/45) FINISHED
[+] Running 7/7
 [+] Container deployment-postgres-1             Started
 [+] Container deployment-activemq-1             Started
 [+] Container deployment-solr6-1                Started
 [+] Container deployment-transform-core-aio-1   Started
 [+] Container deployment-alfresco-1             Healthy
 [+] Container deployment-content-app-1          Healthy
 [+] Container deployment-proxy-1                Healthy
```

**Wait for this message:**

```
alfresco-1  | Server startup in [16082] milliseconds
alfresco-1  | readyProbe: Success - Tested
```

This indicates ACS is fully initialized.

## Step 4: Access the Application

Open your browser and navigate to:

**http://localhost:8080**

You'll see the Alfresco Content App login page.

**Login credentials:**
- Username: `admin`
- Password: `admin`

After login, you'll see the ACA interface with your personal files.

## Step 5: Generate a Test File

To test large-file downloads, you need a test file. Generate one using `dd`:

**On macOS:**
```bash
dd if=/dev/urandom of=test-large.bin bs=1m count=4096
```

**On Linux:**
```bash
head -c 4G /dev/urandom > test-large.bin
```

This creates a large file filled with random data. Adjust `count`/`4G` to any size you want to test with: the manager has no built-in cap.

**Alternative:** Use an existing large file (video, CAD file, dataset, etc.)

## Step 6: Upload the Test File

In ACA:

1. Click **Personal Files** in the left sidebar
2. Click the **Upload** button (cloud icon) in the toolbar
3. Select your `test-large.bin` file
4. The **Upload panel** opens on the right showing progress

**Expected behavior:**
- Upload streams directly to ACS via PUT (no heap pressure)
- Progress bar shows real-time progress and speed
- Large uploads work reliably regardless of file size

Wait for the upload to complete (depends on your disk speed).

## Step 7: Download the File

Now test the download manager:

1. **Right-click** the uploaded file in the file list
2. Select **Download** from the context menu

**What happens:**
- The **Downloads panel** opens on the right sidebar
- The file appears in the queue with status "downloading"
- You see:
  - Progress bar (0% -> 100%)
  - Downloaded size / Total size (e.g., "500 MB / 4.0 GB")
  - Speed (e.g., "12.5 MB/s")
  - Time remaining estimate

**Behind the scenes:**
- The library probes the file (HEAD request) to get size and check Range support
- Detects the streaming addon endpoint
- Downloads in 64 MB chunks via HTTP Range requests
- Streams each chunk directly to disk using OPFS (no memory buffer)

## Step 8: Test Pause & Resume

While the download is active:

1. Click the **Pause button** (|| icon) next to the downloading file
2. Observe:
   - Download stops immediately
   - Status changes to "Paused"
   - A **Resume button** (play icon) appears
3. Click the **Resume button**
4. Observe:
   - Download continues from the exact byte offset where it paused
   - No data is re-downloaded

**How it works:**
- Paused offset is saved to localStorage
- On resume, the library validates the file hasn't changed (ETag comparison)
- Verifies partial file size on disk matches expected offset
- Sends `Range: bytes=<offset>-` header to continue from saved position

## Step 9: Test Multiple Downloads

Download multiple files simultaneously:

1. Upload 2-3 more files (can be smaller, e.g., 500 MB each)
2. Select all of them (Cmd/Ctrl+Click)
3. Right-click -> **Download**

**What happens:**
- All files are added to the download queue
- Up to 3 files download **concurrently** (configurable via `maxParallelDownloads`)
- Others wait in "queued" status
- Each has independent progress tracking

## Step 10: Test ZIP Download

Download a folder as a ZIP:

1. Create a new folder: Click **Create** -> **Folder**
2. Upload 2-3 files into the folder
3. Right-click the folder -> **Download as ZIP**

**What happens:**
- The library calls `POST /downloads` (ACS async ZIP creation API)
- Polls the status every 3 seconds
- When ZIP is ready, downloads it using the same chunked/streaming mechanism
- Large ZIPs (1GB+) are supported

## Step 11: Test Persistence

Test that paused downloads survive page reloads:

1. Start a large download
2. Pause it midway
3. **Refresh the page** (Cmd/Ctrl+R)
4. Log in again

**What happens:**
- The paused download reappears in the Downloads panel
- State is restored from localStorage (downloaded bytes, etag, temp file name)
- Click resume to continue from where you left off

## Step 12: Inspect Browser DevTools

Open DevTools (F12) to see the magic:

### Network Tab
1. Start a download
2. Go to **Network** tab
3. Filter by "adf-download-manager"
4. Observe:
   - HEAD request (pre-flight probe)
   - Multiple GET requests with `Range: bytes=X-Y` headers
   - 206 Partial Content responses
   - Each response is 64 MB (except the last chunk)

### Application Tab
1. Go to **Application** tab
2. Navigate to **Origin Private File System (OPFS)**
3. See the temporary file: `dm-<uuid>-<timestamp>.part`
4. This is the disk-backed staging file
5. As download progresses, this file grows

### Console Tab
1. Go to **Console** tab
2. See informational messages:
   - "Downloading <filename>..."
   - "<filename> paused."
   - "<filename> downloaded."

## Troubleshooting

### Stack doesn't start

**Issue:** Docker out of memory

**Solution:**
```bash
# Check Docker memory limit
docker system info | grep Memory

# Increase to 7 GB in Docker Desktop -> Settings -> Resources
```

**Issue:** Port 8080 already in use

**Solution:**
```bash
# Find what's using the port
lsof -i :8080

# Kill the process or change the port in compose.yaml
```

### Download fails

**Issue:** Browser doesn't support OPFS

**Check:**
```javascript
// In browser console:
'showSaveFilePicker' in window && 'createWritable' in FileSystemFileHandle.prototype
```

**Solution:** The library auto-falls back to in-memory buffer (900 MB cap)

**Issue:** File changed during resume

**Symptom:** "FILE_CHANGED" error after resuming

**Cause:** File was modified/replaced in ACS between pause and resume

**Solution:** Delete the paused download and start fresh

### Performance issues

**Issue:** Slow download speed

**Possible causes:**
- Disk I/O bottleneck (check Activity Monitor / Task Manager)
- Network throttling
- Transform service consuming CPU

**Solution:**
```bash
# Stop transform service if not needed for testing:
docker compose stop transform-core-aio
```

## Next Steps

Now that you've tested the demo, you can:

1. **Integrate into your project**: See [INTEGRATION-GUIDE.md](INTEGRATION-GUIDE.md)
2. **Customize configuration**: Adjust chunk size, parallelism, thresholds
3. **Deploy to production**: Adapt the Docker Compose stack or integrate components separately
4. **Explore the code**: See [CLAUDE.md](CLAUDE.md) for architecture details
5. **Contribute**: Report issues, suggest features, submit PRs

## Clean Up

When you're done testing:

**Stop the stack (keep data):**
```bash
docker compose down
```

**Stop and wipe all data:**
```bash
docker compose down -v
```

**Remove downloaded images:**
```bash
docker system prune -a
```

## Useful Commands

```bash
# View logs
docker compose logs -f alfresco
docker compose logs -f content-app

# Check service status
docker compose ps

# Restart a single service
docker compose restart alfresco

# Rebuild after code changes
docker compose up --build -d content-app

# Open shell in ACS container
docker compose exec alfresco bash

# Check addon is loaded
docker compose exec alfresco \
  curl -u admin:admin http://localhost:8080/alfresco/s/index \
  | grep adf-download-manager
```

## FAQ

**Q: Does this work with ACS Community or only Enterprise?**  
A: Both. The demo uses Community 26.1. The addon is a simple web script with no Enterprise dependencies.

**Q: Can I use the library without the addon?**  
A: Yes! The library auto-detects if the addon is missing and falls back to chunked Range requests against the standard ACS content API (`/nodes/{id}/content`). The addon is preferred but not required.

**Q: What's the maximum file size?**  
A: No built-in limit: files of any size are supported, constrained only by disk space and browser storage quota.

**Q: Does it work on mobile browsers?**  
A: Partially. iOS Safari lacks OPFS, so downloads are memory-capped at 900 MB. Android Chrome has full OPFS support.

**Q: Can I download 10 files at once?**  
A: The default `maxParallelDownloads` is 3 to avoid overwhelming the server. You can increase it, but consider server capacity and bandwidth.

**Q: What happens if my auth token expires mid-download?**  
A: The library detects 401 responses, pauses affected downloads, and shows a notification. After re-login, click resume.

**Q: Can I use this with S3 Connector?**  
A: Yes, as long as the ACS content API is accessible and returns the file content.