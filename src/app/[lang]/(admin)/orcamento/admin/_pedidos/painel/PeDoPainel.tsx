"use client";

import { Button } from "../../ui";
import { type GravacaoAutomatica } from "../../useGravacaoAutomatica";
import { type EdicaoDoPedido } from "../useEdicaoDoPedido";

/** O pé do painel: a barra de gravação — o estado do que se escreve, e o
 *  «Guardar alterações» do que exige um clique. (Saiu do painel na fase 7 da
 *  estrutura do código, tal e qual.) */
export interface PeDoPainelProps {
  edicao: EdicaoDoPedido;
  saving: boolean;
  isDirty: boolean;
  gravacao: GravacaoAutomatica;
  guardarAgora: () => void;
}

export function PeDoPainel({ edicao, saving, isDirty, gravacao, guardarAgora }: PeDoPainelProps) {
  const { alteracoesPorConfirmar } = edicao;
  return (
    <>
      {/* ── O PÉ DO PAINEL: A BARRA DE GRAVAÇÃO ─────────────
          Aparece seja qual for a secção onde ela está — nunca
          mais um "guardar" escondido — e agora também DEPOIS de
          gravar, porque «guardado às 14:32» é a informação que
          dispensa a pergunta «isto ficou guardado?».

          O botão não desaparece: ela pediu «um botão para
          guardar ou então que guarde automaticamente», e ter os
          dois é melhor do que ter um — o automático protege, o
          botão dá sossego. Mas tem de dizer a verdade: se já
          está guardado, é isso que ele diz.

          E deixou de ser `sticky` porque deixou de precisar: é o
          PÉ da moldura, fora da caixa que rola, portanto está no
          fundo do painel sempre — em vez de estar no fundo do que
          rola, que é onde ela não estava a ver. */}
      {(isDirty || gravacao.estado) &&
        (() => {
          const alarme = !!gravacao.naoChegouAoServidor;
          const porque = gravacao.naoChegouAoServidor?.porque;
          const rotuloDoBotao = saving
            ? "A guardar…"
            : alarme
              ? "Tentar de novo"
              : alteracoesPorConfirmar
                ? "Guardar alterações"
                : "Guardado";
          const haQueFazer = alteracoesPorConfirmar || alarme || gravacao.porGravar;
          return (
            <div className="shrink-0 border-t border-[var(--bo-hairline)] bg-[var(--bo-surface)]">
              {/* A mesma medida e o mesmo respiro do corpo
                    (`max-w-3xl px-5 sm:px-7`), para o botão ficar
                    alinhado com o que está por cima dele. */}
              <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-3 sm:px-7">
                <p
                  id="estado-da-gravacao-do-pedido"
                  role="status"
                  // Um aviso que não chegou ao servidor tem de
                  // ser anunciado, não descoberto.
                  aria-live={alarme ? "assertive" : "polite"}
                  className={
                    alarme
                      ? "flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--bo-perigo)]"
                      : "flex items-center gap-1.5 text-[11px] tracking-wide text-gold-text"
                  }
                >
                  {alarme ? (
                    <>
                      <span aria-hidden>⚠</span>
                      {gravacao.texto?.longo}
                      {porque ? ` ${porque}` : ""}
                    </>
                  ) : (
                    <>
                      {alteracoesPorConfirmar && (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-gold/80" />
                          Alterações por guardar
                        </>
                      )}
                      {gravacao.texto && (
                        <span className={alteracoesPorConfirmar ? "text-foreground/45" : ""}>
                          {alteracoesPorConfirmar ? "· " : ""}
                          {gravacao.texto.longo}
                        </span>
                      )}
                    </>
                  )}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={guardarAgora}
                  loading={saving}
                  disabled={!haQueFazer}
                >
                  {rotuloDoBotao}
                </Button>
              </div>
            </div>
          );
        })()}
    </>
  );
}
