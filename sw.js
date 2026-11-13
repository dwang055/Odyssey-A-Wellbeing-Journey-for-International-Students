/* Odyssey offline cache. Bump VERSION in build.py after any change so phones update. */
const CACHE="odyssey-1.5.0";
const FILES=["chapter1.html", "chapter2.html", "chapter3.html", "index.html", "advisers.html", "about.html", "setup.html", "campus-config.js", "icon-180.png", "icon-192.png", "icon-512.png", "odyssey-fx.js", "odyssey-island.js", "three.min.js", "manifest.webmanifest"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin)return;
  if(u.pathname.endsWith("campus-config.js")){  /* network first, so campus changes show up */
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));return}
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));
});
