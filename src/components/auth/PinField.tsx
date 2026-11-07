'use client';
import { useState } from 'react';

/** 4-6 digit PIN box with a show/hide toggle. */
export function PinField({ id, value, onChange, label = 'PIN', hint, autoComplete = 'current-password', autoFocus }: {
  id: string; value: string; onChange: (v: string) => void; label?: string; hint?: string; autoComplete?: string; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pin-row">
        <input id={id} className="pin-input" type={show ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]*" maxLength={6}
          autoComplete={autoComplete} placeholder="••••" value={value} autoFocus={autoFocus}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-controls={id}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {hint && <p className="field-note" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

export const PIN_HINT = 'Recommended: use the same passcode you use to unlock your phone, so it’s easy to remember. 4 to 6 numbers.';
