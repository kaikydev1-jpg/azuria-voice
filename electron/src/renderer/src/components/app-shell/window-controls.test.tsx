import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WindowChromeState } from '../../../../preload/index.d';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

type Listener<T> = (value: T) => void;
const bridge = vi.hoisted(() => ({
  chrome: null as unknown as WindowChromeState,
  focus: [] as Listener<boolean>[],
  maximized: [] as Listener<boolean>[],
  changed: [] as Listener<WindowChromeState>[],
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
}));

function installBridge(chrome: WindowChromeState) {
  bridge.chrome = chrome;
  (window as unknown as { voicestudio: unknown }).voicestudio = {
    app: { platform: 'linux', version: '0.0.0-test' },
    window: {
      chrome: () => Promise.resolve(bridge.chrome),
      onChromeChange: (cb: Listener<WindowChromeState>) => (bridge.changed.push(cb), () => {}),
      onFocusChange: (cb: Listener<boolean>) => (bridge.focus.push(cb), () => {}),
      onMaximizedChange: (cb: Listener<boolean>) => (bridge.maximized.push(cb), () => {}),
      isMaximized: () => Promise.resolve(false),
      minimize: bridge.minimize,
      toggleMaximize: bridge.toggleMaximize,
      close: bridge.close,
    },
  };
}

const matsu: WindowChromeState = {
  style: 'matsu',
  left: ['close', 'minimize', 'maximize'],
  right: [],
  native: false,
  preference: 'auto',
};

async function mount(chrome: WindowChromeState) {
  installBridge(chrome);
  const { WindowControls, resetWindowChromeForTests } = await import('./window-controls');
  resetWindowChromeForTests();
  render(<WindowControls />);
}

beforeEach(() => {
  bridge.focus = [];
  bridge.maximized = [];
  bridge.changed = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as { voicestudio?: unknown }).voicestudio;
  const root = document.documentElement;
  for (const name of ['data-window-chrome', 'data-window-inactive', 'data-window-maximized', 'data-window-os'])
    root.removeAttribute(name);
  root.style.removeProperty('--window-controls-left');
  root.style.removeProperty('--window-controls-right');
});

it('draws the Matsu OS dots on the system side, in the system order', async () => {
  await mount(matsu);
  const group = await screen.findByRole('group', { name: 'windowControls.group' });
  expect(group).toHaveAttribute('data-side', 'left');
  expect([...group.querySelectorAll('button')].map((b) => b.dataset.button)).toEqual([
    'close',
    'minimize',
    'maximize',
  ]);
  expect(document.documentElement).toHaveAttribute('data-window-chrome', 'matsu');
  expect(document.documentElement).toHaveAttribute('data-window-os', 'linux');
});

it('reserves the dots group width: 14 + 3×12 + 2×8 + 14 px', async () => {
  await mount(matsu);
  await screen.findByRole('group', { name: 'windowControls.group' });
  const style = document.documentElement.style;
  expect(style.getPropertyValue('--window-controls-left')).toBe('80px');
  expect(style.getPropertyValue('--window-controls-right')).toBe('0px');
});

it('turns grey in the background and back when focused', async () => {
  await mount(matsu);
  await screen.findByRole('group', { name: 'windowControls.group' });
  act(() => bridge.focus.forEach((cb) => cb(false)));
  expect(document.documentElement).toHaveAttribute('data-window-inactive');
  act(() => bridge.focus.forEach((cb) => cb(true)));
  expect(document.documentElement).not.toHaveAttribute('data-window-inactive');
});

it('follows stock GNOME with only a close button on the right', async () => {
  await mount({ style: 'gnome', left: [], right: ['close'], native: false, preference: 'auto' });
  const group = await screen.findByRole('group', { name: 'windowControls.group' });
  expect(group).toHaveAttribute('data-side', 'right');
  expect(group.querySelectorAll('button')).toHaveLength(1);
  expect(document.documentElement.style.getPropertyValue('--window-controls-right')).toBe('44px');
});

it('minimizes, maximizes and closes the window', async () => {
  await mount(matsu);
  fireEvent.click(await screen.findByRole('button', { name: 'windowControls.minimize' }));
  fireEvent.click(screen.getByRole('button', { name: 'windowControls.maximize' }));
  fireEvent.click(screen.getByRole('button', { name: 'windowControls.close' }));
  expect(bridge.minimize).toHaveBeenCalledOnce();
  expect(bridge.toggleMaximize).toHaveBeenCalledOnce();
  expect(bridge.close).toHaveBeenCalledOnce();
});

it('offers "restore" while the window is maximized', async () => {
  await mount(matsu);
  await screen.findByRole('button', { name: 'windowControls.maximize' });
  act(() => bridge.maximized.forEach((cb) => cb(true)));
  expect(screen.getByRole('button', { name: 'windowControls.restore' })).toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute('data-window-maximized');
});

it('redraws when the style changes in Settings', async () => {
  await mount(matsu);
  await screen.findByRole('group', { name: 'windowControls.group' });
  act(() =>
    bridge.changed.forEach((cb) =>
      cb({ style: 'kde', left: [], right: ['minimize', 'maximize', 'close'], native: false, preference: 'kde' }),
    ),
  );
  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-window-chrome', 'kde'));
  expect(screen.getByRole('group', { name: 'windowControls.group' })).toHaveAttribute('data-side', 'right');
});

it('draws nothing when the system draws its own buttons', async () => {
  await mount({ style: 'windows', left: [], right: ['minimize', 'maximize', 'close'], native: true, preference: 'auto' });
  await waitFor(() => expect(document.documentElement).not.toHaveAttribute('data-window-chrome'));
  expect(screen.queryByRole('group')).not.toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue('--window-controls-right')).toBe('');
});
