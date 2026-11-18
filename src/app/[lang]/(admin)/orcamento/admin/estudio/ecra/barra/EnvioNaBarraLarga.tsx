"use client";

import { PainelDoEnvio, PastilhaDoEnvio } from "../../../BarraDoEnvioCompacta";
import PorqueNaoDaParaEnviar from "../../../PorqueNaoDaParaEnviar";
import { AvisoDasTraducoes, RESSALVA_DO_INGLES } from "../../formulario/AvisoDasTraducoes";
import { type ProposalDoc } from "@/lib/proposal-doc";
import { Button, EmCurso, Segmented } from "../../../ui";
import { OPCOES_DO_CANAL } from "../../envio/canal-de-envio";
import { tempoEstimado } from "@/lib/custo-do-pdf";
import { useEstudio } from "../../contexto";

/**
 * ══════════════════════════════════════════════════════════════════
 * NO ECRÃ LARGO, UMA LINHA SÓ (14/10, «melhora isto drasticamente»)
 * ══════════════════════════════════════════════════════════════════
 *
 * Era um cartão de três andares: a frase do inglês, «Vai para…»,
 * a caixa vermelha do que falta e o canal por baixo de tudo. Ela
 * escolheu «uma linha só»: a pastilha do estado (a MESMA do
 * telemóvel) abre um painel com o que a caixa dizia, e ao lado
 * ficam a língua, o canal só com os logótipos e o PDF. Os nomes
 * que se ouvem são os de sempre — «Idioma da proposta», «Por onde
 * segue (em baixo)», «Descarregar PDF» —, só o que se VÊ encolhe.
 */
export function EnvioNaBarraLarga() {
  const {
    barra: { barraCompacta, fecharPainelDoEnvio, painelDoEnvio, pastilhaDoEnvio, setPainelDoEnvio },
    botaoDoEnvio: { faltasDoEnvio, oEnvioTrava },
    documento: { doc },
    envio: { canal, escolherCanal, fimDoPdf },
    geracoes: { amostras },
    ocupado: { busy },
    paginasDaProposta: { totalDeFotos },
    pdfDaProposta: { fotosPorConfirmar, preview },
    pedido: { quote },
    pronta: { temErros },
    saltos: { irParaAFalta, irParaCampo },
    traducoes: { idiomaDoPdf, setIdiomaDoPdf },
  } = useEstudio();
  return (
    <>
      {busy !== "send" && !barraCompacta && (
        <div
          className="flex min-w-0 items-center gap-2"
          // Quando TODOS os filhos saem (painel fechado, nada trava), o
          // grupo sai também: vazio, continuava a ser um item da fila e
          // somava mais um `gap` ao lado do botão (2.ª revisão de 15/11).
          data-acessorio-da-barra={painelDoEnvio || oEnvioTrava ? undefined : ""}
        >
          {/* Com o painel da pastilha aberto, fica tudo: não se fecha um
                    painel debaixo do dedo só porque a página andou. E com uma
                    falta que trava, a pastilha fica (é um alarme); o resto sai. */}
          <span
            className="inline-flex"
            data-acessorio-da-barra={painelDoEnvio || oEnvioTrava ? undefined : ""}
          >
            <PastilhaDoEnvio
              ref={pastilhaDoEnvio}
              aberta={painelDoEnvio}
              faltas={faltasDoEnvio}
              fotosPorConfirmar={fotosPorConfirmar}
              idioma={idiomaDoPdf}
              onAbrir={() => setPainelDoEnvio((v) => !v)}
            />
          </span>
          <PainelDoEnvio
            aberto={painelDoEnvio}
            onFechar={fecharPainelDoEnvio}
            ancora={pastilhaDoEnvio}
          >
            <PorqueNaoDaParaEnviar
              naFolha
              faltas={faltasDoEnvio}
              fotosPorConfirmar={fotosPorConfirmar}
              emailDoCliente={quote.email}
              onIr={(f) => {
                setPainelDoEnvio(false);
                irParaAFalta(f.seccao, f.campo);
              }}
            />
            <p className="text-[11px] leading-snug text-foreground/50">{RESSALVA_DO_INGLES}</p>
            {idiomaDoPdf === "en" && (
              <AvisoDasTraducoes
                doc={doc as ProposalDoc}
                onVer={(campo) => {
                  setPainelDoEnvio(false);
                  irParaCampo(campo, "en");
                }}
                alinhar="esquerda"
              />
            )}
          </PainelDoEnvio>
          <span className="contents" data-acessorio-da-barra={painelDoEnvio ? undefined : ""}>
            <Segmented
              size="sm"
              ariaLabel="Idioma da proposta"
              value={idiomaDoPdf}
              onChange={setIdiomaDoPdf}
              options={[
                { value: "pt", label: "PT", ariaLabel: "Português" },
                {
                  value: "en",
                  label: "EN",
                  ariaLabel:
                    "Inglês — o documento, o email ao cliente e a página onde ele responde saem em inglês; os campos que preencheste, incluindo a data do evento, ficam como os escreveste",
                },
              ]}
            />
            <Segmented
              size="sm"
              ariaLabel="Por onde segue (em baixo)"
              value={canal}
              onChange={escolherCanal}
              options={OPCOES_DO_CANAL.map((o) => ({
                value: o.value,
                label: "",
                icon: o.icon,
                ariaLabel: o.label,
              }))}
            />
            {fimDoPdf.mostrar ? (
              <EmCurso
                emLinha
                concluido={fimDoPdf.concluido}
                pronto="PDF pronto"
                titulo={idiomaDoPdf === "en" ? "A gerar o PDF em inglês…" : "A gerar o PDF…"}
                estimadoMs={tempoEstimado(totalDeFotos, amostras)}
              />
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => preview({ rascunho: temErros })}
                disabled={busy !== null}
                aria-label={temErros ? "Descarregar rascunho" : "Descarregar PDF"}
                title={
                  temErros
                    ? "Há erros por resolver em «Rever e enviar». O PDF final fica disponível quando a lista estiver sem erros; o rascunho sai com «RASCUNHO» no rodapé."
                    : "Descarregar o PDF"
                }
                iconLeft={<span aria-hidden="true">↓</span>}
              >
                {temErros ? "Rascunho" : "PDF"}
              </Button>
            )}
          </span>
        </div>
      )}
    </>
  );
}
