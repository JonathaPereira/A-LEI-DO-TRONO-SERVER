'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TicketToRideArt=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const base='assets/ticket-to-ride/';
 // Coordinates belong to the supplied 1024 × 683 board, independently of game rules.
 const cities={
  Vancouver:[109,105],Seattle:[105,160],Portland:[83,211],'San Francisco':[69,408],'Los Angeles':[147,512],
  Calgary:[239,88],Helena:[340,220],'Salt Lake City':[268,344],'Las Vegas':[212,454],Phoenix:[267,519],
  Winnipeg:[464,99],Duluth:[577,214],Omaha:[546,306],Denver:[398,375],'Santa Fe':[391,466],'El Paso':[386,556],
  'Sault St. Marie':[704,148],Toronto:[813,170],Chicago:[699,276],'Kansas City':[567,357],'Oklahoma City':[547,444],Dallas:[567,532],Houston:[608,572],
  'Saint Louis':[653,358],'Little Rock':[637,448],'New Orleans':[701,560],Nashville:[747,397],Atlanta:[798,432],Miami:[924,597],Charleston:[892,439],Raleigh:[864,374],
  Pittsburgh:[830,261],Washington:[923,307],'New York':[914,216],Boston:[967,142],Montreal:[896,83]
 };
 // Intermediate points follow the printed bends; parallel lanes remain separately clickable.
 const bends={
  2:[[160,151],[203,129]],3:[[196,186],[269,205]],5:[[160,233],[217,277]],6:[[62,272],[56,338]],
  8:[[95,462],[128,494]],11:[[183,540],[232,561],[287,571],[341,567]],12:[[252,407]],
  15:[[279,66],[328,52],[375,53],[421,72]],18:[[458,218]],21:[[550,113],[632,131]],
  23:[[618,179],[665,159]],24:[[685,202]],26:[[552,258]],27:[[588,278],[618,263],[665,271]],
  30:[[448,383],[497,376],[544,364]],33:[[354,423],[309,475]],40:[[425,585],[475,599],[526,597],[574,587]],
  47:[[595,357],[626,357]],48:[[675,315]],49:[[716,322],[772,291]],54:[[724,515],[758,470]],
  55:[[760,539],[818,535],[867,555]],58:[[784,372],[824,363]],61:[[827,478],[871,541]],63:[[898,487],[910,545]],
  67:[[921,260]],72:[[768,255],[735,261]],73:[[738,238],[775,201]],76:[[802,109]],77:[[936,100]]
 };
 const cards={purple:[32,27,300,461],white:[365,27,297,461],blue:[691,27,303,461],yellow:[32,524,300,464],orange:[365,524,297,464],black:[691,524,303,464],red:[32,1021,300,474],green:[365,1021,297,474],loco:[691,1021,303,474]};
 const pieces={red:[0,0,768,512],blue:[768,0,768,512],green:[0,512,768,512],yellow:[768,512,768,512]};
 const playerColors=['#d83836','#238ee5','#2dba59','#e3b92c','#ad79cf'];
 const playerPieces=['red','blue','green','yellow','purple'];
 function geometry(route){
  const center=[cities[route.a],...(bends[route.group]||[]),cities[route.b]],offset=route.double?(route.lane?6:-6):0;
  const points=center.map(([x,y],i)=>{const a=center[Math.max(0,i-1)],b=center[Math.min(center.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);return [x-dy/length*offset,y+dx/length*offset];});
  const segments=points.slice(1).map((b,i)=>{const a=points[i],dx=b[0]-a[0],dy=b[1]-a[1];return {a,b,dx,dy,length:Math.hypot(dx,dy)};}),length=segments.reduce((n,s)=>n+s.length,0);
  function at(distance){let left=distance;for(const segment of segments){if(left<=segment.length){return {x:segment.a[0]+segment.dx*left/segment.length,y:segment.a[1]+segment.dy*left/segment.length,angle:Math.atan2(segment.dy,segment.dx)*180/Math.PI};}left-=segment.length;}const last=segments.at(-1);return {x:last.b[0],y:last.b[1],angle:Math.atan2(last.dy,last.dx)*180/Math.PI};}
  const inset=12,spacing=(length-inset*2)/route.length;
  return {path:points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' '),middle:at(length/2),wagons:Array.from({length:route.length},(_,i)=>({...at(inset+spacing*(i+.5)),width:Math.min(29,spacing-2)}))};
 }
 return {base,board:base+'board-usa.jpg',fronts:base+'train-cards.webp',back:base+'train-back.webp',destinations:base+'destination-back.webp',wagons:base+'wagons.webp',cities,cards,pieces,playerColors,playerPieces,geometry};
});
