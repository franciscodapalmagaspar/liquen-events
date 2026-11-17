"use client";

import { useEffect, useState } from "react";
import { capturarClique } from "@/lib/meta/click-id";
import { CHAVE_CONSENTIMENTO, temConsentimento } from "@/lib/meta/consentimento";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PIXEL DA META
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── DUAS COISAS, E SÓ UMA DELAS DEPENDE DE CONSENTIMENTO ───────────────────
 *
 *  1. **Apanhar o `fbclid` do URL.** Faz-se sempre, mas sem consentimento fica
 *     SÓ EM MEMÓRIA (auditoria legal, 17/11): até então ia logo para o
 *     localStorage, e gravar um identificador de publicidade no dispositivo
 *     antes do «Aceitar» é o que a ePrivacy proíbe. Se ela aceitar na mesma
 *     visita, grava-se nessa altura; se recusar, apaga-se. Ver o cabeçalho de
 *     `click-id.ts`.
 *
 *  2. **Carregar o pixel.** Só com consentimento. O `fbevents.js` grava os
 *     cookies `_fbp` e `_fbc` e comunica com a Meta — é exactamente o que a
 *     ePrivacy sujeita a consentimento prévio, e não há Consent Mode como o
 *     da Google que permita um meio-termo com pings sem cookies.
 *
 * ── PORQUE É QUE NÃO HÁ SEGUNDO BANNER ─────────────────────────────────────
 * Lê-se a MESMA chave (`liquen-consent`) que o banner já usa para a Google, e
 * ouve-se o mesmo evento de mudança. Dois banners dariam dois estados, e mais
 * dia menos dia uma pessoa que recusou num teria consentido no outro sem
 * nunca ter dito que sim. O texto do banner nomeia a Meta — foi acrescentado
 * lá, e é a única alteração que o consentimento precisou.
 *
 * ── PORQUE É QUE O SCRIPT É INJECTADO À MÃO E NÃO COM <Script> ─────────────
 * Porque só pode existir DEPOIS de haver consentimento, e o consentimento
 * pode chegar a meio da visita (a pessoa carrega em "Aceitar"). Um `<Script>`
 * do Next montado condicionalmente funcionaria na primeira renderização, mas
 * a montagem tardia de um `<script>` inline pelo React não é executada pelo
 * browser — é o mesmo problema que o `GoogleTag` deste sítio já documenta e
 * resolve com um bootstrap por código. Aqui a injecção é directa e explícita.
 *
 * Inerte sem `NEXT_PUBLIC_META_PIXEL_ID`: sem essa variável não há script, não
 * há pedido, e a CSP não abre nada.
 */

const ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

/** Injecta o `fbevents.js` e regista a primeira visualização. Idempotente. */
function carregarPixel(id: string): void {
  const w = window as unknown as {
    fbq?: ((...args: unknown[]) => void) & {
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
    };
    _fbq?: unknown;
  };
  if (w.fbq) return; // já cá está

  // A cópia fiel do arranque oficial, escrita como código em vez de uma cadeia
  // avaliada: a CSP de produção não traz `'unsafe-eval'`, portanto avaliar uma
  // string seria bloqueado.
  const fila: unknown[] = [];
  const fbq = function (this: unknown, ...args: unknown[]) {
    const f = w.fbq!;
    // O `fbevents.js`, ao carregar, substitui esta função e esvazia a fila.
    if (typeof (f as { callMethod?: (...a: unknown[]) => void }).callMethod === "function") {
      (f as unknown as { callMethod: (...a: unknown[]) => void }).callMethod(...args);
    } else {
      fila.push(args);
    }
  } as ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string };
  fbq.queue = fila;
  fbq.loaded = true;
  fbq.version = "2.0";
  w.fbq = fbq;
  w._fbq = fbq;

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);

  fbq("init", id);
  // O PageView é o único evento que o pixel dispara sozinho. Os outros passam
  // todos por `dispararMeta`, que gera o `event_id` partilhado.
  fbq("track", "PageView");
}

export default function MetaPixel({ contexto }: { contexto?: string }) {
  const [consentido, setConsentido] = useState(false);

  // 1. O `fbclid`, sempre — em memória; no dispositivo só com consentimento.
  useEffect(() => {
    try {
      capturarClique(window.location.search, window.location.pathname);
    } catch {
      /* nunca deixar a medição impedir a página */
    }
  }, []);

  // 2. O estado do consentimento, agora e quando mudar.
  useEffect(() => {
    // Só o estado, para carregar o pixel. GRAVAR o clique ou APAGÁ-LO (e
    // revogar o pixel) é do aviso de cookies, neste separador, e do
    // `GoogleTag`, para escolhas feitas noutro — o `GoogleTag` está montado em
    // todas as páginas do sítio, e este componente só nas dos anúncios.
    const ler = () => setConsentido(temConsentimento());
    ler();
    // O banner grava no localStorage e não emite evento próprio; o `storage`
    // só dispara noutros separadores. Ouvem-se os dois sinais que existem: o
    // evento que o sítio já usa para reabrir o banner, e o `storage` para o
    // caso de a escolha ser feita noutro separador aberto ao mesmo tempo.
    const aoMudar = (e: StorageEvent) => {
      if (!e.key || e.key === CHAVE_CONSENTIMENTO) ler();
    };
    window.addEventListener("storage", aoMudar);
    window.addEventListener("liquen:consent-changed", ler);
    return () => {
      window.removeEventListener("storage", aoMudar);
      window.removeEventListener("liquen:consent-changed", ler);
    };
  }, []);

  // 3. O pixel, só com consentimento.
  useEffect(() => {
    if (!ID || !consentido) return;
    carregarPixel(ID);
  }, [consentido]);

  // `contexto` fica na assinatura e não é lido: quem monta este componente
  // sabe em que variante está, e tê-lo aqui evita que alguém venha a inferi-lo
  // do `location.pathname` — que na reescrita do proxy é a forma interna
  // (`/pt/s/comporta`) e não a pública.
  void contexto;
  return null;
}
