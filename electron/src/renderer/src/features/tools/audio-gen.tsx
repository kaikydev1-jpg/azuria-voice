import { useEffect, useId, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PipelineFailure } from '@/components/pipeline-failure';
import { ExternalLink } from '@/components/external-link';
import { Progress } from '@/components/ui/progress';
import { apiFetch, apiJson, audioUrl, describeError } from '@/lib/api/client';
import { useAudioInstall } from './use-audio-install';
import {
  LICENSE_KEYS,
  clampParam,
  isActive,
  jobsOfKind,
  modelReady,
  offeredFor,
  overallFraction,
  queueRoom,
  type AudioCatalog,
  type AudioJob,
  type AudioJobList,
  type AudioKind,
  type AudioModel,
  type ProfileName,
} from './audio-gen-state';
import { batchLines, useAudioGenDraft } from './audio-gen-store';

const FIELD =
  'w-full rounded-lg border border-input bg-transparent p-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring';
const JOBS_KEY = ['audio-gen-jobs'];

async function saveBlob(path: string, name: string) {
  const blob = await (await apiFetch(path)).blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** A labelled control with a plain-language hint under it that screen readers read with the control. */
function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const hintId = useId();
  return (
    <div className="space-y-2 text-sm">
      <label className="block space-y-2">
        <span>{label}</span>
        {children(hint ? hintId : undefined)}
      </label>
      {hint && (
        <p id={hintId} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function JobCard({
  job,
  onCancel,
  onError,
}: {
  job: AudioJob;
  onCancel: (job: AudioJob) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const active = isActive(job);
  const fraction = overallFraction(job);
  const stage =
    job.state === 'queued'
      ? t('audiogen.status.queued', { ahead: Math.max(0, job.queue_position) })
      : t(`audiogen.status.${job.state === 'running' ? job.stage : job.state}`, { defaultValue: job.stage });
  return (
    <div role="status" className="space-y-3 rounded-xl border border-border/60 p-4 text-sm">
      {job.prompt && <p className="line-clamp-2 font-medium">{job.prompt}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>{stage}</p>
        {active && (
          <Button type="button" variant="outline" size="sm" onClick={() => onCancel(job)}>
            {t('audiogen.cancel')}
          </Button>
        )}
      </div>
      {active && <Progress value={fraction == null ? null : Math.round(fraction * 100)} />}
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
            <Button type="button" variant="outline" size="sm" onClick={() => void saveBlob(`/audio/${encodeURIComponent(take.audio_path)}`, `${take.id}.wav`).catch((reason) => onError(describeError(reason)))}>
              {t('audiogen.downloadWav')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void saveBlob(`/audio-gen/takes/${take.id}/export`, `azuria-${take.id}.zip`).catch((reason) => onError(describeError(reason)))}>
              {t('audiogen.exportProvenance')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AudioGen({ kind }: { kind: AudioKind }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const installation = useAudioInstall(t('modelMaintenance.failed'));
  const { installing } = installation;
  const catalog = useQuery({
    queryKey: ['audio-gen-catalog', kind],
    queryFn: () => apiJson<AudioCatalog>(`/audio-gen/catalog?kind=${kind}`),
    refetchInterval: installing ? 3_000 : false,
  });
  const models = catalog.data?.models ?? [];
  const [draft, patch] = useAudioGenDraft(kind);
  const { modelId, purpose, acknowledged, profile, custom, prompt, lyrics, duration, variations, seed, preset, device, batch } = draft;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The server owns every job. Reading the list (not component state) is what lets a
  // generation started earlier be seen, played and cancelled after leaving and returning.
  const jobList = useQuery({
    queryKey: JOBS_KEY,
    queryFn: () => apiJson<AudioJobList>('/audio-gen/jobs'),
    refetchInterval: (query) => (jobsOfKind(query.state.data, kind).some(isActive) ? 1_000 : false),
  });
  const jobs = jobsOfKind(jobList.data, kind);
  const room = queueRoom(jobList.data);
  const doneIds = jobs.filter((job) => job.state === 'done').map((job) => job.id).join(',');

  const model: AudioModel | undefined =
    models.find((item) => item.id === modelId) ?? models.find((item) => offeredFor(item, purpose)) ?? models[0];
  const limits = model?.limits;
  const chosenProfile = profile && model && (profile === 'custom' || model.profiles[profile]) ? profile : model?.default_profile;
  const blocked = Boolean(model && !offeredFor(model, purpose));
  const needsAck = purpose === 'commercial' && model?.license.class === 'commercial_conditions';
  const ready = Boolean(model && modelReady(model));
  const descriptions = batch ? batchLines(prompt) : prompt.trim() ? [prompt] : [];

  useEffect(() => {
    if (doneIds) void client.invalidateQueries({ queryKey: ['history'] });
  }, [doneIds, client]);

  if (catalog.isError)
    return <PipelineFailure fallback={describeError(catalog.error)} onDismiss={() => void catalog.refetch()} />;
  if (!model) return <p role="status">{t('common.loading')}</p>;

  const canGenerate = !busy && ready && !blocked && !(needsAck && !acknowledged) && descriptions.length > 0;

  const generate = async () => {
    if (!canGenerate) return;
    if (descriptions.length > room) {
      setError(t('audiogen.batch.tooMany', { max: room }));
      return;
    }
    setBusy(true);
    setError(null);
    let queued = 0;
    try {
      for (const text of descriptions) {
        const body: Record<string, unknown> = {
          model: model.id,
          prompt: text,
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
        const job = await apiJson<AudioJob>(`/audio-gen/${kind}`, { method: 'POST', body: JSON.stringify(body) });
        queued += 1;
        client.setQueryData<AudioJobList>(JOBS_KEY, (old) => ({ ...old, jobs: [...(old?.jobs ?? []), job] }));
      }
    } catch (reason) {
      setError(describeError(reason));
      // Keep what was not accepted in the box so nothing typed is lost.
      if (batch && queued > 0) patch({ prompt: descriptions.slice(queued).join('\n') });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (job: AudioJob) => {
    try {
      const next = await apiJson<AudioJob>(`/audio-gen/jobs/${job.id}/cancel`, { method: 'POST' });
      client.setQueryData<AudioJobList>(JOBS_KEY, (old) => ({
        ...old,
        jobs: (old?.jobs ?? []).map((item) => (item.id === next.id ? next : item)),
      }));
    } catch (reason) {
      setError(describeError(reason));
    }
  };

  const conditions = model.license.conditions;
  const hardware = model.hardware;
  const presets = catalog.data?.presets[kind] ?? [];

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
        <p className="mt-1 text-xs text-muted-foreground">{t('audiogen.jobs.background')}</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('audiogen.purpose')}</legend>
        {(['personal', 'commercial'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="radio" name={`purpose-${kind}`} checked={purpose === value} onChange={() => patch({ purpose: value })} />
            {t(`audiogen.purposes.${value}`)}
          </label>
        ))}
        <p className="text-xs leading-5 text-muted-foreground">{t('audiogen.purposeNote')}</p>
      </fieldset>

      <fieldset className="space-y-3">
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
                  onChange={() => patch({ modelId: item.id, profile: null, acknowledged: false })}
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
              <input type="checkbox" checked={acknowledged} onChange={(event) => patch({ acknowledged: event.target.checked })} />
              <span>{t('audiogen.acknowledge')}</span>
            </label>
          )}
        </div>
      )}

      {!ready && (
        <div className="space-y-2 rounded-xl border border-border/60 p-3 text-sm">
          {!model.status.runtime.supported && <p role="alert">{model.status.runtime.reason}</p>}
          {model.status.runtime.supported && !model.status.runtime.installed && (
            <Button type="button" variant="outline" disabled={installing} onClick={() => {
              setError(null);
              void installation.start({ kind: 'runtime', id: model.status.runtime.engine_id });
            }}>
              {t('audiogen.installRuntime', { size: model.status.runtime.approx_download_gb ?? '?' })}
            </Button>
          )}
          {model.status.weights.state === 'revision_mismatch' && <p role="alert">{t('audiogen.revisionMismatch')}</p>}
          {model.status.weights.state !== 'ready' && (
            <Button type="button" variant="outline" disabled={installing} onClick={() => {
              setError(null);
              void installation.start({ kind: 'weights', id: model.repo_id });
            }}>
              {t('audiogen.downloadModel', { size: model.download.size_gb ?? '?' })}
            </Button>
          )}
          {model.download.gated && <p className="text-xs text-muted-foreground">{t('audiogen.gatedNote')}</p>}
        </div>
      )}
      {installing && <p role="status" className="text-xs">{t('audiogen.installing')}</p>}

      <div className="space-y-2">
        <Field label={t(batch ? 'audiogen.batch.promptLabel' : 'audiogen.prompt')}>
          {() => (
            <textarea
              className={`${FIELD} min-h-28 resize-y`}
              maxLength={batch ? 20_000 : 1000}
              placeholder={t(`audiogen.promptPlaceholder.${kind}`)}
              value={prompt}
              onChange={(event) => patch({ prompt: event.target.value })}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={batch} onChange={(event) => patch({ batch: event.target.checked })} />
          {t('audiogen.batch.toggle')}
        </label>
        {batch && (
          <p className="text-xs leading-5 text-muted-foreground">
            {t('audiogen.batch.hint', { max: room })} {t('audiogen.batch.count', { n: descriptions.length })}
          </p>
        )}
      </div>
      {model.lyrics.supported && (
        <Field label={t('audiogen.lyrics')} hint={t('audiogen.lyricsHint')}>
          {(described) => (
            <textarea
              className={`${FIELD} min-h-24 resize-y`}
              maxLength={model.lyrics.max_chars}
              placeholder={t('audiogen.lyricsPlaceholder')}
              aria-describedby={described}
              value={lyrics}
              onChange={(event) => patch({ lyrics: event.target.value })}
            />
          )}
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('audiogen.quality')} hint={t('audiogen.qualityHint')}>
          {(described) => (
            <select className={FIELD} aria-describedby={described} value={chosenProfile} onChange={(event) => patch({ profile: event.target.value as ProfileName })}>
              {Object.keys(model.profiles).map((name) => (
                <option key={name} value={name}>{t(`audiogen.profiles.${name}`)}</option>
              ))}
              <option value="custom">{t('audiogen.profiles.custom')}</option>
            </select>
          )}
        </Field>
        <Field label={t('audiogen.duration', { min: limits?.duration_min_s, max: limits?.duration_max_s })} hint={t('audiogen.durationHint')}>
          {(described) => (
            <Input type="number" aria-describedby={described} min={limits?.duration_min_s} max={limits?.duration_max_s} placeholder={String(limits?.duration_default_s ?? '')} value={duration} onChange={(event) => patch({ duration: event.target.value })} />
          )}
        </Field>
        <Field label={t('audiogen.variations')} hint={t('audiogen.variationsHint')}>
          {(described) => (
            <Input type="number" aria-describedby={described} min={1} max={limits?.variations_max} value={variations} onChange={(event) => patch({ variations: event.target.value })} />
          )}
        </Field>
        <Field label={t('audiogen.seed')} hint={t('audiogen.seedHint')}>
          {(described) => (
            <Input type="number" aria-describedby={described} min={0} placeholder={t('audiogen.seedPlaceholder')} value={seed} onChange={(event) => patch({ seed: event.target.value })} />
          )}
        </Field>
        <Field label={t('audiogen.device')} hint={t('audiogen.deviceHint')}>
          {(described) => (
            <select className={FIELD} aria-describedby={described} value={device} onChange={(event) => patch({ device: event.target.value })}>
              {['auto', ...model.devices].map((name) => (
                <option key={name} value={name}>{t(`audiogen.devices.${name}`)}</option>
              ))}
            </select>
          )}
        </Field>
        {presets.length > 0 && (
          <Field label={t('audiogen.preset')} hint={t('audiogen.presetHint')}>
            {(described) => (
              <select className={FIELD} aria-describedby={described} value={preset} onChange={(event) => patch({ preset: event.target.value })}>
                <option value="">{t('audiogen.presets.none')}</option>
                {presets.map((item) => (
                  <option key={item.id} value={item.id}>{t(`audiogen.presets.${item.id}`)}</option>
                ))}
              </select>
            )}
          </Field>
        )}
      </div>

      {chosenProfile === 'custom' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(model.custom_params).map(([name, spec]) => (
            <Field key={name} label={`${name} (${spec.min}–${spec.max})`}>
              {() => (
                <Input type="number" min={spec.min} max={spec.max} step={spec.type === 'int' ? 1 : 0.1} value={custom[name] ?? ''} onChange={(event) => patch({ custom: { ...custom, [name]: event.target.value } })} />
              )}
            </Field>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canGenerate}>
          {t('audiogen.generate')}
        </Button>
      </div>

      {error && <PipelineFailure fallback={error} onDismiss={() => setError(null)} />}
      {installation.error && <PipelineFailure fallback={installation.error} onDismiss={installation.clearError} />}

      {jobs.length > 0 && (
        <section className="space-y-3" aria-label={t('audiogen.jobs.title')}>
          <h3 className="text-sm font-medium">{t('audiogen.jobs.title')}</h3>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onCancel={(item) => void cancel(item)} onError={setError} />
          ))}
        </section>
      )}
    </form>
  );
}
