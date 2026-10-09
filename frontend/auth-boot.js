'use strict';
// Capture and remove one-use credentials before the rest of the page loads assets.
(() => {
 function capture(){
  const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1));
  const tokenHash=url.searchParams.get('token_hash');
  const access=hash.get('access_token');
  if(!tokenHash&&!access&&!hash.get('error')&&!url.searchParams.get('error'))return false;
  window.TronoAuthCallback={token_hash:tokenHash,type:url.searchParams.get('type')||(url.searchParams.get('auth')==='recovery'?'recovery':'signup'),access_token:access,refresh_token:hash.get('refresh_token'),expires_at:hash.get('expires_at'),hashType:hash.get('type'),error:hash.get('error')||url.searchParams.get('error')};
  for(const key of ['token_hash','type','auth','error','error_code','error_description'])url.searchParams.delete(key);
  url.hash='';history.replaceState(null,'',url.pathname+url.search);
  return true;
 }
 capture();
 window.addEventListener('hashchange',()=>{if(capture())window.dispatchEvent(new Event('trono-auth-callback'));});
})();
