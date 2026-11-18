"use client";

import { PastilhaDoEnvio } from "../../../BarraDoEnvioCompacta";
import { eur } from "@/lib/money";
import { Button } from "../../../ui";
import { useEstudio } from "../../contexto";

export function EnviarNaBarra() {
  const {
    accoesDoDocumento: { confirmarPdfVisto },
    adiamento: { perguntaDoEnvioDesdeRef },
    barra: { barraCompacta, setFolhaDoEnvio },
    botaoDoEnvio: { canSend, faltasDoEnvio, modoDoBotao, oEnvioTrava },
    envio: { setConfirmSend },
    ocupado: { busy },
    pdfDaProposta: { fotosPorConfirmar, preview },
    total: { money, totais },
    traducoes: { idiomaDoPdf },
  } = useEstudio();
  return (
    <div className="ml-auto flex items-center gap-x-3">
      {barraCompacta && (
        // Com uma falta que trava, a pastilha é um alarme e fica: o
        // botão ao lado está apagado, e é ela que diz porquê.
        <span data-acessorio-da-barra={oEnvioTrava ? undefined : ""} className="contents">
          <PastilhaDoEnvio
            faltas={faltasDoEnvio}
            fotosPorConfirmar={fotosPorConfirmar}
            idioma={idiomaDoPdf}
            onAbrir={() => setFolhaDoEnvio(true)}
          />
        </span>
      )}
      {/* ── O TOTAL TAMBÉM AQUI (auditoria de 14/11, n.º 1) ─────────
                    «Não quero fazer scroll para saber quanto vai a proposta» —
                    e o último passo é onde mais se pergunta. Fica encostado ao
                    botão, como nos outros quatro; na barra compacta só o
                    número se vê, e «A pagar» continua a ouvir-se. */}
      {money.base > 0 && (
        <p
          data-total-da-barra
          className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--bo-text-muted)]"
        >
          {/* Os nós de texto do original: um {" "} à parte não é um espaço dentro do
              texto, e mede-se diferente (1/64 px). Ver scripts/capturas/estudio-ao-pixel.mjs. */}
          {/* prettier-ignore */}
          <span className={barraCompacta ? "sr-only" : "text-foreground/45"}>
            A pagar{" "}
          </span>
          <strong className="font-semibold text-[var(--bo-text)]">{eur(totais.aPagar)}</strong>
        </p>
      )}
      {/* ── O BOTÃO QUE GUIA (14/10) ──────────────────────────────
                    Quando a ÚNICA coisa que falta é ver o PDF final, o botão
                    deixa de estar apagado e passa a ser esse passo: «Ver o PDF
                    final» descarrega-o; depois «Está certo — enviar» regista
                    que foi visto e confirmado (o mesmo `confirmarPdfVisto` da
                    caixa do corpo do passo, que continua lá) e abre a pergunta
                    de sempre. Com outra falta qualquer fica apagado e diz
                    porquê; com tudo pronto, envia. */}
      {modoDoBotao === "ver" ? (
        <Button
          size="sm"
          variant="primary"
          onClick={() => void preview()}
          disabled={busy !== null}
          iconRight={<span aria-hidden="true">↓</span>}
          aria-label={barraCompacta ? "Ver o PDF final" : undefined}
        >
          {barraCompacta ? "Ver o PDF" : "Ver o PDF final"}
        </Button>
      ) : modoDoBotao === "confirmar" ? (
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            confirmarPdfVisto(true);
            perguntaDoEnvioDesdeRef.current = performance.now();
            setConfirmSend(true);
          }}
          disabled={busy !== null}
          iconRight={<span aria-hidden="true">→</span>}
          aria-label={barraCompacta ? "Está certo — enviar" : undefined}
        >
          {barraCompacta ? "Enviar" : "Está certo — enviar"}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            perguntaDoEnvioDesdeRef.current = performance.now();
            setConfirmSend(true);
          }}
          disabled={busy !== null || !canSend}
          /**
           * ── O BOTÃO DIZ O QUE FALTA ────────────────────────────
           * Sai do MESMO sítio que trava o botão, portanto não pode
           * discordar dele. A lista inteira, com os saltos, está na
           * pastilha ao lado.
           */
          title={
            canSend
              ? undefined
              : fotosPorConfirmar > 0
                ? "Há fotos ainda a entrar na proposta. Falta pouco."
                : faltasDoEnvio
                    .filter((f) => f.trava)
                    .map((f) => f.texto)
                    .join(" · ") || "Falta preencher a proposta antes de enviar."
          }
          iconRight={<span aria-hidden="true">→</span>}
          // Compacta, o rótulo encurta; o nome que se ouve não muda.
          aria-label={barraCompacta ? "Gerar e enviar ao cliente" : undefined}
        >
          {barraCompacta ? "Enviar" : "Gerar e enviar ao cliente"}
        </Button>
      )}
    </div>
  );
}
