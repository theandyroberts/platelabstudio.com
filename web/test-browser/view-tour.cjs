const assert=require('node:assert/strict');
// TEST_BASE=http://127.0.0.1:3000 PLAYWRIGHT_MODULE=/path/to/playwright node web/test-browser/view-tour.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-swiftshader']});try{
const p=await b.newPage({viewport:{width:1600,height:1100}});p.setDefaultTimeout(60000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto((process.env.TEST_BASE||'http://127.0.0.1:3000')+'/plate/PL-3561787',{waitUntil:'load'});
await p.locator('[data-stage-ready="true"]').waitFor();await p.getByRole('button',{name:'Lab 360',exact:true}).click();
const f=p.frameLocator('iframe[title="Lab 360 — stabilized composite"]');
const tour=f.getByRole('button',{name:'View tour',exact:true});
assert.equal(await tour.getAttribute('aria-pressed'),'false');
await tour.click();await p.mouse.move(0,0);await p.evaluate(()=>document.querySelector('video').pause());
await p.waitForTimeout(500);const shot=await tour.getAttribute('data-shot');
const before=await f.locator('#stageCanvas').screenshot();await p.waitForTimeout(800);const after=await f.locator('#stageCanvas').screenshot();
assert.equal(await tour.getAttribute('data-shot'),shot);assert.ok(before.equals(after),'paused camera/footage should be identical');
await p.evaluate(()=>{const v=document.querySelector('video');v.playbackRate=2;return v.play()});
await f.locator('#viewTour[data-shot="1"]').waitFor();console.log('Tour advances with media and stays still while paused');
await f.getByRole('button',{name:'Wide camera: Rear',exact:true}).click();assert.equal(await tour.getAttribute('aria-pressed'),'false');
await tour.click();await f.locator('#stageCanvas').click({position:{x:300,y:150}});assert.equal(await tour.getAttribute('aria-pressed'),'false');console.log('Preset selection and canvas interaction stop tour');
await tour.click();await p.getByRole('button',{name:'Full Lab',exact:true}).click();assert.equal(await tour.getAttribute('aria-pressed'),'true');
await p.keyboard.press('Escape');await p.mouse.move(0,0);console.log('Tour remains available in Full Lab');
await p.route('**/models/bmw_m5.glb',async route=>{await new Promise(resolve=>setTimeout(resolve,2500));await route.continue()});
for (const [value,file] of [['ferrari',null],['bmwM5','bmw_m5.glb'],['escalade','escalade.glb']]) {
 if(file){await f.getByRole('button',{name:'Show controls',exact:true}).click();const loaded=p.waitForResponse(r=>r.url().endsWith(file));await f.locator('#vehicleSelect').selectOption(value);await (await loaded).finished();await f.getByRole('button',{name:'Hide controls',exact:true}).click();}
 if(await tour.getAttribute('aria-pressed')==='true')await tour.click();await tour.click();await p.mouse.move(0,0);
 await p.evaluate(()=>{const v=document.querySelector('video');v.playbackRate=4;return v.play()});
 for(let i=0;i<12;i++){
  await f.locator('#viewTour[data-shot="'+i+'"]').waitFor();
  assert.equal(await p.locator('[data-visible-view]').getAttribute('data-visible-view'),'stage');
  if(process.env.TOUR_SCREENSHOTS)await f.locator('#stageCanvas').screenshot({path:process.env.TOUR_SCREENSHOTS+'/tour-'+value+'-'+i+'.png'});
 }
 console.log(value,'all 12 shots rendered');
}
assert.deepEqual(errors,[]);console.log('No browser exceptions');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
