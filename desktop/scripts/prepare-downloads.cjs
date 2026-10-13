'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function prepare(){
  const root=path.resolve(__dirname,'../..'),{version}=require('../app/package.json'),filename=`MN-Trono-${version}-Windows.exe`,source=path.join(root,'artifacts/windows-app',filename);
  const bytes=await fs.readFile(source);if(bytes.length<1024*1024||bytes[0]!==0x4d||bytes[1]!==0x5a)throw Error('Instalador Windows inválido.');
  const hash=crypto.createHash('sha512').update(bytes).digest('base64');
  const direct=path.join(root,'artifacts/windows-download'),site=path.join(root,'artifacts/site-download');
  await fs.rm(direct,{recursive:true,force:true});await fs.rm(site,{recursive:true,force:true});await fs.mkdir(direct,{recursive:true});
  await fs.copyFile(source,path.join(direct,filename));await fs.copyFile(path.join(root,'desktop/app/LEIA-ME-WINDOWS.txt'),path.join(direct,'LEIA-ME-WINDOWS.txt'));
  const frontend=path.join(site,'frontend');await fs.cp(path.join(root,'frontend'),frontend,{recursive:true,filter:input=>!path.relative(path.join(root,'frontend'),input).split(path.sep).includes('downloads')});
  const downloads=path.join(frontend,'downloads');await fs.mkdir(downloads,{recursive:true});await fs.copyFile(source,path.join(downloads,filename));
  await fs.writeFile(path.join(downloads,'latest.yml'),`version: ${version}\nfiles:\n  - url: ${filename}\n    sha512: ${hash}\n    size: ${bytes.length}\npath: ${filename}\nsha512: ${hash}\nreleaseDate: '${new Date().toISOString()}'\n`);
  const index=await fs.readFile(path.join(frontend,'index.html'),'utf8');await fs.writeFile(path.join(frontend,'index.html'),index.replace(/\/downloads\/MN-Trono-[^"/]+-Windows\.exe/g,'/downloads/'+filename).replace(/download="MN-Trono-[^"]+\.exe"/g,'download="'+filename+'"'));
  await fs.copyFile(path.join(root,'desktop/app/LEIA-ME-PUBLICAR.txt'),path.join(site,'LEIA-ME-PUBLICAR.txt'));
  await fs.copyFile(path.join(root,'supabase/upgrade-social.sql'),path.join(site,'SUPABASE-upgrade-social.sql'));
  await fs.copyFile(path.join(root,'ATUALIZAR_WINDOWS_v0.1.8.md'),path.join(site,'ATUALIZAR_WINDOWS_v0.1.8.md'));
  console.log(`Pacotes preparados: instalador ${version}, site e canal de atualização SHA-512.`);
}
prepare().catch(error=>{console.error(error.message);process.exitCode=1;});
