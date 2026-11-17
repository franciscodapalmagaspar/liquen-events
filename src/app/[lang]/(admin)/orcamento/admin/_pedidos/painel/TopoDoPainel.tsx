"use client";

import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { rolarAteVer } from "@/lib/motion/rolar";
import { faltaODesfecho } from "@/lib/orcamento/desfecho";
import { type Quote } from "@/lib/orcamento/types";
import LifecycleStepper, { deriveRequestLifecycle } from "../../LifecycleStepper";
import PainelGeracaoAoGanhar from "../../PainelGeracaoAoGanhar";
import PerguntaDeDesfecho from "../../PerguntaDeDesfecho";
import PropostasDoPedido from "../../PropostasDoPedido";
import { propostaDaFaseDoPedido, type PropostaLeve } from "../../percentagem-do-sinal";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { detailNextAction, type DetailTab } from "../separadores-do-painel";
import { type EdicaoDoPedido } from "../useEdicaoDoPedido";

/** O topo do painel: o ciclo de vida, o «já responderam?», o que nasce com o
 *  «Ganho», a próxima acção, e as propostas que seguiram. (Saiu do painel na
 *  fase 7 da estrutura do código, tal e qual.) */
/** Onde o topo leva: os separadores, as gavetas do painel, e o que está marcado. */
export interface MarcasDoTopo {
  abrirDetailTab: (tab: DetailTab) => void;
  gestaoRef: RefObject<HTMLDivElement | null>;
  toolsRef: RefObject<HTMLDivElement | null>;
  marcadoNoPainel: string | null;
  setMarcadoNoPainel: Dispatch<SetStateAction<string | null>>;
}

export interface TopoDoPainelProps {
  edicao: EdicaoDoPedido;
  userName: string;
  selected: Quote;
  propostasLeves: PropostaLeve[] | undefined;
  marcarDesfecho: (actualizado: Quote) => void;
  recarregarPedido: (id: string) => Promise<void>;
  marcas: MarcasDoTopo;
}

export function TopoDoPainel({
  edicao,
  userName,
  selected,
  propostasLeves,
  marcarDesfecho,
  recarregarPedido,
  marcas,
}: TopoDoPainelProps) {
  const { abrirDetailTab, gestaoRef, toolsRef, marcadoNoPainel, setMarcadoNoPainel } = marcas;
  const { setEditStatus } = edicao;
  return (
    <>
      {/* Ciclo de vida — em que fase está o pedido, num relance. */}
      <LifecycleStepper
        quote={selected}
        proposta={propostaDaFaseDoPedido(propostasLeves, selected.id)}
      />

      {/* ── «JÁ RESPONDERAM?», TAMBÉM AQUI ─────────────────
        O mesmo gesto do cartão da lista, no sítio onde ela
        está quando abre um pedido para lhe telefonar. Está em
        cima, antes de tudo o resto, porque é a única coisa que
        falta para os números serem verdade — e não em baixo,
        escondido no selector de estado do formulário de gestão
        (que continua a existir, e é por onde se CORRIGE um
        desfecho já marcado).

        `marcadoNoPainel` faz aqui o que o `marcadoAqui` faz no
        cartão: segura a moldura no instante em que o pedido
        deixa de ter proposta enviada, para o recibo e o campo
        opcional do motivo não desaparecerem ao nascer. */}
      {(faltaODesfecho(selected) || marcadoNoPainel === selected.id) && (
        <PerguntaDeDesfecho
          key={`desfecho-${selected.id}`}
          quote={selected}
          quem={userName}
          variante="painel"
          onGravado={(actualizado) => {
            setMarcadoNoPainel(actualizado.id);
            marcarDesfecho(actualizado);
          }}
        />
      )}

      {/* ── O QUE NASCE COM O «GANHO» ────────────────────
        Marcar «Ganho» semeia sozinho DUAS das quatro peças —
        o plano de montagem e a checklist genérica. As outras
        duas, a lista de MATERIAL e as DATAS-CHAVE no
        calendário, mais as linhas de SINAL e SALDO, só saem
        de `POST /api/orcamento/[id]` com `{acao:"gerar"}`, e
        o único ecrã que o pedia não estava montado em lado
        nenhum — o próprio ficheiro admite-o em comentário.

        Resultado: por cada casamento ganho, ela refazia à
        mão a lista de material, metia as datas-chave uma a
        uma e criava as linhas de sinal e saldo. O Dossier
        chegava a dizer «Registar o sinal (30%)» a apontar
        para um painel de Pagamentos vazio.

        O painel só se desenha a si próprio quando o pedido
        está `aceite` (é o que ele faz na primeira linha), por
        isso montá-lo aqui não acrescenta ruído a mais nenhum
        estado. Fica ao lado da pergunta do desfecho, que é
        onde o «Ganho» acabou de ser dado. */}
      <PainelGeracaoAoGanhar
        key={`geracao-${selected.id}`}
        quote={selected}
        onGerado={() => {
          // O plano de montagem e os pagamentos vivem no
          // PRÓPRIO pedido: sem esta releitura, o painel de
          // Pagamentos ao lado continuava vazio até ela
          // fechar e reabrir a ficha.
          void recarregarPedido(selected.id);
        }}
      />

      {/* Próxima ação — o único passo seguinte, em destaque. Abre a
        ferramenta certa dentro da área avançada. */}
      {(() => {
        const daFase = propostaDaFaseDoPedido(propostasLeves, selected.id);
        const na = detailNextAction(selected, daFase);
        const reopen = deriveRequestLifecycle(selected, daFase).perdido;
        return (
          <div>
            <button
              type="button"
              onClick={() => {
                if (reopen) setEditStatus("em_revisao");
                if (na.tab === "gestao") {
                  // O próximo passo é uma edição no formulário —
                  // levar o utilizador até lá.
                  rolarAteVer(gestaoRef.current, { block: "start" });
                } else {
                  abrirDetailTab(na.tab);
                  rolarAteVer(toolsRef.current, { block: "start" });
                }
              }}
              className={`flex w-full items-center gap-3 rounded-full bg-sage-600 px-5 py-4 text-left text-white ${ESTADO} ${PRESSAO} hover:bg-[var(--bo-accent-hover)]`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] uppercase tracking-[0.2em] text-white/60">
                  Próxima ação
                </span>
                <span className="mt-0.5 block text-sm font-semibold">{na.label}</span>
                <span className="mt-0.5 block text-xs text-white/70">{na.hint}</span>
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 text-white/80"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        );
      })()}

      {/* ── As propostas que seguiram — o PDF, o link do casal e o
        email, aqui no pedido. Sem nenhuma, não aparece. ── */}
      <PropostasDoPedido key={selected.id} quoteId={selected.id} />
    </>
  );
}
