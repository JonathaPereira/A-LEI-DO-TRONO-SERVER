'use strict';
// A disposable HTTPS API verifies real request-body/CORS forwarding through
// the desktop's HTTPS protocol handler. No production account or API is used.
const https=require('node:https'),fs=require('node:fs/promises'),path=require('node:path'),{spawnSync}=require('node:child_process');
async function startHTTPS(directory){
  const key=path.join(directory,'api-key.pem'),cert=path.join(directory,'api-cert.pem');
  const openssl=process.platform==='win32'?path.join(process.env.ProgramFiles||'C:\\Program Files','Git/usr/bin/openssl.exe'):'openssl';
  const generated=spawnSync(openssl,['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{encoding:'utf8',timeout:30000});
  if(generated.status!==0)throw Error('Could not generate disposable API certificate: '+(generated.error?.message||generated.stderr));
  const server=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','https://a-lei-do-trono.surge.sh');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-File-Name');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    let body='';for await(const part of req)body+=part;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({method:req.method,origin:req.headers.origin,authorization:req.headers.authorization,filename:req.headers['x-file-name'],body}));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:'https://127.0.0.1:'+server.address().port,stop:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={startHTTPS};
