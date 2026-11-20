(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AbyssController=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DEFAULT={jump:0,dash:1,attack:2,interact:3,skill:5,pause:9,codex:8,element:4,reroll:7};
  const NAMES={xbox:['A','B','X','Y','LB','RB','LT','RT','View','Menu','LS','RS','↑','↓','←','→','Xbox'],playstation:['×','○','□','△','L1','R1','L2','R2','Share','Options','L3','R3','↑','↓','←','→','PS']};
  const profileFor=(id='')=>/sony|dual|playstation|054c/i.test(id)?'playstation':'xbox';
  const buttonLabel=(index,profile='xbox')=>profile==='generic'?'Botão '+(index+1):(NAMES[profile]||NAMES.xbox)[index]||'Botão '+(index+1);
  const KEY_DEFAULT=Object.freeze(Object.fromEntries(Object.entries({left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],down:['KeyS','ArrowDown'],jump:['Space','KeyW','ArrowUp'],attack:['KeyJ','KeyZ'],skill:['KeyK','KeyX'],dash:['ShiftLeft','ShiftRight','KeyL'],interact:['KeyE','Enter'],element:['KeyQ'],pause:['KeyP'],reroll:['KeyR']}).map(([action,codes])=>[action,Object.freeze(codes)])));
  class Keyboard {
    constructor(mapping){this.reset();if(mapping!==undefined)this.load(mapping);}
    reset(){this.mapping=Object.fromEntries(Object.entries(KEY_DEFAULT).map(([action,codes])=>[action,[...codes]]));}
    snapshot(){return Object.fromEntries(Object.entries(this.mapping).map(([action,codes])=>[action,[...codes]]));}
    static bindable(code){return typeof code==='string'&&(/^(Key[A-Z]|Digit[056789]|ShiftLeft|ShiftRight)$/.test(code)||code==='Space');}
    load(mapping){
      if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||Object.keys(mapping).length!==Object.keys(KEY_DEFAULT).length)return false;
      const used=new Set();
      for(const action of Object.keys(KEY_DEFAULT)){
        const codes=mapping[action];
        if(!Array.isArray(codes)||!codes.length||codes.length>4||!Keyboard.bindable(codes[0]))return false;
        for(const code of codes){if(!(Keyboard.bindable(code)||KEY_DEFAULT[action].includes(code))||used.has(code))return false;used.add(code);}
      }
      this.mapping=Object.fromEntries(Object.keys(KEY_DEFAULT).map(action=>[action,[...mapping[action]]]));return true;
    }
    setBinding(action,code){
      if(!Object.hasOwn(KEY_DEFAULT,action)||!Keyboard.bindable(code))return false;
      const next=this.snapshot(),previous=next[action][0];
      for(const other of Object.keys(next))if(other!==action){const index=next[other].indexOf(code);if(index>=0)next[other][index]=previous;}
      next[action]=[code,...next[action].slice(1).filter(value=>value!==code)];return this.load(next);
    }
    actionFor(code){return Object.keys(this.mapping).find(action=>this.mapping[action].includes(code))||'';}
    label(action,aliases=false){
      const names={Space:'Espaço',ShiftLeft:aliases?'Shift esq.':'Shift',ShiftRight:aliases?'Shift dir.':'Shift',ArrowLeft:'←',ArrowRight:'→',ArrowDown:'↓',ArrowUp:'↑'};
      return (aliases?this.mapping[action]:this.mapping[action].slice(0,1)).map(code=>names[code]||code.replace(/^Key|^Digit/,'')).join(' / ');
    }
  }
  class Controller {
    constructor(mapping={}){this.mapping={...DEFAULT};for(const [key,value] of Object.entries(mapping))if(key in DEFAULT&&Number.isInteger(value)&&value>=0&&value<32)this.mapping[key]=value;this.deadzone=.24;this.previous=[];this.index=null;this.navAt=0;this.navDirection='';this.device=null;}
    setBinding(action,index){if(!(action in DEFAULT)||!Number.isInteger(index)||index<0||index>31)return false;const previous=this.mapping[action],other=Object.keys(this.mapping).find(k=>k!==action&&this.mapping[k]===index);if(other)this.mapping[other]=previous;this.mapping[action]=index;return true;}
    reset(){this.previous=[];this.navAt=0;this.navDirection='';this.index=null;this.device=null;}
    poll(pads,time=0){
      const list=Array.from(pads||[]).filter(p=>p&&p.connected!==false);
      const active=list.find(p=>p.buttons.some(b=>b.pressed||b.value>.5)||p.axes.some(v=>Math.abs(v)>.35));
      const pad=active||list.find(p=>p.index===this.index)||list[0];
      if(!pad){const disconnected=this.index!==null;this.reset();return {connected:false,disconnected,held:{},pressed:{},nav:''};}
      const changed=pad.index!==this.index||pad.id!==this.device?.id;if(changed){this.previous=pad.buttons.map(b=>!!b.pressed||b.value>.5);this.navAt=0;this.navDirection='';}
      this.index=pad.index;this.device=pad;
      const down=pad.buttons.map(b=>!!b.pressed||b.value>.5),edge=i=>!!down[i]&&!this.previous[i];
      const held={},pressed={};for(const [action,i] of Object.entries(this.mapping)){held[action]=!!down[i];pressed[action]=edge(i);}
      const x=pad.axes[0]||0,y=pad.axes[1]||0;
      held.left=x<-this.deadzone||!!down[14];held.right=x>this.deadzone||!!down[15];held.down=y>.5||!!down[13];
      const direction=down[14]||x<-.55?'left':down[15]||x>.55?'right':down[12]||y<-.55?'up':down[13]||y>.55?'down':'';
      let nav='';if(direction&&(direction!==this.navDirection||time>=this.navAt)){nav=direction;this.navAt=time+(direction!==this.navDirection?.35:.16);}this.navDirection=direction;
      const result={connected:true,changed,pad,held,pressed,nav,confirm:edge(0),back:edge(1),buttonEdges:down.map((v,i)=>v&&!this.previous[i]),down};
      this.previous=down;return result;
    }
    vibrate(strength=.4,duration=90){try{const actuator=this.device?.vibrationActuator;if(!actuator?.playEffect)return;Promise.resolve(actuator.playEffect('dual-rumble',{duration,startDelay:0,strongMagnitude:strength,weakMagnitude:strength*.5})).catch(()=>{});}catch{}}
  }
  return {Controller,DEFAULT,NAMES,buttonLabel,profileFor,Keyboard,KEY_DEFAULT};
});
