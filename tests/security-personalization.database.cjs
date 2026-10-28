// Uses a disposable PostgreSQL schema. Never changes application accounts or sends real email.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const originalUrl = process.env.DATABASE_URL;
assert.ok(originalUrl, 'Load .env first');
const schema = `qa_security_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
assert.match(schema, /^qa_security_[a-f0-9]{12}$/);
const testUrl = new URL(originalUrl); testUrl.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: originalUrl } } });
const db = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
let currentSession = null;
const mails = [], objects = new Map();
const storage = {
  getBucket: async () => ({ data: { public: false }, error: null }),
  from: () => ({
    upload: async (key, bytes) => { objects.set(key, bytes); return { error: null }; },
    remove: async keys => { keys.forEach(key => objects.delete(key)); return { error: null }; },
    download: async key => ({ data: objects.has(key) ? new Blob([objects.get(key)]) : null, error: objects.has(key) ? null : new Error('Missing') }),
  }),
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args); };
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === '@/auth') return { auth: async () => currentSession };
  if (name === '@supabase/supabase-js') return { createClient: () => ({ storage }) };
  return load.call(this, name, ...args);
};
require.cache[require.resolve('../src/lib/prisma.ts')] = { exports: { prisma: db } };
process.env.AUTH_SECRET = 'qa-security-secret-not-used-for-production';
process.env.RESEND_API_KEY = 'mock-resend-key'; process.env.AUTH_EMAIL_FROM = 'qa@example.invalid';
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  // Mock Resend API endpoint
  if (String(url).includes('resend.com/emails')) {
    const mail = JSON.parse(options.body);
    const code = mail.html ? mail.html.match(/\b(\d{6})\b/)?.[1] : mail.text.match(/\b(\d{6})\b/)?.[1];
    mails.push({ ...mail, code });
    return Response.json({ id: 'mock-email-id' });
  }
  throw new Error(`Unexpected external request: ${url}`);
};
const cookies = (result, name) => new RegExp(`${name}=([^;]+)`).exec(result.headers.get('set-cookie') ?? '')?.[1];
const request = (url, body, cookie = '', method = 'POST') => new Request(`https://montante.test${url}`, { method, headers: { origin: 'https://montante.test', cookie, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
let assertions = 0;
async function checkStatus(response, expected) { assert.equal(response.status, expected, await response.clone().text()); assertions++; return response.json().catch(() => null); }

(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: { ...process.env, DATABASE_URL: testUrl.toString(), DIRECT_URL: testUrl.toString() }, stdio: 'pipe' });
    const security = require('../src/lib/security/auth-flow.ts');
    const loginRoute = require('../src/app/api/auth/security/[action]/route.ts');
    const mediaRoute = require('../src/app/api/media/route.ts');
    const mediaRead = require('../src/app/api/media/[id]/route.ts');
    const settings = require('../src/app/api/settings/screensaver/route.ts');
    const personalization = require('../src/app/api/settings/personalization/route.ts');
    const { saveServiceOrder } = require('../src/lib/service-orders/service.ts');
    const storageLibrary = require('../src/lib/media/storage.ts');
    const password = 'QaSecurePassword123!';
    const password_hash = await bcrypt.hash(password, 4);
    const a = await db.tenant.create({ data: { name: 'QA A', slug: `qa-a-${schema}` } });
    const b = await db.tenant.create({ data: { name: 'QA B', slug: `qa-b-${schema}` } });
    const email = 'shared@example.invalid';
    const userA = await db.user.create({ data: { tenant_id: a.id, name: 'QA A', email, password_hash, role: 'owner' } });
    const userB = await db.user.create({ data: { tenant_id: b.id, name: 'QA B', email, password_hash, role: 'owner' } });
    const obsoleteTicket = await security.issueTicket(userB, 'b'.repeat(64));
    await db.trustedDevice.create({ data: { user_id: userB.id, token_hash: security.secretHash('b'.repeat(64)), auth_version: 0, expires_at: new Date(Date.now() + 86400000) } });
    const call = (action, body, cookie = '') => loginRoute.POST(request(`/api/auth/security/${action}`, body, cookie), { params: Promise.resolve({ action }) });
    const choose = await checkStatus(await call('start', { email, password }), 200);
    assert.equal(choose.stores.length, 2); assert.equal(mails.length, 0);
    await checkStatus(await call('start', { email, password: 'Incorrect123' }), 401);
    await checkStatus(await call('start', { email, password, tenantChoice: 'foreign-store' }), 401);
    let start = await call('start', { email, password, tenantChoice: a.id });
    let data = await checkStatus(start, 200);
    let flow = cookies(start, security.FLOW_COOKIE);
    assert.ok(flow); assert.match(start.headers.get('set-cookie'), /HttpOnly/i);
    assert.ok(data.ticket); assert.equal(mails.length, 0);
    assert.equal(await security.consumeLoginTicket(data.ticket, 'f'.repeat(64)), null);
    assert.equal((await security.consumeLoginTicket(data.ticket, flow)).tenant_id, a.id);
    assert.equal(await security.consumeLoginTicket(data.ticket, flow), null);
    // The reset never reveals store names until ownership of the mailbox is proved.
    const unknown = await checkStatus(await call('forgot', { email: 'unknown@example.invalid' }), 200);
    assert.ok(unknown.challengeId); assert.equal(unknown.stores, undefined);
    const forgot = await call('forgot', { email }); const forgotData = await checkStatus(forgot, 200);
    const resetFlow = cookies(forgot, security.FLOW_COOKIE), resetJar = `${security.FLOW_COOKIE}=${resetFlow}`;
    const resetProof = await checkStatus(await call('verify', { challengeId: forgotData.challengeId, code: mails.at(-1).code }, resetJar), 200);
    assert.equal(resetProof.stores.length, 2);
    assert.equal(await security.consumeLoginTicket(resetProof.resetTicket, resetFlow), null);
    await checkStatus(await call('reset', { ticket: resetProof.resetTicket, password: 'NewSecurePassword123!', confirmPassword: 'NewSecurePassword123!', tenantChoice: 'foreign' }, resetJar), 400);
    await checkStatus(await call('reset', { ticket: resetProof.resetTicket, password: 'NewSecurePassword123!', confirmPassword: 'NewSecurePassword123!', tenantChoice: b.id }, resetJar), 200);
    assert.equal((await db.user.findUnique({ where: { id: userA.id } })).auth_version, 0);
    assert.equal((await db.user.findUnique({ where: { id: userB.id } })).auth_version, 1);
    assert.ok(await bcrypt.compare('NewSecurePassword123!', (await db.user.findUnique({ where: { id: userB.id } })).password_hash));
    assert.equal(await db.trustedDevice.count({ where: { user_id: userB.id } }), 0);
    assert.equal(await security.consumeLoginTicket(obsoleteTicket, 'b'.repeat(64)), null);
    assert.deepEqual((await security.findLoginUsers(email, 'NewSecurePassword123!')).map(user => user.tenant_id), [b.id]);
    await checkStatus(await call('reset', { ticket: resetProof.resetTicket, password: 'NewSecurePassword123!', confirmPassword: 'NewSecurePassword123!', tenantChoice: b.id }, resetJar), 400);
    // Session-dependent image/settings routes use real isolated tenant records.
    currentSession = { user: { id: userA.id, tenantId: a.id, role: 'owner' } };
    const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: '#ea580c' } }).png().toBuffer();
    const multipart = purpose => { const form = new FormData(); form.set('file', new File([png], 'private-photo.png', { type: 'image/png' })); form.set('purpose', purpose); return form; };
    const logo = await checkStatus(await mediaRoute.POST(request('/api/media', multipart('logo'))), 201);
    await checkStatus(await personalization.PATCH(request('/api/settings/personalization', { logoUrl: logo.url })), 200);
    assert.equal((await checkStatus(await personalization.GET(), 200)).logoUrl, logo.url);
    const uploaded = await checkStatus(await mediaRoute.POST(request('/api/media', multipart('screensaver'))), 201);
    const assetId = uploaded.url.split('/').at(-1);
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId } });
    assert.ok(asset.storage_path.startsWith(`${a.id}/screensaver/`)); assert.equal(asset.mime_type, 'image/webp');
    const metadata = await sharp(objects.get(asset.storage_path)).metadata(); assert.equal(metadata.exif, undefined);
    await assert.rejects(() => storageLibrary.normalizeImage(Buffer.from('<svg></svg>'), 'image/png'));
    await checkStatus(await settings.PATCH(request('/api/settings/screensaver', { minutes: 5, imageUrl: uploaded.url })), 200);
    assert.equal((await db.tenant.findUnique({ where: { id: a.id } })).screensaver_minutes, 5);
    const read = await mediaRead.GET(request(uploaded.url, undefined, '', 'GET'), { params: Promise.resolve({ id: assetId }) }); assert.equal(read.status, 200);
    currentSession = { user: { id: userB.id, tenantId: b.id, role: 'owner' } };
    assert.equal((await mediaRead.GET(request(uploaded.url, undefined, '', 'GET'), { params: Promise.resolve({ id: assetId }) })).status, 404);
    await checkStatus(await settings.PATCH(request('/api/settings/screensaver', { minutes: 5, imageUrl: uploaded.url })), 403);
    await assert.rejects(() => db.$transaction(tx => saveServiceOrder(tx, b.id, { photoUrls: [uploaded.url], parts: [] })), /não pertence/);
    currentSession = { user: { id: userA.id, tenantId: a.id, role: 'staff' } };
    await checkStatus(await mediaRoute.POST(request('/api/media', multipart('logo'))), 403);
    await checkStatus(await settings.PATCH(request('/api/settings/screensaver', { minutes: 0, imageUrl: '' })), 403);
    currentSession = { user: { id: userA.id, tenantId: a.id, role: 'owner' } };
    await checkStatus(await settings.PATCH(request('/api/settings/screensaver', { minutes: 3, imageUrl: uploaded.url })), 400);
    await checkStatus(await personalization.PATCH(request('/api/settings/personalization', { avatarUrl: uploaded.url })), 403);
    await checkStatus(await settings.PATCH(request('/api/settings/screensaver', { minutes: 0, imageUrl: '' })), 200);
    const lockFlow = security.opaqueToken();
    const currentA = await db.user.findUnique({ where: { id: userA.id } });
    const lockedChallenge = await security.issueChallenge(currentA, 'reset', lockFlow);
    const lockedCode = mails.at(-1).code;
    for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(() => security.verifyChallenge(lockedChallenge, '000000', lockFlow));
    await assert.rejects(() => security.verifyChallenge(lockedChallenge, lockedCode, lockFlow));
    const register = require('../src/app/api/auth/register/route.ts');
    const registerData = { name: 'QA Signup', email: 'new-account@example.invalid', password, confirmPassword: password, tenantName: 'QA Signup', tenantSlug: `qa-signup-${randomUUID().slice(0, 8)}`, niche: 'OTHER' };
    const registration = await register.POST(request('/api/auth/register', registerData));
    const registered = await checkStatus(registration, 201);
    assert.equal(registered.challengeId, undefined);
    const signup = await db.user.findFirst({ where: { email: registerData.email } });
    assert.ok(signup.email_verified);
    const signupLogin = await call('start', { email: registerData.email, password });
    const signupProof = await checkStatus(signupLogin, 200);
    assert.equal((await security.consumeLoginTicket(signupProof.ticket, cookies(signupLogin, security.FLOW_COOKIE))).id, signup.id);
    // The obsolete bypass flag must never allow a fixed recovery code.
    process.env.DISABLE_2FA = 'true';
    const beforeMails = mails.length;
    const safeRecovery = await security.issueChallenge(signup, 'reset', 'c'.repeat(64));
    assert.equal(mails.length, beforeMails + 1);
    await assert.rejects(() => security.verifyChallenge(safeRecovery, '000000', 'c'.repeat(64)));
    delete process.env.DISABLE_2FA;
    const crossOrigin = new Request('https://montante.test/api/auth/security/forgot', { method: 'POST', headers: { origin: 'https://attacker.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    await checkStatus(await loginRoute.POST(crossOrigin, { params: Promise.resolve({ action: 'forgot' }) }), 403);
    const management = require('../src/app/api/admin/stores/[id]/route.ts');
    const manage = (method, tenantId, data) => management[method](request('/api/admin/stores/' + tenantId, data, '', method), { params: Promise.resolve({ id: tenantId }) });
    currentSession = null;
    await checkStatus(await manage('PATCH', b.id, { plan: 'free' }), 401);
    currentSession = { user: { id: userA.id, tenantId: a.id, isPlatformAdmin: false } };
    await checkStatus(await manage('PATCH', b.id, { plan: 'free' }), 403);
    currentSession.user.isPlatformAdmin = true;
    await checkStatus(await manage('PATCH', b.id, { plan: 'free' }), 403);
    await db.user.update({ where: { id: userA.id }, data: { is_platform_admin: true } });
    await checkStatus(await manage('PATCH', b.id, { plan: 'free', tenant_id: a.id }), 400);
    await checkStatus(await manage('PATCH', b.id, { plan: 'free' }), 200);
    assert.equal((await db.tenant.findUnique({ where: { id: b.id } })).billing_plan_override, 'free');
    assert.equal((await db.tenant.findUnique({ where: { id: a.id } })).billing_plan_override, null);
    const { processTenantBilling, getBillingSummary } = require('../src/lib/billing-service.ts');
    assert.equal(await processTenantBilling(b.id, new Date('2030-01-01')), 0);
    assert.equal((await getBillingSummary(b.id)).status, 'FREE');
    assert.equal(await db.billingRecord.count({ where: { tenant_id: b.id } }), 0);
    await checkStatus(await manage('PATCH', b.id, { plan: 'advanced' }), 200);
    assert.equal((await getBillingSummary(b.id)).projection.amount, '79.00');
    await checkStatus(await manage('PATCH', a.id, { active: false }), 409);
    await checkStatus(await manage('DELETE', a.id, { confirmation: a.slug }), 409);
    await checkStatus(await manage('DELETE', b.id, { confirmation: 'wrong' }), 400);
    // Keep real relationships in the fixture to catch deletion order/FK regressions.
    const cash = await db.cashRegisterSession.create({ data: { tenant_id: b.id, user_id: userB.id, initial_amount: '0' } });
    const customer = await db.customer.create({ data: { tenant_id: b.id, name: 'QA deletion' } });
    const sale = await db.sale.create({ data: { tenant_id: b.id, sale_number: 999, total_amount: '10', cash_register_session_id: cash.id, customer_id: customer.id } });
    const credit = await db.creditSale.create({ data: { tenant_id: b.id, sale_id: sale.id, customer_id: customer.id, amount: '10' } });
    await db.creditPayment.create({ data: { tenant_id: b.id, credit_sale_id: credit.id, user_id: userB.id, session_id: cash.id, amount: '2', method: 'CASH', idempotency_key: 'qa-delete-credit' } });
    const pendingAttempt = await db.paymentAttempt.create({ data: { tenant_id: b.id, sale_id: sale.id, provider: 'mercadopago', method: 'PIX', channel: 'ONLINE', status: 'PENDING', amount: '10', idempotency_key: 'qa-delete-pending' } });
    await db.sale.update({ where: { id: sale.id }, data: { status: 'cancelled' } });
    // Cancelling a sale does not cancel a payable external order.
    await checkStatus(await manage('DELETE', b.id, { confirmation: b.slug }), 409);
    await db.paymentAttempt.update({ where: { id: pendingAttempt.id }, data: { status: 'CANCELLED' } });
    // Abandoned manual Pix on a cancelled sale must not masquerade as external debt.
    await db.paymentAttempt.create({ data: { tenant_id: b.id, sale_id: sale.id, provider: 'pix_manual', method: 'PIX', channel: 'IN_PERSON', status: 'PENDING', amount: '10', idempotency_key: 'qa-abandoned-manual' } });
    await checkStatus(await manage('DELETE', b.id, { confirmation: b.slug }), 200);
    assert.equal(await db.tenant.count({ where: { id: b.id } }), 0);
    assert.equal(await db.user.count({ where: { id: userB.id } }), 0);
    assert.equal(await db.tenant.count({ where: { id: a.id } }), 1);
    assert.equal(await db.platformAudit.count({ where: { tenant_id: b.id, action: 'store.delete' } }), 1);
    console.log(`PASS: ${assertions} HTTP checks plus direct login/recovery/tickets, duplicate emails, exact tenant isolation, private images, image decoding and screensaver persistence. Emails/storage mocked; production data untouched.`);
  } finally {
    await db.$disconnect();
    assert.match(schema, /^qa_security_[a-f0-9]{12}$/);
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    console.log('Disposable test schema removed.');
  }
})().catch(error => { console.error(error.stack?.replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted connection]') ?? error.name); process.exitCode = 1; }).finally(async () => { global.fetch = originalFetch; await admin.$disconnect(); });
