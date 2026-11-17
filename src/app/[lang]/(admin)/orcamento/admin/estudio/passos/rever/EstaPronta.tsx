"use client";

import type { ActionDispatch, Dispatch, SetStateAction } from "react";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import type { Quote } from "@/lib/orcamento/types";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { ProposalMoney } from "@/lib/proposal-doc";
import { camposPorTraduzir, escreverEn } from "@/lib/proposal-doc-bilingue";
import { type IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import {
  corrigirGralha,
  corrigirTudo,
  gralhasDoDocumento,
  tirarSimbolos,
  type CampoPublicado,
} from "@/lib/proposal-ortografia";
import type { FotoEscolhidaEmFalta } from "@/lib/proposta-fotos-verificacao-tipos";
import Conferencia from "../../../Conferencia";
import FotosEmFalta from "../../../FotosEmFalta";
import Gralhas from "../../../Gralhas";
import PorTraduzir from "../../../PorTraduzir";
import type { useToast } from "../../../Toast";
import { type PdfVisto } from "../../../pdf-visto";
import { Button } from "../../../ui";
import type { CanalDeEnvio } from "../../envio/canal-de-envio";
import { Section } from "../../formulario/Section";
import type { Step } from "../../tipos";

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
  preview: ({ rascunho }?: { rascunho?: boolean }) => Promise<void>;
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
        {/* ── ANTES DE ENVIAR: VER O PDF FINAL (14/10) ───────────────
                «Quero que haja algo que antes de enviar para os clientes
                obrigue os colaboradores da Líquen a verificar se está tudo
                bem.» A escolha dela foi «Ver o PDF primeiro». O PDF final
                só sai sem erros (B1); depois de descarregado, pede-se a
                confirmação; e mudar o documento depois de o ver volta a
                pedir as duas coisas. O servidor confere a mesma chave. */}
        <div
          data-testid="ver-antes-de-enviar"
          data-campo="pdf-visto"
          className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-3"
        >
          <p className="bo-eyebrow text-[var(--bo-text-muted)]">Antes de enviar</p>
          {temErros ? (
            <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
              Primeiro corrige o que está na lista acima — o PDF final só sai sem erros. Depois
              descarrega-o e vê-o com atenção.
            </p>
          ) : !pdfVistoAgora ? (
            <>
              <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
                {pdfVisto
                  ? "A proposta mudou depois de veres o PDF. Descarrega-o outra vez e vê-o antes de enviar."
                  : "Descarrega o PDF final e vê-o com atenção, página a página — é exactamente o que o cliente vai receber."}
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void preview()}
                disabled={busy !== null}
              >
                {busy === "preview" ? "A gerar o PDF…" : "Descarregar o PDF final"}
              </Button>
            </>
          ) : (
            <label className="alvo-toque flex cursor-pointer items-start gap-2 text-sm leading-snug text-[var(--bo-text)]">
              <input
                type="checkbox"
                checked={!!pdfVisto?.confirmado}
                onChange={(e) => confirmarPdfVisto(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-sage-600"
              />
              <span>Vi a proposta e está tudo certo</span>
            </label>
          )}
        </div>
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

        {/* Os acentos que faltam nos campos que saem impressos. Aqui, ao
                pé da Conferência, e não a meio de escrever: a palavra ainda
                está a ser escrita quando o aviso apareceria. */}
        <Gralhas
          doc={doc as ProposalDoc}
          onCorrigir={(g) => {
            setDoc((d) => corrigirGralha(d, g));
            // A palavra muda num campo que pode estar a catorze páginas
            // daqui, dentro de uma secção que não se está a ver. No sítio
            // do clique só se vê a linha sair desta lista — e uma linha a
            // desaparecer não diz o que ficou escrito lá em cima.
            //
            // Com as duas palavras e o campo, é a mesma prestação de
            // contas que o «Corrigir as N» ao lado já fazia com o número.
            toast(`«${g.escrita}» passou a «${g.sugerida}» — ${g.rotulo}.`, "info");
          }}
          onIr={(g) => irParaCampo(g.campo)}
          onTirarSimbolos={(s) => {
            setDoc((d) => tirarSimbolos(d, s));
            toast(`Tirei ${s.simbolos.join(" ")} — ${s.rotulo}.`, "info");
          }}
          onIrAosSimbolos={(s) => irParaCampo(s.campo)}
          onCorrigirTudo={() => {
            const quantas = gralhasDoDocumento(doc as ProposalDoc).length;
            setDoc((d) => corrigirTudo(d));
            toast(
              quantas === 1 ? "1 palavra corrigida." : `${quantas} palavras corrigidas.`,
              "info",
            );
          }}
        />
        {/* ── O QUE VAI SAIR EM PORTUGUÊS ─────────────────────────────
                Logo a seguir às Gralhas, e SÓ com «Inglês» escolhido: numa
                proposta portuguesa não há nada por traduzir, e uma secção
                vazia a dizê-lo era ruído no ecrã de toda a gente. */}
        {idiomaDoPdf === "en" && (
          <PorTraduzir
            doc={doc as ProposalDoc}
            onFicarEmPortugues={(c) => setDoc((d) => escreverEn(d, c.campo, c.texto))}
            onFicarTodosEmPortugues={() => {
              const faltam = camposPorTraduzir(doc as ProposalDoc);
              setDoc((d) => {
                let saida = d;
                for (const c of faltam) saida = escreverEn(saida, c.campo, c.texto);
                return saida;
              });
              toast(
                faltam.length === 1
                  ? "1 campo fica em português."
                  : `${faltam.length} campos ficam em português.`,
                "info",
              );
            }}
            onIr={(c) => irParaCampo(c.campo, "en")}
          />
        )}
      </Section>
    </div>
  );
}
