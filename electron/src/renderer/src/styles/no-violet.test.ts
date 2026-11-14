import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Azúria 2 has one accent (azure) and no violet family anywhere in the app
 * chrome or its default styling (docs/branding.md). Named palettes that a
 * person picks on purpose (lib/themes) keep their own colors.
 */
const renderer = resolve(__dirname, '..');
const VIOLET = /\b(?:violet|fuchsia|purple|indigo)-\d{2,3}\b/;
const SKIP = new Set(['lib/themes']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const rel = relative(renderer, path);
    if (SKIP.has(rel)) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('Azúria 2 color family', () => {
  it('keeps violet, fuchsia, purple and indigo out of the default UI', () => {
    const offenders = sources(renderer)
      .filter((file) => VIOLET.test(readFileSync(file, 'utf8')))
      .map((file) => relative(renderer, file));
    expect(offenders).toEqual([]);
  });
});
