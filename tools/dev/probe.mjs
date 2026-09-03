import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking']});
const p = await b.newPage({viewport:{width:640,height:360}});
const errs=[]; p.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') errs.push(m.text().slice(0,300)); });
p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://127.0.0.1:5173/?shot=1&time=15',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>globalThis.__CITY?.ready===true,null,{timeout:180000});
await new Promise(r=>setTimeout(r,4000));
const out = await p.evaluate(()=>{
  const c=document.getElementById('view');
  const gl=c.getContext('webgl2',{preserveDrawingBuffer:true});
  const px=new Uint8Array(4*9); const pts=[];
  const app=globalThis.__CITY.app;
  const s=globalThis.__CITY.stats();
  // sample via 2d canvas
  const t=document.createElement('canvas'); t.width=8; t.height=8;
  const ctx=t.getContext('2d'); ctx.drawImage(c,0,0,8,8);
  const d=ctx.getImageData(0,0,8,8).data;
  const samples=[];
  for(let i=0;i<8;i++) samples.push([d[i*4*8+0],d[i*4*8+1],d[i*4*8+2]]);
  return {samples, drawCalls:s.drawCalls, tris:s.triangles, sceneChildren:app.scene.children.map(o=>o.name||o.type), fog:app.scene.fog?.color.getHexString(), env:!!app.scene.environment};
});
console.log(JSON.stringify(out,null,1)); console.log('ERRS',errs.slice(0,8));
await b.close();
