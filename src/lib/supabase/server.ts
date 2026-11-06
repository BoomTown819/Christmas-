import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Server Supabase client acting as the signed-in visitor (or anonymous). Never uses a service key. */
export function supabaseServer() {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component; middleware refreshes the session instead */
        }
      },
    },
  });
}

export async function getSessionUser() {
  const db = supabaseServer();
  const { data } = await db.auth.getUser();
  return { db, user: data.user };
}
