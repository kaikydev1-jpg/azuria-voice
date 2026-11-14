/**
 * What closing the main window does (owner's rule, 2026-11-14): on every
 * system Azúria keeps running in the tray, so dictation and voice keep
 * working; the window itself is destroyed so its memory is really freed.
 * "Exit" in the tray menu quits. People can turn this off in Settings, and
 * macOS keeps its usual Dock behavior either way.
 */
export type CloseAction = 'allow' | 'hide' | 'quit';

export function closeAction(options: {
  quitting: boolean;
  platform: NodeJS.Platform;
  closeToTray: boolean;
  trayAvailable: boolean;
}): CloseAction {
  if (options.quitting) return 'allow';
  if (options.platform === 'darwin') return 'hide';
  return options.closeToTray && options.trayAvailable ? 'hide' : 'quit';
}

/** The one-time "still running near the clock" notice (Windows and Linux). */
export function shouldShowTrayNotice(options: {
  action: CloseAction;
  platform: NodeJS.Platform;
  noticeShown: boolean;
}): boolean {
  return options.action === 'hide' && options.platform !== 'darwin' && !options.noticeShown;
}

/** Bring the main window back, creating it again when it was closed to the tray. */
export function reopenWindow<W>(
  current: W | null,
  isLive: (window: W | null) => boolean,
  create: () => W,
  activate: (window: W) => void,
): W {
  const window = current && isLive(current) ? current : create();
  activate(window);
  return window;
}
