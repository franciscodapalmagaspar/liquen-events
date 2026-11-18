"use client";

import type { ActionDispatch, Dispatch, SetStateAction } from "react";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import type { Quote } from "@/lib/orcamento/types";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { ProposalMoney } from "@/lib/proposal-doc";
import type { FotoEscolhidaEmFalta } from "@/lib/proposta-fotos-verificacao-tipos";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";
import type { CampoPublicado } from "@/lib/proposal-ortografia";
import Conferencia from "../../../Conferencia";
import FotosEmFalta from "../../../FotosEmFalta";
import type { useToast } from "../../../Toast";
import { type PdfVisto } from "../../../pdf-visto";
import type { CanalDeEnvio } from "../../envio/canal-de-envio";
import { Section } from "../../formulario/Section";
import type { Step } from "../../tipos";
import { AntesDeEnviar } from "./AntesDeEnviar";
import { RevisaoDoTexto } from "./RevisaoDoTexto";

interface PropsEstaPronta {
  aoSaberQueFaltam: (refs: string[]) => void;
  busy: "preview" | "send" | null;
  canal: CanalDeEnvio;
  confirmarPdfVisto: (confirmado: boolean) => void;
  doc: StudioDoc;
  fotosPorConfirmar: number;
  idiomaDoPdf: IdiomaDaProposta;
  irParaAFalta: (seccao?: string, campo?: string) => void;
  irParaCampo: (campo: CampoPublicado, versao?: "pt" | "en") => void;
  money: ProposalMoney;
  pdfConfirmado: boolean;
  pdfVisto: PdfVisto | null;
  pdfVistoAgora: boolean;
  preview: (opcoes?: { rascunho?: boolean }) => Promise<void>;
  quote: Quote;
  quotes: Quote[] | undefined;
  sent: boolean;
  setDoc: ActionDispatch<[u: SetStateAction<StudioDoc>]>;
  setEscolhidasQueFaltam: Dispatch<SetStateAction<FotoEscolhidaEmFalta[]>>;
  step: Step;
  temErros: boolean;
  toast: ReturnType<typeof useToast>["toast"];
}

/**
 * PASSO 5 · «Está pronta?», logo em cima. Decisão dela a 10/11 (o plano de
 * 9/11, fase 5): primeiro o que falta — a Conferência, as fotografias em
 * falta, as gralhas, o que ficou por traduzir —, depois ver o PDF final,
 * depois o resumo e o email, e só no fim por onde segue.
 *
 * Saiu do `ProposalStudio` tal e qual (fase 4 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export function EstaPronta({
  aoSaberQueFaltam,
  busy,
  canal,
  confirmarPdfVisto,
  doc,
  fotosPorConfirmar,
  idiomaDoPdf,
  irParaAFalta,
  irParaCampo,
  money,
  pdfConfirmado,
  pdfVisto,
  pdfVistoAgora,
  preview,
  quote,
  quotes,
  sent,
  setDoc,
  setEscolhidasQueFaltam,
  step,
  temErros,
  toast,
}: PropsEstaPronta) {
  return (
    <div
      className={step === "enviar" && !sent ? "view-in mb-4" : undefined}
      hidden={step !== "enviar" || sent}
    >
      <Section title="Está pronta?">
        {/* As fotos a caminho têm a sua própria linha, e não a genérica
                dos campos por preencher: aqui não há nada a fazer senão
                esperar uns segundos — dizer-lhe para "preencher" seria
                mandá-la procurar um campo que está bem. */}
        {fotosPorConfirmar > 0 && (
          <p
            aria-live="polite"
            className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--bo-perigo)]"
          >
            <span aria-hidden="true">⏳</span>
            <span>
              {fotosPorConfirmar === 1
                ? "1 foto ainda está a entrar na proposta."
                : `${fotosPorConfirmar} fotos ainda estão a entrar na proposta.`}{" "}
              O envio fica disponível mal ela assente — assim a proposta segue completa.
            </span>
          </p>
        )}
        {/* A PASSAGEM DE OLHOS. Depois do resumo (que diz o que vai
                seguir) e antes do botão (que o torna irreversível). */}
        <Conferencia
          doc={doc as ProposalDoc}
          quote={quote}
          quotes={quotes}
          totalBruto={money.gross}
          // A língua escolhida aqui ao lado. Sem ela, a lista falava do
          // pedido que veio em inglês e calava-se sobre a metade da
          // proposta que ia sair em português.
          idioma={idiomaDoPdf}
          // O canal e o email: sem eles a lista não sabia que uma
          // proposta por email sem email não chega a ninguém (B1).
          canal={canal}
          emailDoCliente={quote.email}
          // O «visto» do PDF, o mesmo do botão (`contextoDoBotao`): sem
          // ele esta lista dizia «3 coisas impedem o envio» por cima de
          // uma pastilha a dizer «Faltam 4». A regra é uma só, a de
          // `oQueFaltaParaEnviar`, e as duas contam a partir dela.
          pdfVisto={pdfConfirmado}
          onIr={(v) => irParaAFalta(v.seccao, v.campo)}
        />
        <AntesDeEnviar
          busy={busy}
          confirmarPdfVisto={confirmarPdfVisto}
          pdfVisto={pdfVisto}
          pdfVistoAgora={pdfVistoAgora}
          preview={preview}
          temErros={temErros}
        />
        {/* ── AS FOTOGRAFIAS ESTÃO MESMO LÁ? ─────────────────────────
                Primeiro de todos os avisos deste passo, e é de propósito: é
                o único que fala de uma coisa que já não se vê no ecrã. As
                gralhas e as traduções lêem-se no documento; um ficheiro que
                desapareceu do armazenamento só se descobre perguntando.

                Foi o defeito que a fez escrever: quatro fotos que não
                existiam seguiram numa proposta, e a primeira pessoa a dar por
                isso foi o casal. */}
        <FotosEmFalta
          quoteId={quote.id}
          doc={doc as ProposalDoc}
          onEscolhidasQueFaltam={setEscolhidasQueFaltam}
          onRefsQueFaltam={aoSaberQueFaltam}
        />

        <RevisaoDoTexto
          doc={doc}
          idiomaDoPdf={idiomaDoPdf}
          irParaCampo={irParaCampo}
          setDoc={setDoc}
          toast={toast}
        />
      </Section>
    </div>
  );
}
