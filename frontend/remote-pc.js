'use strict';
window.TronoRemotePc=(()=>{
 const $=id=>document.getElementById(id),pending=new Map();let current=null,roster=[],supported=false,capability={host:false},dialog,button,remoteGeneration=0;

 function request(action,payload={},timeout=12000){const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('O compartilhamento não respondeu. Tente novamente.'));},timeout);pending.set(requestId,{resolve,reject,timer});if(!window.TronoNetwork.remotePc(action,{...payload,requestId})){clearTimeout(timer);pending.delete(requestId);reject(Error('Servidor desconectado.'));}});}
 function active(s){return current===s&&!s.closed;}
 function status(text){$('remotePcStatus').textContent=text;}
 function notify(s,text){if(active(s)){s.message=text;status(text);}}
 function send(s,type,data={}){if(s.control?.readyState==='open'&&s.control.bufferedAmount<16384){s.control.send(JSON.stringify({type,...data}));return true;}return false;}
 function render(){
  if(!button)return;const voice=window.TronoSocial.voiceJoined;button.dataset.active=String(!!current);button.title=current?'Abrir compartilhamento de PC ativo':'Compartilhar PC · Beta';button.setAttribute('aria-label',button.title);button.dataset.workspaceLabel=current?'PC ativo · Beta':'PC · Beta';
  $('remotePcSetup').hidden=!!current;$('remotePcSession').hidden=!current;$('remotePcAccept').hidden=current?.role!=='invited';$('remotePcStart').hidden=!!current;$('remotePcEnd').hidden=!current;
  $('remotePcHostNotice').hidden=capability.host;$('remotePcVoiceNotice').hidden=voice;$('remotePcStart').disabled=!voice||!supported||!capability.host||!roster.some(p=>p.id!==window.TronoNetwork.clientId&&p.accountId);
  $('remotePcSupport').hidden=supported;const target=$('remotePcTarget'),selected=target.value;target.replaceChildren();for(const p of roster)if(p.id!==window.TronoNetwork.clientId&&p.accountId)target.append(new Option(p.name,p.id));if(!target.options.length)target.append(new Option('Outra pessoa precisa entrar na voz',''));if([...target.options].some(o=>o.value===selected))target.value=selected;
  const viewer=current?.role==='viewer',host=current?.role==='host';$('remotePcRequestControl').hidden=!viewer;$('remotePcRequestControl').disabled=!!current?.controlling||current?.control?.readyState!=='open';$('remotePcRevoke').hidden=!host||!current?.token;$('remotePcFullscreen').hidden=!viewer;
  $('remotePcVideo').hidden=current?.role==='invited';
  $('remotePcPeer').textContent=current?(current.role==='invited'?current.peerName+' convidou você':host?'Compartilhando com '+current.peerName:'PC de '+current.peerName):'';
  $('remotePcHint').textContent=host?'Você continua na chamada. Ctrl + Alt + Shift + F12 encerra o compartilhamento.':viewer?(current.controlling?'Controle autorizado. Clique no vídeo para usar mouse e teclado. Esc libera o teclado; a chamada continua.':'Você está assistindo. Peça autorização para controlar o PC.'):'Aceite para assistir. O controle depende de autorização separada.';
  if(current?.message)status(current.message);
 }
 function open(){if(!dialog.open)dialog.showModal();render();}
 function close(){if(current?.role==='viewer'||current?.role==='invited')void stop();dialog.close();}
 async function stop({tell=true}={}){
  const s=current;if(!s)return;current=null;s.closed=true;remoteGeneration++;clearInterval(s.timer);clearTimeout(s.connectTimer);clearTimeout(s.controlTimer);
  if(tell&&s.id)void request('end',{sessionId:s.id},4000).catch(()=>{});
  try{s.control?.close();s.pointer?.close();s.pc?.close();}catch{}s.stream?.getTracks().forEach(t=>t.stop());s.remoteStream?.getTracks().forEach(t=>t.stop());if(document.fullscreenElement===$('remotePcVideo'))void document.exitFullscreen().catch(()=>{});$('remotePcVideo').srcObject=null;
  if(s.role==='host')await window.TronoDesktop?.stopRemote().catch(()=>{});
  render();status('Compartilhamento encerrado. Sua chamada continua conectada.');
 }
 function heartbeat(s){s.timer=setInterval(()=>{
  if(!active(s))return;if(!window.TronoSocial.voiceJoined||!window.TronoNetwork.connected){void stop();return;}
  if(s.id&&Date.now()-(s.lastServerPulse||0)>3500){s.lastServerPulse=Date.now();void request('heartbeat',{sessionId:s.id},5000).catch(()=>{if(active(s))void stop();});}
  if(s.role==='viewer')send(s,'pulse');
  if(s.role==='host'&&s.token&&Date.now()-(s.lastInput||0)>3500)void revoke(s);
 },1000);}
 async function start(){
  if(current)return;const peer=roster.find(p=>p.id===$('remotePcTarget').value);if(!peer)return;
  const s={role:'host',peerName:peer.name,id:null,closed:false,message:'Escolha o monitor para compartilhar…'};current=s;render();const generation=++remoteGeneration;
  try{
   const permit=await window.TronoDesktop.prepareRemoteCapture(peer.name);if(!active(s))return;if(!permit.allowed){await stop();return;}
   const audio=$('remotePcAudio').checked;
   const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:60,max:60}},audio:audio?{echoCancellation:false,noiseSuppression:false,autoGainControl:false}:false,systemAudio:'exclude',selfBrowserSurface:'exclude'});
   if(!active(s)||generation!==remoteGeneration){stream.getTracks().forEach(t=>t.stop());return;}
   s.stream=stream;for(const t of stream.getVideoTracks()){t.contentHint='motion';t.addEventListener('ended',()=>{if(active(s))void stop();},{once:true});}
   $('remotePcVideo').muted=true;$('remotePcVideo').srcObject=stream;
   const data=await request('invite',{targetId:peer.id});s.id=data.sessionId;if(!active(s)){void request('end',{sessionId:s.id}).catch(()=>{});return;}
   heartbeat(s);notify(s,'Aguardando '+peer.name+' aceitar o convite…');
  }catch(err){if(active(s)){await stop();status(err.name==='NotAllowedError'?'Captura cancelada.':err.message);}}
 }
 async function connect(s){
  if(!active(s)||s.pc)return;notify(s,'Conectando PC…');
  const config=await request('ice',{sessionId:s.id});if(!active(s))return;
  const pc=new RTCPeerConnection({iceServers:config.iceServers||[],bundlePolicy:'max-bundle'});s.pc=pc;s.candidates=s.candidates||[];
  pc.onicecandidate=e=>{if(active(s))void request('signal',{sessionId:s.id,signal:{type:'candidate',candidate:e.candidate?.toJSON()||null}}).catch(()=>{if(active(s))void stop();});};
  pc.onconnectionstatechange=()=>{if(!active(s))return;if(pc.connectionState==='connected'){clearTimeout(s.connectTimer);notify(s,'PC conectado. Sua chamada permanece ativa.');render();}else if(pc.connectionState==='failed'||pc.connectionState==='closed')void stop();};
  pc.ontrack=e=>{if(!active(s))return;try{if(e.track.kind==='video'&&'jitterBufferTarget' in e.receiver)e.receiver.jitterBufferTarget=0;}catch{}s.remoteStream=s.remoteStream||new MediaStream();if(!s.remoteStream.getTracks().some(t=>t.id===e.track.id))s.remoteStream.addTrack(e.track);const video=$('remotePcVideo');video.muted=false;video.srcObject=s.remoteStream;void video.play().catch(()=>notify(s,'Clique no vídeo para liberar o áudio.'));};
  pc.ondatachannel=e=>bindChannel(s,e.channel);
  s.connectTimer=setTimeout(()=>{if(active(s)){void stop();status('Não foi possível conectar os PCs. A rede pode precisar de TURN disponível.');}},25000);
  if(s.role==='host'){
   bindChannel(s,pc.createDataChannel('remote-control',{ordered:true}));bindChannel(s,pc.createDataChannel('remote-pointer',{ordered:false,maxRetransmits:0}));
   for(const t of s.stream.getTracks()){const sender=pc.addTrack(t,s.stream);if(t.kind==='video'){
    const transceiver=pc.getTransceivers().find(t=>t.sender===sender),codecs=RTCRtpSender.getCapabilities?.('video')?.codecs||[],h264=codecs.filter(c=>c.mimeType.toLowerCase()==='video/h264');if(h264.length)transceiver?.setCodecPreferences?.([...h264,...codecs.filter(c=>!h264.includes(c))]);
   }}
   await pc.setLocalDescription(await pc.createOffer());if(!active(s))return;
   for(const sender of pc.getSenders())try{const p=sender.getParameters();if(p.encodings?.length){p.encodings[0].maxBitrate=sender.track.kind==='video'?15000000:192000;if(sender.track.kind==='video'){p.encodings[0].maxFramerate=60;const source=sender.track.getSettings();p.encodings[0].scaleResolutionDownBy=Math.max(1,(source.width||1920)/1920,(source.height||1080)/1080);p.degradationPreference='maintain-framerate';}await sender.setParameters(p);}}catch{}
   await request('signal',{sessionId:s.id,signal:{type:'offer',sdp:pc.localDescription.sdp}});
  }
  const queued=s.signals||[];s.signals=[];for(const p of queued)await signal(s,p);
 }
 async function signal(s,p){
  if(!active(s))return;if(!s.pc){(s.signals||(s.signals=[])).push(p);return;}
  const pc=s.pc;
  if(p.type==='candidate'){if(pc.remoteDescription)await pc.addIceCandidate(p.candidate);else s.candidates.push(p.candidate);return;}
  if(p.type==='offer'&&s.role==='viewer'){await pc.setRemoteDescription({type:'offer',sdp:p.sdp});if(!active(s))return;await pc.setLocalDescription(await pc.createAnswer());await request('signal',{sessionId:s.id,signal:{type:'answer',sdp:pc.localDescription.sdp}});}
  else if(p.type==='answer'&&s.role==='host')await pc.setRemoteDescription({type:'answer',sdp:p.sdp});else throw Error('Sinal de PC inesperado.');
  for(const c of s.candidates.splice(0))await pc.addIceCandidate(c);
 }
 function bindChannel(s,channel){
  if(!['remote-control','remote-pointer'].includes(channel.label)){channel.close();return;}
  if(channel.label==='remote-control'){if(s.control){channel.close();return;}s.control=channel;}else{if(s.pointer){channel.close();return;}s.pointer=channel;}
  channel.onopen=()=>{if(active(s)){render();if(s.role==='viewer')send(s,'pulse');}};
  channel.onclose=()=>{if(active(s))void stop();};
  channel.onmessage=async e=>{
   if(!active(s)||typeof e.data!=='string'||e.data.length>1024)return;let event;try{event=JSON.parse(e.data);}catch{return;}
   if(s.role==='viewer'){
    if(channel===s.control&&event.type==='control'){s.controlling=event.allowed===true;render();notify(s,event.wait?'Aguarde alguns segundos antes de pedir controle novamente.':s.controlling?'Controle autorizado. Clique na imagem para controlar.':'Somente visualização.');}return;
   }
   if(event.type==='request-control'&&channel===s.control&&!s.asking&&!s.token){
    if(Date.now()-(s.lastAsk||0)<10000){send(s,'control',{allowed:false,wait:true});return;}s.lastAsk=Date.now();s.asking=true;
    try{const result=await window.TronoDesktop.allowRemoteControl();if(!active(s)){await window.TronoDesktop.revokeRemoteControl();return;}s.token=result.allowed?result.token:null;s.lastInput=Date.now();send(s,'control',{allowed:!!s.token});render();}
    catch{send(s,'control',{allowed:false});}finally{s.asking=false;}return;
   }
   if(event.type==='pulse'&&channel===s.control){s.lastInput=Date.now();if(s.token)window.TronoDesktop.remoteInput(s.token,{type:'pulse'});return;}
   if(event.type==='move'){if(!Number.isSafeInteger(event.seq)||event.seq<=(s.lastPointerSequence||0))return;s.lastPointerSequence=event.seq;}
   if(s.token&&event.type==='button'&&event.down&&Number.isFinite(event.x)&&Number.isFinite(event.y)){if(Number.isSafeInteger(event.seq))s.lastPointerSequence=Math.max(s.lastPointerSequence||0,event.seq);window.TronoDesktop.remoteInput(s.token,{type:'move',x:event.x,y:event.y});}
   if(s.token&&(['key','button','wheel','release'].includes(event.type)&&channel===s.control||event.type==='move'&&channel===s.pointer))window.TronoDesktop.remoteInput(s.token,event);
  };
 }
 async function revoke(s){if(!active(s))return;s.token=null;send(s,'control',{allowed:false});await window.TronoDesktop.revokeRemoteControl();render();}
 function pointer(s,e){const v=$('remotePcVideo'),r=v.getBoundingClientRect(),w=v.videoWidth,h=v.videoHeight;if(!w||!h)return null;const scale=Math.min(r.width/w,r.height/h),width=w*scale,height=h*scale,x=(e.clientX-r.x-(r.width-width)/2)/width,y=(e.clientY-r.y-(r.height-height)/2)/height;return x>=0&&x<=1&&y>=0&&y<=1?{type:'move',x,y}:null;}
 function inputReady(){return current?.role==='viewer'&&current.controlling&&current.control?.readyState==='open';}
 function bindInput(){
  const v=$('remotePcVideo');let lastMove=0;
  v.onpointermove=e=>{const s=current;if(!inputReady()||Date.now()-lastMove<15)return;const p=pointer(s,e);if(p)p.seq=s.pointerSequence=(s.pointerSequence||0)+1;if(p&&s.pointer?.readyState==='open'&&s.pointer.bufferedAmount<4096){s.pointer.send(JSON.stringify(p));lastMove=Date.now();}};
  v.onpointerdown=e=>{void v.play().catch(()=>{});if(!inputReady()||e.button>2)return;const s=current,p=pointer(s,e);if(!p)return;p.seq=s.pointerSequence=(s.pointerSequence||0)+1;v.focus();s.pointer?.send(JSON.stringify(p));send(s,'button',{button:e.button,down:true,x:p.x,y:p.y,seq:p.seq});v.setPointerCapture(e.pointerId);e.preventDefault();};
  v.onpointerup=e=>{if(inputReady()&&e.button<=2){send(current,'button',{button:e.button,down:false});e.preventDefault();}};
  v.onpointercancel=()=>{if(inputReady())send(current,'release');};v.oncontextmenu=e=>{if(inputReady())e.preventDefault();};
  v.onwheel=e=>{if(inputReady()){send(current,'wheel',{delta:-Math.sign(e.deltaY)*120});e.preventDefault();}};
  v.onkeydown=e=>{if(!inputReady())return;if(e.code==='Escape'){send(current,'release');v.blur();e.preventDefault();e.stopPropagation();return;}if(!e.repeat)send(current,'key',{code:e.code,down:true});e.preventDefault();};
  v.onkeyup=e=>{if(inputReady()){send(current,'key',{code:e.code,down:false});e.preventDefault();}};
  v.onblur=()=>{if(inputReady())send(current,'release');};window.addEventListener('blur',()=>{if(inputReady())send(current,'release');});
 }
 window.addEventListener('DOMContentLoaded',async()=>{
  button=$('remotePcBtn');dialog=$('remotePcDialog');button.onclick=open;$('remotePcClose').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});$('remotePcStart').onclick=()=>void start();$('remotePcEnd').onclick=()=>void stop();
  $('remotePcAccept').onclick=async()=>{const s=current;if(!s||s.role!=='invited')return;try{await request('accept',{sessionId:s.id});}catch(err){await stop();status(err.message);}};
  $('remotePcRequestControl').onclick=()=>{if(current&&send(current,'request-control')){$('remotePcRequestControl').disabled=true;notify(current,'Aguardando autorização do dono do PC…');}};
  $('remotePcRevoke').onclick=()=>{if(current)void revoke(current);};$('remotePcFullscreen').onclick=()=>void $('remotePcVideo').requestFullscreen().catch(()=>{});bindInput();
  if(window.TronoDesktop?.remoteCapability)try{capability=await window.TronoDesktop.remoteCapability();}catch{}
  $('remotePcAudio').disabled=!capability.audio;render();
 });
 window.TronoNetwork.onMessage(m=>{
  if(m.type==='welcome'){supported=!!m.features?.remotePc;render();}
  if(m.type==='remote-response'){const p=pending.get(m.requestId);if(p){pending.delete(m.requestId);clearTimeout(p.timer);if(m.ok)p.resolve(m.data);else p.reject(Error(m.error?.message||'Não foi possível compartilhar o PC.'));}return;}
  if(m.type==='voice-roster'){roster=m.players.filter(p=>p.joined!==false);render();}
  if(m.type==='connection'&&!m.connected){supported=false;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Conexão encerrada.'));}pending.clear();void stop({tell:false});}
  if(m.type==='remote-invite'){
   if(current){void request('end',{sessionId:m.sessionId}).catch(()=>{});return;}
   current={role:'invited',id:m.sessionId,peerName:m.hostName,closed:false,message:'Convite para assistir ao PC. Aceite somente se esperava esse convite.'};heartbeat(current);open();
  }
  if(m.type==='remote-ready'){
   const s=current;if(!s||s.id!==m.sessionId)return;s.role=m.role;s.peerName=m.peerName;render();s.signalChain=Promise.resolve();void connect(s).catch(err=>{if(active(s)){void stop();status(err.message);}});
  }
  if(m.type==='remote-signal'){
   const s=current;if(s?.id!==m.sessionId)return;s.signalChain=(s.signalChain||Promise.resolve()).then(()=>signal(s,m.signal)).catch(err=>{if(active(s)){void stop();status(err.message);}});
  }
  if(m.type==='remote-ended'&&current?.id===m.sessionId)void stop({tell:false});
 });
 window.TronoDesktop?.onRemote?.(event=>{if(current?.role!=='host')return;if(event.type==='ended')void stop();else if(event.type==='stopped'){current.token=null;send(current,'control',{allowed:false});render();}});
 window.addEventListener('trono-call-change',()=>{render();if(current&&!window.TronoSocial.voiceJoined)void stop();});
 window.addEventListener('trono-auth-change',()=>{if(!window.TronoAuth.user)void stop();});window.addEventListener('pagehide',()=>{if(current)void stop();});
 return {open,stop,get active(){return !!current;},get state(){return current?{role:current.role,sessionId:current.id,controlling:!!current.controlling,connected:current.pc?.connectionState}:null;}};
})();
