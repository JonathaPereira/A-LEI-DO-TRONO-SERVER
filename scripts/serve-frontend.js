'use strict';
const express=require('express'),path=require('node:path');
const port=Number(process.env.FRONTEND_PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('FRONTEND_PORT must be a valid TCP port');
const app=express();app.disable('x-powered-by');
app.use(express.static(path.resolve(__dirname,'../frontend'),{maxAge:0}));
const server=app.listen(port,'127.0.0.1',()=>console.log('Frontend development server ready on port '+port));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
