'use strict';
window.TronoAppearance=(()=>{
  const storage=window.TronoStorage||localStorage;
  const themes=new Set(['purple','green','red','blue','yellow']);
  const key=()=> 'mnTheme:'+(window.TronoAuth?.user?.id||'guest');
  let current='purple';
  function apply(value,{save=false}={}){
    current=themes.has(value)?value:'purple';document.documentElement.dataset.theme=current;
    for(const input of document.querySelectorAll('[name=profileTheme]'))input.checked=input.value===current;
    if(save){try{storage.setItem(key(),current);}catch{}document.getElementById('appearanceMessage').textContent='Tema aplicado.';}
    window.dispatchEvent(new CustomEvent('trono-theme-change',{detail:{theme:current}}));
  }
  function read(){let value;try{value=storage.getItem(key());}catch{}apply(value);}
  function bind(){
    for(const input of document.querySelectorAll('[name=profileTheme]'))input.addEventListener('change',()=>{if(input.checked)apply(input.value,{save:true});});
    window.addEventListener('trono-auth-change',read);read();
    void window.TronoAuth.ready.then(read);
  }
  window.addEventListener('DOMContentLoaded',bind);
  return {get theme(){return current;}};
})();
