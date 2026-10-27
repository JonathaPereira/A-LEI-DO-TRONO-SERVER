'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{publishBuild,planBuildRetention,MARKER}=require('../scripts/desktop/publish-build.cjs');
const release=(v,run,options={})=>({id:run,tag_name:`desktop-v${v}-run-${run}`,draft:true,body:MARKER,assets:[`MN-Trono-${v}-Windows.exe`,`MN-Trono-Site-Leve-${v}.zip`,`SHA256SUMS-${v}.txt`].map(name=>({name,state:'uploaded'})),...options});
test('private builds keep one complete download pair per version for the latest two; preserve manual drafts and incomplete deliveries',()=>{
  const rows=[release('0.1.9',9),release('0.1.10',10),release('0.1.11',11),release('0.1.11',12),release('0.1.12',13,{body:'Manual draft'}),release('0.1.13',14,{assets:[]})],plan=planBuildRetention(rows);
  assert.deepEqual(plan.keep,[12,10]);assert.deepEqual(plan.remove,[9,11]);
});
test('private delivery uploads a matched EXE, site and checksums before retiring old builds; upload failure only removes the new draft',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mn-build-downloads-'));
  try{
    for(const dir of ['electron','artifacts/windows-download'])await fs.mkdir(path.join(root,dir),{recursive:true});
    await fs.writeFile(path.join(root,'electron/package.json'),'{"version":"0.1.12"}');await fs.writeFile(path.join(root,'electron/LEIA-ME-WINDOWS.txt'),'Instructions');await fs.writeFile(path.join(root,'artifacts/windows-download/MN-Trono-0.1.12-Windows.exe'),'MZ exe');await fs.writeFile(path.join(root,'artifacts/MN-Trono-Frontend-0.1.12.zip'),'PK site');await fs.writeFile(path.join(root,'artifacts/Atalaia-Web-0.1.12.zip'),'PK game');
    const uploads=[],deleted=[],events=[];let fail=false;
    const github={paginate:async()=>[release('0.1.9',9),release('0.1.11',11),release('0.1.12',12)],rest:{repos:{listReleases(){},createRelease:async args=>{assert.equal(args.draft,true);assert.equal(args.target_commitish,'commit');return {data:{id:12,html_url:'https://github.com/owner/private/releases/12'}};},uploadReleaseAsset:async args=>{events.push('upload');if(fail)throw Error('Network failed');uploads.push(args);},deleteRelease:async args=>{events.push('delete');deleted.push(args.release_id);}}}};
    const summary={addHeading(){return this;},addRaw(){return this;},async write(){}},options={root,additionalFiles:['artifacts/Atalaia-Web-0.1.12.zip'],github,context:{repo:{owner:'owner',repo:'private'},sha:'commit',runId:12},core:{notice(){},summary}};
    const delivered=await publishBuild(options);assert.equal(delivered.tag,'desktop-v0.1.12-run-12-attempt-'+(process.env.GITHUB_RUN_ATTEMPT||'1'));assert.equal(uploads.length,5);assert.equal(uploads[3].name,'Atalaia-Web-0.1.12.zip');assert.match(uploads[4].data.toString(),/^[a-f0-9]{64}  MN-Trono-0\.1\.12-Windows\.exe/m);assert.deepEqual(deleted,[9]);assert.deepEqual(events,['upload','upload','upload','upload','upload','delete']);
    fail=true;deleted.length=0;await assert.rejects(publishBuild(options),/Network failed/);assert.deepEqual(deleted,[12]);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});


test('Surge automatically selects the newest complete Windows delivery from this exact commit and validated attempt', async () => {
  const {findApprovedBuild}=require('../scripts/desktop/approved-build.cjs');
  const sha='a'.repeat(40),required=['Validate and package Windows'];
  const candidate=(run,attempt=1,extra={})=>release('0.1.12',run,{tag_name:`desktop-v0.1.12-run-${run}-attempt-${attempt}`,target_commitish:sha,assets:['MN-Trono-0.1.12-Windows.exe','MN-Trono-Frontend-0.1.12.zip','SHA256SUMS-0.1.12.txt'].map(name=>({name,state:'uploaded'})),...extra});
  const rows=[candidate(8),candidate(10,1),candidate(10,2),candidate(12,1,{target_commitish:'b'.repeat(40)}),candidate(13,1,{assets:[]})];
  let rejectedJob='',wrongRun=false;
  const github={rest:{repos:{listReleases(){}},actions:{getWorkflowRun:async({run_id})=>({data:{id:run_id,name:'Windows full app',path:'.github/workflows/windows-app.yml',head_sha:wrongRun?'b'.repeat(40):sha}}),listJobsForWorkflowRun(){}}},paginate:async(fn)=>fn===github.rest.repos.listReleases?rows:required.flatMap(name=>[1,2].map(run_attempt=>({name,run_attempt,conclusion:name===rejectedJob?'failure':'success'})))};
  const options={github,context:{repo:{owner:'owner',repo:'private'},sha},version:'0.1.12'};
  await assert.rejects(findApprovedBuild({...options,additionalAssets:['Atalaia-Web-0.1.12.zip']}),/Nenhuma entrega/);
  assert.deepEqual(await findApprovedBuild(options),{tag:'desktop-v0.1.12-run-10-attempt-2',version:'0.1.12',sha});
  assert.equal((await findApprovedBuild({...options,requested:'desktop-v0.1.12-run-8-attempt-1'})).tag,'desktop-v0.1.12-run-8-attempt-1');
  for(const name of required){rejectedJob=name;await assert.rejects(findApprovedBuild(options),/Nenhuma entrega/);}
  rejectedJob='';wrongRun=true;await assert.rejects(findApprovedBuild(options),/Nenhuma entrega/);
  await assert.rejects(findApprovedBuild({...options,requested:'desktop-v0.1.11-run-8'}),/Tag/);
});


test('Surge requires validation from the exact artifact-producing attempt, never an earlier success', async () => {
  const {findApprovedBuild}=require('../scripts/desktop/approved-build.cjs'),sha='a'.repeat(40);
  const row=release('0.1.12',10,{tag_name:'desktop-v0.1.12-run-10-attempt-2',target_commitish:sha,assets:['MN-Trono-0.1.12-Windows.exe','MN-Trono-Frontend-0.1.12.zip','SHA256SUMS-0.1.12.txt'].map(name=>({name,state:'uploaded'}))});
  const prior=[];
  const delivery={name:'Validate and package Windows',run_attempt:2,conclusion:'success'};
  let jobs=[...prior,{...delivery,run_attempt:1,conclusion:'failure'},delivery,{...delivery,run_attempt:3,conclusion:'in_progress'}];
  const github={rest:{repos:{listReleases(){}},actions:{getWorkflowRun:async()=>({data:{path:'.github/workflows/windows-app.yml',head_sha:sha}}),listJobsForWorkflowRunAttempt(){},listJobsForWorkflowRun(){}}},paginate:async fn=>fn===github.rest.repos.listReleases?[row]:fn===github.rest.actions.listJobsForWorkflowRunAttempt?[delivery]:jobs};
  const options={github,context:{repo:{owner:'owner',repo:'private'},sha},version:'0.1.12'};
  assert.equal((await findApprovedBuild(options)).tag,row.tag_name);
  jobs=jobs.map(job => job.name===delivery.name && job.run_attempt===2 ? {...job,conclusion:'failure'} : job);
  await assert.rejects(findApprovedBuild(options),/Nenhuma entrega/);
  jobs=[{...delivery,run_attempt:1}];
  await assert.rejects(findApprovedBuild(options),/Nenhuma entrega/);
});

// Exercise the actual workflow pattern with TAP output, including PowerShell's
// case-insensitive matching. The summary is not itself a skipped test.
test('installer delivery rejects skipped tests but accepts a zero-skips TAP summary', async () => {
  const workflow = await fs.readFile(path.join(__dirname, '../.github/workflows/windows-app.yml'), 'utf8');
  const source = workflow.match(/-Path artifacts\/windows-installer\.log -Pattern '([^']+)'/)[1];
  const pattern = new RegExp(source, 'i');
  assert.equal(pattern.test('# skipped 0'), false);
  assert.equal(pattern.test('ok 1 - installer'), false);
  assert.equal(pattern.test('# skipped 1'), true);
  assert.equal(pattern.test('ok 1 - installer # SKIP runner unavailable'), true);
});
