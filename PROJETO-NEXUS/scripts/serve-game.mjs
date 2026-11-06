import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.wasm':'application/wasm','.pck':'application/octet-stream','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
export function createGameServer({directory='artifacts/web-game'}={}){const root=resolve(directory);return createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+sep)||!types[extname(file)])throw Error('Not found');
  const info=await stat(file);if(!info.isFile())throw Error('Not a file');
  res.writeHead(200,{'Content-Type':types[extname(file)],'Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end('Exporte o jogo com npm run build:game.');}
});}
if(process.argv[1]===fileURLToPath(import.meta.url)){
const server=createGameServer();
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Godot Web: http://localhost:'+server.address().port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
