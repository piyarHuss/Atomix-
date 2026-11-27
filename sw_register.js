/* sw.js - Ultra Fast & Zero Data Waste Cache */
var CACHE = 'lm-assets-v3'; // Jab bhi naya update live karo, v3 ko v4 kar dena

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE) {
            return caches.delete(k);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Sabhi static files ko pehchanne ka rule (JS, CSS, Audio, Images, Fonts sab shamil hain)
function isStaticAsset(url) {
  return /\.(png|jpe?g|webp|gif|svg|mp3|ogg|wav|woff2?|ttf|otf|js|css|json|mp4|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Firebase, Telegram API, CDN wagairah ko cache nahi karna
  if (url.origin !== location.origin) return;

  // 1. Sabhi Assets, JS, CSS, Audio: CACHE-FIRST (0% Data Usage)
  if (isStaticAsset(url)) {
    var cleanKey = new Request(url.origin + url.pathname); // ?v= parameter hata kar ek hi baar store karega

    e.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(cleanKey).then(function (cachedResponse) {
          if (cachedResponse) {
            // Phone ke cache se turant file de di — Vercel ka 0 KB data kharch hua
            return cachedResponse;
          }

          // Agar pehli baar hai, tabhi internet se mangwao aur hamesha ke liye store kar lo
          return fetch(req).then(function (networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(cleanKey, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 2. index.html ke liye: Stale-While-Revalidate (Turant kholega aur background me update check karega)
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var networkFetch = fetch(req).then(function (res) {
          if (res && res.status === 200) {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(function () {
          return cached;
        });

        // Agar phone me pehle se page hai to turant dikhao, warna network se lo
        return cached || networkFetch;
      });
    })
  );
});
