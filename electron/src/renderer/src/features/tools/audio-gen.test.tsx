import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { AudioCatalog } from './audio-gen-state';

const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api/client', () => ({
  apiJson: mock.api,
  apiFetch: vi.fn(),
  audioUrl: (name: string) => `/audio/${name}`,
  describeError: (error: unknown) => String(error),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/external-link', () => ({
  ExternalLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('@/components/pipeline-failure', () => ({
  PipelineFailure: ({ fallback }: { fallback: string }) => <div role="alert">{fallback}</div>,
}));
import { AudioGen } from './audio-gen';

const base = {
  kind: 'sfx' as const,
  label: '',
  audio: { sample_rate: 16000, channels: 1 },
  lyrics: { supported: false },
  limits: { duration_min_s: 1, duration_max_s: 10, duration_default_s: 5, variations_max: 2 },
  devices: ['cuda', 'cpu'],
  hardware: {},
  profiles: { balanced: { guidance_scale: 3 } },
  default_profile: 'balanced',
  custom_params: {},
  download: { size_gb: 1, gated: false, requires_hf_token: false },
  status: {
    runtime: { engine_id: 'audiogen-torch', installed: true, supported: true, reason: null },
    weights: { state: 'ready' as const },
  },
};
const catalog: AudioCatalog = {
  default_purpose: 'personal',
  presets: {},
  models: [
    { ...base, id: 'audioldm2', repo_id: 'cvssp/audioldm2', label: 'AudioLDM2', license: { class: 'noncommercial', license: 'cc-by-nc-sa-4.0' } },
    {
      ...base,
      id: 'sao',
      repo_id: 'stabilityai/stable-audio-open-1.0',
      label: 'Stable Audio Open',
      license: {
        class: 'commercial_conditions',
        license: 'stable-audio-community',
        conditions: { revenue_threshold_usd: 1_000_000, registration_required: true, official_url: null },
      },
    },
  ],
};

function mount() {
  mock.api.mockImplementation((path: string) => {
    if (path.startsWith('/audio-gen/catalog')) return Promise.resolve(catalog);
    return Promise.resolve({ id: 'job', state: 'queued', stage: 'queued', takes: [], queue_position: 0 });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AudioGen kind="sfx" />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('blocks a non-commercial model for commercial use and asks for the conditions acknowledgement', async () => {
  mount();
  await screen.findByText('audiogen.purposes.personal');
  fireEvent.change(screen.getByLabelText('audiogen.prompt'), { target: { value: 'door slam' } });
  const generate = screen.getByRole('button', { name: 'audiogen.generate' });
  await waitFor(() => expect(generate).toBeEnabled());

  fireEvent.click(screen.getByLabelText('audiogen.purposes.commercial'));
  // The selection moves to the first model that is offered for commercial use.
  await screen.findByText('audiogen.acknowledge');
  expect(generate).toBeDisabled();
  expect(screen.getByText('audiogen.notForCommercial')).toBeTruthy();

  fireEvent.click(screen.getByLabelText('audiogen.acknowledge'));
  expect(generate).toBeEnabled();
  fireEvent.click(generate);
  await waitFor(() =>
    expect(mock.api).toHaveBeenCalledWith(
      '/audio-gen/sfx',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  const body = JSON.parse(mock.api.mock.calls.find((call) => call[0] === '/audio-gen/sfx')![1].body);
  expect(body).toMatchObject({ model: 'sao', purpose: 'commercial', conditions_acknowledged: true });
});
