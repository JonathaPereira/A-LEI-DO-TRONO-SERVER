'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const DOWNLOAD_REPOSITORY='JonathaPereira/MN-Trono-Downloads';
const MAX_SITE_BYTES=50*1024*1024;
async function filesIn(dir){const result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await filesIn(file));else result.push({file,size:(await fs.stat(file)).size});}return result;}
async function prepareSite({root=path.resolve(__dirname,'../..'),version,installerPath,outputRoot,repository=DOWNLOAD_REPOSITORY}={}){
  version??=JSON.parse(await fs.readFile(path.join(root,'desktop/app/package.json'),'utf8')).version;
  if(!/^\d+\.\d+\.\d+$/.test(version)||!/^[-\w.]+\/[-\w.]+$/.test(repository))throw Error('Versão ou repositório de downloads inválido.');
  const filename=`MN-Trono-${version}-Windows.exe`,source=installerPath||path.join(root,'artifacts/windows-app',filename);
  const bytes=await fs.readFile(source);if(bytes.length<1024*1024||bytes[0]!==0x4d||bytes[1]!==0x5a)throw Error('Instalador Windows inválido.');
  const hash=crypto.createHash('sha512').update(bytes).digest('base64'),url=`https://github.com/${repository}/releases/download/v${version}/${filename}`;
  const artifacts=outputRoot||path.join(root,'artifacts'),direct=path.join(artifacts,'windows-download'),site=path.join(artifacts,'site-download');
  await fs.rm(direct,{recursive:true,force:true});await fs.rm(site,{recursive:true,force:true});await fs.mkdir(direct,{recursive:true});
  await fs.copyFile(source,path.join(direct,filename));await fs.copyFile(path.join(root,'desktop/app/LEIA-ME-WINDOWS.txt'),path.join(direct,'LEIA-ME-WINDOWS.txt'));
  const frontend=path.join(site,'frontend');await fs.cp(path.join(root,'frontend'),frontend,{recursive:true,filter:input=>{
    const relative=path.relative(path.join(root,'frontend'),input),parts=relative.split(path.sep);
    return !parts.includes('downloads')&&!parts.includes('node_modules')&&!/^(LEIA_ME_v|ATUALIZAR_v|AUDITORIA_PLAYTEST_v)/.test(relative)&&!/\.(exe|zip|tar|tgz)$/i.test(relative)&&relative!==path.join('manual','A_Lei_do_Trono_Manual_v0.4_Edicao_Visual.pdf');
  }});
  const downloads=path.join(frontend,'downloads');await fs.mkdir(downloads,{recursive:true});
  // Existing apps keep the original Surge feed. GenericProvider supports an
  // absolute HTTPS installer URL and still verifies its SHA-512 before install.
  await fs.writeFile(path.join(downloads,'latest.yml'),`version: ${version}\nfiles:\n  - url: ${url}\n    sha512: ${hash}\n    size: ${bytes.length}\npath: ${url}\nsha512: ${hash}\nreleaseDate: '${new Date().toISOString()}'\n`);
  const index=await fs.readFile(path.join(frontend,'index.html'),'utf8');
  if(!/href="[^"]*MN-Trono-[^"/]+-Windows\.exe"/.test(index))throw Error('Link do instalador não encontrado no frontend.');
  await fs.writeFile(path.join(frontend,'index.html'),index.replace(/href="[^"]*MN-Trono-[^"/]+-Windows\.exe"/g,'href="'+url+'"').replace(/download="MN-Trono-[^"]+\.exe"/g,'download="'+filename+'"'));
  await fs.copyFile(path.join(root,'desktop/app/LEIA-ME-PUBLICAR.txt'),path.join(site,'LEIA-ME-PUBLICAR.txt'));
  await fs.copyFile(path.join(root,'PUBLICAR_SURGE_LEVE.md'),path.join(site,'PUBLICAR_SURGE_LEVE.md'));
  await fs.copyFile(path.join(root,'ATUALIZAR_WINDOWS_v0.1.11.md'),path.join(site,'ATUALIZAR_WINDOWS_v0.1.11.md'));
  await fs.copyFile(path.join(root,'ATUALIZAR_WINDOWS_v0.1.10.md'),path.join(site,'ATUALIZAR_WINDOWS_v0.1.10.md'));
  await fs.copyFile(path.join(root,'supabase/upgrade-azul.sql'),path.join(site,'upgrade-azul.sql'));
  const files=await filesIn(frontend),siteBytes=files.reduce((sum,f)=>sum+f.size,0);
  if(files.some(f=>/\.(exe|zip|tar|tgz)$/i.test(f.file))||siteBytes>MAX_SITE_BYTES)throw Error('O pacote do site excedeu o limite preventivo de 50 MiB ou contém instaladores/arquivos compactados.');
  await fs.writeFile(path.join(site,'TAMANHO-E-DOWNLOAD.json'),JSON.stringify({version,siteBytes,installerBytes:bytes.length,installerURL:url,sha512:hash,installerSHA256:crypto.createHash('sha256').update(bytes).digest('hex')},null,2)+'\n');
  return {version,frontend,direct,site,siteBytes,installerBytes:bytes.length,url,sha512:hash};
}
module.exports={prepareSite,DOWNLOAD_REPOSITORY,MAX_SITE_BYTES};
