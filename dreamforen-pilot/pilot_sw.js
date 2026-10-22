/* Pilot 0.1.0: app-scope navigation fallback only. Never cache API responses or business pages. */
'use strict';
const ROOT=new URL('./',self.location.href);
const CACHE='df-pilot-offline-v1-'+encodeURIComponent(ROOT.pathname);
const OFFLINE=new URL('pilot_offline.html',ROOT).href;
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{const response=await fetch(OFFLINE,{cache:'no-store'});if(!response.ok)throw Error('Offline screen unavailable');const cache=await caches.open(CACHE);await cache.put(OFFLINE,response);})());
});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('message',event=>{if(event.data?.type==='PILOT_ACTIVATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 // The worker cannot intercept the original web's paths or Supabase requests.
 if(request.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request,{cache:'no-store'}).catch(async()=>{
   const cached=await caches.match(OFFLINE,{cacheName:CACHE});return cached||new Response('인터넷 연결 후 앱을 다시 열어 주세요.',{headers:{'Content-Type':'text/plain;charset=utf-8'}});
  }));return;
 }
 if(/\.(?:js|mjs|css|json|webmanifest)$/.test(url.pathname))event.respondWith(fetch(request,{cache:'no-store'}));
});
