export { AdfDownloadManagerModule, provideAdfDownloadManagerExtension } from './adf-download-manager.module';

export { TransferManagerHostComponent } from './lib/components/transfer-manager-host/transfer-manager-host.component';
export { DownloadManagerPanelComponent } from './lib/components/download-manager-panel/download-manager-panel.component';
export { DownloadManagerButtonComponent } from './lib/components/download-manager-button/download-manager-button.component';
export { UploadManagerPanelComponent } from './lib/components/upload-manager-panel/upload-manager-panel.component';
export { UploadManagerButtonComponent } from './lib/components/upload-manager-button/upload-manager-button.component';
export { DownloadNavbarEntryComponent } from './lib/components/download-navbar-entry/download-navbar-entry.component';
export { UploadNavbarEntryComponent } from './lib/components/upload-navbar-entry/upload-navbar-entry.component';

export { DownloadManagerService } from './lib/services/download-manager.service';
export { DownloadManagerPanelService } from './lib/services/download-manager-panel.service';
export { UploadManagerService } from './lib/services/upload-manager.service';
export { UploadManagerPanelService } from './lib/services/upload-manager-panel.service';
export { BrowserCapabilityService } from './lib/services/browser-capability.service';
export { DOWNLOAD_MANAGER_CONFIG, DEFAULT_DOWNLOAD_MANAGER_CONFIG } from './lib/services/download-manager-config.token';

export * from './lib/models/adf-download-manager.models';

// Engine internals exposed for host configuration/testing (additive — safe).
export { nextChunkRange, parseContentRangeTotal, reconcileTotal, backoffDelay } from './lib/engine/range-math';
export { classifyError } from './lib/errors/error-classifier';
export { ContentUrlBuilder } from './lib/services/content-url.builder';
