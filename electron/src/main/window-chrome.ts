import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Window buttons that feel at home on each system (integrated title bar).
 *
 * Windows keeps its native Windows 11 caption buttons (titleBarOverlay) and
 * macOS its native traffic lights. On Linux the app draws its own buttons and
 * follows the side, order and set the desktop uses (`gtk-decoration-layout`,
 * filled by GNOME and KDE), in the style of the desktop: GNOME (Adwaita), KDE
 * (Breeze) or Mac dots. On Matsu OS — the owner's Fedora Atomic based system —
 * the buttons are its exact dots, automatically.
 *
 * The rule is a port of `escolher()` in kaikydev1-jpg/Ignis
 * crates/ignis-core/src/janela.rs, with the same test cases.
 */
export type WindowButton = 'close' | 'minimize' | 'maximize';
export type ChromeStyle = 'windows' | 'gnome' | 'kde' | 'mac' | 'matsu';
/** What a person can pick in Settings → Appearance. Matsu OS is automatic only. */
export type ChromePreference = 'auto' | 'windows' | 'gnome' | 'kde' | 'mac';
export const CHROME_PREFERENCES: readonly ChromePreference[] = ['auto', 'windows', 'gnome', 'kde', 'mac'];

export interface DesktopInfo {
  os: 'windows' | 'linux' | 'mac';
  /** `gtk-decoration-layout`, e.g. "appmenu:close" or "close,minimize,maximize:". */
  layout?: string;
  /** GTK theme name, e.g. "Adwaita-dark" or "WhiteSur-Dark". */
  theme?: string;
  /** `XDG_CURRENT_DESKTOP`, e.g. "GNOME", "KDE", "ubuntu:GNOME". */
  desktop?: string;
  matsu: boolean;
}

export interface WindowChrome {
  style: ChromeStyle;
  left: WindowButton[];
  right: WindowButton[];
  /** True when the system draws the buttons itself (nothing for the renderer to draw). */
  native: boolean;
}

const BUTTONS: readonly WindowButton[] = ['close', 'minimize', 'maximize'];
const GTK_DEFAULT = 'menu:minimize,maximize,close';
const WINDOWS_LAYOUT = ':minimize,maximize,close';
const MAC_LAYOUT = 'close,minimize,maximize:';
const MAC_THEMES = [
  'whitesur', 'mojave', 'catalina', 'bigsur', 'monterey', 'ventura', 'sonoma', 'sequoia',
  'macos', 'cupertino', 'mcos', 'osx',
];

export function parseLayout(layout: string): { left: WindowButton[]; right: WindowButton[] } {
  const split = layout.indexOf(':');
  const [leftText, rightText] = split < 0 ? ['', layout] : [layout.slice(0, split), layout.slice(split + 1)];
  const side = (text: string) => {
    const out: WindowButton[] = [];
    for (const raw of text.split(',')) {
      const button = raw.trim() as WindowButton;
      if (BUTTONS.includes(button) && !out.includes(button)) out.push(button);
    }
    return out;
  };
  const left = side(leftText);
  return { left, right: side(rightText).filter((button) => !left.includes(button)) };
}

function macTheme(theme: string): boolean {
  const normalized = theme.toLowerCase().replace(/[\s_-]/g, '');
  return MAC_THEMES.some((name) => normalized.includes(name));
}

function build(style: ChromeStyle, layout: string, native = false): WindowChrome {
  const { left, right } = parseLayout(layout);
  if (!left.length && !right.length) right.push('close'); // never leave a window without close
  return { style, left, right, native };
}

export function chooseWindowChrome(info: DesktopInfo, preferred: ChromePreference): WindowChrome {
  if (info.os === 'mac') return build('mac', MAC_LAYOUT, true);
  const linux = info.os === 'linux';
  const systemLayout = info.layout?.trim();
  const usable =
    systemLayout &&
    (parseLayout(systemLayout).left.length > 0 || parseLayout(systemLayout).right.length > 0)
      ? systemLayout
      : undefined;
  switch (preferred) {
    case 'windows':
      return build('windows', WINDOWS_LAYOUT, info.os === 'windows');
    case 'mac':
      return build('mac', MAC_LAYOUT);
    case 'gnome':
    case 'kde':
      return build(preferred, linux ? (usable ?? GTK_DEFAULT) : WINDOWS_LAYOUT);
    default:
      break;
  }
  if (info.os === 'windows') return build('windows', WINDOWS_LAYOUT, true);
  if (info.matsu) return build('matsu', usable ?? MAC_LAYOUT);
  const layout = usable ?? GTK_DEFAULT;
  const desktop = (info.desktop ?? '').toUpperCase();
  const style: ChromeStyle = desktop.includes('PANTHEON')
    ? 'gnome'
    : (info.theme && macTheme(info.theme)) || parseLayout(layout).left.includes('close')
      ? 'mac'
      : desktop.includes('KDE')
        ? 'kde'
        : 'gnome';
  return build(style, layout);
}

// ── Reading the system ─────────────────────────────────────────────────────

type Read = (path: string) => string;
type Run = (command: string, args: string[]) => string | null;

const OS_RELEASE_PATHS = ['/run/host/os-release', '/etc/os-release', '/usr/lib/os-release'];

/** The first os-release that exists; inside a Flatpak the host's comes first. */
export function readOsRelease(read: Read = (path) => readFileSync(path, 'utf8')): string | null {
  for (const path of OS_RELEASE_PATHS) {
    try {
      return read(path);
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/** Matsu OS ("Matsu 27 OS", "Matsu 28 OS"…): ID, NAME or PRETTY_NAME holds "matsu". */
export function isMatsuOsRelease(text: string): boolean {
  return text.split(/\r?\n/).some((line) => {
    const [key, ...rest] = line.split('=');
    return (
      ['ID', 'NAME', 'PRETTY_NAME'].includes(key.trim()) &&
      rest.join('=').toLowerCase().replace(/[\s_"'-]/g, '').includes('matsu')
    );
  });
}

function unquote(value: string | null | undefined): string | undefined {
  const text = value?.trim().replace(/^['"]|['"]$/g, '').trim();
  return text ? text : undefined;
}

function iniValue(text: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm').exec(text);
  return match ? unquote(match[1]) ?? '' : undefined;
}

function kwinLayout(text: string): string | undefined {
  const letters: Record<string, WindowButton> = { X: 'close', I: 'minimize', A: 'maximize' };
  const left = iniValue(text, 'ButtonsOnLeft');
  const right = iniValue(text, 'ButtonsOnRight');
  if (left === undefined && right === undefined) return undefined;
  const side = (value = '') => [...value].map((c) => letters[c]).filter(Boolean).join(',');
  return `${side(left)}:${side(right)}`;
}

function defaultRun(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

export function readDesktopInfo(
  platform: NodeJS.Platform = process.platform,
  run: Run = defaultRun,
  read: Read = (path) => readFileSync(path, 'utf8'),
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): DesktopInfo {
  if (platform === 'win32') return { os: 'windows', matsu: false };
  if (platform === 'darwin') return { os: 'mac', matsu: false };
  const readText = (path: string) => {
    try {
      return read(path);
    } catch {
      return undefined;
    }
  };
  const desktop = env.XDG_CURRENT_DESKTOP || undefined;
  const config = env.XDG_CONFIG_HOME || join(home, '.config');
  const gtkIni = readText(join(config, 'gtk-3.0', 'settings.ini')) ?? readText(join(config, 'gtk-4.0', 'settings.ini'));
  const kwin = readText(join(config, 'kwinrc'));
  const fromGsettings = unquote(run('gsettings', ['get', 'org.gnome.desktop.wm.preferences', 'button-layout']));
  const fromIni = gtkIni ? iniValue(gtkIni, 'gtk-decoration-layout') : undefined;
  const fromKwin = kwin ? kwinLayout(kwin) : undefined;
  const kde = (desktop ?? '').toUpperCase().includes('KDE');
  const layout = kde ? (fromKwin ?? fromIni ?? fromGsettings) : (fromGsettings ?? fromIni ?? fromKwin);
  const theme =
    unquote(run('gsettings', ['get', 'org.gnome.desktop.interface', 'gtk-theme'])) ??
    (gtkIni ? iniValue(gtkIni, 'gtk-theme-name') : undefined);
  const osRelease = readOsRelease(read);
  return {
    os: 'linux',
    ...(layout !== undefined ? { layout } : {}),
    ...(theme ? { theme } : {}),
    ...(desktop ? { desktop } : {}),
    matsu: osRelease ? isMatsuOsRelease(osRelease) : false,
  };
}
