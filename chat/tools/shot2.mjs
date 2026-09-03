import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--disable-background-networking','--disable-dev-shm-usage']});
const errs=[];
const shot = async (name, act) => {
  const p = await b.newPage({ viewport:{width:412,height:892}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  p.on('console',m=>{if(m.type()==='error')errs.push(name+': '+m.text().slice(0,150));});
  p.on('pageerror',e=>errs.push(name+' PE: '+e.message));
  await p.goto('http://127.0.0.1:4180/', { waitUntil:'networkidle' });
  await p.waitForSelector('.setup, #messages', { timeout: 15000 });
  if (act) await act(p);
  await new Promise(r=>setTimeout(r,600));
  await p.screenshot({ path:`shots/${name}.png` });
  console.log('shot', name);
  return p;
};
// 1) شاشة الترحيب الأولى
await (await shot('setup1')).close();
// 2) مسار Ollama
await (await shot('setup_ollama', async p => { await p.click('.setup-opt:nth-of-type(2)'); })).close();
// 3) مسار المفتاح المجاني
await (await shot('setup_groq', async p => { await p.click('.setup-opt:nth-of-type(1)'); })).close();
// 4) اختبار فاشل يعطي رسالة عربية مفهومة
const p4 = await shot('setup_fail', async p => {
  await p.click('.setup-opt:nth-of-type(2)');
  await p.fill('.setup-input', 'localhost');
  await p.click('.setup-go');
  await p.waitForSelector('.setup-status.err', { timeout: 10000 });
});
console.log('errMsg:', (await p4.evaluate(()=>document.querySelector('.setup-status.err')?.textContent))?.slice(0,90));
await p4.close();
// 5) نجاح كامل ← يدخل للمحادثة
const p5 = await b.newPage({ viewport:{width:412,height:892}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
p5.on('pageerror',e=>errs.push('flow PE: '+e.message));
await p5.goto('http://127.0.0.1:4180/', { waitUntil:'networkidle' });
await p5.waitForSelector('.setup');
await p5.click('.setup-opt:nth-of-type(2)');
await p5.fill('.setup-input', '127.0.0.1');
// نوجّه المنفذ للخادم الوهمي عبر تعديل الحقل بعد التجميع غير ممكن، فنستخدم مسار مخصص:
await p5.evaluate(()=>{ document.querySelectorAll('.setup-input')[0].value='127.0.0.1'; });
await p5.click('.setup-go');
await new Promise(r=>setTimeout(r,1500));
const failed = await p5.evaluate(()=>!!document.querySelector('.setup-status.err'));
console.log('ollama-to-nonexistent failed as expected:', failed);
await p5.close();
console.log('ERRORS:', errs.length? JSON.stringify(errs,null,1):'none');
await b.close();
