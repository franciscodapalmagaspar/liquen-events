"use client";

import Image from "next/image";
import { useMemo } from "react";
import { blocosDaFolha } from "@/lib/orcamento/folha-da-timeline";
import { SITE } from "@/lib/site";
import type { TimelineItem } from "@/lib/orcamento/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FOLHA, AO LADO, ENQUANTO SE ESCREVE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * «Quero que dê para ir vendo ao lado como está a ficar à medida que vamos
 * preenchendo o timeline, para não termos que estar sempre a fazer download
 * para ver como está.»
 *
 * É a queixa certa sobre o que eu tinha entregue: a folha só existia depois de
 * um download. Escrever doze momentos e descarregar doze vezes para ver se as
 * colunas ficam bem é trabalho que o ecrã devia fazer sozinho.
 *
 * ── O QUE ISTO É, E O QUE NÃO É ─────────────────────────────────────────
 *
 * É a MESMA folha: as mesmas duas regras de agrupamento (`blocosDaFolha`), as
 * mesmas quatro colunas, as mesmas cores da casa, o mesmo logótipo no topo.
 * Uma pré-visualização que agrupasse de outra maneira era pior do que não
 * haver nenhuma — ela confia no que vê, manda imprimir, e sai outra coisa.
 *
 * NÃO é um PDF desenhado no browser. As larguras aqui são as da coluna que a
 * página lhe der, não os 595 pt da A4, e por isso uma descrição comprida pode
 * partir numa linha diferente da do ficheiro. O que esta folha promete é a
 * ESTRUTURA — que horas se agrupam, onde o local aparece, o que cai na coluna
 * das notas —, e isso é o que ela precisa de ver enquanto escreve.
 *
 * ── E AS CORES SÃO AS MESMAS, LIDAS DO MESMO SÍTIO ──────────────────────
 *
 * O PDF tem-nas escritas em hexadecimal porque o `pdf-lib` não sabe o que é
 * uma variável de CSS. Aqui usam-se os tokens (`--color-sage-*`), que é de
 * onde aqueles números foram copiados. Mudar a paleta muda os dois — o
 * segundo com um passo de distância, que é o preço de o PDF não viver num
 * browser.
 */

export interface FolhaDaTimelineProps {
  /** «Casamento J&P 28.06.25» — o que vai na faixa escura. */
  titulo: string;
  adultos?: string;
  criancas?: string;
  staff?: string;
  momentos: readonly TimelineItem[];
  /**
   * A lista do fim da folha. Vem já composta por quem chama, porque o contacto
   * mora no DIRECTÓRIO de fornecedores e não no evento: o evento guarda quem
   * trabalha nele, o directório guarda o telefone de cada um. Ver a nota na
   * rota do PDF.
   */
  fornecedores?: readonly { categoria: string; nome: string; contacto: string }[];
}

export function FolhaDaTimeline({
  titulo,
  adultos = "",
  criancas = "",
  staff = "",
  momentos,
  fornecedores = [],
}: FolhaDaTimelineProps) {
  const blocos = useMemo(() => blocosDaFolha(momentos), [momentos]);

  if (blocos.length === 0) {
    return (
      <div className="rounded-[var(--bo-raio-conteudo)] border border-dashed border-[var(--bo-hairline-strong)] p-6 text-center">
        <p className="bo-text-muted text-xs leading-relaxed">
          A folha aparece aqui à medida que escreves. Cada hora é uma linha, e tudo o que acontece
          nela fica junto.
        </p>
      </div>
    );
  }

  return (
    <div
      /* `bg-white` e não a superfície do painel: isto é uma folha de papel, e
         uma folha de papel é branca mesmo quando o ecrã à volta não é. */
      className="overflow-hidden rounded-[var(--bo-raio-conteudo)] border border-[var(--bo-hairline)] bg-white"
      aria-label="Pré-visualização da folha da timeline"
    >
      <div className="px-4 pt-5 pb-4">
        <Image
          src="/logo-liquen-marca.png"
          alt=""
          width={900}
          height={455}
          className="mx-auto h-10 w-auto object-contain"
        />
        {/* A faixa escura, como no ficheiro. */}
        <p className="mt-4 bg-sage-700 px-3 py-2 text-center text-[11px] font-medium tracking-[0.08em] text-white uppercase">
          {titulo}
        </p>
        <p className="mt-3 text-center text-[11px] italic">Timeline</p>

        {/* ── AS CONTAGENS ────────────────────────────────────────────────
            Três colunas, como na folha dela. As que ainda não têm onde ser
            escritas ficam em BRANCO e não a zero — um zero é uma afirmação
            («não vêm crianças»), o branco é a verdade. */}
        <table className="mt-3 w-full border-collapse text-[11px]">
          <tbody>
            <tr className="bg-sage-100">
              {["Adultos", "Crianças", "Staff"].map((r) => (
                <th
                  key={r}
                  scope="col"
                  className="border border-sage-200 px-2 py-1 text-center font-normal italic"
                >
                  {r}
                </th>
              ))}
            </tr>
            <tr>
              {[adultos, criancas, staff].map((v, i) => (
                <td key={i} className="border border-sage-200 px-2 py-1 text-center">
                  {v || " "}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="px-4 pb-5">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-sage-100">
              {[
                ["Hora", "w-[16%]"],
                ["Local", "w-[18%]"],
                ["Descrição", ""],
                ["Notas", "w-[26%]"],
              ].map(([nome, largura]) => (
                <th
                  key={nome}
                  scope="col"
                  className={`border border-sage-200 px-2 py-1.5 text-center text-[10px] font-semibold tracking-[0.08em] text-sage-700 uppercase ${largura}`}
                >
                  {nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blocos.map((b, i) => (
              /* Zebra por BLOCO de hora, e não por momento: é o que faz as
                 cinco coisas das 10h30 lerem-se como uma só linha do dia. */
              <tr key={`${b.hora}-${i}`} className={i % 2 === 0 ? "bg-sage-50" : ""}>
                <td className="border border-sage-200 px-2 py-1.5 align-top tabular-nums">
                  {b.hora}
                </td>
                <td className="border border-sage-200 px-2 py-1.5 align-top text-[var(--bo-text-muted)]">
                  {b.locais.map((l) => (
                    <span key={l} className="block">
                      {l}
                    </span>
                  ))}
                </td>
                <td className="border border-sage-200 px-2 py-1.5 align-top">
                  {b.descricoes.map((d, j) => (
                    <span key={j} className="block">
                      {d}
                    </span>
                  ))}
                </td>
                <td className="border border-sage-200 px-2 py-1.5 align-top text-[var(--bo-text-muted)]">
                  {b.notas.map((n, j) => (
                    <span key={j} className="block">
                      {n}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── OS FORNECEDORES, NO FIM, COMO NA FOLHA DELA ─────────────────
            «E os fornecedores que escrevemos em baixo no timeline, onde
            escrevemos?» — a pergunta que fez a olhar para esta folha.

            A resposta é que se escrevem no painel de CUSTOS do evento, que é
            onde eles já viviam antes de esta folha existir (`EventCosts`), e
            é por isso que aqui aparecem sozinhos. O que faltava era vê-los —
            sem isto, a pré-visualização prometia uma folha e o ficheiro dava
            outra, que é o defeito que esta pré-visualização existe para não
            ter. */}
        {fornecedores.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold text-sage-700">Fornecedores</p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {fornecedores.map((f, i) => (
                <li key={i} className="text-[11px] leading-snug">
                  <span className="font-semibold text-sage-700">{f.categoria}</span>
                  <span className="text-[var(--bo-text-muted)]">
                    {" – "}
                    {[f.nome, f.contacto].filter(Boolean).join("  –  ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* O contacto da casa no pé, como no ficheiro — ver a nota no
            `horario-pdf.ts`: a folha tem três páginas e anda pelas mãos de dez
            fornecedores, e a que fica com o motorista é a do meio. */}
        <p className="mt-4 text-right text-[10px] text-[var(--bo-text-faint)]">
          {SITE.phoneDisplay} · {SITE.email}
        </p>
      </div>
    </div>
  );
}
