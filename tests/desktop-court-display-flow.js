'use strict';
const assert=require('node:assert/strict'),{expect}=require('@playwright/test');
async function exerciseCourtFullscreen({app,page}){
  const original=await page.evaluate(()=>[...document.querySelectorAll('.screen')].find(n=>!n.classList.contains('hidden'))?.id);
  const before=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen());
  try{
    await page.evaluate(()=>window.TronoPortal.showOnly('gameScreen'));
    if(before)await page.evaluate(()=>window.TronoDesktop.toggleFullscreen());
    await page.locator('#courtFullscreen').click();await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
    await expect(page.locator('body')).toHaveClass(/court-fullscreen/);await expect(page.locator('#desktopTopBar')).toBeHidden();await expect(page.locator('#desktopCallDock')).toBeHidden();
    assert.equal(await page.evaluate(()=>document.fullscreenElement),null,'Desktop uses the native window, rather than simulated element fullscreen');
    await page.locator('#courtFullscreen').click();await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);await expect(page.locator('body')).not.toHaveClass(/court-fullscreen/);
  }finally{
    const current=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen());if(current!==before)await page.evaluate(()=>window.TronoDesktop.toggleFullscreen());if(original)await page.evaluate(id=>window.TronoPortal.showOnly(id),original);
  }
}
module.exports={exerciseCourtFullscreen};
