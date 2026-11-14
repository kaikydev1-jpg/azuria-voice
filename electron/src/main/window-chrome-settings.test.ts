import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ChromeController,
  DEFAULT_WINDOW_PREFS,
  parseWindowPrefs,
  WindowPrefsStore,
  wireWindowFocusEvents,
} from './window-chrome-settings';

describe('parseWindowPrefs', () => {
  it('falls back to automatic buttons and close-to-tray on bad input', () => {
    expect(parseWindowPrefs(null)).toEqual(DEFAULT_WINDOW_PREFS);
    expect(parseWindowPrefs({ chrome: 'matsu', closeToTray: 'yes' })).toEqual(DEFAULT_WINDOW_PREFS);
    expect(DEFAULT_WINDOW_PREFS).toEqual({ chrome: 'auto', closeToTray: true, trayNoticeShown: false });
  });

  it('keeps valid choices', () => {
    expect(parseWindowPrefs({ chrome: 'kde', closeToTray: false, trayNoticeShown: true })).toEqual({
      chrome: 'kde',
      closeToTray: false,
      trayNoticeShown: true,
    });
  });
});

describe('WindowPrefsStore', () => {
  it('persists updates and reads them back after a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azuria-window-'));
    const path = join(dir, 'window-chrome.json');
    const store = WindowPrefsStore.load(path);
    expect(store.get()).toEqual(DEFAULT_WINDOW_PREFS);
    await store.update({ chrome: 'mac' });
    await store.update({ closeToTray: false });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ chrome: 'mac', closeToTray: false });
    expect(WindowPrefsStore.load(path).get()).toMatchObject({ chrome: 'mac', closeToTray: false });
  });

  it('survives a corrupt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'azuria-window-'));
    const path = join(dir, 'window-chrome.json');
    writeFileSync(path, '{broken');
    expect(WindowPrefsStore.load(path).get()).toEqual(DEFAULT_WINDOW_PREFS);
  });
});

describe('ChromeController', () => {
  it('redraws Linux buttons right away when the style changes', () => {
    const changed = vi.fn();
    const controller = new ChromeController({ os: 'linux', layout: 'appmenu:close', matsu: false }, 'auto', changed);
    expect(controller.current()).toMatchObject({ style: 'gnome', right: ['close'], preference: 'auto' });
    expect(controller.setPreference('mac')).toEqual({ restartRequired: false });
    expect(controller.current()).toMatchObject({ style: 'mac', left: ['close', 'minimize', 'maximize'], preference: 'mac' });
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ style: 'mac', preference: 'mac' }));
  });

  it('asks for a reopen on Windows when native buttons would change', () => {
    const changed = vi.fn();
    const controller = new ChromeController({ os: 'windows', matsu: false }, 'auto', changed);
    expect(controller.startup.native).toBe(true);
    expect(controller.setPreference('mac')).toEqual({ restartRequired: true });
    // The open window keeps its native buttons until the app reopens.
    expect(controller.current()).toMatchObject({ style: 'windows', native: true, preference: 'mac' });
    expect(changed).not.toHaveBeenCalled();
    expect(controller.setPreference('windows')).toEqual({ restartRequired: false });
  });

  it('rejects unknown styles, including a manual Matsu choice', () => {
    const controller = new ChromeController({ os: 'linux', matsu: true }, 'auto', vi.fn());
    expect(() => controller.setPreference('matsu' as never)).toThrow();
    expect(controller.current().style).toBe('matsu');
  });
});

describe('wireWindowFocusEvents', () => {
  it('tells the renderer when the window gains and loses focus', () => {
    const win = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send: vi.fn() },
    });
    wireWindowFocusEvents(win as never);
    win.emit('blur');
    win.emit('focus');
    expect(win.webContents.send.mock.calls).toEqual([
      ['window:focused', false],
      ['window:focused', true],
    ]);
  });
});
