'use strict';
window.TronoNetwork = (()=>{
  const CLIENT_VERSION='0.9.0-alpha';
  const DEFAULT_BACKEND_HTTP='https://a-lei-do-trono-server.onrender.com';
  const normalizeHttp=url=>String(url||'').replace(/\/+$/,'');
  const isLocal=['localhost','127.0.0.1','::1'].includes(location.hostname);
  const BACKEND_HTTP=normalizeHttp(window.TRONO_BACKEND_URL||(isLocal?`http://${location.hostname}:10000`:DEFAULT_BACKEND_HTTP));
  const BACKEND_WS=`${BACKEND_HTTP.replace(/^http:/,'ws:').replace(/^https:/,'wss:')}/ws`;
  let socket=null,connected=false,clientId=null,currentRoom=null,primaryRoom=null,gameRoom=null,independentGameVoice=false,independentTextChannels=false,gameActivitySupported=false,connectPromise=null,authenticatedToken=null;
  let authenticatedGuest=null;
  const listeners=new Set(),pendingSfu=new Map(),pendingNameChecks=new Map(),pendingAuth=new Map(),pendingGuest=new Map();
  const emit=msg=>listeners.forEach(fn=>{try{fn(msg);}catch(err){console.warn('[TronoNetwork]',err);}});
  const makeId=()=>globalThis.crypto?.randomUUID?.()||`r${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  function rejectPending(reason='Conexão encerrada.'){
    for(const [id,p] of pendingSfu){clearTimeout(p.timer);p.reject(Object.assign(new Error(reason),{code:'NETWORK_CLOSED'}));pendingSfu.delete(id);}
    for(const [id,p] of pendingNameChecks){clearTimeout(p.timer);p.reject(Object.assign(new Error(reason),{code:'NETWORK_CLOSED'}));pendingNameChecks.delete(id);}
    for(const [id,p] of pendingAuth){clearTimeout(p.timer);p.reject(Object.assign(new Error(reason),{code:'NETWORK_CLOSED'}));pendingAuth.delete(id);}
    for(const [id,p] of pendingGuest){clearTimeout(p.timer);p.reject(Object.assign(new Error(reason),{code:'NETWORK_CLOSED'}));pendingGuest.delete(id);}
  }
  function connect(){
    if(connected&&socket?.readyState===WebSocket.OPEN)return Promise.resolve(true);
    if(connectPromise)return connectPromise;
    connectPromise=new Promise(resolve=>{
      let settled=false;const finish=v=>{if(!settled){settled=true;resolve(v);}};
      try{
        const connection=new WebSocket(BACKEND_WS);socket=connection;
        const timer=setTimeout(()=>finish(false),15000);
        socket.onopen=()=>{if(socket!==connection)return;clearTimeout(timer);connected=true;emit({type:'connection',connected:true});finish(true);};
        socket.onmessage=e=>{
          if(socket!==connection)return;
          try{
            const msg=JSON.parse(e.data);
            if(msg.type==='welcome'){
              clientId=msg.clientId;independentTextChannels=!!msg.features?.independentTextChannels;independentGameVoice=!!msg.features?.independentGameVoice;gameActivitySupported=!!msg.features?.gameActivity;
              if(msg.serverVersion&&msg.serverVersion!==CLIENT_VERSION)emit({type:'version-mismatch',clientVersion:CLIENT_VERSION,serverVersion:msg.serverVersion});
            }
            if(msg.type==='sfu-response'&&msg.requestId&&pendingSfu.has(msg.requestId)){
              const p=pendingSfu.get(msg.requestId);pendingSfu.delete(msg.requestId);clearTimeout(p.timer);
              if(msg.ok)p.resolve(msg.data);else p.reject(Object.assign(new Error(msg.error?.message||'Falha na operação SFU.'),{code:msg.error?.code||'SFU_ERROR',detail:msg.error}));
            }
            if(msg.type==='name-check-result'&&msg.requestId&&pendingNameChecks.has(msg.requestId)){
              const p=pendingNameChecks.get(msg.requestId);pendingNameChecks.delete(msg.requestId);clearTimeout(p.timer);p.resolve(msg);
            }
            if(msg.type==='auth-result'&&pendingAuth.has(msg.requestId)){
              const p=pendingAuth.get(msg.requestId);pendingAuth.delete(msg.requestId);clearTimeout(p.timer);
              if(msg.ok){authenticatedToken=p.token;authenticatedGuest=null;p.resolve(msg.user);}else{authenticatedToken=null;p.reject(Object.assign(new Error(msg.error?.message||'Entre novamente na sua conta.'),{code:msg.error?.code||'AUTH_REQUIRED'}));}
            }
            if(msg.type==='guest-result'&&pendingGuest.has(msg.requestId)){const p=pendingGuest.get(msg.requestId);pendingGuest.delete(msg.requestId);clearTimeout(p.timer);if(msg.ok){authenticatedGuest=msg.guest;authenticatedToken=null;p.resolve(msg.guest);}else p.reject(Object.assign(new Error(msg.error?.message||'Não foi possível entrar como convidado.'),{code:msg.error?.code||'GUEST_FAILED'}));}
            if(msg.type==='joined-room'){primaryRoom=msg.room?.id||null;currentRoom=primaryRoom;if(msg.room?.kind==='game')gameRoom=primaryRoom;}
            if(msg.type==='joined-game-room'){gameRoom=msg.room.id;primaryRoom=msg.primaryRoomId||null;currentRoom=msg.chatRoomId||null;}
            if(msg.type==='left-game-room'){gameRoom=null;primaryRoom=msg.primaryRoomId||null;currentRoom=msg.chatRoomId||null;}
            if(msg.type==='left-voice-room'){primaryRoom=null;currentRoom=msg.chatRoomId||null;}
            if(msg.type==='voice-room-attached'){primaryRoom=msg.room.id;if(!currentRoom)currentRoom=primaryRoom;}
            if(msg.type==='joined-text-channel'){currentRoom=msg.room?.id||null;primaryRoom=msg.primaryRoomId||null;}
            if(msg.type==='channel-deleted'&&msg.roomId===primaryRoom)primaryRoom=null;
            if(msg.type==='channel-deleted'&&msg.roomId===currentRoom)currentRoom=null;
            emit(msg);
          }catch(err){console.warn('[TronoNetwork] mensagem inválida',err);}
        };
        socket.onclose=e=>{clearTimeout(timer);if(socket!==connection){finish(false);return;}connected=false;gameActivitySupported=false;authenticatedToken=null;authenticatedGuest=null;socket=null;connectPromise=null;rejectPending();emit({type:'connection',connected:false,code:e.code});finish(false);};
        socket.onerror=()=>{};
      }catch{connectPromise=null;finish(false);}
    }).finally(()=>{if(!connected)connectPromise=null;});
    return connectPromise;
  }
  function send(type,payload={}){if(!connected||socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify({type,...payload}));return true;}
  let authChain=Promise.resolve();
  function authenticate(token){const task=authChain.catch(()=>{}).then(()=>authenticateNow(token));authChain=task;return task;}
  async function authenticateNow(token){
    if(!token)throw Object.assign(new Error('Entre na sua conta para continuar.'),{code:'AUTH_REQUIRED'});
    if(!connected)await connect();
    if(!connected)throw new Error('Servidor indisponível. Tente novamente.');
    if(authenticatedToken===token)return window.TronoAuth?.user;
    const existing=[...pendingAuth.values()].find(p=>p.token===token);if(existing)return existing.promise;
    const requestId=makeId();let pending;
    const promise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pendingAuth.delete(requestId);reject(new Error('Tempo limite ao entrar na conta.'));},18000);
      pending={resolve,reject,timer,token,promise:null};pendingAuth.set(requestId,pending);
      if(!send('authenticate',{requestId,access_token:token})){clearTimeout(timer);pendingAuth.delete(requestId);reject(new Error('Conexão interrompida.'));}
    });pending.promise=promise;return promise;
  }
  async function ensureAuthenticated(){
    if(!window.TronoAuth)return true; // Only used by isolated older fixtures.
    const token=await window.TronoAuth.getAccessToken();
    if(!token){window.TronoAuth.open('login');return false;}
    try{await authenticate(token);return true;}catch(err){if(['AUTH_REQUIRED','AUTH_EXPIRED','INVALID_CREDENTIALS'].includes(err.code))window.TronoAuth.expire();throw err;}
  }
  function authenticateGuest(name,ticket){const task=authChain.catch(()=>{}).then(async()=>{if(!connected)await connect();if(!connected)throw new Error('Servidor indisponível.');if(authenticatedGuest&&authenticatedGuest.ticket===ticket&&authenticatedGuest.nickname===name)return authenticatedGuest;const requestId=makeId();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pendingGuest.delete(requestId);reject(new Error('Tempo limite ao entrar como convidado.'));},15000);pendingGuest.set(requestId,{resolve,reject,timer});send('guest-authenticate',{requestId,name,ticket});});});authChain=task;return task;}
  async function ensureGameIdentity(name){if(window.TronoAuth&&!window.TronoAuth.user){return window.TronoAuth.ensureGuest(name);}return ensureAuthenticated();}
  function disconnect(){const previous=socket;socket=null;connected=false;gameActivitySupported=false;authenticatedToken=null;authenticatedGuest=null;currentRoom=null;primaryRoom=null;gameRoom=null;connectPromise=null;rejectPending();previous?.close(1000,'Saída da conta');emit({type:'connection',connected:false});}
  function requestSfu(action,payload={},timeoutMs=18000){
    if(!connected||socket?.readyState!==WebSocket.OPEN)return Promise.reject(Object.assign(new Error('Servidor offline.'),{code:'NETWORK_OFFLINE'}));
    const requestId=makeId();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pendingSfu.delete(requestId);reject(Object.assign(new Error('Tempo limite da operação SFU excedido.'),{code:'SFU_TIMEOUT'}));},timeoutMs);
      pendingSfu.set(requestId,{resolve,reject,timer});
      if(!send('sfu-request',{requestId,action,payload})){clearTimeout(timer);pendingSfu.delete(requestId);reject(Object.assign(new Error('Não foi possível enviar a operação SFU.'),{code:'NETWORK_OFFLINE'}));}
    });
  }
  async function checkName(name,timeoutMs=5000){
    if(!await ensureGameIdentity(name))return {available:false,code:'AUTH_REQUIRED',message:'Entre na sua conta ou escolha um nome de convidado para jogar.'};
    if(!connected)await connect();
    if(!connected||socket?.readyState!==WebSocket.OPEN)return {available:false,name:String(name||''),code:'NETWORK_OFFLINE',message:'Servidor offline; não foi possível validar o nome.'};
    const requestId=makeId();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pendingNameChecks.delete(requestId);reject(Object.assign(new Error('Tempo limite ao validar nome.'),{code:'NAME_CHECK_TIMEOUT'}));},timeoutMs);
      pendingNameChecks.set(requestId,{resolve,reject,timer});
      if(!send('check-name',{requestId,name})){clearTimeout(timer);pendingNameChecks.delete(requestId);reject(Object.assign(new Error('Servidor offline.'),{code:'NETWORK_OFFLINE'}));}
    });
  }
  async function joinRoom(roomId,name){if(!await (roomId.startsWith('sala-')?ensureGameIdentity(name):ensureAuthenticated()))return false;if(!connected)await connect();if(connected)send(roomId.startsWith('sala-')&&independentGameVoice?'join-game-room':'join-room',{roomId,name});return connected;}
  async function joinTextChannel(roomId,name){
    if(!await ensureAuthenticated())return false;
    if(!independentTextChannels)throw new Error('Atualize o backend no Render para abrir texto sem sair da voz.');
    return send('join-text-channel',{roomId,name});
  }
  function leaveRoom(){if(currentRoom||primaryRoom||gameRoom)send('leave-room');currentRoom=null;primaryRoom=null;gameRoom=null;}
  function leaveGameRoom(){return independentGameVoice?send('leave-game-room'):leaveRoom();}
  function leaveVoiceRoom(){return independentGameVoice?send('leave-voice-room'):leaveRoom();}
  const api={
    connect,authenticate,authenticateGuest,disconnect,joinRoom,joinTextChannel,leaveRoom,leaveGameRoom,leaveVoiceRoom,joinChatOnly:name=>joinRoom('chat-livre',name),joinChatChannel:(id,name)=>joinRoom(id,name),requestChatChannels:()=>send('list-chat-channels'),requestPresence:()=>send('presence-request'),setActivity:activity=>gameActivitySupported&&send('activity-state',{activity}),get gameActivitySupported(){return gameActivitySupported;},
    requestRooms:()=>send('list-rooms'),setReady:r=>send('ready',{ready:!!r}),startRoom:()=>send('start-room'),
    gameAction:(action,payload={})=>send('game-action',{action,payload}),requestState:()=>send('state-request'),ping:()=>send('ping'),
    requestChatHistory:before=>send('chat-history-request',{roomId:currentRoom,before}),
    sendChat:(text,attachmentId)=>!!currentRoom&&send('chat-message',{roomId:currentRoom,text,attachmentId}),
    async prepareVoice(){if(!await ((primaryRoom||gameRoom)?.startsWith('sala-')?ensureGameIdentity():ensureAuthenticated()))throw new Error('Entre na sua conta ou como convidado do jogo.');const requestId=makeId();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pendingSfu.delete(requestId);reject(new Error('Não foi possível sincronizar a chamada.'));},15000);pendingSfu.set(requestId,{resolve,reject,timer});send('voice-prepare',{requestId});});},
    fallbackVoice:()=>send('voice-fallback'),
    setVoiceState:(joined,muted=false,camera=false,screen=false,quality='balanced',transport='p2p')=>send('voice-state',{joined:!!joined,muted:!!muted,deafened:!!joined&&!!window.TronoSocial?.deafened,camera:!!camera,screen:!!screen,quality,transport,screenFps:window.TronoSocial?.screenSettings?.fps||30}),
    playSound:fileId=>send('soundboard-play',{fileId}),
    sendVoiceSignal:(targetId,signalType,data)=>send('voice-signal',{targetId,signalType,data}),
    requestSfu,getRealtimeStatus:()=>requestSfu('status',{},8000),checkName,
    onMessage(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    BACKEND_HTTP,BACKEND_WS,CLIENT_VERSION,
    get connected(){return connected;},get clientId(){return clientId;},get currentRoom(){return currentRoom;},get primaryRoom(){return primaryRoom;},get gameRoom(){return gameRoom;},get independentGameVoice(){return independentGameVoice;}
  };
  return api;
})();
