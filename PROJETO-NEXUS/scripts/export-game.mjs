import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';
import {BUILD} from '../server/pvp-loadout.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const output=resolve(root,'artifacts/web-game');
const endpoint=process.env.PVP_PUBLIC_URL||'wss://nexus-pvp.onrender.com/pvp';
if(!/^wss?:\/\/[^\s<>"']+\/pvp$/.test(endpoint))throw Error('PVP_PUBLIC_URL deve ser ws(s)://HOST/pvp');
const manifest=JSON.parse(await readFile(resolve(root,'godot/data/pvp-build.json'),'utf8'));
if(manifest.build!==BUILD)throw Error('Catálogo/regras mudaram. Execute npm run sync:godot antes de exportar.');
await mkdir(output,{recursive:true});
const godot=process.env.GODOT_EXECUTABLE||'godot';
for(const args of [['--headless','--path','godot','--editor','--import','--quit'],['--headless','--path','godot','--export-release','Web',resolve(output,'index.html')]]){
 const r=spawnSync(godot,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});const log=(r.stdout||'')+(r.stderr||'');
 if(r.error||r.status!==0||/SCRIPT ERROR|Parse Error|ERROR:/i.test(log))throw Error(`Exportação falhou. Instale Godot 4.6.3 e os modelos de exportação da mesma versão.\n${log}\n${r.error?.message||''}`);
}
const htmlPath=resolve(output,'index.html');const html=await readFile(htmlPath,'utf8');
await writeFile(htmlPath,html.replace('<html lang="en">','<html lang="pt-BR">').replace('</head>',`<script>window.NEXUS_PVP_SERVER=${JSON.stringify(endpoint)};</script>\n</head>`));
const files={};
for(const name of await readdir(output)){
 if(name.endsWith('.tmp'))continue;
 files[name]=new Uint8Array(await readFile(resolve(output,name)));
}
const zip=zipSync(files,{level:6});const archive=resolve(root,'artifacts/nexus-web.zip');await writeFile(archive,zip);
console.log(`Exportação Godot pronta: ${relative(root,archive)} (${(zip.length/1048576).toFixed(1)} MiB).`);
console.log(`Servidor configurado no jogo: ${endpoint}`);
if(endpoint.startsWith('ws:'))console.log('Para publicar em HTTPS, gere novamente com PVP_PUBLIC_URL=wss://SEU-SERVIDOR/pvp.');
