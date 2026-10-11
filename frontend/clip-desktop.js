'use strict';
window.TronoClipDesktop=(()=>{
  if(window.TronoDesktopClips)return window.TronoDesktopClips;
  const $=id=>document.getElementById(id),key='mn-clips-desktop-code';
  let socket=null,paired=false,globalActive=false,desired=null,last='',timer=null,code='';const events=new Set();
  try{const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1)),incoming=hash.get('clips-desktop');if(incoming&&/^[a-f0-9]{64}$/i.test(incoming)){code=incoming;sessionStorage.setItem(key,code);hash.delete('clips-desktop');url.hash=hash.toString();history.replaceState(null,'',url.pathname+url.search+url.hash);}else code=sessionStorage.getItem(key)||'';}catch{}
  function status(text){if($('clipDesktopStatus'))$('clipDesktopStatus').textContent=text;}
  function render(){if($('clipDesktopDisconnect'))$('clipDesktopDisconnect').hidden=!socket;if($('clipDesktopConnect'))$('clipDesktopConnect').disabled=!!socket;if($('clipDesktopCode'))$('clipDesktopCode').disabled=!!socket;}
  function send(data){if(paired&&socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data));}
  function configure(data){desired=data;const signature=JSON.stringify(data);if(paired&&signature!==last){last=signature;send({type:'configure',...data});}}
  function disconnect(){const ws=socket;socket=null;paired=false;globalActive=false;last='';clearTimeout(timer);ws?.close();render();status('Windows desconectado. O atalho funciona somente com esta página em foco.');}
  function connect(){
    if(socket)return;code=$('clipDesktopCode').value.trim();if(!/^[a-f0-9]{64}$/i.test(code)){status('Cole o código de conexão mostrado no aplicativo M&N Clipes.');return;}
    try{sessionStorage.setItem(key,code);}catch{}
    let ws;try{ws=new WebSocket('ws://127.0.0.1:32196/clips');}catch{status('Não foi possível conectar ao componente Windows.');return;}socket=ws;paired=false;render();status('Conectando ao componente neste computador… Permita acesso à rede local se o navegador perguntar.');
    timer=setTimeout(()=>{if(socket===ws&&!paired){disconnect();status('Sem resposta. Abra o M&N Clipes no Windows e permita acesso à rede local no navegador.');}},30000);
    ws.onopen=()=>ws.send(JSON.stringify({type:'pair',token:code}));
    ws.onmessage=e=>{if(socket!==ws)return;let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.type==='paired'){paired=true;last='';clearTimeout(timer);status('Windows conectado. O atalho será ativado quando o replay estiver pronto.');if(desired)configure(desired);}
      else if(m.type==='registered'){globalActive=m.active===true;status(globalActive?'Atalho global ativo: '+m.shortcut+'. Pode continuar com o jogo em foco.':'Windows conectado · aguardando o replay ficar ativo.');}
      else if(m.type==='error'){globalActive=false;status(m.message||'Não foi possível ativar o atalho global.');}
      else if(m.type==='clip'&&paired&&typeof m.id==='string'&&!events.has(m.id)){events.add(m.id);if(events.size>32)events.delete(events.values().next().value);window.TronoClips?.clip();}
    };
    ws.onerror=()=>{if(socket===ws)status('Não foi possível conectar. Abra o aplicativo Windows, confira o código e permita acesso à rede local.');};
    ws.onclose=()=>{if(socket!==ws)return;socket=null;paired=false;globalActive=false;last='';clearTimeout(timer);render();status('Componente Windows desconectado. Confira se está aberto e conecte novamente.');};
  }
  window.addEventListener('DOMContentLoaded',()=>{$('clipDesktopCode').value=code;$('clipDesktopConnect').onclick=connect;$('clipDesktopDisconnect').onclick=disconnect;render();if(code)status('Código do aplicativo recebido. Clique em Conectar ao Windows e permita o acesso local se solicitado.');});
  window.addEventListener('pagehide',disconnect);
  return {configure,disconnect,saved(count){send({type:'saved',count});},get connected(){return paired;},get globalActive(){return globalActive;}};
})();
