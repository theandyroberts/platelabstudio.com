// ENGINE=webkit TEST_BASE=http://127.0.0.1:3000 PLAYWRIGHT_MODULE=/path/to/playwright node web/test-browser/streaming-preview.cjs
// Streaming proxy caps each video response at 6 Mbps, preserving Safari's Range requests.
const assert=require('node:assert/strict');
const http=require('node:http');
const {Transform,pipeline}=require('node:stream');
const engines=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const upstream=new URL(process.env.TEST_BASE||'http://127.0.0.1:3000');
const server=http.createServer((req,res)=>{
 if(process.env.DEBUG_STREAM)console.log('REQUEST',req.url,req.headers.range||'');
 const request=http.request({hostname:upstream.hostname,port:upstream.port,path:req.url,method:req.method,headers:{...req.headers,host:upstream.host}},response=>{
  if(process.env.DEBUG_STREAM)console.log('RESPONSE',response.statusCode,req.url,response.headers['content-range']||'');
  res.writeHead(response.statusCode,response.headers);
  const throttle=new Transform({transform(chunk,encoding,done){setTimeout(()=>{this.push(chunk);done()},chunk.length/750000*1000)}});
  pipeline(...(/\.mp4(?:[?#]|$)/.test(req.url)?[response,throttle,res]:[response,res]),()=>{});
 });
 request.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});
 res.on('close',()=>request.destroy());req.pipe(request);
});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const engine=engines[process.env.ENGINE||'webkit'];
 const b=await engine.launch({headless:true,...(engine===engines.chromium?{...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{channel:'chrome'}),args:['--enable-unsafe-swiftshader']}:{} )});
 try{const page=await b.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const path of (process.env.TEST_PATHS?process.env.TEST_PATHS.split(','):['/','/plate/PL-1630021','/plate/PL-3561787'])){
  await page.goto('http://127.0.0.1:'+server.address().port+path,{waitUntil:'domcontentloaded'});
  if(path!=='/')await page.getByRole('button',{name:'Panoramic view',exact:false}).click();
  const video=page.locator('video').first();await video.scrollIntoViewIfNeeded();
  await video.evaluate(v=>{v.testFrames=0;const count=()=>{v.testFrames++;v.requestVideoFrameCallback(count)};v.requestVideoFrameCallback(count)});
  await video.evaluate(v=>{v.muted=true;v.defaultMuted=true;return v.play()});
  await page.mouse.move(0,0);
  const source=await video.getAttribute('src');assert.match(source,/browser-(?:preview|v1)|browser-v1/);
  const dimensions=await video.evaluate(v=>[v.videoWidth,v.videoHeight]);assert.ok(dimensions[0]<=2048);
  let previous=await video.evaluate(v=>v.currentTime),previousFrames=0;
  for(let i=0;i<6;i++){
   await page.waitForTimeout(5000);
   const state=await video.evaluate(v=>({time:v.currentTime,duration:v.duration,paused:v.paused,ready:v.readyState,error:v.error?.message,frames:v.testFrames,buffered:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)])}));
   if(process.env.DEBUG_STREAM)console.log('SAMPLE',path,state);
   const advance=state.time>=previous?state.time-previous:state.time+state.duration-previous;
   assert.ok(advance>=3.5,`${path} stalled: ${JSON.stringify(state)}, previous=${previous}`);
   assert.ok(state.frames-previousFrames>=24,`${path} stopped presenting frames: ${JSON.stringify(state)}`);previousFrames=state.frames;
   assert.equal(state.paused,false);assert.equal(state.error,undefined);previous=state.time;
  }
  if(path!=='/'){
   assert.equal(await page.locator('[data-visible-view]').getAttribute('data-visible-view'),'panorama');
  }
  console.log('PASS 30 seconds continuous playback at 6 Mbps',path,dimensions);
  if(process.env.CAPTURE_DIR)await page.screenshot({path:process.env.CAPTURE_DIR+'/'+(path==='/'?'hero':path.split('/').pop())+'.png'});
 }
 assert.deepEqual(errors,[]);
 }finally{await b.close();server.closeAllConnections();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.closeAllConnections();server.close()});
