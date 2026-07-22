import { EnvironmentProviders, NgModule, Provider } from '@angular/core';
import { provideTranslations } from '@alfresco/adf-core';
import { provideExtensionConfig, provideExtensions } from '@alfresco/adf-extensions';
import { provideEffects } from '@ngrx/effects';

import { AdfDownloadManagerEffects } from './lib/store/adf-download-manager.effects';
import { DownloadManagerPanelComponent } from './lib/components/download-manager-panel/download-manager-panel.component';
import { UploadManagerPanelComponent } from './lib/components/upload-manager-panel/upload-manager-panel.component';
import { DownloadNavbarEntryComponent } from './lib/components/download-navbar-entry/download-navbar-entry.component';
import { UploadNavbarEntryComponent } from './lib/components/upload-navbar-entry/upload-navbar-entry.component';

export function provideAdfDownloadManagerExtension(): (Provider | EnvironmentProviders)[] {
  return [
    // ADF's TranslateLoader appends `/i18n/{lang}.json` to this path, so it must
    // NOT include `/i18n` — otherwise it fetches .../i18n/i18n/en.json → 404 and
    // every key renders raw (e.g. "ADF_UPLOAD_MANAGER.PANEL.TITLE").
    provideTranslations('adf-download-manager', 'assets/adf-download-manager'),
    provideExtensionConfig(['adf-download-manager.plugin.json']),
    provideEffects(AdfDownloadManagerEffects),
    provideExtensions({
      components: {
        'adf-download-manager.panel': DownloadManagerPanelComponent,
        'adf-download-manager.upload-panel': UploadManagerPanelComponent,
        'adf-download-manager.navbar.downloads': DownloadNavbarEntryComponent,
        'adf-download-manager.navbar.uploads': UploadNavbarEntryComponent,
      },
      evaluators: {},
    }),
  ];
}

/** @deprecated Use provideAdfDownloadManagerExtension() instead. */
@NgModule({ providers: [...provideAdfDownloadManagerExtension()] })
export class AdfDownloadManagerModule {}
