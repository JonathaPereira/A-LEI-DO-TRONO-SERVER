(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AbyssLevels=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const surface=(p,x)=>p.y+(p.y2===undefined?0:(p.y2-p.y)*Math.max(0,Math.min(1,(x-p.x)/p.w)));
  const TERRAIN={normal:{name:'Pedra firme',color:'#9ead94'},mud:{name:'Lama · movimento reduzido',color:'#947953'},water:{name:'Água rasa · passos pesados',color:'#7acbdb'},ice:{name:'Gelo · menor aderência',color:'#b0e9fa'},wind:{name:'Vento · corrente horizontal',color:'#d9d7e4'},lava:{name:'Brasa · causa queimadura',color:'#ff9f67'},spring:{name:'Raízes elásticas · pulo ampliado',color:'#a9e58d'},conveyor:{name:'Esteira · transporte lateral',color:'#dfb27b'}};
  // Each chapter has its own authored elevation profile and landmark sequence.
  // Entries are [length, end elevation, landmark, terrain, optional route kind].
  const CHAPTERS=[
    {name:'O caminho das lanternas',biome:0,weather:'mist',sections:[[840,558,'Primeiras cinzas'],[780,860,'Riacho das lanternas','water'],[1000,860,'Bosque das raízes','spring','canopy'],[750,365,'Subida dos corvos'],[1100,365,'Passarelas da copa','wind','bridge'],[850,1040,'Fenda do guardião'],[1200,1040,'Lago subterrâneo','water','lift'],[920,680,'Escarpa verde'],[980,680,'Jardim de lama','mud'],[800,340,'Farol da floresta'],[780,340,'Círculo do viajante']]},
    {name:'Pântano das vozes',biome:0,weather:'rain',sections:[[780,558,'Margem silenciosa'],[750,970,'Trilha inundada','water'],[1250,970,'Pântano dos ecos','mud','islands'],[750,570,'Raízes retorcidas','spring'],[880,570,'Ponte das vozes','wind','bridge'],[700,820,'Canal do esquecimento','water'],[1100,820,'Ilhas dos fungos','mud','islands'],[900,360,'Rochedo das bruxas'],[1000,360,'Jardim suspenso','spring','canopy'],[820,730,'Descida da névoa'],[900,730,'Altar dos afogados']]},
    {name:'As cavernas vivas',biome:0,weather:'spores',background:'cave',sections:[[850,650,'Boca da caverna'],[1100,1160,'Descida dos ossos'],[1300,1160,'Cristais do fundo','water','lift'],[1000,930,'Galerias dos fungos','mud'],[900,530,'Poço das raízes','spring','lift'],[1200,530,'Galeria de âmbar','wind','bridge'],[1100,1030,'Abismo das esporas'],[1200,1030,'Cemitério submerso','water','islands'],[1100,620,'Escadaria viva'],[1000,620,'Coração mineral','spring']]},
    {name:'Penhascos da lua',biome:0,weather:'wind',sections:[[950,558,'Vigília dos corvos'],[850,240,'Escarpa lunar','wind'],[1350,240,'Pontes de corda','wind','bridge'],[950,920,'Cascata prateada','water'],[1300,920,'Bacia das sombras','mud','lift'],[850,410,'Paredão dos ventos','spring'],[1000,410,'Terraços da lua','wind','canopy'],[850,710,'Vale das sentinelas'],[1100,710,'A última clareira','spring'],[850,315,'Portão do guardião'],[800,315,'Véu de raízes']]},
    {name:'Santuário de raízes',biome:0,boss:true,weather:'spores'},
    {name:'O aqueduto partido',biome:1,weather:'rain',sections:[[900,640,'Portão do eclipse'],[1000,960,'Reservatório antigo','water'],[1200,960,'Arcos submersos','water','islands'],[850,510,'Escadaria dos reis'],[1600,510,'Aqueduto suspenso','wind','bridge'],[1100,780,'Claustro abandonado'],[1300,780,'Canais de mármore','water'],[1050,320,'Torre de observação','wind','lift'],[1200,320,'Jardim das estátuas'],[950,620,'Passagem das catacumbas'],[900,620,'Praça do relógio']]},
    {name:'Cripta do inverno',biome:1,weather:'snow',background:'winter',sections:[[1000,558,'Umbral gelado','ice'],[1050,1120,'Escada dos mortos'],[1600,1120,'Rio congelado','ice','islands'],[900,720,'Degraus de alabastro'],[1250,720,'Salão dos espelhos','ice'],[1100,290,'Torre congelada','wind','lift'],[1300,290,'Varanda das estrelas','ice','bridge'],[1000,900,'Sepulcro dos reis'],[1400,900,'Jardim de cristal','ice'],[1100,460,'Saída da cripta']]},
    {name:'Biblioteca suspensa',biome:1,weather:'eclipse',sections:[[950,690,'Arquivo dos perdidos'],[1100,400,'Escada dos escribas'],[1450,400,'Galerias abertas','wind','bridge'],[1000,850,'Pátio das páginas'],[1350,850,'Biblioteca inferior','conveyor','lift'],[950,260,'Torre dos astrólogos'],[1500,260,'Passarela do saber','wind','bridge'],[1000,670,'Observatório partido'],[1300,670,'Arquivo das constelações','conveyor'],[1000,1010,'Salão das profecias'],[1400,1010,'O livro sem fim','ice']]},
    {name:'Jardins do eclipse',biome:1,weather:'eclipse',sections:[[1000,558,'Pátio dos relógios'],[1200,920,'Vale das estátuas','water'],[1500,920,'Jardim de prata','ice','islands'],[1150,365,'Terraço dos videntes'],[1550,365,'Pontes do ocaso','wind','bridge'],[1100,750,'Espelhos esquecidos'],[1450,750,'Labirinto das sombras','conveyor','lift'],[950,280,'Torre do eclipse','wind'],[1250,280,'Escadaria celeste','ice'],[1000,650,'Caminho da sentinela'],[1000,650,'O trono espera']]},
    {name:'Trono do eclipse',biome:1,boss:true,weather:'eclipse'},
    {name:'Minas de obsidiana',biome:2,weather:'embers',background:'cave',sections:[[1050,620,'Portal das minas'],[1400,1130,'Poço dos mineiros'],[1700,1130,'Esteiras de carvão','conveyor','lift'],[1050,770,'Galeria da escória'],[1200,770,'Lago de brasa','lava','islands'],[1200,340,'Elevador de minério','conveyor','lift'],[1350,340,'Ponte de obsidiana','wind','bridge'],[1150,1000,'A falha ardente'],[1550,1000,'Veios de cobre','lava','islands'],[1200,550,'Boca da fornalha']]},
    {name:'Fundição das correntes',biome:2,weather:'smoke',sections:[[1150,650,'Pátio das correntes'],[1250,950,'Caldeira inferior','lava','islands'],[1550,950,'Oficina dos colossos','conveyor','lift'],[1100,420,'Escada de ferro'],[1750,420,'Passarela dos guindastes','wind','bridge'],[1250,790,'Forno abandonado','lava','islands'],[1500,790,'Linha de fundição','conveyor'],[1050,280,'Torre das correntes'],[1600,280,'Corridor de pressão','wind'],[1200,670,'Martelo da forja'],[1000,670,'Vigília de ferro']]},
    {name:'O rio de fogo',biome:2,weather:'embers',sections:[[1050,558,'Margem carbonizada'],[1300,990,'Cascata de escória','lava','islands'],[1950,990,'Ilhas incandescentes','lava','islands'],[1200,650,'Penhasco de basalto'],[1550,650,'Ponte das cinzas','wind','bridge'],[1150,270,'Escarpa fumegante'],[1750,270,'Caminho das brasas','lava','islands'],[1200,870,'Vale dos condenados'],[1600,870,'Corrente de fogo','conveyor','lift'],[1350,390,'A última subida'],[1100,390,'Portão de carvão']]},
    {name:'A cidadela em chamas',biome:2,weather:'storm',sections:[[1100,700,'Muralhas queimadas'],[1300,390,'Escada do cerco'],[1800,390,'Bastião dos martelos','conveyor','bridge'],[1200,1000,'O fosso de cinzas','lava','islands'],[1800,1000,'Cidade inferior','lava','lift'],[1300,650,'Ruínas dos soldados'],[1750,650,'Praça dos brasões','conveyor'],[1100,260,'Torre do rei','wind'],[1700,260,'Passarela da coroa','wind','bridge'],[1200,780,'Portões da forja'],[1450,780,'A promessa final','lava','islands'],[1000,500,'Antes da última chama']]},
    {name:'Coração da forja',biome:2,boss:true,weather:'embers'}
  ];
  function create({mode='adventure',boss=false,stage=0,biome=0,rng=()=>.5}){
    const platforms=[],zones=[],shrines=[],relics=[],decor=[],tunnels=[];let uid=0;
    const add=(x,y,w,options={})=>{const p={id:++uid,x,y,w,h:24,oneWay:true,material:biome,effect:'normal',...options};platforms.push(p);return p;};
    const chapter=mode==='adventure'?CHAPTERS[Math.min(stage,CHAPTERS.length-1)]:null;
    let width,height=1540,spawn={x:110,y:558},checkpoint;
    if(mode==='horde'){
      width=2400;height=1340;const variation=stage%7;
      const profiles=[[[2400,770]],[[550,770],[460,980],[380,980],[470,770],[540,770]],[[2400,770]],[[650,770],[430,990],[520,990],[450,770],[350,770]],[[600,760],[420,1050],[480,1050],[430,680],[470,680]],[[700,900],[500,700],[500,700],[700,900]],[[2400,840]]];
      let gx=0,gy=profiles[variation][0][1];
      for(const [w,endY] of profiles[variation]){const effect=variation===2?'ice':variation===4?'water':variation===5?'conveyor':variation===6?'wind':'normal';add(gx,gy,w,{ground:true,oneWay:false,y2:endY,h:340,effect});zones.push({x:gx,w,name:['Círculo aberto','Ravina das sombras','Lago congelado','Galeria subterrânea','Cisterna dos condenados','Fundição móvel','Pontes dos ventos'][variation],effect});gx+=w;gy=endY;}
      const heights=variation===2?[610,430,540,360,600]:variation===3?[600,690,630,630,600]:[630,490,360,490,630];
      for(let i=0;i<5;i++)add(140+i*455,heights[i],300,{kind:i%2?'rock':'bridge',effect:variation===2?'ice':variation===5?'conveyor':'normal'});
      add(740,630,160,{moving:true,baseY:630,amplitude:100,speed:.8,phase:0});add(1450,630,160,{moving:true,baseY:630,amplitude:100,speed:.8,phase:Math.PI});
      if(variation===3||variation===4){const low=platforms.find(p=>p.oneWay===false&&p.y>=980&&p.y===p.y2);if(low)tunnels.push({x:low.x+40,w:low.w-80,floorId:low.id,clearance:260,kind:variation===3?'crypt':'drain'});}
      const center=platforms.find(p=>p.oneWay===false&&1200>=p.x&&1200<=p.x+p.w);checkpoint={x:1200,y:surface(center,1200)};spawn={x:1160,y:surface(center,1160)};
      decor.push({x:340,y:surface(platforms[0],340),type:'torch'},{x:2070,y:surface(platforms.filter(p=>p.oneWay===false).at(-1),2070),type:'torch'});
    }else if(boss||chapter.boss){
      width=2900;height=1160;add(0,760,width,{ground:true,oneWay:false,h:400});
      const perches=biome===0?[[250,590,330],[930,430,260],[1690,430,260],[2330,590,330]]:biome===1?[[200,580,260],[620,390,280],[1230,540,340],[1980,390,280],[2440,580,260]]:[[230,560,300],[780,440,220],[1860,440,220],[2370,560,300]];
      perches.forEach(([x,y,w])=>add(x,y,w,{kind:biome===2?'bridge':'rock',effect:biome===1?'ice':'normal'}));
      spawn={x:110,y:760};checkpoint={x:width-160,y:760};zones.push({x:0,w:width,name:chapter.name});decor.push({x:600,y:760,type:'torch'},{x:width-600,y:760,type:'torch'});
    }else{
      let x=0,y=chapter.sections[0][1];spawn={x:110,y};
      chapter.sections.forEach(([length,endY,name,effect='normal',route],i)=>{
        // Seed only alters secondary routes; the landmark topology stays unique.
        const bridge=route==='bridge',p=add(x,y,length,{ground:!bridge,oneWay:false,y2:endY,h:bridge?90:420,kind:bridge?'bridge':'rock',effect});zones.push({x,w:length,y,y2:endY,name,effect,background:effect==='ice'?'winter':chapter.background||['forestHD','ruins','forge'][biome]});
        const at=offset=>surface(p,x+offset);
        if(stage%5===1&&i===Math.floor(chapter.sections.length/2)){
          const sx=x+length*.78,sy=surface(p,sx);if(effect==='lava'){const station=add(sx-120,sy-95,260,{kind:'rock'});shrines.push({id:'shrine-'+i,x:sx,y:station.y,used:false});}else shrines.push({id:'shrine-'+i,x:sx,y:sy,used:false});
        }
        if(route==='islands'||effect==='lava'){
          for(let j=40;j<length-100;j+=225){const py=at(j+95)-95;add(x+j,py,190,{kind:'rock'});}relics.push({x:x+length*.5,y:at(length*.5)-150,taken:false});
        }else if(route||i%3===2){
          const middle=x+length*.46,base=surface(p,middle),shift=Math.floor(rng()*65);add(middle-150,base-145,280,{kind:route==='bridge'?'bridge':'rock'});add(middle+145+shift,base-270,250,{effect:effect==='ice'?'ice':'normal'});relics.push({x:middle+260+shift,y:base-310,taken:false});
          if(route==='lift'||route==='canopy')add(x+70,base-80,150,{moving:true,baseY:base-80,amplitude:125,speed:.7,phase:i});
        }
        if(endY<y-300){for(let j=180;j<length-180;j+=200)add(x+j,at(j)-120,145,{kind:'step'});}
        decor.push({x:x+100,y:at(100),type:i%2?'torch':'pillar'});x+=length;y=endY;
      });width=x;checkpoint={x:width-160,y};
      const candidates=platforms.filter(p=>p.oneWay===false&&p.y===p.y2&&p.y>=750&&p.w>700&&p.kind!=='bridge').sort((a,b)=>b.y-a.y);
      if(candidates.length){const floor=candidates[0];tunnels.push({x:floor.x+70,w:floor.w-140,floorId:floor.id,clearance:biome===2?250:275,kind:biome===0?'roots':biome===1?'crypt':'mine'});}
      // Scarce optional rewards: one shrine per region, at most one relic in alternating chapters.
      const keep=stage%2===1?relics[Math.floor(relics.length*.65)]:null;relics.splice(0,relics.length,...(keep?[keep]:[]));
    }
    for(const tunnel of tunnels){
      const floor=platforms.find(p=>p.id===tunnel.floorId),bottom=surface(floor,tunnel.x)-tunnel.clearance,bottom2=surface(floor,tunnel.x+tunnel.w)-tunnel.clearance;
      tunnel.y=bottom;tunnel.y2=bottom2;tunnel.ceilingId=++uid;
      // Remove optional platforms inside the rock; reposition rare rewards on a reachable lower shelf.
      for(let i=platforms.length-1;i>=0;i--){const p=platforms[i],cx=p.x+p.w/2;if(p.oneWay&&cx>tunnel.x&&cx<tunnel.x+tunnel.w&&p.y<bottom+90)platforms.splice(i,1);}
      for(const relic of relics)if(relic.x>tunnel.x&&relic.x<tunnel.x+tunnel.w&&relic.y<bottom+80){relic.y=bottom+110;add(relic.x-100,relic.y+40,220,{kind:'rock'});}
      platforms.push({id:tunnel.ceilingId,x:tunnel.x,y:bottom-110,y2:bottom2-110,w:tunnel.w,h:110,oneWay:false,ceiling:true,material:biome,effect:'normal',kind:'ceiling'});
      for(let tx=tunnel.x+50;tx<tunnel.x+tunnel.w;tx+=220)decor.push({x:tx,y:surface(floor,tx),type:'torch'});
      for(const z of zones)if(z.x<tunnel.x+tunnel.w&&z.x+z.w>tunnel.x){z.background='tunnelHD';z.tunnel=true;}
    }
    const groundAt=x=>{const p=platforms.find(p=>p.oneWay===false&&!p.ceiling&&x>=p.x&&x<=p.x+p.w);return p?surface(p,x):null;};
    return {width,height,platforms,zones,shrines,relics,decor,tunnels,spawn,checkpoint,groundAt,chapter:chapter?.name,weather:chapter?.weather||['mist','eclipse','embers'][biome],background:chapter?.background||['forestHD','ruins','forge'][biome]};
  }
  const WAVE_RULES=[{id:'balanced',name:'Marcha das sombras',description:'Clavas e garras avançam por todos os níveis.',hp:1,speed:1},{id:'swarm',name:'Enxame noturno',description:'Morcegos mergulham; plataformas cobertas de gelo.',hp:.85,speed:1.16},{id:'elite',name:'Corte dos condenados',description:'Elites resistentes e caçadores com investidas.',hp:1.1,speed:.95},{id:'arcane',name:'Cerco arcano',description:'Feiticeiros disparam rajadas de plataformas.',hp:.95,speed:1},{id:'storm',name:'Eclipse instável',description:'Colunas elétricas avisadas no chão; ventos fortes.',hp:1,speed:1.05}];
  return {create,surface,WAVE_RULES,CHAPTERS,TERRAIN};
});
