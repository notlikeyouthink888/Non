import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--disable-dev-shm-usage']});
const errs=[];
const p = await b.newPage({ viewport:{width:412,height:892}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
// المتصفح داخل هذه البيئة بلا إنترنت مباشر — نُقدّم قائمة OpenRouter الحقيقية المحفوظة
import { readFileSync } from 'node:fs';
await p.route('**/openrouter.ai/api/v1/models', (route) =>
  route.fulfill({ status:200, contentType:'application/json', body: readFileSync('tools/or-catalog.json','utf8') }));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://127.0.0.1:4180/', { waitUntil:'networkidle' });
await p.waitForSelector('.setup');
await p.screenshot({ path:'shots/s1_choices.png' });

await p.locator('.setup-opt').nth(2).click();
await p.waitForSelector('.setup-link');
await p.screenshot({ path:'shots/s2_openrouter.png' });

await p.locator('.setup-link').nth(1).click();
await p.waitForSelector('.mp-row', { timeout: 40000 });
await new Promise(r=>setTimeout(r,600));
await p.screenshot({ path:'shots/s3_models.png' });
const featured = await p.evaluate(()=>[...document.querySelectorAll('.mp-id')].slice(0,4).map(e=>e.textContent));
console.log('featured:', JSON.stringify(featured));

await p.click('.mp-chip[data-f="free"]');
await new Promise(r=>setTimeout(r,500));
const freeCount = await p.evaluate(()=>document.querySelectorAll('.mp-row').length);
const allFree = await p.evaluate(()=>[...document.querySelectorAll('.mp-row')].every(r=>r.querySelector('.mp-badge.free')));
await p.screenshot({ path:'shots/s4_free.png' });
console.log('freeShown:', freeCount, 'allMarkedFree:', allFree);

await p.click('.mp-chip[data-f="all"]');
await p.fill('.mp-search','aion');
await new Promise(r=>setTimeout(r,500));
const aionIds = await p.evaluate(()=>[...document.querySelectorAll('.mp-id')].map(e=>e.textContent));
console.log('aionSearch:', JSON.stringify(aionIds));
await p.click('.mp-row');
await new Promise(r=>setTimeout(r,400));
const picked = await p.evaluate(()=>document.querySelectorAll('.setup-link')[1]?.textContent);
console.log('picked:', picked);
console.log('ERRORS:', errs.length? JSON.stringify(errs,null,1):'none');
await b.close();
