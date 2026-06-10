// Service worker mínimo para tornar o app instalável (PWA). Por segurança, só intercepta ASSETS
// ESTÁTICOS (cache-first); páginas, RSC do Next, API e uploads passam direto pela rede. Sempre
// devolve uma Response válida (nunca undefined).
// v3: limpa caches antigos que guardaram chunks de DEV (sem hash) e quebravam o app
// após rebuilds ("Cannot read properties of undefined (reading 'call')" no webpack).
const CACHE = "jrbrasil-gastos-v3";

// Em desenvolvimento (localhost) os arquivos de /_next/static/ NÃO têm hash imutável e mudam a
// cada rebuild — cache-first serviria chunk velho e quebraria o módulo. Só cacheia em produção.
const IS_DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";
const APP_SHELL = ["/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (IS_DEV) return; // dev: tudo direto pela rede (assets mudam a cada rebuild)
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Só assets estáticos seguros. Não interceptar páginas/RSC/_next/data/API (evita quebrar
  // navegação e uploads).
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest";
  if (!isStatic) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch {
        return new Response("", { status: 504, statusText: "Offline" });
      }
    })()
  );
});
