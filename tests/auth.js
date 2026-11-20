'use strict';
const assert=require('assert/strict'),{WebSocket}=require('ws'),{startFixture}=require('./auth-fixture');
const {passwordChecks,validPassword,createAuth}=require('../server/auth.ts');
function connect(base){return new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http','ws')+'/ws'),queue=[],pending=[];ws.on('error',reject);ws.on('message',raw=>{const m=JSON.parse(raw);const i=pending.findIndex(w=>w.pred(m));if(i<0)queue.push(m);else{const w=pending.splice(i,1)[0];clearTimeout(w.timer);w.resolve(m);}});ws.on('open',()=>resolve({ws,wait(pred){const i=queue.findIndex(pred);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={pred,resolve,timer:setTimeout(()=>reject(new Error('WebSocket timeout')),3000)};pending.push(w);});}}));});}
(async()=>{
 const fixture=await startFixture();let sock;
 try{
  const unconfigured=createAuth({env:{}});assert.equal(unconfigured.required,true);assert.equal(unconfigured.configured,false);await assert.rejects(()=>unconfigured.identity('invalid'),e=>e.code==='AUTH_UNAVAILABLE');console.log('✓ sem configuração, autenticação fica obrigatória e falha de forma fechada');
  assert(validPassword('Senha12!'));for(const p of ['Senha1!','SENHA12!','senha12!','Senha!!!','Senha123','Senha12 ','Senha12☃','A1!a'+'x'.repeat(69)])assert(!validPassword(p),p);assert.equal(passwordChecks('Senha12!').symbol,true);console.log('✓ política de senha: tamanho, quatro categorias, espaço não é símbolo e limite bcrypt');
  let r=await fixture.call('signup',{email:'ana@example.test',password:'fraca',nickname:'Ana'});assert.equal(r.status,400);assert.equal(r.data.error.code,'WEAK_PASSWORD');assert.equal(fixture.users.size,0);console.log('✓ senha fraca bloqueada pelo backend');
  r=await fixture.call('signup',{email:'ana@example.test',password:'Senha12!',nickname:'Ana'});assert.equal(r.status,200);assert(!r.data.session);console.log('✓ cadastro aguarda confirmação');
  r=await fixture.call('login',{email:'ana@example.test',password:'Senha12!'});assert.equal(r.status,403);assert.equal(r.data.error.code,'EMAIL_NOT_CONFIRMED');
  let hash=[...fixture.links].find(([,v])=>v.type==='signup')[0];r=await fixture.call('verify',{token_hash:hash,type:'signup'});assert.equal(r.status,200);assert.match(r.data.message,/confirmado/);console.log('✓ confirmação de e-mail');
  r=await fixture.call('login',{email:'ana@example.test',password:'incorreta'});assert.equal(r.status,401);
  r=await fixture.call('login',{email:'ana@example.test',password:'Senha12!'});assert.equal(r.status,200);let session=r.data.session;assert.equal(r.data.user.nickname,'Ana');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),fixture.appOrigin);console.log('✓ login válido e identidade obtida do perfil, sem confiar em metadados editáveis');
  r=await fixture.call('login',{email:'ana@example.test',password:'Senha12!'},null,'https://origem-indevida.test');assert.equal(r.status,403);console.log('✓ origem não autorizada bloqueada');
  sock=await connect(fixture.base);await sock.wait(m=>m.type==='welcome');
  sock.ws.send(JSON.stringify({type:'sfu-request',action:'status',requestId:'public-status'}));assert.equal((await sock.wait(m=>m.type==='sfu-response'&&m.requestId==='public-status')).ok,true);console.log('✓ consulta pública de status não interrompe o login');
  for(const type of ['join-room','chat-message','voice-state','voice-signal','sfu-request']){sock.ws.send(JSON.stringify({type,roomId:'chat-livre',name:'Falso'}));const denied=await sock.wait(m=>m.type==='error');assert.equal(denied.code,'AUTH_REQUIRED');}console.log('✓ sala, chat, voz e SFU recusam acesso sem autenticação');
  sock.ws.send(JSON.stringify({type:'authenticate',access_token:session.access_token.replace(/.$/,'x'),requestId:'bad'}));assert.equal((await sock.wait(m=>m.type==='auth-result')).ok,false);console.log('✓ token adulterado recusado');
  sock.ws.send(JSON.stringify({type:'authenticate',access_token:session.access_token,requestId:'good'}));assert.equal((await sock.wait(m=>m.type==='auth-result')).ok,true);
  sock.ws.send(JSON.stringify({type:'join-room',roomId:'chat-livre',name:'OUTRA_PESSOA'}));const joined=await sock.wait(m=>m.type==='joined-room');assert.equal(joined.me.name,'Ana');console.log('✓ nome enviado pelo cliente não substitui o apelido da conta');
  sock.ws.send(JSON.stringify({type:'chat-message',text:'Mensagem autenticada'}));assert.equal((await sock.wait(m=>m.type==='chat-message')).message.name,'Ana');
  r=await fixture.call('refresh',{refresh_token:session.refresh_token});assert.equal(r.status,200);session=r.data.session;console.log('✓ renovação de sessão');
  r=await fixture.call('recover',{email:'naoexiste@example.test'});const generic=r.data.message;assert.equal(r.status,200);
  r=await fixture.call('recover',{email:'ana@example.test'});assert.equal(r.data.message,generic);console.log('✓ recuperação não informa se o e-mail tem conta');
  r=await fixture.call('verify',{token_hash:'expired',type:'recovery'});assert.equal(r.status,401);
  hash=[...fixture.links].find(([,v])=>v.type==='recovery')[0];r=await fixture.call('verify',{token_hash:hash,type:'recovery'});assert.equal(r.status,200);const recovery=r.data.recovery_token;
  r=await fixture.call('verify',{token_hash:hash,type:'recovery'});assert.equal(r.status,401);console.log('✓ link de recuperação inválido e reutilizado bloqueados');
  r=await fixture.call('reset',{password:'fraca'},recovery);assert.equal(r.status,400);
  r=await fixture.call('reset',{password:'NovaSenha45!'},recovery);assert.equal(r.status,200);await sock.wait(m=>m.type==='error'&&m.code==='AUTH_REQUIRED');console.log('✓ redefinição valida a senha e encerra conexão antiga');
  r=await fixture.call('refresh',{refresh_token:session.refresh_token});assert.equal(r.status,401);
  r=await fixture.call('login',{email:'ana@example.test',password:'Senha12!'});assert.equal(r.status,401);
  r=await fixture.call('login',{email:'ana@example.test',password:'NovaSenha45!'});assert.equal(r.status,200);session=r.data.session;
  r=await fixture.call('logout',{},session.access_token);assert.equal(r.status,200);r=await fixture.call('refresh',{refresh_token:session.refresh_token});assert.equal(r.status,401);console.log('✓ senha anterior rejeitada, senha nova aceita e logout revoga a sessão');
  for(let i=0;i<11;i++)r=await fixture.call('login',{email:'x@example.test',password:'x'});assert.equal(r.status,429);console.log('✓ excesso de tentativas limitado');
  console.log('PASS — autenticação HTTP/WebSocket (provedor de teste)');
 }finally{sock?.ws.close();await fixture.stop();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
