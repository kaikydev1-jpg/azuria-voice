export type AudioKind = 'music' | 'sfx';
export type LicenseClass = 'commercial' | 'commercial_conditions' | 'noncommercial' | 'unconfirmed';
export type Purpose = 'personal' | 'commercial';
export type ProfileName = 'fast' | 'balanced' | 'high' | 'custom';

export interface CustomParam {
  min: number;
  max: number;
  type: 'int' | 'float';
}

export interface AudioModel {
  id: string;
  kind: AudioKind;
  repo_id: string;
  label: string;
  audio: { sample_rate: number; channels: number };
  lyrics: { supported: boolean; max_chars?: number };
  limits: {
    duration_min_s: number;
    duration_max_s: number;
    duration_default_s: number;
    variations_max: number;
  };
  devices: string[];
  hardware: { ram_gb_min?: number; vram_gb_min?: number; confidence?: string };
  profiles: Record<string, Record<string, number>>;
  default_profile: string;
  custom_params: Record<string, CustomParam>;
  license: {
    class: LicenseClass;
    license: string | null;
    conditions?: { revenue_threshold_usd?: number; registration_required?: boolean; official_url?: string | null };
  };
  download: { size_gb: number | null; gated: boolean; requires_hf_token: boolean };
  status: {
    runtime: { engine_id: string; installed: boolean; supported: boolean; reason: string | null; approx_download_gb?: number | null };
    weights: { state: 'missing' | 'ready' | 'revision_mismatch' };
  };
}

export interface AudioCatalog {
  default_purpose: Purpose;
  models: AudioModel[];
  presets: Partial<Record<AudioKind, { id: string }[]>>;
}

export interface AudioTake {
  id: string;
  audio_path: string;
  seed: number;
  duration_seconds: number;
}

export interface AudioJob {
  id: string;
  kind: AudioKind;
  prompt: string;
  profile: string;
  duration_s: number;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  stage: string;
  fraction: number | null;
  variation: number;
  variations: number;
  queue_position: number;
  device: string | null;
  fell_back: boolean;
  error: { code: string; message: string } | null;
  takes: AudioTake[];
}

export interface AudioJobList {
  jobs: AudioJob[];
  queue_limit?: number;
}

const DEFAULT_QUEUE_LIMIT = 20;

export const isActive = (job: Pick<AudioJob, 'state'>): boolean => job.state === 'queued' || job.state === 'running';

/** Jobs of one kind, newest first (the server lists oldest first). */
export function jobsOfKind(list: Partial<AudioJobList> | undefined, kind: AudioKind): AudioJob[] {
  return (Array.isArray(list?.jobs) ? list.jobs : []).filter((job) => job.kind === kind).reverse();
}

/** Free places in the server queue for new jobs. */
export function queueRoom(list: Partial<AudioJobList> | undefined): number {
  const active = (Array.isArray(list?.jobs) ? list.jobs : []).filter(isActive).length;
  return Math.max(0, (list?.queue_limit ?? DEFAULT_QUEUE_LIMIT) - active);
}

export const LICENSE_KEYS: Record<LicenseClass, string> = {
  commercial: 'audiogen.license.commercial',
  commercial_conditions: 'audiogen.license.conditions',
  noncommercial: 'audiogen.license.noncommercial',
  unconfirmed: 'audiogen.license.unconfirmed',
};

/** Whether the server will accept this model for the declared purpose (it enforces this too). */
export function offeredFor(model: AudioModel, purpose: Purpose): boolean {
  return (
    purpose === 'personal' ||
    model.license.class === 'commercial' ||
    model.license.class === 'commercial_conditions'
  );
}

export function modelReady(model: AudioModel): boolean {
  return model.status.runtime.installed && model.status.weights.state === 'ready';
}

/** Overall progress of a multi-variation job, 0..1, or null when the engine reports none. */
export function overallFraction(job: Pick<AudioJob, 'fraction' | 'variation' | 'variations'>): number | null {
  if (job.fraction == null || job.variations < 1) return null;
  const done = Math.max(0, job.variation - 1);
  return Math.min(1, (done + job.fraction) / job.variations);
}

/** Clamp a typed number into a custom parameter's bounds; integers are rounded. */
export function clampParam(spec: CustomParam, value: number): number {
  const bounded = Math.min(spec.max, Math.max(spec.min, value));
  return spec.type === 'int' ? Math.round(bounded) : bounded;
}
