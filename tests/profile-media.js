'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{cleanProfile}=require('../server/profile-customization'),gifs=require('../src/legacy/profile-gifs');
test('profile links accept bare domains and optional labels; emoji keeps one complete grapheme',()=>{
 const d=cleanProfile({links:[{url:'youtube.com/@exemplo'},{label:'Ao vivo',url:'http://twitch.tv/exemplo'},{label:'',url:''}],emoji:'👨‍👩‍👧‍👦',cover_position:15,cover_zoom:135});
 assert.deepEqual(d.links,[{label:'YouTube',url:'https://youtube.com/@exemplo'},{label:'Ao vivo',url:'https://twitch.tv/exemplo'}]);assert.equal(d.emoji,'👨‍👩‍👧‍👦');
 for(const emoji of ['🎮🎧','status','a🎧'])assert.throws(()=>cleanProfile({emoji}));
 for(const url of ['javascript:alert(1)','data:text/html,hi','https://user:pass@example.com','https://example.com/has spaces'])assert.throws(()=>cleanProfile({links:[{url}]}));
 assert.throws(()=>cleanProfile({links:[{label:'Sem endereço'}]}));assert.throws(()=>cleanProfile({media_credits:{cover:{source:'https://commons.wikimedia.org.evil.test/x'}}}));
});
test('GIF catalogue requests only GIFs and filters oversized, forged-host and unexpected media',async()=>{
 const base={pageid:1,title:'File:Animation.gif',imageinfo:[{mime:'image/gif',size:1200,width:320,height:200,url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Animation.gif',descriptionurl:'https://commons.wikimedia.org/wiki/File:Animation.gif',extmetadata:{Artist:{value:'<b>Auteur</b>'},LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}}}]};
 const bad=patch=>({...base,imageinfo:[{...base.imageinfo[0],...patch}]}),payload={query:{pages:[base,bad({size:10_000_001}),bad({mime:'image/png'}),bad({url:'https://upload.wikimedia.org.evil.test/x.gif'}),bad({width:100000,height:100000})]},continue:{gsroffset:12}};
 let requested;const result=await gifs.search('stars & sky',{fetcher:async url=>{requested=new URL(url);return {ok:true,json:async()=>payload};}});
 assert.equal(requested.searchParams.get('origin'),'*');assert.match(requested.searchParams.get('gsrsearch'),/filemime:"image\/gif"/);assert(requested.searchParams.get('gsrsearch').endsWith('stars & sky'));assert.equal(result.items.length,1);assert.equal(result.next,12);assert.equal(result.items[0].credit.author,'Auteur');assert.equal(cleanProfile({media_credits:{cover:result.items[0].credit}}).media_credits.cover.license,'CC BY-SA 4.0');
 await assert.rejects(gifs.search('x',{fetcher:async()=>({ok:false})}),/indisponível/);
 await assert.rejects(gifs.download(result.items[0],{fetcher:async()=>({ok:true,headers:new Headers({'content-length':'10000001'})})}),/10 MB/);
 let cancelled=false;await assert.rejects(gifs.download(result.items[0],{fetcher:async()=>({ok:true,headers:new Headers(),body:new ReadableStream({start(c){c.enqueue(new Uint8Array(10_000_001));},cancel(){cancelled=true;}})})}),/10 MB/);assert(cancelled);
});
