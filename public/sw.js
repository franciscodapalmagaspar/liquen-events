/* Líquen Events — Service Worker
   Two jobs:
   1. Web Push notifications for the back-office (push/notificationclick).
   2. A conservative offline cache for the public marketing site.

   Caching posture is deliberately safe: NAVIGATIONS are network-first (online
   visitors always get fresh HTML; the cache only steps in when offline), and
   only content-hashed static assets + images are cache-first. The API is never
   touched, so nothing dynamic is ever served stale. Bump CACHE to invalidate.

   The /orcamento surface (auth'd back office + live quote flow) is excluded
   too, with ONE deliberate exception: the material loading view. See
   `isCarregamento` below for why, and for what it does NOT cache. */

// v3: a vista de carregamento de material passa a poder abrir offline (uma
// rota, o invólucro só). Bumping the name purges older caches.
//
// v4: as navegações deixaram de guardar respostas que não são a página (ver
// `vaiParaOInvolucro`). O nome sobe porque a correcção não chega a quem já tem
// um 500 ou um redireccionamento gravado — é o `activate` que apaga as caches
// que não conhece, e sem esta subida essa página de erro ficava lá.
const CACHE = "liquen-cache-v5";

/* ═══════════════════════════════════════════════════════════════════════════
   AS MINIATURAS DA BIBLIOTECA DE TEMAS, GUARDADAS SEM O TOKEN
   ═══════════════════════════════════════════════════════════════════════════

   O problema, medido (IMAGENS-BEFORE.md): reabrir o seletor de temas custa
   1835 ms, 9 pedidos e 188 KB — mesmo com o Storage a servir
   `Cache-Control: max-age=3600`. O cabeçalho está certo. O que o anula é o URL:

       .../theme-thumbs/terracotta/ab12….jpg?token=<JWT novo a cada assinatura>

   Token novo → URL novo → entrada de cache nova. Os bytes são os MESMOS e o
   browser volta a buscá-los.

   A cache do browser não pode fazer nada quanto a isto: para ela, dois URLs
   diferentes são dois recursos. Um service worker pode — porque escolhe a
   CHAVE. Guardando pelo caminho SEM os parâmetros, o token deixa de importar:
   a segunda abertura acerta na cache, e uma recarga da página também, que é
   coisa que a cache de módulo (`theme-picker-cache.ts`) nunca conseguiu.

   Resolve o número mais doloroso da auditoria SEM mudar propriedade de
   segurança nenhuma — o bucket continua privado e o token continua a ser
   preciso para o PRIMEIRO carregamento de cada ficheiro.

   ── O que é guardado, e o que NÃO é ──────────────────────────────────────
   Só `theme-thumbs` e `theme-micro`: as derivadas pequenas da biblioteca de
   INSPIRAÇÃO. São ~20 KB e ~2 KB, sem nome de cliente, sem data, sem nada que
   identifique alguém.

   Ficam de fora, de propósito:
   · `theme-assets` — os originais de ~576 KB. Guardá-los enchia o disco para
     servir uma vista que quase nunca os pede.
   · `proposal-assets` e `proposal-thumbs` — as fotos DE UMA proposta, ao lado
     da data e do local do casamento daquele casal. É a mesma linha que este
     ficheiro já traça ao recusar guardar `/portal` e `/proposta`: o que
     identifica um cliente não vai para disco.
   ═══════════════════════════════════════════════════════════════════════════ */
/* ── v2: PORQUE É QUE O NOME MUDOU, E PORQUE É QUE ISTO É IMPORTANTE ───────

   A v1 guardava qualquer resposta OPACA. Uma resposta opaca (uma imagem
   cross-origin pedida sem CORS) tem `status: 0` e um corpo ilegível: é
   IMPOSSÍVEL distinguir uma fotografia de 20 KB de um 404 ou de um 403 de
   token expirado. A v1 tratava as três da mesma maneira e escrevia-as no
   disco — para sempre, porque a chave não tem token e a leitura é
   cache-first.

   O resultado, ao vivo: uma derivada que ainda não existe (as `theme-micro`
   só nascem depois da migração) ou um token que expirou (a biblioteca assina
   a 6 horas) ficava gravada como FALHA PERMANENTE. Recarregar não resolvia,
   esperar não resolvia, e a página dos Temas ficou com os cartões cinzentos.

   Duas correcções, e são precisas as duas:

     1. só se guarda o que se conseguiu VERIFICAR — ver `buscarEGuardar`;
     2. o nome mudou para v2, e o `activate` apaga as caches que não conhece.
        É isto que limpa o que a v1 já escreveu nos aparelhos dela.

   Se algum dia isto voltar a guardar sem verificar, o sintoma não é lentidão:
   são fotografias que desaparecem e não voltam. */
const CACHE_FOTOS = "liquen-fotos-v2";

/** Tecto de entradas. 600 miniaturas ≈ 12 MB — folgado para a biblioteca dela
 *  e longe de qualquer limite de quota. Acima disto saem as mais antigas. */
const MAX_FOTOS = 600;

/** É uma derivada pequena da biblioteca de temas, servida pelo Storage?
 *  Reconhece-se pela FORMA do caminho do Supabase, para o host não ter de
 *  estar escrito aqui (este ficheiro é estático, não passa pelo build). */
function ehFotoDaBiblioteca(url) {
  return (
    /\/storage\/v1\/object\/(sign|public)\/theme-(thumbs|micro)\//.test(url.pathname) &&
    url.pathname.endsWith(".jpg")
  );
}

/** A chave: o caminho, SEM os parâmetros. É isto, e só isto, que faz o token
 *  deixar de partir a cache. */
function chaveSemToken(url) {
  return `${url.origin}${url.pathname}`;
}

/**
 * Vale a pena guardar? Só uma resposta que se conseguiu LER: um 200 com um
 * `content-type` de imagem.
 *
 * A pergunta parece trivial e não é — é o defeito que a v1 tinha. Um `<img>`
 * cross-origin pede sem CORS, e a resposta que chega ao service worker é
 * OPACA: `status: 0`, cabeçalhos vazios, corpo ilegível. Uma fotografia e um
 * 404 são indistinguíveis. Guardar sem distinguir é gravar a falha no disco.
 */
function vaiParaODisco(res) {
  return !!res && res.type !== "opaque" && res.ok && /^image\//i.test(res.headers.get("content-type") || "");
}

/**
 * Busca a fotografia de forma VERIFICÁVEL e guarda-a se for mesmo uma
 * fotografia.
 *
 * Pede com `mode: "cors"` em vez de deixar passar o pedido original do `<img>`
 * (que é `no-cors`): é a diferença entre uma resposta que se pode inspeccionar
 * e uma opaca. O Supabase Storage serve estes objectos com CORS aberto — é o
 * mesmo caminho que o cliente JS usa para descarregar ficheiros —, e a
 * resposta serve na mesma para desenhar a imagem.
 *
 * Todos os caminhos de falha levam ao mesmo sítio: devolve-se alguma coisa e
 * NÃO se guarda nada. Uma falha não escrita repete-se e resolve-se sozinha
 * quando a causa passar; uma falha escrita fica para sempre.
 */
async function buscarEGuardar(request, url, cache, chave) {
  let res;
  try {
    res = await fetch(url.href, { mode: "cors", credentials: "omit" });
  } catch {
    // Sem CORS (ou sem rede): serve-se pelo caminho normal, sem guardar.
    return fetch(request);
  }
  if (vaiParaODisco(res)) {
    await cache.put(chave, res.clone());
    void aparar(cache);
  }
  return res;
}

/** Deita fora as mais antigas quando passa do tecto. A Cache Storage mantém a
 *  ordem de inserção, por isso as primeiras chaves são as mais velhas. */
async function aparar(cache) {
  const chaves = await cache.keys();
  if (chaves.length <= MAX_FOTOS) return;
  await Promise.all(chaves.slice(0, chaves.length - MAX_FOTOS).map((k) => cache.delete(k)));
}

// Best-effort precache so a first-ever offline load still has a shell to show.
// Kept tiny; large heroes are cached lazily as they're requested.
const PRECACHE = ["/", "/offline.html", "/logo-liquen.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Per-item catch: a single missing URL must never fail the whole install
      // (which would stop the SW activating).
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE && k !== CACHE_FOTOS).map((k) => caches.delete(k)),
      );
      // ── O PEDIDO DA PÁGINA PARTE ENQUANTO ESTE GUIÃO ACORDA (22/10) ──────
      // Sem isto, abrir uma página com o service worker a dormir esperava que
      // ele arrancasse (50–250 ms num Android, estimado pela auditoria) e só
      // DEPOIS pedia a página à rede. Com a pré-carga das navegações, o
      // browser pede-a logo, em paralelo, e o ramo das navegações (em baixo)
      // usa essa resposta. Onde não existe (Safari antigo), nada muda.
      try {
        await self.registration?.navigationPreload?.enable();
      } catch {
        /* sem pré-carga: o ramo das navegações faz o `fetch` como sempre */
      }
      await self.clients.claim();
    })()
  );
});

/* A ÚNICA EXCEÇÃO À REGRA DE NÃO TOCAR NO /orcamento.
 *
 * A vista de carregamento de material (`/orcamento/admin/carregamento/<id>`)
 * TEM de abrir sem rede: quem a usa está numa quinta a carregar uma carrinha,
 * e esquecer um escadote a 200 km custa horas. É a única rota do back office
 * com essa necessidade, e por isso é a única a sair da lista de exclusão.
 *
 * O que fica em cache é só o INVÓLUCRO da página, e mesmo assim
 * network-first — online vê-se sempre o HTML fresco. Os DADOS não passam por
 * aqui: vivem no armazenamento local do próprio ecrã, com a sua fila de saída.
 * Nenhuma resposta da API é cacheada, aqui como em lado nenhum.
 */
function isCarregamento(url) {
  return /^\/(?:en\/)?orcamento\/admin\/carregamento\//.test(url.pathname);
}

// Same-origin GETs we must never cache: dynamic, auth'd, or optimized on the
// fly. Everything under here goes straight to the network.
function isBypassed(url) {
  if (isCarregamento(url)) return false;
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/orcamento") ||
    url.pathname.startsWith("/en/orcamento") ||
    // Private, token-gated client pages — their HTML carries personal data and
    // financials, so it must never be written to on-disk Cache Storage.
    url.pathname.startsWith("/portal") ||
    url.pathname.startsWith("/en/portal") ||
    url.pathname.startsWith("/proposta") ||
    url.pathname.startsWith("/en/proposta")
  );
}

/**
 * Esta navegação pode ficar guardada como sendo A PÁGINA?
 *
 * Guardava-se o que viesse — e o que vem nem sempre é a página. Durante uma
 * publicação, ou num minuto mau do alojamento, o que chega é um 500; de uma
 * ligação velha, um 404. Escritos na cache com a chave da página real, passam a
 * SER a página quando não houver rede: quem abrir o sítio offline não recebe o
 * `offline.html`, recebe o erro daquele minuto — e recebe-o até a cache mudar
 * de nome, que pode ser meses.
 *
 * Uma resposta REDIRECCIONADA é recusada pela mesma razão prática: devolvê-la a
 * uma navegação a partir de um service worker é um erro do browser, e o que se
 * vê offline não é a página nem o ecrã de offline — é um ecrã de erro.
 *
 * A regra é a mesma que o `vaiParaODisco` já aplica às fotografias: só se grava
 * o que se conseguiu confirmar que é bom. Uma falha não escrita repete-se e
 * resolve-se sozinha; uma falha escrita fica.
 */
function vaiParaOInvolucro(res) {
  return !!res && res.ok && !res.redirected;
}

// Content-hashed / immutable assets — safe to serve cache-first.
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_img/") ||
    url.pathname.startsWith("/imagens/") ||
    /\.(?:woff2?|ttf|otf|png|jpg|jpeg|webp|avif|svg|ico)$/.test(url.pathname)
  );
}

/* OS VÍDEOS NÃO PASSAM POR AQUI (os da entrada, 15/10).
 *
 * Um `<video>` pede o ficheiro aos bocados (`Range`), e o servidor responde
 * `206` com um bocado só. Guardar isso na Cache Storage é guardar um pedaço com
 * a chave do ficheiro inteiro — e servi-lo depois a um pedido de outro bocado
 * parte o vídeo, o que o Safari faz em silêncio (fica preto). Por isso o `mp4`
 * saiu da lista acima, e qualquer pedido de vídeo ou com `Range` vai directo à
 * rede: quem guarda os vídeos é a cache do próprio browser, com a cache longa
 * que o `next.config.ts` lhes dá. A cache passou a `v5` para esquecer algum
 * `mp4` que a `v4` tenha guardado. */
function ehVideo(request, url) {
  return (
    request.destination === "video" ||
    Boolean(request.headers && request.headers.has("range")) ||
    /\.(?:mp4|webm|mov|m4v)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // As miniaturas da biblioteca vêm do Storage, que é OUTRA origem — por isso
  // este ramo tem de vir antes da guarda de mesma origem.
  if (ehFotoDaBiblioteca(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_FOTOS);
        const chave = chaveSemToken(url);
        const guardada = await cache.match(chave);
        if (guardada) return guardada;
        return buscarEGuardar(request, url, cache, chave);
      })().catch(() => fetch(request)),
    );
    return;
  }

  // Only same-origin; leave cross-origin (analytics, etc.) to the network.
  if (url.origin !== self.location.origin) return;
  if (isBypassed(url)) return;
  if (ehVideo(request, url)) return;

  // Navigations: network-first with a cached fallback, then the offline shell.
  if (request.mode === "navigate") {
    event.respondWith(
      // A resposta que o browser já pediu enquanto o guião acordava (ver o
      // `activate`), ou a rede como sempre. Uma pré-carga que falhou cai no
      // `fetch` — e só depois no que está guardado.
      Promise.resolve(event.preloadResponse)
        .catch(() => undefined)
        .then((pre) => pre || fetch(request))
        .then((res) => {
          if (vaiParaOInvolucro(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match("/offline.html")) || (await caches.match("/"));
        })
    );
    return;
  }

  // Static assets: cache-first, revalidating in the background.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // Anything else: default to the network (no respondWith).
});

// ── Web Push (back office) ──────────────────────────────────────────────────

// Incoming push → show a notification
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Líquen Events", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Líquen Events";
  const options = {
    body: data.body || "",
    icon: "/logo-liquen.png",
    badge: "/logo-liquen.png",
    tag: data.tag || "liquen",
    data: { url: data.url || "/orcamento/admin" },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click on a notification → focus or open the back-office
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/orcamento/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/orcamento/admin") && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
