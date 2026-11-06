import { mkdir, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
export class PvpStore {
  constructor({directory=process.env.PVP_DATA_DIR||'artifacts/pvp-data',url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY}={}) {
    if(Boolean(url)!==Boolean(key))throw Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY juntas.');
    this.path=resolve(directory,'matches.ndjson'); this.url=url?.replace(/\/$/,''); this.key=key;
    this.records=[]; this.pending=new Map(); this.serial=Promise.resolve(); this.lastError='';
  }
  async init() {
    await mkdir(resolve(this.path,'..'),{recursive:true});
    try {
      const lines=createInterface({input:createReadStream(this.path),crlfDelay:Infinity});
      for await(const line of lines){try{this.records.push(JSON.parse(line));if(this.records.length>100)this.records.shift();}catch{}}
    } catch(e){if(e.code!=='ENOENT')throw e;}
    if (this.url && this.key) {
      try {
        const response=await fetch(`${this.url}/rest/v1/pvp_matches?select=payload&order=created_at.desc&limit=100`,{headers:{apikey:this.key,Authorization:`Bearer ${this.key}`},signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error(`Supabase HTTP ${response.status}`);
        const rows=await response.json(); const merged=new Map([...rows.reverse().map(r=>r.payload),...this.records].map(r=>[r.id,r])); this.records=[...merged.values()].slice(-100);
      } catch(e){this.lastError=e.message; console.error('PvP: leitura remota indisponível; registros locais preservados.');}
    }
  }
  save(record) {
    const copy=structuredClone(record); this.records.push(copy); if(this.records.length>100)this.records.shift();
    this.serial=this.serial.then(async()=>{
      try {await appendFile(this.path,JSON.stringify(copy)+'\n');}catch(e){this.lastError=e.message;console.error('PvP: falha ao salvar registro local.');}
      if(this.url && this.key){this.pending.set(copy.id,copy);await this.flushRemote();}
    }); return this.serial;
  }
  async flushRemote() {
    if(!this.pending.size)return;
    const batch=[...this.pending.values()];
    try {
      const response=await fetch(`${this.url}/rest/v1/pvp_matches?on_conflict=id`,{method:'POST',headers:{apikey:this.key,Authorization:`Bearer ${this.key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify(batch.map(payload=>({id:payload.id,created_at:payload.startedAt,payload}))),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error(`Supabase HTTP ${response.status}`);
      for(const item of batch)this.pending.delete(item.id); this.lastError='';
    }catch(e){this.lastError=e.message;console.error('PvP: sincronização remota pendente; nova tentativa em 30 segundos.');}
  }
  status(){return {local:true,remoteConfigured:!!(this.url&&this.key),pending:this.pending.size,error:!!this.lastError};}
}
export function summarize(records,{hero='',version='',gem='',reason=''}={}) {
  const matches=records.filter(r=>(!hero||r.loadouts.some(l=>l.team.includes(hero)))&&(!version||r.rulesVersion===version)&&(!gem||r.loadouts.some(l=>Object.values(l.gems).flat().includes(gem)))&&(!reason||r.reason===reason));
  const heroes={};
  for(const match of matches) for(let side=0;side<2;side++) for(const id of match.loadouts[side].team){
    const row=heroes[id]??={hero:id,appearances:0,combatGames:0,wins:0,damage:0,healing:0,shield:0}; row.appearances++;
    if(match.reason==='combat'){row.combatGames++;row.wins+=Number(match.winner===side);}
    const stats=match.finalState.units.find(u=>u.side===side&&u.heroId===id)?.stats||{};
    row.damage+=stats.damage||0;row.healing+=stats.healing||0;row.shield+=stats.shieldGranted||0;
  }
  return {total:matches.length,combatMatches:matches.filter(r=>r.reason==='combat').length,heroes:Object.values(heroes).map(r=>({...r,winRate:r.combatGames?r.wins/r.combatGames:null})),matches:matches.map(({steps,initial,finalState,...r})=>r)};
}
