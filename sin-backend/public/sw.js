/* Service worker de la PWA (versión sin backend).
 *
 * - Cachéa el "shell" de la app (HTML/JS/CSS) para que abra rápido y funcione
 *   aunque el celular quede sin internet.
 * - Los DATOS se piden siempre en red (Socrata), para no mostrar cifras viejas.
 * - El manejador de `fetch` es también lo que hace a la app instalable.
 */
const CACHE = 'secop-static-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './index.html']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Datos de Socrata: solo red, para no cachear resultados que cambian a diario.
  if (url.hostname.includes('datos.gov.co')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: 'Sin conexión' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    return;
  }

  // Shell de la app: cache-first con actualización en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fromNetwork = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fromNetwork;
    }),
  );
});
