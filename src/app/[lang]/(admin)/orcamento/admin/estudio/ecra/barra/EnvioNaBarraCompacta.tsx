"use client";

import { ControlosDoEnvio } from "../../../BarraDoEnvioCompacta";
import PorqueNaoDaParaEnviar from "../../../PorqueNaoDaParaEnviar";
import { Segmented } from "../../../ui";
import { OPCOES_DO_CANAL } from "../../envio/canal-de-envio";

import { AvisoDasTraducoes } from "../../formulario/AvisoDasTraducoes";
import { type ProposalDoc } from "@/lib/proposal-doc";
import { useEstudio } from "../../contexto";
import { RessalvaDoIngles } from "./RessalvaDoIngles";
import { DescarregarOPdf } from "./DescarregarOPdf";

/**
 * ── A LÍNGUA E O DESCARREGAR VIERAM DO ANTIGO «PRÉ-VISUALIZAR» (A2) ──
 * O documento junta pré-visualizar e enviar num passo só, «Rever
 * e enviar». O selector da língua fica encostado ao «Descarregar»,
 * como ela pediu (ver o comentário lá dentro), e é o mesmo estado
 * do selector do corpo do passo — mudar um muda o outro.
 */
export function EnvioNaBarraCompacta() {
  const {
    barra: { barraCompacta, folhaDoEnvio, setFolhaDoEnvio },
    botaoDoEnvio: { faltasDoEnvio },
    documento: { doc },
    envio: { canal, escolherCanal },
    ocupado: { busy },
    pdfDaProposta: { fotosPorConfirmar },
    pedido: { quote },
    saltos: { irParaAFalta, irParaCampo },
    traducoes: { idiomaDoPdf, setIdiomaDoPdf },
  } = useEstudio();
  return (
    <>
      {busy !== "send" && barraCompacta && (
        <>
          {/* ══════════════════════════════════════════════════════════════
                    A LÍNGUA ESCOLHE-SE EM CIMA DO BOTÃO QUE GERA
                    ══════════════════════════════════════════════════════════════

                    Palavras dela: «na parte de descarregar ou gerar, um botão para
                    escolher gerar em inglês».

                    Fica encostado ao «Descarregar PDF» e À VISTA — não num menu,
                    não nas definições da proposta. A escolha é sobre ESTE clique:
                    a mesma proposta sai agora em português e daqui a um minuto em
                    inglês, sem nada mudar no documento. Escondida, seria
                    descoberta depois de o PDF já ter saído na língua errada — e
                    gerar outra vez é um minuto de espera com fotografias a sério.

                    ── E A ESCOLHA TEM DE DIZER O QUE FAZ ──────────────────────
                    Só a MOLDURA é traduzida: rótulos, texto padrão da casa, datas
                    e dinheiro. Os títulos dos serviços, as descrições e as
                    legendas que ela escreveu saem tal e qual — foi decisão
                    explícita, e está escrita no cabeçalho de
                    `proposal-doc-textos`. Sem esta linha, quem carrega em «Inglês»
                    abre um PDF meio inglês e conclui que está avariado; com ela,
                    sabe que o remédio é escrever esses campos em inglês.

                    A linha está sempre no ecrã, e não só depois de escolher: serve
                    para DECIDIR, não para explicar um arrependimento. */}
          <ControlosDoEnvio
            compacta={barraCompacta}
            aberta={folhaDoEnvio}
            onFechar={() => setFolhaDoEnvio(false)}
            antes={
              <PorqueNaoDaParaEnviar
                naFolha
                faltas={faltasDoEnvio}
                fotosPorConfirmar={fotosPorConfirmar}
                emailDoCliente={quote.email}
                onIr={(f) => {
                  setFolhaDoEnvio(false);
                  irParaAFalta(f.seccao, f.campo);
                }}
              />
            }
          >
            <div className="flex flex-col gap-1.5">
              <p className="bo-eyebrow text-[var(--bo-text-muted)]">Por onde segue</p>
              <Segmented
                size="sm"
                ariaLabel="Por onde segue (em baixo)"
                value={canal}
                onChange={escolherCanal}
                options={OPCOES_DO_CANAL}
              />
            </div>
            <Segmented
              size="sm"
              ariaLabel="Idioma da proposta"
              value={idiomaDoPdf}
              onChange={setIdiomaDoPdf}
              options={[
                { value: "pt", label: "Português" },
                {
                  value: "en",
                  label: "Inglês",
                  // Quem ouve o controlo em vez de o ver leva a mesma
                  // ressalva que está escrita por baixo — o aviso não pode
                  // viver só nos pixéis. Começa por «Inglês», que é o rótulo
                  // visível, para o nome falado e o nome escrito não
                  // divergirem.
                  ariaLabel:
                    "Inglês — o documento, o email ao cliente e a página onde ele responde saem em inglês; os campos que preencheste, incluindo a data do evento, ficam como os escreveste",
                },
              ]}
            />
            <DescarregarOPdf />
            <RessalvaDoIngles />
            {/* ── O QUE FALTA, DITO ANTES DO CLIQUE ──────────────────────
                      Este é o sítio onde o PDF nasce, e o primeiro PDF inglês sai
                      quase sempre antes de a Conferência ser vista. Um `toast` não
                      serviria: o toast conta o que ACONTECEU, e isto conta o que
                      vai acontecer — tem de estar à vista antes de se carregar.
                      `aria-live` porque o número muda com o selector ao lado. */}
            {idiomaDoPdf === "en" && (
              <AvisoDasTraducoes
                doc={doc as ProposalDoc}
                onVer={(campo) => irParaCampo(campo, "en")}
              />
            )}
          </ControlosDoEnvio>
        </>
      )}
    </>
  );
}
