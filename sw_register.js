/* sw_register.js - service worker (sw.js) ko chalu karta hai. Assets cache hone ke baad bar bar download nahi hote. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('[sw] register fail', e); });
  });
}
