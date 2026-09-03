import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--disable-background-networking','--disable-dev-shm-usage']});
const p = await b.newPage({ viewport:{width:412,height:892}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200));});
p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://127.0.0.1:4180/', { waitUntil:'networkidle' });
// اضبط نقطة النهاية على الخادم الوهمي
await p.evaluate(()=>{ localStorage.setItem('mh.settings.v1', JSON.stringify({
  preset:'custom', baseUrl:'http://127.0.0.1:9911/v1', apiKey:'', model:'mock-small',
  systemPrompt:'أنت مساعد.', temperature:0.8, topP:0.95, maxTokens:512, stream:true, keepContext:20 })); });
await p.reload({ waitUntil:'networkidle' });
await p.fill('#input', 'مرحبا، جرّب البثّ');
await p.click('#send');
await p.waitForFunction(()=>document.querySelectorAll('.msg.bot').length>0 &&
  document.querySelector('.msg.bot .body')?.textContent.includes('يعمل البثّ'), null, {timeout:20000});
await new Promise(r=>setTimeout(r,600));
await p.screenshot({ path:'shots/chat.png' });
const txt = await p.evaluate(()=>document.querySelector('.msg.bot .body')?.textContent||'');
const hasCode = await p.evaluate(()=>!!document.querySelector('.msg.bot pre code'));
const persisted = await p.evaluate(()=>JSON.parse(localStorage.getItem('mh.convos.v1'))[0].messages.length);
// اختبار الخطأ: نقطة نهاية خاطئة
await p.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('mh.settings.v1')); s.baseUrl='http://127.0.0.1:9/v1';
  localStorage.setItem('mh.settings.v1', JSON.stringify(s)); });
await p.reload({ waitUntil:'networkidle' });
await p.fill('#input','اختبار خطأ');
await p.click('#send');
await p.waitForSelector('.msg.err', { timeout: 20000 });
await p.screenshot({ path:'shots/error.png' });
const errText = await p.evaluate(()=>document.querySelector('.msg.err')?.textContent.slice(0,120));
console.log(JSON.stringify({ streamed: txt.length, hasCodeBlock: hasCode, savedMessages: persisted,
  errorShown: errText, consoleErrors: errs }, null, 1));
await b.close();
