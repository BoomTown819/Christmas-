'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Modal } from '../Modal';

const VIEW = 280;                 // square viewport in CSS px
const HOLE_W = 170, HOLE_H = 190; // same shape as the character's head (34×38)
const HX = (VIEW - HOLE_W) / 2, HY = (VIEW - HOLE_H) / 2 - 8;

/** "Fit your face in the frame": drag to move, slider to zoom. Returns a JPEG of just the head area. */
export function FaceCropper({ src, onCancel, onDone }: { src: string | null; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const img = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    if (!src) return;
    const i = new Image();
    i.onload = () => {
      img.current = i;
      setSize({ w: i.naturalWidth, h: i.naturalHeight });
      setZoom(1.2);
      setPos({ x: 0, y: -0.08 }); // faces sit a little above centre in most selfies
    };
    i.src = src;
  }, [src]);

  const base = size ? Math.max(VIEW / size.w, VIEW / size.h) : 1;
  const scale = base * zoom;
  const dw = (size?.w ?? 0) * scale, dh = (size?.h ?? 0) * scale;
  const left = (VIEW - dw) / 2 + pos.x * VIEW, top = (VIEW - dh) / 2 + pos.y * VIEW;

  const down = (e: PointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; };
  const move = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    setPos({ x: d.px + (e.clientX - d.x) / VIEW, y: d.py + (e.clientY - d.y) / VIEW });
  };
  const nudge = (dx: number, dy: number) => setPos((p) => ({ x: p.x + dx, y: p.y + dy }));

  const done = () => {
    if (!img.current) return;
    const c = document.createElement('canvas');
    c.width = HOLE_W * 2; c.height = HOLE_H * 2;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img.current, (HX - left) / scale, (HY - top) / scale, HOLE_W / scale, HOLE_H / scale, 0, 0, c.width, c.height);
    onDone(c.toDataURL('image/jpeg', 0.9));
  };

  return (
    <Modal open={Boolean(src)} onClose={onCancel} title="Fit your face in the frame" size="sm"
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={done} disabled={!size}>Use this face</button>
      </>}>
      <div className="cropper">
        <div className="crop-view" style={{ width: VIEW, height: VIEW }} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)}
          onKeyDown={(e) => { const k: Record<string, [number, number]> = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }; if (k[e.key]) { e.preventDefault(); nudge(...k[e.key]); } }}
          tabIndex={0} role="application" aria-label="Photo. Drag or use arrow keys to move it">
          {src && size && <img src={src} alt="" draggable={false} style={{ position: 'absolute', left, top, width: dw, height: dh }} />}
          <svg className="crop-mask" width={VIEW} height={VIEW} aria-hidden="true">
            <defs><mask id="hole"><rect width={VIEW} height={VIEW} fill="white" /><rect x={HX} y={HY} width={HOLE_W} height={HOLE_H} rx="44" fill="black" /></mask></defs>
            <rect width={VIEW} height={VIEW} fill="rgba(8,20,14,0.62)" mask="url(#hole)" />
            <rect x={HX} y={HY} width={HOLE_W} height={HOLE_H} rx="44" fill="none" stroke="#ffd25a" strokeWidth="3" strokeDasharray="8 6" />
          </svg>
        </div>
        <label className="crop-zoom" htmlFor="crop-zoom">Zoom
          <input id="crop-zoom" type="range" min="1" max="4" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
        <p className="field-note">Drag the photo so your face and hair fill the dotted shape. Your Santa hat and sweater get added for you.</p>
      </div>
    </Modal>
  );
}
