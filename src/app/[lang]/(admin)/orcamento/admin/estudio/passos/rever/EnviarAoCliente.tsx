"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { tamanhoEstimado } from "@/lib/custo-do-pdf";
import type { AmostraDeGeracao } from "@/lib/custo-do-pdf";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import type { Quote } from "@/lib/orcamento/types";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { type IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import EmailDoEnvio from "../../../EmailDoEnvio";
import Versoes from "../../../Versoes";
import { Button } from "../../../ui";
import { BotaoWhatsApp } from "../../../ui/BotaoWhatsApp";
import type { CanalDeEnvio } from "../../envio/canal-de-envio";
import { Section } from "../../formulario/Section";
import { CopiarResumo } from "../../resumo/CopiarResumo";
import type { Step } from "../../tipos";

interface PropsEnviarAoCliente {
  amostras: AmostraDeGeracao[];
  assuntoDoEmail: string;
  bytesDoPdf: number | null;
  canal: CanalDeEnvio;
  corpoDoEmail: string;
  doc: StudioDoc;
  idiomaDoPdf: IdiomaDaProposta;
  inserirParagrafoDoQueMudou: (texto: string) => void;
  passoDoEnvio: RefObject<HTMLDivElement | null>;
  patch: (p: Partial<StudioDoc>) => void;
  quote: Quote;
  restaurarVersao: (antiga: ProposalDoc) => void;
  resumoParaCopiar: string;
  sent: boolean;
  setAssuntoDoEmail: Dispatch<SetStateAction<string>>;
  setConfirmSend: Dispatch<SetStateAction<boolean>>;
  setCorpoDoEmail: Dispatch<SetStateAction<string>>;
  setModeloDoEmail: Dispatch<SetStateAction<string>>;
  setSent: Dispatch<SetStateAction<boolean>>;
  step: Step;
  totalDeFotos: number;
}

/**
 * PASSO 5 · o envio: o resumo para copiar, as versões já enviadas, o email que
 * vai sair. Sempre montado e escondido, para o salto de «Falta o email»
 * (`#seccao-envio`) ter onde cair.
 *
 * Saiu do `ProposalStudio` tal e qual (fase 4 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export function EnviarAoCliente({
  amostras,
  assuntoDoEmail,
  bytesDoPdf,
  canal,
  corpoDoEmail,
  doc,
  idiomaDoPdf,
  inserirParagrafoDoQueMudou,
  passoDoEnvio,
  patch,
  quote,
  restaurarVersao,
  resumoParaCopiar,
  sent,
  setAssuntoDoEmail,
  setConfirmSend,
  setCorpoDoEmail,
  setModeloDoEmail,
  setSent,
  step,
  totalDeFotos,
}: PropsEnviarAoCliente) {
  return (
    <div
      ref={passoDoEnvio}
      className={`scroll-mt-[var(--bo-colado-topo)] ${step === "enviar" ? "view-in" : ""}`}
      hidden={step !== "enviar"}
    >
      {sent ? (
        <Section title="Enviar ao cliente">
          {/* ── O FIM DA JORNADA MERECE SER VISTO ────────────────────────
             Depois de uma barra a encher durante dezenas de segundos numa
             quinta com 4G, a proposta dava-se por enviada num fotograma: um
             `✓` de texto aparecia, e mais nada.

             É o único momento do estúdio que pertence à banda de
             apresentação (600–1500 ms), e é o único que não tinha nada. O
             gesto já existe nesta casa e está a ser usado no ecrã que o
             CASAL vê ao pedir orçamento (`ConfirmacaoClient.tsx`): o anel
             desenha-se em 0,7 s e o traço do visto vem a seguir, em
             `stroke-dashoffset` puro, sem JavaScript e com
             `prefers-reduced-motion` já tratado no `globals.css`.

             Passa a ser o mesmo dos dois lados — ela vê o que o casal vê. */}
          <div className="bo-cena flex flex-col items-start gap-3 rounded-2xl border border-sage-600/25 bg-sage-600/[0.06] p-5">
            <p className="flex items-center gap-2 font-display text-base text-sage-600">
              <svg viewBox="0 0 52 52" className="h-5 w-5 shrink-0" fill="none" aria-hidden="true">
                <circle
                  className="confirm-ring"
                  cx="26"
                  cy="26"
                  r="24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeOpacity="0.4"
                />
                <path
                  className="confirm-check"
                  d="M15 27l7.5 7.5L38 18"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>{" "}
              {canal === "whatsapp" ? "Proposta pronta" : "Proposta enviada"}
            </p>
            {/* ── O QUE SE DIZ NO FIM DEPENDE DO QUE SE FEZ ──────────────
                «Não precisas de fazer mais nada» era verdade quando só havia
                email. Com o WhatsApp escolhido é falso — falta o gesto dela,
                e é o gesto que entrega a proposta. Uma frase que diz «está
                tudo feito» por cima de uma coisa por fazer é a maneira mais
                rápida de a proposta não chegar a ninguém. */}
            <p className="text-sm leading-relaxed text-[var(--bo-text-muted)]">
              {canal === "whatsapp"
                ? "A proposta está gerada e o link está pronto. Falta mandá-lo — é o botão aqui em baixo."
                : canal === "ambos"
                  ? `O email seguiu para ${quote.email || "o cliente"}. Falta o WhatsApp, se o quiseres mandar também.`
                  : `A proposta foi gerada e enviada para ${quote.email || "o cliente"}. Não precisas de fazer mais nada.`}
            </p>
            {/* ── QUANDO O CASAL PREFERE WHATSAPP ─────────────────────────
                A comunicação sai toda por email, e em Portugal é normal o
                casal preferir WhatsApp. É aqui, mesmo depois de enviar, que
                o link fica mais fresco — sem esperar por um segundo pedido.

                «E o mesmo quando enviamos proposta no fazer proposta.» O
                «Copiar resumo» já cá estava e obrigava-a a ir ao WhatsApp,
                abrir uma conversa e colar. O botão abre-o com a mensagem já
                escrita e a lista de contactos à espera — os mesmos dois
                passos, menos os três do meio. O copiar FICA, para quem quer
                o texto noutro sítio qualquer. */}
            <div className="flex flex-wrap items-center gap-2">
              <BotaoWhatsApp texto={resumoParaCopiar} />
              <CopiarResumo texto={resumoParaCopiar} />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSent(false);
                setConfirmSend(false);
              }}
            >
              Enviar de novo / nova revisão
            </Button>
          </div>
        </Section>
      ) : (
        <div>
          {/* ── O PASSO 5 FICOU SÓ COM O EMAIL (14/10) ──────────────────
                Pedido dela: tirar o bloco «Enviar ao cliente» — o resumo
                (Para, Clientes, Total, Sinal), o «Copiar resumo» e o
                WhatsApp de antes do envio, as notas do WhatsApp e da língua
                e a «Mensagem para o cliente» — e deixar só o email que o
                cliente vai receber. O que se escrevia na mensagem escreve-se
                agora no próprio texto do email, que é editável e é o que
                segue. O «Para» continua no cabeçalho do email; o total, o
                sinal e as faltas, na Conferência por baixo. Depois de
                enviada, o WhatsApp e o «Copiar resumo» continuam no painel
                do «Proposta enviada». */}
          {/* ══════════════════════════════════════════════════════════
                O EMAIL, ANTES DE ALGUÉM CARREGAR EM ENVIAR
                ══════════════════════════════════════════════════════════

                Depois da mensagem (que é um dos dados de que o texto parte) e
                ANTES da conferência: a passagem de olhos do documento e a do
                email fazem-se seguidas, com o dedo já a caminho do botão.

                O `activo` existe porque este passo fica MONTADO enquanto se
                escreve o conteúdo — sem ele, cada tecla do passo 1 mandava
                uma leitura do rascunho para o servidor. */}
          <EmailDoEnvio
            quoteId={quote.id}
            doc={doc as ProposalDoc}
            idioma={idiomaDoPdf}
            // A caixa da mensagem saiu (14/10): escreve-se no texto do email.
            mensagem=""
            activo={step === "enviar"}
            corpo={corpoDoEmail}
            onCorpo={setCorpoDoEmail}
            assunto={assuntoDoEmail}
            onAssunto={setAssuntoDoEmail}
            onModelo={setModeloDoEmail}
            // Medido quando houve pré-visualização; estimado quando não —
            // e o ecrã diz qual dos dois é.
            bytesDoAnexo={bytesDoPdf ?? tamanhoEstimado(totalDeFotos, amostras)}
            bytesMedidos={bytesDoPdf !== null}
            // Vazio quer dizer «compõe-o tu», e por isso o campo sai do
            // documento em vez de lá ficar como cadeia vazia: um `""`
            // gravado era indistinguível de uma escolha, e o dia em que a
            // composição mudasse não chegava às propostas que passaram por
            // aqui.
            onNomeDoFicheiro={(nome) => patch({ nomeDoFicheiro: nome.trim() ? nome : undefined })}
          />
          {/* ── O QUE JÁ SEGUIU ────────────────────────────────────────
                Depois da conferência (que olha para ESTA proposta) e antes
                do botão: é aqui que a pergunta "o que é que eles vão ver de
                diferente?" se faz, com o dedo já a caminho do Enviar.

                O `key` muda quando se envia — assim o painel volta a ler o
                histórico e a proposta que acabou de sair aparece nele, em vez
                de ficar com a lista de antes do envio. */}
          <Versoes
            key={String(sent)}
            quoteId={quote.id}
            doc={doc as ProposalDoc}
            onRestaurar={restaurarVersao}
            // A língua escolhida ao lado (ver a Conferência, aqui em cima):
            // o parágrafo do que mudou nasce na língua em que a proposta
            // vai mesmo sair.
            idioma={idiomaDoPdf}
            onInserirNaMensagem={inserirParagrafoDoQueMudou}
          />
          {/* ── A FRASE ESTÁTICA SAIU DAQUI ──────────────────────────
                Dizia «Preenche clientes, referência e um total maior que 0
                (no passo «Conteúdo») antes de enviar» — sempre as mesmas
                palavras, mesmo quando só faltava uma das três, sem link para
                nenhuma e a repetir uma lista que já existia duas vezes (a
                Conferência aqui em cima e a coluna lateral, que só existe
                acima de 1280 px).

                Agora o que trava está na Conferência, em primeiro e a
                vermelho, com o nome do que falta e um link que põe o cursor
                dentro do campo. Uma lista, um vocabulário, e visível em
                qualquer largura — ver `conferencia.ts`. */}
        </div>
      )}
    </div>
  );
}
