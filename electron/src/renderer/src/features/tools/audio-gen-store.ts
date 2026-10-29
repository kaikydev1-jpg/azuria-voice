import { useCallback, useSyncExternalStore } from 'react';
import type { AudioKind, ProfileName, Purpose } from './audio-gen-state';

/**
 * What the person typed and picked on the music / sound-effects screen. It lives
 * outside the component so leaving the screen (the page is unmounted) and coming
 * back finds the form as it was, and survives a restart through localStorage.
 * Running jobs are not kept here: the server owns them.
 */
export interface AudioGenDraft {
  modelId: string | null;
  purpose: Purpose;
  acknowledged: boolean;
  profile: ProfileName | null;
  custom: Record<string, string>;
  prompt: string;
  lyrics: string;
  duration: string;
  variations: string;
  seed: string;
  preset: string;
  device: string;
  batch: boolean;
}

const KEY = 'azuria.audiogen.drafts.v1';
const KINDS: AudioKind[] = ['music', 'sfx'];

export const emptyDraft = (): AudioGenDraft => ({
  modelId: null,
  purpose: 'personal',
  acknowledged: false,
  profile: null,
  custom: {},
  prompt: '',
  lyrics: '',
  duration: '',
  variations: '1',
  seed: '',
  preset: '',
  device: 'auto',
  batch: false,
});

function load(): Record<AudioKind, AudioGenDraft> {
  const drafts = { music: emptyDraft(), sfx: emptyDraft() };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<AudioKind, Partial<AudioGenDraft>>>;
    for (const kind of KINDS) {
      // The licence acknowledgement is a fresh decision each session.
      if (saved[kind] && typeof saved[kind] === 'object') drafts[kind] = { ...drafts[kind], ...saved[kind], acknowledged: false };
    }
  } catch {
    /* Storage unavailable or corrupt: start with empty forms. */
  }
  return drafts;
}

let drafts = load();
const listeners = new Set<() => void>();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(drafts));
  } catch {
    /* The form stays available in memory. */
  }
}

export function setAudioGenDraft(kind: AudioKind, patch: Partial<AudioGenDraft>): void {
  drafts = { ...drafts, [kind]: { ...drafts[kind], ...patch } };
  save();
  listeners.forEach((listener) => listener());
}

export function resetAudioGenDrafts(): void {
  drafts = { music: emptyDraft(), sfx: emptyDraft() };
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function useAudioGenDraft(kind: AudioKind): [AudioGenDraft, (patch: Partial<AudioGenDraft>) => void] {
  const draft = useSyncExternalStore(subscribe, () => drafts[kind]);
  const patch = useCallback((change: Partial<AudioGenDraft>) => setAudioGenDraft(kind, change), [kind]);
  return [draft, patch];
}

/** Non-empty lines of a batch box, trimmed. */
export function batchLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
