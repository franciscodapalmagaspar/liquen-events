"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { eur } from "@/lib/money";
import { depositPercentOf } from "@/lib/proposal-doc";
import type { VersaoEscolhida } from "@/lib/orcamento/versoes-da-proposta";
import {
  faturacaoPorArtigo,
  parcelasDaFatura,
  refDoArtigo,
  textoDaFatura,
  valorParaColar,
  type ArtigoId,
  type Faturacao,
  type ParcelaDoArtigo,
  type DocParaFaturar,
  type FaseDaFatura,
} from "@/lib/orcamento/artigos-de-faturacao";
import { RepartoPorArtigo } from "./RepartoPorArtigo";
import { useDinheiroAceite } from "./percentagem-do-sinal";
import { useToast } from "./Toast";
import { Button } from "./ui/Button";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FATURAÇÃO NO MOLONI — REPARTIR, E DOIS RASCUNHOS, UM TOQUE CADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (5/11): «isso passa já tudo para o Moloni, mas não o faz. Apenas fica
 * como rascunho. Depois é só chegarmos lá e aceitarmos e verificarmos se está
 * tudo bem.» E: «super simples, que é para não ser difícil».
 *
 * Por isso o cartão é: o total repartido pelos artigos, e dois cartões — Sinal
 * e Saldo — com o valor e UM botão cada. O botão cria o rascunho no Moloni;
 * depois diz «No Moloni, por confirmar».
 *
 * Sem a ligação (ela acha que o plano não tem a API), o cartão prepara a fatura
 * para passar À MÃO: o cliente e o NIF, e cada artigo com o código do Moloni e
 * o valor, cada um com o seu «Copiar». No fim, «Já está no Moloni» regista-o
 * — para ninguém faturar a mesma fase duas vezes.
 *
 * Só aparece a quem tem proposta aceite, e só pergunta ao servidor quando
 * aparece (regra 7: nada de polling).
 */

interface Rascunho {
  documentId?: number;
  em: string;
  valorSemIva?: number;
  por?: string;
  manual?: boolean;
}

interface Dados {
  configurado: boolean;
  faturas: Partial<Record<FaseDaFatura, Rascunho>>;
  proposta: {
    id: string;
    versaoEscolhida: VersaoEscolhida | null;
    doc: DocParaFaturar & { depositPercent?: number };
  } | null;
}

function dia(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(+d) ? "" : d.toLocaleDateString("pt-PT", { day: "numeric", month: "long" });
}

export default function FaturacaoMoloni({
  quoteId,
  quem,
  cliente,
  nif,
}: {
  quoteId: string;
  quem?: string;
  /** O nome que vai na fatura: a empresa, se houver, senão o nome. */
  cliente?: string;
  nif?: string;
}) {
  // A lista leve já diz se há proposta aceite: sem ela não se pergunta nada.
  const aceite = useDinheiroAceite(quoteId);
  const temAceite = aceite !== null;
  const { toast } = useToast();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [aCriar, setACriar] = useState<FaseDaFatura | null>(null);
  const [problema, setProblema] = useState<{ fase: FaseDaFatura; texto: string } | null>(null);

  useEffect(() => {
    if (!temAceite) return;
    const ctl = new AbortController();
    fetch(`/api/orcamento/${encodeURIComponent(quoteId)}/moloni`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Dados) => setDados(j))
      .catch(() => {
        if (!ctl.signal.aborted) setErro("Não foi possível ler a faturação agora.");
      });
    return () => ctl.abort();
  }, [quoteId, temAceite]);

  const doc = dados?.proposta?.doc ?? null;
  const versao = dados?.proposta?.versaoEscolhida ?? undefined;
  const pct = doc ? depositPercentOf(doc) : 30;
  const f = useMemo(() => (doc ? faturacaoPorArtigo(doc, versao) : null), [doc, versao]);
  const jaLaEsta = (r?: Rascunho) => !!(r?.documentId || r?.manual);
  const jaHaRascunho = jaLaEsta(dados?.faturas?.sinal) || jaLaEsta(dados?.faturas?.saldo);

  const repartir = useCallback(
    async (reparto: Partial<Record<ArtigoId, number>>) => {
      if (!dados?.proposta) return;
      const antes = dados;
      // À vista já; se o servidor recusar, volta atrás e diz porquê.
      setDados({
        ...dados,
        proposta: { ...dados.proposta, doc: { ...dados.proposta.doc, repartoPorArtigo: reparto } },
      });
      setAGravar(true);
      try {
        const res = await fetch(`/api/propostas/${encodeURIComponent(dados.proposta.id)}/reparto`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reparto }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error || "Não foi possível gravar a repartição.");
        if (j?.doc)
          setDados((d) => (d?.proposta ? { ...d, proposta: { ...d.proposta, doc: j.doc } } : d));
      } catch (e) {
        setDados(antes);
        toast(e instanceof Error ? e.message : "Não foi possível gravar a repartição.", "error");
      } finally {
        setAGravar(false);
      }
    },
    [dados, toast],
  );

  async function criar(fase: FaseDaFatura, denovo = false, manual = false) {
    if (aCriar) return;
    setACriar(fase);
    setProblema(null);
    try {
      const res = await fetch(`/api/orcamento/${encodeURIComponent(quoteId)}/moloni`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fase,
          denovo,
          ...(manual ? { manual: true } : {}),
          ...(quem ? { actor: quem } : {}),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        const texto = [j?.error, ...(Array.isArray(j?.porque) ? j.porque : [])]
          .filter(Boolean)
          .join(" ");
        setProblema({ fase, texto: texto || "O Moloni não respondeu. Tenta outra vez." });
        return;
      }
      setDados((d) =>
        d
          ? {
              ...d,
              faturas: {
                ...d.faturas,
                [fase]: manual
                  ? { em: j.em, valorSemIva: j.valorSemIva, por: quem, manual: true }
                  : { documentId: j.documentId, em: j.em, valorSemIva: j.valorSemIva, por: quem },
              },
            }
          : d,
      );
      if (manual) {
        toast(
          `${fase === "sinal" ? "Sinal" : "Saldo"} marcado como passado ao Moloni.`,
          "success",
          { rotulo: "Anular", aoTocar: () => void desmarcar(fase) },
        );
        return;
      }
      toast(
        j?.aviso ||
          `Rascunho ${fase === "sinal" ? "do sinal" : "do saldo"} criado no Moloni. Falta confirmá-lo lá.`,
        j?.aviso ? "error" : "success",
      );
    } catch {
      setProblema({ fase, texto: "Sem ligação. Verifica a internet e tenta outra vez." });
    } finally {
      setACriar(null);
    }
  }

  /** Tira a marca «passada à mão» (o «Anular» do aviso). Um rascunho da API não sai daqui. */
  async function desmarcar(fase: FaseDaFatura) {
    try {
      const res = await fetch(`/api/orcamento/${encodeURIComponent(quoteId)}/moloni`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fase, desmarcar: true, ...(quem ? { actor: quem } : {}) }),
      });
      if (!res.ok) throw new Error();
      setDados((d) => {
        if (!d) return d;
        const faturas = { ...d.faturas };
        delete faturas[fase];
        return { ...d, faturas };
      });
    } catch {
      toast("Não foi possível anular. Tenta outra vez.", "error");
    }
  }

  if (!temAceite) return null;

  return (
    <section
      aria-labelledby={`faturacao-${quoteId}`}
      className="mt-6 rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] p-[var(--bo-p-cartao)]"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id={`faturacao-${quoteId}`} className="text-sm font-medium text-[var(--bo-text)]">
          Faturação no Moloni
        </h3>
        {dados && (
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] ${
              dados.configurado ? "text-[var(--bo-accent)]" : "text-[var(--bo-text-muted)]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                dados.configurado ? "bg-sage-600" : "border border-[var(--bo-hairline-strong)]"
              }`}
            />
            {dados.configurado ? "Ligado ao Moloni" : "Moloni por ligar"}
          </span>
        )}
      </header>

      {erro && <p className="text-xs text-[var(--bo-perigo)]">{erro}</p>}
      {!dados && !erro && <p className="text-xs text-[var(--bo-text-muted)]">A carregar…</p>}
      {dados && !dados.proposta && (
        <p className="text-xs text-[var(--bo-text-muted)]">
          Este cliente ainda não tem uma proposta aceite.
        </p>
      )}

      {doc && f && (
        <RepartoPorArtigo
          doc={doc}
          versao={versao}
          pct={pct}
          aoMudar={repartir}
          bloqueado={aGravar}
        >
          {/* Só no modo à mão: com preço por linha, a repartição é a da proposta. */}
          {jaHaRascunho && f.modo === "manual" && (
            <p className="text-[11px] leading-relaxed text-[var(--bo-text-faint)]">
              Já há uma fase no Moloni: mudar a repartição agora só muda o que ainda falta faturar.
            </p>
          )}
          {f.fecha && (
            <div className="mt-1 grid grid-cols-1 gap-3 @min-[30rem]:grid-cols-2">
              {(["sinal", "saldo"] as const).map((fase) => (
                <CartaoDaFase
                  key={fase}
                  fase={fase}
                  f={f}
                  pct={pct}
                  feito={dados?.faturas?.[fase]}
                  configurado={!!dados?.configurado}
                  aCriar={aCriar}
                  problema={problema?.fase === fase ? problema.texto : null}
                  cliente={cliente}
                  nif={nif}
                  aoCriar={(denovo) => void criar(fase, denovo)}
                  aoMarcar={() => void criar(fase, false, true)}
                />
              ))}
            </div>
          )}
          {f.fecha && (
            <p className="text-[11px] leading-relaxed text-[var(--bo-text-faint)]">
              O Moloni calcula o IVA linha a linha: o total com IVA lá pode diferir 1 cêntimo.
              Confirma-o no Moloni antes de fechar.
            </p>
          )}
        </RepartoPorArtigo>
      )}
    </section>
  );
}

/**
 * Um cartão por fase (Sinal, Saldo). Quatro estados, e cada um diz o que fazer
 * a seguir com UM gesto: criar o rascunho; passar à mão; ou já está lá.
 */
function CartaoDaFase({
  fase,
  f,
  pct,
  feito,
  configurado,
  aCriar,
  problema,
  cliente,
  nif,
  aoCriar,
  aoMarcar,
}: {
  fase: FaseDaFatura;
  f: Faturacao;
  pct: number;
  feito?: Rascunho;
  configurado: boolean;
  aCriar: FaseDaFatura | null;
  problema: string | null;
  cliente?: string;
  nif?: string;
  aoCriar: (denovo: boolean) => void;
  aoMarcar: () => void;
}) {
  const partes = parcelasDaFatura(f, fase, pct);
  const valor = Math.round(partes.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  const criado = feito?.documentId ? feito : null;
  const manual = !criado && feito?.manual ? feito : null;
  // Sem a ligação, passar à mão é O caminho: abre logo. Com ela, é a segunda via.
  const [verAMao, setVerAMao] = useState(false);
  const aMaoAberto = verAMao || (!configurado && !criado && !manual);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--bo-tinta-72)]">
          {fase === "sinal" ? `Sinal ${pct}%` : `Saldo ${100 - pct}%`}
        </span>
        <span className="text-sm font-semibold tabular-nums text-[var(--bo-text)]">
          {eur(valor)}
          <span className="ml-1 text-[11px] font-normal text-[var(--bo-text-faint)]">sem IVA</span>
        </span>
      </div>

      {criado || manual ? (
        <div className="flex flex-col gap-1.5">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--bo-accent)]">
            <IconeVisto />
            {criado ? "No Moloni, por confirmar" : "Passada ao Moloni"}
          </p>
          <p className="text-[11px] text-[var(--bo-text-faint)]">
            {criado ? "Rascunho criado" : "Marcada"} a {dia((criado ?? manual)!.em)}
            {(criado ?? manual)!.por ? ` por ${(criado ?? manual)!.por}` : ""}.
          </p>
          <div className="flex flex-wrap gap-x-3">
            {criado && (
              <button
                type="button"
                disabled={aCriar !== null}
                onClick={() => {
                  if (window.confirm("Já há um rascunho desta fase no Moloni. Criar outro?"))
                    aoCriar(true);
                }}
                className={`alvo-toque text-[11px] text-[var(--bo-text-muted)] underline-offset-2 hover:underline disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
              >
                {aCriar === fase ? "A criar no Moloni…" : "Criar outro rascunho"}
              </button>
            )}
            <LigacaoAMao aberto={aMaoAberto} aoTocar={() => setVerAMao((v) => !v)}>
              {aMaoAberto ? "Esconder os valores" : "Ver os valores"}
            </LigacaoAMao>
          </div>
        </div>
      ) : configurado ? (
        <div className="flex flex-col items-start gap-1.5">
          <Button size="sm" onClick={() => aoCriar(false)} disabled={aCriar !== null}>
            {aCriar === fase ? "A criar no Moloni…" : "Criar rascunho no Moloni"}
          </Button>
          <LigacaoAMao aberto={aMaoAberto} aoTocar={() => setVerAMao((v) => !v)}>
            {aMaoAberto ? "Esconder" : "Ou passar à mão"}
          </LigacaoAMao>
        </div>
      ) : null}

      {aMaoAberto && (
        <PassarAMao
          fase={fase}
          partes={partes}
          pct={pct}
          vatRate={f.vatRate}
          cliente={cliente}
          nif={nif}
          podeMarcar={!criado && !manual}
          aMarcar={aCriar === fase}
          bloqueado={aCriar !== null}
          aoMarcar={aoMarcar}
        />
      )}

      {problema && (
        <p role="alert" className="text-xs leading-relaxed text-[var(--bo-perigo)]">
          {problema}
        </p>
      )}
    </div>
  );
}

function LigacaoAMao({
  aberto,
  aoTocar,
  children,
}: {
  aberto: boolean;
  aoTocar: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={aberto}
      onClick={aoTocar}
      className={`alvo-toque text-[11px] text-[var(--bo-text-muted)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
    >
      {children}
    </button>
  );
}

/**
 * A fatura pronta a passar ao Moloni à mão, pela ordem em que lá se escreve: o
 * cliente (pelo NIF), e depois cada artigo pelo código, com o valor sem IVA.
 * Cada valor tem o seu «Copiar» — cola-se no Moloni sem apagar nada.
 */
function PassarAMao({
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
  fase: FaseDaFatura;
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
        <BotaoCopiar
          texto={textoDaFatura(partes, fase, pct, vatRate, { nome, nif: nifLimpo })}
          rotulo={`Copiar tudo ${fase === "sinal" ? "do sinal" : "do saldo"}`}
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

function IconeVisto() {
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
