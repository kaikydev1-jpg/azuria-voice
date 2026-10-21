// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createMacApplicationMenuTemplate,
  installAppIdentity,
  installMacApplicationMenu,
} from './app-identity';

describe('installAppIdentity', () => {
  it('uses an ASCII Electron name for the default user-data namespace', () => {
    const setName = vi.fn();

    installAppIdentity({ setName, userAgentFallback: 'Mozilla/5.0 Electron/44.3.0' });

    expect(setName).toHaveBeenCalledOnce();
    expect(setName).toHaveBeenCalledWith('Azuria Voice');
  });

  it('keeps custom-protocol headers ASCII if Electron has cached an accented user agent', () => {
    const application = {
      userAgentFallback: 'Mozilla/5.0 AzúriaVoice/0.5.7 Electron/44.3.0',
      setName: vi.fn(),
    };

    installAppIdentity(application);

    expect(application.setName).toHaveBeenCalledWith('Azuria Voice');
    expect(application.userAgentFallback).toMatch(/^[\x20-\x7e]+$/);
    const request = new Request('app://voicestudio/assets/index.js', {
      headers: { 'User-Agent': application.userAgentFallback },
    });
    expect(request.headers.get('user-agent')).toBe(
      'Mozilla/5.0 AzuriaVoice/0.5.7 Electron/44.3.0',
    );
  });

  it('defines the complete native macOS menu with Azúria Voice app labels', () => {
    const template = createMacApplicationMenuTemplate();

    expect(template[0]).toMatchObject({ label: 'Azúria Voice' });
    expect(template[0]?.submenu).toEqual(
      expect.arrayContaining([{ role: 'about' }, { role: 'hide' }, { role: 'quit' }]),
    );
    expect(template.slice(1)).toEqual([
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]);
  });

  it('installs the identity before Electron begins ready initialization', () => {
    const entrypoint = readFileSync(resolve(process.cwd(), 'src/main/index.ts'), 'utf8');
    const identityInstall = entrypoint.indexOf('installAppIdentity(app);');
    const readyInitialization = entrypoint.indexOf('.whenReady()');

    expect(identityInstall).toBeGreaterThanOrEqual(0);
    expect(readyInitialization).toBeGreaterThan(identityInstall);
  });

  it('brands the About panel and installs the macOS menu', () => {
    const application = {
      setAboutPanelOptions: vi.fn(),
    };
    const nativeMenu = { id: 'native-menu' };
    const menu = {
      buildFromTemplate: vi.fn(() => nativeMenu),
      setApplicationMenu: vi.fn(),
    };

    installMacApplicationMenu(application, menu, '0.5.6');

    expect(application.setAboutPanelOptions).toHaveBeenCalledWith({
      applicationName: 'Azúria Voice',
      applicationVersion: '0.5.6',
      version: '0.5.6',
    });
    expect(menu.setApplicationMenu).toHaveBeenCalledWith(nativeMenu);
  });
});
