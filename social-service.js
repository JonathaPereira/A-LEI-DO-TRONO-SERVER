'use strict';
const {authError}=require('./auth');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function createSocialService({auth,wss,send,rooms,now=Date.now}){
  const rates=new Map();let ready=false;
  function publish(accounts,event){for(const ws of wss.clients)if(accounts.includes(ws.account?.id)&&ws.account.expiresAt>now())send(ws,event);}
  function limit(id,action){const key=id+':'+action,stamp=now();let row=rates.get(key);if(!row||row.until<stamp){row={count:0,until:stamp+60000};rates.set(key,row);}if(++row.count>(action==='send'?60:120))throw authError('SOCIAL_RATE_LIMIT','Aguarde um instante antes de tentar novamente.',429);if(rates.size>2000)for(const [key,row]of rates)if(row.until<stamp)rates.delete(key);}
  function uuid(value){if(!UUID.test(value||''))throw authError('INVALID_TARGET','Conta ou mensagem inválida.');return value;}
  async function operation(token,account,action,input={}){
    limit(account.id,action);let data;
    const rpc=(name,body)=>auth.request(token,'/rest/v1/rpc/social_'+name,'POST',body);
    if(action==='snapshot')data=await rpc('snapshot',{});
    else if(action==='friend'){
      const peer=uuid(input.peerId);if(!['request','accept','decline','remove'].includes(input.action))throw authError('INVALID_ACTION','Ação inválida.');
      await rpc('friend',{p_target:peer,p_action:input.action});data={ok:true};
      publish([account.id,peer],{type:'social-changed',kind:'friend',accountId:account.id,action:input.action,name:account.nickname});
    }else if(action==='read'){
      data=await rpc('read',{p_peer:uuid(input.peerId),p_before:input.before?uuid(input.before):null});
      if(!Array.isArray(data))throw authError('SOCIAL_UNAVAILABLE','Conversas indisponíveis. Confira a migração SQL.',503);
      const hasMore=data.length>50;data={messages:data.slice(-50),hasMore};
    }else if(action==='mark-read'){
      await rpc('mark_read',{p_peer:uuid(input.peerId),p_message:uuid(input.messageId)});data={ok:true};publish([account.id],{type:'social-changed',kind:'read'});
    }else if(action==='send'){
      const peer=uuid(input.peerId),id=uuid(input.id),text=typeof input.text==='string'?input.text.trim():'';
      const room=input.roomId?rooms.get(input.roomId):null;
      if(input.roomId&&(!room||room.kind!=='chat'))throw authError('CHANNEL_NOT_FOUND','Esse canal não existe mais.',404);
      if(!input.roomId&&(!text||[...text].length>2000))throw authError('INVALID_MESSAGE','Escreva de 1 a 2000 caracteres.');
      data=await rpc('send',{p_peer:peer,p_id:id,p_text:text,p_room:room?.id||null});
      if(!data?.id||data.senderId!==account.id)throw authError('SOCIAL_UNAVAILABLE','Não foi possível confirmar a mensagem.',503);
      publish([account.id,peer],{type:'direct-message',peerId:peer,senderName:account.nickname,message:data});
    }else throw authError('INVALID_ACTION','Ação inválida.');
    ready=true;return data;
  }
  function install(app,express){
    app.use('/social',(req,res,next)=>{
      res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
      const origin=req.headers.origin;if(origin&&!auth.allowedOrigins.has(origin))return res.status(403).json({error:{code:'ORIGIN_FORBIDDEN',message:'Origem não autorizada.'}});
      if(origin){res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');res.set('Access-Control-Allow-Headers','Content-Type, Authorization');res.set('Access-Control-Allow-Methods','POST, OPTIONS');}
      if(req.method==='OPTIONS')return res.sendStatus(204);next();
    },express.json({limit:'12kb'}));
    app.post('/social/:action',async(req,res)=>{try{const token=auth.tokenFrom(req),account=await auth.identity(token);res.json(await operation(token,account,req.params.action,req.body));}catch(error){if(error.status>=500)ready=false;res.status(error.status||503).json({error:{code:error.code||'SOCIAL_UNAVAILABLE',message:error.status?error.message:'Conversas indisponíveis. Confira a migração SQL.'}});}});
  }
  return {install,operation,health:()=>({configured:auth.configured,ready,persistent:true})};
}
module.exports={createSocialService};
