'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {APP_ORIGIN,isAppURL,bundlePath,clipFilename,accelerator}=require('../desktop/app/policy.cjs');
const {clipBytes,writeClip}=require('../desktop/app/clip-files.cjs');
test('desktop origin and local bundle reject external domains, encoded traversal and invalid names',()=>{
  const root=path.resolve(os.tmpdir(),'mn-bundle');assert(isAppURL(APP_ORIGIN+'/index.html'));for(const url of ['file:///index.html',APP_ORIGIN+'.evil.test/',APP_ORIGIN.replace('https:','http:'),'bad'])assert(!isAppURL(url));
  assert.equal(bundlePath(root,APP_ORIGIN+'/'),path.join(root,'index.html'));
  for(const suffix of ['/%2e%2e%2fsecret','/%00','/%5csecret'])assert.throws(()=>bundlePath(root,APP_ORIGIN+suffix));
  for(const name of ['../Trono_Clipe_a.webm','Trono_Clipe_a.exe','a.webm','Trono_Clipe_a.webm/other'])assert.throws(()=>clipFilename(name));assert.equal(clipFilename('Trono_Clipe_2026-10-10_ab.webm'),'Trono_Clipe_2026-10-10_ab.webm');
});
test('global shortcuts validate modifiers, keys and reserved combinations',()=>{
  assert.equal(accelerator({ctrl:true,shift:true,code:'KeyK'}),'Control+Shift+K');assert.equal(accelerator({code:'F9'}),'F9');
  for(const value of [null,{code:'KeyK'},{code:'F5'},{code:'F25'},{ctrl:true,code:'KeyW'},{alt:true,code:'F4'},{ctrl:true,code:'Delete'},{ctrl:true,code:'KeyK+F4'}])assert.throws(()=>accelerator(value));
});
test('native clip exports commit atomically, preserve existing files and clean failures',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mn-files-'));try{
    const bytes=clipBytes(Uint8Array.from([0x1a,0x45,0xdf,0xa3,1,2]).buffer);assert.throws(()=>clipBytes(Uint8Array.from([1,2,3,4]).buffer));assert.throws(()=>clipBytes(new ArrayBuffer(2)));
    const target=path.join(directory,'clip.webm');await writeClip(target,bytes);assert.deepEqual(await fs.readFile(target),bytes);
    await assert.rejects(writeClip(target,Buffer.from('replacement')),error=>error.code==='EEXIST');assert.deepEqual(await fs.readFile(target),bytes);
    await writeClip(target,Buffer.from('replacement'),{overwrite:true});assert.equal(await fs.readFile(target,'utf8'),'replacement');
    await assert.rejects(writeClip(path.join(directory,'missing','clip.webm'),bytes));assert.deepEqual(await fs.readdir(directory),['clip.webm']);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
