'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const binary=path.resolve(__dirname,'../artifacts/native-audio/Release/MN-Remote-Input.exe');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){let result;for(let i=0;i<100;i++){result=check();if(result)return result;await wait(50);}throw Error('XInput state did not converge');}
test('real Windows XInput keeps the host pad and guest pad separate and releases stalled reports',{timeout:30000,skip:process.platform!=='win32'&&'Requires Windows virtual controller driver'},async()=>{
 execFileSync(binary,['--probe']);const children=[],timers=[];
 async function pad(){const c=spawn(binary,['--gamepad'],{stdio:['pipe','pipe','pipe'],windowsHide:true});children.push(c);await new Promise((resolve,reject)=>{let text='',errors='';const timer=setTimeout(()=>reject(Error('Device did not start: '+errors)),10000);c.stderr.on('data',d=>errors+=d);c.once('error',reject);c.once('exit',code=>{if(code)reject(Error(errors));});c.stdout.on('data',d=>{text+=d;if(text.includes('READY ')){clearTimeout(timer);resolve();}});});return c;}
 const read=()=>JSON.parse(execFileSync(binary,['--read-xinput'],{encoding:'utf8'}));
 try{
  const local=await pad();local.stdin.write('g 4096 0 0 12345 0 0 0\n');timers.push(setInterval(()=>local.stdin.write('g 4096 0 0 12345 0 0 0\n'),80));const a=await until(()=>read().find(s=>s.lx===12345));
  const guest=await pad();guest.stdin.write('g 16384 128 0 -23456 0 0 0\n');let report=setInterval(()=>guest.stdin.write('g 16384 128 0 -23456 0 0 0\n'),80);timers.push(report);const b=await until(()=>read().find(s=>s.lx===-23456));assert.notEqual(a.index,b.index);let both=read();assert.equal(both.find(s=>s.index===a.index).buttons,4096);assert.equal(both.find(s=>s.index===b.index).buttons,16384);assert.equal(both.find(s=>s.index===b.index).lt,128);
  // Normal lease pulses must not keep stale held gamepad buttons alive.
  clearInterval(report);timers.push(setInterval(()=>guest.stdin.write('p\n'),150));await until(()=>read().find(s=>s.index===b.index)?.buttons===0);assert.equal(read().find(s=>s.index===a.index).buttons,4096);
  guest.stdin.end('r\nq\n');await until(()=>!read().some(s=>s.index===b.index));assert(read().some(s=>s.index===a.index));console.log('Verified independent real XInput slots',a.index,b.index);
 }finally{timers.forEach(clearInterval);for(const c of children){try{c.stdin.end('r\nq\n');}catch{}c.stdin.on('error',()=>{});await Promise.race([new Promise(r=>c.exitCode!==null?r():c.once('exit',r)),wait(2000).then(()=>c.kill())]);}}
});
