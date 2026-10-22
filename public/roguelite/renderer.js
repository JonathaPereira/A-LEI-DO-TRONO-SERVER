/* High resolution painter. Gameplay coordinates and collisions remain in core.js. */
(function(root){
  'use strict';
  const {W,H,FLOOR,REGIONS,random,clamp,Rig}=root.Abyss;
  class Renderer {
    constructor(canvas){
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.time=0;this.quality='high';this.assets={};this.failed=[];this.patterns={};this.bgKey=null;this.bgFrom=null;this.bgChanged=0;
      this.textures=REGIONS.map((_,i)=>this.makeTexture(i));
      for(const [key,path]of Object.entries({forest:'assets/v3/forest.webp',ruins:'assets/v3/ruins.webp',forge:'assets/v3/forge.webp',hero:'assets/hero.webp',creatures:'assets/creatures.webp',motion:'assets/v3/hero_motion.webp',combat:'assets/v3/hero_combat.webp',heroBlade:'assets/v4/hero_blade.webp',heroHammer:'assets/v4/hero_hammer.webp',heroBow:'assets/v4/hero_bow.webp',heroStaff:'assets/v4/hero_staff.webp',bladeCombos:'assets/v4/blade_combos.webp',mobMotion:'assets/v4/mob_motion.webp',bossRoot:'assets/v4/boss_root.webp',bossEclipse:'assets/v4/boss_eclipse.webp',bossForge:'assets/v4/boss_forge.webp',casterMotion:'assets/v4/caster_motion.webp',cave:'assets/v4/cave.webp',winter:'assets/v4/winter.webp',forestHD:'assets/v5/forest_bg.webp',tunnelHD:'assets/v5/tunnel_bg.webp',bladeSpecial:'assets/v5/blade_special.webp',bowActions:'assets/v5/bow_actions.webp',staffActions:'assets/v5/staff_actions.webp',newMobs:'assets/v5/mobs_new.webp',wispMotion:'assets/v5/wisp_motion.webp',material0:'assets/v5/material-0.webp',material1:'assets/v5/material-1.webp',material2:'assets/v5/material-2.webp',material3:'assets/v5/material-3.webp',material4:'assets/v5/material-4.webp',material5:'assets/v5/material-5.webp',material6:'assets/v5/material-6.webp',material7:'assets/v5/material-7.webp'})){
        const image=new Image();image.onload=()=>{this.assets[key]=image;};image.onerror=()=>this.failed.push(key);image.src=path;
      }
      this.setQuality('high');
    }
    setQuality(quality){this.quality=quality;const scale=quality==='ultra'?2:quality==='high'?1.5:1;this.scale=scale;this.canvas.width=W*scale;this.canvas.height=H*scale;this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';}
    makeTexture(biome){const cv=document.createElement('canvas');cv.width=384;cv.height=120;const c=cv.getContext('2d'),r=random('stone-hd-'+biome),g=c.createLinearGradient(0,0,0,120);g.addColorStop(0,['#536554','#625e70','#745c4b'][biome]);g.addColorStop(.15,['#2b3931','#3a3745','#45352f'][biome]);g.addColorStop(1,'#101519');c.fillStyle=g;c.fillRect(0,0,384,120);
      for(let i=0;i<6500;i++){const v=r();c.fillStyle=v>.5?'rgba(215,205,180,.065)':'rgba(0,0,0,.15)';c.fillRect(r()*384,r()*120,1+r()*2,1+r()*2);}
      for(let i=0;i<28;i++){const x=r()*384,y=r()*120;c.strokeStyle='rgba(0,0,0,.26)';c.lineWidth=.8;c.beginPath();c.moveTo(x,y);c.lineTo(x+10+r()*26,y-4+r()*13);c.lineTo(x+15+r()*24,y+15);c.stroke();}
      return cv;
    }
    ellipse(x,y,rx,ry,color){const c=this.ctx;c.fillStyle=color;c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);c.fill();}
    glow(x,y,r,color,power=.5){if(this.quality==='low')return;const c=this.ctx,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.save();c.globalAlpha=power;c.globalCompositeOperation='screen';c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
    background(biome,camera,cameraY=0,stage=0,key=null){
      const c=this.ctx,image=this.assets[key]||this.assets[['forest','ruins','forge'][biome]],r=REGIONS[biome];
      const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,r.sky[0]);g.addColorStop(1,r.sky[1]);c.fillStyle=g;c.fillRect(0,0,W,H);
      const desired=key||['forestHD','ruins','forge'][biome];
      if(desired!==this.bgKey){this.bgFrom=this.bgKey;this.bgKey=desired;this.bgChanged=this.time;}
      const paint=(asset,alpha)=>{const img=this.assets[asset]||image;if(!img)return;const h=H*1.28,w=Math.max(W+300,h*img.width/img.height),pan=clamp(camera/Math.max(W,this.worldWidth-W),0,1)*(w-W),y=-70-clamp(cameraY,0,1000)*.025;c.save();c.globalAlpha=alpha;c.drawImage(img,-pan,y,w,h);c.restore();};
      const fade=clamp((this.time-this.bgChanged)/.8,0,1);if(this.bgFrom&&fade<1)paint(this.bgFrom,1);paint(desired,this.bgFrom?fade:1);
      if(this.quality!=='low'){
        c.save();c.globalCompositeOperation='screen';for(let i=0;i<4;i++){const x=(i*363-camera*.2+this.time*6)%(W+500)-100,y=425+Math.sin(i+this.time*.3)*30;const fog=c.createRadialGradient(x,y,10,x,y,260);fog.addColorStop(0,biome===2?'#efad7e12':'#c6e4df12');fog.addColorStop(1,'transparent');c.fillStyle=fog;c.fillRect(x-260,y-150,520,280);}c.restore();
        if(biome!==2){c.save();c.globalAlpha=.075;c.fillStyle='#b5deea';for(let i=0;i<3;i++){c.beginPath();c.moveTo(650+i*145,0);c.lineTo(1050+i*145,H);c.lineTo(920+i*145,H);c.lineTo(628+i*145,0);c.closePath();c.fill();}c.restore();}
      }
      const count=this.quality==='low'?14:45;for(let i=0;i<count;i++){const x=((i*173-camera*.21+Math.sin(i)*79+this.time*(biome===2?18:7))%(W+40)+W+40)%(W+40),y=(i*83-this.time*(biome===2?32:9)+10000)%H;c.save();c.globalAlpha=.22+Math.sin(this.time*2+i)*.18;this.ellipse(x,y,biome===2?1:1.3,biome===2?2.8:1.3,r.accent);c.restore();}
    }
    material(slot){
      if(this.patterns[slot])return this.patterns[slot];const image=this.assets['material'+slot];if(!image)return null;
      const cv=document.createElement('canvas');cv.width=cv.height=512;const c=cv.getContext('2d');
      for(let y=0;y<2;y++)for(let x=0;x<2;x++){c.save();c.translate(x?512:0,y?512:0);c.scale(x?-1:1,y?-1:1);c.drawImage(image,0,0,256,256);c.restore();}
      return this.patterns[slot]=this.ctx.createPattern(cv,'repeat');
    }
    platforms(e){
      const c=this.ctx;c.save();c.translate(-e.camera,0);
      for(const p of e.platforms){const y2=p.y2??p.y;if(p.x>e.camera+W+80||p.x+p.w<e.camera-80||Math.min(p.y,y2)-e.cameraY>H+120)continue;
        const slot=p.effect==='ice'?4:['water','mud'].includes(p.effect)?6:p.effect==='conveyor'?5:p.kind==='bridge'?(e.biome===0?7:5):p.ceiling?(e.biome===0?3:e.biome):e.biome;
        const depth=p.ground?Math.max(e.height+200-Math.min(p.y,y2),400):p.ceiling?p.h:p.kind==='bridge'?26:38;
        c.save();c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x+p.w,y2);c.lineTo(p.x+p.w,y2+depth);c.lineTo(p.x,p.y+depth);c.closePath();c.clip();
        c.fillStyle=this.material(slot)||REGIONS[e.biome].stone;c.fillRect(p.x,Math.min(p.y,y2),p.w+1,Math.abs(y2-p.y)+depth);
        const shadeDepth=Math.min(depth,380),slope=(y2-p.y)/p.w,fade=c.createLinearGradient(p.x,p.y,p.x-slope*shadeDepth,p.y+shadeDepth);fade.addColorStop(0,'#0a101122');fade.addColorStop(.18,'#080e1540');fade.addColorStop(1,p.ceiling?'#05081055':'#050910ee');c.fillStyle=fade;c.fillRect(p.x,Math.min(p.y,y2),p.w,Math.abs(y2-p.y)+depth);c.restore();
        c.strokeStyle=p.ceiling?'#69736399':p.effect==='ice'?'#d0eaf5aa':e.biome===0?'#8da67caa':e.biome===2?'#b49b7699':'#adaab299';c.lineWidth=p.ceiling?3:4;c.beginPath();c.moveTo(p.x,p.y+2);c.lineTo(p.x+p.w,y2+2);c.stroke();
        c.strokeStyle='#070e1599';c.lineWidth=3;c.beginPath();c.moveTo(p.x,p.y+8);c.lineTo(p.x+p.w,y2+8);c.stroke();
        const start=Math.max(p.x,e.camera-20),end=Math.min(p.x+p.w,e.camera+W+20);
        for(let wx=Math.ceil(start/23)*23;wx<end;wx+=23){const hash=Math.abs(Math.sin(wx*12.9898)*43758.54)%1,sy=e.surface(p,wx);c.strokeStyle=p.ceiling?'#26291fd0':slot===0?'#78926899':'#b2ad9544';c.lineWidth=1;c.beginPath();c.moveTo(wx,sy+2);c.lineTo(wx+hash*8-4,sy-(slot===0?3+hash*7:hash*2));c.stroke();}
        if(p.ceiling){c.strokeStyle='#050810aa';c.lineWidth=8;c.beginPath();c.moveTo(p.x,p.y+p.h);c.lineTo(p.x+p.w,y2+p.h);c.stroke();for(let wx=Math.ceil(start/53)*53;wx<end;wx+=53){const hash=Math.abs(Math.sin(wx*9.39)*1437)%1,bottom=e.surface(p,wx)+p.h,length=6+hash*25;c.fillStyle=slot===3?'#34382bcc':'#252d36cc';c.beginPath();c.moveTo(wx-6-hash*7,bottom-3);c.quadraticCurveTo(wx-2,bottom+length*.35,wx+hash*9,bottom+length);c.quadraticCurveTo(wx+7,bottom+length*.35,wx+10,bottom-3);c.fill();if(slot===3){c.strokeStyle='#5b604655';c.lineWidth=1.5;c.beginPath();c.moveTo(wx+3,bottom-10);c.quadraticCurveTo(wx+15,bottom+length,wx+8,bottom+length+15);c.stroke();}}}

        if(p.moving){c.strokeStyle='#c0ccbb77';c.lineWidth=1.5;for(const x of [p.x+15,p.x+p.w-15]){c.beginPath();c.moveTo(x,p.y-160);c.lineTo(x,p.y+5);c.stroke();}}
      }c.restore();
    }
    decorations(e){const c=this.ctx;for(const d of e.decor||[]){const x=d.x-e.camera,y=d.y;if(x<-100||x>W+100)continue;if(d.type==='torch'){c.strokeStyle='#6c6555';c.lineWidth=4;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-49);c.stroke();const sway=Math.sin(this.time*13+x)*3;this.glow(x,y-51,105,'#e89845',.32);c.fillStyle='#eab368';c.beginPath();c.moveTo(x-5,y-47);c.quadraticCurveTo(x-10,y-62,x+sway,y-75);c.quadraticCurveTo(x+8,y-57,x+4,y-48);c.fill();this.ellipse(x,y-52,3,5,'#fff2b2');}
        if(d.type==='pillar'){const g=c.createLinearGradient(x-11,y,x+11,y);g.addColorStop(0,'#222b30');g.addColorStop(.5,'#7d807066');g.addColorStop(1,'#18272b');c.fillStyle=g;c.fillRect(x-10,y-108,20,108);c.fillRect(x-15,y-109,30,7);c.fillRect(x-13,y-9,26,9);}
      }}
    gate(e,menu=false,station=null){
      const c=this.ctx,cp=station||e.checkpoint,x=cp.x-e.camera,y=cp.y,active=menu||station?menu||!station?.used&&e.shrineClear(station):e.cleared,color=station?'#88d9c0':'#98e9ca';
      this.ellipse(x,y+3,42,8,'#0008');const g=c.createLinearGradient(x-40,0,x+40,0);g.addColorStop(0,'#263130');g.addColorStop(.45,'#858773');g.addColorStop(1,'#253638');c.fillStyle=g;c.fillRect(x-36,y-12,72,12);c.fillRect(x-24,y-26,48,14);
      for(const dir of [-1,1]){c.fillStyle=g;c.fillRect(x+dir*36-5,y-112,10,86);c.fillStyle='#e5d8a688';c.fillRect(x+dir*36-2,y-105,2,63);}
      const cy=y-87+Math.sin(this.time*2)*5;this.glow(x,cy,125,color,active?.38:.08);c.save();c.translate(x,cy);c.rotate(Math.sin(this.time)*.09);const crystal=c.createLinearGradient(-17,-32,17,32);crystal.addColorStop(0,active?'#effff2':'#668482');crystal.addColorStop(.5,active?'#6ee0b3':'#2b484b');crystal.addColorStop(.51,active?'#c5ffe8':'#557677');crystal.addColorStop(1,active?'#298379':'#283639');c.fillStyle=crystal;c.beginPath();c.moveTo(0,-33);c.lineTo(17,-1);c.lineTo(0,32);c.lineTo(-17,-1);c.closePath();c.fill();c.strokeStyle='#e5fff380';c.lineWidth=.7;c.stroke();c.restore();
      if(active){c.save();c.strokeStyle='#b7f9d677';c.lineWidth=.9;c.beginPath();c.ellipse(x,cy,30,48,Math.sin(this.time*.7)*.25,0,Math.PI*2);c.stroke();c.restore();}
      if(!menu){c.font='10px Georgia';c.textAlign='center';c.fillStyle=active?'#e0e9c4':'#839c92';c.fillText(station?station.used?'SANTUÁRIO USADO':active?'SANTUÁRIO':'ELIMINE OS INIMIGOS':active?'PORTAL DE SAÍDA':'PORTAL SELADO',x,y-151);}
    }
    pose(sheet,index,cols,rows,size=158){
      if(!sheet)return;const w=sheet.width/cols,h=sheet.height/rows;
      this.ctx.drawImage(sheet,index%cols*w,Math.floor(index/cols)*h,w,h,-size/2,-size*300/320,size,size);
    }
    damageOverlay(body){
      const c=this.ctx,h=body.h,w=body.w,t=this.time;
      if(body.burn>0){
        this.glow(0,-h*.5,h*.85,'#fc7a2e',.28);
        for(let i=0;i<7;i++){
          const seed=i*1.7,px=Math.sin(seed)*w*.46,base=-h*(.17+(i%4)*.19),height=12+Math.sin(t*12+seed)*6;
          c.save();c.globalCompositeOperation='screen';c.fillStyle=i%2?'#fd7c31':'#ffc477';c.globalAlpha=.75;
          c.beginPath();c.moveTo(px-3,base);c.quadraticCurveTo(px-7,base-height*.6,px+Math.sin(t*9+seed)*4,base-height);c.quadraticCurveTo(px+6,base-height*.4,px+3,base);c.closePath();c.fill();c.fillStyle='#fff1b1';this.ellipse(px,base-3,1.8,4,'#ffe9a2');c.restore();
        }
      }
      if((body.shockVisual||body.shock)>0){
        c.save();c.globalCompositeOperation='screen';c.strokeStyle='#e7f3ff';c.lineWidth=1.2;c.shadowColor='#b69bff';c.shadowBlur=8;
        for(let branch=0;branch<3;branch++){c.beginPath();for(let k=0;k<7;k++){const px=Math.sin(k*3.9+t*40+branch)*w*.5+(branch-1)*7,py=-h+k*h/7;if(k)c.lineTo(px,py);else c.moveTo(px,py);}c.stroke();}
        c.restore();
      }
      if((body.frostVisual||body.slow)>0){c.save();c.globalCompositeOperation='screen';this.glow(0,-h*.5,h*.75,'#9adbef',.17);for(let i=0;i<7;i++){const x=Math.sin(i*2.7)*w*.5,y=-h*(.1+i/8),length=6+Math.sin(t*3+i)*2;c.fillStyle=i%2?'#d9faffbb':'#74c9eab0';c.beginPath();c.moveTo(x,y-length);c.lineTo(x+4,y);c.lineTo(x,y+3);c.lineTo(x-3,y);c.fill();}c.restore();}
      if((body.poisonVisual||body.venom)>0){for(let i=0;i<4;i++){const phase=(t*.55+i*.24)%1;this.ellipse(Math.sin(t+i*2)*w*.5,-h*phase,2+phase*2,3,'#a5cf6b66');}}
      if(body.bleed>0)this.ellipse(-w*.14,-h*.52,4,8,'#982b39aa');
    }
    hero(p,e,ghost=false){
      const c=this.ctx,x=p.x-e.camera+p.w/2,y=p.y+p.h,t=this.time;
      if(p.ground)this.ellipse(x,y+3,23,5,'#0008');c.save();c.translate(x,y);c.scale(p.dir,1);if(ghost)c.globalAlpha=.25;
      const q=Rig.pose(p,t),sheet=this.assets[q.sheet];c.translate(q.dx,q.dy);c.rotate(q.angle);c.scale(1,q.sy);
      if(p.hurtAnim>0)c.filter='brightness(1.25)';
      if(sheet)this.pose(sheet,q.index,q.cols,q.rows,q.size);else this.pose(this.assets.motion,q.index%12,4,3,146);c.filter='none';
      if(!ghost){
        this.damageOverlay(p);
        if(p.postDash>0&&p.aegis){c.save();c.strokeStyle='#95e7d166';c.lineWidth=1;c.beginPath();c.ellipse(0,-p.h*.58,36,58,0,0,Math.PI*2);c.stroke();c.restore();}
        if(p.fire||p.frost||p.lightning||p.poison){const color=e.elementColor();this.glow(25,-45,28,color,.2);}
      }c.restore();
    }
    enemy(a,e){
      const c=this.ctx,x=a.x-e.camera+a.w/2,y=a.y+a.h;if(x<-160||x>W+160)return;
      if(!['bat','wisp'].includes(a.type))this.ellipse(x,y+3,a.w*.45,5,'#0007');c.save();c.translate(x,y);c.scale(a.dir||1,1);
      let sheet=this.assets.mobMotion,index=0,rows=4,size=a.h*2.01;
      if(a.type==='boss'){
        sheet=this.assets[['bossRoot','bossEclipse','bossForge'][e.biome]];rows=2;index=a.action==='windup'?(a.actionTime>.3?4:5):a.action==='charge'||a.action==='leap'?6:a.action==='recover'?7:Math.abs(a.vx)>10?Math.floor(a.age*5)%4:0;size=a.h*2.21;
      }else if(['bulwark','archer','spider','hellhound'].includes(a.type)){sheet=this.assets.newMobs;rows=4;const row=['bulwark','archer','spider','hellhound'].indexOf(a.type);index=row*4+(a.action==='windup'?2:a.action==='attack'||a.action==='charge'?3:Math.abs(a.vx)>15?Math.floor(a.age*7)%2:0);size=a.h*512/300;
      }else if(a.type==='wisp'){sheet=this.assets.wispMotion;rows=2;index=a.action==='windup'?4+Math.floor(a.age*8)%2:a.action==='attack'?6:a.action==='recover'?7:Math.floor(a.age*8)%4;size=90;this.glow(0,-a.h*.5,65,'#afabff',.3);
      }else if(a.type==='caster'){
        sheet=this.assets.casterMotion;rows=3;index=a.hitReact>0?9:a.action==='windup'?(a.actionTime>.3?4:5):a.action==='attack'?6:a.action==='recover'?7:Math.abs(a.vx)>12?Math.floor(a.age*7)%4:8;size=a.h*2.14;
      }else if(a.type==='bat'){index=12+Math.floor(a.age*13)%4;size=107;}
      else if(a.type==='brute'){index=8+(a.action==='windup'?1:a.action==='attack'?2:a.action==='recover'?3:0);size=a.h*2.21;}
      else{index=a.action==='windup'?4:a.action==='attack'?(a.animTime<.1?5:6):a.action==='recover'?7:Math.floor(a.age*7)%4;}
      const bob=a.type==='bat'?Math.sin(a.age*9)*2:a.type==='caster'?Math.sin(a.age*3)*2:Math.abs(a.vx)>15?-Math.abs(Math.sin(a.age*7))*1.3:0;
      c.translate(a.hitReact>0?-Math.sin(a.hitReact/.18*Math.PI)*3:0,bob);
      c.rotate(a.hitReact>0?-.045*Math.sin(a.hitReact/.18*Math.PI):a.action==='charge'?.075:a.action==='windup'?-.025:0);
      if(a.shockVisual>0)c.translate(Math.sin(this.time*73)*1.5,Math.cos(this.time*61)*.4);
      if(a.flash>0)c.filter='brightness(1.3)';else if(a.slow>0)c.filter='sepia(.3) hue-rotate(125deg)';else if(a.charred>.15)c.filter='brightness(.82) sepia(.18)';else if(a.type==='stalker')c.filter='sepia(.45) hue-rotate(315deg)';
      if(sheet)this.pose(sheet,index,4,rows,size);
      else this.pose(this.assets.creatures,a.type==='caster'?2:a.type==='bat'?1:a.type==='boss'?3+e.biome:0,4,2,size);
      c.filter='none';this.damageOverlay(a);
      if(a.elite){this.glow(0,-a.h*.5,a.h,'#e9c785',.18);c.strokeStyle='#d5ba8377';c.lineWidth=1;c.beginPath();c.ellipse(0,-a.h*.48,a.w*.67,a.h*.59,0,0,Math.PI*2);c.stroke();}
      if(a.venom>0)this.glow(0,-a.h*.3,a.w,'#8ed354',.16);
      if(a.action==='windup'){c.fillStyle='#f7d6a0';c.textAlign='center';c.font='bold 18px Georgia';c.fillText('!',0,-a.h*1.2-16);}
      c.restore();
      if(a.type!=='boss'&&a.hp<a.maxHp){c.fillStyle='#091019bb';c.fillRect(x-a.w*.65,a.y-18,a.w*1.3,3);c.fillStyle=a.elite?'#dcbf82':REGIONS[e.biome].accent;c.fillRect(x-a.w*.65,a.y-18,a.w*1.3*clamp(a.hp/a.maxHp,0,1),3);}
    }
    terrainEffects(e){
      const c=this.ctx,colors=root.Abyss.TERRAIN;
      for(const p of e.platforms){
        if(p.effect==='normal'||p.disabled||p.x-e.camera>W||p.x+p.w-e.camera<0)continue;
        const start=Math.max(p.x,e.camera-15),end=Math.min(p.x+p.w,e.camera+W+15);c.save();c.strokeStyle=colors[p.effect]?.color||'#b8d2bb';c.lineWidth=p.effect==='ice'?4:2;c.globalAlpha=.5;c.beginPath();c.moveTo(start-e.camera,e.surface(p,start)-1);c.lineTo(end-e.camera,e.surface(p,end)-1);c.stroke();
        for(let x=start+((this.time*(p.effect==='conveyor'?32:0))%38);x<end;x+=38){const sx=x-e.camera,y=e.surface(p,x);
          if(p.effect==='water'||p.effect==='mud'){this.ellipse(sx,y-1,22,p.effect==='water'?3:2,p.effect==='water'?'#74cbe544':'#69523488');if(p.effect==='water'){c.strokeStyle='#b0ddeb66';c.lineWidth=1;c.beginPath();c.moveTo(sx-10,y-3);c.quadraticCurveTo(sx,y-5+Math.sin(this.time*4+x)*2,sx+14,y-3);c.stroke();}}
          if(p.effect==='ice'){c.strokeStyle='#ddf9ff77';c.lineWidth=.8;c.beginPath();c.moveTo(sx,y+1);c.lineTo(sx+10,y+8);c.lineTo(sx+19,y+4);c.stroke();}
          if(p.effect==='lava'){this.glow(sx,y+6,35,'#fa7829',.32);const h=7+Math.sin(this.time*7+x)*5;this.ellipse(sx,y-2,12,2,'#ffbd5d');this.ellipse(sx+Math.sin(this.time*2+x)*7,y-h,1.2,2.8,'#ffc67a');}
          if(p.effect==='wind'){c.strokeStyle='#d8e6e644';c.lineWidth=1;c.beginPath();c.moveTo(sx,y-40);c.quadraticCurveTo(sx+30,y-52,sx+50,y-43);c.stroke();}
          if(p.effect==='spring'){c.strokeStyle='#9bc36b';c.lineWidth=1.5;c.beginPath();c.moveTo(sx,y);c.quadraticCurveTo(sx-10,y-8,sx+4,y-16);c.stroke();}
          if(p.effect==='conveyor'){c.strokeStyle='#d6b274';c.lineWidth=1;c.beginPath();c.moveTo(sx,y-6);c.lineTo(sx+7,y-2);c.lineTo(sx,y+2);c.stroke();}
        }c.restore();
      }
    }
    weather(e){
      const c=this.ctx,t=this.time,mode=e.weather;if(!mode)return;c.save();
      if(mode==='rain'||mode==='storm'){c.strokeStyle='#b5d4e539';c.lineWidth=.8;for(let i=0;i<70;i++){const x=(i*101+t*210)%W,y=(i*53+t*610)%H;c.beginPath();c.moveTo(x,y);c.lineTo(x-7,y+20);c.stroke();}}
      if(mode==='snow'){for(let i=0;i<55;i++){const x=(i*131+t*28+Math.sin(t+i)*18)%W,y=(i*79+t*(18+i%9))%H;this.ellipse(x,y,1.4,1.4,'#e3f4fa88');}}
      if(mode==='spores'){for(let i=0;i<28;i++){const x=(i*177+t*13)%W,y=(i*71-t*9+H*10)%H;this.ellipse(x,y,1.5,1.5,'#b1c68855');}}
      c.restore();
    }
    effects(e){const c=this.ctx;for(const f of e.effects){const alpha=clamp(f.t/f.max,0,1),progress=1-alpha,x=f.x-e.camera,y=f.y;c.save();c.globalAlpha=alpha;c.strokeStyle=f.color;c.fillStyle=f.color;c.lineCap='round';
        if(f.type==='charge'){const p=e.player,origin=['bow','staff'].includes(f.weapon)?Rig.muzzle(p,f.weapon,this.time):{x:p.x+p.w/2,y:p.y+p.h*.55};const cx=origin.x-e.camera,cy=origin.y,r=10+f.size*progress;this.glow(cx,cy,r*2,f.color,.4);c.lineWidth=1.4;c.beginPath();c.arc(cx,cy,r,-this.time*5,Math.PI*1.8-this.time*5);c.stroke();for(let i=0;i<9;i++){const angle=i*.7+this.time*3;this.ellipse(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r,2,2,'#fff3dc');}}
        if(f.type==='spin'){const p=e.player,cx=p.x+p.w/2-e.camera,cy=p.y+p.h-52;c.globalCompositeOperation='screen';for(let i=0;i<3;i++){c.lineWidth=i===0?14:3;c.globalAlpha=alpha*(i===0?.22:.75);c.beginPath();c.ellipse(cx,cy,f.size*(.75+i*.08),f.size*.4,this.time*8+i,0,Math.PI*1.4);c.stroke();}}
        if(f.type==='quake'){c.lineWidth=2*alpha;c.beginPath();c.ellipse(x,y,f.size*progress,10+progress*18,0,0,Math.PI*2);c.stroke();for(let i=-3;i<=3;i++){c.beginPath();c.moveTo(x+i*23,y);c.lineTo(x+i*38*(1+progress),y+15);c.lineTo(x+i*52*(1+progress),y+24);c.stroke();}}
        if(f.type==='muzzle'||f.type==='block'){this.glow(x,y,f.size*(.3+progress),f.color,.5);c.lineWidth=2;c.beginPath();c.arc(x,y,f.size*progress,0,Math.PI*2);c.stroke();}
        if(f.type==='bloodcut'){c.translate(x,y);c.scale(f.dir||1,1);c.strokeStyle='#d64251';c.lineWidth=4*alpha;c.beginPath();c.moveTo(-9,-f.size*.35);c.quadraticCurveTo(f.size*.22,0,f.size*.7,f.size*.3);c.stroke();c.lineWidth=1;c.strokeStyle='#ef6470';c.beginPath();c.moveTo(0,-f.size*.25);c.lineTo(f.size*.55,f.size*.25);c.stroke();}
        if(f.type==='electrocute'){const target=f.target;if(target){this.glow(target.x+target.w/2-e.camera,target.y+target.h/2,f.size*.8,'#bfcaff',.18);}}
        if(f.type==='slash'){c.translate(x,y);c.scale(f.dir,1);c.rotate(f.combo===1?-.85:progress*.35);c.globalCompositeOperation='screen';this.glow(35,0,f.size,f.color,.15);for(let layer=0;layer<3;layer++){c.strokeStyle=layer===2?'#f4fff5':f.color;c.globalAlpha=alpha*(layer===0?.18:layer===1?.65:1);c.lineWidth=layer===0?23:layer===1?8:1.4;c.beginPath();c.arc(0,0,f.size*(.75+layer*.012),-1.35+progress*.8,1.2+progress*.6);c.stroke();}}
        if(f.type==='groundring'){c.lineWidth=3*alpha;c.beginPath();c.ellipse(x,y-2,f.size*progress,8+progress*9,0,0,Math.PI*2);c.stroke();}
        if(f.type==='sigil'){c.translate(x,y);c.rotate(progress*1.3);c.lineWidth=1.2;c.beginPath();c.arc(0,0,f.size*(.7+progress*.3),0,Math.PI*2);c.stroke();for(let i=0;i<6;i++){const a=i*Math.PI/3;c.beginPath();c.moveTo(Math.cos(a)*f.size,Math.sin(a)*f.size);c.lineTo(Math.cos(a+Math.PI*2/3)*f.size,Math.sin(a+Math.PI*2/3)*f.size);c.stroke();}}
        if(f.type==='nova'){const radius=f.size*Math.sqrt(progress);c.globalCompositeOperation='screen';this.glow(x,y,Math.max(10,radius),f.color,.2*alpha);c.lineWidth=3*alpha+1;c.beginPath();c.arc(x,y,radius,0,Math.PI*2);c.stroke();for(let i=0;i<25;i++){const a=i*Math.PI*2/25;this.ellipse(x+Math.cos(a)*radius,y+Math.sin(a)*radius,2,2,f.color);}if(f.element==='frost'){for(let i=0;i<14;i++){const a=i*Math.PI/7,px=x+Math.cos(a)*radius,py=y+Math.sin(a)*radius;c.save();c.translate(px,py);c.rotate(a+Math.PI/2);c.fillStyle=i%2?'#e5faff':'#8bcde8';c.beginPath();c.moveTo(0,-17*alpha);c.lineTo(5*alpha,0);c.lineTo(0,8*alpha);c.lineTo(-4*alpha,0);c.closePath();c.fill();c.restore();}}if(f.element==='fire'){for(let i=0;i<18;i++){const a=i*Math.PI/9;this.ellipse(x+Math.cos(a)*radius,y+Math.sin(a)*radius,4*alpha+1,10*alpha+2,i%2?'#ffd493':'#f69d65');}}}
        if(f.type==='burst'){for(let i=0;i<18;i++){const a=i*.9,d=f.size*progress*(.3+(i%5)*.15);this.ellipse(x+Math.cos(a)*d,y+Math.sin(a)*d+progress*30,1+alpha*2,1+alpha*2,f.color);}}
        if(f.type==='text'){c.font=(f.critical?'bold 19px':'13px')+' Georgia';c.textAlign='center';c.shadowColor='#000';c.shadowBlur=3;c.fillText(f.text,x,y-progress*35);}
        if(f.type==='bolt'){this.glow(x,y,60,f.color,.2);c.shadowColor=f.color;c.shadowBlur=this.quality==='low'?0:12;c.lineWidth=2;c.beginPath();c.moveTo(x,y);for(let i=1;i<6;i++)c.lineTo(x+(f.x2-f.x)*i/6+(i%2?8:-8),y+(f.y2-f.y)*i/6+(i%2?-10:10));c.lineTo(f.x2-e.camera,f.y2);c.stroke();}
        if(f.type==='ghost')this.hero({...e.player,x:f.x,y:f.y,dir:f.dir,invuln:0,swing:null,dashTime:.1},e,true);c.restore();}
    }
    particles(e){const c=this.ctx,max=this.quality==='low'?130:420;let count=0;for(const p of e.particles||[]){if(count++>max)break;const x=p.x-e.camera,y=p.y;if(x<-30||x>W+30||y-e.cameraY<-30||y-e.cameraY>H+30)continue;c.save();c.globalAlpha=Math.max(0,p.t/p.max);if(p.kind==='dust'||p.kind==='smoke')c.globalAlpha*=.25;c.strokeStyle=p.color;c.fillStyle=p.color;c.lineWidth=p.size*.65;if(p.kind==='spark'){c.beginPath();c.moveTo(x,y);c.lineTo(x-p.vx*.025,y-p.vy*.025);c.stroke();}else if(p.kind==='blood'){c.translate(x,y);c.rotate(Math.atan2(p.vy,p.vx));this.ellipse(0,0,p.size*1.5,p.size*.55,p.color);}else if(p.kind==='bloodstain'){this.ellipse(x,y,p.size*3,p.size*.6,p.color);}else if(p.kind==='ice'||p.kind==='debris'){c.translate(x,y);c.rotate(p.vx*.1+p.t*3);c.beginPath();c.moveTo(0,-p.size*2);c.lineTo(p.size,0);c.lineTo(0,p.size);c.lineTo(-p.size*.7,0);c.fill();}else if(p.kind==='splash'){this.ellipse(x,y,p.size*.6,p.size*1.3,p.color);}else if(p.kind==='ember'){c.globalCompositeOperation='screen';this.ellipse(x,y,p.size*.5,p.size*1.2,p.color);}else this.ellipse(x,y,p.size*2,p.size,p.color);c.restore();}}
    fields(e){const c=this.ctx;for(const f of e.fields||[]){c.save();const alpha=Math.min(1,f.t)*.16;c.globalAlpha=alpha;const g=c.createRadialGradient(f.x-e.camera,f.y,10,f.x-e.camera,f.y,f.radius);g.addColorStop(0,f.color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(f.x-e.camera-f.radius,f.y-f.radius,f.radius*2,f.radius*2);c.globalAlpha=alpha*2;c.strokeStyle=f.color;c.lineWidth=1.5;c.beginPath();c.ellipse(f.x-e.camera,f.y+35,f.radius,26,0,0,Math.PI*2);c.stroke();for(let i=0;i<15;i++){const angle=i*2.4+this.time*.7,r=f.radius*(.3+(i%4)*.16);this.ellipse(f.x-e.camera+Math.cos(angle)*r,f.y+Math.sin(angle)*r*.38,7+(i%3)*5,9+(i%4)*4,f.color);}c.restore();}}
    minimap(e){if(e.status==='menu')return;const c=this.ctx,x=20,y=H-79,w=195,h=54;c.save();c.fillStyle='#071018a6';c.fillRect(x-7,y-8,w+14,h+23);c.strokeStyle='#bba27866';c.strokeRect(x-7,y-8,w+14,h+23);const sx=w/e.width,sy=h/e.height;for(const p of e.platforms){c.strokeStyle=p.ground?'#a3b2a477':'#8acdb566';c.lineWidth=p.ground?2:1;c.beginPath();c.moveTo(x+p.x*sx,y+p.y*sy);c.lineTo(x+(p.x+p.w)*sx,y+(p.y2??p.y)*sy);c.stroke();}for(const s of e.shrines||[])this.ellipse(x+s.x*sx,y+s.y*sy,2,2,s.used?'#687e77':'#76e1c0');this.ellipse(x+e.checkpoint.x*sx,y+e.checkpoint.y*sy,3,3,e.cleared?'#ffe6aa':'#6b8d83');this.ellipse(x+(e.player.x+e.player.w/2)*sx,y+(e.player.y+e.player.h)*sy,3,3,'#ffedc8');c.fillStyle='#c8c1a3';c.font='8px Georgia';c.textAlign='left';c.fillText(e.mode==='horde'?'ARENA · '+Math.round(e.score)+' PONTOS':'MAPA · '+e.relicCount+' RELÍQUIAS',x,y+h+10);c.restore();}
    draw(e,time,shake=0){
      this.time=time;const c=this.ctx;c.setTransform(this.scale,0,0,this.scale,0,0);c.imageSmoothingEnabled=true;c.save();if(shake>.3)c.translate(Math.sin(time*101)*shake,Math.cos(time*91)*shake*.6);this.worldWidth=e.width;this.background(e.biome,e.camera,e.cameraY||0,e.stage,e.environment().background);c.save();c.translate(0,-(e.cameraY||0));this.decorations(e);this.platforms(e);this.terrainEffects(e);this.fields(e);
      for(const station of e.shrines||[])if(Math.abs(station.x-e.camera-W/2)<W)this.gate(e,false,station);this.gate(e,e.status==='menu');
      for(const relic of e.relics||[])if(!relic.taken&&Math.abs(relic.x-e.camera-W/2)<W){const x=relic.x-e.camera,y=relic.y+Math.sin(time*3+relic.x)*4;this.glow(x,y,45,'#f5d48a',.35);c.save();c.translate(x,y);c.rotate(time*.4);c.fillStyle='#ffe2a3';c.beginPath();c.moveTo(0,-8);c.lineTo(6,0);c.lineTo(0,8);c.lineTo(-6,0);c.closePath();c.fill();c.restore();}
      for(const portal of e.portals||[]){const x=portal.x-e.camera,y=portal.y-35;this.glow(x,y,70,'#bf89df',.4);c.strokeStyle='#d5c1f1';c.lineWidth=2;c.beginPath();c.ellipse(x,y,20+Math.sin(time*14)*3,43,0,0,Math.PI*2);c.stroke();}
      for(const h of e.hazards){const x=h.x-e.camera,y=h.y;if(h.active){this.glow(x,y-45,85,'#d4abff',.45);const g=c.createLinearGradient(x,y,x,y-125);g.addColorStop(0,'#645483');g.addColorStop(1,'#ebd9ff');c.fillStyle=g;c.beginPath();c.moveTo(x-26,y);c.lineTo(x-10,y-70);c.lineTo(x,y-125);c.lineTo(x+17,y-90);c.lineTo(x+30,y);c.closePath();c.fill();}else{this.glow(x,y,55,'#e3b699',.35);c.strokeStyle='#f0cbb3';c.lineWidth=2;c.beginPath();c.ellipse(x,y-2,35,6,0,0,Math.PI*2);c.stroke();}}
      for(const enemy of e.enemies)this.enemy(enemy,e);this.hero(e.player,e);
      for(const s of e.projectiles){for(let i=0;i<(s.trail||[]).length;i++){const point=s.trail[i];c.save();c.globalAlpha=(1-i/s.trail.length)*.3;this.ellipse(point.x-e.camera,point.y,s.kind==='wave'?8:3,s.kind==='wave'?3:2,s.color);c.restore();}const x=s.x-e.camera,y=s.y;c.save();c.translate(x,y);if(['bow','chargedArrow','enemyArrow'].includes(s.kind)){if(s.kind==='chargedArrow'){this.glow(0,0,45,s.color,.6);c.strokeStyle=s.color;c.lineWidth=5;c.beginPath();c.moveTo(-38,0);c.lineTo(12,0);c.stroke();}c.rotate(Math.atan2(s.vy,s.vx));c.strokeStyle='#e2dec8';c.lineWidth=1.6;c.beginPath();c.moveTo(-17,0);c.lineTo(13,0);c.stroke();c.fillStyle=s.color;c.beginPath();c.moveTo(20,0);c.lineTo(10,-4);c.lineTo(10,4);c.closePath();c.fill();this.glow(12,0,16,s.color,.2);}else if(s.kind==='web'){c.strokeStyle='#d7dfc8';c.lineWidth=1;for(let i=0;i<6;i++){const a=i*Math.PI/3;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*13,Math.sin(a)*13);c.stroke();}c.beginPath();c.arc(0,0,8,0,Math.PI*2);c.stroke();}else{if(s.kind==='superOrb'){c.rotate(this.time*3);c.strokeStyle=s.color;c.lineWidth=2;c.beginPath();c.ellipse(0,0,24,16,0,0,Math.PI*2);c.stroke();for(let i=0;i<5;i++)this.ellipse(Math.cos(i*1.26)*19,Math.sin(i*1.26)*19,3,6,s.color);}this.glow(0,0,s.kind==='superOrb'?65:s.kind==='wave'?45:28,s.color,.6);this.ellipse(0,0,s.kind==='superOrb'?16:s.kind==='wave'?18:6,s.kind==='superOrb'?16:s.kind==='wave'?10:6,s.color);this.ellipse(0,0,2,2,'#fff6de');}c.restore();}
      this.effects(e);this.particles(e);c.restore();const vignette=c.createRadialGradient(W/2,H*.5,H*.35,W/2,H*.5,W*.68);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#03070c80');c.fillStyle=vignette;c.fillRect(0,0,W,H);this.weather(e);this.minimap(e);c.restore();
    }

  }
  root.AbyssRenderer=Renderer;
})(typeof globalThis!=='undefined'?globalThis:this);
