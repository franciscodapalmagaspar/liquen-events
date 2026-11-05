"use client";

import { useMemo, useState, type ReactNode } from "react";
import { eur, round2 } from "@/lib/money";
import type { VersaoEscolhida } from "@/lib/orcamento/versoes-da-proposta";
import {
  ARTIGOS,
  eArtigo,
  faturacaoPorArtigo,
  parcelasDaFatura,
  repartoDe,
  sugestaoDeReparto,
  type ArtigoId,
  type DocParaFaturar,
} from "@/lib/orcamento/artigos-de-faturacao";
import { parseMoney } from "./util";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «REPARTIR POR ARTIGO» — O MESMO BLOCO NO ESTÚDIO E NOS PAGAMENTOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cinco campos, um por artigo do Moloni, e uma frase que diz se bate certo com
 * o total sem IVA da proposta. Por baixo, quando bate, o sinal e o saldo de
 * cada artigo. Ela: «super simples, que é para não ser difícil».
 *
 * Duas ajudas, e só duas:
 *   · «Sugerir» — com a repartição vazia, preenche o que os nomes dizem com
 *     clareza (a deslocação vai para Transporte). O resto fica para ela.
 *   · «Pôr o resto em…» — o que falta repartir, num artigo, com um toque.
 *
 * Um componente só para os dois sítios: o estúdio e os pagamentos não podem
 * dizer coisas diferentes da mesma proposta. Quem o usa decide onde se grava.
 */

type Reparto = Partial<Record<ArtigoId, number>>;

export function RepartoPorArtigo({
  doc,
  versao,
  pct,
  aoMudar,
  bloqueado = false,
  permitirManual = true,
  children,
}: {
  doc: DocParaFaturar;
  versao?: VersaoEscolhida;
  /** A percentagem do sinal (30). */
  pct: number;
  /** A repartição inteira, já com a mudança. */
  aoMudar: (reparto: Reparto) => void;
  bloqueado?: boolean;
  /**
   * Repartir à mão quando as linhas não dizem o valor de cada coisa. Nos
   * pagamentos, sim (as propostas antigas não têm preço por linha). No estúdio,
   * não: aí o caminho é pôr o preço e o artigo em cada linha.
   */
  permitirManual?: boolean;
  /** O que vai por baixo — nos pagamentos, os botões do Moloni. */
  children?: ReactNode;
}) {
  const f = useMemo(() => faturacaoPorArtigo(doc, versao), [doc, versao]);
  const reparto = useMemo(() => repartoDe(doc), [doc]);
  const sugestao = useMemo(() => sugestaoDeReparto(doc, versao), [doc, versao]);
  const vazio = f.artigos.length === 0;
  const sinal = useMemo(() => (f.fecha ? parcelasDaFatura(f, "sinal", pct) : []), [f, pct]);
  const saldo = useMemo(() => (f.fecha ? parcelasDaFatura(f, "saldo", pct) : []), [f, pct]);
  const [restoPara, setRestoPara] = useState<ArtigoId | "">("");

  function escrever(artigo: ArtigoId, texto: string) {
    const n = texto.trim() === "" ? 0 : (parseMoney(texto) ?? reparto[artigo] ?? 0);
    const r: Reparto = { ...reparto };
    if (n > 0) r[artigo] = round2(n);
    else delete r[artigo];
    if ((r[artigo] ?? 0) !== (reparto[artigo] ?? 0)) aoMudar(r);
  }

  if (f.base <= 0) {
    return <p className="text-xs text-[var(--bo-text-muted)]">A proposta ainda não tem total.</p>;
  }

  // ── VEM FEITO DA PROPOSTA ───────────────────────────────────────────────
  // Cada linha com o seu preço e o seu artigo: aqui só se LÊ. Nada de contas.
  if (f.modo === "linhas") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-[var(--bo-text-muted)]">Total sem IVA, das linhas da proposta</span>
          <span className="font-semibold tabular-nums text-[var(--bo-text)]">{eur(f.base)}</span>
        </div>
        {f.fecha ? (
          <TabelaDasFases f={f} pct={pct} sinal={sinal} saldo={saldo} />
        ) : (
          <Aviso frases={f.porqueNaoFecha} />
        )}
        {children}
      </div>
    );
  }

  // ── NO ESTÚDIO, NÃO SE REPARTE À MÃO ────────────────────────────────────
  if (!permitirManual) {
    return (
      <p role="status" className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
        Põe o preço e o artigo do Moloni em cada linha do orçamento (e nos valores adicionais), com
        as linhas a somar o total. A faturação por artigo aparece aqui, feita.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-[var(--bo-text-muted)]">Total sem IVA a repartir</span>
        <span className="font-semibold tabular-nums text-[var(--bo-text)]">{eur(f.base)}</span>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--bo-hairline)] rounded-xl border border-[var(--bo-hairline)]">
        {ARTIGOS.map((a) => {
          const v = reparto[a.id];
          return (
            <li key={a.id} className="flex items-center gap-3 px-3 py-1.5">
              {/* O nome e o código tal e qual estão no Moloni — «os nomes das
                  coisas têm que ser iguais». */}
              <label htmlFor={`reparto-${a.id}`} className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs leading-snug text-[var(--bo-text)]">{a.nome}</span>
                <span className="text-[11px] leading-snug text-[var(--bo-text-faint)]">
                  {a.ref}
                  {a.ajuda ? ` · ${a.ajuda}` : ""}
                </span>
              </label>
              <span className="relative w-36 shrink-0">
                <input
                  id={`reparto-${a.id}`}
                  // A chave traz o valor gravado de volta ao campo quando ele
                  // muda por fora (Sugerir, «Pôr o resto»): é um campo que se
                  // grava ao sair, e um `defaultValue` não se volta a aplicar.
                  key={`${a.id}:${v ?? ""}`}
                  defaultValue={v ? v.toFixed(2).replace(".", ",") : ""}
                  disabled={bloqueado}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label={`${a.nome}, valor sem IVA`}
                  onBlur={(e) => escrever(a.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className={`bo-input w-full py-1.5 pl-2.5 pr-7 text-right text-xs tabular-nums ${
                    v ? "font-medium text-[var(--bo-text)]" : "text-[var(--bo-text-muted)]"
                  }`}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[var(--bo-text-faint)]"
                >
                  €
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* O estado, numa frase. Cor + ícone + palavra. */}
      <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
        {f.fecha ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--bo-accent)]">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Bate certo com o total
          </span>
        ) : vazio ? (
          <span className="text-[var(--bo-text-muted)]">Ainda por repartir.</span>
        ) : f.falta > 0 ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--bo-aviso)]">
            <IconeAviso />
            Falta repartir {eur(f.falta)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--bo-perigo)]">
            <IconeAviso />
            Repartiu-se {eur(-f.falta)} a mais
          </span>
        )}

        {vazio && Object.keys(sugestao).length > 0 && (
          <button
            type="button"
            disabled={bloqueado}
            onClick={() => aoMudar(sugestao)}
            className={`alvo-toque inline-flex items-center gap-1.5 rounded-full border border-sage-600/40 bg-sage-600/10 px-3 py-1 text-xs font-medium text-[var(--bo-accent)] hover:bg-sage-600/15 disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
            </svg>
            Sugerir
          </button>
        )}

        {f.falta > 0.005 && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <select
              value={restoPara}
              disabled={bloqueado}
              onChange={(e) => setRestoPara(eArtigo(e.target.value) ? e.target.value : "")}
              aria-label="Artigo onde pôr o que falta repartir"
              className="bo-input w-auto px-2 py-1 text-xs"
            >
              <option value="">Pôr o resto em…</option>
              {ARTIGOS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!restoPara || bloqueado}
              onClick={() => {
                if (!restoPara) return;
                aoMudar({ ...reparto, [restoPara]: round2((reparto[restoPara] ?? 0) + f.falta) });
                setRestoPara("");
              }}
              className={`alvo-toque rounded-full border border-[var(--bo-hairline-strong)] px-3 py-1 text-xs text-[var(--bo-tinta-72)] hover:border-sage-600/50 disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
            >
              Pôr
            </button>
          </span>
        )}
      </div>

      {f.fecha && <TabelaDasFases f={f} pct={pct} sinal={sinal} saldo={saldo} />}

      {children}
    </div>
  );
}

function IconeAviso() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

/** O sinal e o saldo de cada artigo, sem IVA. */
function TabelaDasFases({
  f,
  pct,
  sinal,
  saldo,
}: {
  f: { artigos: { artigo: ArtigoId; nome: string; valor: number }[]; vatRate: number };
  pct: number;
  sinal: { artigo: ArtigoId; valor: number }[];
  saldo: { artigo: ArtigoId; valor: number }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <caption className="sr-only">O sinal e o saldo por artigo, sem IVA</caption>
        <thead>
          <tr className="text-left text-[11px] text-[var(--bo-text-muted)]">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Artigo
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Sinal {pct}%
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Saldo {100 - pct}%
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--bo-hairline)]">
          {f.artigos.map((a) => (
            <tr key={a.artigo}>
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-[var(--bo-text)]">
                {a.nome}
                <span className="ml-1.5 text-[11px] text-[var(--bo-text-faint)]">
                  {ARTIGOS.find((x) => x.id === a.artigo)?.ref}
                </span>
              </th>
              <td className="py-1.5 pr-3 text-right">
                {eur(sinal.find((p) => p.artigo === a.artigo)?.valor ?? 0)}
              </td>
              <td className="py-1.5 text-right">
                {eur(saldo.find((p) => p.artigo === a.artigo)?.valor ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] text-[var(--bo-text-faint)]">
        Valores sem IVA. O Moloni junta o IVA de cada artigo ({Math.round(f.vatRate * 100)}%).
      </p>
    </div>
  );
}

/** Porque é que ainda não dá para faturar — cor + ícone + palavras. */
function Aviso({ frases }: { frases: string[] }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl bg-[var(--bo-tinta-3)] px-3 py-2.5"
    >
      <span className="mt-0.5 shrink-0 text-[var(--bo-aviso)]">
        <IconeAviso />
      </span>
      <div className="min-w-0 text-xs text-[var(--bo-tinta-72)]">
        <p className="font-medium text-[var(--bo-aviso)]">Ainda não dá para faturar por artigo</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {frases.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
