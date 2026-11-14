import { describe, expect, it } from 'vitest';
import {
  chooseWindowChrome,
  isMatsuOsRelease,
  parseLayout,
  readDesktopInfo,
  readOsRelease,
  type DesktopInfo,
} from './window-chrome';

// Cases ported from kaikydev1-jpg/Ignis crates/ignis-core/src/janela.rs, the
// owner's reference implementation of "follow the system's window buttons".
const linux = (layout?: string, theme?: string, desktop?: string): DesktopInfo => ({
  os: 'linux',
  layout,
  theme,
  desktop,
  matsu: false,
});
const ALL = ['minimize', 'maximize', 'close'];
const MAC = ['close', 'minimize', 'maximize'];

describe('chooseWindowChrome', () => {
  it('keeps the native Windows 11 buttons on Windows', () => {
    expect(chooseWindowChrome({ os: 'windows', matsu: false }, 'auto')).toEqual({
      style: 'windows',
      left: [],
      right: ALL,
      native: true,
    });
  });

  it('keeps the native traffic lights on macOS, whatever the preference', () => {
    const chrome = chooseWindowChrome({ os: 'mac', matsu: false }, 'gnome');
    expect(chrome).toEqual({ style: 'mac', left: MAC, right: [], native: true });
  });

  it('follows stock GNOME, which shows only close', () => {
    const chrome = chooseWindowChrome(linux('appmenu:close', 'Adwaita', 'GNOME'), 'auto');
    expect(chrome).toMatchObject({ style: 'gnome', left: [], right: ['close'], native: false });
    expect(
      chooseWindowChrome(linux('appmenu:minimize,maximize,close', 'Adwaita-dark', 'GNOME'), 'auto'),
    ).toMatchObject({ style: 'gnome', right: ALL });
  });

  it('turns buttons on the left into Mac dots in the system order', () => {
    expect(chooseWindowChrome(linux('close,minimize,maximize:', 'Adwaita', 'GNOME'), 'auto')).toEqual({
      style: 'mac',
      left: MAC,
      right: [],
      native: false,
    });
  });

  it('uses dots for Mac-like themes even on the right', () => {
    const chrome = chooseWindowChrome(linux(':minimize,maximize,close', 'WhiteSur-Dark', 'GNOME'), 'auto');
    expect(chrome).toMatchObject({ style: 'mac', right: ALL });
    for (const theme of ['McMojave-light', 'Big Sur'])
      expect(chooseWindowChrome(linux(':close', theme), 'auto').style).toBe('mac');
    expect(chooseWindowChrome(linux(':close', 'Breeze', 'KDE'), 'auto').style).toBe('kde');
  });

  it('uses the KDE style on KDE', () => {
    expect(
      chooseWindowChrome(linux('icon:minimize,maximize,close', 'Breeze', 'KDE'), 'auto'),
    ).toMatchObject({ style: 'kde', right: ALL });
  });

  it('falls back to the GTK default when the system says nothing', () => {
    expect(chooseWindowChrome(linux(), 'auto')).toMatchObject({ style: 'gnome', right: ALL });
    expect(chooseWindowChrome(linux('menu:'), 'auto').right).toEqual(ALL);
  });

  it('lets a manual choice win over the automatic one', () => {
    const gnome = linux(':minimize,maximize,close', 'Adwaita', 'GNOME');
    expect(chooseWindowChrome(gnome, 'mac')).toMatchObject({ style: 'mac', left: MAC });
    expect(chooseWindowChrome(linux('close,minimize,maximize:'), 'windows')).toMatchObject({
      style: 'windows',
      right: ALL,
      native: false,
    });
    expect(chooseWindowChrome(linux('close,minimize,maximize:'), 'kde')).toMatchObject({
      style: 'kde',
      left: MAC,
    });
  });

  it('draws custom buttons on Windows when another style is picked', () => {
    expect(chooseWindowChrome({ os: 'windows', matsu: false }, 'mac')).toEqual({
      style: 'mac',
      left: MAC,
      right: [],
      native: false,
    });
  });

  it('gives Matsu OS its own dots on the system side, automatically', () => {
    const matsu = { ...linux('close,minimize,maximize:', 'Adwaita-dark', 'GNOME'), matsu: true };
    expect(chooseWindowChrome(matsu, 'auto')).toEqual({
      style: 'matsu',
      left: MAC,
      right: [],
      native: false,
    });
    expect(chooseWindowChrome({ ...matsu, layout: undefined }, 'auto').left).toEqual(MAC);
    expect(
      chooseWindowChrome({ ...linux(':minimize,maximize,close'), matsu: true }, 'auto'),
    ).toMatchObject({ style: 'matsu', right: ALL });
    // A manual choice still wins over Matsu OS.
    expect(chooseWindowChrome({ ...linux(), matsu: true }, 'kde').style).toBe('kde');
  });

  it('keeps elementary OS on rounded buttons', () => {
    expect(
      chooseWindowChrome(
        linux('close:maximize', 'io.elementary.stylesheet.blueberry', 'Pantheon'),
        'auto',
      ),
    ).toEqual({ style: 'gnome', left: ['close'], right: ['maximize'], native: false });
  });
});

describe('parseLayout', () => {
  it('ignores unknown and repeated buttons', () => {
    expect(parseLayout(' close , close,spacer,icon : maximize,close,xyz')).toEqual({
      left: ['close'],
      right: ['maximize'],
    });
    expect(parseLayout('minimize,close')).toEqual({ left: [], right: ['minimize', 'close'] });
  });
});

describe('Matsu OS detection', () => {
  it('recognises every spelling of the name, whatever the year', () => {
    for (const text of [
      'NAME="Matsu 27 OS"',
      'NAME="Matsu 28 OS"\nID=fedora',
      'ID=matsu_os',
      'PRETTY_NAME="matsu-27-os (Atomic)"',
      'NAME="MatsuOS"',
    ])
      expect(isMatsuOsRelease(text)).toBe(true);
  });

  it('does not mistake other systems', () => {
    expect(isMatsuOsRelease('NAME=Fedora\nID=fedora\nVARIANT=matsu')).toBe(false);
    expect(isMatsuOsRelease('NAME="Ubuntu"')).toBe(false);
  });

  it('reads the host os-release first inside a Flatpak', () => {
    const files: Record<string, string> = {
      '/run/host/os-release': 'NAME="Matsu 27 OS"',
      '/etc/os-release': 'NAME="Freedesktop SDK"',
    };
    const read = (path: string) => {
      if (path in files) return files[path];
      throw new Error('ENOENT');
    };
    expect(readOsRelease(read)).toBe('NAME="Matsu 27 OS"');
    delete files['/run/host/os-release'];
    expect(readOsRelease(read)).toBe('NAME="Freedesktop SDK"');
    expect(readOsRelease(() => { throw new Error('ENOENT'); })).toBeNull();
  });
});

describe('readDesktopInfo', () => {
  const nothing = () => {
    throw new Error('ENOENT');
  };

  it('defaults to the GTK layout with close when nothing answers', () => {
    const info = readDesktopInfo('linux', () => null, nothing, {}, '/home/x');
    expect(info).toMatchObject({ os: 'linux', matsu: false });
    expect(chooseWindowChrome(info, 'auto').right).toContain('close');
  });

  it('reads the GNOME button layout and theme from gsettings', () => {
    const run = (command: string, args: string[]) =>
      command === 'gsettings' && args.includes('button-layout')
        ? "'close,minimize,maximize:'\n"
        : command === 'gsettings' && args.includes('gtk-theme')
          ? "'Adwaita-dark'\n"
          : null;
    const info = readDesktopInfo('linux', run, nothing, { XDG_CURRENT_DESKTOP: 'GNOME' }, '/home/x');
    expect(info).toMatchObject({ layout: 'close,minimize,maximize:', theme: 'Adwaita-dark', desktop: 'GNOME' });
  });

  it('falls back to the GTK settings.ini, then to kwinrc', () => {
    const ini = { '/home/x/.config/gtk-3.0/settings.ini': '[Settings]\ngtk-decoration-layout=close:\n' };
    const fromIni = readDesktopInfo('linux', () => null, (p) => {
      if (p in ini) return ini[p as keyof typeof ini];
      throw new Error('ENOENT');
    }, {}, '/home/x');
    expect(fromIni.layout).toBe('close:');
    const kwin = { '/home/x/.config/kwinrc': '[org.kde.kdecoration2]\nButtonsOnLeft=XIA\nButtonsOnRight=\n' };
    const fromKwin = readDesktopInfo('linux', () => null, (p) => {
      if (p in kwin) return kwin[p as keyof typeof kwin];
      throw new Error('ENOENT');
    }, { XDG_CURRENT_DESKTOP: 'KDE' }, '/home/x');
    expect(fromKwin.layout).toBe('close,minimize,maximize:');
  });

  it('marks Matsu OS from os-release', () => {
    const read = (p: string) => {
      if (p === '/etc/os-release') return 'NAME="Matsu 27 OS"\nID=matsu';
      throw new Error('ENOENT');
    };
    expect(readDesktopInfo('linux', () => null, read, {}, '/home/x').matsu).toBe(true);
  });

  it('reports Windows and macOS without probing Linux settings', () => {
    const run = () => {
      throw new Error('should not run');
    };
    expect(readDesktopInfo('win32', run, nothing, {}, 'C:/Users/x')).toEqual({ os: 'windows', matsu: false });
    expect(readDesktopInfo('darwin', run, nothing, {}, '/Users/x')).toEqual({ os: 'mac', matsu: false });
  });
});
