import { supabaseBrowser } from './supabase/client';

/** Name+PIN accounts get a private sign-in address on this domain. No email is ever sent to it. */
export const PIN_EMAIL_DOMAIN = '@pin.our-christmas.app';
export const isPinEmail = (email?: string | null) => Boolean(email && email.endsWith(PIN_EMAIL_DOMAIN));

export const pinError = (pin: string): string | null =>
  !pin ? 'Choose a PIN.' : !/^\d{4,6}$/.test(pin) ? 'Use 4 to 6 numbers, like 2580.' : null;

type PinLogin = { ok: true } | { ok: false; reason: 'no_account' | 'wrong_pin' | 'locked' | 'use_email' | 'error'; message: string };

/** Sign this browser into the account that owns this name, if the PIN matches. */
export async function signInWithNamePin(name: string, pin: string): Promise<PinLogin> {
  const db = supabaseBrowser();
  const { data, error } = await db.rpc('pin_login', { p_name: name, p_pin: pin });
  if (error || !data) return { ok: false, reason: 'error', message: 'Couldn’t reach the server. Try again in a moment.' };
  if (!data.ok) {
    const reason = data.reason as Exclude<PinLogin, { ok: true }>['reason'];
    const message =
      reason === 'no_account' ? `There’s no list with the name “${name.trim()}” and a PIN yet. Check the spelling, or start a new list.`
      : reason === 'wrong_pin' ? `That PIN isn’t right. ${data.tries_left} ${data.tries_left === 1 ? 'try' : 'tries'} left before a short lock.`
      : reason === 'locked' ? `Too many wrong PINs. For safety, this name is locked for ${data.minutes} minute${data.minutes === 1 ? '' : 's'}.`
      : reason === 'use_email' ? 'This account was saved with an email. Log in with your email and password instead.'
      : 'Something went wrong. Try again.';
    return { ok: false, reason, message };
  }
  const { error: e2 } = await db.auth.signInWithPassword({ email: data.email, password: data.password });
  if (e2) return { ok: false, reason: 'error', message: 'Couldn’t sign you in. Try again in a moment.' };
  return { ok: true };
}

/** Is this name free, or already somebody's (with a PIN)? */
export async function nameStatus(name: string): Promise<'available' | 'taken' | 'empty' | 'error'> {
  const { data, error } = await supabaseBrowser().rpc('name_status', { p_name: name });
  return error ? 'error' : (data as 'available' | 'taken' | 'empty');
}

/** Set or change the signed-in person's PIN. */
export async function setPin(pin: string): Promise<string | null> {
  const { data, error } = await supabaseBrowser().rpc('set_account_pin', { p_pin: pin });
  if (error || !data) return 'Couldn’t save your PIN. Try again.';
  if (data.ok) return null;
  return data.reason === 'name_taken' ? 'Someone else already signs in with that name. Change your name on your profile (add a last name or nickname), then set your PIN.'
    : data.reason === 'bad_pin' ? 'Use 4 to 6 numbers, like 2580.'
    : data.reason === 'no_name' ? 'Add your name first.'
    : 'Couldn’t save your PIN. Try again.';
}
