import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function mount(data = catalog, installation?: (path: string) => Promise<unknown>) {
  mock.api.mockImplementation((path: string) => {
    if (path.startsWith('/audio-gen/catalog')) return Promise.resolve(data);
    if (installation) return installation(path);
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
  vi.useRealTimers();
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

function missingModel(): AudioCatalog {
  return {
    ...catalog,
    models: catalog.models.map((model) => ({
      ...model,
      status: {
        runtime: { ...model.status.runtime, installed: false },
        weights: { state: 'missing' as const },
      },
    })),
  };
}

async function tick(ms = 3_000) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

it('waits for runtime admission and completion, then stops installing even without weights', async () => {
  let admit!: (value: unknown) => void;
  const admission = new Promise((resolve) => { admit = resolve; });
  let runtime = { installed: false, job: { state: 'running' } };
  const data = missingModel();
  mount(data, (path) => path.endsWith('/install/status') ? Promise.resolve(runtime) : admission);
  const install = await screen.findByRole('button', { name: 'audiogen.installRuntime' });
  vi.useFakeTimers();
  fireEvent.click(install);
  fireEvent.click(install);
  expect(install).toBeDisabled();
  expect(screen.getByRole('button', { name: 'audiogen.downloadModel' })).toBeDisabled();
  await tick();
  expect(mock.api.mock.calls.filter(([path]) => path.endsWith('/install'))).toHaveLength(1);
  expect(mock.api.mock.calls.filter(([path]) => path.endsWith('/install/status'))).toHaveLength(0);
  await act(async () => { admit({ status: 'started' }); });
  await tick(1);
  expect(screen.getByText('audiogen.installing')).toBeInTheDocument();
  data.models[0].status.runtime.installed = true;
  runtime = { installed: true, job: { state: 'succeeded' } };
  await tick();
  expect(screen.queryByText('audiogen.installing')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'audiogen.downloadModel' })).toBeEnabled();
  const calls = mock.api.mock.calls.length;
  await tick(9_000);
  expect(mock.api).toHaveBeenCalledTimes(calls);
});

it.each(['runtime', 'weights'] as const)('clears a rejected %s install and permits retry', async (kind) => {
  mount(missingModel(), () => Promise.reject(new Error('installation rejected')));
  const install = await screen.findByRole('button', {
    name: kind === 'runtime' ? 'audiogen.installRuntime' : 'audiogen.downloadModel',
  });
  fireEvent.click(install);
  expect(await screen.findByRole('alert')).toHaveTextContent('installation rejected');
  expect(screen.queryByText('audiogen.installing')).not.toBeInTheDocument();
  expect(install).toBeEnabled();
});

it.each(['runtime', 'weights'] as const)('shows a background %s failure and stops polling', async (kind) => {
  const data = missingModel();
  let failed = false;
  mount(data, (path) => {
    if (!path.endsWith('/status')) return Promise.resolve({ status: 'already_running' });
    if (kind === 'runtime') return Promise.resolve({
      installed: false,
      job: failed ? { state: 'failed', error: 'disk full', remediation: 'free space' } : { state: 'running' },
    });
    return Promise.resolve({ jobs: [{ repo_id: 'cvssp/audioldm2', state: failed ? 'failed' : 'downloading', error: failed ? 'disk full' : undefined }] });
  });
  const install = await screen.findByRole('button', {
    name: kind === 'runtime' ? 'audiogen.installRuntime' : 'audiogen.downloadModel',
  });
  vi.useFakeTimers();
  fireEvent.click(install);
  await tick(1);
  expect(screen.getByText('audiogen.installing')).toBeInTheDocument();
  failed = true;
  await tick();
  expect(screen.getByRole('alert')).toHaveTextContent('disk full');
  expect(screen.queryByText('audiogen.installing')).not.toBeInTheDocument();
  expect(install).toBeEnabled();
  const calls = mock.api.mock.calls.length;
  await tick(9_000);
  expect(mock.api).toHaveBeenCalledTimes(calls);
});

it('follows the original weights job after selection changes and ignores another download', async () => {
  let admit!: (value: unknown) => void;
  const admission = new Promise((resolve) => { admit = resolve; });
  const data = missingModel();
  let jobs = [
    { repo_id: 'cvssp/audioldm2', state: 'downloading' },
    { repo_id: 'stabilityai/stable-audio-open-1.0', state: 'downloading' },
  ];
  mount(data, (path) => path === '/models/install' ? admission : Promise.resolve({ jobs }));
  const install = await screen.findByRole('button', { name: 'audiogen.downloadModel' });
  vi.useFakeTimers();
  fireEvent.click(install);
  fireEvent.click(screen.getByText('Stable Audio Open'));
  await tick();
  expect(screen.getByText('audiogen.installing')).toBeInTheDocument();
  expect(mock.api).toHaveBeenCalledWith('/models/install', {
    method: 'POST', body: JSON.stringify({ repo_id: 'cvssp/audioldm2' }),
  });
  await act(async () => { admit({ status: 'install_started' }); });
  await tick(1);
  expect(screen.getByText('audiogen.installing')).toBeInTheDocument();
  jobs = [jobs[1]];
  await tick();
  expect(screen.queryByText('audiogen.installing')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'audiogen.installRuntime' })).toBeEnabled();
});

it.each(['runtime', 'weights'] as const)('finishes an already completed %s install without waiting to observe a running job', async (kind) => {
  mount(missingModel(), (path) => {
    if (!path.endsWith('/status')) return Promise.resolve({ status: 'already_installed' });
    return Promise.resolve(kind === 'runtime' ? { installed: true, job: null } : { jobs: [] });
  });
  const install = await screen.findByRole('button', {
    name: kind === 'runtime' ? 'audiogen.installRuntime' : 'audiogen.downloadModel',
  });
  vi.useFakeTimers();
  fireEvent.click(install);
  await tick(1);
  expect(screen.queryByText('audiogen.installing')).not.toBeInTheDocument();
  expect(install).toBeEnabled();
});

it('keeps the active status visible after selecting an already ready model', async () => {
  const data = missingModel();
  data.models[1].status = catalog.models[1].status;
  mount(data, (path) => Promise.resolve(path.endsWith('/status')
    ? { installed: false, job: { state: 'running' } }
    : { status: 'started' }));
  const install = await screen.findByRole('button', { name: 'audiogen.installRuntime' });
  vi.useFakeTimers();
  fireEvent.click(install);
  await tick(1);
  fireEvent.click(screen.getByText('Stable Audio Open'));
  expect(screen.queryByRole('button', { name: 'audiogen.installRuntime' })).not.toBeInTheDocument();
  expect(screen.getByText('audiogen.installing')).toBeInTheDocument();
  await tick();
  expect(mock.api.mock.calls.filter(([path]) => path === '/engines/sidecar/audiogen-torch/install/status')).toHaveLength(2);
});

it('does not start status polling when unmounted before admission returns', async () => {
  let admit!: (value: unknown) => void;
  const admission = new Promise((resolve) => { admit = resolve; });
  const view = mount(missingModel(), () => admission);
  const install = await screen.findByRole('button', { name: 'audiogen.installRuntime' });
  vi.useFakeTimers();
  fireEvent.click(install);
  view.unmount();
  await act(async () => { admit({ status: 'started' }); });
  await tick(9_000);
  expect(mock.api.mock.calls.some(([path]) => path.endsWith('/status'))).toBe(false);
});
