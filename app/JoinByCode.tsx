'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function JoinByCode({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const submit = (e: FormEvent) => { e.preventDefault(); if (clean.length === 8) router.push(`/join/${clean}`); };
  return (
    <form className={`join-form${compact ? ' is-compact' : ''}`} onSubmit={submit}>
      <label htmlFor="join-code" className="sr-only">Invitation code</label>
      <input id="join-code" value={code} maxLength={9} placeholder="ABCD-1234" autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={clean.length !== 8}>Join family</button>
    </form>
  );
}
