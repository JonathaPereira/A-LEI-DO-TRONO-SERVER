'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),express=require('express'),WebSocket=require('ws'),{chromium,expect}=require('@playwright/test'),{startFixture}=require('./auth-fixture'),R=require('../frontend/azul-rules');
async function peer(base,token){const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise(r=>ws.once('open',r));const wait=async fn=>{for(let n=0;n<400;n++){const found=messages.findLast(fn);if(found)return found;await new Promise(r=>setTimeout(r,10));}throw Error('Missing peer message');};const send=m=>ws.send(JSON.stringify(m));send({type:'authenticate',access_token:token});await wait(m=>m.type==='auth-result'&&m.ok);return {ws,messages,send,wait};}
test('Azul actual interface, both layouts and portrait displays keep the call and allow a full match',{timeout:180000},async t=>{
 const server=await new Promise(r=>{const s=express().use(express.static(path.resolve('frontend'))).listen(0,'127.0.0.1',()=>r(s));}),origin='http://127.0.0.1:'+server.address().port,f=await startFixture({port:10742,appOrigin:origin});let browser;
 try{
  await fs.mkdir('artifacts/azul',{recursive:true});browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--mute-audio','--autoplay-policy=no-user-gesture-required']});
  for(const native of [true,false])await t.test(native?'Windows games and table':'Website games and table',async()=>{
    const data=[];for(let i=0;i<2;i++){const email='azul-browser-'+native+'-'+i+'@example.test';await f.call('signup',{email,nickname:(native?'Windows ':'Site ')+(i?'Amigo':'Artesão'),password:'Senha12!'});await f.call('verify',{token_hash:[...f.links.keys()].at(-1),type:'signup'});data.push((await f.call('login',{email,password:'Senha12!'})).data);}
    const other=await peer(f.base,data[1].session.access_token),context=await browser.newContext({viewport:{width:1440,height:960},permissions:['microphone','camera'],reducedMotion:'reduce'});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await context.addInitScript(({base,data,native})=>{window.TRONO_BACKEND_URL=base;sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));localStorage.setItem('tronoMusicEnabled','0');localStorage.setItem('tronoSfxEnabled','0');localStorage.setItem('mnDesktopNoiseMode','native');navigator.mediaDevices.getDisplayMedia=async()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;return c.captureStream(15);};if(native)window.TronoDesktop={version:'0.1.12',clipsSuspended:true,readSession:async()=>null,saveSession:async()=>{},getMediaPermissions:async()=>['audio','video'],onCapture:()=>{},onCaptureCancel:()=>{},getWindowState:async()=>({fullscreen:false}),onWindowState:()=>{},onUpdateState:()=>{},getUpdateState:async()=>({status:'idle'}),onApplicationAudio:()=>{},configureClips:async()=>({suspended:true})};},{base:f.base,data:data[0],native});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(8000);
    try{
      await page.goto(origin);await page.evaluate(()=>window.TronoAuth.ready);await page.evaluate(()=>window.TronoChatHub.enter({channelId:'chat-jogos'}));if(!await page.evaluate(()=>window.TronoSocial.voiceJoined))await page.locator('#joinVoiceBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.voiceJoined)).toBe(true);
      await page.locator('#cameraBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.cameraOn)).toBe(true);await page.evaluate(()=>window.TronoSocial.startScreenShare());await expect.poll(()=>page.evaluate(()=>window.TronoSocial.screenSharing)).toBe(true);
      const snapshot=()=>page.evaluate(()=>({socket:window.TronoNetwork.clientId,voice:window.TronoNetwork.primaryRoom,track:window.TronoSocial.getLocalAudioTrack()?.id,camera:window.TronoSocial.getMediaSources().find(s=>s.self)?.camera?.getVideoTracks()[0]?.id,screen:window.TronoSocial.getLocalDisplayStream()?.getVideoTracks()[0]?.id,joined:window.TronoSocial.voiceJoined}));const before=await snapshot();assert(before.track&&before.camera&&before.screen);
      await page.evaluate(()=>window.TronoAppLayout.navigate('game'));await expect(page.locator('#gamesScreen')).toBeVisible();await expect(page.locator('.games-card')).toHaveCount(2);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'artifacts/azul/'+(native?'windows':'web')+'-catalogue.png'});await expect(page.locator('#gamesScreen')).not.toContainText('roguelite');await page.locator('#playAzul').click();await expect(page.locator('#azulScreen')).toBeVisible();await page.getByRole('button',{name:'Criar mesa',exact:true}).click();await expect(page.locator('.az-seated')).toContainText(data[0].user.nickname);
      const id=await page.evaluate(()=>window.TronoGames.room.id);other.send({type:'azul',action:'join',roomId:id});await expect(page.locator('.az-seated')).toContainText(data[1].user.nickname);await page.getByRole('button',{name:'Iniciar com os presentes'}).click();await expect(page.locator('.az-board')).toHaveCount(2);
      for(const layout of ['original','discord']){
        await page.evaluate(v=>window.TronoAppLayout.apply(v),layout);
        for(const [width,height]of [[1440,960],[1280,720],[1080,1920],[720,1280],[480,800],[480,520],[360,740]]){
          if(native&&width<480)continue;await page.setViewportSize({width,height});await expect.poll(()=>page.locator('#azulScreen').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
          const board=await page.locator('.az-board').first().evaluate(el=>{const r=el.getBoundingClientRect(),cells=[...el.querySelectorAll('.az-wall .az-tile,.az-pattern-row .az-slot,.az-floor-slot')].map(c=>c.getBoundingClientRect());return {left:r.left,right:r.right,cells:cells.map(c=>({left:c.left,right:c.right}))};});assert(board.cells.every(c=>c.left>=board.left-1&&c.right<=board.right+1),JSON.stringify({native,layout,width,board}));assert.deepEqual(await snapshot(),before);
          if(width===1440||width===480||width===1080)await page.screenshot({path:'artifacts/azul/'+(native?'windows':'web')+'-'+layout+'-'+width+'.png'});
        }
      }
      await page.setViewportSize({width:1440,height:960});
      await page.locator('#azulFullscreen').click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('azulScreen');
      const full=await page.locator('#azulScreen').boundingBox();assert(full.x===0&&full.y===0&&full.width===1440&&full.height===960,JSON.stringify(full));
      await page.locator('#azulRulesButton').click();await expect(page.locator('#azulRulesDialog')).toBeVisible();await page.locator('#azulRulesClose').click();
      await page.locator('#azulFullscreen').click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
      await page.evaluate(()=>{window.__azFull=document.querySelector('#azulScreen').requestFullscreen;document.querySelector('#azulScreen').requestFullscreen=async()=>{throw Error('Unsupported test');};});
      await page.locator('#azulFullscreen').click();await expect(page.locator('#azulScreen')).toHaveClass(/az-immersive/);await page.keyboard.press('Escape');await expect(page.locator('#azulScreen')).not.toHaveClass(/az-immersive/);await page.evaluate(()=>{document.querySelector('#azulScreen').requestFullscreen=window.__azFull;});assert.deepEqual(await snapshot(),before);
      await page.locator('#azulRulesButton').click();await expect(page.locator('#azulRulesDialog')).toContainText('contando o novo azulejo em ambos');await page.locator('#azulRulesClose').click();
      let turns=0,animated=false,cancelled=false;
      if(native){await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>{window.__azSounds=[];const original=window.TronoAudio.playSfx;window.TronoAudio.playSfx=kind=>{window.__azSounds.push(kind);original(kind);};window.TronoAudio.setSfxEnabled(true);});}
      while(true){
        const state=await page.evaluate(()=>window.TronoGames.room.state);if(state.phase==='finished')break;const move=R.botMove(state),revision=state.revision;
        if(state.players[state.turn].id===data[0].user.id){
          const label=(move.source===-1?'Centro':'Fábrica '+(move.source+1))+': pegar '+(move.source===-1?state.center:state.factories[move.source]).filter(c=>c===move.color).length+' '+R.colors[move.color];await page.getByRole('button',{name:label,exact:true}).click();
          const mine=page.locator('[data-azul-player="'+data[0].user.id+'"]');if(move.row===-1)await mine.getByRole('button',{name:'Chão',exact:true}).click();else await mine.locator('[data-azul-row="'+move.row+'"]').click();
        }else other.send({type:'azul',action:'move',revision,move});
        await expect.poll(()=>page.evaluate(()=>window.TronoGames.room.state.revision)).toBeGreaterThan(revision);assert(++turns<400);
        const next=await page.evaluate(()=>window.TronoGames.room.state);
        if(native&&next.round>state.round&&!animated){
          animated=true;await expect.poll(()=>page.evaluate(()=>window.TronoGames.animating)).toBe(true);
          await expect(page.locator('.az-scoring-banner')).toBeVisible();await expect(page.locator('.az-pick:not(:disabled)')).toHaveCount(0);
          const scored=next.players.find(p=>p.last.placements.length),first=scored.last.placements[0];
          await expect(page.locator('[data-azul-player="'+scored.id+'"] .az-points-pop').first()).toHaveText('+'+first.points);
          await expect(page.locator('[data-azul-player="'+scored.id+'"] .az-score')).toHaveText((scored.last.before+first.points)+' pts');
          await page.screenshot({path:'artifacts/azul/windows-scoring.png'});
          // A valid next-round move can arrive while the prior score is on screen.
          const follow=R.botMove(next);if(next.players[next.turn].id===data[0].user.id)await page.evaluate(({revision,move})=>window.TronoNetwork.azul('move',{revision,move}),{revision:next.revision,move:follow});else other.send({type:'azul',action:'move',revision:next.revision,move:follow});
          await expect.poll(()=>page.evaluate(()=>window.TronoGames.room.state.revision)).toBe(next.revision+1);assert.equal(await page.evaluate(()=>window.TronoGames.animating),true);
          const floored=next.players.find(p=>p.last.penalty);if(floored){await expect(page.locator('.az-scoring-value.az-negative')).toHaveText('−'+Math.min(floored.last.before+floored.last.points,floored.last.penalty),{timeout:25000});await expect(page.locator('[data-azul-player="'+floored.id+'"] .az-score')).toHaveText(Math.max(0,floored.last.before+floored.last.points-floored.last.penalty)+' pts');}
          assert((await page.evaluate(()=>window.__azSounds)).includes('azul-score'));
          await page.getByRole('button',{name:'Concluir contagem'}).click();await expect.poll(()=>page.evaluate(()=>window.TronoGames.animating)).toBe(false);
          const current=await page.evaluate(()=>window.TronoGames.room.state);for(const p of current.players)await expect(page.locator('[data-azul-player="'+p.id+'"] .az-score')).toHaveText(p.score+' pts');
          assert.deepEqual(await snapshot(),before);
        }else if(native&&animated&&!cancelled&&next.round>state.round){
          cancelled=true;await expect.poll(()=>page.evaluate(()=>window.TronoGames.animating)).toBe(true);
          await page.evaluate(()=>window.TronoAppLayout.navigate('community'));await expect.poll(()=>page.evaluate(()=>window.TronoGames.animating)).toBe(false);assert.deepEqual(await snapshot(),before);
          await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{window.TronoAudio.setSfxEnabled(false);window.TronoGames.openAzul();});await expect(page.locator('.az-scoring-banner')).toHaveCount(0);
        }

      }
      if(native){assert(animated,'Played a detailed round');assert(cancelled,'Cancelled a later replay on navigation');}
      await expect(page.locator('.az-result')).toContainText('Recordes salvos');await expect(page.locator('.az-records li')).toHaveCount(native?2:4);await expect(page.locator('.az-bonus')).toHaveCount(2);assert.deepEqual(await snapshot(),before);await page.screenshot({path:'artifacts/azul/'+(native?'windows':'web')+'-result.png'});
      await page.locator('#azulBack').click();await page.locator('#playThrone').click();await expect(page.locator('#setupScreen')).toBeVisible();assert.deepEqual(await snapshot(),before);await page.evaluate(()=>window.TronoGames.openAzul());await page.getByRole('button',{name:'Nova partida',exact:true}).click();await expect(page.getByRole('button',{name:'Criar mesa',exact:true})).toBeVisible();other.send({type:'azul',action:'leave'});
      if(native){
        await page.locator('#azulPlayerCount').selectOption('4');await page.getByRole('button',{name:'Criar mesa',exact:true}).click();await page.getByRole('button',{name:'Completar com bots e iniciar'}).click();await expect(page.locator('.az-board')).toHaveCount(4);await expect(page.locator('.az-factory')).toHaveCount(9);
        for(const [width,height] of [[1440,960],[1080,1920],[480,800]]){await page.setViewportSize({width,height});await expect.poll(()=>page.locator('#azulScreen').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:'artifacts/azul/windows-four-'+width+'.png'});}
        assert.deepEqual(await snapshot(),before);
      }

      assert.deepEqual(errors,[]);
    }finally{other.ws.terminate();await context.close();}
  });
 }finally{await browser?.close();await f.stop();await new Promise(r=>server.close(r));}
});
