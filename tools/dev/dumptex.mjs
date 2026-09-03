import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking']});
const p = await b.newPage({viewport:{width:320,height:180}});
await p.goto('http://127.0.0.1:5173/?shot=1&time=12',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>globalThis.__CITY?.ready===true,null,{timeout:600000});
const dumps = await p.evaluate(()=>{
  const app=globalThis.__CITY.app;
  const t=app.kernel.get('terrain');
  const out={};
  const toURL=(tex)=>{ if(!tex?.image) return null;
    const c=document.createElement('canvas'); c.width=tex.image.width; c.height=tex.image.height;
    c.getContext('2d').drawImage(tex.image,0,0); return c.toDataURL('image/png'); };
  out.macro = toURL(t.macro.map);
  out.grass = toURL(app.textures.cache.get('grass41')?.map);
  const m=t.material;
  out.info = { hasOBC: !!m.onBeforeCompile, map:!!m.map, normal:!!m.normalMap, rough:!!m.roughnessMap,
    program: !!m.program, uniformsKeys: Object.keys(t.uniforms||{}) };
  return out;
});
if(dumps.macro) writeFileSync('docs/shots/_tex_macro.png', Buffer.from(dumps.macro.split(',')[1],'base64'));
if(dumps.grass) writeFileSync('docs/shots/_tex_grass.png', Buffer.from(dumps.grass.split(',')[1],'base64'));
console.log(JSON.stringify(dumps.info));
await b.close();
