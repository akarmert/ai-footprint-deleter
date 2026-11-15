import { useEffect, useRef } from 'react';

type Star = { x: number; y: number; radius: number; speed: number; phase: number; color: string; accent: boolean };

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
    const blue = styles.getPropertyValue('--blue').trim();
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
      context.save();
      context.translate(width * .6, Math.min(height * .28, 260));
      context.scale(1, .72);
      const glow = context.createRadialGradient(0, 0, 0, 0, 0, Math.max(width * .46, 320));
      glow.addColorStop(0, blue);
      glow.addColorStop(1, 'transparent');
      context.globalAlpha = .075 + Math.sin(elapsed * .18) * .012;
      context.fillStyle = glow;
      context.fillRect(-width, -height * 2, width * 2, height * 4);
      context.restore();
      for (const star of stars) {
        const edgeFade = Math.max(0, Math.min(1, star.x / 32, (width - star.x) / 32, star.y / 32, (height - star.y) / 32));
        const centerDistance = Math.abs(star.x / width - .5) * 2;
        const densityFade = .12 + .88 * Math.pow(centerDistance, 1.4);
        const twinkle = .72 + Math.sin(elapsed * (.3 + star.speed * .08) + star.phase) * .28;
        context.globalAlpha = edgeFade * densityFade * twinkle * (star.accent ? .85 : .45);
        if (star.accent) {
          const halo = context.createRadialGradient(star.x, star.y, 0, star.x, star.y, 11);
          halo.addColorStop(0, star.color); halo.addColorStop(1, 'transparent');
          context.fillStyle = halo;
          context.globalAlpha *= .14;
          context.fillRect(star.x - 11, star.y - 11, 22, 22);
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
        star.x += star.speed * delta * .4;
        star.y -= star.speed * delta;
        if (star.y < -12) star.y = height + 12;
        if (star.x > width + 12) star.x = -12;
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
      const count = mobile ? 34 : Math.min(150, Math.round(width * height / 10000));
      stars = Array.from({ length: count }, (_, index) => {
        const accent = index < (mobile ? 2 : 5);
        const left = index % 2 === 0;
        const edge = accent || Math.random() < .8;
        const x = edge ? (left ? Math.random() * .23 : .77 + Math.random() * .23) * width : Math.random() * width;
        return { x, y: Math.random() * height, radius: accent ? 1.15 : .45 + Math.random() * .35, speed: .8 + Math.random() * 2.2, phase: Math.random() * Math.PI * 2, color: accent ? index % 3 === 0 ? orange : cyan : neutral, accent };
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
