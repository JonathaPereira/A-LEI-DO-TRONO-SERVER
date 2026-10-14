'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const MARKER='<!-- mn-desktop-build-v1 -->';
const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return y[0]-x[0]||y[1]-x[1]||y[2]-x[2];};
function planBuildRetention(releases){
  const builds=releases.flatMap(r=>{const match=/^desktop-v(\d+\.\d+\.\d+)-run-(\d+)(?:-attempt-(\d+))?$/.exec(r.tag_name||'');return match&&r.draft&&r.body?.includes(MARKER)&&[`MN-Trono-${match[1]}-Windows.exe`,`MN-Trono-Site-Leve-${match[1]}.zip`,`SHA256SUMS-${match[1]}.txt`].every(name=>r.assets?.some(a=>a.name===name&&a.state==='uploaded'))?[{...r,version:match[1],run:Number(match[2]),attempt:Number(match[3]||1)}]:[];});
  const versions=[...new Set(builds.map(b=>b.version))].sort(compare).slice(0,2),keep=[];
  for(const v of versions)keep.push(builds.filter(b=>b.version===v).sort((a,b)=>b.run-a.run||b.attempt-a.attempt)[0].id);
  return {keep,remove:builds.filter(b=>!keep.includes(b.id)).map(b=>b.id)};
}
async function publishBuild({github,context,core,root=path.resolve(__dirname,'../..')}){
  const repo=context.repo,{version}=JSON.parse(await fs.readFile(path.join(root,'desktop/app/package.json'),'utf8'));
  if(!/^\d+\.\d+\.\d+$/.test(version)||!Number.isSafeInteger(Number(context.runId)))throw Error('Identidade do build inválida.');
  const files=[path.join(root,'artifacts/windows-download',`MN-Trono-${version}-Windows.exe`),path.join(root,'artifacts',`MN-Trono-Site-Leve-${version}.zip`),path.join(root,'desktop/app/LEIA-ME-WINDOWS.txt')];
  const bytes=await Promise.all(files.map(file=>fs.readFile(file))),sums=bytes.map((b,i)=>crypto.createHash('sha256').update(b).digest('hex')+'  '+path.basename(files[i])).join('\n')+'\n';
  const attempt=Number(process.env.GITHUB_RUN_ATTEMPT||1);if(!Number.isSafeInteger(attempt)||attempt<1)throw Error('Tentativa do build inválida.');
  const tag=`desktop-v${version}-run-${context.runId}-attempt-${attempt}`,runURL=`https://github.com/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`;
  const body=`${MARKER}\nPacotes validados de Windows ${version}. Commit: ${context.sha}.\n\nBaixe o EXE e o ZIP do site desta mesma entrega. O ZIP contém frontend/ e o guia de publicação; o EXE fica fora do site.\n\nPublique o EXE na release pública v${version} de JonathaPereira/MN-Trono-Downloads antes de publicar frontend/ no Surge. Consulte o guia da versão para as instruções de backend e SQL.\n\nBuild: ${runURL}\n\nSomente a versão atual e uma anterior são conservadas nestes downloads automáticos. Esta release é um rascunho privado para revisão e distribuição ao proprietário.`;
  const {data:release}=await github.rest.repos.createRelease({...repo,tag_name:tag,target_commitish:context.sha,name:`Pacotes Windows ${version} · build ${context.runId}`,draft:true,prerelease:true,body});
  try{
    const assets=[...files.map((file,i)=>({name:path.basename(file),data:bytes[i]})),{name:`SHA256SUMS-${version}.txt`,data:Buffer.from(sums)}];
    for(const asset of assets)await github.rest.repos.uploadReleaseAsset({...repo,release_id:release.id,name:asset.name,data:asset.data,headers:{'content-type':'application/octet-stream','content-length':asset.data.length}});
  }catch(error){await github.rest.repos.deleteRelease({...repo,release_id:release.id}).catch(()=>{});throw error;}
  const releases=await github.paginate(github.rest.repos.listReleases,{...repo,per_page:100}),plan=planBuildRetention(releases);
  for(const id of plan.remove)await github.rest.repos.deleteRelease({...repo,release_id:id});
  core.notice(`Downloads privados: ${release.html_url}`);await core.summary.addHeading(`Downloads Windows ${version}`).addRaw(`[Abrir os pacotes validados](${release.html_url})\n\nEXE e ZIP leve juntos nesta release privada; não usam a cota de artefatos dos Actions.\n`).write();
  return {url:release.html_url,id:release.id,removed:plan.remove};
}
module.exports={publishBuild,planBuildRetention,MARKER};
