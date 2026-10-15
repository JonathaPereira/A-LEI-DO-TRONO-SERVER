'use strict';
const fail=message=>Object.assign(new Error(message),{code:'INVALID_PROFILE',status:400});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cleanProfile(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail('Perfil inválido.');
  const text=(key,max)=>{const s=value[key]??'';if(typeof s!=='string'||[...s].length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))throw fail('Confira os campos do perfil.');return s.trim();};
  const handle=text('handle',24).replace(/^@/,'').toLowerCase();if(handle&&!/^[a-z0-9_]{3,24}$/.test(handle))throw fail('Use de 3 a 24 letras, números ou sublinhado no @usuário.');
  const number=(key,def,min,max)=>{const n=value[key]??def;if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw fail('Ajuste de aparência inválido.');return Math.round(n);};
  const file=key=>{const id=value[key]||null;if(id&&!UUID.test(id))throw fail('Imagem de perfil inválida.');return id;};
  const tags=value.tags??[],links=value.links??[];
  if(!Array.isArray(tags)||tags.length>12||tags.some(s=>typeof s!=='string'||!s.trim()||[...s].length>24))throw fail('Escolha até 12 interesses, com 24 caracteres cada.');
  if(!Array.isArray(links)||links.length>8)throw fail('Adicione até 8 links.');
  const safeLinks=links.map(link=>{if(!link||typeof link.label!=='string'||!link.label.trim()||link.label.length>32||typeof link.url!=='string'||link.url.length>400)throw fail('Link inválido.');let u;try{u=new URL(link.url);}catch{throw fail('Use links completos começando com https://.');}if(u.protocol!=='https:'||u.username||u.password)throw fail('Use links completos começando com https://.');return {label:link.label.trim(),url:u.href};});
  const accent=value.accent??'#7865ff';if(typeof accent!=='string'||!/^#[0-9a-f]{6}$/i.test(accent))throw fail('Cor inválida.');
  return {handle,bio:text('bio',300),status:text('status',100),emoji:text('emoji',12),tags:[...new Set(tags.map(s=>s.trim()))],links:safeLinks,cover_file_id:file('cover_file_id'),background_file_id:file('background_file_id'),accent,darkness:number('darkness',60,0,90),blur:number('blur',0,0,20),opacity:number('opacity',90,40,100),reduce_motion:value.reduce_motion===true};
}
module.exports={cleanProfile};
