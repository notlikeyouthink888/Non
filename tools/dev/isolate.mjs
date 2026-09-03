import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const cases = [
  ['bloomfix', '&quality=high'],
  ['nossao',   '&quality=high&nossao=1'],
];
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking']});
for (const [name, q] of cases) {
  const p = await b.newPage({viewport:{width:640,height:360}});
  await p.goto('http://127.0.0.1:5173/?shot=1&time=9.5'+q,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>globalThis.__CITY?.ready===true,null,{timeout:600000});
  await p.evaluate(()=>globalThis.__CITY.setCameraPreset('closeup'));
  await new Promise(r=>setTimeout(r,4000));
  const url = await p.evaluate(()=>document.getElementById('view').toDataURL('image/png'));
  writeFileSync(`docs/shots/_iso_${name}.png`, Buffer.from(url.split(',')[1],'base64'));
  console.log('done', name);
  await p.close();
}
await b.close();
