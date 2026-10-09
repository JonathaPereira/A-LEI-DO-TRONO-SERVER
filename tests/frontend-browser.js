'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const express=require('express'),{chromium,expect}=require('@playwright/test');
const {startFixture}=require('./auth-fixture'),{validateSound}=require('../soundboard');
function wave(seconds){const size=seconds*16000*2,b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b;}

test('frontend Chromium: permissions, channels, screen selection, mosaic, soundboard and mobile', {timeout:120000}, async t=>{
  const app=express();app.use(express.static(path.resolve(__dirname,'../frontend')));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),origin='http://127.0.0.1:'+server.address().port;
  const f=await startFixture({port:10681,appOrigin:origin,soundboard:true});let browser;const errors=[],contexts=[];
  const artifacts=path.resolve(__dirname,'../artifacts');fs.mkdirSync(artifacts,{recursive:true});
  try{
    browser=await chromium.launch({executablePath:process.env.AUTH_TEST_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio']});
    async function user(email,nickname){await f.call('signup',{email,nickname,password:'Senha12!'});const hash=[...f.links].find(([,v])=>v.user.email===email)[0];await f.call('verify',{token_hash:hash,type:'signup'});return (await f.call('login',{email,password:'Senha12!'})).data;}
    const owner=await user('jonathapereira.jj@gmail.com','Criador UI'),member=await user('membro@example.test','Membro UI');
    async function pageFor(data){
      const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['microphone','camera']});contexts.push(context);
      await context.addInitScript(({backend,data})=>{window.TRONO_BACKEND_URL=backend;sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));localStorage.setItem('tronoMusicEnabled','0');localStorage.setItem('tronoSfxEnabled','0');localStorage.setItem('tronoNoiseSuppression','0');window.__captures=[];window.__soundAudios=[];const NativeAudio=window.Audio;window.Audio=class extends NativeAudio{constructor(...args){super(...args);window.__soundAudios.push(this);}};navigator.mediaDevices.getDisplayMedia=async options=>{window.__captures.push(options);if(window.__denyCapture)throw new DOMException('Cancelado','NotAllowedError');const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');ctx.fillStyle='#564775';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#e6d9ff';ctx.font='40px sans-serif';ctx.fillText('Compartilhamento de teste',160,340);window.__captureCanvas=canvas;return canvas.captureStream(30);};},{backend:f.base,data});
      await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();return route.continue();});
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>void dialog.accept());await page.goto(origin);await page.evaluate(()=>window.TronoAuth.ready);await page.locator('#openVoicePortalBtn').click();await expect(page.locator('#chatOnlyScreen')).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.TronoNetwork.currentRoom)).toBe('chat-livre');return page;
    }
    const memberPage=await pageFor(member),page=await pageFor(owner);let textId,voiceId;
    await t.test('creator controls and live role grant/revocation; member cannot manage',async()=>{
      await expect(memberPage.locator('#communityManageBtn')).toBeHidden();await expect(page.locator('#myRoleBadge')).toHaveText('Criador');
      if(!await page.locator('#communityPanel').isVisible())await page.locator('#communityToggle').click();
      const row=page.locator('.community-person').filter({hasText:'Membro UI'});await row.getByRole('button',{name:'Alterar cargo de Membro UI'}).click();await page.locator('#roleSelect').selectOption('admin');await page.locator('#roleSave').click();await expect(memberPage.locator('#communityManageBtn')).toBeVisible();
      await row.getByRole('button',{name:'Alterar cargo de Membro UI'}).click();await page.locator('#roleSelect').selectOption('member');await page.locator('#roleSave').click();await expect(memberPage.locator('#communityManageBtn')).toBeHidden();
    });
    await t.test('channel photo gallery, moderation and permissions updated on visible attachments',async()=>{
      const photo={id:'50000000-0000-4000-8000-000000000001',name:'Foto do canal.png',bytes:68,mime:'image/png',ownerId:'50000000-0000-4000-8000-000000000002',kind:'chat'};let removed=false;
      for(const p of [page,memberPage]){
        await p.route(f.base+'/files/channel/**',route=>route.fulfill({json:{files:removed?[]:[photo],hasMore:false}}));
        await p.route(f.base+'/files/'+photo.id+'/url',route=>route.fulfill({json:{url:origin+'/photo.png',expiresAt:Date.now()+300000}}));
        await p.route(origin+'/photo.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNyQAAAAASUVORK5CYII=','base64')}));
        await p.locator('#channelFilesBtn').click();await expect(p.locator('#channelFileList img')).toBeVisible();
      }
      await expect(page.locator('#channelFileList .file-delete')).toHaveText('Moderar: excluir');await expect(memberPage.locator('#channelFileList .file-delete')).toHaveCount(0);
      await page.evaluate(userId=>window.TronoCommunityAdmin.api('/roles',{method:'POST',body:{userId,role:'admin'}}),member.user.id);await expect(memberPage.locator('#channelFileList .file-delete')).toBeVisible();
      await page.evaluate(userId=>window.TronoCommunityAdmin.api('/roles',{method:'POST',body:{userId,role:'member'}}),member.user.id);await expect(memberPage.locator('#channelFileList .file-delete')).toHaveCount(0);
      await page.route(f.base+'/files/'+photo.id,route=>{assert.equal(route.request().method(),'DELETE');removed=true;return route.fulfill({json:{ok:true}});});
      await page.locator('#channelFileList .file-delete').click();await expect(page.locator('#channelFileList')).toHaveText('Arquivo excluído.');assert(removed);
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('trono-role-change')));await expect(page.locator('#channelFileList img')).toHaveCount(0);await expect(page.locator('#channelFileList')).toContainText('Arquivo excluído.');
      for(const p of [page,memberPage])await p.locator('#channelFilesClose').click();
    });
    await t.test('create text/voice channels, select dynamic channel, text chat and delete occupied channel',async()=>{
      await page.locator('#communityManageBtn').click();await page.locator('#channelName').fill('Fotos novas');await page.locator('#channelType').selectOption('text');await page.locator('#createChannelSubmit').click();await expect(page.locator('#channelManagerMessage')).toHaveText('Canal criado.');
      textId=await page.locator('#textChannelList [data-chat-channel]').getAttribute('data-chat-channel');
      await page.locator('#channelName').fill('Voz nova');await page.locator('#channelType').selectOption('voice');await page.locator('#createChannelSubmit').click();await expect(page.locator('#managedChannels')).toContainText('Voz nova');await page.locator('#channelManagerClose').click();
      await page.locator('#textChannelList [data-chat-channel]').click();await expect.poll(()=>page.evaluate(()=>window.TronoNetwork.currentRoom)).toBe(textId);await expect(page.locator('.voice-section')).toBeHidden();await page.locator('#courtChatInput').fill('Mensagem no canal novo');await page.locator('#courtChatSend').click();await expect(page.locator('#courtChatMessages')).toContainText('Mensagem no canal novo');
      await page.locator('#chatChannelList [data-chat-channel]').filter({hasText:'Voz nova'}).click();voiceId=await page.evaluate(()=>window.TronoNetwork.currentRoom);await expect(page.locator('.court-chat-section')).toBeHidden();await expect(page.locator('#joinVoiceBtn')).toBeEnabled();
      await page.locator('#communityManageBtn').click();await page.getByRole('button',{name:'Excluir canal Voz nova',exact:true}).click();await expect(page.locator('#managedChannels')).not.toContainText('Voz nova');await page.locator('#channelManagerClose').click();await expect.poll(()=>page.evaluate(()=>window.TronoNetwork.currentRoom)).toBe(null);
      await page.locator('[data-chat-channel="chat-livre"]').click();await expect.poll(()=>page.evaluate(()=>window.TronoNetwork.currentRoom)).toBe('chat-livre');
    });
    await t.test('screen popup precedes capture; cancel, 1080p/60 FPS and denied capture',async()=>{
      await page.locator('#joinVoiceBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.voiceJoined)).toBe(true);
      await page.locator('#screenShareBtn').click();await expect(page.locator('#screenOptionsDialog')).toBeVisible();assert.equal(await page.evaluate(()=>window.__captures.length),0);await page.locator('#screenOptionsCancel').click();assert.equal(await page.evaluate(()=>window.__captures.length),0);
      await page.locator('#screenShareBtn').click();await page.locator('#shareResolution').selectOption('1080');await page.locator('#shareFps').selectOption('60');await page.locator('#screenOptionsConfirm').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.screenSharing)).toBe(true);
      const capture=await page.evaluate(()=>window.__captures[0]);assert.equal(capture.video.height.ideal,1080);assert.equal(capture.video.frameRate.ideal,60);assert.equal((await page.evaluate(()=>window.TronoSocial.screenSettings)).fps,60);
      await page.locator('#screenShareBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.screenSharing)).toBe(false);
      await page.evaluate(()=>{window.__denyCapture=true;});await page.locator('#screenShareBtn').click();await page.locator('#screenOptionsConfirm').click();await expect(page.locator('#voiceStatus')).toContainText('cancelado');assert.equal(await page.evaluate(()=>window.TronoSocial.screenSharing),false);await page.evaluate(()=>{window.__denyCapture=false;});
    });
    await t.test('camera capture and expanded mosaic: six people, selection and cleanup',async()=>{
      await page.locator('#cameraBtn').click();await expect.poll(()=>page.evaluate(()=>window.TronoSocial.cameraOn)).toBe(true);await expect(page.locator('#cameraGrid video').first()).toBeVisible();
      await page.evaluate(()=>{window.__originalSources=window.TronoSocial.getMediaSources;const stream=window.__originalSources()[0].camera;window.TronoSocial.getMediaSources=()=>Array.from({length:7},(_,i)=>({id:'demo-'+i,name:['Ana','Bruno','Clara','Diego','Eva','Felipe','Gabi'][i],camera:stream,screen:i===0?stream:null}));});
      await page.locator('#expandMosaicBtn').click();await expect(page.locator('#mediaFocusGrid .focus-person')).toHaveCount(6);await expect(page.getByRole('checkbox',{name:'Incluir Gabi no mosaico'})).toBeDisabled();
      await page.getByRole('checkbox',{name:'Incluir Ana no mosaico'}).uncheck();await page.getByRole('checkbox',{name:'Incluir Gabi no mosaico'}).check();await expect(page.locator('#mediaFocusCount')).toHaveText('6 de 6 pessoas');await expect(page.locator('#mediaFocusGrid .focus-person')).toHaveCount(6);
      await page.screenshot({path:path.join(artifacts,'frontend-mosaic-desktop.png')});await page.locator('#mediaFocusClose').click();assert.equal(await page.locator('#mediaFocusGrid video').count(),0);await page.evaluate(()=>{window.TronoSocial.getMediaSources=window.__originalSources;});
    });
    await t.test('sound conversion, rejection over 15 seconds, upload and personal playback volume',async()=>{
      let uploaded=0;const library=[{id:f.soundId,name:'Efeito.wav',ownerId:owner.user.id,bytes:32044,mime:'audio/wav',kind:'soundboard',durationMs:1000}];
      await page.route(f.base+'/files/**',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.pathname==='/files/soundboard')return route.fulfill({json:{files:library,hasMore:false}});
        if(url.pathname==='/files/upload'){const body=req.postDataBuffer(),verified=validateSound(body);assert.equal(verified.durationMs,15000);uploaded++;const file={...library[0],id:'40000000-0000-4000-8000-000000000001',name:'Aplausos.wav',durationMs:verified.durationMs,bytes:body.length};library.push(file);return route.fulfill({json:{file}});}
        if(url.pathname.endsWith('/url'))return route.fulfill({json:{url:origin+'/test-sound.wav',expiresAt:Date.now()+300000}});
        return route.continue();
      });await page.route(origin+'/test-sound.wav',route=>route.fulfill({body:wave(1),contentType:'audio/wav'}));
      await page.locator('#soundboardBtn').click();await page.locator('#soundName').fill('Aplausos');await page.locator('#soundFile').setInputFiles({name:'longo.wav',mimeType:'audio/wav',buffer:wave(16)});await page.locator('#soundUpload').click();await expect(page.locator('#soundboardMessage')).toContainText('15 segundos');assert.equal(uploaded,0);
      await page.locator('#soundFile').setInputFiles({name:'efeito.wav',mimeType:'audio/wav',buffer:wave(15)});await page.locator('#soundUpload').click();await expect(page.locator('#soundboardMessage')).toHaveText('Efeito adicionado à biblioteca.');assert.equal(uploaded,1);
      await page.locator('#soundboardVolume').evaluate(el=>{el.value='35';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('[data-play-sound="'+f.soundId+'"]').click();await expect.poll(()=>page.evaluate(()=>window.__soundAudios.at(-1)?.volume)).toBe(.35);await page.locator('#soundStop').click();await page.locator('#soundboardClose').click();
    });
    await t.test('desktop/mobile layout and preserved game lobby',async()=>{
      await page.screenshot({path:path.join(artifacts,'frontend-chat-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'frontend-chat-mobile.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      for(const id of ['joinVoiceBtn','cameraBtn','screenShareBtn','soundboardBtn']){await expect(page.locator('#'+id)).toBeVisible();const box=await page.locator('#'+id).boundingBox();assert(box.x>=0&&box.x+box.width<=391,id+' must fit mobile viewport');assert(box.y>=0&&box.y+box.height<=845,id+' must remain on screen');}
      await page.locator('#backFromChatOnlyBtn').click();await expect(page.locator('#portalScreen')).toBeVisible();await page.locator('#openGamePortalBtn').click();await expect(page.locator('#setupScreen')).toBeVisible();await expect(page.locator('.room-enter').first()).toBeVisible();
      await page.locator('#backFromLobbyBtn').click();await page.screenshot({path:path.join(artifacts,'frontend-portal-mobile.png')});
    });
    assert.deepEqual(errors,[],'No uncaught browser errors');
  }finally{for(const context of contexts)await context.close();await browser?.close();await f.stop();await new Promise(resolve=>server.close(resolve));}
});
