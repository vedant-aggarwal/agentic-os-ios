import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';
import { api, currentToken } from './api';

// The address book, synced to his PC only (PUT /contacts on his server), so Nora can find people by name when he
// asks her to call or message someone. Names, nicknames, organisation, phones, emails and birthdays; never photos.
// Tapping Sync contacts in the Account sheet asks for access the first time; on open the app syncs again by itself
// at most every 12 hours, and only once access is already granted (it never asks on open).
// expo-contacts is native: builds before it was added have no ExpoContacts module, so it's required lazily, inside a
// try, only once the module is there. On those builds the Account sheet says to update from TestFlight.

type Lib = typeof import('expo-contacts');
const present = Platform.OS !== 'web' && !!requireOptionalNativeModule('ExpoContacts') && !!requireOptionalNativeModule('ExpoContactsNext');
let lib: Lib | null | undefined;
function load(): Lib | null {
  if (lib !== undefined) return lib;
  lib = null;
  if (!present) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lib = require('expo-contacts') as Lib;
  } catch {
    lib = null;
  }
  return lib;
}

export const contactsSupported = () => !!load();

export type ContactsStatus = { count: number; syncedAt: string | null };
export type Access = 'granted' | 'limited' | 'ask' | 'denied' | 'unsupported';

/** What the phone allows now, without asking. */
export async function contactsAccess(): Promise<Access> {
  const C = load();
  if (!C) return 'unsupported';
  try {
    const p = await C.getPermissionsAsync();
    if (p.granted) return p.accessPrivileges === 'limited' ? 'limited' : 'granted';
    return p.canAskAgain ? 'ask' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** The count and last sync time the PC has. Null when it can't say (offline, or an older server). */
export async function contactsStatus(): Promise<ContactsStatus | null> {
  try { return await api<ContactsStatus>('/contacts/status'); } catch { return null; }
}

// ── reading and sending ──────────────────────────────────────────────────────

type Wire = {
  id: string; name: string; nickname: string | null; org: string | null; birthday: string | null;
  phones: { label: string; number: string }[]; emails: { label: string; address: string }[];
};

const two = (n: number) => String(n).padStart(2, '0');

async function read(C: Lib): Promise<Wire[]> {
  const F = C.ContactField;
  const rows = await C.Contact.getAllDetails([
    F.FULL_NAME, F.GIVEN_NAME, F.MIDDLE_NAME, F.FAMILY_NAME, F.NICKNAME, F.COMPANY, F.PHONES, F.EMAILS, F.BIRTHDAY,
  ] as const);
  return rows.map((r) => {
    const b = r.birthday;
    return {
      id: r.id,
      name: (r.fullName || [r.givenName, r.middleName, r.familyName].filter(Boolean).join(' ')).trim(),
      nickname: r.nickname || null,
      org: r.company || null,
      birthday: b?.month && b?.day ? `${b.year ? String(b.year).padStart(4, '0') : '-'}-${two(b.month)}-${two(b.day)}` : null,
      phones: (r.phones ?? []).filter((p) => p.number).map((p) => ({ label: p.label ?? '', number: p.number! })),
      emails: (r.emails ?? []).filter((e) => e.address).map((e) => ({ label: e.label ?? '', address: e.address! })),
    };
  });
}

const SYNC_KEY = 'aos_contacts_synced';
type KV = { getItemAsync(k: string): Promise<string | null>; setItemAsync(k: string, v: string): Promise<void> };
const kv: KV | null = requireOptionalNativeModule('ExpoSecureStore')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require('expo-secure-store') as KV) : null;

export type SyncResult = ContactsStatus | { denied: true };
let inflight: Promise<SyncResult> | null = null;

/** Reads the whole address book and replaces the PC's copy. `ask`: show the iOS prompt if access hasn't been asked. */
export function syncContacts({ ask }: { ask: boolean }): Promise<SyncResult> {
  if (inflight) return inflight;
  inflight = (async () => {
    const C = load();
    if (!C) throw new Error('This build has no contacts. Update from TestFlight.');
    let p = await C.getPermissionsAsync();
    if (!p.granted && ask && p.canAskAgain) p = await C.requestPermissionsAsync();
    if (!p.granted) return { denied: true } as const;
    const contacts = await read(C);
    const r = await api<ContactsStatus>('/contacts', { method: 'PUT', body: { contacts } });
    lastSync = Date.now();
    kv?.setItemAsync(SYNC_KEY, String(lastSync)).catch(() => {});
    return r;
  })().finally(() => { inflight = null; });
  return inflight;
}

// ── quietly on open ──────────────────────────────────────────────────────────

const EVERY = 12 * 3600_000;
const RETRY = 30 * 60_000; // after a failed quiet sync, wait this long before trying again
let lastSync: number | null = null;
let lastTry = 0;

async function quiet() {
  if (!load() || !currentToken() || inflight) return;
  if (Date.now() - lastTry < RETRY) return;
  if (lastSync === null) lastSync = Number((await kv?.getItemAsync(SYNC_KEY).catch(() => null)) ?? 0) || 0;
  if (Date.now() - lastSync < EVERY) return;
  const access = await contactsAccess();
  if (access !== 'granted' && access !== 'limited') return; // never prompt on open
  lastTry = Date.now();
  await syncContacts({ ask: false }).catch(() => {});
}

/** Mounted by Today once he's signed in: syncs now and each time the app comes back, at most every 12 hours. */
export function startContactSync(): () => void {
  if (!present) return () => {};
  void quiet();
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void quiet(); });
  return () => sub.remove();
}
