import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { WindowChromeState } from '../../../../preload/index.d';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const setChromePreference = vi.fn();

function install(platform: string, preference: WindowChromeState['preference'], restartRequired = false) {
  setChromePreference.mockResolvedValue({ restartRequired });
  const chrome: WindowChromeState = {
    style: platform === 'win32' ? 'windows' : 'gnome',
    left: [],
    right: ['minimize', 'maximize', 'close'],
    native: platform === 'win32',
    preference,
  };
  (window as unknown as { voicestudio: unknown }).voicestudio = {
    app: { platform, version: '0.0.0-test' },
    window: {
      chrome: () => Promise.resolve(chrome),
      onChromeChange: () => () => {},
      setChromePreference,
    },
  };
}

async function mount() {
  const { resetWindowChromeForTests } = await import('@/components/app-shell/window-controls');
  resetWindowChromeForTests();
  const { WindowStyleSettings } = await import('./window-style-settings');
  return render(<WindowStyleSettings />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as { voicestudio?: unknown }).voicestudio;
});

it('offers Automatic, Windows, GNOME, KDE and Mac on Linux, with the current one pressed', async () => {
  install('linux', 'kde');
  await mount();
  expect(await screen.findByRole('button', { name: 'KDE' })).toHaveAttribute('aria-pressed', 'true');
  for (const name of ['windowControls.style_auto', 'Windows', 'GNOME', 'Mac'])
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('button', { name: /matsu/i })).not.toBeInTheDocument();
});

it('applies a new style right away on Linux', async () => {
  install('linux', 'auto');
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Mac' }));
  expect(setChromePreference).toHaveBeenCalledWith('mac');
  await screen.findByRole('button', { name: 'Mac' });
  expect(screen.queryByText('windowControls.restart_hint')).not.toBeInTheDocument();
});

it('says the change applies after reopening on Windows', async () => {
  install('win32', 'auto', true);
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: 'GNOME' }));
  expect(await screen.findByText('windowControls.restart_hint')).toBeInTheDocument();
});

it('is not shown on macOS or outside the desktop app', async () => {
  install('darwin', 'auto');
  const mac = await mount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mac.container).toBeEmptyDOMElement();
  cleanup();
  delete (window as unknown as { voicestudio?: unknown }).voicestudio;
  const web = await mount();
  expect(web.container).toBeEmptyDOMElement();
});
