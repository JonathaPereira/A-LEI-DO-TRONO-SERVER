'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
// Only the trusted installed frame can reach this store. Authentication is
// protected by the OS keyring/DPAPI; there is no plaintext credential fallback.
class DesktopPreferences{
  constructor(directory,safeStorage){this.directory=directory;this.safeStorage=safeStorage;this.permissions=new Set();this.queue=Promise.resolve();}
  async load(){try{const data=JSON.parse(await fs.readFile(path.join(this.directory,'media-permissions.json'),'utf8'));for(const kind of data.allowed||[])if(['audio','video'].includes(kind))this.permissions.add(kind);}catch{}}
  enqueue(work){const next=this.queue.catch(()=>{}).then(work);this.queue=next;return next;}
  async atomic(file,bytes){await fs.mkdir(this.directory,{recursive:true});const target=path.join(this.directory,file),temporary=target+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temporary,bytes,{mode:0o600});await fs.rename(temporary,target);}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}}
  async grant(types){return this.enqueue(async()=>{const next=new Set(this.permissions);for(const kind of types)if(['audio','video'].includes(kind))next.add(kind);await this.atomic('media-permissions.json',JSON.stringify({allowed:[...next]}));this.permissions=next;});}
  async reset(){return this.enqueue(async()=>{await fs.rm(path.join(this.directory,'media-permissions.json'),{force:true});this.permissions.clear();});}
  async readSession(){await this.queue.catch(()=>{});if(!this.safeStorage.isEncryptionAvailable())return null;try{const bytes=await fs.readFile(path.join(this.directory,'remembered-session.bin'));return this.validate(JSON.parse(this.safeStorage.decryptString(bytes)));}catch{return null;}}
  validate(value){if(!value?.session?.refresh_token||!value?.session?.access_token||!value?.user?.id||!Number.isFinite(value.session.expires_at))throw Error('Sessão inválida.');const json=JSON.stringify(value);if(json.length>131072||typeof value.session.refresh_token!=='string'||typeof value.session.access_token!=='string'||typeof value.user.id!=='string')throw Error('Sessão inválida.');return JSON.parse(json);}
  saveSession(value){return this.enqueue(async()=>{if(!value){await fs.rm(path.join(this.directory,'remembered-session.bin'),{force:true});return {saved:false};}const data=this.validate(value);if(!this.safeStorage.isEncryptionAvailable())return {saved:false,error:'O Windows não disponibilizou o armazenamento seguro. Sua sessão vale enquanto o app estiver aberto.'};await this.atomic('remembered-session.bin',this.safeStorage.encryptString(JSON.stringify(data)));return {saved:true};});}
}
module.exports={DesktopPreferences};
