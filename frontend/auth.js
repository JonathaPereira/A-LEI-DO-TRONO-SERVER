'use strict';
window.TronoAuth = (()=>{
  const $=id=>document.getElementById(id),KEY='mn-auth-session-v1';
  const SYMBOLS="!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";
  let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
  let session=null,user=null,guest=null,mode='login',recoveryToken=null,refreshPromise=null,refreshTimer=null,busy=false,refreshFailures=0;
  function passwordChecks(password){const p=typeof password==='string'?password:'';return {length:[...p].length>=8,lowercase:/[a-z]/.test(p),uppercase:/[A-Z]/.test(p),number:/[0-9]/.test(p),symbol:[...p].some(c=>SYMBOLS.includes(c))};}
  function validPassword(p){return Object.values(passwordChecks(p)).every(Boolean)&&new TextEncoder().encode(p).length<=72;}
  async function api(path,body,token,method='POST'){
    let r;try{r=await fetch(`${window.TronoNetwork.BACKEND_HTTP}/auth/${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:method==='GET'?undefined:JSON.stringify(body||{}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});}catch{throw Object.assign(new Error('Não foi possível conectar. Aguarde alguns segundos e tente novamente.'),{code:'NETWORK_ERROR'});}
    const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error?.message||'Não foi possível concluir. Tente novamente.'),{code:d.error?.code||'AUTH_ERROR',status:r.status});return d;
  }
  function message(text='',error=false){const el=$('authMessage');if(el){el.textContent=text;el.classList.toggle('auth-error',error);}}
  function syncAccount(){
    const name=user?.nickname||guest?.nickname||'';
    for(const id of ['portalIdentity','playerIdentity']){const el=$(id);if(el){el.value=name;el.readOnly=!!user||!guest;el.setAttribute('aria-readonly',String(el.readOnly));}}
    window.TronoPortal?.syncIdentity?.(name,{persist:false});
    try{if(name)(window.TronoStorage||localStorage).setItem('tronoPlayerName',name);else(window.TronoStorage||localStorage).removeItem('tronoPlayerName');}catch{}
    if($('portalPlayerLabel'))$('portalPlayerLabel').textContent=guest?`${name} · Convidado`:name||'Visitante';
    for(const id of ['portalNameAvailability','nameAvailability'])if($(id))$(id).textContent=user?'Apelido da sua conta':guest?'Convidado · acesso ao jogo e à voz da mesa':'Entre ou jogue como convidado';
    $('accountGuestExitBtn')?.classList.toggle('hidden',!guest);
    $('openGuestGameBtn')?.classList.toggle('hidden',!!user);
    document.body.classList.toggle('guest-mode',!!guest);
    if($('accountLoginBtn'))$('accountLoginBtn').classList.toggle('hidden',!!user);
    if($('accountProfileBtn'))$('accountProfileBtn').classList.toggle('hidden',!user);
    if($('accountLogoutBtn'))$('accountLogoutBtn').classList.toggle('hidden',!user);
    window.dispatchEvent(new CustomEvent('trono-auth-change',{detail:{user,guest}}));
  }
  function scheduleRefresh(){clearTimeout(refreshTimer);if(!session)return;const delay=Math.max(1000,session.expires_at*1000-Date.now()-60000);refreshTimer=setTimeout(()=>void refresh().catch(()=>{}),Math.min(delay,2147483647));}
  function setSession(data){session=data.session;user=data.user;guest=null;refreshFailures=0;try{sessionStorage.removeItem('mn-guest-v1');sessionStorage.setItem(KEY,JSON.stringify({session,user}));}catch{}syncAccount();scheduleRefresh();}
  function clearSession(){session=null;user=null;clearTimeout(refreshTimer);try{sessionStorage.removeItem(KEY);}catch{}syncAccount();}
  function expire(){clearSession();void window.TronoChatHub?.leave?.();void window.TronoSocial?.leaveVoice?.();window.TronoNetwork?.disconnect();window.TronoPortal?.showPortal?.();open('login');message('Sua sessão expirou. Entre novamente.',true);}
  async function refresh(){
    if(refreshPromise)return refreshPromise;if(!session)return null;
    const previous=session.refresh_token;
    refreshPromise=(async()=>{
      try{const data=await api('refresh',{refresh_token:previous});if(!session||session.refresh_token!==previous)return null;setSession(data);await window.TronoNetwork.authenticate(session.access_token);return session.access_token;}
      catch(err){if(!session||session.refresh_token!==previous)throw err;if(err.status===401||err.status===403){expire();}else{refreshFailures++;clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh().catch(()=>{}),Math.min(30000*refreshFailures,120000));}throw err;}
    })().finally(()=>{refreshPromise=null;});return refreshPromise;
  }
  async function getAccessToken(){await ready;if(refreshPromise)await refreshPromise;if(!session)return null;if(session.expires_at*1000-Date.now()<60000)return refresh();return session.access_token;}
  function updateChecks(){const checks=passwordChecks($('authPassword')?.value||'');for(const el of document.querySelectorAll('[data-password-rule]')){const passed=checks[el.dataset.passwordRule];el.classList.toggle('passed',passed);el.querySelector('span').textContent=passed?'✓':'○';}}
  const modes={login:{title:'Bem-vindo de volta',intro:'Entre na sua conta para conversar e jogar.',button:'Entrar'},signup:{title:'Crie sua conta',intro:'Escolha seu apelido e confirme seu e-mail para participar.',button:'Criar conta'},recover:{title:'Recupere sua senha',intro:'Enviaremos um link para você criar uma nova senha.',button:'Enviar link'},reset:{title:'Crie uma nova senha',intro:'Escolha uma senha que cumpra os requisitos abaixo.',button:'Salvar nova senha'}};
  function open(next='login'){
    mode=Object.hasOwn(modes,next)?next:'login';const copy=modes[mode],dialog=$('authDialog');if(!dialog)return;
    $('authForm').reset();$('authTitle').textContent=copy.title;$('authIntro').textContent=copy.intro;$('authSubmitBtn').textContent=copy.button;message();
    const fields={authNickname:mode==='signup',authEmail:mode!=='reset',authPassword:mode==='login'||mode==='signup'||mode==='reset',authConfirm:mode==='signup'||mode==='reset'};
    for(const [id,visible] of Object.entries(fields)){const input=$(id);input.disabled=!visible;input.required=visible;input.closest('.auth-field').classList.toggle('hidden',!visible);}
    $('authPassword').type='password';$('authConfirm').type='password';$('authPassword').autocomplete=mode==='login'?'current-password':'new-password';$('authPassword').minLength=mode==='login'?1:8;
    $('authRules').classList.toggle('hidden',!['signup','reset'].includes(mode));$('authForgotBtn').classList.toggle('hidden',mode!=='login');$('authModeLinks').classList.toggle('hidden',mode==='reset');
    $('authSignupBtn').classList.toggle('hidden',mode==='signup');$('authBackLoginBtn').classList.toggle('hidden',mode==='login');$('authShowPassword').checked=false;updateChecks();
    $('authGuestBtn')?.classList.toggle('hidden',mode!=='login');
    if(!dialog.open)dialog.showModal();setTimeout(()=>$(mode==='signup'?'authNickname':mode==='reset'?'authPassword':'authEmail')?.focus(),0);
  }
  async function submit(e){
    e.preventDefault();if(busy)return;
    const email=$('authEmail').value.trim(),password=$('authPassword').value,confirm=$('authConfirm').value;
    if(['signup','reset'].includes(mode)){
      if(!validPassword(password)){message(new TextEncoder().encode(password).length>72?'A senha deve ter no máximo 72 bytes.':'A senha precisa cumprir todos os requisitos abaixo.',true);$('authPassword').focus();return;}
      if(password!==confirm){message('As senhas não são iguais.',true);$('authConfirm').focus();return;}
    }
    busy=true;$('authSubmitBtn').disabled=true;$('authForm').setAttribute('aria-busy','true');message('Aguarde…');
    try{
      if(mode==='login'){
        const data=await api('login',{email,password});if(guest){await window.TronoSocial?.leaveVoice?.();window.TronoNetwork.leaveRoom();window.TronoPortal?.showPortal?.();}setSession(data);await window.TronoNetwork.authenticate(data.session.access_token);$('authForm').reset();$('authDialog').close();
      }else if(mode==='signup'){
        const data=await api('signup',{email,password,nickname:$('authNickname').value});open('login');$('authEmail').value=email;message(data.message);
      }else if(mode==='recover'){
        const data=await api('recover',{email});message(data.message);
      }else if(mode==='reset'){
        if(!recoveryToken)throw new Error('Este link expirou. Solicite uma nova recuperação de senha.');
        const data=await api('reset',{password},recoveryToken);recoveryToken=null;clearSession();window.TronoNetwork.disconnect();open('login');message(data.message);
      }
    }catch(err){message(err.message,true);}finally{busy=false;$('authSubmitBtn').disabled=false;$('authForm').setAttribute('aria-busy','false');}
  }
  async function logout(){
    const token=session?.access_token;clearSession();recoveryToken=null;window.TronoNetwork.disconnect();
    try{await window.TronoChatHub?.leave?.();}catch{}try{await window.TronoSocial?.leaveVoice?.();}catch{}window.TronoPortal?.showPortal?.();
    if(token)await api('logout',{},token).catch(()=>{});open('login');
  }
  async function callback(){
    const data=window.TronoAuthCallback;delete window.TronoAuthCallback;if(!data)return false;
    clearSession();window.TronoNetwork.disconnect();
    if(data.error){open('recover');message('Este link expirou ou não é válido. Solicite outro e-mail.',true);return true;}
    try{
      const recovery=data.hashType==='recovery'||data.type==='recovery';
      if(data.token_hash){
        const result=await api('verify',{token_hash:data.token_hash,type:recovery?'recovery':data.type});
        if(recovery){recoveryToken=result.recovery_token;open('reset');}else{open('login');message(result.message);}
      }else if(data.access_token){
        // Supports Supabase's default ConfirmationURL callback as well as TokenHash templates.
        await api('me',null,data.access_token,'GET');
        if(recovery){recoveryToken=data.access_token;open('reset');}else{await api('logout',{},data.access_token).catch(()=>{});open('login');message('E-mail confirmado. Entre com sua senha.');}
      }
    }catch(err){open('recover');message(err.message,true);}return true;
  }
  async function bind(){
    $('authForm')?.addEventListener('submit',submit);$('accountLoginBtn')?.addEventListener('click',()=>open('login'));$('accountLogoutBtn')?.addEventListener('click',()=>void logout());
    $('authCloseBtn')?.addEventListener('click',()=>{if(!busy)$('authDialog').close();});$('authDialog')?.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    $('authSignupBtn')?.addEventListener('click',()=>{if(!busy)open('signup');});$('authBackLoginBtn')?.addEventListener('click',()=>{if(!busy)open('login');});$('authForgotBtn')?.addEventListener('click',()=>{if(!busy)open('recover');});
    $('authGuestBtn')?.addEventListener('click',openGuest);$('openGuestGameBtn')?.addEventListener('click',openGuest);$('guestClose')?.addEventListener('click',()=>$('guestDialog').close());$('guestForm')?.addEventListener('submit',submitGuest);$('accountGuestExitBtn')?.addEventListener('click',endGuest);
    $('authPassword')?.addEventListener('input',updateChecks);$('authConfirm')?.addEventListener('input',()=>{if(!busy&&$('authMessage')?.textContent==='As senhas não são iguais.'&&$('authPassword').value===$('authConfirm').value)message();});$('authShowPassword')?.addEventListener('change',e=>{for(const id of ['authPassword','authConfirm'])$(id).type=e.target.checked?'text':'password';});
    window.TronoNetwork.onMessage(msg=>{if(msg.type==='error'&&msg.code==='AUTH_REQUIRED')expire();if(msg.type==='role-updated')applyRole(msg.role,msg.permissions);if(msg.type==='auth-result'&&msg.ok)applyRole(msg.user?.role,msg.user?.permissions);});
    try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.session?.refresh_token&&saved?.session?.access_token&&saved?.user?.id){session=saved.session;user=saved.user;}}catch{}
    if(!session)try{const saved=JSON.parse(sessionStorage.getItem('mn-guest-v1')||'null');if(saved?.ticket&&saved.expiresAt>Date.now())guest=saved;}catch{}
    syncAccount();
    if(await callback())return;
    if(session){try{if(session.expires_at*1000-Date.now()<60000)await refresh();else{const data=await api('me',null,session.access_token,'GET');setSession({session,user:data.user});}}catch(err){if(err.status===401||err.status===403){expire();}else{scheduleRefresh();window.TronoPortal?.setNameFeedback?.({code:'NETWORK_OFFLINE',message:'Aguardando conexão para retomar sua conta.'});}}}
    else if(guest){try{const restored=await window.TronoNetwork.authenticateGuest(guest.nickname,guest.ticket);setGuest(restored);window.TronoPortal?.openGame?.();}catch{guest=null;sessionStorage.removeItem('mn-guest-v1');syncAccount();open('login');}}
    else open('login');
  }
  window.addEventListener('DOMContentLoaded',()=>void bind().finally(()=>resolveReady()));
  window.addEventListener('trono-auth-callback',()=>void callback());
  window.addEventListener('focus',()=>{if(session&&session.expires_at*1000-Date.now()<60000)void refresh().catch(()=>{});});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session&&session.expires_at*1000-Date.now()<60000)void refresh().catch(()=>{});});
  async function updateProfile(profile){const token=await getAccessToken();if(!token)throw new Error('Entre na sua conta.');const data=await api('profile',profile,token);setSession({session,user:data.user});return data.user;}
  function applyRole(role,permissions){if(!user||!['creator','admin','member'].includes(role))return;user={...user,role,permissions};try{sessionStorage.setItem(KEY,JSON.stringify({session,user}));}catch{}window.dispatchEvent(new CustomEvent('trono-role-change',{detail:{user}}));}
  function setGuest(value){const changed=guest?.id!==value.id||guest?.nickname!==value.nickname;guest=value;try{sessionStorage.setItem('mn-guest-v1',JSON.stringify(guest));}catch{}if(changed)syncAccount();}
  function openGuest(){if(busy||user)return;$('authDialog')?.close();$('guestNickname').value=guest?.nickname||'';$('guestMessage').textContent='';$('guestDialog').showModal();$('guestNickname').focus();}
  async function ensureGuest(name){await ready;if(!guest){openGuest();return false;}const result=await window.TronoNetwork.authenticateGuest(String(name||guest.nickname).trim(),guest.ticket);setGuest(result);return true;}
  async function submitGuest(e){e.preventDefault();const button=$('guestSubmit');if(button.disabled)return;button.disabled=true;$('guestMessage').textContent='Conectando ao jogo…';try{const result=await window.TronoNetwork.authenticateGuest($('guestNickname').value.trim(),guest?.ticket);setGuest(result);$('guestDialog').close();window.TronoPortal.openGame();}catch(err){$('guestMessage').textContent=err.message;}finally{button.disabled=false;}}
  async function endGuest(){await window.TronoSocial?.leaveVoice?.();window.TronoNetwork?.leaveRoom();window.TronoNetwork?.disconnect();guest=null;try{sessionStorage.removeItem('mn-guest-v1');}catch{}syncAccount();window.TronoPortal?.showPortal?.();}
  return {ready,updateProfile,open,openGuest,ensureGuest,logout,expire,getAccessToken,passwordChecks,validPassword,get user(){return user;},get guest(){return guest;}};
})();
