"use client";

import { quandoGravado } from "@/lib/quando-gravado";
import { Button } from "../../../ui";
import { useEstudio } from "../../contexto";

/**
 * ══════════════════════════════════════════════════════════════
 * O TRABALHO QUE ESTA GRAVAÇÃO ESMAGOU, E DE ONDE SE VAI BUSCAR
 * ══════════════════════════════════════════════════════════════
 *
 * Isto não é um aviso: é uma decisão por tomar sobre trabalho de
 * outra pessoa. Por isso não é um `toast` — fica aqui até alguém
 * resolver.
 *
 * `aria-live="polite"` e não `assertive`: aparece depois de uma
 * gravação automática, num momento em que ela está a escrever, e
 * interromper um leitor de ecrã a meio de uma frase para dar uma
 * notícia que não é urgente seria trocar o mal maior pelo menor.
 *
 * As duas saídas estão à vista e nenhuma esconde a outra: repor, ou
 * dispensar. Dispensar não apaga nada no servidor — só tira o
 * lembrete —, e é isso que o botão diz pelo nome.
 */
export function RascunhoSobreposto() {
  const {
    rascunhoSobreposto: { aRepor, reporSobreposto, setSobreposto, sobreposto },
  } = useEstudio();
  return (
    <>
      {sobreposto && (
        <div
          className="border-[var(--bo-hairline-strong)] bg-[var(--bo-surface-sunken)] mb-4 rounded-xl border p-3"
          aria-live="polite"
        >
          <p className="text-[var(--bo-text)] mb-1 text-sm font-medium">
            {sobreposto.quem
              ? `A versão de ${sobreposto.quem} ficou guardada.`
              : "A versão que estava aqui ficou guardada."}
          </p>
          <p className="text-[var(--bo-text-muted)] mb-3 text-xs leading-relaxed">
            Gravaste por cima de trabalho que tinha sido feito noutro sítio
            {sobreposto.quando ? ` às ${quandoGravado(sobreposto.quando)}` : ""}. Ficou a tua
            versão, e a outra não se perdeu.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" loading={aRepor} onClick={reporSobreposto}>
              Repor essa versão
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSobreposto(null)}>
              Dispensar o aviso
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
