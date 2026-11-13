"use client";

import { useMemo } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import {
  conferir,
  temReparos,
  type Severidade,
  type Verificacao,
} from "@/lib/orcamento/conferencia";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * A PASSAGEM DE OLHOS ANTES DE ENVIAR.
 *
 * O envio é irreversível: o email sai uma vez. Um erro no nome numa proposta de
 * casamento custa credibilidade inteira — quem recebe uma proposta com o nome
 * mal escrito conclui, e conclui bem, que aquilo foi feito à pressa.
 *
 * ── MOSTRA TAMBÉM O QUE PASSOU ─────────────────────────────────────────────
 * Uma lista só com problemas não diz se as outras verificações foram sequer
 * feitas, e é essa dúvida que faz voltar a conferir tudo à mão — que é o
 * trabalho que isto vem poupar. Os vistos verdes são metade da utilidade.
 *
 * ── QUASE NADA AQUI TRAVA, E O QUE TRAVA VEM DE FORA ───────────────────────
 * A regra do que impede o envio continua a nascer em `proposal-progress.ts` —
 * a mesma que acende o botão. O que mudou é que deixou de ter uma lista sua:
 * havia esta (erro/aviso/conferido), a coluna lateral que só existe acima de
 * 1280 px (trava/conselho) e uma frase estática por baixo do botão a repetir a
 * terceira versão do mesmo. Três sítios a dizer coisas parecidas com palavras
 * diferentes é como se ensina alguém a não ler nenhum.
 *
 * Fica UMA lista, com o que trava em cima e a vermelho. O resto continua a ser
 * uma passagem de olhos: uma data diferente da do pedido pode ser a data certa
 * — o casal mudou de ideias e disse-o ao telefone. Quem decide é ela.
 *
 * ── E CADA LINHA LEVA AO SÍTIO ─────────────────────────────────────────────
 * Dizer «Falta o nome dos clientes» a cinco ecrãs de distância do campo é meio
 * trabalho. A linha que sabe onde se resolve é um botão; a que não sabe (o
 * texto de exemplo pode estar em qualquer campo) fica texto, que é honesto.
 */

const MARCA: Record<Severidade, { simbolo: string; cor: string }> = {
  erro: { simbolo: "✕", cor: "text-[var(--bo-perigo)]" },
  aviso: { simbolo: "!", cor: "text-[var(--bo-aviso)]" },
  ok: { simbolo: "✓", cor: "text-sage-600" },
};

interface Props {
  doc: ProposalDoc;
  quote: Quote;
  /** Os outros pedidos, para o padrão de preço. Sem eles não há comparação. */
  quotes?: Quote[];
  totalBruto: number;
  /**
   * A língua em que o PDF vai sair — o mesmo estado do selector do passo
   * anterior. É ela que decide se a lista fala do pedido que veio em inglês ou
   * dos campos que ainda não têm versão inglesa.
   */
  idioma?: IdiomaDaProposta;
  /**
   * Levar ao sítio onde se resolve. Sem isto a lista continua a ler-se — só
   * não se toca — e é assim que ela aparece nos testes que só olham para o
   * texto.
   */
  onIr?: (v: Verificacao) => void;
  /** Por onde segue, e o email do pedido — sem eles o email não se verifica. */
  canal?: "email" | "whatsapp" | "ambos";
  emailDoCliente?: string;
  /**
   * O PDF final desta versão foi visto e confirmado — o mesmo valor que o
   * estúdio dá ao botão de enviar. Com ele, o «Falta ver o PDF final» entra
   * nesta lista como as outras faltas, e a contagem daqui é a da pastilha.
   */
  pdfVisto?: boolean;
}

export default function Conferencia({
  doc,
  quote,
  quotes = [],
  totalBruto,
  idioma,
  onIr,
  canal,
  emailDoCliente,
  pdfVisto,
}: Props) {
  const verificacoes = useMemo(
    () =>
      conferir({
        doc,
        quote,
        historico: quotes,
        totalBruto,
        idioma,
        canal,
        emailDoCliente,
        pdfVisto,
      }),
    [doc, quote, quotes, totalBruto, idioma, canal, emailDoCliente, pdfVisto],
  );
  const reparos = temReparos(verificacoes);
  const travam = verificacoes.filter((x) => x.trava).length;
  const porOlhar = verificacoes.filter((v) => v.severidade !== "ok");
  const conferidas = verificacoes.filter((v) => v.severidade === "ok");
  const linha = (v: (typeof verificacoes)[number]) => {
    const m = MARCA[v.severidade];
    /**
     * A FRASE, num invólucro só.
     *
     * Título e detalhe são UMA frase — «Local — a proposta diz "Évora" e
     * o pedido dizia "Sintra"» — e têm de correr como texto. Quando a
     * linha é clicável leva `alvo-toque`, e essa classe põe
     * `display: inline-flex` no toque: dentro de um contentor de flex
     * cada `<span>` passa a ser uma coluna, e a frase parte-se em duas
     * colunas lado a lado com o travessão a meio do nada. É a mesma
     * armadilha que o `AvisoDataOcupada` documenta, medida a 375 px.
     */
    const frase = (
      <span>
        <span
          className={v.severidade === "ok" ? "text-foreground/45" : "text-[var(--bo-tinta-72)]"}
        >
          {v.titulo}
        </span>
        {v.detalhe && <span className="text-[var(--bo-text-muted)]"> — {v.detalhe}</span>}
        {/* O leitor de ecrã ouve a gravidade, que a cor e o símbolo só
                  dizem a quem vê. */}
        <span className="sr-only">
          {v.severidade === "ok"
            ? " (conferido)"
            : v.severidade === "erro"
              ? " (erro)"
              : " (a confirmar)"}
        </span>
      </span>
    );
    // Só é link quando há mesmo para onde ir, e nunca no que já está
    // conferido: um visto verde clicável convida a um salto que não
    // resolve nada.
    const saltavel = !!onIr && !!v.seccao && v.severidade !== "ok";
    return (
      <li key={v.id} className="flex items-start gap-2 text-xs leading-relaxed">
        <span aria-hidden="true" className={`mt-px font-semibold ${m.cor}`}>
          {m.simbolo}
        </span>
        <span className="min-w-0">
          {saltavel ? (
            <button
              type="button"
              onClick={() => onIr?.(v)}
              className={`alvo-toque text-left underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground/60 ${ESTADO} ${PRESSAO}`}
            >
              {frase}
            </button>
          ) : (
            frase
          )}
        </span>
      </li>
    );
  };

  return (
    <section
      aria-labelledby="conferencia-titulo"
      className={`mt-5 rounded-2xl border p-4 ${
        travam > 0
          ? "border-[var(--bo-perigo)]/45 bg-[var(--bo-perigo)]/[0.06]"
          : reparos
            ? "border-[var(--bo-aviso-tom)]/40 bg-[var(--bo-aviso-tom)]/[0.05]"
            : "border-sage-600/25 bg-sage-600/[0.04]"
      }`}
    >
      <h3
        id="conferencia-titulo"
        className="text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--bo-tinta-72)]"
      >
        Conferência
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--bo-text-muted)]">
        {travam === 1
          ? "Uma coisa impede o envio — está em primeiro, a vermelho. O resto é para olhar."
          : travam > 1
            ? `${travam} coisas impedem o envio — estão em primeiro, a vermelho. O resto é para olhar.`
            : reparos
              ? "Há coisas a que vale a pena olhar. Nenhuma te impede de enviar."
              : "Está tudo de acordo com o pedido original."}
      </p>

      {/* ── O QUE PRECISA DE OLHOS PRIMEIRO; O QUE ESTÁ CERTO, DOBRADO ──────
          Pedido dela de 9/11 («está uma confusão brutal»): a lista dizia doze
          coisas certas para uma errada, e a errada perdia-se no meio dos
          vistos verdes. Ficam à vista as que travam e as que são para olhar;
          as conferidas cabem numa linha que se abre. Nada sai da lista — só
          deixa de ser a primeira coisa que se lê. */}
      {porOlhar.length > 0 && <ul className="mt-3 flex flex-col gap-1.5">{porOlhar.map(linha)}</ul>}
      {conferidas.length > 0 && (
        <details className="group mt-3">
          <summary
            className={`alvo-toque cursor-pointer list-none text-xs text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
          >
            <span aria-hidden="true" className="mr-1 inline-block group-open:rotate-90">
              ›
            </span>
            {porOlhar.length === 0
              ? `${conferidas.length} coisas conferidas`
              : conferidas.length === 1
                ? "Mais 1 coisa está certa"
                : `Mais ${conferidas.length} coisas estão certas`}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">{conferidas.map(linha)}</ul>
        </details>
      )}
    </section>
  );
}
