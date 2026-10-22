const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { accountKey, forgetAccount, LOGIN_ACCOUNTS_KEY, LEGACY_LOGIN_KEY, localTestAccounts, parsePasswordCredentialId, passwordCredentialId, readLoginState, rememberAccount, writeLoginState } = require('../src/lib/saved-login-accounts.ts');
const a = { tenantSlug: 'store-a', tenantName: 'Loja A', email: 'owner@example.com' };
const b = { tenantSlug: 'store-b', tenantName: 'Loja B', email: 'owner@example.com' };

test('same email keeps separate stores and password-manager identities; repeated sign-in updates one account', () => {
  let state = readLoginState(null, null, []);
  state = rememberAccount(rememberAccount(state, a), b);
  assert.equal(state.accounts.length, 2);
  state = rememberAccount(state, { ...a, tenantSlug: ' STORE-A ', email: 'OWNER@EXAMPLE.COM', tenantName: 'Updated' });
  assert.equal(state.accounts.length, 2);
  assert.equal(state.accounts[0].tenantName, 'Updated');
  assert.equal(state.lastUsed, accountKey(a));
  assert.notEqual(passwordCredentialId(a), passwordCredentialId(b));
  assert.equal(accountKey(parsePasswordCredentialId(passwordCredentialId(a))), accountKey(a));
  assert.equal(parsePasswordCredentialId(a.email), null, 'old email-only credentials cannot identify a store');
});

test('legacy account migrates and storage projects metadata without passwords, hashes or unknown fields', () => {
  const state = readLoginState(null, JSON.stringify({ ...a, password: 'secret', password_hash: 'hash' }), [b]);
  assert.equal(state.accounts.length, 2);
  const storage = new Map();
  storage.set(LEGACY_LOGIN_KEY, 'old');
  assert.equal(writeLoginState({ setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, state), true);
  assert.equal(storage.has(LEGACY_LOGIN_KEY), false);
  const serialized = storage.get(LOGIN_ACCOUNTS_KEY);
  for (const forbidden of ['password', 'secret', 'hash']) assert.equal(serialized.includes(forbidden), false);
  assert.deepEqual(readLoginState(serialized, null, []), state);
});

test('removed and cleared accounts stay removed after reload, even with development seeds', () => {
  const state = forgetAccount(rememberAccount(readLoginState(null, null, [a, b]), a), accountKey(a));
  assert.equal(state.lastUsed, null);
  assert.deepEqual(readLoginState(JSON.stringify(state), null, [a, b]).accounts, [b]);
  assert.deepEqual(readLoginState(JSON.stringify({ accounts: [], lastUsed: null }), JSON.stringify(a), [a, b]).accounts, []);
});

test('corrupt or hostile storage is bounded and sanitized without blocking login', () => {
  assert.deepEqual(readLoginState('{', '{', [a]).accounts, [a]);
  const state = readLoginState(JSON.stringify({ accounts: [null, 5, {}, { ...a, tenantSlug: '<script>' }, a, a], lastUsed: 'missing' }), null, []);
  assert.deepEqual(state, { accounts: [a], lastUsed: null });
  assert.equal(writeLoginState({ setItem: () => { throw new Error('quota'); }, removeItem: () => {} }, state), false);
  assert.equal(parsePasswordCredentialId('montante:{broken'), null);
});

test('test-store seeds never reach production, test builds or non-local hosts', () => {
  const raw = JSON.stringify([a, b]);
  for (const mode of ['production', 'test', undefined]) assert.deepEqual(localTestAccounts(mode, 'localhost:3000', raw), []);
  for (const host of [null, 'example.com', 'localhost.evil.com', '127.0.0.1.evil.com']) assert.deepEqual(localTestAccounts('development', host, raw), []);
  for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) assert.deepEqual(localTestAccounts('development', host, raw), [a, b]);
  assert.deepEqual(localTestAccounts('development', 'localhost', 'invalid'), []);
});
