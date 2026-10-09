'use strict';
const crypto=require('crypto');
const https=require('https');
const {Readable}=require('stream');
const {pipeline}=require('stream/promises');
const LIMITS={file:10_000_000,video:100_000_000,avatar:1_000_000,total:8_000_000_000};
const PREVIEW_MIMES=new Set(['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm','application/pdf']);
const error=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const mac=(key,s)=>crypto.createHmac('sha256',key).update(s).digest();
function signedUrl(env,method,key,query={},now=new Date()){
 const host=`${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,path=`/${enc(env.R2_BUCKET)}/${key.split('/').map(enc).join('/')}`;
 const date=now.toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),scope=`${day}/auto/s3/aws4_request`;
 const params={...query,'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Content-Sha256':'UNSIGNED-PAYLOAD','X-Amz-Credential':`${env.R2_ACCESS_KEY_ID}/${scope}`,'X-Amz-Date':date,'X-Amz-Expires':'300','X-Amz-SignedHeaders':'host'};
 const canonicalQuery=Object.keys(params).sort().map(k=>`${enc(k)}=${enc(params[k])}`).join('&');
 const canonical=[method,path,canonicalQuery,`host:${host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n');
 const signingKey=mac(mac(mac(mac(`AWS4${env.R2_SECRET_ACCESS_KEY}`,day),'auto'),'s3'),'aws4_request');
 const sig=mac(signingKey,`AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha(canonical)}`).toString('hex');
 return `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${sig}`;
}
function detectMime(b){
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(/^GIF8[79]a/.test(b.subarray(0,6).toString()))return 'image/gif';
 if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return 'image/webp';
 if(b.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 if(b.length>=8&&b.subarray(0,4).equals(Buffer.from([26,69,223,163]))&&b.includes(Buffer.from('webm')))return 'video/webm';
 if(b.length>=16&&b.subarray(4,8).toString()==='ftyp'){
   const brands=b.subarray(8,Math.min(b.length,64)).toString('ascii');
   if(/isom|iso[2-9]|mp4[12]|avc1|M4V |dash/.test(brands))return 'video/mp4';
 }
 // Other files are downloadable without an executable inline preview.
 return 'application/octet-stream';
}
async function peek(req){
 const iterator=req[Symbol.asyncIterator](),chunks=[];let bytes=0;
 while(bytes<64){const next=await iterator.next();if(next.done)break;chunks.push(next.value);bytes+=next.value.length;}
 const prefix=Buffer.concat(chunks);
 async function* body(){yield prefix;for(;;){const next=await iterator.next();if(next.done)return;yield next.value;}}
 return {prefix,body:Readable.from(body())};
}
function r2Adapter(env){return {
 async put(key,body,size,mime,name){
   const url=signedUrl(env,'PUT',key);let request;
   const response=new Promise((resolve,reject)=>{
     request=https.request(url,{method:'PUT',headers:{'Content-Length':String(size),'Content-Type':mime,'Content-Disposition':`${PREVIEW_MIMES.has(mime)?'inline':'attachment'}; filename*=UTF-8''${enc(name)}`}},res=>{res.resume();res.on('end',()=>res.statusCode>=200&&res.statusCode<300?resolve():reject(error('STORAGE_UNAVAILABLE','Não foi possível salvar no armazenamento.',503)));});
     request.on('error',reject);request.setTimeout(300_000,()=>request.destroy(error('UPLOAD_TIMEOUT','Envio demorou demais. Tente novamente.',408)));
   });
   // Observe both promises immediately: either side may fail before the other.
   const settled=await Promise.allSettled([pipeline(body,request),response]);const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;
 },
 async remove(key){const res=await fetch(signedUrl(env,'DELETE',key),{method:'DELETE',signal:AbortSignal.timeout(20_000)});if(!res.ok&&res.status!==404)throw error('STORAGE_UNAVAILABLE','Não foi possível excluir agora.',503);},
 url(row,download=false){const inline=!download&&PREVIEW_MIMES.has(row.mime);return signedUrl(env,'GET',row.object_key,{'response-content-type':row.mime,'response-content-disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${enc(row.name)}`});}
};}
function createFiles({auth,env=process.env,membership=()=>false,onDeleted=()=>{},fetchImpl=fetch,adapter}={}){
 const url=String(env.SUPABASE_URL||'').replace(/\/+$/,''),key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 const configured=!!(auth.configured&&key&&/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID||'')&&/^[a-z0-9][a-z0-9.-]{1,62}$/.test(env.R2_BUCKET||'')&&env.R2_ACCESS_KEY_ID&&env.R2_SECRET_ACCESS_KEY);
 const r2=adapter||r2Adapter(env),active=new Map();let cleaning=false;
 async function db(path,method='GET',body){
   let res;try{res=await fetchImpl(`${url}/rest/v1/${path}`,{method,headers:{apikey:key,...(!String(key).startsWith('sb_secret_')?{Authorization:`Bearer ${key}`}:{ }),'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw error('STORAGE_UNAVAILABLE','Não foi possível acessar o armazenamento.',503);}
   const data=await res.json().catch(()=>null);
   if(!res.ok){const msg=String(data?.message||'');const reason=['STORAGE_FULL','FILE_TOO_LARGE','UPLOAD_BUSY','AVATAR_IN_USE'].find(c=>msg.includes(c));const copy={STORAGE_FULL:'Armazenamento de 8 GB cheio. Exclua anexos para liberar espaço.',FILE_TOO_LARGE:'Arquivo acima do limite permitido.',UPLOAD_BUSY:'Aguarde os envios em andamento.',AVATAR_IN_USE:'Troque seu ícone antes de excluir essa foto.'};throw error(reason||'STORAGE_UNAVAILABLE',copy[reason]||'Armazenamento indisponível. Confira a configuração e a atualização SQL.',reason?409:503);}
   return data;
 }
 const publicFile=r=>({id:r.id,name:r.name,bytes:Number(r.bytes),mime:r.mime,kind:r.kind,roomId:r.room_id,ownerId:r.owner_id,createdAt:r.created_at});
 const first=data=>Array.isArray(data)?data[0]:data;
 async function lookup(id){if(!/^[a-f0-9-]{36}$/i.test(id||''))throw error('FILE_NOT_FOUND','Arquivo não encontrado.',404);return first(await db(`chat_files?id=eq.${id}&limit=1`));}
 async function remove(row){
   const marked=first(await db('rpc/mark_chat_file_deleting','POST',{p_id:row.id,p_owner:row.owner_id}));
   if(!marked?.id)throw error('FILE_BUSY','Esse arquivo está sendo enviado. Aguarde.',409);
   await r2.remove(row.object_key); // Never free the reservation before R2 confirms deletion.
   await db(`chat_files?id=eq.${row.id}`,'DELETE');onDeleted(row);
 }
 async function cleanup(){
   if(!configured||cleaning)return;cleaning=true;
   try{const cutoff=new Date(Date.now()-20*60_000).toISOString();const rows=await db(`chat_files?or=(state.eq.deleting,and(state.eq.pending,created_at.lt.${encodeURIComponent(cutoff)}))&limit=20`);for(const row of rows||[])if(!active.has(row.owner_id))await remove(row).catch(()=>{});}catch{}finally{cleaning=false;}
 }
 const timer=setInterval(()=>void cleanup(),5*60_000);timer.unref();
 async function attachment(id,owner,roomId){const row=await lookup(id);if(!row||row.state!=='ready'||row.kind!=='chat'||row.owner_id!==owner||row.room_id!==roomId)throw error('INVALID_ATTACHMENT','Esse anexo não está disponível neste canal.');return publicFile(row);}
 function install(app){
   app.use('/files',async(req,res,next)=>{
     res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
     const origin=req.headers.origin;if(origin&&!auth.allowedOrigins.has(origin))return res.status(403).json({error:{code:'ORIGIN_FORBIDDEN',message:'Origem não autorizada.'}});
     if(origin){res.set({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type, X-File-Name, X-File-Kind, X-Room-Id','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'});res.vary('Origin');}
     if(req.method==='OPTIONS')return res.sendStatus(204);
     try{req.account=await auth.identity(auth.tokenFrom(req));next();}catch(e){res.status(e.status||503).json({error:{code:e.code,message:e.message}});}
   });
   function route(method,path,fn){app[method](`/files${path}`,async(req,res)=>{try{if(!configured)throw error('STORAGE_UNCONFIGURED','Anexos ainda não foram ativados no servidor.',503);res.json(await fn(req));}catch(e){if(!res.destroyed)res.status(e.status||503).json({error:{code:e.code||'STORAGE_UNAVAILABLE',message:e.status?e.message:'Não foi possível concluir o envio.'}});}});}
   route('get','/status',async()=>({configured:true,used:Number(await db('rpc/chat_storage_usage','POST',{})),limits:LIMITS}));
   route('get','/mine',async req=>{const offset=Math.max(0,Math.min(10000000,Math.floor(Number(req.query.offset)||0)));const rows=await db(`chat_files?owner_id=eq.${req.account.id}&state=eq.ready&order=created_at.desc,id.desc&limit=200&offset=${offset}`);return {files:rows.map(publicFile),hasMore:rows.length===200,nextOffset:offset+rows.length};});
   route('get','/:id/url',async req=>{const row=await lookup(req.params.id);if(!row||row.state!=='ready')throw error('FILE_NOT_FOUND','Arquivo excluído ou indisponível.',404);if(row.kind==='chat'&&row.owner_id!==req.account.id&&!membership(req.account.id,row.room_id))throw error('FILE_FORBIDDEN','Entre no canal desse anexo para acessá-lo.',403);return {url:r2.url(row,req.query.download==='1'),expiresAt:Date.now()+300000};});
   route('delete','/:id',async req=>{const row=await lookup(req.params.id);if(!row||row.owner_id!==req.account.id)throw error('FILE_FORBIDDEN','Você só pode excluir seus próprios arquivos.',403);if(row.state==='pending'&&Date.now()-Date.parse(row.created_at)<20*60_000)throw error('FILE_BUSY','Envio ainda reservado. Aguarde a limpeza automática.',409);await remove(row);return {ok:true};});
   route('post','/upload',async req=>{
     const owner=req.account.id,size=Number(req.headers['content-length']),kind=req.headers['x-file-kind']==='avatar'?'avatar':'chat',roomId=kind==='chat'?String(req.headers['x-room-id']||''):null;
     if(!Number.isSafeInteger(size)||size<=0)throw error('FILE_SIZE_REQUIRED','Informe um arquivo com tamanho válido.',411);
     if(size>(kind==='avatar'?LIMITS.avatar:LIMITS.video))throw error('FILE_TOO_LARGE','Limite: 10 MB por arquivo e 100 MB por vídeo.',413);
     if(kind==='chat'&&!membership(owner,roomId))throw error('NOT_IN_ROOM','Entre no canal para anexar arquivos.',403);
     if(active.size>=4||(active.get(owner)||0)>=2)throw error('UPLOAD_BUSY','Aguarde os envios em andamento.',429);
     let name;try{name=decodeURIComponent(req.headers['x-file-name']||'arquivo');}catch{throw error('INVALID_FILENAME','Nome de arquivo inválido.');}
     name=[...name.replace(/[\\/\x00-\x1f\x7f]/g,'_')].slice(0,140).join('').trim()||'arquivo';
     active.set(owner,(active.get(owner)||0)+1);let row,deadline,putFinished=false;
     try{
       deadline=setTimeout(()=>req.destroy(),300_000);deadline.unref();
       const {prefix,body}=await peek(req),mime=detectMime(prefix),isVideo=['video/mp4','video/webm'].includes(mime);
       if(size>(kind==='avatar'?LIMITS.avatar:isVideo?LIMITS.video:LIMITS.file))throw error('FILE_TOO_LARGE','Limite: 10 MB por arquivo e 100 MB por vídeo MP4.',413);
       if(kind==='avatar'&&(mime!=='image/png'||prefix.readUInt32BE(16)!==256||prefix.readUInt32BE(20)!==256))throw error('INVALID_AVATAR','A foto do perfil deve ser PNG com 256 × 256 pixels.');
       const id=crypto.randomUUID(),objectKey=`${kind}/${owner}/${id}`;
       row=first(await db('rpc/reserve_chat_file','POST',{p_id:id,p_owner:owner,p_key:objectKey,p_name:name,p_bytes:size,p_mime:mime,p_kind:kind,p_room:roomId}));
       let received=0;const counted=Readable.from((async function*(){for await(const chunk of body){received+=chunk.length;if(received>size)throw error('FILE_TOO_LARGE','Arquivo ultrapassou o tamanho declarado.',413);yield chunk;}if(received!==size)throw error('UPLOAD_INCOMPLETE','Envio incompleto. Tente novamente.');})());
       await r2.put(objectKey,counted,size,mime,name);putFinished=true;
       if(kind==='chat'&&!membership(owner,roomId))throw error('NOT_IN_ROOM','O canal foi fechado durante o envio.',409);
       await db(`chat_files?id=eq.${id}&state=eq.pending`,'PATCH',{state:'ready'});
       return {file:publicFile({...row,state:'ready'})};
     }catch(e){if(row){if(putFinished)await remove(row).catch(()=>{});else{await r2.remove(row.object_key).catch(()=>{});/* Keep uncertain PUT reservations until the delayed cleanup confirms deletion again. */}}throw e;}finally{clearTimeout(deadline);const count=(active.get(owner)||1)-1;if(count)active.set(owner,count);else active.delete(owner);}
   });
 }
 return {install,attachment,health:()=>({configured,limits:LIMITS}),cleanup,db};
}
module.exports={createFiles,signedUrl,detectMime,LIMITS};
