import { useCallback, useRef } from 'react';

/**
 * A soft light that follows the pointer across a card (Azúria 2). Returns a
 * ref callback; the element receives `--spot-x` / `--spot-y` in pixels, which
 * CSS turns into a radial highlight. Writes are batched to one per frame and
 * skipped entirely when the system asks for reduced motion.
 *
 * With `selector`, one listener on a container lights whichever descendant
 * matching it is under the pointer (a grid of cards shares one listener).
 */
export function useSpotlight<T extends HTMLElement>(
  selector?: string,
): (element: T | null) => void {
  const release = useRef<(() => void) | null>(null);
  return useCallback((element: T | null) => {
    release.current?.();
    release.current = null;
    if (!element) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    let scheduled = false;
    let frame = 0;
    let last: PointerEvent | null = null;
    const move = (event: PointerEvent) => {
      last = event;
      if (scheduled) return;
      scheduled = true;
      frame = requestAnimationFrame(() => {
        scheduled = false;
        if (!last) return;
        const target = selector
          ? last.target instanceof Element
            ? (last.target.closest(selector) as HTMLElement | null)
            : null
          : element;
        if (!target || !element.contains(target)) return;
        const box = target.getBoundingClientRect();
        target.style.setProperty('--spot-x', `${Math.round(last.clientX - box.left)}px`);
        target.style.setProperty('--spot-y', `${Math.round(last.clientY - box.top)}px`);
      });
    };
    element.addEventListener('pointermove', move);
    release.current = () => {
      element.removeEventListener('pointermove', move);
      if (scheduled) cancelAnimationFrame(frame);
    };
  }, [selector]);
}
