// Azúria 2 design-system rules (docs/branding.md), checked on the real files.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL#pathname: on Windows the latter is "/D:/…" and joins
// into "D:\\D:\\…" (the CI failure this replaced).
const renderer = fileURLToPath(new URL('../../electron/src/renderer/src/', import.meta.url));
const posix = (path) => path.split(sep).join('/');
const read = (path) => readFileSync(join(renderer, path), 'utf8').toLowerCase();
const theme = read('styles/t3-theme.css');
const globals = read('styles/globals.css');
const lightBlock = theme.slice(theme.indexOf(':root {'), theme.indexOf('@variant dark'));
const darkBlock = theme.slice(theme.indexOf('@variant dark'), theme.indexOf('html[data-theme-id]'));

test('one motion scale with the shared easing curves', () => {
  for (const token of [
    '--dur-micro: 80ms',
    '--dur-fast: 150ms',
    '--dur-base: 250ms',
    '--dur-medium: 350ms',
    '--dur-slow: 500ms',
    '--ease-out: cubic-bezier(0.22, 1, 0.36, 1)',
    '--ease-spring: cubic-bezier(0.34, 1.36, 0.64, 1)',
  ])
    assert.ok(globals.includes(token), token);
});

test('12px base radius so the scale lands on 8 / 12 / 16', () => {
  assert.ok(theme.includes('--radius: 0.75rem'));
});

test('night-blue dark canvas and ice light canvas', () => {
  assert.ok(darkBlock.includes('--background: #070b14'));
  assert.ok(lightBlock.includes('--background: #f5f7fa'));
});

test('brand blue stays the single action color in both themes', () => {
  assert.ok(lightBlock.includes('--primary: #2563eb'));
  assert.ok(darkBlock.includes('--primary: #2563eb'));
});

test('reduced motion and reduced transparency are honoured', () => {
  assert.ok(globals.includes('prefers-reduced-motion: reduce'));
  assert.ok(globals.includes('prefers-reduced-transparency: reduce'));
});

test('hover lift and transition utilities ride the shared scale', () => {
  assert.match(globals, /@utility lift-on-hover \{[^}]*translate/);
  assert.match(globals, /@utility transition-ui \{[^}]*var\(--dur-fast\)/);
});

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (posix(relative(renderer, path)) === 'lib/themes') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

test('no violet, fuchsia, purple or indigo in the default UI', () => {
  const files = sources(renderer);
  assert.ok(files.length > 100, 'scanned the renderer sources');
  assert.ok(files.some((file) => file.endsWith('.css')), 'scanned CSS too');
  const offenders = files
    .filter((file) => /\b(?:violet|fuchsia|purple|indigo)-\d{2,3}\b/.test(readFileSync(file, 'utf8')))
    .map((file) => posix(relative(renderer, file)));
  assert.deepEqual(offenders, []);
});
