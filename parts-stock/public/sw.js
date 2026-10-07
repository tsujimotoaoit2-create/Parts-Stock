const CACHE='parts-stock-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/manifest.webmanifest','/icon-192.png','/icon-512.png','/icon-maskable.png'])));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('parts-stock-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/@')||url.pathname.includes('node_modules'))return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).catch(async()=>await caches.match('/offline.html')));return;
 }
 if(['/icon-192.png','/icon-512.png','/icon-maskable.png','/manifest.webmanifest'].includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
