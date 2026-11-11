'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAtalaia}=require('../src/lib/games/atalaia.ts');
const {runGodot}=require('../scripts/godot-process.cjs');
test('Godot build rejects script errors even when the engine exits successfully',()=>{
 for(const diagnostic of ['SCRIPT ERROR: Invalid access to property', 'Parse Error: Invalid syntax', 'ERROR: Failed to load resource']) {
  assert.throws(()=>runGodot(process.execPath,['-e',`console.error(${JSON.stringify(diagnostic)})`]),/Godot/);
 }
});
test('Godot build preserves nonzero process failure and accepts warnings without calling them script errors',()=>{
 assert.throws(()=>runGodot(process.execPath,['-e','process.exit(7)']),error=>error.status===7);
 assert.doesNotThrow(()=>runGodot(process.execPath,['-e',"console.log('Godot ready');console.warn('WARNING: Optional driver unavailable')"]));
});
test('Godot checks cannot pass by exiting before their completion marker',()=>{
 const expectedOutput=/ALL CHECKS COMPLETED/;
 assert.throws(()=>runGodot(process.execPath,['-e',"console.log('Starting checks');process.exit(0)"],{expectedOutput}),/completion/i);
 assert.doesNotThrow(()=>runGodot(process.execPath,['-e',"console.log('ALL CHECKS COMPLETED')"],{expectedOutput}));
});
test('Atalaia only opens the separate web game after an explicit launch', async()=>{
 let views=0,launches=0;
 const game=createAtalaia({desktop:false,openView(){views++;},launchWeb(){launches++;}});
 game.open();assert.equal(views,1);assert.equal(launches,0);
 await game.launch();assert.equal(launches,1);assert.match(game.getSnapshot().status,/outra aba/);
 game.open();assert.equal(launches,1);
 game.dispose();await game.launch();assert.equal(launches,1);
});
test('Atalaia native launch suppresses duplicate clicks, reports failures and permits another attempt',async()=>{
 let reject,calls=0; const game=createAtalaia({desktop:true,openView(){},launchNative(){calls++;return new Promise((_,r)=>reject=r);}});
 const pending=game.launch();await game.launch();assert.equal(calls,1);assert(game.getSnapshot().busy);
 reject(new Error('ERR_CONNECTION_RESET'));await pending;assert.match(game.getSnapshot().status,/ERR_CONNECTION_RESET/);assert.equal(game.getSnapshot().busy,false);
 const next=game.launch();game.dispose();reject(new Error('closed'));await next;assert.equal(calls,2);
});
test('old Windows app receives an update instruction instead of a blocked iframe',async()=>{
 const game=createAtalaia({desktop:true,openView(){}});await game.launch();assert.match(game.getSnapshot().status,/Atualize/);
});
