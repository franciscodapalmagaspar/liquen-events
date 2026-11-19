"use client";

import { useEffect, useState } from "react";
import { eur } from "@/lib/money";
import {
  conferenciaDoMoloni,
  parcelasDaFatura,
  refDoArtigo,
  valorParaColar,
  type Faturacao,
  type ParcelaDoArtigo,
} from "@/lib/orcamento/artigos-de-faturacao";
import { rotuloDaParte, textoDaFatura, type ParteDaFatura } from "@/lib/orcamento/partes-da-fatura";
import { useToast } from "./Toast";
import { Button } from "./ui/Button";
import { BotaoWhatsApp } from "./ui/BotaoWhatsApp";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * O TOTAL (100%), por serviço, para copiar ou mandar por WhatsApp — ao lado do
 * Sinal e do Saldo (pedido do Francisco, 19/11: «há um de 30 e 70 e agora tem
 * que haver outro de 100%»). Não é uma fatura no Moloni: não tem «Criar
 * rascunho» nem «Já está no Moloni», só os valores.
 */
export function CartaoDoTotal({
  f,
  pct,
  cliente,
  nif,
}: {
  f: Faturacao;
  pct: number;
  cliente?: string;
  nif?: string;
}) {
  const partes = parcelasDaFatura(f, "total", pct);
  const valor = Math.round(partes.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  const { noMoloni } = conferenciaDoMoloni(f, "total", pct);
  const [aberto, setAberto] = useState(true);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--bo-tinta-72)]">
          {rotuloDaParte("total", pct)}
        </span>
        <span className="text-sm font-semibold tabular-nums text-[var(--bo-text)]">
          {eur(valor)}
          <span className="ml-1 text-[11px] font-normal text-[var(--bo-text-faint)]">sem IVA</span>
        </span>
      </div>
      <p className="-mt-1 text-right text-[11px] tabular-nums text-[var(--bo-text-faint)]">
        Com IVA: {eur(noMoloni)}
      </p>
      <div className="flex">
        <button
          type="button"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
          className={`alvo-toque text-[11px] text-[var(--bo-text-muted)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
        >
          {aberto ? "Esconder os valores" : "Ver os valores"}
        </button>
      </div>
      {aberto && (
        <PassarAMao
          fase="total"
          partes={partes}
          pct={pct}
          vatRate={f.vatRate}
          cliente={cliente}
          nif={nif}
          podeMarcar={false}
          aMarcar={false}
          bloqueado={false}
          aoMarcar={() => {}}
        />
      )}
    </div>
  );
}

/**
 * A fatura pronta a passar ao Moloni à mão, pela ordem em que lá se escreve: o
 * cliente (pelo NIF), e depois cada artigo pelo código, com o valor sem IVA.
 * Cada valor tem o seu «Copiar» — cola-se no Moloni sem apagar nada.
 */
export function PassarAMao({
  fase,
  partes,
  pct,
  vatRate,
  cliente,
  nif,
  podeMarcar,
  aMarcar,
  bloqueado,
  aoMarcar,
}: {
  fase: ParteDaFatura;
  partes: ParcelaDoArtigo[];
  pct: number;
  vatRate: number;
  cliente?: string;
  nif?: string;
  podeMarcar: boolean;
  aMarcar: boolean;
  bloqueado: boolean;
  aoMarcar: () => void;
}) {
  const nifLimpo = (nif ?? "").replace(/\s/g, "");
  const nome = (cliente ?? "").trim();
  const total = Math.round(partes.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-[var(--bo-hairline)] rounded-lg border border-[var(--bo-hairline)] bg-[var(--bo-surface)]">
        <li className="flex flex-col gap-1 px-2.5 py-2">
          <span className="text-[11px] text-[var(--bo-text-muted)]">Cliente</span>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-xs leading-snug text-[var(--bo-text)]">
              {nome || "Sem nome no pedido"}
              <span className="block text-[11px] tabular-nums text-[var(--bo-text-faint)]">
                {nifLimpo ? `NIF ${nifLimpo}` : "Sem NIF no pedido — consumidor final"}
              </span>
            </span>
            {nifLimpo && <BotaoCopiar texto={nifLimpo} rotulo={`Copiar o NIF ${nifLimpo}`} />}
          </div>
        </li>
        {partes.map((p) => (
          <li key={p.artigo} className="flex flex-col gap-1 px-2.5 py-2">
            <span className="text-xs leading-snug text-[var(--bo-text)]">
              <span className="mr-1.5 text-[11px] font-medium tabular-nums text-[var(--bo-tinta-72)]">
                {refDoArtigo(p.artigo)}
              </span>
              {p.nome}
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tabular-nums text-[var(--bo-text)]">
                {eur(p.valor)}
                <span className="ml-1 text-[11px] font-normal text-[var(--bo-text-faint)]">
                  sem IVA
                </span>
              </span>
              <BotaoCopiar
                texto={valorParaColar(p.valor)}
                rotulo={`Copiar o valor de ${p.nome}, ${eur(p.valor)}`}
              />
            </div>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-2 px-2.5 py-2 text-xs">
          <span className="text-[var(--bo-text-muted)]">
            Total sem IVA · IVA {Math.round(vatRate * 100)}%
          </span>
          <span className="font-semibold tabular-nums text-[var(--bo-text)]">{eur(total)}</span>
        </li>
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {/* Quem passa as faturas ao Moloni é outra pessoa (6/11 — «o marido
            da Catarina»): o mesmo texto do «Copiar tudo» vai já escrito para o
            WhatsApp, e ela escolhe lá a quem o manda. */}
        <BotaoWhatsApp
          texto={textoDaFatura(partes, fase, pct, vatRate, { nome, nif: nifLimpo })}
          rotulo="Enviar por WhatsApp"
        />
        <BotaoCopiar
          texto={textoDaFatura(partes, fase, pct, vatRate, { nome, nif: nifLimpo })}
          rotulo={`Copiar tudo: ${rotuloDaParte(fase, pct)}`}
          grande
        >
          Copiar tudo
        </BotaoCopiar>
        {podeMarcar && (
          <Button size="sm" onClick={aoMarcar} disabled={bloqueado}>
            {aMarcar ? "A registar…" : "Já está no Moloni"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * «Copiar», que diz «Copiado» com o visto durante um instante — a confirmação
 * fica no sítio onde se tocou, e não num aviso ao fundo do ecrã.
 */
function BotaoCopiar({
  texto,
  rotulo,
  grande = false,
  children = "Copiar",
}: {
  texto: string;
  rotulo: string;
  grande?: boolean;
  children?: React.ReactNode;
}) {
  const { toast } = useToast();
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(false), 1600);
    return () => window.clearTimeout(t);
  }, [copiado]);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      toast("Não deu para copiar. Seleciona o texto e copia à mão.", "error");
    }
  }
  if (grande) {
    return (
      <Button size="sm" variant="secondary" onClick={() => void copiar()} aria-label={rotulo}>
        {copiado ? "Copiado" : children}
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void copiar()}
      aria-label={rotulo}
      className={`alvo-toque inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--bo-hairline)] px-2 py-1 text-[11px] font-medium ${
        copiado ? "text-[var(--bo-accent)]" : "text-[var(--bo-text-muted)]"
      } ${ESTADO} ${PRESSAO}`}
    >
      {copiado ? <IconeVisto /> : <IconeCopiar />}
      <span aria-live="polite">{copiado ? "Copiado" : children}</span>
    </button>
  );
}

export function IconeVisto() {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconeCopiar() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
