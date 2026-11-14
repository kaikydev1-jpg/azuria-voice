import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { WindowButton, WindowChromeState } from '../../../../preload/index.d';
import { isMac } from '../bridge';

/** The preload bridge, read directly so tests that stub `../bridge` keep working. */
function getBridge(): Window['voicestudio'] | null {
  if (typeof window === 'undefined') return null;
  return (window as { voicestudio?: Window['voicestudio'] }).voicestudio ?? null;
}
import './window-controls.css';

/*
 * Integrated title bar buttons drawn by the app (Linux, or a non-native style
 * picked on Windows). The main process decides the style, side and order
 * (electron/src/main/window-chrome.ts): Matsu OS dots, Mac dots, GNOME
 * (Adwaita), KDE (Breeze) or Windows 11. Native buttons (Windows overlay,
 * macOS traffic lights) are never redrawn here. Drawings follow the owner's
 * reference app (kaikydev1-jpg/Ignis app/ui/app.js, MIT).
 */

let state: WindowChromeState | null = null;
let started = false;
const listeners = new Set<() => void>();

function publish(next: WindowChromeState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function start() {
  if (started) return;
  started = true;
  const api = getBridge()?.window;
  if (!api?.chrome) return;
  void api.chrome().then(publish, () => {});
  api.onChromeChange?.(publish);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current window chrome, or null outside Electron / before it is known. */
export function useWindowChrome(): WindowChromeState | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

/** True when window buttons sit on the left (macOS traffic lights or drawn ones). */
export function useLeftWindowControls(): boolean {
  const chrome = useWindowChrome();
  return isMac() || Boolean(chrome && !chrome.native && chrome.left.length > 0);
}

/** Test seam: forget the cached chrome so each test starts from the bridge. */
export function resetWindowChromeForTests() {
  state = null;
  started = false;
  listeners.clear();
}

type Box = number;
const ICONS: Record<string, { box: Box; minimize: ReactNode; maximize: ReactNode; restore: ReactNode; close: ReactNode }> = {
  windows: {
    box: 10,
    minimize: <path d="M0 5.5h10" />,
    maximize: <rect x=".5" y=".5" width="9" height="9" rx="1" />,
    restore: (
      <>
        <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
        <rect x=".5" y="2.5" width="7" height="7" rx="1" />
      </>
    ),
    close: <path d="M.5.5l9 9M9.5.5l-9 9" />,
  },
  gnome: {
    box: 16,
    minimize: <path d="M4.5 11.5h7" />,
    maximize: <rect x="4" y="4" width="8" height="8" rx="1.5" />,
    restore: (
      <>
        <rect x="3.5" y="6" width="6.5" height="6.5" rx="1.2" />
        <path d="M6 4h5a1 1 0 0 1 1 1v5" />
      </>
    ),
    close: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  },
  kde: {
    box: 16,
    minimize: <path d="M4 6.5l4 4 4-4" />,
    maximize: <path d="M4 10l4-4 4 4" />,
    restore: <path d="M8 3.5l4.5 4.5L8 12.5 3.5 8z" />,
    close: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  },
  // Mac and Matsu OS: thin × and −, and the green full-screen triangles.
  mac: {
    box: 12,
    minimize: <path d="M2.8 6h6.4" />,
    maximize: <path d="M3.4 3.3h3.3L3.4 6.6zM8.6 8.7H5.3l3.3-3.3z" fill="currentColor" stroke="none" />,
    restore: <path d="M5.7 5.7H2.9l2.8-2.8zM6.3 6.3h2.8L6.3 9.1z" fill="currentColor" stroke="none" />,
    close: <path d="M3.7 3.7l4.6 4.6M8.3 3.7L3.7 8.3" />,
  },
};

/** Width of one side's button group (edge padding on both sides + buttons + gaps). */
const GEOMETRY: Record<string, { size: number; gap: number; padding: number }> = {
  windows: { size: 46, gap: 0, padding: 0 },
  gnome: { size: 24, gap: 12, padding: 10 },
  kde: { size: 24, gap: 6, padding: 8 },
  mac: { size: 12, gap: 8, padding: 14 },
  matsu: { size: 12, gap: 8, padding: 14 },
};

export function groupWidth(style: string, count: number): number {
  if (count === 0) return 0;
  const { size, gap, padding } = GEOMETRY[style] ?? GEOMETRY.windows;
  return padding * 2 + size * count + gap * (count - 1);
}

export function WindowControls() {
  const { t } = useTranslation();
  const chrome = useWindowChrome();
  const [focused, setFocused] = useState(() => (typeof document === 'undefined' ? true : document.hasFocus()));
  const [maximized, setMaximized] = useState(false);
  const drawn = chrome && !chrome.native ? chrome : null;

  useEffect(() => {
    const api = getBridge()?.window;
    if (!api || !drawn) return;
    void api.isMaximized?.().then(setMaximized, () => {});
    const offFocus = api.onFocusChange?.(setFocused);
    const offMax = api.onMaximizedChange?.(setMaximized);
    return () => {
      offFocus?.();
      offMax?.();
    };
  }, [drawn]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!drawn) {
      root.removeAttribute('data-window-chrome');
      root.removeAttribute('data-window-os');
      root.style.removeProperty('--window-controls-left');
      root.style.removeProperty('--window-controls-right');
      return;
    }
    root.setAttribute('data-window-chrome', drawn.style);
    root.setAttribute('data-window-os', getBridge()?.app.platform === 'linux' ? 'linux' : 'other');
    root.style.setProperty('--window-controls-left', `${groupWidth(drawn.style, drawn.left.length)}px`);
    root.style.setProperty('--window-controls-right', `${groupWidth(drawn.style, drawn.right.length)}px`);
  }, [drawn]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-window-inactive', Boolean(drawn) && !focused);
    root.toggleAttribute('data-window-maximized', Boolean(drawn) && maximized);
  }, [drawn, focused, maximized]);

  if (!drawn) return null;
  const icons = ICONS[drawn.style === 'matsu' ? 'mac' : drawn.style] ?? ICONS.windows;
  const api = getBridge()?.window;
  const label = (button: WindowButton) =>
    button === 'maximize'
      ? t(maximized ? 'windowControls.restore' : 'windowControls.maximize')
      : t(`windowControls.${button}`);
  const act = (button: WindowButton) => {
    if (button === 'minimize') api?.minimize();
    else if (button === 'maximize') api?.toggleMaximize();
    else api?.close();
  };
  const group = (side: 'left' | 'right', buttons: WindowButton[]) =>
    buttons.length > 0 && (
      <div
        role="group"
        aria-label={t('windowControls.group')}
        data-side={side}
        className="window-controls app-no-drag"
      >
        {buttons.map((button) => (
          <button
            key={button}
            type="button"
            tabIndex={-1}
            data-button={button}
            className="window-control"
            aria-label={label(button)}
            title={label(button)}
            onClick={() => act(button)}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <svg viewBox={`0 0 ${icons.box} ${icons.box}`} aria-hidden="true">
              {button === 'maximize' ? (maximized ? icons.restore : icons.maximize) : icons[button]}
            </svg>
          </button>
        ))}
      </div>
    );
  return (
    <>
      {group('left', drawn.left)}
      {group('right', drawn.right)}
    </>
  );
}
