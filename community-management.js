'use strict';
const {permissions}=require('./roles');
const fail=(code,message,status=400)=>Object.assign(Error(message),{code,status});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createCommunityManagement({auth,rooms,db,onChanged=()=>{},onDeleted=()=>{},onRoleChanged=()=>{}}){
  let ready=false,queue=Promise.resolve();
  // Serialize mutations and refreshes so an older snapshot cannot reintroduce a deleted room.
  function serial(fn){const task=queue.catch(()=>{}).then(fn);queue=task;return task;}
  function apply(rows){
    if(!Array.isArray(rows)||rows.some(r=>!r||!/^channel-[0-9a-f-]{36}$|^chat-(livre|jogos|conversa)$/.test(r.id)||!['text','voice','mixed'].includes(r.channel_type)||typeof r.name!=='string'))throw fail('COMMUNITY_UNAVAILABLE','Lista de canais inválida.',503);
    const ids=new Set(rows.map(r=>r.id));
    for(const room of [...rooms.values()])if(room.kind==='chat'&&!ids.has(room.id)){onDeleted(room);rooms.delete(room.id);}
    for(const row of rows){
      let room=rooms.get(row.id);
      if(!room){room={id:row.id,kind:'chat',max:null,players:new Map(),createdAt:Date.now(),game:null,chatHistory:[],nextSeat:0};rooms.set(row.id,room);}
      room.name=row.name;room.description=row.description;room.channelType=row.channel_type;
    }
    ready=true;onChanged();return rows;
  }
  async function sync(token){return apply(await auth.request(token,'/rest/v1/rpc/community_channels','POST',{}));}
  async function refresh(){if(!auth.configured||!db)return;return serial(async()=>apply(await db('rpc/community_channels','POST',{}))).catch(()=>{ready=false;});}
  function install(app,express){
    app.use('/community',async(req,res,next)=>{
      res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      const origin=req.headers.origin;
      if(origin&&!auth.allowedOrigins.has(origin))return res.status(403).json({error:{code:'ORIGIN_FORBIDDEN',message:'Origem não autorizada.'}});
      if(origin){res.set({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'});res.vary('Origin');}
      if(req.method==='OPTIONS')return res.sendStatus(204);
      try{req.accessToken=auth.tokenFrom(req);req.account=await auth.identity(req.accessToken);next();}catch(e){res.status(e.status||503).json({error:{code:e.code,message:e.message}});}
    },express.json({limit:'8kb'}));
    function route(method,path,fn){app[method]('/community'+path,async(req,res)=>{try{res.json(await fn(req));}catch(e){res.status(e.status||503).json({error:{code:e.code||'COMMUNITY_UNAVAILABLE',message:e.status?e.message:'Não foi possível atualizar a comunidade.'}});}});}
    function requirePermission(req,key){if(!permissions(req.account.role)[key])throw fail('FORBIDDEN','Você não tem permissão para realizar essa operação.',403);}
    route('get','/permissions',async req=>({role:req.account.role,permissions:permissions(req.account.role)}));
    route('get','/profiles/:id',async req=>{
      if(!uuid.test(req.params.id))throw fail('MEMBER_NOT_FOUND','Perfil não encontrado.',404);
      const profile=await auth.request(req.accessToken,'/rest/v1/rpc/read_member_profile','POST',{p_user:req.params.id});
      if(!profile)throw fail('MEMBER_NOT_FOUND','Perfil não encontrado.',404);
      return {profile};
    });
    route('get','/registered-accounts',async req=>{
      requirePermission(req,'viewEmails');
      const offset=Math.max(0,Math.min(1000000,Math.floor(Number(req.query.offset)||0)));
      const rows=await auth.request(req.accessToken,'/rest/v1/rpc/creator_registered_accounts','POST',{p_offset:offset});
      return {accounts:rows,hasMore:rows.length===50,nextOffset:offset+rows.length};
    });
    route('get','/channels',req=>serial(async()=>({channels:await sync(req.accessToken)})));
    route('post','/channels',req=>serial(async()=>{
      requirePermission(req,'manageChannels');
      const {name,type,description=''}=req.body||{};
      if(typeof name!=='string'||name.trim().length<2||name.trim().length>40||/[\x00-\x1f\x7f]/.test(name)||!['text','voice'].includes(type)||typeof description!=='string'||description.length>160)throw fail('INVALID_CHANNEL','Use nome de 2 a 40 caracteres e tipo texto ou voz.');
      const channel=await auth.request(req.accessToken,'/rest/v1/rpc/community_create_channel','POST',{p_name:name.trim(),p_type:type,p_description:description.trim()});
      await sync(req.accessToken);return {channel:Array.isArray(channel)?channel[0]:channel};
    }));
    route('delete','/channels/:id',req=>serial(async()=>{
      requirePermission(req,'manageChannels');
      if(!/^channel-[0-9a-f-]{36}$|^chat-(livre|jogos|conversa)$/.test(req.params.id))throw fail('CHANNEL_NOT_FOUND','Canal não encontrado.',404);
      await auth.request(req.accessToken,'/rest/v1/rpc/community_delete_channel','POST',{p_id:req.params.id});
      await sync(req.accessToken);return {ok:true};
    }));
    route('post','/roles',async req=>{
      requirePermission(req,'manageRoles');
      const {userId,role}=req.body||{};
      if(!uuid.test(userId||''))throw fail('MEMBER_NOT_FOUND','Conta não encontrada.',404);
      if(!['admin','member'].includes(role))throw fail('INVALID_ROLE','Escolha Admin ou Membro.');
      await auth.request(req.accessToken,'/rest/v1/rpc/community_set_role','POST',{p_user:userId,p_role:role});
      onRoleChanged(userId,role);return {ok:true,userId,role};
    });
    app.use('/community',(err,req,res,next)=>{if(!err)return next();res.status(400).json({error:{code:'INVALID_REQUEST',message:'Dados inválidos.'}});});
  }
  const timer=setInterval(()=>void refresh(),15000);timer.unref();void refresh();
  return {install,refresh,refreshFor:token=>serial(()=>sync(token)),health:()=>({channelsReady:ready}),stop:()=>clearInterval(timer)};
}
module.exports={createCommunityManagement};
