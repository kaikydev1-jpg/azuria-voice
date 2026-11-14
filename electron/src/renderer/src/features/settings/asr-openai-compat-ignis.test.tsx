import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ api: vi.fn(), ignisOpen: true }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiJson: mock.api,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { AsrOpenAiCompatSettings } from './asr-openai-compat-settings';

function mount() {
  mock.api.mockImplementation((path: string) => {
    if (path === '/api/settings/asr-openai-compat')
      return Promise.resolve({ base_url: 'http://localhost:8000/v1', model: 'whisper-large', has_key: false });
    if (path === '/api/settings/ignis/status')
      return Promise.resolve({
        open: mock.ignisOpen,
        enabled: false,
        version: '0.3.0',
        gpu: null,
        base_url: 'http://127.0.0.1:12001',
        voice: { ready: true, backend: 'vulkan', missing_bytes: 0, license: 'CC BY-NC 4.0', commercial_use: false },
        transcription: { ready: true, missing_bytes: 0 },
        download_url: 'https://github.com/kaikydev1-jpg/Ignis/releases/latest',
        platform_supported: true,
      });
    return Promise.reject(new Error(path));
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AsrOpenAiCompatSettings />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mock.ignisOpen = true;
});

it('fills the Ignis address and whisper-1 with one click', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'ignis.use_in_asr' }));
  expect(screen.getByRole('textbox', { name: 'settings.llmp_base_url' })).toHaveValue(
    'http://127.0.0.1:12001/v1',
  );
  expect(screen.getByRole('textbox', { name: 'settings.llmp_model' })).toHaveValue('whisper-1');
});

it('offers no Ignis shortcut while Ignis is closed', async () => {
  mock.ignisOpen = false;
  mount();
  await screen.findByDisplayValue('http://localhost:8000/v1');
  expect(screen.queryByRole('button', { name: 'ignis.use_in_asr' })).not.toBeInTheDocument();
});
