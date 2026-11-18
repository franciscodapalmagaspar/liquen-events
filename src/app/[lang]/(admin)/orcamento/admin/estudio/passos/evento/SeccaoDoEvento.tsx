"use client";

import type { ActionDispatch, Dispatch, SetStateAction } from "react";
import type { StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import type { Quote } from "@/lib/orcamento/types";
import type { CampoAMudar } from "@/lib/proposal-copy";
import { SUGESTOES_DE_TIPO } from "@/lib/proposal-evento";
import AvisoDataOcupada from "../../../AvisoDataOcupada";
import NotasInternas from "../../../NotasInternas";
import { Section } from "../../formulario/Section";
import type { Step } from "../../tipos";
import { AvisoDoCasamento } from "./AvisoDoCasamento";
import { casamentoPorConfirmar } from "./casamento-por-confirmar";
import { QuemQuandoOnde } from "./QuemQuandoOnde";
import { TituloInterno } from "./TituloInterno";

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
      {casamentoPorConfirmar(doc, quote, casamentoConfirmado) && (
        <AvisoDoCasamento
          chaveDoCasamentoConfirmado={chaveDoCasamentoConfirmado}
          confirmado={confirmado}
          doc={doc}
          patch={patch}
          quote={quote}
          setCasamentoConfirmado={setCasamentoConfirmado}
        />
      )}
      <QuemQuandoOnde
        confirmado={confirmado}
        doc={doc}
        isDeco={isDeco}
        patch={patch}
        realce={realce}
      />
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
      <TituloInterno
        doc={doc}
        patch={patch}
        refEdited={refEdited}
        setDoc={setDoc}
        setRefEdited={setRefEdited}
      />

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
