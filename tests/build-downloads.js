'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{publishBuild,planBuildRetention,MARKER}=require('../desktop/scripts/publish-build.cjs');
const release=(v,run,options={})=>({id:run,tag_name:`desktop-v${v}-run-${run}`,draft:true,body:MARKER,assets:[`MN-Trono-${v}-Windows.exe`,`MN-Trono-Site-Leve-${v}.zip`,`SHA256SUMS-${v}.txt`].map(name=>({name,state:'uploaded'})),...options});
test('private builds keep one complete download pair per version for the latest two; preserve manual drafts and incomplete deliveries',()=>{
  const rows=[release('0.1.9',9),release('0.1.10',10),release('0.1.11',11),release('0.1.11',12),release('0.1.12',13,{body:'Manual draft'}),release('0.1.13',14,{assets:[]})],plan=planBuildRetention(rows);
  assert.deepEqual(plan.keep,[12,10]);assert.deepEqual(plan.remove,[9,11]);
});
test('private delivery uploads a matched EXE, site and checksums before retiring old builds; upload failure only removes the new draft',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mn-build-downloads-'));
  try{
    for(const dir of ['desktop/app','artifacts/windows-download'])await fs.mkdir(path.join(root,dir),{recursive:true});
    await fs.writeFile(path.join(root,'desktop/app/package.json'),'{"version":"0.1.12"}');await fs.writeFile(path.join(root,'desktop/app/LEIA-ME-WINDOWS.txt'),'Instructions');await fs.writeFile(path.join(root,'artifacts/windows-download/MN-Trono-0.1.12-Windows.exe'),'MZ exe');await fs.writeFile(path.join(root,'artifacts/MN-Trono-Frontend-0.1.12.zip'),'PK site');
    const uploads=[],deleted=[],events=[];let fail=false;
    const github={paginate:async()=>[release('0.1.9',9),release('0.1.11',11),release('0.1.12',12)],rest:{repos:{listReleases(){},createRelease:async args=>{assert.equal(args.draft,true);assert.equal(args.target_commitish,'commit');return {data:{id:12,html_url:'https://github.com/owner/private/releases/12'}};},uploadReleaseAsset:async args=>{events.push('upload');if(fail)throw Error('Network failed');uploads.push(args);},deleteRelease:async args=>{events.push('delete');deleted.push(args.release_id);}}}};
    const summary={addHeading(){return this;},addRaw(){return this;},async write(){}},options={root,github,context:{repo:{owner:'owner',repo:'private'},sha:'commit',runId:12},core:{notice(){},summary}};
    await publishBuild(options);assert.equal(uploads.length,4);assert.match(uploads[3].data.toString(),/^[a-f0-9]{64}  MN-Trono-0\.1\.12-Windows\.exe/m);assert.deepEqual(deleted,[9]);assert.deepEqual(events,['upload','upload','upload','upload','delete']);
    fail=true;deleted.length=0;await assert.rejects(publishBuild(options),/Network failed/);assert.deepEqual(deleted,[12]);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
