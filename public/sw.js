/* Bump the version whenever the offline shell changes. Never cache authenticated HTML or APIs. */
const CACHE = 'montante-offline-shell-v1';
const SHELL = ['/offline/index.html', '/offline/app.css', '/offline/app.js', '/offline/storage.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('montante-offline-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
function clearActive() {
  return new Promise(resolve => {
    const request = indexedDB.open('montante-offline-v1', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('meta'); request.result.createObjectStore('sales', { keyPath: 'id' }); };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('meta', 'readwrite');
      transaction.objectStore('meta').delete('active');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); resolve(); };
    };
  });
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === 'POST' && /^\/api\/auth\/(signout|callback)/.test(url.pathname)) {
    event.respondWith(clearActive().then(() => fetch(event.request)));
    return;
  }
  if (event.request.method !== 'GET') return;
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) ?? fetch(event.request)));
  } else if (event.request.mode === 'navigate' && url.pathname === '/pdv' && !url.searchParams.has('serviceSale')) {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match('/offline/index.html')) ?? Response.error()));
  }
});
