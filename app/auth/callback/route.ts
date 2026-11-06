import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeNext } from '@/lib/safeNext';
import { supabaseServer } from '@/lib/supabase/server';

// Handles links from Supabase emails (confirm signup, password reset).
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get('next'), '/');
  const db = supabaseServer();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const { error } = code
    ? await db.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await db.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('missing code') };
  const dest = new URL(error ? '/login?link=expired' : next, url.origin);
  return NextResponse.redirect(dest);
}
