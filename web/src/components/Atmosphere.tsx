import { useEffect, useRef } from 'react';

type Star = { x: number; y: number; radius: number; speed: number; direction: number; phase: number; twinkleRate: number; color: string; accent: boolean };

export function Atmosphere({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const reconcileRef = useRef<() => void>(() => {});

  useEffect(() => {
    pausedRef.current = paused;
    reconcileRef.current();
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const styles = getComputedStyle(canvas);
    const white = styles.getPropertyValue('--text').trim();
    const orange = styles.getPropertyValue('--orange').trim();
    const cyan = styles.getPropertyValue('--atmosphere-cyan').trim();
    const neutral = styles.getPropertyValue('--secondary').trim();
    let width = 0, height = 0, frame = 0, previous = 0, elapsed = 0;
    let stars: Star[] = [];
    let disposed = false;
    const allowed = () => !disposed && !pausedRef.current && !document.hidden && !motion.matches;

    function draw() {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const edgeFade = Math.max(0, Math.min(1, star.x / 32, (width - star.x) / 32, star.y / 32, (height - star.y) / 32));
        const centerDistance = Math.abs(star.x / width - .5) * 2;
        const densityFade = .12 + .88 * Math.pow(centerDistance, 1.4);
        const twinkle = .82 + Math.sin(elapsed * star.twinkleRate + star.phase) * .18;
        context.globalAlpha = edgeFade * densityFade * twinkle * (star.accent ? .85 : .45);
        if (star.accent) {
          const halo = context.createRadialGradient(star.x, star.y, 0, star.x, star.y, 4);
          halo.addColorStop(0, star.color); halo.addColorStop(1, 'transparent');
          context.fillStyle = halo;
          context.globalAlpha *= .14;
          context.fillRect(star.x - 4, star.y - 4, 8, 8);
          context.globalAlpha /= .14;
        }
        context.fillStyle = star.color;
        context.beginPath(); context.arc(star.x, star.y, star.radius, 0, Math.PI * 2); context.fill();
      }
      context.globalAlpha = 1;
    }
    function tick(now: number) {
      frame = 0;
      if (!allowed()) { previous = 0; return; }
      const delta = previous ? Math.min((now - previous) / 1000, .05) : 0;
      previous = now; elapsed += delta;
      for (const star of stars) {
        const distance = star.speed * delta * 1.35 * Math.hypot(.4, 1);
        star.x += Math.cos(star.direction) * distance;
        star.y += Math.sin(star.direction) * distance;
        if (star.y < -12) star.y = height + 12;
        if (star.y > height + 12) star.y = -12;
        if (star.x > width + 12) star.x = -12;
        if (star.x < -12) star.x = width + 12;
      }
      draw();
      frame = requestAnimationFrame(tick);
    }
    function reconcile() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; previous = 0;
      if (allowed()) frame = requestAnimationFrame(tick);
    }
    function resize() {
      width = window.innerWidth; height = window.innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas!.width = Math.round(width * ratio); canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      const mobile = width < 700;
      const count = mobile ? 77 : Math.round((Math.min(150, Math.round(width * height / 10000)) + 21) * 1.4);
      stars = Array.from({ length: count }, (_, index) => {
        const accent = index < (mobile ? 2 : 5);
        const left = index % 2 === 0;
        const edge = accent || Math.random() < .8;
        const x = edge ? (left ? Math.random() * .23 : .77 + Math.random() * .23) * width : Math.random() * width;
        return { x, y: Math.random() * height, radius: accent ? 1.15 : .45 + Math.random() * .35, speed: .8 + Math.random() * 2.2, direction: -Math.PI * .38 + (Math.random() - .5) * 1.1 + (index % 7 === 0 ? Math.PI : 0), phase: Math.random() * Math.PI * 2, twinkleRate: .35 + Math.random() * .45, color: accent ? index === 0 ? orange : cyan : index % 3 === 0 ? white : neutral, accent };
      });
      draw();
      reconcile();
    }
    reconcileRef.current = reconcile;
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', reconcile);
    motion.addEventListener('change', reconcile);
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', reconcile);
      motion.removeEventListener('change', reconcile);
      reconcileRef.current = () => {};
    };
  }, []);

  return <canvas ref={canvasRef} className="atmosphere" aria-hidden="true" />;
}
