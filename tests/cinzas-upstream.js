'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
for(const name of ['check-game.cjs','check-exploration.cjs','check-regressions.cjs','check-controller.cjs','check-ui.cjs','check-v5.cjs','check-audio.cjs'])test('Cinzas v0.5 upstream '+name,{timeout:45000},()=>{
  const result=spawnSync(process.execPath,[name],{cwd:path.join(__dirname,'cinzas'),encoding:'utf8',timeout:40000});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/PASS|passed|checks|OK/i);
});
