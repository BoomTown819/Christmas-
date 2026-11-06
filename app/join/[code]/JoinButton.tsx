'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export function JoinButton({ code, familyName }: { code: string; familyName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc('join_family', { p_code: code });
    setBusy(false);
    if (error) return setError(error.message);
    try { localStorage.setItem('our-christmas:family', data as string); } catch { /* */ }
    router.replace('/');
    router.refresh();
  };
  return (
    <div className="form">
      <button type="button" className="btn btn-festive btn-lg" onClick={join} disabled={busy}>{busy ? 'Joining…' : `Join ${familyName}`}</button>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
