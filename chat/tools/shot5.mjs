import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx = await b.newContext({ viewport:{width:412,height:1000}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
  permissions:['clipboard-read','clipboard-write'] });
const p = await ctx.newPage();
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,150));});
p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://127.0.0.1:4180/', { waitUntil:'networkidle' });
await p.waitForSelector('.setup');
await p.locator('.setup-opt').nth(3).click();
await p.waitForSelector('.st-copy');
await new Promise(r=>setTimeout(r,400));
await p.screenshot({ path:'shots/s7_links.png', fullPage:true });
const rows = await p.evaluate(()=>[...document.querySelectorAll('.st-row:not(.st-head)')].map(r=>[...r.querySelectorAll('span')].map(s=>s.textContent.trim())));
console.log('rows:', JSON.stringify(rows, null, 0));
// اضغط زر نسخ النموذج المميّز بالنجمة (Aion Q3_K_S = الصف الخامس)
await p.locator('.st-copy').nth(4).click();
await new Promise(r=>setTimeout(r,500));
const clip = await p.evaluate(()=>navigator.clipboard.readText().catch(()=>'DENIED'));
console.log('clipboard:', clip);
const label = await p.evaluate(()=>document.querySelectorAll('.st-copy')[4].textContent);
console.log('buttonAfterClick:', label);
console.log('ERRORS:', errs.length? JSON.stringify(errs,null,1):'none');
await b.close();
