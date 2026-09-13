const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9224');
 try {
 const context=browser.contexts()[0];
 let page=context.pages().find(p=>p.url().startsWith('http://localhost:8765'));
 if(!page) page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8765',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>state.products.length>0);
 const current=await page.evaluate(()=>loadOfflineProducts());
 console.log('OPEN',current.generated_at,current.products[0].name);
 if(process.argv.includes('--verify')) {
   assert.equal(current.products[0].name,'Persistence C');
 } else {
   assert.equal(current.products[0].name,'Persistence A');
   for (const [label,date] of [['B','2026-02-01 00:00:00'],['C','2026-03-01 00:00:00']]) {
     await page.evaluate(async({label,date})=>{
       const data={generated_at:date,products:[{name:`Persistence ${label}`,price:2,category_slug:'lapte',url:`test:${label}`}]};
       applyProducts(await saveOfflineProducts(data),true);
     },{label,date});
     for(let i=0;i<3;i++){
       await page.reload({waitUntil:'networkidle'});
       await page.waitForFunction(()=>state.products.length>0);
       assert.equal(await page.evaluate(()=>state.products[0].name),`Persistence ${label}`);
     }
     console.log('PASS',label,'three restarts, seed A unchanged');
   }
   const results=await page.evaluate(async()=>{
     const a={generated_at:'2026-01-01',products:[{name:'Old A',price:1}]};
     const values=await Promise.all([saveOfflineProducts(a),saveOfflineProducts({...a,generated_at:'2026-02-01'})]);
     let invalid=false;try{await saveOfflineProducts({products:[]})}catch{invalid=true;}
     const equal=await saveOfflineProducts({...a,generated_at:'2026-03-01 00:00:00'});
     return {names:values.map(d=>d.products[0].name),invalid,equal:equal.products[0].name};
   });
   assert.deepEqual(results,{names:['Persistence C','Persistence C'],invalid:true,equal:'Persistence C'});
   console.log('PASS concurrent stale writes, invalid catalog, equal-version replacement rejected');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS no JavaScript errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
