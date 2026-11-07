'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PIN_HINT, PinField } from '@/components/auth/PinField';
import { pinError, setPin } from '@/lib/pin';

/** Set or change the PIN that, with your name, opens your list on any device. */
export function PinPanel({ hasPin, name, retry }: { hasPin: boolean; name: string; retry?: boolean }) {
  const router = useRouter();
  const [pin, setPinValue] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(
    retry ? { tone: 'err', text: 'Your list is ready, but that name was just taken by someone else. Change your name above, then set your PIN here.' } : null,
  );
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!hasPin);
  const [done, setDone] = useState(hasPin);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pe = pinError(pin);
    if (pe) return setMsg({ tone: 'err', text: pe });
    setBusy(true);
    const problem = await setPin(pin);
    setBusy(false);
    if (problem) return setMsg({ tone: 'err', text: problem });
    setMsg({ tone: 'ok', text: `Saved. On any phone or computer, log in with “${name}” and this PIN.` });
    setPinValue(''); setDone(true); setOpen(false);
    router.refresh();
  };

  return (
    <section className="panel" id="pin" data-testid="pin-panel">
      <div className="panel-row-head">
        <h2>{done ? '🔐 Your sign-in PIN' : '🔐 Set a PIN'}</h2>
        <p className="muted">{done
          ? <>To open your list on another device, log in with <strong>{name}</strong> and your PIN.</>
          : <>Your list is only on this device. With a PIN, you can open it anywhere by typing <strong>{name}</strong> and your PIN.</>}</p>
      </div>
      {open ? (
        <form className="form" onSubmit={submit} noValidate>
          <PinField id="pf-pin" label={done ? 'New PIN' : 'Choose a PIN'} value={pin} onChange={(v) => { setPinValue(v); setMsg(null); }} autoComplete="new-password" hint={PIN_HINT} />
          {msg && <p className={msg.tone === 'err' ? 'field-error' : 'authcard-done'} role="status">{msg.text}</p>}
          <div className="panel-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : done ? 'Change PIN' : 'Save my PIN'}</button>
            {done && <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setMsg(null); }}>Cancel</button>}
          </div>
        </form>
      ) : (
        <div className="panel-actions">
          {msg && <p className="authcard-done" role="status">{msg.text}</p>}
          <button type="button" className="btn btn-ghost" onClick={() => { setOpen(true); setMsg(null); }}>Change my PIN</button>
        </div>
      )}
    </section>
  );
}
