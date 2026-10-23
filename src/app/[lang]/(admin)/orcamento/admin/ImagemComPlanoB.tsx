"use client";

import { useState } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA IMAGEM QUE SABE CAIR PARA O TAMANHO DE CIMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O cartão de um tema pede a derivada mais pequena que serve — 96 px para uma
 * tira, 400 px para a capa. A grelha da revisão de etiquetas pede a miniatura.
 * Essas derivadas podem não existir: nascem no carregamento, e as fotos mais
 * antigas (ou migradas em massa) não as têm.
 *
 * O servidor não consegue saber: assinar um caminho no Supabase Storage NÃO
 * verifica que o ficheiro lá está, e devolve um URL bem formado para um objecto
 * inexistente. Quem descobre é o navegador, com um 404, e até aqui o que
 * acontecia a seguir era nada — ficava a célula vazia. Era isto que deixava os
 * cartões cinzentos.
 *
 * `planoB` é o ORIGINAL, o único que veio da listagem da pasta e portanto o
 * único que existe de certeza. Troca-se UMA vez: se o original também falhar,
 * fica o fundo, porque insistir era um ciclo.
 *
 * ── E QUANDO O FUNDO FICA, A IMAGEM SAI ─────────────────────────────────
 *
 * «Nunca ícone partido» (T1/T2 do `docs/PROPOSTAS-E-TEMAS-APPLE.md`). Com as
 * duas fontes a falhar, o `<img>` continuava no ecrã, pintado a 100 — e um
 * `<img>` que falhou é o navegador a desenhar o seu ícone de imagem partida
 * (ou o contorno dela) por cima do borrão. Passa a sair: no lugar dele fica um
 * `<span>` com a MESMA forma e o borrão no fundo, e sem borrão fica
 * transparente — vê-se o que quem a usa puser por trás (no cartão de tema e na
 * coluna, o lugar pintado com a cor da fotografia, `EsqueletoDeCor`).
 *
 * Vive num ficheiro só para os dois ecrãs que mostram derivadas (a Biblioteca
 * de Temas e a revisão de etiquetas) partilharem o mesmo plano B — duas cópias
 * eram duas oportunidades de só uma delas o ter.
 */
export default function ImagemComPlanoB({
  src,
  avif,
  planoB,
  lqip,
  className,
  posicao,
  onMedida,
}: {
  src: string;
  /** Largura ÷ altura da fotografia, quando ela chega (o enquadrar precisa). */
  onMedida?: (aspeto: number) => void;
  /** O `object-position` (o enquadramento que ela arrastou), se houver. */
  posicao?: string;
  /**
   * ── A OFERTA QUE SÓ ALGUNS NAVEGADORES ACEITAM ──────────────────────────
   *
   * Pedido dela: «tudo aquilo que seja carregamento de imagens, quero que
   * melhores mesmo o máximo possível».
   *
   * Um AVIF à medida da miniatura pesa menos 25% do que o WebP com a mesma
   * fidelidade (medido em `derivadas.ts`). Mas o Safari só o lê desde o iOS 16,
   * e estas fotografias são também as que um casal abre na página da proposta,
   * no telemóvel que tiver.
   *
   * Por isso é uma PROPOSTA e não uma troca: o `<picture>` oferece o AVIF
   * primeiro, e quem não o souber ler pede o `src`, que existe sempre. Quem
   * ganha ganha; quem não ganha fica exactamente como estava.
   *
   * ── E porque é que a cascata de erro continua no `<img>` ───────────────
   *
   * Porque um `<source>` que dá 404 NÃO faz o navegador recuar para o `<img>`:
   * a escolha faz-se pelo `type`, uma vez, antes de haver resposta. É por isso
   * que o AVIF só é oferecido quando o servidor tem a certeza de que existe —
   * e é por isso que o plano B de sempre (o original) continua a viver aqui em
   * baixo, no `onError`, que é o único sítio onde ainda se pode corrigir.
   */
  avif?: string;
  planoB?: string;
  /**
   * ── O CARTÃO NÃO NASCE CINZENTO ─────────────────────────────────────────
   *
   * Palavras dela: «placeholder blur por foto — acaba o ecrã de cartões
   * cinzentos».
   *
   * São poucas centenas de bytes que VÊM NO HTML, portanto estão pintadas no
   * primeiro fotograma, antes de qualquer ida à rede. A grelha das fotos e o
   * seletor já o faziam; os CARTÕES, que são a primeira coisa que se vê ao
   * abrir a biblioteca, eram os únicos a ficar cinzentos à espera.
   *
   * Fica por BAIXO e não substitui nada: a fotografia a sério assenta por cima
   * quando chegar, com uma passagem de opacidade. Sem `lqip` (as fotos
   * anteriores à migração) fica o fundo neutro de sempre, como antes.
   */
  lqip?: string;
  className?: string;
}) {
  const [actual, setActual] = useState(src);
  const [pintada, setPintada] = useState(false);
  /** As duas fontes falharam — ver «E QUANDO O FUNDO FICA, A IMAGEM SAI». */
  const [falhou, setFalhou] = useState(false);
  // Um `src` novo (outra capa escolhida, outra listagem) recomeça do princípio:
  // sem isto, uma imagem que caiu para o original ficava lá presa.
  const [visto, setVisto] = useState(src);
  if (visto !== src) {
    setVisto(src);
    setActual(src);
    setPintada(false);
    setFalhou(false);
  }
  /* Depois de cair para o plano B, o AVIF sai da mesa: a oferta era para a
     derivada que falhou, e insistir nela era oferecer outra vez o que não
     está lá. */
  const oferta = avif && actual === src ? avif : undefined;

  /* O borrão vai no FUNDO do próprio `<img>`, e não num irmão por baixo:
     assim herda o `object-cover` e o arredondamento da célula sem precisar
     de saber nada sobre o desenho de quem o usa — e os cartões, a grelha e
     as tiras têm formas diferentes. */
  const borrao = lqip
    ? {
        backgroundImage: `url("${lqip}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  if (falhou) {
    // A mesma caixa (as classes de quem a usa dão-lhe a forma), sem `<img>`.
    return (
      <span aria-hidden data-imagem-falhou className={`${className ?? ""} block`} style={borrao} />
    );
  }

  const imagem = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={actual}
      alt=""
      loading="lazy"
      decoding="async"
      /* ── A REDE QUE FALTAVA: UMA IMAGEM DA CACHE NÃO DISPARA `onLoad` ─────
         Uma fotografia que já está em cache pode chegar COMPLETA antes de o
         React ligar o `onLoad` — e aí o evento nunca acontece. Enquanto a
         opacidade final dependia só do `lqip`, isto passava despercebido nas
         fotos sem borrão (ficavam sempre a 100). Nas outras não: a célula
         ficava em `opacity-0` para sempre, com a fotografia descarregada e
         invisível, e só o borrão à mostra.

         É a mesma rede que o `Thumb` do `ProposalStudio` já documenta, e passa
         a ser obrigatória aqui a partir do momento em que a passagem deixa de
         ser condicional. */
      ref={(img) => {
        if (img?.complete && img.naturalWidth > 0) {
          setPintada(true);
          onMedida?.(img.naturalWidth / img.naturalHeight);
        }
      }}
      onLoad={(e) => {
        setPintada(true);
        const img = e.currentTarget;
        if (img.naturalWidth > 0) onMedida?.(img.naturalWidth / img.naturalHeight);
      }}
      onError={() => {
        if (planoB && actual !== planoB) setActual(planoB);
        // Se nem o plano B abriu, o borrão fica — mas sem o `<img>` partido
        // por cima dele. É melhor do que um vazio, e é a única coisa que ainda
        // diz de que cor era a fotografia.
        else setFalhou(true);
      }}
      style={posicao ? { ...borrao, objectPosition: posicao } : borrao}
      /* ── E A FOTOGRAFIA ASSENTA SEMPRE, TENHA OU NÃO BORRÃO ──────────────
         Era `pintada || !lqip`: sem `lqip` a célula nascia a 100 e a fotografia
         APARECIA num fotograma, por cima do fundo neutro. Com borrão havia
         passagem; sem borrão havia um estalo — e são precisamente as fotos
         anteriores à migração, as mais pesadas, as que ficam mais tempo por
         chegar e as que mais se notam a aparecer de repente.

         A espera é a mesma nos dois casos (o borrão, ou o fundo neutro da
         célula); o que muda é só o ponto de partida da opacidade. Passa a ser
         `pintada` e mais nada: quem espera, espera, e o que chega assenta.

         250 ms (`duration-elemento`), dentro da banda dos ESTADOS — isto é um
         pixel a substituir outro na mesma caixa, não um ecrã a apresentar-se. E
         só `opacity`: a célula já tem a sua medida antes de a fotografia
         chegar, portanto nada aqui remede a grelha. `motion-safe:` desliga a
         passagem para quem pediu para não animar — e aí a imagem salta de
         `opacity-0` para `opacity-100` sem transição, que é o que se quer. */
      className={`${className ?? ""} ${
        pintada ? "opacity-100" : "opacity-0"
      } motion-safe:transition-opacity motion-safe:duration-elemento`}
    />
  );

  if (!oferta) return imagem;
  return (
    <picture className="contents">
      <source srcSet={oferta} type="image/avif" />
      {imagem}
    </picture>
  );
}
