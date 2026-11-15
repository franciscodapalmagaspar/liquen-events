"use client";

import { useState } from "react";
import { useToast } from "./Toast";
import { EmCurso } from "./ui/EmCurso";
import type { ValorDivergente } from "@/lib/orcamento/valor-enviado";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PÔR O VALOR DO PEDIDO NO QUE SAIU NO PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «caso apareça propostas onde os valores não são iguais ao que
 * enviamos, quero que automaticamente se coloque no valor que foi enviado na
 * proposta».
 *
 * ── PORQUE É QUE ISTO É UM PAINEL À PARTE, E NÃO UM BOTÃO NO DO LADO ─────
 *
 * O painel dos «valores que podem ter crescido sozinhos» promete, por escrito e
 * em negrito, que **só lê**. Pendurar-lhe um botão que escreve tornava essa
 * frase falsa — e é uma frase que ela própria pediu que lá estivesse.
 *
 * E os dois não têm a mesma certeza por baixo. Aquele DEDUZ o valor certo a
 * partir da forma da avaria; este LÊ dois números que deviam ser o mesmo:
 * o `subtotal` gravado no envio, e o preço do pedido. Ferramentas com garantias
 * diferentes não devem partilhar o mesmo botão.
 *
 * ── O «AUTOMATICAMENTE» É SOBRE O TRABALHO, NÃO SOBRE A DECISÃO ─────────
 *
 * Ela não quer corrigir linha a linha — e não corrige: um botão trata de todas.
 * O que continua a valer é a outra regra que ela deu: «não corrijas dados em
 * base sem me mostrares primeiro o que vai ser alterado». Por isso são dois
 * passos, e o segundo mostra os dois números de cada linha antes de acontecer.
 */

const eur = (n: number) =>
  n.toLocaleString("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });

const dia = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
};

export default function ValorEnviado() {
  const { toast } = useToast();
  const [divergentes, setDivergentes] = useState<ValorDivergente[] | null>(null);
  const [examinados, setExaminados] = useState(0);
  const [aLer, setALer] = useState(false);
  const [aCorrigir, setACorrigir] = useState(false);

  async function procurar() {
    setALer(true);
    try {
      const res = await fetch("/api/admin/valor-enviado");
      const dados = await res.json().catch(() => null);
      if (!res.ok) throw new Error(dados?.error ?? "Não consegui ler os pedidos.");
      setDivergentes(dados.divergentes ?? []);
      setExaminados(dados.examinados ?? 0);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui ler os pedidos.", "error");
    } finally {
      setALer(false);
    }
  }

  async function corrigirTodos() {
    setACorrigir(true);
    try {
      const res = await fetch("/api/admin/valor-enviado", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const dados = await res.json().catch(() => null);
      if (!res.ok) throw new Error(dados?.error ?? "Não foi possível corrigir os valores.");
      const feitos: unknown[] = dados.feitos ?? [];
      const falhados: unknown[] = dados.falhados ?? [];
      if (falhados.length > 0) {
        toast(
          `${feitos.length} ${feitos.length === 1 ? "pedido corrigido" : "pedidos corrigidos"}, ` +
            `${falhados.length} por corrigir. Tenta outra vez para os que faltam.`,
          "info",
        );
      } else {
        toast(
          feitos.length === 1
            ? "Um pedido passou a valer o que saiu na proposta."
            : `${feitos.length} pedidos passaram a valer o que saiu na proposta.`,
          "success",
        );
      }
      // Relê: é a confirmação de que ficou feito, e não uma promessa do ecrã.
      await procurar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível corrigir os valores.", "error");
    } finally {
      setACorrigir(false);
    }
  }

  const lista = divergentes ?? [];

  return (
    <section className="mt-4 rounded-xl border border-[var(--bo-hairline-strong)] p-4 sm:p-5">
      <h3 className="text-sm font-medium">Pedidos com valor diferente do que foi enviado</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--bo-text-muted)]">
        Quando uma proposta sai, o valor que vai no PDF fica guardado com ela. Isto compara esse
        valor com o «Preço final» de cada pedido e mostra os que não batem certo. Corrigir põe o
        pedido no <strong className="font-medium">valor que o casal recebeu</strong> — nunca ao
        contrário.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={procurar}
          disabled={aLer || aCorrigir}
          className={`min-h-11 rounded-full border border-foreground/20 px-4 text-sm hover:bg-[var(--bo-tinta-6)] disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
        >
          {aLer ? "A procurar…" : "Procurar"}
        </button>
        {lista.length > 0 && !aLer && (
          <button
            type="button"
            onClick={corrigirTodos}
            disabled={aCorrigir}
            /* Pílula e não `rounded-lg`: a regra da casa é que o raio máximo
               está reservado ao elemento clicável, e um botão de fundo cheio
               com o canto do cartão apaga a distinção. Foi o
               `raios-do-back-office.test.ts` a apanhar-me — escrevi a regra
               ontem e hoje ia desfazê-la. */
            className={`min-h-11 rounded-full bg-sage-600 px-4 text-sm font-medium text-white hover:bg-[var(--bo-accent-hover)] disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
          >
            {aCorrigir
              ? "A corrigir…"
              : `Pôr ${lista.length === 1 ? "o pedido" : `os ${lista.length} pedidos`} no valor enviado`}
          </button>
        )}
      </div>

      {(aLer || aCorrigir) && (
        <EmCurso
          className="mt-3"
          titulo={
            aCorrigir ? "A repor os valores enviados" : "A comparar cada pedido com o PDF que saiu"
          }
          estimadoMs={6000}
          nota={
            aCorrigir
              ? "Cada correcção fica registada no histórico do pedido."
              : "Lê os pedidos e as propostas todos. Não escreve nada."
          }
          notaDemorada="Está a demorar mais do que o costume — com muitas propostas, é normal."
        />
      )}

      {divergentes && !aLer && !aCorrigir && (
        <div className="mt-4 text-xs">
          {lista.length === 0 ? (
            <p className="text-[var(--bo-tinta-72)]">
              Todos os {examinados} {examinados === 1 ? "pedido tem" : "pedidos têm"} o valor que
              saiu na proposta.{" "}
              <span className="text-foreground/50">
                Pedidos sem proposta enviada não entram nesta conta — não há PDF com que comparar.
              </span>
            </p>
          ) : (
            <>
              <p className="text-[var(--bo-text)]">
                <strong>
                  {lista.length} {lista.length === 1 ? "pedido" : "pedidos"}
                </strong>{" "}
                com valor diferente do que saiu no PDF.
              </p>
              <ul className="mt-3 flex flex-col divide-y divide-[var(--bo-hairline)] rounded-lg border border-[var(--bo-hairline)]">
                {lista.map((d) => (
                  <li key={d.quoteId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
                    <span className="min-w-0 flex-1 truncate font-medium text-[var(--bo-text)]">
                      {d.nome}
                    </span>
                    <span className="tabular-nums text-foreground/45 line-through">
                      {d.noPedido === null ? "sem valor" : eur(d.noPedido)}
                    </span>
                    <span aria-hidden className="text-foreground/30">
                      →
                    </span>
                    <span className="tabular-nums font-semibold text-sage-600">
                      {eur(d.enviado)}
                    </span>
                    <span className="w-full text-[11px] text-foreground/45 sm:w-auto">
                      enviada a {dia(d.quando)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
