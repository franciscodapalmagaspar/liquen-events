"use client";

import { LinhaDeTotal } from "../../orcamento/LinhaDeTotal";
import { eur } from "@/lib/money";
import { MargemDoNegocio } from "../../orcamento/MargemDoNegocio";
import { type ProposalDoc } from "@/lib/proposal-doc";
import { useEstudio } from "../../contexto";

/**
 * ══════════════════════════════════════════════════════════════
 * O BLOCO DE TOTAIS — UM SÓ, PELA ORDEM DO PAPEL
 * ══════════════════════════════════════════════════════════════
 *
 * Substitui as três somas que apareciam ao mesmo tempo («Soma das
 * linhas», «Somado ao total» e o resumo desta caixa) e segue a
 * ordem exacta em que o PDF as imprime: subtotal dos serviços →
 * valores adicionais → total sem IVA → IVA → total a pagar →
 * sinal e saldo.
 *
 * Os números NÃO são calculados aqui. Saem de `totais`, que é
 * `totaisDaProposta(doc, pctSinal)` — a mesma chamada que
 * `proposal-doc-pdf.ts` faz. É essa a razão de este bloco existir
 * assim: enquanto o ecrã tivesse a sua conta e o gerador a dele,
 * divergiam, e já divergiram (ver `proposal-budget.ts`).
 */
export function TotaisDaProposta() {
  const {
    documento: { doc, patch },
    total: { money, pctSinal, setSinalEscrito, sinalAntesRef, sinalEscrito, totais },
  } = useEstudio();
  return (
    <>
      {money.gross > 0 && (
        <div className="mt-5 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-4">
          <span className="bo-eyebrow">Totais</span>
          <dl className="mt-2.5 flex flex-col gap-1.5 text-xs">
            <LinhaDeTotal rotulo="Subtotal dos serviços" valor={eur(totais.servicos)} />
            <LinhaDeTotal rotulo="Valores adicionais" valor={eur(totais.adicionais)} />
            {/* A régua separa as parcelas dos resultados: é a mesma
                      leitura que a folha em papel dá, e sem ela as seis linhas
                      lêem-se como uma lista em que tudo tem o mesmo peso. */}
            <LinhaDeTotal rotulo="Total sem IVA" valor={eur(totais.total)} forte regua />
            <LinhaDeTotal
              rotulo={`IVA (${Math.round(totais.taxa * 100)}%)`}
              valor={eur(totais.iva)}
            />
            <LinhaDeTotal rotulo="Total a pagar" valor={eur(totais.aPagar)} forte />
            <LinhaDeTotal
              regua
              rotulo={
                <span className="inline-flex items-center gap-1">
                  Sinal
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={sinalEscrito ?? pctSinal}
                    onChange={(e) => {
                      // Achado n.º 17: «150» voltava a 30 sem mensagem (o
                      // motor só aceita de 1 a 99). Fica o que ela
                      // escreveu, com a razão por baixo, e só uma
                      // percentagem válida chega ao documento.
                      //
                      // Escrito tecla a tecla, «150» passa por «15», que é
                      // válido: por isso, quando o texto deixa de ser
                      // válido, volta-se ao valor de ANTES de ela começar.
                      const raw = e.target.value;
                      const n = Number.parseInt(raw, 10);
                      if (Number.isFinite(n) && n >= 1 && n <= 99) {
                        setSinalEscrito(null);
                        patch({ depositPercent: n });
                      } else {
                        setSinalEscrito(raw);
                        patch({ depositPercent: sinalAntesRef.current });
                      }
                    }}
                    onFocus={() => {
                      sinalAntesRef.current = pctSinal;
                    }}
                    onBlur={() => setSinalEscrito(null)}
                    aria-label="Percentagem do sinal"
                    aria-invalid={sinalEscrito != null || undefined}
                    aria-describedby={sinalEscrito != null ? "sinal-erro" : undefined}
                    className="bo-input w-16 px-1.5 py-0.5 text-center text-xs"
                  />
                  %
                </span>
              }
              valor={eur(totais.sinal)}
            />
            {sinalEscrito != null && (
              <p id="sinal-erro" role="alert" className="text-[11px] text-[var(--bo-perigo)]">
                O sinal é entre 1% e 99%. Fica nos {pctSinal}% enquanto não escreveres outro.
              </p>
            )}
            <LinhaDeTotal rotulo={`Saldo ${100 - pctSinal}%`} valor={eur(totais.saldo)} />
          </dl>
          {/* ── A BASE, DITA AQUI TAMBÉM ──────────────────────────────
                    A mesma frase que o PDF imprime no faseamento. Está aqui
                    porque é aqui que ela mexe na percentagem: com o cursor
                    dentro da caixa, «30%» de que é a pergunta óbvia, e a
                    resposta não pode obrigar a abrir o PDF para a confirmar. */}
          <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/45">
            Sinal e saldo são calculados sobre o total a pagar ({eur(totais.aPagar)}), com IVA
            incluído — é essa a base que a factura usa.
          </p>
          {/* ── SÓ PARA SI ────────────────────────────────────────────
                    O número que falta para decidir com noção. Os custos
                    escrevem-se no painel interno, aqui em cima; a decisão de
                    baixar (ou não) o preço toma-se AQUI, com o total à frente
                    — e era o único sítio onde a margem não estava. */}
          <MargemDoNegocio doc={doc as ProposalDoc} />
          {/* ── QUANDO AS SOMAS NÃO FECHAM ────────────────────────────
                    Por construção fecham sempre. Este aviso é a rede para o dia
                    em que deixarem de fechar — e nesse dia tem de se ver antes
                    de o PDF sair, não depois de o casal perguntar. As frases
                    vêm feitas de `totaisDaProposta`. */}
          {!totais.fecha && (
            <ul className="mt-3 flex flex-col gap-1 rounded-xl border border-[var(--bo-perigo)]/35 bg-[var(--bo-perigo)]/[0.06] px-3 py-2 text-[11px] leading-relaxed text-[var(--bo-perigo)]">
              {totais.porQueNaoFecha.map((porque) => (
                <li key={porque}>⚠ As contas não fecham: {porque}.</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
