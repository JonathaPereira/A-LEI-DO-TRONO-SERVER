'use strict';
// Child-process fixture only: run the unchanged authoritative actions quickly,
// with a known pair of offered decrees. There is no production cheat endpoint.
const Module=require('node:module'),path=require('node:path'),server=path.resolve(__dirname,'../server.js'),compile=Module.prototype._compile;
Module.prototype._compile=function(source,filename){
 if(filename===server){
   const original=source.slice(source.indexOf('function schedule('),source.indexOf('function leaveTextRoom('));
   const accelerated=original.replace('},ms);','},Math.min(ms,8));');
   if(accelerated===original)throw Error('Test scheduler no longer matches the server');source=source.replace(original,accelerated);
   const decree=process.env.TRONO_TEST_DECREE;if(!['conselho','favor','espionagem','peso'].includes(decree))throw Error('Invalid test decree');
   source=source.replace('const picks=shuffle(DECREES).slice(0,2).map(d=>d.id);',`const picks=['${decree}','ordem-test-never-selected'];`);
 }
 return compile.call(this,source,filename);
};
