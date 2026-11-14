import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(__dirname);
const theme = readFileSync(resolve(dir, 't3-theme.css'), 'utf8').toLowerCase();
const globals = readFileSync(resolve(dir, 'globals.css'), 'utf8').toLowerCase();

/** The `:root { ... }` light block, before the nested dark variant. */
function lightBlock(css: string): string {
  return css.slice(css.indexOf(':root {'), css.indexOf('@variant dark'));
}

function darkBlock(css: string): string {
  const start = css.indexOf('@variant dark');
  return css.slice(start, css.indexOf('html[data-theme-id]', start));
}

describe('Azúria 2 theme tokens', () => {
  it('defines one motion scale with the shared easing curves', () => {
    for (const token of [
      '--dur-micro: 80ms',
      '--dur-fast: 150ms',
      '--dur-base: 250ms',
      '--dur-medium: 350ms',
      '--dur-slow: 500ms',
      '--ease-out: cubic-bezier(0.22, 1, 0.36, 1)',
      '--ease-spring: cubic-bezier(0.34, 1.36, 0.64, 1)',
    ])
      expect(globals).toContain(token);
  });

  it('uses a 12px base radius so the scale lands on 8 / 12 / 16', () => {
    expect(theme).toContain('--radius: 0.75rem');
  });

  it('paints the night-blue dark canvas and the ice light canvas', () => {
    expect(darkBlock(theme)).toContain('--background: #070b14');
    expect(lightBlock(theme)).toContain('--background: #f5f7fa');
  });

  it('keeps the brand blue as the single action color in both themes', () => {
    expect(lightBlock(theme)).toContain('--primary: #2563eb');
    expect(darkBlock(theme)).toContain('--primary: #2563eb');
  });

  it('honours reduced motion and reduced transparency', () => {
    expect(globals).toContain('prefers-reduced-motion: reduce');
    expect(globals).toContain('prefers-reduced-transparency: reduce');
  });

  it('ships the hover lift and transition utilities on the shared scale', () => {
    expect(globals).toMatch(/@utility lift-on-hover \{[^}]*translate/);
    expect(globals).toMatch(/@utility transition-ui \{[^}]*var\(--dur-fast\)/);
  });
});
