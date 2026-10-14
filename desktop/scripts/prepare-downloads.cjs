'use strict';
const {prepareSite}=require('./package-site.cjs');
prepareSite({installerPath:process.env.MN_INSTALLER_PATH||undefined}).then(result=>{
  console.log(`Site leve ${(result.siteBytes/1024/1024).toFixed(1)} MiB; instalador separado ${(result.installerBytes/1024/1024).toFixed(1)} MiB.`);
  console.log('Publicar este instalador no GitHub Releases antes do site: '+result.url);
}).catch(error=>{console.error(error.message);process.exitCode=1;});
