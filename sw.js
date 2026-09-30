// Offline reading: the page shell is fetched fresh when online, while versioned files
// (every module, data file and image carries ?v=<hash>) never change and are kept.
const REVISION = "__REVISION__";
const SHELL = `shell-${REVISION}`;
const FILES = "files-v1";
const MAX_FILES = 1500;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add("./")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("shell-") && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else if (url.searchParams.has("v")) event.respondWith(versioned(request));
});

async function page(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put("./", response.clone());
    return response;
  } catch {
    return (await cache.match("./")) || Response.error();
  }
}

async function versioned(request) {
  const cache = await caches.open(FILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

// Old releases leave files behind; drop the oldest once the cache grows large.
async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) await cache.delete(key);
}
