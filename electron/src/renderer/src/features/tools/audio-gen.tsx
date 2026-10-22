import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PipelineFailure } from '@/components/pipeline-failure';
import { ExternalLink } from '@/components/external-link';
import { Progress } from '@/components/ui/progress';
import { apiFetch, apiJson, audioUrl, describeError } from '@/lib/api/client';
import {
  LICENSE_KEYS,
  clampParam,
  modelReady,
  offeredFor,
  overallFraction,
  type AudioCatalog,
  type AudioJob,
  type AudioKind,
  type AudioModel,
  type ProfileName,
  type Purpose,
} from './audio-gen-state';

const FIELD =
  'w-full rounded-lg border border-input bg-transparent p-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ACTIVE = new Set(['queued', 'running']);

async function saveBlob(path: string, name: string) {
  const blob = await (await apiFetch(path)).blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function AudioGen({ kind }: { kind: AudioKind }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [installing, setInstalling] = useState(false);
  const catalog = useQuery({
    queryKey: ['audio-gen-catalog', kind],
    queryFn: () => apiJson<AudioCatalog>(`/audio-gen/catalog?kind=${kind}`),
    refetchInterval: installing ? 3_000 : false,
  });
  const models = catalog.data?.models ?? [];
  const [modelId, setModelId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<Purpose>('personal');
  const [acknowledged, setAcknowledged] = useState(false);
  const [profile, setProfile] = useState<ProfileName | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [duration, setDuration] = useState('');
  const [variations, setVariations] = useState('1');
  const [seed, setSeed] = useState('');
  const [preset, setPreset] = useState('');
  const [device, setDevice] = useState('auto');
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<AudioJob | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);

  const model: AudioModel | undefined =
    models.find((item) => item.id === modelId) ?? models.find((item) => offeredFor(item, purpose)) ?? models[0];
  const limits = model?.limits;
  const chosenProfile = profile && model && (profile === 'custom' || model.profiles[profile]) ? profile : model?.default_profile;
  const blocked = Boolean(model && !offeredFor(model, purpose));
  const needsAck = purpose === 'commercial' && model?.license.class === 'commercial_conditions';
  const ready = Boolean(model && modelReady(model));
  const running = Boolean(job && ACTIVE.has(job.state));

  // Poll the running job; the server owns the truth, the page only mirrors it.
  useEffect(() => {
    if (!job || !ACTIVE.has(job.state)) return;
    const id = job.id;
    const timer = setInterval(() => {
      apiJson<AudioJob>(`/audio-gen/jobs/${id}`)
        .then((next) => {
          if (mounted.current) setJob(next);
        })
        .catch((reason) => {
          if (mounted.current) setError(describeError(reason));
        });
    }, 1_000);
    return () => clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (job?.state === 'done') void client.invalidateQueries({ queryKey: ['history'] });
  }, [job?.state, client]);

  if (catalog.isError)
    return <PipelineFailure fallback={describeError(catalog.error)} onDismiss={() => void catalog.refetch()} />;
  if (!model) return <p role="status">{t('common.loading')}</p>;

  const installRuntime = async () => {
    setError(null);
    setInstalling(true);
    try {
      await apiJson(`/engines/sidecar/${model.status.runtime.engine_id}/install`, { method: 'POST' });
    } catch (reason) {
      setError(describeError(reason));
    }
  };
  const installWeights = async () => {
    setError(null);
    setInstalling(true);
    try {
      await apiJson('/models/install', { method: 'POST', body: JSON.stringify({ repo_id: model.repo_id }) });
    } catch (reason) {
      setError(describeError(reason));
    }
  };

  const generate = async () => {
    if (busy || running || !ready || blocked || (needsAck && !acknowledged) || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    setJob(null);
    try {
      const body: Record<string, unknown> = {
        model: model.id,
        prompt,
        purpose,
        conditions_acknowledged: needsAck && acknowledged,
        variations: Number(variations) || 1,
        profile: chosenProfile,
        device,
      };
      if (model.lyrics.supported && lyrics.trim()) body.lyrics = lyrics;
      if (duration.trim()) body.duration_s = Number(duration);
      if (seed.trim()) body.seed = Number(seed);
      if (preset) body.content_preset = preset;
      if (chosenProfile === 'custom') {
        body.custom = Object.fromEntries(
          Object.entries(model.custom_params)
            .filter(([name]) => custom[name]?.trim())
            .map(([name, spec]) => [name, clampParam(spec, Number(custom[name]))]),
        );
      }
      setJob(await apiJson<AudioJob>(`/audio-gen/${kind}`, { method: 'POST', body: JSON.stringify(body) }));
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    try {
      setJob(await apiJson<AudioJob>(`/audio-gen/jobs/${job.id}/cancel`, { method: 'POST' }));
    } catch (reason) {
      setError(describeError(reason));
    }
  };

  const fraction = job ? overallFraction(job) : null;
  const stage = job
    ? job.state === 'queued'
      ? t('audiogen.status.queued', { ahead: Math.max(0, job.queue_position) })
      : t(`audiogen.status.${job.state === 'running' ? job.stage : job.state}`, { defaultValue: job.stage })
    : '';
  const conditions = model.license.conditions;
  const hardware = model.hardware;

  return (
    <form
      className="mx-auto max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void generate();
      }}
    >
      <div>
        <h2 className="text-lg font-medium">{t(`audiogen.${kind}.title`)}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`audiogen.${kind}.desc`)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('audiogen.local')}</p>
      </div>

      <fieldset className="space-y-2" disabled={running}>
        <legend className="text-sm font-medium">{t('audiogen.purpose')}</legend>
        {(['personal', 'commercial'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="radio" name={`purpose-${kind}`} checked={purpose === value} onChange={() => setPurpose(value)} />
            {t(`audiogen.purposes.${value}`)}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">{t('audiogen.purposeNote')}</p>
      </fieldset>

      <fieldset className="space-y-3" disabled={running}>
        <legend className="text-sm font-medium">{t('audiogen.model')}</legend>
        {models.map((item) => {
          const offered = offeredFor(item, purpose);
          return (
            <label
              key={item.id}
              className={`block cursor-pointer rounded-xl border p-3 text-sm ${item.id === model.id ? 'border-primary' : 'border-border/60'} ${offered ? '' : 'opacity-60'}`}
            >
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name={`model-${kind}`}
                  checked={item.id === model.id}
                  onChange={() => {
                    setModelId(item.id);
                    setProfile(null);
                    setAcknowledged(false);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{item.label}</span>
                  <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs">{t(LICENSE_KEYS[item.license.class])}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {item.license.license ?? ''} · {item.download.size_gb ?? '?'} GB ·{' '}
                    {t(modelReady(item) ? 'audiogen.ready' : 'audiogen.notInstalled')}
                  </span>
                  {!offered && <span className="mt-1 block text-xs text-warning-foreground">{t('audiogen.notForCommercial')}</span>}
                </span>
              </span>
            </label>
          );
        })}
        <p className="text-xs text-muted-foreground">{t('audiogen.licenseNote')}</p>
      </fieldset>

      {(hardware.ram_gb_min || hardware.vram_gb_min) && (
        <p className="text-xs text-muted-foreground">
          {t('audiogen.hardware', { ram: hardware.ram_gb_min ?? '?', vram: hardware.vram_gb_min ?? '?' })}
        </p>
      )}

      {conditions && (
        <div role="note" className="space-y-2 rounded-xl border border-border/60 p-3 text-sm">
          <p>
            {t('audiogen.conditionsText', { amount: (conditions.revenue_threshold_usd ?? 0).toLocaleString() })}
          </p>
          {conditions.official_url && <ExternalLink href={conditions.official_url}>{t('audiogen.officialTerms')}</ExternalLink>}
          {needsAck && (
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>{t('audiogen.acknowledge')}</span>
            </label>
          )}
        </div>
      )}

      {!ready && (
        <div className="space-y-2 rounded-xl border border-border/60 p-3 text-sm">
          {!model.status.runtime.supported && <p role="alert">{model.status.runtime.reason}</p>}
          {model.status.runtime.supported && !model.status.runtime.installed && (
            <Button type="button" variant="outline" onClick={() => void installRuntime()}>
              {t('audiogen.installRuntime', { size: model.status.runtime.approx_download_gb ?? '?' })}
            </Button>
          )}
          {model.status.weights.state === 'revision_mismatch' && <p role="alert">{t('audiogen.revisionMismatch')}</p>}
          {model.status.weights.state !== 'ready' && (
            <Button type="button" variant="outline" onClick={() => void installWeights()}>
              {t('audiogen.downloadModel', { size: model.download.size_gb ?? '?' })}
            </Button>
          )}
          {model.download.gated && <p className="text-xs text-muted-foreground">{t('audiogen.gatedNote')}</p>}
          {installing && <p role="status" className="text-xs">{t('audiogen.installing')}</p>}
        </div>
      )}

      <label className="block space-y-2 text-sm">
        <span>{t('audiogen.prompt')}</span>
        <textarea className={`${FIELD} min-h-28 resize-y`} maxLength={1000} disabled={running} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      {model.lyrics.supported && (
        <label className="block space-y-2 text-sm">
          <span>{t('audiogen.lyrics')}</span>
          <textarea className={`${FIELD} min-h-24 resize-y`} maxLength={model.lyrics.max_chars} disabled={running} value={lyrics} onChange={(event) => setLyrics(event.target.value)} />
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span>{t('audiogen.quality')}</span>
          <select className={FIELD} disabled={running} value={chosenProfile} onChange={(event) => setProfile(event.target.value as ProfileName)}>
            {Object.keys(model.profiles).map((name) => (
              <option key={name} value={name}>{t(`audiogen.profiles.${name}`)}</option>
            ))}
            <option value="custom">{t('audiogen.profiles.custom')}</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span>{t('audiogen.duration', { min: limits?.duration_min_s, max: limits?.duration_max_s })}</span>
          <Input type="number" disabled={running} min={limits?.duration_min_s} max={limits?.duration_max_s} placeholder={String(limits?.duration_default_s ?? '')} value={duration} onChange={(event) => setDuration(event.target.value)} />
        </label>
        <label className="space-y-2 text-sm">
          <span>{t('audiogen.variations')}</span>
          <Input type="number" disabled={running} min={1} max={limits?.variations_max} value={variations} onChange={(event) => setVariations(event.target.value)} />
        </label>
        <label className="space-y-2 text-sm">
          <span>{t('audiogen.seed')}</span>
          <Input type="number" disabled={running} min={0} value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <label className="space-y-2 text-sm">
          <span>{t('audiogen.device')}</span>
          <select className={FIELD} disabled={running} value={device} onChange={(event) => setDevice(event.target.value)}>
            {['auto', ...model.devices].map((name) => (
              <option key={name} value={name}>{t(`audiogen.devices.${name}`)}</option>
            ))}
          </select>
        </label>
        {(catalog.data?.presets[kind]?.length ?? 0) > 0 && (
          <label className="space-y-2 text-sm">
            <span>{t('audiogen.preset')}</span>
            <select className={FIELD} disabled={running} value={preset} onChange={(event) => setPreset(event.target.value)}>
              <option value="">{t('audiogen.presets.none')}</option>
              {catalog.data?.presets[kind]?.map((item) => (
                <option key={item.id} value={item.id}>{t(`audiogen.presets.${item.id}`)}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {chosenProfile === 'custom' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(model.custom_params).map(([name, spec]) => (
            <label key={name} className="space-y-2 text-sm">
              <span>{name} ({spec.min}–{spec.max})</span>
              <Input type="number" disabled={running} min={spec.min} max={spec.max} step={spec.type === 'int' ? 1 : 0.1} value={custom[name] ?? ''} onChange={(event) => setCustom({ ...custom, [name]: event.target.value })} />
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || running || !ready || blocked || (needsAck && !acknowledged) || !prompt.trim()}>
          {t('audiogen.generate')}
        </Button>
        {running && (
          <Button type="button" variant="outline" onClick={() => void cancel()}>
            {t('audiogen.cancel')}
          </Button>
        )}
      </div>

      {error && <PipelineFailure fallback={error} onDismiss={() => setError(null)} />}

      {job && (
        <div role="status" className="space-y-3 rounded-xl border border-border/60 p-4 text-sm">
          <p>{stage}</p>
          {running && <Progress value={fraction == null ? null : Math.round(fraction * 100)} />}
          {job.state === 'failed' && job.error && (
            <PipelineFailure fallback={t(`audiogen.errors.${job.error.code}`, { defaultValue: job.error.message || job.error.code })} />
          )}
          {job.fell_back && <p className="text-xs text-muted-foreground">{t('audiogen.fellBack')}</p>}
          {job.state === 'done' && job.device && <p className="text-xs text-muted-foreground">{t('audiogen.ranOn', { device: job.device })}</p>}
          {job.takes.map((take) => (
            <div key={take.id} className="space-y-2">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls className="w-full" src={audioUrl(take.audio_path)} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void saveBlob(`/audio/${encodeURIComponent(take.audio_path)}`, `${take.id}.wav`).catch((reason) => setError(describeError(reason)))}>
                  {t('audiogen.downloadWav')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void saveBlob(`/audio-gen/takes/${take.id}/export`, `azuria-${take.id}.zip`).catch((reason) => setError(describeError(reason)))}>
                  {t('audiogen.exportProvenance')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
