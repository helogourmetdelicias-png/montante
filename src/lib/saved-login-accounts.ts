export type SavedLoginAccount = { tenantSlug: string; tenantName: string; email: string };
export type SavedLoginState = { accounts: SavedLoginAccount[]; lastUsed: string | null };

export const LOGIN_ACCOUNTS_KEY = 'montante.login.accounts.v1';
export const LEGACY_LOGIN_KEY = 'montante.login';

export function accountKey(account: Pick<SavedLoginAccount, 'tenantSlug' | 'email'>) {
  return JSON.stringify([account.tenantSlug.trim().toLowerCase(), account.email.trim().toLowerCase()]);
}

// Explicit projection prevents passwords or extra fields from reaching browser storage.
export function parseAccount(value: unknown): SavedLoginAccount | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.tenantSlug !== 'string' || typeof item.email !== 'string') return null;
  const tenantSlug = item.tenantSlug.trim().toLowerCase(), email = item.email.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,100}$/.test(tenantSlug) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const tenantName = typeof item.tenantName === 'string' ? item.tenantName.trim().slice(0, 100) : '';
  return { tenantSlug, tenantName: tenantName || tenantSlug, email };
}

export function parseAccounts(value: unknown): SavedLoginAccount[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, SavedLoginAccount>();
  for (const item of value.slice(0, 100)) {
    const account = parseAccount(item);
    if (account) unique.set(accountKey(account), account);
  }
  return [...unique.values()];
}

function parseJson(value: string | null): unknown {
  try { return JSON.parse(value ?? 'null'); } catch { return null; }
}

export function readLoginState(raw: string | null, legacy: string | null, initialAccounts: SavedLoginAccount[]): SavedLoginState {
  const saved = parseJson(raw) as Partial<SavedLoginState> | null;
  // A saved empty list is intentional: removed test accounts must not reappear.
  if (saved && Array.isArray(saved.accounts)) {
    const accounts = parseAccounts(saved.accounts);
    return { accounts, lastUsed: accounts.some(account => accountKey(account) === saved.lastUsed) ? saved.lastUsed! : null };
  }
  const previous = parseAccount(parseJson(legacy));
  const accounts = parseAccounts(previous ? [previous, ...initialAccounts] : initialAccounts);
  return { accounts, lastUsed: previous ? accountKey(previous) : null };
}

export function rememberAccount(state: SavedLoginState, value: SavedLoginAccount): SavedLoginState {
  const account = parseAccount(value);
  if (!account) return state;
  const key = accountKey(account);
  return { accounts: [account, ...state.accounts.filter(item => accountKey(item) !== key)].slice(0, 100), lastUsed: key };
}

export function forgetAccount(state: SavedLoginState, key: string): SavedLoginState {
  return { accounts: state.accounts.filter(item => accountKey(item) !== key), lastUsed: state.lastUsed === key ? null : state.lastUsed };
}

export function writeLoginState(storage: Pick<Storage, 'setItem' | 'removeItem'>, state: SavedLoginState) {
  try {
    storage.setItem(LOGIN_ACCOUNTS_KEY, JSON.stringify({ accounts: parseAccounts(state.accounts), lastUsed: state.lastUsed }));
    storage.removeItem(LEGACY_LOGIN_KEY);
    return true;
  } catch { return false; }
}

// The password manager's identity includes the store, even when emails are shared.
export function passwordCredentialId(account: Pick<SavedLoginAccount, 'tenantSlug' | 'email'>) {
  return `montante:${accountKey(account)}`;
}

export function parsePasswordCredentialId(id: string): SavedLoginAccount | null {
  if (!id.startsWith('montante:')) return null;
  const value = parseJson(id.slice('montante:'.length));
  if (!Array.isArray(value) || value.length !== 2) return null;
  return parseAccount({ tenantSlug: value[0], email: value[1] });
}

export function localTestAccounts(environment: string | undefined, host: string | null, raw: string | undefined) {
  if (environment !== 'development' || !host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return [];
  return parseAccounts(parseJson(raw ?? null));
}
