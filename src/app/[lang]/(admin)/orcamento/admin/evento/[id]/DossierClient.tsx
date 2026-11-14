"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { rolarAteVer } from "@/lib/motion/rolar";
import type { Quote, ActivityEntry } from "@/lib/orcamento/types";
import {
  faseDoPedido,
  computeEventMetrics,
  nextAction,
  type DossierData,
} from "@/lib/orcamento/dossier";
import DossierHeader from "./DossierHeader";
import MetricStrip from "./MetricStrip";
import DossierAside from "./DossierAside";
import FinanceZone from "./FinanceZone";
import ProductionZone from "./ProductionZone";
import CommsZone from "./CommsZone";
import { ESTADO, PRESSAO } from "../../ui/movimento";

/**
 * DossierClient — o cockpit de um evento. Guarda um único estado `quote`,
 * inicializado a partir das props do servidor, e passa `quote` + um callback a
 * cada ferramenta reutilizada exatamente como o drawer da administração. As
 * ferramentas fazem o seu próprio PATCH a `/api/orcamento/[id]`; o callback
 * espelha a alteração no estado local (espelho otimista) para o cabeçalho, as
 * métricas e o stepper recalcularem ao vivo.
 *
 * Nenhuma importação de store server-only atravessa esta fronteira: proposta e
 * contrato chegam já reduzidos a dados serializáveis em `data`.
 */
interface Props {
  data: DossierData;
  lang: Locale;
  userName: string;
}

export default function DossierClient({ data, lang, userName }: Props) {
  const [quote, setQuote] = useState<Quote>(data.quote);

  // Superfície de ferramenta de página inteira: esconder nav pública + grão,
  // tal como a administração faz.
  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  // Estado vivo: a proposta/contrato não mudam por estas ferramentas (só a
  // `quote`), por isso reconstruímos o DossierData com a quote atual.
  const live: DossierData = useMemo(() => ({ ...data, quote }), [data, quote]);

  // A MESMA função que a lista (`LifecycleStepper`) usa, com a mesma proposta
  // que conta e o mesmo total a pagar: as duas nunca dão fases diferentes.
  const stage = useMemo(() => faseDoPedido(live.quote, live.proposal, live.contract), [live]);
  const metrics = useMemo(() => computeEventMetrics(live), [live]);
  const next = useMemo(() => nextAction(stage, live), [stage, live]);

  // Espelho otimista — as ferramentas já persistiram; aqui só atualizamos o
  // estado local para tudo o que deriva da quote recalcular.
  const onQuoteChange = useCallback((patch: Partial<Quote>) => {
    setQuote((prev) => ({ ...prev, ...patch }));
  }, []);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ACRESCENTAR AO REGISTO, E NÃO REESCREVÊ-LO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Isto gravava o registo INTEIRO — o que estava neste ecrã mais a linha nova.
   * E esta página é desenhada no servidor: o `quote` que ela tem é o retrato do
   * momento em que foi aberta, e nunca revalida.
   *
   * O resultado: abre-se o dossier de manhã, deixa-se o separador aberto, e ao
   * fim da tarde regista-se uma chamada. O que se grava é o registo DE MANHÃ
   * mais essa linha — e tudo o que qualquer outra ferramenta escreveu pelo meio
   * (a proposta que seguiu, as mudanças de estado, os pagamentos) desaparece.
   * Sem erro nenhum, e só se dá por isso muito depois.
   *
   * O servidor já tinha o caminho seguro — `activityLogAppend`, que junta ao
   * registo FRESCO — e a gaveta do back office já o usava, com o comentário a
   * explicar porquê. Este ecrã e o Quadro eram os dois que faltavam.
   *
   * ── E UMA RECUSA NÃO PODE PASSAR POR REGISTADA ────────────────────────────
   *
   * O `catch` estava vazio e o `if (res.ok)` não tinha o outro ramo: a linha
   * ficava no ecrã, o formulário do registo fechava-se e limpava-se, e nada
   * dizia que aquilo não existia em lado nenhum. Uma sessão que expira a meio
   * da manhã — 401, o caso de todos os dias — dava exactamente a imagem de uma
   * chamada registada, e só ao recarregar a página, muito depois, é que ela
   * desaparecia.
   *
   * O que fica: a linha continua à vista (é o único sítio de onde o texto se
   * pode voltar a copiar, porque o formulário já se fechou), com um aviso que a
   * NOMEIA e um gesto para voltar a tentar. É a mesma regra do resto da casa —
   * «guardado» é uma palavra que só o servidor autoriza.
   */
  const [recusadas, setRecusadas] = useState<ActivityEntry[]>([]);
  const [aTentar, setATentar] = useState(false);

  const gravarEntradas = useCallback(
    async (entries: ActivityEntry[]): Promise<boolean> => {
      try {
        const res = await fetch(`/api/orcamento/${quote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityLogAppend: entries }),
        });
        // Um 401 responde com um objecto de erro, não com o pedido: aceitá-lo
        // aqui era pôr `{ error: … }` no lugar da quote e levar o ecrã atrás.
        if (!res.ok) return false;
        const updated: Quote = await res.json();
        setQuote(updated);
        return true;
      } catch {
        return false;
      }
    },
    [quote.id],
  );

  const appendActivity = useCallback(
    async (entry: ActivityEntry) => {
      setQuote((prev) => ({ ...prev, activityLog: [...(prev.activityLog ?? []), entry] }));
      if (!(await gravarEntradas([entry]))) setRecusadas((prev) => [...prev, entry]);
      /**
       * SEMPRE `true`, e é uma afirmação sobre este ecrã e não sobre a rede.
       *
       * O `ActivityLog` usa esta resposta para decidir se limpa a caixa. Aqui a
       * entrada nunca se perde: ou ficou gravada, ou está na lista das
       * `recusadas`, à vista e com um «tentar de novo» ao lado. Devolver
       * `false` deixava o texto na caixa E a entrada na lista — a mesma nota
       * duas vezes no ecrã.
       *
       * No painel do pedido (`AdminClient`) não há esta rede de apanha, e por
       * isso lá a resposta é a verdade sobre a gravação.
       */
      return true;
    },
    [gravarEntradas],
  );

  const tentarGravarDeNovo = useCallback(async () => {
    if (recusadas.length === 0 || aTentar) return;
    setATentar(true);
    try {
      // Todas de uma vez: a rota junta o que lhe mandarem ao registo FRESCO, e
      // uma por uma seriam várias leituras do mesmo registo a competir.
      if (await gravarEntradas(recusadas)) setRecusadas([]);
    } finally {
      setATentar(false);
    }
  }, [recusadas, aTentar, gravarEntradas]);

  const scrollTo = useCallback((id: string) => {
    // O ajudante partilhado, e não um `behavior` escrito à mão: a leitura da
    // preferência de movimento vive num sítio só (`lib/motion/rolar.ts`), e há
    // um teste a varrer o back office atrás de quem a esqueça.
    rolarAteVer(document.getElementById(id), { block: "start" });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bo-chao)] flex flex-col">
      <DossierHeader
        data={live}
        stage={stage}
        metrics={metrics}
        next={next}
        lang={lang}
        onScrollTo={scrollTo}
      />

      {/* O respiro e os intervalos passam a ler a escala do espaço: 12 px de
          respiro e 20 de intervalo no telemóvel, 24 e 28 a partir de 640. Eram
          24 e 24 fixos — números desenhados num monitor e servidos tal e qual a
          um ecrã de 667 px de altura. */}
      <main className="flex-1 px-4 sm:px-6 lg:px-10 py-[var(--bo-p-vista)] flex flex-col gap-[var(--bo-gap-vista)]">
        {recusadas.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--bo-perigo)]/40 bg-[var(--bo-perigo)]/[0.07] px-4 py-3"
          >
            <p className="text-[var(--bo-perigo)] text-xs font-medium leading-snug">
              {recusadas.length === 1
                ? "Esta entrada do registo não ficou guardada no servidor:"
                : `Estas ${recusadas.length} entradas do registo não ficaram guardadas no servidor:`}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {recusadas.map((e) => (
                <li key={e.id} className="text-[var(--bo-text-muted)] text-[11px] leading-snug">
                  «{e.summary}»
                </li>
              ))}
            </ul>
            <p className="text-foreground/45 text-[11px] mt-1.5">
              Estão só neste ecrã e desaparecem se recarregares a página. Se a sessão tiver
              expirado, volta a entrar antes de tentar.
            </p>
            <button
              type="button"
              onClick={tentarGravarDeNovo}
              disabled={aTentar}
              className={`alvo-toque mt-2.5 rounded-lg border border-[var(--bo-perigo)]/40 px-3 py-1.5 text-[11px] font-medium text-[var(--bo-perigo)] hover:bg-[var(--bo-perigo)]/10 disabled:opacity-45 ${ESTADO} ${PRESSAO}`}
            >
              {aTentar ? "A tentar…" : "Tentar de novo"}
            </button>
          </div>
        )}

        <MetricStrip metrics={metrics} />

        {/* ── A COLUNA LATERAL COMEÇA AOS 1024, E NÃO AOS 1280 ───────────────
            Era `xl:` (1280). Entre 1024 e 1280 — que é o portátil dela — a
            grelha tinha uma coluna só e o `DossierAside` (contacto, factos do
            evento, registo de atividade) ia parar ao FIM da página, depois das
            três zonas inteiras. Havia espaço para ele desde os 1024: 1024 − 80
            de margens − 320 da coluna − 20 de intervalo deixam 604 px à coluna
            principal, que é mais do que ela tem hoje a 1024 com o painel em
            baixo. `md:`/`xl:`/`2xl:` não existem neste back office (ver
            `ui/adaptativo.ts`), e este ficheiro era um dos quatro que faltavam
            — o tecto dele saiu do `Cortes.contrato.test.ts`. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-[var(--bo-gap-vista)] items-start">
          {/* Coluna principal */}
          <div className="flex flex-col gap-[var(--bo-gap-vista)] min-w-0">
            <FinanceZone quote={quote} onQuoteChange={onQuoteChange} />
            <ProductionZone
              quote={quote}
              userName={userName}
              onQuoteChange={onQuoteChange}
              doc={data.proposal?.doc ?? null}
            />
            <CommsZone
              quote={quote}
              userName={userName}
              onQuoteChange={onQuoteChange}
              onAddEntry={appendActivity}
            />
          </div>

          {/* Coluna lateral (fixa em ecrãs largos) */}
          {/* `top-40` (160 px) é a altura do cabeçalho JÁ ENCOLHIDO — e quando
              esta coluna se cola já se desceu, portanto é a altura certa. */}
          <aside className="lg:sticky lg:top-40 min-w-0">
            <DossierAside quote={quote} actor={userName} onAddEntry={appendActivity} />
          </aside>
        </div>
      </main>
    </div>
  );
}
