import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--disable-background-networking','--disable-dev-shm-usage']});
const errs=[];
const cases = [
  ['main',   async(p)=>{}],
  ['convos', async(p)=>{ await p.click('#btnMenu'); }],
  ['settings', async(p)=>{ await p.click('#btnSettings'); }],
];
for (const [name, act] of cases) {
  const p = await b.newPage({ viewport:{width:412,height:892}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  p.on('console', m=>{ if(m.type()==='error') errs.push(name+': '+m.text().slice(0,200)); });
  p.on('pageerror', e=>errs.push(name+' PE: '+e.message));
  await p.goto('http://127.0.0.1:4180/', { waitUntil:'networkidle' });
  await p.waitForSelector('#messages', { timeout: 15000 });
  await act(p);
  await new Promise(r=>setTimeout(r,700));
  await p.screenshot({ path:`shots/${name}.png` });
  console.log('shot', name);
  await p.close();
}
console.log('ERRORS:', errs.length ? JSON.stringify(errs,null,1) : 'none');
await b.close();
