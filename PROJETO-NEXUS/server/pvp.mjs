import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { PvpRooms } from './pvp-rooms.mjs';
import { PvpStore, summarize } from './pvp-store.mjs';
import { BUILD, PVP } from './pvp-loadout.mjs';
export async function createPvpServer({store=new PvpStore(),adminToken=process.env.PVP_ADMIN_TOKEN||'',origins=(process.env.PVP_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),...options}={}){
  await store.init();const rooms=new PvpRooms(store,options);const dashboard=await readFile(new URL('../web/pvp-admin.html',import.meta.url));
  const allowed=origin=>!origin||origins.includes('*')||origins.includes(origin)||(!origins.length&&process.env.NODE_ENV!=='production');
  const authorized=req=>{const value=(req.headers.authorization||'').replace(/^Bearer /,'');return adminToken.length>=24&&Buffer.byteLength(value)===Buffer.byteLength(adminToken)&&timingSafeEqual(Buffer.from(value),Buffer.from(adminToken));};
  const server=createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    if(req.method!=='GET')return json(405,{error:'Método indisponível'});
    if(url.pathname==='/health')return json(200,{ok:true,protocol:1,build:BUILD,pvpVersion:PVP.version});
    if(url.pathname==='/admin'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"});return res.end(dashboard);}
    if(url.pathname==='/admin/logs'){
      if(!authorized(req))return json(401,{error:'Chave administrativa necessária.'});
      const filters=Object.fromEntries(['hero','version','gem','reason'].map(k=>[k,url.searchParams.get(k)||'']));
      const report=summarize(store.records,filters);return json(200,{...report,storage:store.status(),limit:100});
    }
    if(url.pathname.startsWith('/admin/matches/')){
      if(!authorized(req))return json(401,{error:'Chave administrativa necessária.'});
      const record=store.records.find(r=>r.id===url.pathname.split('/').at(-1));return json(record?200:404,record||{error:'Partida não encontrada.'});
    }
    return json(404,{error:'Não encontrado'});
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});const ips=new Map();
  server.on('upgrade',(req,socket,head)=>{
    if(new URL(req.url,'http://localhost').pathname!=='/pvp'||!allowed(req.headers.origin)||wss.clients.size>=256||(ips.get(socket.remoteAddress)||0)>=40){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,peer=>wss.emit('connection',peer,req));
  });
  wss.on('connection',(peer,req)=>{
    const ip=req.socket.remoteAddress;ips.set(ip,(ips.get(ip)||0)+1);peer.isAlive=true;peer.pongAt=Date.now();peer.rateAt=Date.now();peer.rateCount=0;
    rooms.send(peer,{type:'hello',protocol:1,build:BUILD,pvpVersion:PVP.version});peer.on('pong',()=>{peer.isAlive=true;peer.pongAt=Date.now();});
    peer.on('message',(bytes,isBinary)=>{
      if(Date.now()-peer.rateAt>1000){peer.rateAt=Date.now();peer.rateCount=0;}
      if(++peer.rateCount>20){peer.close(1008,'Muitas mensagens');return;}
      try{if(isBinary)throw Error('Use mensagens JSON.');rooms.receive(peer,JSON.parse(bytes.toString()));}catch(e){rooms.error(peer,e.message);}
    });
    peer.on('error',()=>{});peer.on('close',()=>{ips.set(ip,Math.max(0,(ips.get(ip)||1)-1));rooms.disconnected(peer);});
  });
  const timer=setInterval(()=>rooms.tick(),250);timer.unref();
  const heartbeat=setInterval(()=>{for(const p of wss.clients){if(!p.isAlive){p.terminate();continue;}p.isAlive=false;p.ping();}store.flushRemote();},30000);heartbeat.unref();
  return {server,rooms,store,wss,async close(){clearInterval(timer);clearInterval(heartbeat);for(const p of wss.clients)p.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));await store.serial;}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.env.NODE_ENV==='production'&&!process.env.PVP_ALLOWED_ORIGINS)throw Error('Defina PVP_ALLOWED_ORIGINS para as origens autorizadas do jogo.');
  const app=await createPvpServer();app.server.listen(Number(process.env.PORT||8787),'0.0.0.0',()=>console.log('NEXUS PvP na porta '+app.server.address().port));
  for(const event of ['SIGINT','SIGTERM'])process.on(event,async()=>{await app.close();process.exit(0);});
}
