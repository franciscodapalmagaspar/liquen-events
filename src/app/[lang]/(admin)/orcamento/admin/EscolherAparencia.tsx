"use client";

import { useEffect, useState } from "react";
import { Segmented } from "./ui/Segmented";
import {
  APARENCIAS,
  COOKIE_APARENCIA,
  VALIDADE_APARENCIA_S,
  aparenciaDoCookie,
} from "./ui/aparencia";
import type { Aparencia } from "./ui/aparencia";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARO, ESCURO, OU O QUE O COMPUTADOR DISSER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três estados. A Parte 5.3 do `docs/DESIGN-SYSTEM.md` manda o Automático por
 * omissão, mas ela pediu o fundo branco («eu quero o fundo branco atenção!»):
 * sem escolha gravada o painel é CLARO, e o Automático é uma escolha que se faz
 * aqui. A razão inteira está no topo de `ui/aparencia.ts`.
 *
 * ── O QUE ESTE COMPONENTE FAZ, E O QUE NÃO FAZ ────────────────────────────
 *
 * Não troca cor nenhuma. Escreve um cookie e põe um atributo — e quem troca as
 * cores é o `globals.css`, com `light-dark()` e `color-scheme`. É de propósito:
 * uma troca feita em JavaScript teria de conhecer as trinta e tal cores, e
 * ficariam duas listas a discordar no dia em que uma mudasse.
 *
 * ── PORQUE É QUE O ATRIBUTO É POSTO AQUI *E* VEM DO SERVIDOR ──────────────
 *
 * O cookie é para a PRÓXIMA vez: o `layout.tsx` lê-o e serve o atributo já no
 * HTML, para não haver clarão a abrir o painel. Mas um cookie sozinho só teria
 * efeito depois de recarregar, e carregar em «Escuro» e não acontecer nada é
 * um botão avariado.
 *
 * Por isso escreve-se nos dois sítios: o atributo no elemento que já cá está,
 * para a mudança ser IMEDIATA, e o cookie para ela ficar. O elemento é o mesmo
 * que o servidor marca — o `<main data-admin-mode>` —, portanto não há dois
 * sítios a discordar, há o mesmo sítio escrito por dois lados.
 */
export function EscolherAparencia() {
  /*
    ── PORQUE É QUE ISTO COMEÇA EM `auto` E SÓ DEPOIS LÊ O QUE ESTÁ ─────────

    O servidor não sabe, ao desenhar ESTE componente, qual dos três segmentos
    fica aceso — o cookie é lido no layout, lá em cima, e não desce até aqui.
    Se este arrancasse a ler o DOM, o servidor desenhava «Automático» e o
    browser desenhava «Escuro» no mesmo sítio: uma discordância de hidratação,
    que o React resolve deitando fora o que o servidor fez.

    Começa em `auto` — o mesmo dos dois lados — e alinha-se no primeiro efeito,
    lendo o COOKIE, que é o que o servidor também lê. O que se vê é, quando
    muito, o segmento certo a acender um fotograma depois; as CORES não piscam,
    porque quem manda nelas é o atributo, e esse chegou no HTML.

    Do cookie e não do atributo (auditoria de 14/11, n.º 5): no Automático o
    atributo não existe, e lê-lo dava o de omissão — «Claro» aceso com o painel
    em Automático. Ver `aparenciaDoCookie`.
  */
  const [aparencia, setAparencia] = useState<Aparencia>("auto");

  useEffect(() => {
    setAparencia(aparenciaDoCookie(document.cookie));
  }, []);

  function escolher(nova: Aparencia) {
    setAparencia(nova);

    // Imediato: o mesmo elemento que o servidor marca.
    const alvo = document.querySelector<HTMLElement>("[data-admin-mode]");
    // O <body> também: as regras de cor do back office lêem-no lá desde 10/11
    // (ver `MarcaDoBackOffice.tsx`).
    for (const el of [alvo, document.body]) {
      if (!el) continue;
      if (nova === "auto") delete el.dataset.aparencia;
      else el.dataset.aparencia = nova;
    }

    // E fica: `SameSite=Lax` porque isto nunca precisa de viajar num pedido de
    // outro sítio, e `path=/` para valer em todo o back office.
    document.cookie = `${COOKIE_APARENCIA}=${nova}; path=/; max-age=${VALIDADE_APARENCIA_S}; SameSite=Lax`;
  }

  return (
    <Segmented<Aparencia>
      ariaLabel="Aparência do back office"
      value={aparencia}
      onChange={escolher}
      options={APARENCIAS.map(({ id, rotulo }) => ({ value: id, label: rotulo }))}
    />
  );
}
