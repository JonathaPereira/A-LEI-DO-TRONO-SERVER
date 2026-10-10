'use strict';
// Each stream owns its idle clock. Activity elsewhere never wakes its controls.
window.TronoStreamControls=(()=>{
  const states=new WeakMap(),idleMs=3000;
  let inputMode='pointer';
  document.addEventListener('pointerdown',()=>{inputMode='pointer';},{capture:true});
  document.addEventListener('keydown',()=>{inputMode='keyboard';},{capture:true});
  function bind(tile){
    if(states.has(tile))return;
    const events=new AbortController();
    const state={active:false,timer:null,pressed:null,keyboardFocus:false,events};
    states.set(tile,state);tile.tabIndex=0;
    const clear=()=>{clearTimeout(state.timer);state.timer=null;};
    const arm=()=>{
      clear();
      if(!state.active||state.pressed!==null||state.keyboardFocus)return;
      state.timer=setTimeout(()=>{
        state.timer=null;
        if(!tile.isConnected){dispose(tile);return;}
        tile.classList.add('screen-controls-idle');
      },idleMs);
    };
    const reveal=()=>{tile.classList.remove('screen-controls-idle');arm();};
    const pointerActivity=()=>{state.keyboardFocus=false;reveal();};
    const listen=(target,type,handler)=>target.addEventListener(type,handler,{signal:events.signal});
    listen(tile,'pointerenter',pointerActivity);
    listen(tile,'pointermove',pointerActivity);
    listen(tile,'pointerdown',event=>{state.pressed=event.pointerId;pointerActivity();});
    for(const type of ['pointerup','pointercancel'])listen(document,type,event=>{
      if(state.pressed!==event.pointerId)return;
      state.pressed=null;arm();
    });
    listen(tile,'keydown',()=>{state.keyboardFocus=true;reveal();});
    listen(tile,'focusin',()=>{state.keyboardFocus=inputMode==='keyboard';reveal();});
    listen(tile,'focusout',event=>{if(!tile.contains(event.relatedTarget)){state.keyboardFocus=false;arm();}});
    state.update=active=>{
      if(state.active===active)return;
      state.active=active;reveal();
    };
  }
  function update(tile,active){bind(tile);states.get(tile).update(!!active);}
  function dispose(tile){
    const state=states.get(tile);if(!state)return;
    clearTimeout(state.timer);state.events.abort();states.delete(tile);
    tile.classList.remove('screen-controls-idle');
  }
  return {update,dispose};
})();
