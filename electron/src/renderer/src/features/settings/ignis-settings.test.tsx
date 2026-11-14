import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiJson: mock.api,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

import { IgnisCard, type IgnisStatus } from './ignis-settings';

const open: IgnisStatus = {
  open: true,
  enabled: false,
  version: '0.3.0',
  gpu: 'AMD Radeon RX 580',
  base_url: 'http://127.0.0.1:11470',
  voice: { ready: true, backend: 'vulkan', missing_bytes: 0, license: 'CC BY-NC 4.0', commercial_use: false },
  transcription: { ready: true, missing_bytes: 0 },
  download_url: 'https://github.com/kaikydev1-jpg/Ignis/releases/latest',
  platform_supported: true,
};

function mount(status: IgnisStatus, variant: 'setup' | 'settings' = 'settings') {
  mock.api.mockImplementation((path: string) => {
    if (path === '/api/settings/ignis/status') return Promise.resolve(status);
    if (path === '/api/settings/ignis/enable') return Promise.resolve({ ...status, enabled: true });
    if (path === '/api/settings/ignis/disable') return Promise.resolve({ ...status, enabled: false });
    if (path === '/api/settings/ignis/prepare') return Promise.resolve({ ok: true });
    return Promise.reject(new Error('unexpected ' + path));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <IgnisCard variant={variant} />
    </QueryClientProvider>,
  );
  return { invalidate };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('asks to open Ignis, with its download link, when it is closed', async () => {
  mount({ ...open, open: false, gpu: null });
  expect(await screen.findByText('ignis.closed_title')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /ignis.download/ })).toHaveAttribute('href', open.download_url);
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ignis.check_again' }));
  await waitFor(() =>
    expect(mock.api.mock.calls.filter(([path]) => path === '/api/settings/ignis/status')).toHaveLength(2),
  );
});

it('shows the GPU and an off switch when Ignis is open', async () => {
  mount(open);
  const toggle = await screen.findByRole('switch', { name: 'ignis.switch_title' });
  expect(toggle).not.toBeChecked();
  expect(screen.getByText(/AMD Radeon RX 580/)).toBeInTheDocument();
});

it('turns the GPU mode on and refreshes every engine choice it touched', async () => {
  const { invalidate } = mount(open);
  fireEvent.click(await screen.findByRole('switch', { name: 'ignis.switch_title' }));
  await waitFor(() =>
    expect(mock.api).toHaveBeenCalledWith('/api/settings/ignis/enable', expect.objectContaining({ method: 'POST' })),
  );
  await waitFor(() => {
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    for (const key of ['["engines"]', '["llm-providers"]', '["asr-openai-compat"]'])
      expect(keys).toContain(key);
  });
});

it('recommends Ignis in setup when the GPU is not NVIDIA', async () => {
  mount(open, 'setup');
  expect(await screen.findByText('ignis.recommended')).toBeInTheDocument();
});

it('does not push Ignis on NVIDIA machines', async () => {
  mount({ ...open, gpu: 'NVIDIA GeForce RTX 3060' }, 'setup');
  await screen.findByRole('switch', { name: 'ignis.switch_title' });
  expect(screen.queryByText('ignis.recommended')).not.toBeInTheDocument();
});

it('shows size and the non-commercial license before preparing the voice', async () => {
  mount({ ...open, voice: { ...open.voice, ready: false, backend: null, missing_bytes: 1_200_000_000 } });
  fireEvent.click(await screen.findByRole('button', { name: 'ignis.prepare' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('1.2 GB');
  expect(dialog.textContent).toContain('CC BY-NC 4.0');
  fireEvent.click(screen.getByRole('button', { name: 'ignis.prepare_confirm' }));
  await waitFor(() =>
    expect(mock.api).toHaveBeenCalledWith(
      '/api/settings/ignis/prepare',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ families: ['voz'] }) }),
    ),
  );
});

it('says Ignis has no macOS build instead of offering a download', async () => {
  mount({ ...open, open: false, gpu: null, platform_supported: false });
  expect(await screen.findByText('ignis.mac_unsupported')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

class Boundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  render() {
    return this.state.crashed ? <p>CRASHED</p> : this.props.children;
  }
}

function mountGuarded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Boundary>
        <div data-testid="host">
          <IgnisCard variant="settings" />
        </div>
      </Boundary>
    </QueryClientProvider>,
  );
}

it('stays out of the way on a backend without the Ignis routes', async () => {
  mock.api.mockImplementation((path: string) =>
    path === '/api/settings/ignis/status'
      ? Promise.reject(Object.assign(new Error('Not Found'), { status: 404 }))
      : Promise.reject(new Error(path)),
  );
  mountGuarded();
  await waitFor(() => expect(mock.api).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId('host')).toBeEmptyDOMElement());
  expect(screen.queryByText('CRASHED')).not.toBeInTheDocument();
});

it('ignores a malformed status instead of crashing', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mock.api.mockResolvedValue({ models_ready: true });
  mountGuarded();
  await waitFor(() => expect(mock.api).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.queryByText('CRASHED')).not.toBeInTheDocument();
  expect(screen.getByTestId('host')).toBeEmptyDOMElement();
});
