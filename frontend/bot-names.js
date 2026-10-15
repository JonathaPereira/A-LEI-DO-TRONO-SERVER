(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TronoBots=factory();})(globalThis,()=>{
 'use strict';const names=Object.freeze(['Epaminondas','Bonifácio','Cícero']);
 function next(players=[]){const used=new Set(players.filter(p=>p.bot||p.ai).map(p=>p.name));for(let group=0;;group++)for(const base of names){const name=base+(group?' '+(group+1):'');if(!used.has(name))return name;}}
 const at=i=>names[i%names.length]+(i>=names.length?' '+(Math.floor(i/names.length)+1):'');return {names,next,at};
});
