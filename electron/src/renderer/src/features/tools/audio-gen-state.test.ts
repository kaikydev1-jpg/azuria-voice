import { expect, it } from 'vitest';
import { clampParam, modelReady, offeredFor, overallFraction, type AudioModel } from './audio-gen-state';
import { parseProvenance } from '../clone/take-provenance';

const model = (klass: AudioModel['license']['class'], installed = true, weights = 'ready'): AudioModel =>
  ({
    license: { class: klass, license: 'x' },
    status: { runtime: { installed }, weights: { state: weights } },
  }) as AudioModel;

it('offers non-commercial models only for personal use', () => {
  expect(offeredFor(model('noncommercial'), 'personal')).toBe(true);
  expect(offeredFor(model('noncommercial'), 'commercial')).toBe(false);
  expect(offeredFor(model('unconfirmed'), 'commercial')).toBe(false);
  expect(offeredFor(model('commercial'), 'commercial')).toBe(true);
  expect(offeredFor(model('commercial_conditions'), 'commercial')).toBe(true);
});

it('needs both the runtime and the pinned weights', () => {
  expect(modelReady(model('commercial'))).toBe(true);
  expect(modelReady(model('commercial', false))).toBe(false);
  expect(modelReady(model('commercial', true, 'missing'))).toBe(false);
  expect(modelReady(model('commercial', true, 'revision_mismatch'))).toBe(false);
});

it('spreads progress across variations and stays unknown without a fraction', () => {
  expect(overallFraction({ fraction: 0.5, variation: 2, variations: 4 })).toBe(0.375);
  expect(overallFraction({ fraction: null, variation: 1, variations: 1 })).toBeNull();
  expect(overallFraction({ fraction: 1, variation: 1, variations: 1 })).toBe(1);
});

it('clamps custom parameters into their bounds', () => {
  expect(clampParam({ min: 10, max: 200, type: 'int' }, 5000)).toBe(200);
  expect(clampParam({ min: 10, max: 200, type: 'int' }, 33.6)).toBe(34);
  expect(clampParam({ min: 1, max: 10, type: 'float' }, 0)).toBe(1);
});

it('treats old, broken or foreign provenance as not recorded', () => {
  for (const raw of [null, undefined, '', 'nope', '{"schema":2}', '{"recorded":false}'])
    expect(parseProvenance(raw)).toBeNull();
  const record = {
    schema: 1,
    model: { repo_id: 'a/b', revision: 'f'.repeat(40) },
    license: { class: 'commercial', name: 'apache-2.0' },
    declared_use: { purpose: 'personal', conditions_acknowledged: false },
    parameters: { profile: 'fast', seed: 1 },
  };
  expect(parseProvenance(JSON.stringify(record))?.model.repo_id).toBe('a/b');
});
