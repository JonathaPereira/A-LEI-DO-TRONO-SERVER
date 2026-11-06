import {spawn} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createPvpServer} from '../server/pvp.mjs';
import {PvpStore} from '../server/pvp-store.mjs';
const scratch=await mkdtemp(join(tmpdir(),'nexus-pvp-godot-'));
const app=await createPvpServer({store:new PvpStore({directory:join(scratch,'logs')})});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const report=join(scratch,'report.json');
try{
 const child=spawn(process.env.GODOT_EXECUTABLE||'godot',['--headless','--audio-driver','Dummy','--path','godot','--script','res://tests/pvp.gd','--',`ws://127.0.0.1:${app.server.address().port}/pvp`,report],{env:{...process.env,XDG_DATA_HOME:join(scratch,'data'),XDG_CONFIG_HOME:join(scratch,'config'),XDG_CACHE_HOME:join(scratch,'cache')},stdio:['ignore','pipe','pipe']});
 let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{log+=bytes;process.stdout.write(bytes)});
 const timeout=setTimeout(()=>child.kill('SIGKILL'),180000);
 const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject)});clearTimeout(timeout);
 assert.equal(code,0,'Godot PvP integration exited successfully');assert(!/SCRIPT ERROR|Parse Error|ERROR:/i.test(log),log);
 const data=JSON.parse(await readFile(report,'utf8'));assert.equal(data.failures,0);await app.store.serial;
 const saved=app.store.records.find(r=>r.id===data.matchId);assert(saved);assert.equal(saved.reason,'combat');assert.deepEqual(saved.finalState,data.state);
 console.log('✓ Dois clientes Godot, servidor WebSocket e registro persistido terminaram a mesma partida.');
}finally{await app.close()}
