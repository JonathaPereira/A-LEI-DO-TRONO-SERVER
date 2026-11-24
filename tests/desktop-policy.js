'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path');
const {APP_ORIGIN,isAppURL,bundlePath,accelerator}=require('../electron/policy.cjs');
test('desktop origin and local bundle reject external domains, encoded traversal and invalid names',()=>{
  const root=path.resolve(os.tmpdir(),'mn-bundle');assert(isAppURL(APP_ORIGIN+'/index.html'));for(const url of ['file:///index.html',APP_ORIGIN+'.evil.test/',APP_ORIGIN.replace('https:','http:'),'bad'])assert(!isAppURL(url));
  assert.equal(bundlePath(root,APP_ORIGIN+'/'),path.join(root,'index.html'));
  for(const suffix of ['/%2e%2e%2fsecret','/%00','/%5csecret'])assert.throws(()=>bundlePath(root,APP_ORIGIN+suffix));
});
test('global shortcuts validate modifiers, keys and reserved combinations',()=>{
  assert.equal(accelerator({ctrl:true,shift:true,code:'KeyK'}),'Control+Shift+K');assert.equal(accelerator({code:'F9'}),'F9');
  for(const value of [null,{code:'KeyK'},{code:'F5'},{code:'F25'},{ctrl:true,code:'KeyW'},{alt:true,code:'F4'},{ctrl:true,code:'Delete'},{ctrl:true,code:'KeyK+F4'}])assert.throws(()=>accelerator(value));
});
