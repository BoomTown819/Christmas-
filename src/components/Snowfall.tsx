'use client';
import { useEffect, useRef } from 'react';

/** Soft falling snow on a canvas. Pauses when off-screen; static when reduced motion is requested. */
export function Snowfall({ density = 70 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    type Flake = { x: number; y: number; r: number; v: number; drift: number; phase: number; a: number };
    let flakes: Flake[] = [];

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((density * w) / 1200) + 12;
      flakes = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.8 + Math.random() * 2.4, v: 0.25 + Math.random() * 0.7,
        drift: 0.3 + Math.random() * 0.8, phase: Math.random() * Math.PI * 2,
        a: 0.35 + Math.random() * 0.55,
      }));
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        if (!reduce) {
          f.y += f.v;
          f.x += Math.sin(t / 1800 + f.phase) * f.drift * 0.35;
          if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,250,240,${f.a})`;
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
    resize();
    draw(0);
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(0); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      const was = visible; visible = e.isIntersecting;
      if (visible && !was && !reduce) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [density]);

  return <canvas ref={ref} className="snow" aria-hidden="true" />;
}
