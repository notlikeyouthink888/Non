import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking']});
const p = await b.newPage({viewport:{width:480,height:270}});
const errs=[]; p.on('console',m=>{ if(m.type()==='error') errs.push(m.text().slice(0,200)); });
p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://127.0.0.1:5173/?shot=1&time=8',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>globalThis.__CITY?.ready===true,null,{timeout:600000});
await new Promise(r=>setTimeout(r,6000));
const out = await p.evaluate(()=>{
  const app=globalThis.__CITY.app, R=app.renderer, S=app.scene;
  const env=app.kernel.get('environment');
  const sun=env.sun;
  let casters=0, receivers=0, meshes=0;
  S.traverse(o=>{ if(o.isMesh||o.isInstancedMesh){meshes++; if(o.castShadow)casters++; if(o.receiveShadow)receivers++;} });
  const c=sun.shadow.camera;
  return {
    shadowEnabled:R.shadowMap.enabled, autoUpdate:R.shadowMap.autoUpdate, needsUpdate:R.shadowMap.needsUpdate,
    type:R.shadowMap.type, mapSize:[sun.shadow.mapSize.x,sun.shadow.mapSize.y],
    mapExists: !!sun.shadow.map, sunCast:sun.castShadow, sunI:sun.intensity,
    sunPos:sun.position.toArray().map(v=>Math.round(v)), targetPos:sun.target.position.toArray().map(v=>Math.round(v)),
    cam:{l:c.left,r:c.right,t:c.top,b:c.bottom,n:c.near,f:c.far},
    meshes, casters, receivers,
    hemi:env.hemi.intensity, envI:S.environmentIntensity, exposure:R.toneMappingExposure,
    sunDirY: env.sunDir.y,
  };
});
console.log(JSON.stringify(out,null,1)); console.log('ERRS',errs.slice(0,5));
await b.close();
