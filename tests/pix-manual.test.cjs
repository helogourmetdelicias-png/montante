const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const { Prisma } = require('@prisma/client');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args); };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { normalizePixKey, resolveManualPixConfig, createStaticPixPayload, createManualPixPayment, pixCrc16 } = require('../src/lib/payment/pix-manual.ts');
const { PixManualGateway } = require('../src/lib/payment/gateway-adapter.ts');
const config = { pixKey: '123e4567-e12b-12d1-a456-426655440000', pixKeyType: 'aleatoria', merchantName: 'Fulano de Tal', merchantCity: 'BRASILIA' };
function fields(text) {
  const result = {}; let offset=0;
  while(offset<text.length) { const id=text.slice(offset,offset+2), size=Number(text.slice(offset+2,offset+4)); assert.ok(Number.isInteger(size) && size>0); result[id]=text.slice(offset+4,offset+4+size); offset+=4+size; }
  assert.equal(offset,text.length); return result;
}

test('BR Code matches the published Banco Central reference including CRC 1D3D', () => {
  assert.equal(createStaticPixPayload(config), '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D');
});

test('phone keys include international prefix; CPF, CNPJ, email and random keys retain their identity', () => {
  assert.deepEqual(normalizePixKey('(11) 99999-9999', 'telefone'), { key:'+5511999999999', type:'telefone' });
  assert.equal(normalizePixKey('5511999999999','telefone').key,'+5511999999999');
  assert.equal(normalizePixKey('+55 (11) 99999-9999').key,'+5511999999999');
  assert.equal(normalizePixKey('123.456.789-00','cpf').key,'12345678900');
  assert.equal(normalizePixKey('00.038.166/0001-05','cnpj').key,'00038166000105');
  assert.equal(normalizePixKey('12.ABC.345/01DE-35','cnpj').key,'12ABC34501DE35');
  assert.equal(normalizePixKey('LOJA@example.com','email').key,'loja@example.com');
  assert.equal(normalizePixKey(config.pixKey.toUpperCase(),'aleatoria').key,config.pixKey);
  assert.throws(()=>normalizePixKey('11999999999'),/tipo da chave/,'untyped CPF/phone ambiguity cannot redirect payments silently');
  for(const [value,type] of [['abc','telefone'],['123','cpf'],['000201invalid','aleatoria'],['x'.repeat(75)+'@a.com','email']]) assert.throws(()=>normalizePixKey(value,type));
});

test('payload contains exact amount, bounded receiver fields, currency and reference', () => {
  const receiver = resolveManualPixConfig({pix_key:'(11) 99999-9999',pix_key_type:'telefone',merchant_name:'Cosméticos São João',merchant_city:'São Paulo'});
  const payload=createStaticPixPayload(receiver,12345,'VENDA123'); const decoded=fields(payload);
  assert.equal(fields(decoded['26'])['01'],'+5511999999999');
  assert.equal(decoded['54'],'123.45'); assert.equal(decoded['53'],'986'); assert.equal(decoded['58'],'BR');
  assert.equal(decoded['59'],'Cosmeticos Sao Joao'); assert.equal(decoded['60'],'Sao Paulo');
  assert.equal(fields(decoded['62'])['05'],'VENDA123');
  assert.equal(decoded['63'],pixCrc16(payload.slice(0,-4)));
  assert.equal(fields(createStaticPixPayload(config,1))['54'],'0.01');
  for(const amount of [0,-1,1.5,NaN,Infinity,10000000000]) assert.throws(()=>createStaticPixPayload(config,amount));
  assert.throws(()=>createStaticPixPayload(config,100,'has-hyphen'));
  assert.throws(()=>resolveManualPixConfig({pix_key:config.pixKey}),/nome do recebedor/);
  assert.throws(()=>resolveManualPixConfig({pix_key:config.pixKey},{name:'Loja',address_city:null}),/cidade/);
});

test('generated PNG decodes to the same payable Pix payload; gateway never approves on generation', async () => {
  const savedFetch=global.fetch; global.fetch=()=>{assert.fail('manual Pix must not contact an image service or a bank');};
  try {
    const gateway=new PixManualGateway('(11) 99999-9999','telefone','Loja de Teste','São Paulo');
    const request={amount:2590,method:'pix',channel:'online',description:'Venda de teste',idempotencyKey:'2434f236-8989-4d79-8bac-3b08052d0ed2'};
    const payment=await gateway.charge(request);
    assert.equal(payment.status,'pending'); assert.equal(await gateway.checkStatus('anything'),'pending');
    assert.equal(payment.externalId,undefined);
    const png=PNG.sync.read(Buffer.from(payment.pixQrCode,'base64'));
    const scanned=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
    assert.ok(scanned); assert.equal(scanned.data,payment.pixCopyPaste);
    assert.equal(fields(scanned.data)['54'],'25.90');
    assert.match(fields(fields(scanned.data)['62'])['05'],/^[a-f\d]{25}$/);
    const repeat=await gateway.charge(request); assert.equal(repeat.pixCopyPaste,payment.pixCopyPaste);
    await assert.rejects(gateway.charge({...request,method:'credit_card'}),/somente/);
    await assert.rejects(gateway.charge({...request,amount:0}),/valor/);
  } finally { global.fetch=savedFetch; }
});

let session = {user:{tenantId:'store-a',id:'operator-a',role:'owner'}};
let savedCredentials={pix_key:'(11) 99999-9999',pix_key_type:'telefone',merchant_name:'Loja A',merchant_city:'São Paulo'};
let attempt, creates=0, completed=false, settingsWrites=[];
require.cache[require.resolve('../src/auth.ts')]={exports:{auth:async()=>session}};
require.cache[require.resolve('../src/lib/encryption.ts')]={exports:{decryptCredentials:()=>({...savedCredentials}),encryptCredentials:value=>JSON.stringify(value)}};
const configRow={id:'config-a',provider:'pix_manual',tenant_id:'store-a',environment:'production',encrypted_credentials:'encrypted'};
const prisma={
  tenant:{findUnique:async args=>{assert.equal(args.where.id,'store-a');return {name:'Loja A',address_city:'São Paulo'};}},
  sale:{findFirst:async args=>{assert.equal(args.where.tenant_id,'store-a');return args.where.id==='sale-other'?null:{id:'sale-a',status:'pending',total_amount:new Prisma.Decimal('25.90'),expires_at:new Date(Date.now()+60000),cash_register_session_id:'drawer-a'};},updateMany:async()=>{completed=true;return {count:1};}},
  cashRegisterSession:{findFirst:async()=>({id:'drawer-a'})},
  paymentGatewayConfig:{findFirst:async args=>{assert.equal(args.where.tenant_id,'store-a');return configRow;},findUnique:async()=>configRow,upsert:async args=>{settingsWrites.push(args);return {...configRow,...args.update};},updateMany:async()=>({count:0})},
  paymentAttempt:{findFirst:async()=>null,aggregate:async()=>({_sum:{amount:null}}),create:async({data})=>{creates++; attempt={id:'attempt-a',...data,created_at:new Date()};return attempt;},update:async({data})=>{attempt={...attempt,...data};return attempt;}},
};
prisma.$transaction=async action=>action(prisma);
require.cache[require.resolve('../src/lib/prisma.ts')]={exports:{prisma}};
const {POST:createPayment}=require('../src/app/api/sales/[id]/payments/route.ts');
const {POST:saveSettings}=require('../src/app/api/settings/payments/route.ts');
const paymentRequest=()=>new Request('https://test.invalid/api/sales/sale-a/payments',{method:'POST',body:JSON.stringify({idempotencyKey:'2434f236-8989-4d79-8bac-3b08052d0ed2',provider:'pix_manual',method:'pix',channel:'online'})});

test('payment API returns QR/amount and keeps sale pending; rejects missing receiver data before creating attempt',async()=>{
  const response=await createPayment(paymentRequest(),{params:{id:'sale-a'}}); assert.equal(response.status,201);
  const data=await response.json(); assert.equal(data.attempt.status,'pending'); assert.equal(data.attempt.amount,'25.90');
  assert.ok(data.payment.pixQrCode);assert.equal(fields(data.payment.pixCopyPaste)['54'],'25.90'); assert.equal(completed,false);
  assert.equal((await createPayment(paymentRequest(),{params:{id:'sale-other'}})).status,404);
  const previous=creates; savedCredentials={...savedCredentials,pix_key_type:'wrong'};
  assert.equal((await createPayment(paymentRequest(),{params:{id:'sale-a'}})).status,409); assert.equal(creates,previous);
  savedCredentials.pix_key_type='telefone';
  const previousSession=session;session=null;
  assert.equal((await createPayment(paymentRequest(),{params:{id:'sale-a'}})).status,401);session=previousSession;
});

test('settings preserve existing key on partial edits, normalize phone and reject invalid key before persistence',async()=>{
  const req=credentials=>new Request('https://test.invalid/api/settings/payments',{method:'POST',body:JSON.stringify({provider:'pix_manual',isActive:true,credentials})});
  let response=await saveSettings(req({merchant_city:'Campinas'}));assert.equal(response.status,200);
  const stored=JSON.parse(settingsWrites.at(-1).update.encrypted_credentials); assert.equal(stored.pix_key,'+5511999999999');assert.equal(stored.merchant_city,'Campinas');assert.equal(stored.merchant_name,'Loja A');
  assert.equal(JSON.stringify(await response.json()).includes('5511999999999'),false);
  const previous=settingsWrites.length; response=await saveSettings(req({pix_key:'123'})); assert.equal(response.status,400);assert.equal(settingsWrites.length,previous);
  session.user.role='staff';assert.equal((await saveSettings(req({merchant_city:'Santos'}))).status,403);session.user.role='owner';
});
