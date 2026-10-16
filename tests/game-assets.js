'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),http=require('node:http');
const {GameAssets,validateManifest}=require('../electron/game-assets.cjs');
function fixture(){const data=Array.from({length:6},(_,i)=>Buffer.from('approved asset '+i)),files=data.map((b,i)=>({path:'assets/image-'+i+'.webp',bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),type:'image/webp'}));return {data,manifest:{schema:1,id:'cinzas-do-abismo',version:'0.5',cacheKey:'1234567890abcdef1234',bytes:data.reduce((n,b)=>n+b.length,0),files}};}
test('game cache accepts only a bounded manifest of media/data, never scripts or traversal',()=>{
 const {manifest}=fixture();assert.equal(validateManifest(manifest),manifest);
 for(const patch of [{path:'assets/../secret.png'},{path:'assets/code.js'},{path:'assets/%2fsecret.png'},{type:'text/html'},{bytes:6*1024*1024},{sha256:'x'}]){const bad=structuredClone(manifest);Object.assign(bad.files[0],patch);assert.throws(()=>validateManifest(bad));}
 const duplicate=structuredClone(manifest);duplicate.files.push(duplicate.files[0]);assert.throws(()=>validateManifest(duplicate));
 const wrongTotal=structuredClone(manifest);wrongTotal.bytes++;assert.throws(()=>validateManifest(wrongTotal));
});
test('real downloads deduplicate, use at most two connections and survive restart offline',async()=>{
 const {manifest,data}=fixture(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'mn-game-assets-'));let calls=0,active=0,peak=0;
 const server=http.createServer((req,res)=>{calls++;active++;peak=Math.max(peak,active);const index=Number(/image-(\d+)/.exec(req.url)?.[1]);setTimeout(()=>{if(index===0){const bytes=require('node:zlib').gzipSync(data[index]);res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',bytes.length);res.end(bytes);}else res.end(data[index]);active--;},20);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{const cache=new GameAssets({manifest,directory,origin,fetchAsset:fetch});const results=await Promise.all([...manifest.files.map(f=>cache.read(f.path)),...Array.from({length:5},()=>cache.read(manifest.files[0].path))]);assert.deepEqual(results[0],data[0]);assert.equal(calls,6);assert(peak<=2);await new Promise(r=>server.close(r));
  const offline=new GameAssets({manifest,directory,origin,fetchAsset:()=>{throw Error('offline');}});for(let i=0;i<data.length;i++)assert.deepEqual(await offline.read(manifest.files[i].path),data[i]);assert.equal((await fs.readdir(offline.directory)).filter(n=>n.endsWith('.tmp')).length,0);
 }finally{server.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('unavailable, tampered and oversized assets never commit; retry and corrupt-cache repair work',async()=>{
 const {manifest,data}=fixture(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'mn-game-integrity-'));let mode='missing',calls=0;
 const cache=new GameAssets({manifest,directory,origin:'https://example.test',fetchAsset:async()=>{calls++;if(mode==='missing')return new Response('',{status:404});if(mode==='tampered')return new Response(Buffer.alloc(data[0].length,1));if(mode==='oversize')return new Response(Buffer.alloc(data[0].length+1));return new Response(data[0]);}});
 try{for(mode of ['missing','tampered','oversize']){await assert.rejects(cache.read(manifest.files[0].path));assert.deepEqual(await fs.readdir(cache.directory),[]);}
  mode='good';assert.deepEqual(await cache.read(manifest.files[0].path),data[0]);const file=path.join(cache.directory,manifest.files[0].sha256+'.webp');await fs.writeFile(file,Buffer.alloc(data[0].length,9));assert.deepEqual(await cache.read(manifest.files[0].path),data[0]);const before=calls;await assert.rejects(cache.read('assets/evil.js'));assert.equal(calls,before);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
