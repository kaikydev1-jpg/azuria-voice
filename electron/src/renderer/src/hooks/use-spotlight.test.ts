import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpotlight } from './use-spotlight';

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function card() {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) as DOMRect;
  document.body.append(element);
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useSpotlight', () => {
  it('follows the pointer with --spot-x / --spot-y', () => {
    stubReducedMotion(false);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const element = card();
    const { result } = renderHook(() => useSpotlight<HTMLDivElement>());
    act(() => result.current(element));
    act(() => {
      element.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, clientY: 40 }));
    });
    expect(element.style.getPropertyValue('--spot-x')).toBe('30px');
    expect(element.style.getPropertyValue('--spot-y')).toBe('40px');
  });

  it('does nothing when the system asks for reduced motion', () => {
    stubReducedMotion(true);
    const element = card();
    const { result } = renderHook(() => useSpotlight<HTMLDivElement>());
    act(() => result.current(element));
    act(() => {
      element.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, clientY: 40 }));
    });
    expect(element.style.getPropertyValue('--spot-x')).toBe('');
  });

  it('stops listening once the element is released', () => {
    stubReducedMotion(false);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const element = card();
    const { result } = renderHook(() => useSpotlight<HTMLDivElement>());
    act(() => result.current(element));
    act(() => result.current(null));
    act(() => {
      element.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 6 }));
    });
    expect(element.style.getPropertyValue('--spot-x')).toBe('');
  });

  it('lights the hovered card inside a grid when given a selector', () => {
    stubReducedMotion(false);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const grid = document.createElement('div');
    const first = card();
    const second = card();
    second.getBoundingClientRect = () =>
      ({ left: 220, top: 0, width: 200, height: 100, right: 420, bottom: 100, x: 220, y: 0 }) as DOMRect;
    first.className = second.className = 'spot';
    const label = document.createElement('span');
    second.append(label);
    grid.append(first, second);
    document.body.append(grid);
    const { result } = renderHook(() => useSpotlight<HTMLDivElement>('.spot'));
    act(() => result.current(grid));
    act(() => {
      label.dispatchEvent(new PointerEvent('pointermove', { clientX: 250, clientY: 10, bubbles: true }));
    });
    expect(second.style.getPropertyValue('--spot-x')).toBe('30px');
    expect(second.style.getPropertyValue('--spot-y')).toBe('10px');
    expect(first.style.getPropertyValue('--spot-x')).toBe('');
  });
});
