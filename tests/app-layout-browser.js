'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium,expect}=require('@playwright/test'),{startFixture}=require('./auth-fixture');
const sizes=[[1440,960],[1280,720],[1024,768],[900,600],[1080,1920],[720,1280],[480,800],[480,520]];

test('original and Discord arrangements preserve the live app and each account preference',{timeout:240000},async t=>{
  const host=express().use(express.static(path.resolve(__dirname,'../frontend')));
  const server=await new Promise(resolve=>{const listening=host.listen(0,'127.0.0.1',()=>resolve(listening));});
  const origin='http://127.0.0.1:'+server.address().port,fixture=await startFixture({port:10731,appOrigin:origin,soundboard:true});
  let browser;const errors=[];
  try{
    const accounts=[];
    for(const [email,nickname]of [['Jonathapereira.jj@gmail.com','Layout Criador'],['layout-member@example.test','Outro Layout']]){
      await fixture.call('signup',{email,nickname,password:'Senha12!'});await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});
      accounts.push((await fixture.call('login',{email,password:'Senha12!'})).data);
    }
    const created=await fetch(fixture.base+'/community/channels',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+accounts[0].session.access_token,'Content-Type':'application/json'},body:JSON.stringify({name:'Centro de texto',type:'text',description:''})});assert.equal(created.status,200);const textChannel=(await created.json()).channel;
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio']});
    await fs.mkdir(path.resolve(__dirname,'../artifacts/layouts'),{recursive:true});
    for(const native of [true,false])await t.test(native?'Windows arrangement':'website arrangement',async section=>{
      const context=await browser.newContext({viewport:{width:1440,height:960},permissions:['microphone','camera']});
      await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
      await context.addInitScript(({base,data,native})=>{
        window.TRONO_BACKEND_URL=base;
        if(!sessionStorage.getItem('layout-fixture-initialized')){sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));sessionStorage.setItem('layout-fixture-initialized','1');}
        localStorage.setItem('tronoSfxEnabled','0');localStorage.setItem('tronoMusicEnabled','0');localStorage.setItem('mnDesktopNoiseMode','native');
        navigator.mediaDevices.getDisplayMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const draw=canvas.getContext('2d');draw.fillStyle='#384460';draw.fillRect(0,0,1280,720);return canvas.captureStream(15);};
        if(native)window.TronoDesktop={version:'0.1.15',clipsSuspended:true,readSession:async()=>null,saveSession:async()=>{},getMediaPermissions:async()=>['audio','video'],onCapture:()=>{},onCaptureCancel:()=>{},getWindowState:async()=>({fullscreen:false}),onWindowState:()=>{},onUpdateState:()=>{},getUpdateState:async()=>({status:'idle'}),onApplicationAudio:()=>{},configureClips:async()=>({suspended:true})};
      },{base:fixture.base,data:accounts[0],native});
      const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
      try{
        await page.goto(origin);await page.evaluate(()=>window.TronoAuth.ready);await page.evaluate(()=>window.TronoChatHub.enter({channelId:'chat-jogos'}));
        if(!await page.evaluate(()=>window.TronoSocial.voiceJoined))await page.locator('#joinVoiceBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.voiceJoined)).toBe(true);
        await page.locator('#cameraBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.cameraOn)).toBe(true);await page.locator('#muteMicBtn').click();
        await page.evaluate(()=>window.TronoSocial.startScreenShare());await expect.poll(()=>page.evaluate(()=>window.TronoSocial.screenSharing)).toBe(true);
        await page.evaluate(()=>window.TronoNetwork.joinRoom('sala-cetro'));await expect.poll(()=>page.evaluate(()=>window.TronoNetwork.gameRoom)).toBe('sala-cetro');
        await page.evaluate(()=>window.TronoAppLayout.navigate('community'));await expect(page.locator('#chatOnlyScreen')).toBeVisible();
        const snapshot=()=>page.evaluate(()=>({socket:window.TronoNetwork.clientId,voiceRoom:window.TronoNetwork.primaryRoom,gameRoom:window.TronoNetwork.gameRoom,mic:window.TronoSocial.getLocalAudioTrack()?.id,micEnabled:window.TronoSocial.getLocalAudioTrack()?.enabled,camera:window.TronoSocial.getMediaSources().find(source=>source.self)?.camera?.getVideoTracks()[0]?.id,screen:window.TronoSocial.getLocalDisplayStream()?.getVideoTracks()[0]?.id,transport:window.TronoSocial.mediaTransport,joined:window.TronoSocial.voiceJoined,deafened:window.TronoSocial.deafened}));
        const before=await snapshot();assert(before.camera&&before.screen&&before.mic);assert.equal(before.micEnabled,false);
        await section.test('appearance switches real controls without changing microphone, camera, screen, socket or game seat',async()=>{
          if(native)await page.evaluate(()=>window.TronoDesktopSettings.open('appearance'));else await page.evaluate(()=>window.TronoProfile.open());
          await page.locator('[name=appLayout][value=discord]').check();await expect(page.locator('body')).toHaveAttribute('data-app-layout','discord');
          assert.deepEqual(await snapshot(),before);
          for(const id of ['muteMicBtn','deafenVoiceBtn','voiceSettingsBtn'])await expect(page.locator('#layoutUserControls #'+id)).toHaveCount(1);
          await expect(page.locator('#layoutConnectionControls #joinVoiceBtn')).toHaveCount(1);
          for(const id of ['cameraBtn','screenShareBtn'])await expect(page.locator('#layoutCallActions #'+id)).toHaveCount(1);
          if(native)await page.locator('#voiceSettingsClose').click();else await page.locator('#profileClose').click();
          for(const value of ['original','discord','original','discord']){await page.evaluate(value=>window.TronoAppLayout.apply(value,{save:true}),value);assert.deepEqual(await snapshot(),before);}
          await expect(page.locator('#messengerToggle')).toBeVisible();
          assert(await page.locator('#messengerToggle').evaluate(button=>!!button.closest('#desktopRail,#webLayoutRail,.mn-sidebar-heading')),'friends belong to the left navigation');
          if(native){await expect(page.locator('#desktopRail [data-desktop-route=home]')).toHaveCount(1);await expect(page.locator('#desktopRail').getByText('Início',{exact:true})).toHaveCount(0);}
          for(const value of ['original','discord']){
            await page.evaluate(value=>window.TronoAppLayout.apply(value,{save:true}),value);
            await page.locator(native?'#desktopHome':value==='discord'?'#webLayoutRail [data-layout-route=home]':'#channelHomeBtn').click();
            await expect(page.locator('#portalScreen')).toBeVisible();assert.deepEqual(await snapshot(),before);
            await page.evaluate(()=>window.TronoAppLayout.navigate('community'));assert.deepEqual(await snapshot(),before);
          }
        });
        await section.test('streams, participant cards and both groups of controls fit every supported monitor',async()=>{
          const failures=[];
          for(const value of ['original','discord'])for(const [width,height]of sizes){
            await page.setViewportSize({width,height});await page.evaluate(value=>window.TronoAppLayout.apply(value,{save:true}),value);
            await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
            const shape=await page.evaluate(()=>{
              const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
              const visible=el=>el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
              const controls=['joinVoiceBtn','muteMicBtn','deafenVoiceBtn','cameraBtn','screenShareBtn','voiceSettingsBtn'].map(id=>({id,...rect(document.getElementById(id)),visible:!!visible(document.getElementById(id))}));
              const stage=document.querySelector('.mn-media-stage'),tile=document.querySelector('#screenShareGrid .screen-share-tile'),bar=document.querySelector(document.body.dataset.appLayout==='discord'?'#layoutVoicePanel':'#desktopCallDock');
              return {controls,friends:{...rect(document.getElementById('messengerToggle')),visible:!!visible(document.getElementById('messengerToggle'))},stage:rect(stage),tile:rect(tile),stageOverflow:stage?.scrollHeight-stage?.clientHeight,bar:visible(bar)?rect(bar):null,cards:[...document.querySelectorAll('#voiceRoster .voice-person')].map(rect),documentOverflow:document.documentElement.scrollWidth-innerWidth,panel:rect(document.querySelector('#socialPanel'))};
            });
            const issue=message=>failures.push({native,value,width,height,message,shape});
            if(shape.documentOverflow>1)issue('document overflow');
            if(!shape.friends.visible||shape.friends.x<0||shape.friends.right>width+1||shape.friends.y<0||shape.friends.bottom>height+1)issue('friends navigation must remain accessible');
            for(const control of shape.controls)if(!control.visible||control.width<=0||control.height<=0||control.x<0||control.right>width+1||control.y<0||control.bottom>height+1)issue('control outside viewport: '+control.id);
            for(let i=0;i<shape.controls.length;i++)for(let j=i+1;j<shape.controls.length;j++){const a=shape.controls[i],b=shape.controls[j];if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)issue('overlapping controls: '+a.id+'/'+b.id);}
            if(!shape.tile||shape.tile.height<70||shape.tile.x<0||shape.tile.right>width+1||shape.tile.y<0||shape.tile.bottom>height+1||shape.bar&&Math.min(shape.tile.right,shape.bar.right)-Math.max(shape.tile.x,shape.bar.x)>1&&Math.min(shape.tile.bottom,shape.bar.bottom)-Math.max(shape.tile.y,shape.bar.y)>1)issue('stream is cropped by the viewport or bottom controls');
            if(shape.stageOverflow>1)issue('stream stage requires scrolling');
            if(shape.cards.some(card=>card.width>289||card.height>69))issue('participant cards must remain compact');
            assert.deepEqual(await snapshot(),before);
            await page.screenshot({path:path.resolve(__dirname,`../artifacts/layouts/${native?'windows':'web'}-${value}-${width}x${height}.png`)});
          }
          if(failures.length)await fs.writeFile(path.resolve(__dirname,`../artifacts/layouts/${native?'windows':'web'}-geometry-failures.json`),JSON.stringify(failures,null,2));
          assert.deepEqual(failures,[]);
        });
        await section.test('Discord text channels fill the center while voice stays connected; profile expansion and fullscreen keep media',async()=>{
          await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>window.TronoAppLayout.apply('discord',{save:true}));
          const card=page.locator('#voiceRoster .voice-person').first(),stream=page.locator('#screenShareGrid .screen-share-tile').first(),bounds=await stream.boundingBox();
          await card.locator('.participant-expand').click();await expect(card.locator('.participant-details')).toBeVisible();const expanded=await stream.boundingBox();assert(Math.abs(bounds.width-expanded.width)<1&&Math.abs(bounds.height-expanded.height)<1);await card.locator('.participant-expand').click();
          await stream.hover();await stream.locator('.media-fullscreen-btn').click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement||document.body.classList.contains('media-focus-open'))).toBe(true);assert.deepEqual(await snapshot(),before);await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await window.TronoSocial.fullscreenMedia(window.TronoNetwork.clientId);});
          await page.evaluate(id=>window.TronoNetwork.joinTextChannel(id),textChannel.id);await expect.poll(()=>page.evaluate(()=>window.TronoNetwork.currentRoom)).toBe(textChannel.id);await page.evaluate(()=>window.TronoSocial.toggleTextChat(true));
          await expect(page.locator('#courtChatInput')).toBeVisible();await expect(page.locator('#socialPanel > .voice-section')).toBeHidden();
          const geometry=await page.evaluate(()=>{const panel=document.querySelector('#socialPanel').getBoundingClientRect(),chat=document.querySelector('#socialPanel > .court-chat-section').getBoundingClientRect(),compose=document.querySelector('#courtChatInput').getBoundingClientRect();return {panel:{x:panel.x,right:panel.right,bottom:panel.bottom},chat:{x:chat.x,right:chat.right,bottom:chat.bottom},compose:{y:compose.y,bottom:compose.bottom}};});
          assert(Math.abs(geometry.chat.x-geometry.panel.x)<2&&Math.abs(geometry.chat.right-geometry.panel.right)<2,JSON.stringify(geometry));assert(geometry.compose.bottom<=geometry.panel.bottom+1,JSON.stringify(geometry));assert.deepEqual(await snapshot(),before);
          await page.locator('#courtChatInput').fill('Texto central com voz preservada');await page.locator('#courtChatInput').press('Enter');await expect(page.locator('#courtChatMessages')).toContainText('Texto central com voz preservada');
          await page.screenshot({path:path.resolve(__dirname,`../artifacts/layouts/${native?'windows':'web'}-discord-text.png`)});
        });
        await section.test('sidebar call and video icons control real media, reconnect from text, and return to the actual voice channel',async()=>{
          await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>window.TronoAppLayout.apply('discord',{save:true}));
          await expect(page.locator('#layoutUserName')).toHaveText('Layout Criador');await expect(page.locator('#layoutUserAvatar')).toBeVisible();await expect(page.locator('#layoutVoiceLabel')).toHaveText('Voz conectada');await expect(page.locator('#layoutVoiceChannel')).toContainText('Jogos');
          for(const id of ['joinVoiceBtn','cameraBtn','screenShareBtn','muteMicBtn','deafenVoiceBtn','voiceSettingsBtn']){
            const shape=await page.locator('#'+id).evaluate(button=>{const r=button.getBoundingClientRect(),p=document.getElementById('layoutVoicePanel').getBoundingClientRect(),icon=button.querySelector('.call-icon');return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,panel:{x:p.x,right:p.right,y:p.y,bottom:p.bottom},label:button.getAttribute('aria-label'),visibleLabel:button.lastElementChild.getClientRects().length,mask:getComputedStyle(icon,'::after').maskImage};});
            assert(shape.x>=shape.panel.x&&shape.right<=shape.panel.right&&shape.y>=shape.panel.y&&shape.bottom<=shape.panel.bottom,JSON.stringify({id,shape}));assert(shape.label&&shape.visibleLabel===0&&shape.mask!=='none',JSON.stringify({id,shape}));
          }
          const members=await snapshot();await page.locator('#muteMicBtn').click();assert(await page.evaluate(()=>window.TronoSocial.getLocalAudioTrack().enabled));await expect(page.locator('#muteMicBtn')).toHaveAttribute('aria-pressed','false');
          await page.locator('#deafenVoiceBtn').click();assert(!await page.evaluate(()=>window.TronoSocial.getLocalAudioTrack().enabled));await expect(page.locator('#layoutUserStatus')).toHaveText('Áudio silenciado');await page.locator('#deafenVoiceBtn').click();assert(await page.evaluate(()=>window.TronoSocial.getLocalAudioTrack().enabled));
          await page.locator('#cameraBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.cameraOn)).toBe(false);await expect(page.locator('#cameraBtn')).toHaveAttribute('aria-pressed','false');await page.locator('#cameraBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.cameraOn)).toBe(true);assert.equal((await snapshot()).screen,members.screen);
          await page.locator('#screenShareBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.screenSharing)).toBe(false);await page.locator('#screenShareBtn').click();await expect(page.locator('#screenOptionsDialog')).toBeVisible();await page.locator('#screenOptionsCancel').click();assert(!await page.evaluate(()=>window.TronoSocial.screenSharing));
          const selected=await page.evaluate(()=>window.TronoNetwork.currentRoom);assert.equal(selected,textChannel.id);
          await page.locator('#joinVoiceBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.voiceJoined)).toBe(false);await expect(page.locator('#layoutVoiceLabel')).toHaveText('Fora da chamada');await expect(page.locator('#cameraBtn')).toBeDisabled();await expect(page.locator('#screenShareBtn')).toBeDisabled();await expect(page.locator('#joinVoiceBtn')).toBeEnabled();assert.equal((await snapshot()).gameRoom,members.gameRoom);assert.equal(await page.evaluate(()=>window.TronoNetwork.currentRoom),selected);
          await page.evaluate(()=>{window.__layoutOriginalMic=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Microfone bloqueado para teste','NotAllowedError');};});await page.locator('#joinVoiceBtn').click();await expect(page.locator('#layoutVoiceLabel')).toHaveText('Falha ao conectar');await expect(page.locator('#layoutVoiceChannel')).toContainText('Microfone bloqueado');await expect(page.locator('#joinVoiceBtn')).toBeEnabled();await page.evaluate(()=>navigator.mediaDevices.getUserMedia=window.__layoutOriginalMic);
          // Permission work is delayed to exercise the pending state and avoid duplicate capture.
          await page.evaluate(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.__layoutMicRequests=0;navigator.mediaDevices.getUserMedia=options=>{window.__layoutMicRequests++;return new Promise(resolve=>{window.__layoutReleaseMic=async()=>{navigator.mediaDevices.getUserMedia=original;resolve(await original(options));};});};});
          await page.locator('#joinVoiceBtn').click();await expect(page.locator('#layoutVoiceLabel')).toHaveText('Conectando…');await expect(page.locator('#joinVoiceBtn')).toBeDisabled();assert.equal(await page.evaluate(()=>window.__layoutMicRequests),1);await page.evaluate(()=>window.__layoutReleaseMic());await expect.poll(()=>page.evaluate(()=>window.TronoSocial.voiceJoined)).toBe(true);await expect(page.locator('#layoutVoiceLabel')).toHaveText('Voz conectada');assert.equal(await page.evaluate(()=>window.TronoNetwork.currentRoom),selected);
          const resumed=await snapshot();await page.locator('#layoutVoiceLocation').click();await expect.poll(()=>page.evaluate(()=>window.TronoNetwork.currentRoom)).toBe(members.voiceRoom);assert.equal((await snapshot()).mic,resumed.mic);assert.equal((await snapshot()).voiceRoom,members.voiceRoom);assert.equal((await snapshot()).gameRoom,members.gameRoom);
          await page.screenshot({path:path.resolve(__dirname,`../artifacts/layouts/${native?'windows':'web'}-discord-voice-panel.png`)});
          await page.setViewportSize({width:480,height:520});await page.evaluate(()=>window.TronoMessenger.openFriends());await expect(page.locator('#messengerPanel')).toBeVisible();const privatePanel=await page.locator('#messengerPanel').boundingBox(),voicePanel=await page.locator('#layoutVoicePanel').boundingBox();assert(privatePanel.y+privatePanel.height<=voicePanel.y,JSON.stringify({privatePanel,voicePanel}));await page.locator('#messengerClose').click();
          if(native){await page.locator('#soundboardToggle').click();await expect(page.locator('#soundboardDialog')).toBeVisible();const effects=await page.locator('#soundboardDialog').boundingBox();assert(effects.y>=52&&effects.y+effects.height<=voicePanel.y,JSON.stringify({effects,voicePanel}));await page.locator('#soundboardClose').click();}
          assert.equal((await snapshot()).mic,resumed.mic);await page.setViewportSize({width:1280,height:720});
        });
        await section.test('layout is remembered after reopening and isolated between accounts on the same device',async()=>{
          await page.evaluate(()=>window.TronoAppLayout.apply('discord',{save:true}));await page.reload();await page.evaluate(()=>window.TronoAuth.ready);await expect(page.locator('body')).toHaveAttribute('data-app-layout','discord');
          await page.evaluate(data=>sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data)),accounts[1]);await page.reload();await page.evaluate(()=>window.TronoAuth.ready);await expect.poll(()=>page.evaluate(()=>window.TronoAuth.user.id)).toBe(accounts[1].user.id);await expect(page.locator('body')).toHaveAttribute('data-app-layout','original');
          await page.evaluate(()=>window.TronoAppLayout.apply('discord',{save:true}));await page.reload();await page.evaluate(()=>window.TronoAuth.ready);await expect(page.locator('body')).toHaveAttribute('data-app-layout','discord');await page.evaluate(()=>window.TronoAppLayout.apply('original',{save:true}));
          await page.evaluate(data=>sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data)),accounts[0]);await page.reload();await page.evaluate(()=>window.TronoAuth.ready);await expect.poll(()=>page.evaluate(()=>window.TronoAuth.user.id)).toBe(accounts[0].user.id);await expect(page.locator('body')).toHaveAttribute('data-app-layout','discord');
        });
      }finally{await context.close();}
    });
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await fixture.stop();await new Promise(resolve=>server.close(resolve));}
});
