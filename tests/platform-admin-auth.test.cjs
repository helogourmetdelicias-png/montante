const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const test = require('node:test');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
let configuration, account, currentSession;
const load = Module._load;
Module._load = function(name, ...args) {
 if (name === 'next/headers') return {cookies:async()=>({get:()=>({value:'browser-flow'})})};
 if (name === 'next-auth') return options => { configuration=options; return {auth:async()=>currentSession,handlers:{}}; };
 if (name === 'next-auth/providers/credentials') return options => options;
 if (name === '@auth/prisma-adapter') return { PrismaAdapter:()=>({}) };
 return load.call(this,name,...args);
};
require.cache[require.resolve('../src/lib/prisma.ts')] = {exports:{prisma:{tenant:{findUnique:async()=>({id:'tenant-qa',slug:'qa-auth',is_active:true})},user:{findFirst:async()=>account}}}};
require.cache[require.resolve('../src/lib/operators.ts')] = {exports:{pinSchema:z.string().regex(/^\d{6}$/),verifyOperatorPin:async()=>account}};
require.cache[require.resolve('../src/lib/security/auth-flow.ts')] = {exports:{FLOW_COOKIE:'montante-auth-flow',consumeLoginTicket:async(ticket,flow)=>ticket==='verified-proof'&&flow==='browser-flow'?{...account,tenant:{slug:'qa-auth'}}:null}};
require('../src/auth.ts');

test('platform sessions require verified browser-bound sign-in, never inherit email/owner/PIN grants, and lose revoked privileges',async()=>{
 account={id:'user-qa',tenant_id:'tenant-qa',name:'QA',email:'qa@example.invalid',role:'owner',is_platform_admin:true,password_hash:await bcrypt.hash('QaPassword123!',4)};
 currentSession={user:{tenantId:'tenant-qa',id:'user-qa',tenantSlug:'qa-auth'}};
 const passwordProvider=configuration.providers[1]; const pinProvider=configuration.providers[0];
 assert.equal(await passwordProvider.authorize({email:account.email,password:'QaPassword123!',tenantSlug:'qa-auth'}),null,'legacy password requests cannot bypass the email/device challenge');
 const credentials={loginTicket:'verified-proof'};
 const user=await passwordProvider.authorize(credentials);assert.equal(user.isPlatformAdmin,true);
 let token=await configuration.callbacks.jwt({token:{},user});assert.equal(token.isPlatformAdmin,true);
 const pinUser=await pinProvider.authorize({pin:'123456',userId:'user-qa'});assert.ok(pinUser);assert.equal(pinUser.isPlatformAdmin,undefined);
 token=await configuration.callbacks.jwt({token,user:pinUser});assert.equal(token.isPlatformAdmin,false,'PIN switching clears existing global access');
 token=await configuration.callbacks.jwt({token,user:undefined});assert.equal(token.isPlatformAdmin,false,'database grant alone cannot elevate a PIN or older session');
 assert.equal((await passwordProvider.authorize({loginTicket:'invalid-proof'})),null);
 account.is_platform_admin=false;
 const duplicateEmailUser=await passwordProvider.authorize(credentials);assert.equal(duplicateEmailUser.isPlatformAdmin,false,'same email and owner role do not imply platform access');
 assert.equal((await configuration.callbacks.jwt({token:{id:account.id,tenantId:account.tenant_id,isPlatformAdmin:true}})).isPlatformAdmin,false,'revoked grant is removed');
 const session=await configuration.callbacks.session({session:{user:{}},token:{id:account.id,tenantId:account.tenant_id,isPlatformAdmin:false}});assert.equal(session.user.isPlatformAdmin,false);
 account.auth_version=1;assert.equal(await configuration.callbacks.jwt({token:{id:account.id,tenantId:account.tenant_id,authVersion:0}}),null,'password reset revokes older sessions');
 account=null;assert.equal(await configuration.callbacks.jwt({token:{id:'removed',tenantId:'tenant-qa',isPlatformAdmin:true}}),null);
});
