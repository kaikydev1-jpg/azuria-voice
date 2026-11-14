// Matsu OS window dots (owner's spec, PADRAO_DOS_APPS_DO_CRIADOR §3): exact
// sizes and colors, checked on the real stylesheet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(
  new URL('../../electron/src/renderer/src/components/app-shell/window-controls.css', import.meta.url),
  'utf8',
).toLowerCase();

/** The body of the rule whose selector ends with `needle`. */
function rule(needle) {
  const at = css.indexOf(needle + ' {');
  assert.ok(at >= 0, `missing rule: ${needle}`);
  return css.slice(css.indexOf('{', at), css.indexOf('}', at) + 1);
}

test('dots are 12px with 8px gaps and a 14px side margin', () => {
  assert.match(rule("[data-window-chrome='matsu'] .window-controls"), /gap: 8px/);
  assert.match(rule("[data-window-chrome='matsu'] .window-controls"), /padding: 0 14px/);
  const dot = rule("[data-window-chrome='matsu'] .window-control");
  assert.match(dot, /width: 12px/);
  assert.match(dot, /height: 12px/);
  assert.match(dot, /border-radius: 50%/);
});

test('active colors and symbol colors are exact', () => {
  for (const [button, fill, symbol] of [
    ['close', '#ff5f57', '#4d0000'],
    ['minimize', '#febc2e', '#995700'],
    ['maximize', '#28c840', '#006500'],
  ]) {
    const body = rule(`[data-window-chrome='matsu'] .window-control[data-button='${button}']`);
    assert.match(body, new RegExp(`background: ${fill}`));
    assert.match(body, new RegExp(`color: ${symbol}`));
  }
});

test('symbols are 1.35px strokes shown only while the group is hovered', () => {
  assert.match(rule("[data-window-chrome='matsu'] .window-control svg"), /stroke-width: 1\.35/);
  assert.match(rule("[data-window-chrome='matsu'] .window-control svg"), /opacity: 0/);
  assert.match(rule("[data-window-chrome='matsu'] .window-controls:hover svg"), /opacity: 1/);
});

test('pressing darkens to 82% brightness', () => {
  assert.match(rule("[data-window-chrome='matsu'] .window-control:active"), /brightness\(0\.82\)/);
});

test('background windows show grey dots, dark #59545d and light #c9c9cf', () => {
  assert.match(css, /--window-inactive-dot: #c9c9cf/);
  assert.match(css, /--window-inactive-dot: #59545d/);
  assert.match(
    rule("[data-window-inactive][data-window-chrome='matsu'] .window-controls:not(:hover) .window-control"),
    /background: var\(--window-inactive-dot\)/,
  );
});
