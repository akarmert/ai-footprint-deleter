import { useEffect, useRef, type RefObject } from 'react';

export type PendingResultScroll = { version: number; interrupted: boolean };

/**
 * Scrolls the result panel into view once a scan finishes, unless the user scrolled or used
 * scroll keys in the meantime. Callers arm it by setting `pending.current` when a file is
 * selected and clear it when the selection is reset.
 */
export function useResultScroll(
  target: RefObject<HTMLElement | null>,
  generation: RefObject<number>,
  ready: boolean,
  deps: readonly unknown[],
) {
  const pending = useRef<PendingResultScroll | undefined>(undefined);
  useEffect(() => {
    const interrupt = () => {
      if (pending.current) pending.current.interrupted = true;
    };
    const keyScroll = (event: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) &&
        !(event.target instanceof HTMLInputElement)
      )
        interrupt();
    };
    window.addEventListener('scroll', interrupt, { passive: true });
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchmove', interrupt, { passive: true });
    window.addEventListener('keydown', keyScroll);
    return () => {
      window.removeEventListener('scroll', interrupt);
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('touchmove', interrupt);
      window.removeEventListener('keydown', keyScroll);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const armed = pending.current;
    if (!armed) return;
    const frame = requestAnimationFrame(() => {
      if (pending.current !== armed || armed.version !== generation.current) return;
      pending.current = undefined;
      const element = target.current;
      if (armed.interrupted || !element) return;
      const header = document.querySelector('.site-header');
      const headerStyle = header && getComputedStyle(header);
      const inset =
        header && (headerStyle?.position === 'sticky' || headerStyle?.position === 'fixed')
          ? Math.max(0, header.getBoundingClientRect().bottom) + 24
          : 24;
      element.style.scrollMarginTop = `${inset}px`;
      const box = element.getBoundingClientRect();
      const visibleHeight = Math.min(box.height, window.innerHeight - inset - 24);
      if (box.top >= inset && box.top + visibleHeight <= window.innerHeight - 24) return;
      element.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run exactly when the caller's scan/busy/error change
  }, deps);
  return pending;
}
