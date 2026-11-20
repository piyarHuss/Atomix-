/* sw.js - assets ek baar cache, code hamesha fresh */
var CACHE = 'lm-assets-v2';   // assets badlo to yeh number badhao (v3, v4...)

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function isAsset(url) { return /\.(png|jpe?g|webp|gif|svg|mp3|ogg|wav|woff2?)$/i.test(url.pathname); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // Firebase, Telegram etc. ko mat chhedo

  if (isAsset(url)) {
    // cache-first (bina ?v= ke key, taaki ek hi file ek baar store ho)
    var key = new Request(url.origin + url.pathname);
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(key).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && res.status === 200) c.put(key, res.clone());   // 404 kabhi cache nahi hoga
            return res;
          });
        });
      })
    );
    return;
  }

  // js/html/css: network-first, offline ho to cache
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match(req); })
  );
});
