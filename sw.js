/* Service worker: programėlė veikia kaip įdiegta, atsidaro be interneto ir gauna pranešimus. */
importScripts('config.js');
importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js'
);

const CACHE = 'uzduotys-v4';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'quick.js', 'config.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

// Pranešimai: Firebase pats parodo pranešimą, o paspaudus atidaro programėlę
const FB = self.APP_CONFIG && self.APP_CONFIG.FIREBASE;
if (FB && FB.apiKey) {
  firebase.initializeApp(FB);
  firebase.messaging();
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API ir Firebase – be talpyklos

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(req, { signal: ctrl.signal });
      clearTimeout(t);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      return new Response('Nėra ryšio', { status: 503, statusText: 'Offline' });
    }
  })());
});
