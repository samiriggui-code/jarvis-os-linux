/**
 * API Auth HUD → Core User Manager (WS).
 * Source de vérité = SQLite Core, pas localStorage.
 */
import { getCoreClient } from './coreClient';

const LAST_USER_KEY = 'jarvis_last_username';
const BACKUP_PIN_KEY = 'jarvis_backup_pin_hint'; // rappel UI seulement — le hash est côté Core

export type AuthStatus = {
  first_run: boolean;
  user_count: number;
  db_path?: string;
  session?: Record<string, unknown> | null;
};

export type AuthUser = {
  id: string;
  username: string;
  display_name?: string;
  role: string;
  permissions?: string[];
  biometrics?: { face?: boolean; voice?: boolean; gesture?: boolean };
};

export type LoginResult = {
  ok: boolean;
  error?: string;
  event?: {
    type: string;
    session_id: string;
    user: AuthUser;
    method: string;
    confidence: number;
    admin_elevated: boolean;
    permissions: string[];
  };
};

function client() {
  return getCoreClient();
}

export function getLastUsername(): string {
  try {
    return localStorage.getItem(LAST_USER_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastUsername(name: string) {
  try {
    localStorage.setItem(LAST_USER_KEY, name);
  } catch { /* */ }
}

/** PIN secours enrollé (défaut 0000) — hashé en DB Core. */
export function getEnrollPin(): string {
  try {
    return localStorage.getItem(BACKUP_PIN_KEY) || '0000';
  } catch {
    return '0000';
  }
}

export function setEnrollPin(pin: string) {
  try {
    localStorage.setItem(BACKUP_PIN_KEY, pin);
  } catch { /* */ }
}

export async function authStatus(): Promise<AuthStatus> {
  const data = await client().request(
    { type: 'auth', action: 'status' },
    d => d.type === 'auth_status',
  );
  return {
    first_run: Boolean(data.first_run),
    user_count: Number(data.user_count ?? 0),
    db_path: typeof data.db_path === 'string' ? data.db_path : undefined,
    session: (data.session as Record<string, unknown> | null) ?? null,
  };
}

export async function authEnroll(opts: {
  username: string;
  display_name?: string;
  pin?: string;
  face?: boolean;
  voice?: boolean;
  gesture?: boolean;
  /** USER | CHILD | GUEST — jamais ADMIN sauf first_run côté Core */
  role?: 'USER' | 'CHILD' | 'GUEST' | 'ADMIN';
}): Promise<{ ok: boolean; error?: string; user?: AuthUser }> {
  const pin = opts.pin ?? getEnrollPin();
  const data = await client().request(
    {
      type: 'auth',
      action: 'enroll',
      username: opts.username,
      display_name: opts.display_name ?? opts.username,
      pin,
      face: opts.face ?? true,
      voice: opts.voice ?? true,
      gesture: opts.gesture ?? false,
      role: opts.role,
    },
    d => d.type === 'auth_enroll_result',
  );
  if (data.ok) {
    setLastUsername(opts.username);
    setEnrollPin(pin);
  }
  return {
    ok: Boolean(data.ok),
    error: typeof data.error === 'string' ? data.error : undefined,
    user: data.user as AuthUser | undefined,
  };
}

export async function authLogin(opts: {
  username?: string;
  user_id?: string;
  pin?: string;
  method?: string;
  confidence?: number;
}): Promise<LoginResult> {
  // Face 1:N : ne pas forcer le dernier username si on a déjà un user_id.
  const username =
    opts.username
    || (opts.user_id ? undefined : getLastUsername())
    || undefined;
  const data = await client().request(
    {
      type: 'auth',
      action: 'login',
      username,
      user_id: opts.user_id,
      pin: opts.pin,
      method: opts.method ?? (opts.pin ? 'pin' : 'face'),
      confidence: opts.confidence ?? (opts.pin ? 1 : 0.95),
    },
    d => d.type === 'auth_login_result',
  );
  if (data.ok) {
    const u = (data as LoginResult).event?.user?.username || username;
    if (u) setLastUsername(u);
  }
  return data as unknown as LoginResult;
}

export async function authRecoveryLogin(opts: {
  pin: string;
  username?: string;
}): Promise<LoginResult & { locked?: boolean; retry_after_s?: number; remaining?: number; line?: string }> {
  const data = await client().request(
    {
      type: 'auth',
      action: 'recovery_login',
      username: opts.username,
      pin: opts.pin,
    },
    d => d.type === 'auth_recovery_result',
  );
  return data as unknown as LoginResult & { locked?: boolean; retry_after_s?: number; remaining?: number; line?: string };
}

export async function authLogout(): Promise<void> {
  try {
    await client().request(
      { type: 'auth', action: 'logout' },
      d => d.type === 'auth_logout_result',
      4000,
    );
  } catch {
    /* offline lock local OK */
  }
}

export async function authElevate(method = 'face_stub'): Promise<LoginResult> {
  const data = await client().request(
    { type: 'auth', action: 'elevate', method },
    d => d.type === 'auth_elevate_result',
  );
  return data as unknown as LoginResult;
}

export async function authRevokeAdmin(): Promise<void> {
  try {
    await client().request(
      { type: 'auth', action: 'revoke_admin' },
      d => d.type === 'auth_revoke_result',
      4000,
    );
  } catch { /* */ }
}

/** Liste foyer (admin). Voiceprint / timbre = flag biometrics.voice pour l’instant. */
export async function authListUsers(): Promise<{ ok: boolean; users: AuthUser[]; error?: string }> {
  try {
    const data = await client().request(
      { type: 'auth', action: 'list_users' },
      d => d.type === 'auth_users',
      5000,
    );
    return {
      ok: Boolean(data.ok),
      users: Array.isArray(data.users) ? (data.users as AuthUser[]) : [],
      error: typeof data.error === 'string' ? data.error : undefined,
    };
  } catch (e) {
    return { ok: false, users: [], error: e instanceof Error ? e.message : 'offline' };
  }
}
