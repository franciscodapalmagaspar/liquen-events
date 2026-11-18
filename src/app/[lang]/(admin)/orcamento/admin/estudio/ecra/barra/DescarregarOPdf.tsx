"use client";

import { Button, EmCurso } from "../../../ui";
import { tempoEstimado } from "@/lib/custo-do-pdf";
import { useEstudio } from "../../contexto";

/**
 * ══════════════════════════════════════════════════════════
 * ENQUANTO O PDF SE DESENHA
 * ══════════════════════════════════════════════════════════
 *
 * É o MESMO desenho de documento que o envio faz, na mesma
 * rota, com a mesma espera de 10 a 60 segundos — e aqui havia
 * só um botão a rodar, que ao fim de meio minuto se lê como
 * «isto encravou». A caixa entra no lugar do botão (é onde o
 * estado já vivia, e assim não empurra o selector de idioma
 * nem a ressalva de baixo) e a estimativa é a mesma que o
 * `AEnviarAProposta` usa: aprendida das gerações anteriores
 * desta instalação, e não um número escrito à mão.
 *
 * A espera é OPACA de propósito: é um pedido só, e do lado de
 * cá não há nada para contar até a resposta chegar.
 */
export function DescarregarOPdf() {
  const {
    envio: { fimDoPdf },
    geracoes: { amostras },
    ocupado: { busy },
    paginasDaProposta: { totalDeFotos },
    pdfDaProposta: { preview },
    pronta: { temErros },
    traducoes: { idiomaDoPdf },
  } = useEstudio();
  return (
    <>
      {fimDoPdf.mostrar ? (
        <EmCurso
          className="max-w-xs"
          concluido={fimDoPdf.concluido}
          pronto="PDF pronto"
          // A língua continua dita enquanto roda: são dezenas de
          // segundos numa proposta cheia, tempo que chega para deixar
          // de haver a certeza do que se escolheu — o português
          // cala-se porque é o de sempre.
          titulo={idiomaDoPdf === "en" ? "A gerar o PDF em inglês…" : "A gerar o PDF…"}
          estimadoMs={tempoEstimado(totalDeFotos, amostras)}
          nota="Assim que estiver desenhado, o PDF é descarregado."
          notaDemorada="Com a rede fraca isto demora. Não feches a página — o PDF é descarregado assim que estiver."
        />
      ) : (
        /* ── O PDF FINAL SÓ SAI SEM ERROS (B1) ─────────────────────
                        Com um erro na lista do «Rever e enviar», este botão passa
                        a dar o RASCUNHO, e di-lo no rótulo. A razão vai no
                        `title` e não numa frase por baixo: esta barra é fina por
                        pedido dela, e a lista com as razões está no passo a
                        seguir, com links para cada uma. */
        <Button
          size="sm"
          variant="secondary"
          onClick={() => preview({ rascunho: temErros })}
          disabled={busy !== null}
          title={
            temErros
              ? "Há erros por resolver em «Rever e enviar». O PDF final fica disponível quando a lista estiver sem erros; o rascunho sai com «RASCUNHO» no rodapé."
              : undefined
          }
        >
          {temErros ? "Descarregar rascunho" : "Descarregar PDF"}
        </Button>
      )}
    </>
  );
}
