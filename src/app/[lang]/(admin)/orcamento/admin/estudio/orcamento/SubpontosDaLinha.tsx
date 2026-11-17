"use client";

import { ARTIGOS, artigoSugerido, eArtigo } from "@/lib/orcamento/artigos-de-faturacao";
import type { SubpontoDoOrcamento } from "@/lib/proposal-doc";
import { normalizarValor } from "@/lib/proposal-budget";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { INPUT_SM } from "../classes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS SUBPONTOS DE UMA LINHA — SÓ PARA NÓS (6/11)
 * ════════════════════════════════════════════════════════════════════════════
 * Ela: «quando eu metesse a linha A, tivessem os subtítulos também lá, para eu
 * colocar o custo para cada coisa». Cada subponto com o seu valor e o seu
 * artigo do Moloni; a linha vale a soma. Não sai no PDF nem na página — ela
 * escolheu «só para nós».
 */
export function SubpontosDaLinha({
  i,
  linha,
  subs,
  aoMudar,
}: {
  i: number;
  linha: string;
  subs: SubpontoDoOrcamento[];
  aoMudar: (mudar: (atuais: SubpontoDoOrcamento[]) => SubpontoDoOrcamento[]) => void;
}) {
  const nomeDaLinha = linha.trim() || "linha sem nome";
  const mudar = (j: number, p: Partial<SubpontoDoOrcamento>) =>
    aoMudar((atuais) => atuais.map((s, k) => (k === j ? { ...s, ...p } : s)));
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-2">
      <p className="px-1 text-[11px] leading-snug text-[var(--bo-text-muted)]">
        Subpontos · só para nós — a linha vale a soma
      </p>
      {subs.map((sp, j) => (
        <div key={j} className="flex flex-wrap items-center gap-2">
          <input
            key={`subnome:${i}:${j}:${sp.nome}`}
            className={`${INPUT_SM} min-w-[9rem] flex-1`}
            defaultValue={sp.nome}
            onBlur={(e) => {
              const nome = e.target.value;
              if (nome === sp.nome) return;
              // O artigo vem do nome quando ainda não há um escolhido.
              mudar(j, { nome, ...(sp.artigo ? {} : { artigo: artigoSugerido(nome) }) });
            }}
            placeholder="Zona do bar"
            aria-label={`Subponto ${j + 1} de ${nomeDaLinha}`}
            data-campo={`budgetSubNome:${i}:${j}`}
          />
          <span className="w-28 shrink-0">
            <input
              key={`subvalor:${i}:${j}:${sp.valor ?? ""}`}
              className={`bo-input px-2.5 py-2 text-right text-xs ${
                sp.valor === null
                  ? "border-dashed bg-[var(--bo-surface)] text-foreground/40 placeholder:italic placeholder:text-foreground/30"
                  : "font-medium text-[var(--bo-text)]"
              }`}
              defaultValue={sp.valor === null ? "" : String(sp.valor)}
              onBlur={(e) => {
                const valor = normalizarValor(e.target.value);
                if (valor !== sp.valor) mudar(j, { valor });
              }}
              placeholder="sem valor"
              inputMode="decimal"
              aria-label={`Valor de ${sp.nome.trim() || `subponto ${j + 1}`} (${nomeDaLinha})`}
              data-campo={`budgetSubPreco:${i}:${j}`}
            />
          </span>
          <select
            value={sp.artigo ?? ""}
            onChange={(e) => mudar(j, { artigo: eArtigo(e.target.value) ? e.target.value : null })}
            aria-label={`Artigo do Moloni de ${sp.nome.trim() || `subponto ${j + 1}`} (${nomeDaLinha})`}
            data-campo={`budgetSubArtigo:${i}:${j}`}
            className={`bo-input w-auto min-w-0 max-w-full px-2 py-1.5 text-[11px] ${
              sp.artigo ? "text-[var(--bo-tinta-72)]" : "border-dashed text-[var(--bo-text-muted)]"
            }`}
          >
            <option value="">Artigo…</option>
            {ARTIGOS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome} · {a.ref}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => aoMudar((atuais) => atuais.filter((_, k) => k !== j))}
            aria-label={`Tirar o subponto ${sp.nome.trim() || j + 1} de ${nomeDaLinha}`}
            className={`alvo-toque flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--bo-text-muted)] hover:text-[var(--bo-perigo)] ${ESTADO} ${PRESSAO}`}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => aoMudar((atuais) => [...atuais, { nome: "", valor: null, artigo: null }])}
        className={`alvo-toque self-start px-1 text-[11px] font-medium text-[var(--bo-accent)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
      >
        + Subponto
      </button>
    </div>
  );
}
