import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--disable-dev-shm-usage']});
const p = await b.newPage({ viewport:{width:412,height:892}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,140));});
p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://127.0.0.1:4180/', { waitUntil:'networkidle' });
await p.evaluate(()=>{ localStorage.setItem('mh.setup.done.v1','1');
  localStorage.setItem('mh.settings.v1', JSON.stringify({ preset:'custom', baseUrl:'http://127.0.0.1:9922/v1',
    apiKey:'', model:'local', systemPrompt:'أنت مساعد.', temperature:0.7, topP:0.95,
    maxTokens:384, stream:true, keepContext:6 })); });
await p.reload({ waitUntil:'networkidle' });
await p.fill('#input','اختبار البطء');
await p.click('#send');
// قبل أول وحدة: يجب أن يظهر «النموذج يعالج طلبك»
await p.waitForSelector('.prog', { timeout: 8000 });
await new Promise(r=>setTimeout(r,3500));
const early = await p.evaluate(()=>document.querySelector('.prog')?.textContent);
console.log('أثناء المعالجة:', early);
await p.screenshot({ path:'shots/s8_processing.png' });
// بعد وصول وحدات: يجب أن يعرض العدّاد والمعدّل
await p.waitForFunction(()=>/وحدة/.test(document.querySelector('.prog')?.textContent||''), null, {timeout:20000});
await new Promise(r=>setTimeout(r,5000));
const mid = await p.evaluate(()=>document.querySelector('.prog')?.textContent);
console.log('أثناء التوليد:', mid);
await p.screenshot({ path:'shots/s9_generating.png' });
// انتظر الانتهاء ثم تحقّق من تحذير البطء
await p.waitForSelector('.slowwarn', { timeout: 90000 });
const warn = await p.evaluate(()=>document.querySelector('.slowwarn')?.textContent.slice(0,80));
const progGone = await p.evaluate(()=>!document.querySelector('.prog'));
console.log('تحذير البطء:', warn);
console.log('المؤشّر أُزيل بعد الانتهاء:', progGone);
await p.screenshot({ path:'shots/s10_slowwarn.png' });
console.log('ERRORS:', errs.length? JSON.stringify(errs,null,1):'none');
await b.close();
