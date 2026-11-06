'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { installCanvasCamera } = require('./camera-fixture');

test('two live accounts keep voice identity, captures and peers through repeated signaling outages and can leave during recovery', {timeout: 60000}, async () => {
  const server = await new Promise(r => {
    const s = express().use(express.static(path.resolve('out'))).listen(0, '127.0.0.1', () => r(s));
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const fixture = await startFixture({port:12031,appOrigin:origin});
  let browser;
  const pages = [], errors = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio'] });
    for (const [index,nickname] of ['Retomada Ana','Retomada Beto'].entries()) {
      const email = `recovery-${index}@example.test`, password = 'Senha12!';
      await fixture.call('signup',{email,nickname,password});
      await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});
      const login = (await fixture.call('login',{email,password})).data;
      const context = await browser.newContext({viewport:{width:1440,height:900},permissions:['camera','microphone']});
      await context.addInitScript(({base,login}) => {
        window.TRONO_BACKEND_URL = base;
        sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(login));
        localStorage.setItem('tronoMusicEnabled','0'); localStorage.setItem('tronoNoiseSuppression','0');
        const Socket = window.WebSocket, Peer = window.RTCPeerConnection;
        window.__recoverySockets = []; window.__recoveryEvents = []; window.__recoveryPeers = [];
        window.WebSocket = class extends Socket { constructor(...args) { super(...args); window.__recoverySockets.push(this); } };
        navigator.mediaDevices.getDisplayMedia = async () => {
          const canvas = document.createElement('canvas'); canvas.width=640;canvas.height=360;
          const ctx=canvas.getContext('2d');let n=0;
          const timer=setInterval(()=>{ctx.fillStyle=n++%2?'#806430':'#203c2b';ctx.fillRect(0,0,640,360);},60);
          const stream=canvas.captureStream(15);
          stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer),{once:true});
          return stream;
        };
        window.RTCPeerConnection = class extends Peer {constructor(config) {super({...config,iceServers:[],iceCandidatePoolSize:0});window.__recoveryPeers.push(this);}};
      },{base:fixture.base,login});
      await context.addInitScript(installCanvasCamera);
      await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      const page = await context.newPage(); pages.push(page); page.setDefaultTimeout(7000);
      page.on('pageerror',error => errors.push(error.message));
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      await page.getByRole('button',{name:'Entrar na voz de Geral',exact:true}).click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await page.evaluate(() => window.TronoNetwork.onMessage(m => { if (m.type === 'connection') window.__recoveryEvents.push(m); }));
    }
    const [ana,beto] = pages;
    await expect.poll(() => ana.evaluate(() => window.TronoCallStage.getSnapshot().participants.length)).toBe(2);
    await ana.getByRole('region',{name:'Chamada da Corte',exact:true}).getByRole('button',{name:'Ligar câmera',exact:true}).click();
    await expect.poll(() => ana.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
    await ana.evaluate(() => window.TronoSocial.startScreenShare());
    await expect.poll(() => ana.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
    await ana.evaluate(() => {
      window.__keptPeers = window.__recoveryPeers.filter(p=>p.connectionState !== 'closed');
      window.__keptScreen = window.TronoSocial.getLocalDisplayStream();
      window.__keptMic = window.TronoSocial.getLocalAudioTrack();
      window.__keptId = window.TronoNetwork.clientId;
      window.__keptCamera = window.TronoCallStage.getSnapshot().participants.find(p=>p.self).cameraStream;
    });
    for (let cycle = 1; cycle <= 3; cycle++) {
      await ana.evaluate(() => window.__recoverySockets.at(-1).close(4000,'fixture transient loss'));
      await expect.poll(() => ana.evaluate(() => window.__recoveryEvents.filter(m => m.resumed).length)).toBe(cycle);
      assert(await ana.evaluate(() => window.TronoSocial.voiceJoined && window.TronoNetwork.clientId === window.__keptId &&
        window.TronoSocial.getLocalAudioTrack() === window.__keptMic && window.__keptMic.readyState === 'live' &&
        window.TronoCallStage.getSnapshot().participants.find(p=>p.self).cameraStream === window.__keptCamera &&
        window.__keptCamera.getTracks().every(t=>t.readyState === 'live') &&
        window.TronoSocial.getLocalDisplayStream() === window.__keptScreen && window.__keptScreen.getTracks().every(t=>t.readyState === 'live') &&
        window.__keptPeers.length > 0 && window.__keptPeers.every(p=>p.connectionState !== 'closed' && window.__recoveryPeers.includes(p))));
      assert.equal(await beto.evaluate(() => window.TronoSocial.voiceJoined),true);
      await expect.poll(() => beto.evaluate(() => window.TronoCallStage.getSnapshot().participants.length)).toBe(2);
    }
    await ana.evaluate(() => {
      window.__recoverySockets.at(-1).close(4000,'fixture leave during recovery');
    });
    await expect.poll(() => ana.evaluate(() => window.__recoveryEvents.filter(m => m.recovering).length)).toBe(4);
    await ana.evaluate(() => window.TronoSocial.leaveVoice());
    await expect.poll(() => ana.evaluate(() => window.__recoveryEvents.filter(m => m.resumed).length)).toBe(4);
    assert.equal(await ana.evaluate(() => window.TronoSocial.voiceJoined),false);
    assert.equal(await ana.evaluate(() => window.__keptMic.readyState),'ended');
    await expect.poll(() => beto.evaluate(() => window.TronoCallStage.getSnapshot().participants.length)).toBe(1);
    assert.equal(await beto.evaluate(() => window.TronoSocial.voiceJoined),true);
    assert.deepEqual(errors,[]);
  } finally {
    await browser?.close(); await fixture.stop(); await new Promise(r => server.close(r));
  }
});
