import { describe, expect, it, vi } from 'vitest';
import { closeAction, reopenWindow, shouldShowTrayNotice } from './close-policy';

describe('closeAction', () => {
  it('keeps Azúria in the tray on Windows, Linux and macOS by default', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const)
      expect(closeAction({ quitting: false, platform, closeToTray: true, trayAvailable: true })).toBe('hide');
  });

  it('quits on Windows and Linux when the person turned the tray off', () => {
    for (const platform of ['win32', 'linux'] as const)
      expect(closeAction({ quitting: false, platform, closeToTray: false, trayAvailable: true })).toBe('quit');
  });

  it('keeps the macOS behavior (app stays in the Dock) even with the tray off', () => {
    expect(closeAction({ quitting: false, platform: 'darwin', closeToTray: false, trayAvailable: true })).toBe('hide');
  });

  it('quits when there is no tray icon to come back from', () => {
    expect(closeAction({ quitting: false, platform: 'linux', closeToTray: true, trayAvailable: false })).toBe('quit');
  });

  it('lets an orderly quit through', () => {
    expect(closeAction({ quitting: true, platform: 'linux', closeToTray: true, trayAvailable: true })).toBe('allow');
  });
});

describe('shouldShowTrayNotice', () => {
  it('explains once, the first time the window hides on Windows or Linux', () => {
    expect(shouldShowTrayNotice({ action: 'hide', platform: 'linux', noticeShown: false })).toBe(true);
    expect(shouldShowTrayNotice({ action: 'hide', platform: 'win32', noticeShown: true })).toBe(false);
    expect(shouldShowTrayNotice({ action: 'quit', platform: 'linux', noticeShown: false })).toBe(false);
    expect(shouldShowTrayNotice({ action: 'hide', platform: 'darwin', noticeShown: false })).toBe(false);
  });
});

describe('reopenWindow (second launch, tray click)', () => {
  it('creates the window again when it was closed to the tray', () => {
    const created = { id: 'new' };
    const create = vi.fn(() => created);
    const activate = vi.fn();
    expect(reopenWindow(null, () => false, create, activate)).toBe(created);
    expect(create).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith(created);
  });

  it('just brings back a live window', () => {
    const live = { id: 'live' };
    const create = vi.fn();
    const activate = vi.fn();
    expect(reopenWindow(live, () => true, create, activate)).toBe(live);
    expect(create).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledWith(live);
  });
});
