// Browser regression check. Run against a running site with Playwright installed:
// TEST_BASE=http://127.0.0.1:3000 PLAYWRIGHT_MODULE=/path/to/playwright node web/test-browser/composite-playback.cjs
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE||'http://127.0.0.1:3000';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{channel:'chrome'}),args:['--enable-unsafe-swiftshader']});
 try{
  async function page(){const p=await browser.newPage({viewport:{width:1500,height:1050}});p.setDefaultTimeout(30000);return p;}
  async function open(p){await p.goto(base+'/plate/PL-1630021',{waitUntil:'domcontentloaded',timeout:60000});}
  async function play(p){await p.getByRole('button',{name:'Play composite',exact:true}).last().click();await p.waitForFunction(()=>document.querySelector('video[id^="composite-video-"]')?.currentTime>0.3);}
  async function visiblePanorama(p){
    assert.equal(await p.locator('[data-visible-view]').getAttribute('data-visible-view'),'panorama');
    const result=await p.locator('video[id^="composite-video-"]').evaluate(v=>({ready:v.readyState,opacity:getComputedStyle(v).opacity,parentHidden:v.closest('[aria-hidden]').getAttribute('aria-hidden')}));
    assert.ok(result.ready>=2);assert.equal(result.opacity,'1');assert.equal(result.parentHidden,'false');
  }
  const blocked=await page();await blocked.route('**/imported-stage/**',route=>route.abort());await open(blocked);
  await play(blocked);await visiblePanorama(blocked);
  await blocked.waitForFunction(()=>document.querySelector('[data-preview-mode]')?.dataset.previewMode==='panorama',{},{timeout:25000});
  assert.equal(await blocked.getByText('Loading Lab 360 · panoramic preview available',{exact:true}).count(),0);
  console.log('PASS blocked Lab: moving panorama is visible, initialization times out safely');await blocked.close();

  const health=await page();
  await health.addInitScript(()=>{window.dropLabFrames=true;window.addEventListener('message',e=>{if(window.dropLabFrames&&e.data?.type==='tpl-stage-frame')e.stopImmediatePropagation();},true);});
  await open(health);await health.evaluate(()=>window.dropLabFrames=false);
  await health.locator('[data-stage-ready="true"]').waitFor();console.log('PASS readiness recovers after dropped startup messages');
  await play(health);await health.evaluate(()=>window.dropLabFrames=true);
  const displayed=await health.getByRole('slider',{name:'Clip timeline',exact:true}).inputValue();
  await health.waitForTimeout(700);
  assert.equal(await health.getByRole('slider',{name:'Clip timeline',exact:true}).inputValue(),displayed);
  console.log('PASS Lab clock waits for completed renders');
  await health.locator('[data-preview-mode="panorama"]').waitFor();await visiblePanorama(health);console.log('PASS lost render heartbeat: playback falls back to moving panorama');
  await health.evaluate(()=>window.dropLabFrames=false);
  await health.getByRole('button',{name:'Lab 360',exact:true}).click();await health.locator('[data-stage-ready="true"][data-visible-view="stage"]').waitFor();
  await health.frameLocator('iframe').locator('canvas').first().evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost')));
  await health.locator('[data-preview-mode="panorama"]').waitFor();await visiblePanorama(health);console.log('PASS WebGL loss: panoramic fallback');
  await health.locator('video[id^="composite-video-"]').evaluate(v=>v.dispatchEvent(new Event('error')));
  await health.getByRole('alert').filter({hasText:/Footage could not load|Playback could not start/}).filter({hasText:'Playback is paused'}).waitFor();
  const before=await health.locator('video[id^="composite-video-"]').evaluate(v=>({paused:v.paused,time:v.currentTime}));assert.equal(before.paused,true);
  await health.waitForTimeout(800);
  assert.equal(await health.locator('video[id^="composite-video-"]').evaluate(v=>v.currentTime),before.time);
  await health.getByRole('button',{name:'Play composite',exact:true}).last().click();
  await health.waitForFunction(()=>{const v=document.querySelector('video[id^="composite-video-"]');return v&&!v.paused&&v.readyState>=2});
  await health.getByRole('alert').filter({hasText:/Footage could not load|Playback could not start/}).waitFor({state:'hidden'});console.log('PASS media failure pauses clock; explicit retry resumes');await health.close();

  const failed=await page();await failed.route('**/*.mp4*',route=>route.abort());await open(failed);
  await failed.getByRole('alert').filter({hasText:/Footage could not load|Playback could not start/}).filter({hasText:'Playback is paused'}).waitFor();
  assert.equal(await failed.locator('video[id^="composite-video-"]').evaluate(v=>v.paused),true);
  await failed.unroute('**/*.mp4*');await failed.getByRole('button',{name:'Play composite',exact:true}).last().click();
  await failed.waitForFunction(()=>{const v=document.querySelector('video[id^="composite-video-"]');return v&&!v.paused&&v.currentTime>.3});
  await failed.getByRole('alert').filter({hasText:/Footage could not load|Playback could not start/}).waitFor({state:'hidden'});console.log('PASS failed media request recovers after retry');await failed.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
