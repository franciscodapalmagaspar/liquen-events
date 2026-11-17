"use client";

import type { ActionDispatch, Dispatch, SetStateAction } from "react";
import { buildRef, type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import type { Quote } from "@/lib/orcamento/types";
import type { CampoAMudar } from "@/lib/proposal-copy";
import {
  eCasamento,
  pedidoECasamento,
  SUGESTOES_DE_TIPO,
  tipoDoEventoDoPedido,
} from "@/lib/proposal-evento";
import AvisoDataOcupada from "../../../AvisoDataOcupada";
import NotasInternas from "../../../NotasInternas";
import { Button, Field } from "../../../ui";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { ADD_BTN } from "../../classes";
import { Section } from "../../formulario/Section";
import type { Step } from "../../tipos";

interface PropsSeccaoDoEvento {
  casamentoConfirmado: boolean;
  chaveDoCasamentoConfirmado: string;
  confirmado: (campo: CampoAMudar) => void;
  doc: StudioDoc;
  isDeco: boolean;
  patch: (p: Partial<StudioDoc>) => void;
  pedidoComADataDoDoc: Quote | null;
  quote: Quote;
  quotes: Quote[] | undefined;
  realce: (campo: CampoAMudar) => string | undefined;
  refEdited: boolean;
  setCasamentoConfirmado: Dispatch<SetStateAction<boolean>>;
  setDoc: ActionDispatch<[u: SetStateAction<StudioDoc>]>;
  setRefEdited: Dispatch<SetStateAction<boolean>>;
  step: Step;
  sugestoes: { locais: string[] };
}

/**
 * A secção «Evento» do passo 1: quem, quando, onde, e a referência da proposta.
 * Saiu do `ProposalStudio` tal e qual (fase 4 de `docs/ESTRUTURA-DO-CODIGO.md`).
 * Continua sempre montada: o passo escondido só se esconde (`escondida`).
 */
export function SeccaoDoEvento({
  casamentoConfirmado,
  chaveDoCasamentoConfirmado,
  confirmado,
  doc,
  isDeco,
  patch,
  pedidoComADataDoDoc,
  quote,
  quotes,
  realce,
  refEdited,
  setCasamentoConfirmado,
  setDoc,
  setRefEdited,
  step,
  sugestoes,
}: PropsSeccaoDoEvento) {
  return (
    <Section title="Evento" id="evento" escondida={step !== "evento"}>
      {/* ── «ESTE PEDIDO NÃO PARECE UM CASAMENTO» ──────────────────
        O estúdio escrevia «Casamento» sozinho em qualquer pedido sem
        tipo — e com isso o PDF punha «Noivos» e arrumava os mood boards
        em Cerimónia e Cocktail numa proposta para um restaurante. Os
        rascunhos feitos até 13/10 ficaram com essa palavra; o aviso é o
        que os deixa corrigir com um toque, sem adivinhar. */}
      {eCasamento(doc.eventType) &&
        !pedidoECasamento(quote) &&
        !eCasamento(tipoDoEventoDoPedido(quote)) &&
        !(quote.partnerA || quote.partnerB) &&
        !casamentoConfirmado && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-3 text-sm"
          >
            <p className="font-medium">Este pedido não parece um casamento.</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--bo-text-muted)]">
              A proposta diz «{doc.eventType}», e por isso o PDF chama «Noivos» ao cliente e arruma
              os mood boards em Cerimónia, Cocktail e Jantar.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  confirmado("eventType");
                  patch({ eventType: tipoDoEventoDoPedido(quote) });
                  document
                    .querySelector<HTMLInputElement>('input[data-campo="eventType"]')
                    ?.focus();
                }}
              >
                {tipoDoEventoDoPedido(quote)
                  ? `Mudar para «${tipoDoEventoDoPedido(quote)}»`
                  : "Escrever o tipo de evento"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCasamentoConfirmado(true);
                  try {
                    localStorage.setItem(chaveDoCasamentoConfirmado, "1");
                  } catch {
                    /* sem localStorage: cala-se só até reabrir */
                  }
                }}
              >
                É mesmo um casamento
              </Button>
            </div>
          </div>
        )}
      {/* ── QUEM, QUANDO, ONDE (Fase 4 do redesenho, 10/11) ──────────
        Eram oito caixas numa grelha só, pela ordem em que foram
        acrescentadas. Agora três grupos com nome — os mesmos campos,
        as mesmas chaves (`data-campo`), as mesmas marcas de «veio de
        fora» (`realce`). Só a arrumação muda. */}
      <div className="flex flex-col gap-5">
        <fieldset className="min-w-0">
          <legend className="bo-eyebrow mb-2">Quem</legend>
          <div className="grid grid-cols-1 gap-4 @min-[26rem]:grid-cols-2">
            <Field
              label="Clientes"
              value={doc.clientNames ?? ""}
              onChange={(e) => {
                confirmado("clientNames");
                patch({ clientNames: e.target.value });
              }}
              containerClassName={realce("clientNames")}
              data-campo="clientNames"
              placeholder="Maria & Zé"
            />
            <Field
              label="Tipo de evento"
              value={doc.eventType ?? ""}
              onChange={(e) => {
                confirmado("eventType");
                patch({ eventType: e.target.value });
              }}
              containerClassName={realce("eventType")}
              data-campo="eventType"
              list="sug-tipos-de-evento"
              placeholder="Casamento, festa, jantar…"
              hint={
                eCasamento(doc.eventType)
                  ? "Casamento: o PDF arruma os mood boards em Cerimónia, Cocktail, Jantar e Complementos."
                  : "O PDF diz «Cliente», e cada mood board abre o seu capítulo, com o título que lhe deram."
              }
            />
            <Field
              label="Convidados"
              value={doc.guests ?? ""}
              onChange={(e) => {
                confirmado("guests");
                patch({ guests: e.target.value });
              }}
              containerClassName={realce("guests")}
              data-campo="guests"
              placeholder="150 pax"
            />
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="bo-eyebrow mb-2">Quando</legend>
          <div className="grid grid-cols-1 gap-4 @min-[26rem]:grid-cols-2">
            <Field
              label="Data"
              value={doc.eventDate ?? ""}
              onChange={(e) => {
                confirmado("eventDate");
                patch({ eventDate: e.target.value });
              }}
              containerClassName={realce("eventDate")}
              data-campo="eventDate"
              placeholder="12 de setembro de 2026"
            />
            {isDeco && (
              <Field
                label="Hora"
                value={doc.time ?? ""}
                onChange={(e) => {
                  confirmado("time");
                  patch({ time: e.target.value });
                }}
                containerClassName={realce("time")}
                data-campo="time"
                placeholder="A definir"
              />
            )}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="bo-eyebrow mb-2">Onde</legend>
          <div className="grid grid-cols-1 gap-4 @min-[26rem]:grid-cols-2">
            <Field
              label="Local"
              list="sug-locais"
              value={doc.location ?? ""}
              onChange={(e) => {
                confirmado("location");
                patch({ location: e.target.value });
              }}
              containerClassName={realce("location")}
              data-campo="location"
              placeholder="Monte da Oliveirinha"
            />
            {/* Só num casamento — ou se já tiver texto, para não o
              esconder de quem o escreveu. */}
            {isDeco && (eCasamento(doc.eventType) || (doc.ceremony ?? "").trim() !== "") && (
              <Field
                label="Cerimónia"
                value={doc.ceremony ?? ""}
                onChange={(e) => {
                  confirmado("ceremony");
                  patch({ ceremony: e.target.value });
                }}
                containerClassName={realce("ceremony")}
                data-campo="ceremony"
                placeholder="Civil, simbólica"
              />
            )}
          </div>
        </fieldset>
      </div>
      {/* A Hora e a Cerimónia têm o anel de «veio de fora» (`realce`)
        como os outros: a cerimónia vem do formulário do casal e a hora,
        quando vem, de uma proposta copiada — texto de outra pessoa. */}

      {/* O que já está marcado à volta da data que ESTÁ ESCRITA AQUI —
        ver `pedidoComADataDoDoc`. O mesmo cartão do ecrã de escolher o
        cliente, com a mesma leitura de distância por estrada. */}
      {pedidoComADataDoDoc && (
        <div className="mt-4">
          <AvisoDataOcupada
            quote={pedidoComADataDoDoc}
            quotes={quotes ?? []}
            motivo="Não impede nada — a decisão é tua. Esta é a data que escreveste na proposta, e não a do pedido."
          />
        </div>
      )}

      {/* As sugestões. `datalist` e não um `select`: ela TEM de poder
        escrever um espaço novo — a lista ajuda, não fecha a porta. */}
      <datalist id="sug-tipos-de-evento">
        {SUGESTOES_DE_TIPO.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="sug-locais">
        {sugestoes.locais.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {/* Reference (advanced) */}
      <div className="mt-4">
        {refEdited && (
          <div className="mb-1.5 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setRefEdited(false);
                setDoc((d) => ({ ...d, ref: buildRef(d) }));
              }}
              className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
            >
              ↺ Automática
            </button>
          </div>
        )}
        <Field
          label="Título interno (opcional)"
          value={doc.ref ?? ""}
          onChange={(e) => {
            setRefEdited(true);
            patch({ ref: e.target.value });
          }}
          data-campo="ref"
          hint="sobretudo para uso interno; aparece apenas em letra pequena no topo de cada página da proposta."
        />
      </div>

      {/* ── O QUE SE SABE E NÃO SE ESCREVE AO CLIENTE ────────────────
        «Quer ficar por baixo dos 8.000 €.» «Quem decide é a mãe.»
        Frases que hoje vivem na cabeça de quem escreveu a proposta e
        que se perdem quando é outra pessoa a pegar nela — ou quando são
        seis meses depois.

        Vive na secção do EVENTO e não ao pé do dinheiro: é sobre o
        negócio inteiro, e é a primeira secção — a nota tem de estar
        onde se dá com ela sem a procurar.

        O aspecto de papel amarelo é a garantia de que não se confunde
        com um campo que sai na proposta; o teste
        (`notas-internas-ficam-em-casa.test.ts`) garante que não sai
        mesmo. */}
      <NotasInternas
        valor={doc.notasInternas ?? ""}
        onChange={(v) => patch({ notasInternas: v })}
      />
    </Section>
  );
}
