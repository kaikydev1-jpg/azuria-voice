import type { AboutPanelOptionsOptions, App, MenuItemConstructorOptions } from 'electron';
import { PRODUCT_NAME } from '../../../config/app-config.mjs';

export const DESKTOP_APP_NAME = PRODUCT_NAME;

/** Set before Electron creates sessions, windows or the native application menu. */
export function installAppIdentity(application: Pick<App, 'setName' | 'userAgentFallback'>): void {
  // Electron derives the default user-data directory from this internal name.
  // Native speech dependencies cannot read model data under accented paths.
  application.setName(DESKTOP_APP_NAME.normalize('NFKD').replace(/[^\x20-\x7e]/g, ''));
  // Cached or metadata-derived User-Agent values must remain ASCII too, or
  // Chromium's custom protocol bridge cannot load renderer assets.
  application.userAgentFallback = application.userAgentFallback
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '');
}

export function createMacApplicationMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    {
      label: DESKTOP_APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
}

interface AboutApplication {
  setAboutPanelOptions(options: AboutPanelOptionsOptions): void;
}

interface ApplicationMenuInstaller<TMenu> {
  buildFromTemplate(template: MenuItemConstructorOptions[]): TMenu;
  setApplicationMenu(menu: TMenu): void;
}

export function installMacApplicationMenu<TMenu>(
  application: AboutApplication,
  menu: ApplicationMenuInstaller<TMenu>,
  version: string,
): void {
  application.setAboutPanelOptions({
    applicationName: DESKTOP_APP_NAME,
    applicationVersion: version,
    version,
  });
  menu.setApplicationMenu(menu.buildFromTemplate(createMacApplicationMenuTemplate()));
}
