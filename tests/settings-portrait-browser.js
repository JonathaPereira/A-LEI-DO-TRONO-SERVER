'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium,expect}=require('@playwright/test'),{startFixture}=require('./auth-fixture');

test('desktop settings fill their dialog across portrait and short monitors',{timeout:120000},async()=>{
  const host=express().use(express.static(path.resolve(__dirname,'../out')));
  const server=await new Promise(resolve=>{const listening=host.listen(0,'127.0.0.1',()=>resolve(listening));});
  const origin='http://127.0.0.1:'+server.address().port,fixture=await startFixture({port:10721,appOrigin:origin});
  let browser;const errors=[];
  try{
    await fixture.call('signup',{email:'portrait-settings@example.test',nickname:'Monitor vertical',password:'Senha12!'});
    await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});
    const data=(await fixture.call('login',{email:'portrait-settings@example.test',password:'Senha12!'})).data;
    browser=await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio']});
    const context=await browser.newContext({viewport:{width:1080,height:1920},permissions:['microphone','camera']});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await context.addInitScript(({base,data})=>{
      window.TRONO_BACKEND_URL=base;sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));localStorage.setItem('tronoSfxEnabled','0');localStorage.setItem('tronoMusicEnabled','0');
      window.TronoDesktop={version:'0.1.8',clipsSuspended:true,readSession:async()=>null,saveSession:async()=>{},getMediaPermissions:async()=>['audio','video'],resetMediaPermissions:async()=>{window.__permissionResets=(window.__permissionResets||0)+1;},onCapture:()=>{},onCaptureCancel:()=>{},getWindowState:async()=>({fullscreen:false}),onWindowState:()=>{},onUpdateState:()=>{},getUpdateState:async()=>({status:'idle'}),onApplicationAudio:()=>{},configureClips:async()=>({suspended:true})};
    },{base:fixture.base,data});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin);await page.waitForFunction(()=>window.TronoAuth?.ready);await page.evaluate(()=>window.TronoAuth.ready);
    await expect(page.locator('#voiceSettingsBtn')).toBeVisible();
    await page.locator('#voiceSettingsBtn').click();
    await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
    const topics=await page.locator('#desktopSettingsDialog [data-settings-tab]').evaluateAll(tabs=>tabs.map(tab=>tab.dataset.settingsTab));
    await fs.mkdir(path.resolve(__dirname,'../artifacts/settings'),{recursive:true});
    for(const size of [{width:1080,height:1920},{width:720,height:1280},{width:480,height:520},{width:900,height:600},{width:1280,height:720}]){
      await page.setViewportSize(size);
      for(const topic of topics){
        await page.evaluate(topic=>window.TronoDesktopSettings.open(topic),topic);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const layout=await page.locator('#desktopSettingsDialog').evaluate(dialog=>{
          const rect=el=>{const {x,y,width,height}=el.getBoundingClientRect();return {x,y,width,height,right:x+width,bottom:y+height};};
          const panel=dialog.querySelector('#voiceSettingsPanel'),content=dialog.querySelector('.voice-settings-content'),pane=content.querySelector('.voice-settings-pane:not([hidden])');
          return {dialog:rect(dialog),panel:rect(panel),header:rect(panel.querySelector('.voice-settings-head')),close:rect(panel.querySelector('.settings-close')),tabs:rect(panel.querySelector('.voice-settings-tabs')),content:rect(content),pane:rect(pane),maxWidth:getComputedStyle(panel).maxWidth,horizontalOverflow:content.scrollWidth-content.clientWidth,documentOverflow:document.documentElement.scrollWidth-innerWidth};
        });
        const detail=JSON.stringify({size,topic,layout});
        assert(Math.abs(layout.panel.width-(layout.dialog.width-2))<2,'settings must fill the full dialog: '+detail);
        assert(Math.abs(layout.header.right-layout.panel.right)<2,'header must reach the right dialog edge: '+detail);
        assert(layout.panel.right-layout.close.right<28&&layout.close.right<=layout.panel.right,'close button must stay at the right dialog edge: '+detail);
        assert(layout.dialog.x>=0&&layout.dialog.right<=size.width&&layout.dialog.y>=0&&layout.dialog.bottom<=size.height,'dialog must fit the monitor: '+detail);
        assert(layout.horizontalOverflow<=1&&layout.documentOverflow<=1,'content must not require horizontal scrolling: '+detail);
        assert(layout.content.bottom<=layout.panel.bottom+1&&layout.content.height>0,'the content scroller must fit inside the dialog: '+detail);
        if(size.height>=size.width||size.width<=640){
          assert(layout.tabs.height<=61&&Math.abs(layout.content.y-layout.tabs.bottom)<2,'portrait topics must form a compact horizontal strip: '+detail);
          assert(layout.content.right>=layout.panel.right-2,'portrait content must fill the right edge: '+detail);
        }
      }
      await page.evaluate(()=>window.TronoDesktopSettings.open('game'));
      await page.screenshot({path:path.resolve(__dirname,`../artifacts/settings/game-${size.width}x${size.height}.png`)});
    }
    const dialog=page.locator('#desktopSettingsDialog');
    await page.evaluate(()=>{window.__settingsNodes={input:document.getElementById('voiceInputSelect'),form:document.getElementById('profileForm'),files:document.getElementById('profileFiles')};window.TronoDesktopSettings.open('audio');});
    await dialog.locator('[data-settings-tab="audio"]').focus();
    await page.keyboard.press('End');await expect(dialog.locator('[data-settings-tab="notifications"]')).toHaveAttribute('aria-selected','true');
    await page.keyboard.press('Home');await expect(dialog.locator('[data-settings-tab="account"]')).toHaveAttribute('aria-selected','true');
    await page.evaluate(()=>window.TronoSocial.setSettingsTab('files'));
    await expect(dialog.locator('[data-settings-panel="files"]')).toBeVisible();
    await expect(dialog.locator('#profileFiles')).toBeAttached();
    await page.evaluate(()=>window.TronoDesktopSettings.open('privacy'));
    await expect(page.locator('#desktopPermissionsStatus')).toContainText('Microfone: permitido');
    await page.locator('#desktopResetPermissions').click();
    await expect(page.locator('#desktopPermissionsMessage')).toContainText('Permissões redefinidas');
    assert.equal(await page.evaluate(()=>window.__permissionResets),1);
    assert.equal(await page.evaluate(()=>Object.entries(window.__settingsNodes).every(([key,node])=>node===document.getElementById({input:'voiceInputSelect',form:'profileForm',files:'profileFiles'}[key]))),true);
    await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
    await expect(page.locator('#voiceSettingsBtn')).toHaveAttribute('aria-expanded','false');
    await page.locator('#voiceSettingsBtn').click();await expect(dialog).toBeVisible();
    await page.evaluate(()=>window.TronoDesktopSettings.open('account'));
    await page.locator('#settingsRemember').check();
    await expect.poll(()=>page.evaluate(()=>window.TronoAuth.remembered)).toBe(true);
    await expect(page.locator('#settingsRemember')).toBeChecked();
    await page.locator('#settingsRemember').uncheck();
    await expect.poll(()=>page.evaluate(()=>window.TronoAuth.remembered)).toBe(false);
    await page.locator('#voiceSettingsClose').click();await expect(page.locator('#desktopSettingsDialog')).toBeHidden();
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await fixture.stop();await new Promise(resolve=>server.close(resolve));}
});
