'use strict';
const assert=require('node:assert/strict'),{expect}=require('@playwright/test');
// Reuses the already authenticated local protocol fixture from the Splendor flow.
async function exerciseLoveLetter({page,screenshot}){
 await page.evaluate(()=>window.TronoGames.openLibrary());await page.locator('#playLoveLetter').click();await page.locator('#loveLetterPlayerCount').selectOption('4');await page.getByRole('button',{name:'Criar mesa',exact:true}).click();await expect(page.locator('.ll-seats')).toBeVisible();await page.getByRole('button',{name:'Completar com bots e começar'}).click();await expect(page.locator('.ll-opponent')).toHaveCount(3);await expect(page.locator('.ll-reference-card')).toHaveCount(10);
 await expect.poll(()=>page.evaluate(()=>{const s=window.TronoLoveLetter.room.state;return s.players[s.turn].id===window.TronoAuth.user.id&&s.phase==='action';}),{timeout:20000}).toBe(true);
 const before=await page.evaluate(()=>window.TronoLoveLetter.room.state.revision);await page.locator('.ll-hand .ll-card:enabled').first().click();await expect(page.locator('#loveLetterPlayDialog')).toBeVisible();await page.locator('#loveLetterConfirm').click();await expect.poll(()=>page.evaluate(()=>window.TronoLoveLetter.room.state.revision)).toBeGreaterThan(before);
 assert(await page.locator('#loveLetterScreen').evaluate(n=>n.scrollWidth<=n.clientWidth+1));if(screenshot)await page.screenshot({path:screenshot});
}
module.exports={exerciseLoveLetter};
