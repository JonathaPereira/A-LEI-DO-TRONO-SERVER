'use strict';
window.TronoPanelLayout=(()=>{
  const root=document.documentElement,storage=window.TronoStorage||localStorage;
  const dimensions=['sidebar-width','sidebar-height','strip-height','chat-width','chat-height','people-width','people-height','center-height'];
  const panels={
    sidebar:{element:()=>document.querySelector('.mn-channel-sidebar'),name:'canais',width:'sidebar-width',height:()=>innerWidth<=640?'strip-height':'sidebar-height',direction:1},
    chat:{element:()=>document.querySelector('#socialPanel .court-chat-section'),name:'mensagens',width:'chat-width',height:()=> 'chat-height',direction:-1},
    people:{element:()=>document.getElementById('communityPanel'),name:'pessoas',width:'people-width',height:()=> 'people-height',direction:-1},
    center:{element:()=>document.getElementById('socialPanel'),name:'chamada',height:()=> 'center-height',direction:1}
  };
  let values={},drag=null;
  const key=()=> 'mnPanelLayout:'+(window.TronoAuth?.user?.id||'guest');
  function apply(){
    for(const name of dimensions){const value=values[name];if(Number.isFinite(value)&&value>0)root.style.setProperty('--layout-'+name,Math.round(value)+'px');else root.style.removeProperty('--layout-'+name);}
    refreshHandles();
  }
  function persist(){try{storage.setItem(key(),JSON.stringify(values));}catch{}}
  function load(){
    cancel();values={};try{const saved=JSON.parse(storage.getItem(key())||'{}');for(const name of dimensions)if(Number.isFinite(saved[name])&&saved[name]>0&&saved[name]<=4000)values[name]=saved[name];}catch{}
    apply();
  }
  function limits(name,axis){
    const panel=panels[name],element=panel.element(),rect=element.getBoundingClientRect();
    if(axis==='height'){
      if(name==='sidebar'&&innerWidth<=640)return {min:76,max:Math.min(220,innerHeight-rect.top)};
      const minimum=name==='sidebar'?(innerWidth<=640?76:330):name==='center'?Math.min(360,innerHeight-rect.top):240;
      const footer=name==='people'&&innerWidth<1280?70:0;
      return {min:Math.min(minimum,innerHeight-rect.top-footer),max:Math.max(0,innerHeight-rect.top-footer)};
    }
    if(name==='sidebar')return {min:180,max:Math.min(420,innerWidth*.35)};
    if(name==='people')return {min:200,max:Math.min(360,innerWidth-32)};
    const parent=document.getElementById('socialPanel').getBoundingClientRect();
    return {min:Math.min(250,parent.width),max:innerWidth>=1280?Math.min(560,parent.width*.5):Math.min(560,parent.width)};
  }
  function resize(name,axis,value){
    const range=limits(name,axis),panel=panels[name],dimension=axis==='width'?panel.width:panel.height();
    values[dimension]=Math.round(Math.max(range.min,Math.min(range.max,value)));apply();
  }
  function refreshHandles(){
    for(const handle of document.querySelectorAll('[data-panel-resize]')){
      const {panelResize:name,resizeAxis:axis}=handle.dataset;if(axis==='both')continue;
      const rect=panels[name].element().getBoundingClientRect();if(!rect.width||!rect.height)continue;
      const range=limits(name,axis);handle.setAttribute('aria-valuemin',String(Math.round(range.min)));handle.setAttribute('aria-valuemax',String(Math.round(range.max)));handle.setAttribute('aria-valuenow',String(Math.round(axis==='width'?rect.width:rect.height)));
    }
  }
  function finish(e){
    if(!drag||e?.pointerId!==undefined&&e.pointerId!==drag.pointerId)return;const saved=drag;drag=null;document.body.classList.remove('panel-resizing');
    if(saved.handle.hasPointerCapture(saved.pointerId))saved.handle.releasePointerCapture(saved.pointerId);persist();refreshHandles();
  }
  function cancel(){
    if(!drag)return;const saved=drag;drag=null;values=saved.original;document.body.classList.remove('panel-resizing');
    if(saved.handle.hasPointerCapture(saved.pointerId))saved.handle.releasePointerCapture(saved.pointerId);apply();
  }
  function reset(){cancel();values={};for(const name of dimensions)root.style.removeProperty('--layout-'+name);try{storage.removeItem(key());}catch{}refreshHandles();document.getElementById('appearanceMessage').textContent='Layout restaurado ao padrão.';}
  function start(e){
    if(e.button!==0||drag||document.fullscreenElement)return;
    const handle=e.currentTarget,name=handle.dataset.panelResize,axis=handle.dataset.resizeAxis,rect=panels[name].element().getBoundingClientRect();
    e.preventDefault();drag={handle,name,axis,pointerId:e.pointerId,x:e.clientX,y:e.clientY,width:rect.width,height:rect.height,original:{...values}};
    document.body.classList.add('panel-resizing');handle.setPointerCapture(e.pointerId);
  }
  function move(e){
    if(!drag||e.pointerId!==drag.pointerId)return;
    e.preventDefault();if(drag.axis!=='height')resize(drag.name,'width',drag.width+(e.clientX-drag.x)*panels[drag.name].direction);
    if(drag.axis!=='width')resize(drag.name,'height',drag.height+e.clientY-drag.y);
  }
  function keyboard(e){
    const handle=e.currentTarget,{panelResize:name,resizeAxis:axis}=handle.dataset,panel=panels[name],rect=panel.element().getBoundingClientRect();
    if(e.key==='Home'){e.preventDefault();if(axis!=='height')delete values[panel.width];if(axis!=='width')delete values[panel.height()];apply();persist();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    const horizontal=['ArrowLeft','ArrowRight'].includes(e.key);if(axis==='height'&&horizontal||axis==='width'&&!horizontal)return;
    e.preventDefault();const change=(e.shiftKey?50:20)*(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);
    resize(name,horizontal?'width':'height',horizontal?rect.width+change*panel.direction:rect.height+change);persist();
  }
  function addHandle(name,axis){
    const handle=document.createElement('div'),panel=panels[name];handle.className='panel-resize-handle resize-'+axis+' resize-'+name;
    handle.dataset.panelResize=name;handle.dataset.resizeAxis=axis;handle.tabIndex=0;
    handle.setAttribute('role',axis==='both'?'button':'separator');if(axis!=='both')handle.setAttribute('aria-orientation',axis==='width'?'vertical':'horizontal');
    const label=(axis==='both'?'Ajustar tamanho':axis==='width'?'Ajustar largura':'Ajustar altura')+' do painel de '+panel.name;handle.setAttribute('aria-label',label);handle.title=label+' · arraste ou use as setas; Home restaura';
    handle.addEventListener('pointerdown',start);handle.addEventListener('keydown',keyboard);handle.addEventListener('lostpointercapture',finish);panel.element().appendChild(handle);
  }
  function bind(){
    for(const [name,panel] of Object.entries(panels)){if(panel.width)addHandle(name,'width');addHandle(name,'height');if(panel.width)addHandle(name,'both');}
    document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});window.addEventListener('blur',cancel);
    window.addEventListener('resize',()=>{cancel();refreshHandles();});window.addEventListener('trono-auth-change',load);
    new MutationObserver(refreshHandles).observe(document.body,{attributes:true,attributeFilter:['class']});
    document.getElementById('layoutResetBtn').onclick=reset;load();void window.TronoAuth.ready.then(load);
  }
  window.addEventListener('DOMContentLoaded',bind);
  return {reset};
})();
