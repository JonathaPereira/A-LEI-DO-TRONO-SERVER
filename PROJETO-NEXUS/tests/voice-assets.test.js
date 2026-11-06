import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HEROES} from '../src/data.js';
const root=new URL('../godot/assets/voices/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
const dialogue=JSON.parse(readFileSync(new URL('../godot/data/voice-lines.json',import.meta.url),'utf8'));
test('the pt-BR cast contains 96 original real clips for every active hero, independent of browser speech services',()=>{
 assert.equal(dialogue.synthetic,true);
 assert.deepEqual(Object.keys(dialogue.heroes).sort(),HEROES.map(h=>h.id).sort());
 assert.equal(Object.keys(manifest.clips).length,HEROES.length*4);
 for(const hero of HEROES)for(const event of ['select','skill','ultimate','victory']){
  const name=`${hero.id}-${event}.ogg`,entry=manifest.clips[name],data=readFileSync(new URL(name,root));
  assert.equal(entry.text,dialogue.heroes[hero.id].lines[event]);assert(entry.text.length>8);
  assert.equal(entry.sha256,createHash('sha256').update(data).digest('hex'),name);
  assert.equal(data.toString('ascii',0,4),'OggS',name);
  const header=data.indexOf(Buffer.from([1,...Buffer.from('vorbis')]));assert(header>0,name);
  assert.equal(data[header+11],1,`${name} mono`);assert.equal(data.readUInt32LE(header+12),24000,`${name} sample rate`);
  assert(entry.seconds>.5&&entry.seconds<4,name);assert(data.length>4000,name);
 }
 assert(!readdirSync(root).some(n=>/\.(onnx|bin|wav)$/.test(n)),'Only compressed recordings ship with the game');
});
