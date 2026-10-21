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
let session = null;
require.cache[require.resolve('../src/auth.ts')] = {exports:{auth:async()=>session}};
const {prisma}=require('../src/lib/prisma.ts');
const route=require('../src/app/api/admin/overview/route.ts');
const register=require('../src/app/api/auth/register/route.ts');
const {platformAdminAccess}=require('../src/lib/platform-admin.ts');
(async()=>{
 const ids=[];const marker='qa-platform-'+randomUUID().slice(0,16);
 try{
  for(let i=0;i<2;i++)ids.push((await prisma.tenant.create({data:{name:marker+'-'+i,slug:marker+'-'+i,niche:'OTHER'}})).id);
  const first=await prisma.user.create({data:{tenant_id:ids[0],name:'QA General',email:'qa-platform@example.invalid',role:'owner',is_platform_admin:true}});
  const second=await prisma.user.create({data:{tenant_id:ids[1],name:'QA Owner',email:first.email,role:'owner'}});
  const query='https://qa.invalid/api/admin/overview?'+new URLSearchParams({q:marker,startDate:'2026-10-01',endDate:'2026-10-31'});
  assert.equal((await route.GET(new Request(query))).status,401);
  session={user:{id:second.id,tenantId:ids[1],role:'owner',isPlatformAdmin:false}};assert.equal((await route.GET(new Request(query))).status,403);
  session.user.isPlatformAdmin=true;assert.equal((await route.GET(new Request(query))).status,403,'forged claim cannot replace DB grant');
  session={user:{id:first.id,tenantId:ids[0],role:'owner',isPlatformAdmin:false}};assert.equal((await route.GET(new Request(query))).status,403,'PIN/older session does not acquire grant');
  session.user.isPlatformAdmin=true;
  for(const [index,tenantId] of ids.entries()) {
   await prisma.sale.create({data:{tenant_id:tenantId,sale_number:1,status:'completed',is_quick_sale:true,total_amount:(index+1)*100,sold_at:new Date('2026-10-21T13:00:00Z')}});
   await prisma.sale.create({data:{tenant_id:tenantId,sale_number:2,status:'cancelled',is_quick_sale:true,total_amount:999,sold_at:new Date('2026-10-21T13:00:00Z')}});
  }
  await prisma.tenantSubscription.create({data:{tenant_id:ids[0],trial_ends_at:new Date('2027-01-01'),next_billing_at:new Date('2027-01-01'),status:'TRIAL'}});
  await prisma.tenantSubscription.create({data:{tenant_id:ids[1],trial_ends_at:new Date('2026-01-01'),next_billing_at:new Date('2026-10-01'),status:'OVERDUE'}});
  const customer=await prisma.customer.create({data:{tenant_id:ids[0],name:'QA debtor'}});
  const creditSale=await prisma.sale.findFirstOrThrow({where:{tenant_id:ids[0],sale_number:1}});
  await prisma.sale.update({where:{id:creditSale.id},data:{customer_id:customer.id,payment_method:'fiado'}});
  const credit=await prisma.creditSale.create({data:{tenant_id:ids[0],sale_id:creditSale.id,customer_id:customer.id,amount:100}});
  const drawer=await prisma.cashRegisterSession.create({data:{tenant_id:ids[0],user_id:first.id,initial_amount:0}});
  await prisma.creditPayment.create({data:{tenant_id:ids[0],credit_sale_id:credit.id,user_id:first.id,session_id:drawer.id,amount:40,method:'CASH',idempotency_key:randomUUID()}});
  await prisma.billingRecord.create({data:{tenant_id:ids[0],reference_month:'2026-10',total_sales:1,plan_tier:'Padrão',amount_due:20,status:'paid',paid_at:new Date('2026-10-21T13:00:00Z')}});
  await prisma.billingRecord.create({data:{tenant_id:ids[1],reference_month:'2026-10',total_sales:1,plan_tier:'Padrão',amount_due:'49.90',status:'pending'}});
  const response=await route.GET(new Request(query));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  const data=await response.json();assert.equal(data.filtered,2);assert.equal(data.stores.length,2);
  assert.equal(data.stores.find(row=>row.id===ids[0]).revenue,'100.00');assert.equal(data.stores.find(row=>row.id===ids[1]).revenue,'200.00');assert.equal(data.stores.find(row=>row.id===ids[1]).saleCount,1);
  assert.equal(data.stores.find(row=>row.id===ids[1]).subscription.status,'OVERDUE');
  assert.equal(data.stores.find(row=>row.id===ids[0]).creditBalance,'60.00');
  assert.equal(data.stores.find(row=>row.id===ids[0]).latestInvoice.status,'paid');
  assert.ok(Number(data.summary.saasReceived)>=20);assert.ok(Number(data.summary.saasPending)>=49.9);
  const json=JSON.stringify(data);for(const field of ['password_hash','pin_hash','encrypted_credentials','access_token']) assert.ok(!json.includes(field));
  assert.equal((await route.GET(new Request(query+'&page=0'))).status,400);
  assert.equal((await route.GET(new Request('https://qa.invalid/api/admin/overview?startDate=bad'))).status,400);
  const empty=await (await route.GET(new Request(query+'&page=2'))).json();assert.equal(empty.stores.length,0);
  await prisma.user.update({where:{id:first.id},data:{is_platform_admin:false}});assert.equal((await route.GET(new Request(query))).status,403,'revocation takes effect despite old session claim');
  await prisma.user.update({where:{id:first.id},data:{is_platform_admin:true,is_active:false}});assert.equal((await platformAdminAccess()).ok,false);
  await prisma.user.update({where:{id:first.id},data:{is_active:true}});await prisma.tenant.update({where:{id:ids[0]},data:{is_active:false}});assert.equal((await platformAdminAccess()).ok,false);
  const slug=marker+'-registered';const registration=await register.POST(new Request('https://qa.invalid',{method:'POST',body:JSON.stringify({name:'QA signup',email:first.email,password:'QaPassword123!',confirmPassword:'QaPassword123!',tenantName:'QA signup',tenantSlug:slug,niche:'OTHER',is_platform_admin:true})}));
  assert.equal(registration.status,201);const registered=await prisma.tenant.findUniqueOrThrow({where:{slug}});ids.push(registered.id);assert.equal((await prisma.user.findFirstOrThrow({where:{tenant_id:registered.id}})).is_platform_admin,false,'public registration never grants platform access');
  console.log('PASS platform access: password session and DB grant required, duplicate email denied, stale/forged claims denied, revocation/deactivation, cross-store metrics, pagination, dates, no secrets, public registration cannot elevate');
 }finally{
  await prisma.creditPayment.deleteMany({where:{tenant_id:{in:ids}}});await prisma.creditSale.deleteMany({where:{tenant_id:{in:ids}}});
  await prisma.sale.deleteMany({where:{tenant_id:{in:ids}}});await prisma.cashRegisterSession.deleteMany({where:{tenant_id:{in:ids}}});await prisma.tenant.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
