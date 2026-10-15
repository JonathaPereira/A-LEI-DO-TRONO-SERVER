'use strict';
// A second human must answer setup prompts too; the UI test stops before play.
module.exports=function answerSetupPrompts(socket){
  const answered=new Set();socket.on('message',raw=>{
    const m=JSON.parse(raw);
    if(m.type==='private-usurpation'||m.type==='private-intelligence'){socket.send(JSON.stringify({type:'game-action',action:m.type==='private-usurpation'?'usurp-ack':'intelligence-ack',payload:{}}));return;}
    if(m.type!=='game-prompt'||answered.has(m.prompt.id))return;
    const p=m.prompt;let payload;
    if(['choose-decree','choose-law','choose-trump'].includes(p.kind))payload={value:p.options.includes('favor')?'favor':p.options.includes('ordem')?'ordem':p.options[0]};
    else if(['choose-reserva','choose-corte','choose-conselho','rotation','challenge','usurp-give'].includes(p.kind))payload={cardId:p.cardIds[0]};
    else if(p.kind==='usurp-target')payload={targetSeat:p.options[0].seat};
    else if(p.kind==='usurp-pick')payload={index:0};
    else return;
    answered.add(p.id);socket.send(JSON.stringify({type:'game-action',action:p.kind,payload}));
  });
};
