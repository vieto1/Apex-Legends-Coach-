/* Optional full browser check. Requires Playwright and Chromium; server must run.
   Creates and deletes its own disposable video. Never touches existing matches. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.APEX_TEST_URL||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1360,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let mid,pid;
 try{
  await page.goto(base);
  await page.evaluate(()=>Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>{throw new DOMException('Permission denied','NotAllowedError');}}));
  await page.locator('#recordStart').click();
  await page.waitForFunction(()=>document.getElementById('recordStatus').textContent.includes('Permission denied'));
  assert.equal(await page.locator('#recordStart').isDisabled(),false);

  // Exercise the app's real recorder with a synthetic canvas stream instead of
  // asking the test runner to grant access to the user's actual screen.
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
   const ctx=canvas.getContext('2d');let n=0;
   window.testCanvasTimer=setInterval(()=>{ctx.fillStyle='#24352b';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.font='26px sans-serif';ctx.fillText('SYNTHETIC BROWSER RECORDING '+n++,20,100);},100);
   Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>canvas.captureStream(10)});
  });
  await page.locator('#recordStart').click();
  await page.waitForFunction(()=>!document.getElementById('recordStop').disabled);
  await page.waitForTimeout(2300);
  await page.locator('#recordStop').click();
  await page.waitForFunction(()=>document.getElementById('file').files.length===1);
  await page.locator('#submit').click();
  await page.getByText('Aufnahme gespeichert. Analyse läuft lokal.',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.getElementById('analysisStatus').textContent.includes('abgeschlossen'),null,{timeout:45000});
  const videoSrc=await page.locator('#player').getAttribute('src');mid=videoSrc.split('/')[3];
  await page.waitForFunction(()=>document.getElementById('player').readyState>=2);
  await page.locator('#calibrateExisting').click();
  await page.locator('#capture').click();
  assert(await page.locator('#calibrationCanvas').isVisible());
  await page.locator('#profileName').fill('Disposable browser profile');
  await page.locator('#saveProfile').click();
  await page.getByText('HUD-Profil gespeichert.',{exact:true}).waitFor();
  pid=await page.locator('#profileSelect').inputValue();
  await page.locator('#player').evaluate(v=>{v.currentTime=1.23;});
  await page.locator('#useTime').click();
  assert.equal(await page.locator('#noteTime').inputValue(),'1.23');
  assert.equal(await page.locator('#noteTime').evaluate(e=>e.checkValidity()),true);
  await page.locator('#noteBody').fill('Browser smoke note');
  await page.locator('#noteForm button.primary').click();
  await page.getByText('Notiz gespeichert.',{exact:true}).waitFor();
  await page.locator('#eventForm').evaluate(el=>el.closest('details').open=true);
  for(const [kind,start,title] of [['enemy_visible','0.5','Kontakt'],['first_shot','1','Erster Schuss']]){
   await page.locator('#manualKind').selectOption(kind);await page.locator('#eventStart').fill(start);await page.locator('#eventEnd').fill(start);await page.locator('#eventTitle').fill(title);await page.locator('#eventForm button.primary').click();
   await page.waitForFunction(n=>document.querySelectorAll('#events .event').length>=n,kind==='enemy_visible'?1:2);
  }
  assert((await page.locator('#responseIntervals').innerText()).includes('0.50 s'));
  await page.locator('#events').getByRole('button',{name:'Bearbeiten',exact:true}).first().click();
  await page.locator('#eventStart').fill('0.25');await page.locator('#eventEnd').fill('0.25');
  await page.locator('#saveMoment').click();
  await page.waitForFunction(()=>document.getElementById('responseIntervals').textContent.includes('0.75 s'));
  await page.locator('#events select').first().selectOption('dismissed');
  await page.waitForFunction(()=>!document.getElementById('responseIntervals').textContent.includes('0.75 s'));
  page.once('dialog',d=>d.accept());await page.locator('#reanalyze').click();
  await page.getByText('Erneute Analyse gestartet.',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.getElementById('analysisStatus').textContent.includes('abgeschlossen'),null,{timeout:45000});
  assert.equal(await page.locator('#events .event').count(),2);
  assert((await page.locator('#notes').innerText()).includes('Browser smoke note'));
  const downloadPromise=page.waitForEvent('download');await page.locator('#archive').click();const download=await downloadPromise;assert.equal(await download.failure(),null);
  await page.locator('#calibrationDetails').evaluate(el=>el.open=false);
  await page.locator('#player').evaluate(v=>v.play());
  await page.waitForFunction(()=>document.getElementById('player').currentTime>.2);
  await page.screenshot({path:'/tmp/cossas-ki-v2-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/cossas-ki-v2-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  page.once('dialog',d=>d.accept());await page.locator('#deleteMatch').click();
  await page.waitForFunction(()=>document.getElementById('review').hidden);
  assert.equal((await page.request.get(`${base}/api/matches/${mid}`)).status(),404);mid=null;
  console.log(JSON.stringify({recordingUpload:true,calibration:true,profiles:true,manualEvents:true,review:true,reanalysisPreservesNotes:true,zipDownload:true,playback:true,mobileOverflow:false,delete:true,errors}));
 }finally{
  if(mid)await page.request.delete(`${base}/api/matches/${mid}`);
  if(pid)await page.request.delete(`${base}/api/profiles/${pid}`);
  await page.evaluate(()=>clearInterval(window.testCanvasTimer)).catch(()=>{});
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
