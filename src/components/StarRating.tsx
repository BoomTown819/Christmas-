'use client';
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { wantLabel } from '../lib/organize';

interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showLabel?: boolean;
  id?: string;
}

const STAR_PATH =
  'M12 2.6l2.83 5.92 6.5.86-4.76 4.5 1.2 6.45L12 17.2l-5.77 3.13 1.2-6.45-4.76-4.5 6.5-.86z';

function Star({ fill }: { fill: 0 | 0.5 | 1 }) {
  return (
    <span className="star" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="star-empty"><path d={STAR_PATH} /></svg>
      <span className="star-fill" style={{ width: `${fill * 100}%` }}>
        <svg viewBox="0 0 24 24"><path d={STAR_PATH} /></svg>
      </span>
    </span>
  );
}

const clamp = (v: number) => Math.min(5, Math.max(0.5, Math.round(v * 2) / 2));

/** Half-star "how badly I want it" rating. Click the left half of a star for .5. Arrow keys step by half a star. */
export function StarRating({ value, onChange, size = 'md', label = 'How badly I want it', showLabel = false, id }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [pulse, setPulse] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const interactive = Boolean(onChange);
  const shown = hover ?? value;

  const valueAt = (e: PointerEvent<HTMLDivElement>) => {
    const stars = ref.current?.querySelectorAll<HTMLElement>('.star');
    if (!stars) return null;
    for (let i = 0; i < stars.length; i++) {
      const r = stars[i].getBoundingClientRect();
      const pad = 3; // include the gap after each star
      if (e.clientX <= r.right + pad || i === stars.length - 1) {
        return clamp(i + (e.clientX < r.left + r.width / 2 ? 0.5 : 1));
      }
    }
    return null;
  };

  const commit = (v: number) => {
    onChange?.(v);
    setPulse((p) => p + 1);
  };

  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 };
    if (e.key in step) commit(clamp(value + step[e.key]));
    else if (e.key === 'Home') commit(0.5);
    else if (e.key === 'End') commit(5);
    else if (/^[1-5]$/.test(e.key)) commit(Number(e.key));
    else return;
    e.preventDefault();
  };

  const stars = [0, 1, 2, 3, 4].map((i) => {
    const f = shown - i;
    return <Star key={i} fill={f >= 1 ? 1 : f >= 0.5 ? 0.5 : 0} />;
  });

  if (!interactive) {
    return (
      <div className={`stars stars-${size}`} role="img" aria-label={`${value} out of 5 stars: ${wantLabel(value)}`}>
        {stars}
        {showLabel && <span className="stars-value">{value.toFixed(1)}</span>}
      </div>
    );
  }

  return (
    <div className="stars-wrap">
      <div
        id={id}
        ref={ref}
        className={`stars stars-${size} stars-interactive${hover != null ? ' is-hovering' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-labelledby={showLabel ? labelId : undefined}
        aria-valuemin={0.5}
        aria-valuemax={5}
        aria-valuenow={value}
        aria-valuetext={`${value} out of 5 stars, ${wantLabel(value)}`}
        onPointerMove={(e) => setHover(valueAt(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const v = valueAt(e as unknown as PointerEvent<HTMLDivElement>);
          if (v != null) commit(v);
        }}
        onKeyDown={onKey}
      >
        <span key={pulse} className={pulse ? 'stars-pulse' : undefined} style={{ display: 'contents' }}>
          {stars}
        </span>
      </div>
      {showLabel && (
        <span className="stars-readout" id={labelId} aria-live="polite">
          <strong>{shown.toFixed(1)}</strong> <span>{wantLabel(shown)}</span>
        </span>
      )}
    </div>
  );
}
