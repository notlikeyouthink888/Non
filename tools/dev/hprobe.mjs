import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking']});
const p = await b.newPage({viewport:{width:640,height:360}});
await p.goto('http://127.0.0.1:5173/?shot=1&time=12',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>globalThis.__CITY?.ready===true,null,{timeout:600000});
await p.evaluate(()=>{
  const A=globalThis.__CITY.app;
  const t=A.kernel.get('terrain');
  const THREE=A.scene.constructor;
  A.cameraRig.setPreset('street');
  // لوّن التضاريس بالأحمر الصريح
  const red = t.chunks[0].material.constructor === undefined ? null : null;
  t.chunks.forEach(c=>{ c.material = new (Object.getPrototypeOf(c.material).constructor)({ color: 0xff0000 }); c.material.toneMapped=false; });
});
await new Promise(r=>setTimeout(r,3500));
const u = await p.evaluate(()=>document.getElementById('view').toDataURL('image/png'));
writeFileSync('docs/shots/_dbg_redterrain.png', Buffer.from(u.split(',')[1],'base64'));
console.log('ok');
await b.close();
