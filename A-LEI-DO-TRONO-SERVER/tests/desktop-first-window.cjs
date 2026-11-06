'use strict';

async function firstSizedWindow(app, size) {
  const page = await firstAppWindow(app);
  const window = await app.browserWindow(page);
  try {
    await window.evaluate((window, size) => window.setContentSize(size.width, size.height), size);
  } finally {
    await window.dispose();
  }
  return page;
}

async function firstAppWindow(app) {
  try { return await app.firstWindow(); }
  catch(error) {
    let timer;
    const state=await Promise.race([
      app.evaluate(({app,BrowserWindow})=>({ready:app.isReady(),singleInstance:app.hasSingleInstanceLock(),startup:globalThis.__mnDesktopStartup||null,windows:BrowserWindow.getAllWindows().map(window=>({destroyed:window.isDestroyed(),visible:window.isVisible(),loading:window.webContents.isLoading(),crashed:window.webContents.isCrashed?.()||false,hasURL:!!window.webContents.getURL()}))})).catch(()=>({unavailable:true})),
      new Promise(resolve=>{timer=setTimeout(()=>resolve({unresponsive:true}),2000);})
    ]);clearTimeout(timer);
    error.message+=' Startup state: '+JSON.stringify({...state,observedPages:app.windows().length,exitCode:app.process().exitCode,signalCode:app.process().signalCode});
    throw error;
  }
}
// Playwright adds its ready handshake only when executablePath is omitted.
// Our unpackaged fixtures select the pinned executable explicitly, so preload
// the same pinned loader before the application entry. Packaged EXEs keep their
// existing launch path and are never passed to this helper.
function launchDesktop(electron, options) {
  const path=require('node:path');
  const loader=path.join(path.dirname(require.resolve('playwright-core/package.json')),'lib/server/electron/loader.js');
  return electron.launch({...options,args:['-r',loader,...(options.args||[])]});
}
module.exports = { firstSizedWindow, firstAppWindow, launchDesktop };
