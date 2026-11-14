import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { CloseToTraySettings } from './close-to-tray-settings';

const setCloseToTray = vi.fn((value: boolean) => Promise.resolve(value));

function install(platform: string, closeToTray: boolean) {
  (window as unknown as { voicestudio: unknown }).voicestudio = {
    app: { platform, version: '0.0.0-test', closeToTray: () => Promise.resolve(closeToTray), setCloseToTray },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as { voicestudio?: unknown }).voicestudio;
});

it('shows the tray choice on, by default, on Windows and Linux', async () => {
  install('linux', true);
  render(<CloseToTraySettings />);
  const toggle = await screen.findByRole('switch', { name: 'windowControls.tray_title' });
  await waitFor(() => expect(toggle).toBeChecked());
});

it('lets the person make closing quit instead', async () => {
  install('win32', true);
  render(<CloseToTraySettings />);
  const toggle = await screen.findByRole('switch', { name: 'windowControls.tray_title' });
  await waitFor(() => expect(toggle).toBeChecked());
  fireEvent.click(toggle);
  await waitFor(() => expect(setCloseToTray).toHaveBeenCalledWith(false));
  await waitFor(() => expect(toggle).not.toBeChecked());
});

it('is not shown on macOS (the Dock keeps the app) or outside the desktop app', async () => {
  install('darwin', true);
  const mac = render(<CloseToTraySettings />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mac.container).toBeEmptyDOMElement();
  cleanup();
  delete (window as unknown as { voicestudio?: unknown }).voicestudio;
  expect(render(<CloseToTraySettings />).container).toBeEmptyDOMElement();
});
