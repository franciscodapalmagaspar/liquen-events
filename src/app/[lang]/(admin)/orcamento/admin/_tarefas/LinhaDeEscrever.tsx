"use client";

import { useEffect, useRef } from "react";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { rolarAteCaberPorCima } from "@/lib/motion/rolar";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LINHA QUE ESCREVE — A ÚLTIMA DA LISTA, COMO NOS LEMBRETES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fechada é um convite de uma linha: «＋ Nova tarefa». Aberta é o campo, com os
 * quatro detalhes por baixo.
 *
 * ── OS ATALHOS, E PORQUE É QUE SÃO ESTES ─────────────────────────────────
 *
 *  · `Enter` cria **e o campo fica aberto**, vazio, à espera da seguinte.
 *    Quem escreve tarefas escreve-as em rajada — a segunda vem a seguir à
 *    primeira, e obrigar a um toque entre cada uma é atrito puro.
 *  · `⇧Enter` cria e FECHA, para quem só tinha uma.
 *  · `Esc` desiste. Com texto escrito, desiste do texto; sem texto, fecha a
 *    linha — que é a ordem em que se espera perder as coisas.
 *
 * ── E O CAMPO NÃO É UMA CÁPSULA ──────────────────────────────────────────
 *
 * «Mini a medium são retângulos arredondados; cápsula só em large e extra
 * large.» [APPLE] É o `bo-input` da casa, que já é o rectângulo de 10 px de
 * todos os outros campos do produto.
 */
export function LinhaDeEscrever({
  aberta,
  aoAbrir,
  aoFechar,
  campo,
  botao,
  titulo,
  aoEscrever,
  aoCriar,
  aGravar,
  children,
}: {
  aberta: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
  campo: React.RefObject<HTMLInputElement | null>;
  /** O botão que ocupa o lugar do campo quando ele fecha — para onde o foco volta. */
  botao: React.RefObject<HTMLButtonElement | null>;
  titulo: string;
  aoEscrever: (v: string) => void;
  aoCriar: (fecharDepois: boolean) => void;
  aGravar: boolean;
  children: React.ReactNode;
}) {
  /* ── ABERTA, VÊ-SE INTEIRA, POR CIMA DA BARRA DE BAIXO ─────────────────────
     No telemóvel a linha é a última da lista, e abria a y≈505 de 664: o campo
     colado à barra de destinos e os detalhes (responsável, data, lista) por
     baixo dela, sem a página rolar até eles (auditoria do telemóvel, 14/11).
     Ao abrir, leva-se a linha inteira à vista — só se não se vê, portanto quem
     já a vê não é sacudido — e o `scroll-mb` desconta a barra de baixo. */
  const caixa = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = caixa.current;
    if (!aberta || !el) return;
    // Dois fotogramas depois, e não já: MEDIDO, o que está POR CIMA da linha
    // ainda cresce ~40 px depois de ela abrir, e um rolo pedido logo deixava-a
    // a acabar 26 px por baixo da barra. A linha também cresce enquanto
    // assenta (os detalhes), e cada crescimento volta a pedir o mesmo.
    let f2 = 0;
    const f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => rolarAteCaberPorCima(el));
    });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      let primeira = true;
      ro = new ResizeObserver(() => {
        if (primeira) primeira = false;
        else rolarAteCaberPorCima(el);
      });
      ro.observe(el);
    }
    const fim = setTimeout(() => ro?.disconnect(), 800);
    return () => {
      cancelAnimationFrame(f1);
      cancelAnimationFrame(f2);
      clearTimeout(fim);
      ro?.disconnect();
    };
  }, [aberta]);
  if (!aberta) {
    return (
      <button
        ref={botao}
        type="button"
        onClick={aoAbrir}
        className={`alvo-toque flex w-full items-center gap-2.5 px-5 py-3 text-left text-sm text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-3)] hover:text-[var(--bo-text)] sm:px-6 ${ESTADO} ${PRESSAO}`}
      >
        <span
          aria-hidden="true"
          className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-dashed border-foreground/30 text-[11px] leading-none"
        >
          +
        </span>
        Nova tarefa
      </button>
    );
  }

  return (
    <div
      ref={caixa}
      className="scroll-mt-[var(--bo-cabecalho,0px)] scroll-mb-[calc(var(--bo-barra-inferior)+var(--bo-barra-folga))] px-5 py-3.5 sm:px-6"
    >
      <input
        ref={campo}
        value={titulo}
        onChange={(e) => aoEscrever(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aoCriar(e.shiftKey);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            if (titulo) aoEscrever("");
            else aoFechar();
          }
        }}
        /* ── `readOnly` E NÃO `disabled`: O FOCO FICA ONDE ESTÁ ────────────
           Um campo desactivado deixa de poder ter foco, e o que estava focado
           passa a `<body>`. MEDIDO: com `disabled`, `document.activeElement`
           ficava em `BODY` enquanto a tarefa gravava, e só voltava ao campo
           depois — por um `requestAnimationFrame` a apostar numa re-desenho
           que nem sempre chega a tempo.

           E é nessa janela que quem escreve «em rajada» (a intenção escrita
           aqui em cima) já começou a tarefa seguinte: as teclas caíam nos
           atalhos globais da página, onde «g» seguido de uma letra muda de
           vista. `readOnly` engole-as no campo em vez de as entregar à página,
           e `aria-busy` diz a quem ouve que o campo está a gravar. */
        readOnly={aGravar}
        aria-busy={aGravar || undefined}
        aria-label="Nova tarefa"
        placeholder="O que há para fazer?"
        className="bo-input w-full px-3 py-2 text-sm"
      />
      {children}
      {/* Uma linha, e não um botão. O que ela precisa de saber é que o Enter
          chega — e depois de saber uma vez, isto é ruído que se aprende a
          saltar. Fica em `text-caption` e some com a linha ao fechar. */}
      <p className="bo-text-muted mt-2 text-[11px]">
        <kbd className="pointer-coarse:hidden">Enter</kbd>
        <span className="pointer-coarse:hidden"> cria e fica pronto para a seguinte · </span>
        <kbd className="pointer-coarse:hidden">Esc</kbd>
        <span className="pointer-coarse:hidden"> desiste</span>
        <span className="hidden pointer-coarse:inline">Toca fora para desistir.</span>
      </p>
    </div>
  );
}
