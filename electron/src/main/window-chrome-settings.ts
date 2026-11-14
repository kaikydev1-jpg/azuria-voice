import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { renameWithRetry } from './rename-retry';
import { sendToLiveWindow } from './window-safety';
import {
  CHROME_PREFERENCES,
  chooseWindowChrome,
  type ChromePreference,
  type DesktopInfo,
  type WindowChrome,
} from './window-chrome';

/** Main-process window preferences, kept in `userData/window-chrome.json`. */
export interface WindowPrefs {
  /** Window-button style picked in Settings → Appearance. */
  chrome: ChromePreference;
  /** Closing the window keeps Azúria in the tray (on every system). */
  closeToTray: boolean;
  /** The one-time "Azúria keeps running near the clock" notice was shown. */
  trayNoticeShown: boolean;
}

export const DEFAULT_WINDOW_PREFS: WindowPrefs = {
  chrome: 'auto',
  closeToTray: true,
  trayNoticeShown: false,
};

export function parseWindowPrefs(raw: unknown): WindowPrefs {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof WindowPrefs, unknown>>;
  return {
    chrome: CHROME_PREFERENCES.includes(value.chrome as ChromePreference)
      ? (value.chrome as ChromePreference)
      : DEFAULT_WINDOW_PREFS.chrome,
    closeToTray: typeof value.closeToTray === 'boolean' ? value.closeToTray : DEFAULT_WINDOW_PREFS.closeToTray,
    trayNoticeShown:
      typeof value.trayNoticeShown === 'boolean' ? value.trayNoticeShown : DEFAULT_WINDOW_PREFS.trayNoticeShown,
  };
}

export class WindowPrefsStore {
  private pending: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly path: string,
    private prefs: WindowPrefs,
  ) {}

  static load(path: string): WindowPrefsStore {
    let raw: unknown = null;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      /* first run or a corrupt file: defaults */
    }
    return new WindowPrefsStore(path, parseWindowPrefs(raw));
  }

  get(): WindowPrefs {
    return { ...this.prefs };
  }

  /** Atomic write (temp file + rename), serialized so updates never interleave. */
  update(patch: Partial<WindowPrefs>): Promise<WindowPrefs> {
    const run = this.pending.then(async () => {
      this.prefs = parseWindowPrefs({ ...this.prefs, ...patch });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, JSON.stringify(this.prefs), 'utf8');
      await renameWithRetry(temporary, this.path);
      return this.get();
    });
    this.pending = run.catch(() => {});
    return run;
  }
}

export type WindowChromeState = WindowChrome & { preference: ChromePreference };

/**
 * Which buttons the window shows now, and what a new preference changes.
 * Linux redraws at once (the renderer draws every style); Windows keeps the
 * open window's native caption buttons until the app reopens, because
 * `titleBarOverlay` is fixed when the window is created.
 */
export class ChromeController {
  readonly startup: WindowChrome;
  private chrome: WindowChrome;
  private preference: ChromePreference;

  constructor(
    private readonly info: DesktopInfo,
    preference: ChromePreference,
    private readonly onChange: (state: WindowChromeState) => void,
  ) {
    this.preference = preference;
    this.startup = chooseWindowChrome(info, preference);
    this.chrome = this.startup;
  }

  current(): WindowChromeState {
    return { ...this.chrome, preference: this.preference };
  }

  setPreference(next: ChromePreference): { restartRequired: boolean } {
    if (!CHROME_PREFERENCES.includes(next)) throw new Error(`Unknown window style: ${String(next)}`);
    this.preference = next;
    const chosen = chooseWindowChrome(this.info, next);
    if (chosen.native !== this.startup.native) return { restartRequired: true };
    if (!chosen.native) {
      this.chrome = chosen;
      this.onChange(this.current());
    }
    return { restartRequired: false };
  }
}

/** Push `window:focused` so drawn buttons can turn grey in the background. */
export function wireWindowFocusEvents(win: BrowserWindow): void {
  win.on('focus', () => sendToLiveWindow(win, 'window:focused', true));
  win.on('blur', () => sendToLiveWindow(win, 'window:focused', false));
}

/**
 * `window:chrome` (current buttons + preference) and
 * `window:setChromePreference` (persisted, returns whether a reopen is needed).
 * `assertTrusted` is the same main-frame check every other settings IPC uses.
 */
export function registerWindowChromeIpc(
  ipc: Pick<IpcMain, 'handle'>,
  controller: ChromeController,
  store: WindowPrefsStore,
  assertTrusted: (event: IpcMainInvokeEvent) => void,
): void {
  ipc.handle('window:chrome', (event) => {
    assertTrusted(event);
    return controller.current();
  });
  ipc.handle('window:setChromePreference', async (event, preference: unknown) => {
    assertTrusted(event);
    const result = controller.setPreference(preference as ChromePreference);
    await store.update({ chrome: preference as ChromePreference });
    return result;
  });
}
