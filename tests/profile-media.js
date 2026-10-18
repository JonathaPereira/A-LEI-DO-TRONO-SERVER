'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{cleanProfile}=require('../server/profile-customization'),gifs=require('../src/lib/profiles/giphy.ts');
test('profile links accept bare domains and optional labels; emoji keeps one complete grapheme',()=>{
 const d=cleanProfile({links:[{url:'youtube.com/@exemplo'},{label:'Ao vivo',url:'http://twitch.tv/exemplo'},{label:'',url:''}],emoji:'👨‍👩‍👧‍👦',cover_position:15,cover_zoom:135});
 assert.deepEqual(d.links,[{label:'YouTube',url:'https://youtube.com/@exemplo'},{label:'Ao vivo',url:'https://twitch.tv/exemplo'}]);assert.equal(d.emoji,'👨‍👩‍👧‍👦');
 for(const emoji of ['🎮🎧','status','a🎧'])assert.throws(()=>cleanProfile({emoji}));
 for(const url of ['javascript:alert(1)','data:text/html,hi','https://user:pass@example.com','https://example.com/has spaces'])assert.throws(()=>cleanProfile({links:[{url}]}));
 assert.throws(()=>cleanProfile({links:[{label:'Sem endereço'}]}));assert.throws(()=>cleanProfile({media_credits:{cover:{source:'https://commons.wikimedia.org.evil.test/x'}}}));
});
const image={url:'https://media.giphy.com/media/abc123/giphy.gif',size:'1200',width:'320',height:'200'};
const gif={id:'abc123',type:'gif',rating:'g',title:'Animation',url:'https://giphy.com/gifs/animation-abc123',user:{display_name:'<b>Auteur</b>'},images:{original:image}};
test('GIPHY search/trending encode queries, paginate and never forward app credentials',async()=>{
 let requested,options;const result=await gifs.search('stars & sky',{apiKey:'fixture-client-key',fetcher:async(url,opts)=>{requested=new URL(url);options=opts;return {ok:true,json:async()=>({data:[gif],pagination:{offset:0,count:1,total_count:2},meta:{status:200}})};}});
 assert.equal(requested.origin,'https://api.giphy.com');assert.equal(requested.pathname,'/v1/gifs/search');assert.equal(requested.searchParams.get('q'),'stars & sky');assert.equal(requested.searchParams.get('rating'),'pg-13');assert.equal(options.credentials,'omit');assert(!options.headers);assert.equal(result.next,1);assert.equal(result.items[0].credit.author,'Auteur');assert.equal(cleanProfile({media_credits:{cover:result.items[0].credit}}).media_credits.cover.license,'Ver no GIPHY');
 assert.equal(new URL(gifs.query('',0,'fixture')).pathname,'/v1/gifs/trending');assert.equal(new URL(gifs.query('x',99999,'fixture')).searchParams.get('offset'),'4999');assert.throws(()=>gifs.query('x'),/cole o link/);
 for(const status of [403,429,503])await assert.rejects(gifs.search('x',{apiKey:'fixture',fetcher:async()=>({ok:false,status})}),status===429?/Muitas buscas/:/indisponível/);
});
test('GIPHY catalogue rejects forged hosts, oversized media, adult results and duplicate IDs',()=>{
 const bad=(n,patch)=>({...gif,id:'bad'+n,images:{original:{...image,...patch}}});
 const result=gifs.parse({data:[gif,gif,bad(1,{size:'10000001'}),bad(2,{url:'https://media.giphy.com.evil.test/a.gif'}),bad(3,{url:'https://media.giphy.com/a.png'}),bad(4,{width:'100000',height:'100000'}),{...gif,id:'adult',rating:'r'},{...gif,id:'forged',url:'https://giphy.com.evil.test/gifs/x'}]});assert.equal(result.items.length,1);assert.equal(result.next,null);
 const fallback=gifs.parse({data:[{...gif,images:{original:{...image,size:'10000001'},downsized:image}}]});assert.equal(fallback.items.length,1);
});
test('official GIPHY links work without a key and profile credits retain legacy Wikimedia sources',()=>{
 for(const url of ['https://giphy.com/gifs/happy-abc123','https://www.giphy.com/gifs/abc123','https://giphy.com/embed/abc123','https://media.giphy.com/media/abc123/giphy.gif','https://i.giphy.com/abc123.gif','https://media0.giphy.com/media/v1.token/abc123/giphy.gif'])assert.equal(gifs.fromURL(url).url,image.url);
 for(const url of ['http://giphy.com/gifs/abc123','https://giphy.com.evil.test/gifs/abc123','https://user:pass@giphy.com/gifs/abc123','https://evil.test/a.gif','https://giphy.com/search/cats','https://media.giphy.com:444/media/abc123/giphy.gif'])assert.throws(()=>gifs.fromURL(url));
 assert.equal(cleanProfile({media_credits:{cover:gifs.fromURL(gif.url).credit}}).media_credits.cover.source,'https://giphy.com/gifs/abc123');
 assert.equal(cleanProfile({media_credits:{cover:{source:'https://commons.wikimedia.org/wiki/File:Animation.gif',license:'CC0'}}}).media_credits.cover.license,'CC0');
 for(const source of ['https://giphy.com.evil.test/gifs/abc123','https://giphy.com/search/cats','https://giphy.com:444/gifs/abc123'])assert.throws(()=>cleanProfile({media_credits:{cover:{source}}}));
});
test('downloads validate GIF signatures, declared and streamed size, and final redirect hosts',async()=>{
 const item=gifs.fromURL(gif.url);
 await assert.rejects(gifs.download(item,{fetcher:async()=>({ok:true,headers:new Headers({'content-length':'10000001'})})}),/10 MB/);
 let cancelled=false;await assert.rejects(gifs.download(item,{fetcher:async()=>({ok:true,headers:new Headers(),body:new ReadableStream({start(c){c.enqueue(new Uint8Array(10_000_001));},cancel(){cancelled=true;}})})}),/10 MB/);assert(cancelled);
 await assert.rejects(gifs.download(item,{fetcher:async()=>({ok:true,url:'https://evil.test/a.gif'})}),/baixar/);
 await assert.rejects(gifs.download(item,{fetcher:async()=>new Response('<html>fake</html>')}),/GIF válido/);
 const file=await gifs.download(item,{fetcher:async()=>new Response('GIF89aVALID')});assert.equal(file.type,'image/gif');assert.equal(file.name,'perfil.gif');assert.equal(await file.text(),'GIF89aVALID');
});

test('malformed catalogue entries are ignored and aborted downloads cancel their reader',async()=>{
 for(const value of [null,[],{data:[null,false,[],{id:'abc123',type:'gif',url:gif.url,images:{original:null}}]}])assert.deepEqual(gifs.parse(value).items,[]);
 const controller=new AbortController();let cancelled=false;
 const pending=gifs.download(gifs.fromURL(gif.url),{signal:controller.signal,fetcher:async()=>new Response(new ReadableStream({pull(){controller.abort();},cancel(){cancelled=true;}}))});
 await assert.rejects(pending,error=>error.name==='AbortError');assert(cancelled);
});
