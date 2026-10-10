'use strict';
window.TronoClipStore=(()=>{
  let connection;
  function db(){if(!connection)connection=new Promise((resolve,reject)=>{const r=indexedDB.open('trono-local-clips',1);r.onupgradeneeded=()=>{r.result.createObjectStore('clips',{keyPath:'id'}).createIndex('owner','owner');r.result.createObjectStore('settings');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{connection=null;reject(Error('Não foi possível abrir o armazenamento local de clipes.'));};});return connection;}
  async function run(store,mode,fn){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(store,mode);let request;try{request=fn(tx.objectStore(store));}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error||Error('Não foi possível armazenar o clipe. Confira o espaço do navegador.'));tx.onerror=()=>{};});}
  return {put:clip=>run('clips','readwrite',s=>s.put(clip)),get:id=>run('clips','readonly',s=>s.get(id)),remove:id=>run('clips','readwrite',s=>s.delete(id)),async list(owner){return (await run('clips','readonly',s=>s.index('owner').getAll(owner))).sort((a,b)=>b.createdAt-a.createdAt);},directory:owner=>run('settings','readonly',s=>s.get('directory:'+owner)),setDirectory:(owner,handle)=>run('settings','readwrite',s=>s.put(handle,'directory:'+owner))};
})();
