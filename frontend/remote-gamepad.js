'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TronoRemoteGamepad=api;})(globalThis,()=>{
 const bits=[0x1000,0x2000,0x4000,0x8000,0x100,0x200,0,0,0x20,0x10,0x40,0x80,1,2,4,8];
 const neutral=()=>[0,0,0,0,0,0,0];
 const axis=v=>Math.round(Math.max(-1,Math.min(1,Number.isFinite(v)?v:0))*(v<0?32768:32767));
 function snapshot(pad){if(!pad||pad.mapping!=='standard'||!pad.connected)return neutral();let buttons=0;for(let i=0;i<bits.length;i++)if(pad.buttons[i]?.pressed)buttons|=bits[i];const trigger=i=>Math.round(Math.max(0,Math.min(1,pad.buttons[i]?.value||0))*255);return [buttons,trigger(6),trigger(7),axis(pad.axes[0]),axis(-pad.axes[1]),axis(pad.axes[2]),axis(-pad.axes[3])];}
 function keyboard(keys){let b=0;for(const [key,bit]of Object.entries({Space:0x1000,KeyJ:0x1000,KeyK:0x2000,KeyX:0x4000,KeyU:0x4000,KeyI:0x8000,Enter:0x10,Backspace:0x20,KeyQ:0x100,KeyE:0x200,ArrowUp:1,ArrowDown:2,ArrowLeft:4,ArrowRight:8}))if(keys.has(key))b|=bit;return [b,keys.has('Digit1')?255:0,keys.has('Digit2')?255:0,axis(Number(keys.has('KeyD'))-Number(keys.has('KeyA'))),axis(Number(keys.has('KeyW'))-Number(keys.has('KeyS'))),0,0];}
 const keyboardKeys=new Set(['Space','KeyJ','KeyK','KeyX','KeyU','KeyI','Enter','Backspace','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Digit1','Digit2','KeyW','KeyA','KeyS','KeyD']);
 return {snapshot,keyboard,neutral,keyboardKeys};
});
