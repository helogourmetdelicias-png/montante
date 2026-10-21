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
require.cache[require.resolve('../src/auth.ts')] = { exports: { auth: async () => session } };
const { prisma } = require('../src/lib/prisma.ts');
const { Prisma } = require('@prisma/client');
const sales = require('../src/app/api/sales/route.ts');
const credits = require('../src/app/api/credits/route.ts');
const creditRoute = require('../src/app/api/sales/[id]/credit/route.ts');
const receiveRoute = require('../src/app/api/credits/[id]/payments/route.ts');
const commissions = require('../src/app/api/reports/commissions/route.ts');
const reports = require('../src/app/api/reports/sales/route.ts');
const { completeCreditSale, receiveCreditPayment } = require('../src/lib/credit.ts');
const { getCashRegisterSummary, expectedDrawerAmount } = require('../src/lib/cash-register/summary.ts');
const request = (data, method='POST') => new Request('https://qa.invalid', {method, body: JSON.stringify(data)});
(async()=> {
 const ids=[];
 try {
  for(let i=0;i<2;i++) ids.push((await prisma.tenant.create({data:{name:'QA Fiados',slug:'qa-credit-'+randomUUID(), niche:'COSMETICS'}})).id);
  const users=[]; const drawers=[];
  for(const tenantId of [ids[0],ids[0],ids[1]]) {
   const user=await prisma.user.create({data:{tenant_id:tenantId,name:'QA operator',email:randomUUID()+'@example.invalid',role:'owner'}});users.push(user);
   drawers.push(await prisma.cashRegisterSession.create({data:{tenant_id:tenantId,user_id:user.id,initial_amount:100}}));
  }
  const customer=await prisma.customer.create({data:{tenant_id:ids[0],name:'QA credit customer'}});
  const product=await prisma.product.create({data:{tenant_id:ids[0],name:'Perfume QA',brand:'Natura',category:'Perfumes',price:100,stock_quantity:10,unit_of_measure:'un'}});
  assert.equal((await creditRoute.POST(request({customerId:customer.id}),{params:{id:'missing'}})).status,401);
  session={user:{tenantId:ids[0],id:users[0].id,role:'staff'}};
  assert.equal((await commissions.PATCH(request({brand:'Natura',rate:10},'PATCH'))).status,403);
  session.user.role='owner';
  assert.equal((await commissions.PATCH(request({brand:'Natura',rate:101},'PATCH'))).status,400);
  assert.equal((await commissions.PATCH(request({brand:' Natura ',rate:10},'PATCH'))).status,200);
  async function newSale(discount=0) {
   const response=await sales.POST(request({idempotencyKey:randomUUID(),customerId:customer.id,items:[{productId:product.id,quantity:1}],discountAmount:discount}));
   assert.equal(response.status,201,await response.clone().text());return (await response.json()).sale;
  }
  const sale=await newSale(10);
  const snapshot=await prisma.saleItem.findFirstOrThrow({where:{sale_id:sale.id}});
  assert.equal(snapshot.brand_snapshot,'Natura');assert.equal(snapshot.commission_rate.toString(),'10');
  await assert.rejects(completeCreditSale(ids[1],users[2].id,sale.id,customer.id));
  await assert.rejects(completeCreditSale(ids[0],users[1].id,sale.id,customer.id));
  const uncertain=await prisma.paymentAttempt.create({data:{tenant_id:ids[0],sale_id:sale.id,provider:'pagarme',method:'PIX',channel:'ONLINE',status:'FAILED',amount:90,idempotency_key:randomUUID()}});
  await assert.rejects(completeCreditSale(ids[0],users[0].id,sale.id,customer.id));
  await prisma.paymentAttempt.delete({where:{id:uncertain.id}});
  const credit=await completeCreditSale(ids[0],users[0].id,sale.id,customer.id);
  assert.equal((await completeCreditSale(ids[0],users[0].id,sale.id,customer.id)).id,credit.id);
  assert.equal((await prisma.sale.findUniqueOrThrow({where:{id:sale.id}})).status,'completed');
  assert.equal((await prisma.product.findUniqueOrThrow({where:{id:product.id}})).stock_quantity.toString(),'9');
  assert.equal((await prisma.paymentAttempt.count({where:{sale_id:sale.id}})),0);
  const before=await getCashRegisterSummary(prisma,ids[0],drawers[0].id);assert.equal(expectedDrawerAmount(new Prisma.Decimal(100),before).toString(),'100');
  const key=randomUUID();
  const first=await receiveCreditPayment(ids[0],users[1].id,credit.id,{amount:20,method:'CASH',idempotencyKey:key});
  assert.equal((await receiveCreditPayment(ids[0],users[1].id,credit.id,{amount:20,method:'CASH',idempotencyKey:key})).id,first.id);
  await assert.rejects(receiveCreditPayment(ids[0],users[1].id,credit.id,{amount:21,method:'CASH',idempotencyKey:key}));
  await assert.rejects(receiveCreditPayment(ids[1],users[2].id,credit.id,{amount:1,method:'CASH',idempotencyKey:randomUUID()}));
  await receiveCreditPayment(ids[0],users[1].id,credit.id,{amount:30,method:'PIX',idempotencyKey:randomUUID()});
  await assert.rejects(receiveCreditPayment(ids[0],users[1].id,credit.id,{amount:41,method:'CASH',idempotencyKey:randomUUID()}));
  await receiveCreditPayment(ids[0],users[1].id,credit.id,{amount:40,method:'CASH',idempotencyKey:randomUUID()});
  const drawer=await getCashRegisterSummary(prisma,ids[0],drawers[1].id);assert.equal(expectedDrawerAmount(new Prisma.Decimal(100),drawer).toString(),'160');
  let list=await (await credits.GET(new Request('https://qa.invalid'))).json();assert.equal(list.credits[0].balance,'0.00');assert.equal(list.credits[0].payments.length,3);
  const invalid=await receiveRoute.POST(request({amount:1.234,method:'CASH',idempotencyKey:randomUUID()}),{params:{id:credit.id}});assert.equal(invalid.status,400);
  const sale2=await newSale();const credit2=await completeCreditSale(ids[0],users[0].id,sale2.id,customer.id);
  const concurrent=await Promise.allSettled([60,60].map(amount=>receiveCreditPayment(ids[0],users[1].id,credit2.id,{amount,method:'PIX',idempotencyKey:randomUUID()})));
  assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);
  await prisma.product.update({where:{id:product.id},data:{brand:'Changed',category:'Changed'}});
  await commissions.PATCH(request({brand:'Natura',rate:25},'PATCH'));
  await prisma.sale.update({where:{id:sale.id},data:{sold_at:new Date('2026-10-20T02:30:00Z')}});
  await prisma.sale.update({where:{id:sale2.id},data:{sold_at:new Date('2026-10-21T13:00:00Z')}});
  const report=await reports.GET(new Request('https://qa.invalid?startDate=2026-10-01&endDate=2026-10-31'));assert.equal(report.status,200);
  const data=await report.json(); assert.equal(data.summary.revenue,'190.00');assert.equal(data.details.byBrand[0].name,'NATURA');assert.equal(data.details.byBrand[0].revenue,'190.00');assert.equal(data.details.byBrand[0].commission,'19.00');assert.equal(data.details.byCategory[0].name,'Perfumes');
  assert.equal(data.details.bestDay.date,'2026-10-21');assert.ok(data.details.days.some(day=>day.date==='2026-10-19'));
  assert.equal(data.details.creditSales,'190.00');assert.equal(data.details.creditReceipts.find(row=>row.method==='cash').amount,'60.00');
  const pennyA=await prisma.product.create({data:{tenant_id:ids[0],name:'Centavo A',brand:'A',category:'A',price:'0.01',stock_quantity:5,unit_of_measure:'un'}});
  const pennyB=await prisma.product.create({data:{tenant_id:ids[0],name:'Centavo B',brand:'B',category:'B',price:'0.01',stock_quantity:5,unit_of_measure:'un'}});
  const pennyResponse=await sales.POST(request({idempotencyKey:randomUUID(),customerId:customer.id,items:[{productId:pennyA.id,quantity:1},{productId:pennyB.id,quantity:2}],discountAmount:0.01}));
  assert.equal(pennyResponse.status,201);const pennySale=(await pennyResponse.json()).sale;await completeCreditSale(ids[0],users[0].id,pennySale.id,customer.id);
  const pennyReport=await (await reports.GET(new Request('https://qa.invalid?startDate=2026-10-01&endDate=2026-10-31'))).json();
  assert.equal(pennyReport.summary.revenue,'190.02');assert.equal(pennyReport.details.byBrand.reduce((sum,row)=>sum+Math.round(Number(row.revenue)*100),0),19002);
  assert.equal(pennyReport.details.byCategory.reduce((sum,row)=>sum+Math.round(Number(row.revenue)*100),0),19002);
  session.user.role='staff';assert.equal((await reports.GET(new Request('https://qa.invalid'))).status,403);
  session={user:{tenantId:ids[1],id:users[2].id,role:'owner'}};
  assert.equal((await (await credits.GET(new Request('https://qa.invalid'))).json()).total,0);
  assert.equal((await (await reports.GET(new Request('https://qa.invalid?startDate=2026-10-01&endDate=2026-10-31'))).json()).details.byBrand.length,0);
  await prisma.cashRegisterSession.update({where:{id:drawers[1].id},data:{status:'CLOSED'}});
  await assert.rejects(receiveCreditPayment(ids[0],users[1].id,credit2.id,{amount:1,method:'CASH',idempotencyKey:randomUUID()}));
  console.log('PASS credit creation/replay, customer and tenant isolation, partial payments, cash accounting, overpayment, concurrency, closed drawer, brand snapshots, net commissions, reports and Sao Paulo dates');
 } finally {
  await prisma.creditPayment.deleteMany({where:{tenant_id:{in:ids}}});
  await prisma.creditSale.deleteMany({where:{tenant_id:{in:ids}}});
  const rows=await prisma.sale.findMany({where:{tenant_id:{in:ids}},select:{id:true}});
  await prisma.saleItem.deleteMany({where:{sale_id:{in:rows.map(row=>row.id)}}});
  await prisma.sale.deleteMany({where:{tenant_id:{in:ids}}});
  await prisma.cashRegisterSession.deleteMany({where:{tenant_id:{in:ids}}});
  await prisma.tenant.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
