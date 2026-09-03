import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking']});
const p = await b.newPage({viewport:{width:420,height:236}});
const errs=[]; p.on('console',m=>{ if(m.type()==='error') errs.push(m.text().slice(0,200)); });
await p.goto('http://127.0.0.1:5173/?shot=1&time=9',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>globalThis.__CITY?.ready===true,null,{timeout:600000});
await new Promise(r=>setTimeout(r,5000));
const out = await p.evaluate(()=>{
  const app=globalThis.__CITY.app, S=app.scene, R=app.renderer;
  const env=app.kernel.get('environment'), fx=app.kernel.get('effects');
  return {
    fog:{density:S.fog.density, color:S.fog.color.getHexString()},
    exposure:R.toneMappingExposure, envI:S.environmentIntensity,
    sunI:env.sun.intensity, sunColor:env.sun.color.getHexString(), hemiI:env.hemi.intensity,
    night:env.night, sunY:env.sunDir.y,
    bloom: fx.bloom ? {strength:fx.bloom.strength, threshold:fx.bloom.threshold, radius:fx.bloom.radius}:null,
    ssao: !!fx.ssao, passes: fx.composer.passes.map(x=>x.constructor.name),
    skyU: { night:env.sky.uniforms.uNight.value, cloud:env.sky.uniforms.uCloudiness.value, turb:env.sky.uniforms.uTurbidity.value, exp:env.sky.uniforms.uExposure.value },
    grade: fx.grade ? Object.fromEntries(Object.entries(fx.grade.uniforms).filter(([k])=>k!=='tDiffuse'&&k!=='uResolution'&&k!=='uLift').map(([k,v])=>[k,v.value])) : null,
  };
});
console.log(JSON.stringify(out,null,1)); console.log('ERRS',errs.slice(0,4));
await b.close();
