"use client";

import { Button } from "../../../ui";
import { nomeDoPasso } from "@/lib/orcamento/passos-do-estudio";
import { EnvioNaBarraCompacta } from "./EnvioNaBarraCompacta";
import { EnvioNaBarraLarga } from "./EnvioNaBarraLarga";
import AEnviarAProposta from "../../../AEnviarAProposta";
import PerguntaAntesDoEnvio from "../../../PerguntaAntesDoEnvio";
import { passoParaCorrigir } from "../../../usePerguntasDoEnvio";
import { destinoDoEnvio } from "@/lib/orcamento/destino-do-envio";
import { eur } from "@/lib/money";
import { CONFIRMAR_ENVIO_APOS_MS } from "../../limites";
import { EnviarNaBarra } from "./EnviarNaBarra";
import { useEstudio } from "../../contexto";

export function EnvioNaBarra() {
  const {
    envioAdiado,
    adiamento: { enviarAgoraRef, perguntaDoEnvioDesdeRef },
    barra: { barraCompacta },
    enviar: { send },
    envio: { canal, confirmSend, sent, setConfirmSend },
    geracoes: { amostras },
    ocupado: { busy },
    paginasDaProposta: { planoDoPdf, totalDeFotos },
    passos: { irParaPasso, step },
    pedido: { quote },
    pronta: { perguntas },
    total: { totais },
    traducoes: { idiomaDoPdf },
  } = useEstudio();
  return (
    <>
      {step === "enviar" && !sent && (
        <>
          <Button
            data-acessorio-da-barra=""
            size="sm"
            variant="ghost"
            onClick={() => irParaPasso("orcamento")}
            // A meio de um envio, voltar atrás não cancela nada — o pedido já
            // está a correr no servidor — e só serve para ela deixar de ver o
            // que está a acontecer.
            disabled={busy === "send"}
            // Compacta, a seta chega: o nome do passo está na barra dos passos
            // lá em cima, e cada letra aqui é largura tirada ao «Enviar».
            aria-label={barraCompacta ? `Voltar a ${nomeDoPasso("orcamento")}` : undefined}
          >
            {barraCompacta ? "←" : `← ${nomeDoPasso("orcamento")}`}
          </Button>
          <EnvioNaBarraCompacta />
          <EnvioNaBarraLarga />
          {/* ── ENQUANTO ESTÁ A IR ──────────────────────────────────────
                «Ao enviar a proposta quero que haja uma animação que eu perceba
                que está a ser enviado.» Não havia nenhuma: o `send()` fechava a
                confirmação e o ecrã voltava ao botão apagado, durante os
                dezenas de segundos que o desenho do PDF e o email demoram numa
                quinta com 4G fraco. */}
          {busy === "send" ? (
            <div className="ml-auto flex justify-end">
              <AEnviarAProposta
                fotos={totalDeFotos}
                amostras={amostras}
                para={quote.email || undefined}
              />
            </div>
          ) : /* O servidor parou e perguntou (fotos em falta ou cortes) —
                ver `PerguntaAntesDoEnvio` e `usePerguntasDoEnvio`. */
          perguntas.pergunta ? (
            <PerguntaAntesDoEnvio
              pergunta={perguntas.pergunta}
              ocupado={busy !== null}
              onEnviarAssimMesmo={() => {
                // Só vale para o documento que fez a pergunta: se mudou, a
                // pergunta fecha e o envio volta a pedir o PDF.
                if (perguntas.confirmar()) void send();
              }}
              onVoltarECorrigir={() => {
                const p = perguntas.pergunta;
                perguntas.fechar();
                // Pela porta da barra dos passos: chega ao INÍCIO do passo
                // onde se corrige, não a meio dele (revisão de 14/11).
                if (p) irParaPasso(passoParaCorrigir(p));
              }}
            />
          ) : envioAdiado.aEsperar ? (
            <div
              className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2"
              role="status"
              aria-live="polite"
            >
              <span className="text-right text-sm text-[var(--bo-text)]">
                A enviar para {quote.email || "o cliente"} em {envioAdiado.restam} s…{" "}
                <span className="text-xs text-[var(--bo-text-muted)]">
                  Se saíres deste ecrã antes disso, não sai nada.
                </span>
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={envioAdiado.cancelar}>
                  Cancelar
                </Button>
                <Button size="sm" variant="ghost" onClick={envioAdiado.enviarJa}>
                  Enviar já
                </Button>
              </span>
            </div>
          ) : confirmSend ? (
            /* ── A ÚLTIMA PERGUNTA, COM O QUE VAI LÁ DENTRO ───────────────
                 Dizia «Enviar para maria@example.pt?» e mais nada. É a acção
                 mais irreversível da casa — o PDF é desenhado, o email sai, a
                 proposta fica gravada e o casal lê-a — e a pergunta só
                 confirmava a MORADA. Tudo o que se pode ter enganado sem dar
                 por isso ficava de fora: a língua (tirou-se uma prova em
                 inglês no passo anterior e o selector ficou lá), o valor (o
                 total mudou depois de se rever) e o tamanho do documento (uma
                 página de inspiração que se removeu sem se dar conta).

                 Passa a dizer as quatro coisas: PARA QUEM, QUANTAS páginas, QUE
                 total, e EM QUE LÍNGUA. São exactamente os quatro dados que o
                 cliente vai ver, e é a última vez que alguém os pode olhar.

                 Os números saem de onde já saíam antes: `planoDoPdf` é a
                 mesma conta do «PDF com cerca de N páginas» que a barra mostra,
                 e `totais.aPagar` é o mesmo bloco de totais que o gerador do
                 PDF usa. Uma segunda conta aqui era garantir que um dia a
                 pergunta e o documento diziam números diferentes.

                 «cerca de» porque é isso que é: um texto muito longo empurra
                 uma secção para a folha seguinte (ver `pdf-editorial/plano.ts`),
                 e prometer um número exacto seria mentir na última frase. */
            <div className="ml-auto flex max-w-lg flex-col items-end gap-2">
              <p className="text-right text-sm leading-relaxed text-[var(--bo-tinta-72)]">
                {/* O canal e o contacto CERTOS (auditoria de 14/11, n.º 3):
                      com «WhatsApp» isto perguntava pelo email. */}
                {destinoDoEnvio(canal, quote.email, quote.phone).map((p, i) =>
                  p.contacto ? (
                    <strong key={i} className="font-medium text-[var(--bo-text)]">
                      {p.texto}
                    </strong>
                  ) : (
                    p.texto
                  ),
                )}
                ? Vai um PDF de cerca de {planoDoPdf.length} páginas,{" "}
                {idiomaDoPdf === "en" ? "em inglês" : "em português"}, com{" "}
                <strong className="font-medium text-[var(--bo-text)]">{eur(totais.aPagar)}</strong>{" "}
                a pagar.
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirmSend(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    // Achado n.º 3: o «Confirmar» aparece onde estava a ponta
                    // direita do «Gerar e enviar», e o segundo clique de um
                    // duplo clique enviava sem a pergunta chegar a ser vista.
                    // Confirmar pede um gesto NOVO, depois de a ler.
                    if (
                      performance.now() - perguntaDoEnvioDesdeRef.current <
                      CONFIRMAR_ENVIO_APOS_MS
                    ) {
                      return;
                    }
                    if (canal === "whatsapp") {
                      void send();
                      return;
                    }
                    setConfirmSend(false);
                    envioAdiado.agendar(() => enviarAgoraRef.current());
                  }}
                  disabled={busy !== null}
                >
                  Confirmar
                </Button>
              </div>
            </div>
          ) : (
            /* ── O BOTÃO, E POR CIMA DELE A RAZÃO ────────────────────────
                 «Quando falta alguma coisa na proposta, quero que apareça um
                 aviso a dizer que não dá para enviar porque não preenchi tal
                 coisa.» A razão já existia — vivia no `title`, que num iPhone
                 não aparece. Passa a estar escrita ao lado do botão, com cada
                 falta a saltar para onde se resolve. */
            /* «Vai para …» AO LADO do botão e não por cima: eram dois
                 andares para uma frase de uma linha («barras muito mais
                 finas»). Quando há faltas, a caixa que as explica quebra para
                 cima sozinha (`flex-wrap`) — aí a altura é a mensagem. */
            <EnviarNaBarra />
          )}
        </>
      )}
    </>
  );
}
