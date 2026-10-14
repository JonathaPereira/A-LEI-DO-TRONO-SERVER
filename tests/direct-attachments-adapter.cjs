'use strict';
// TEST ONLY: install an in-memory object store in child fixture servers. No real R2.
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const files=require('../files'),original=files.createFiles;
files.createFiles=options=>{
  const objects=new Map(),capabilities=new Map();
  const storage=original({...options,adapter:{
    async put(key,body,size,mime,name){const chunks=[];for await(const chunk of body)chunks.push(chunk);const bytes=Buffer.concat(chunks);assert.equal(bytes.length,size);objects.set(key,{bytes,mime,name});},
    async remove(key){objects.delete(key);},
    url(row){const token=crypto.randomBytes(24).toString('hex');capabilities.set(token,{key:row.object_key,expires:Date.now()+300000});return `http://127.0.0.1:${process.env.PORT}/fixture-storage/${token}`;}
  }});
  const install=storage.install;storage.install=app=>{
    app.get('/fixture-storage/:token',(req,res)=>{const cap=capabilities.get(req.params.token),object=cap&&cap.expires>Date.now()&&objects.get(cap.key);if(!object)return res.sendStatus(404);res.set({'Content-Type':object.mime,'Content-Disposition':'attachment','X-Content-Type-Options':'nosniff'});res.end(object.bytes);});install(app);
  };
  return storage;
};
