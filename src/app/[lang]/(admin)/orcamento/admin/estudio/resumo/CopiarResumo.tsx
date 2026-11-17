"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "../../Toast";
import { Button } from "../../ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BOTÃO «COPIAR RESUMO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três ou quatro linhas prontas a colar no WhatsApp (o texto já vem pronto de
 * fora — `resumoDaPropostaParaCopiar` — este componente só sabe COPIAR, e o
 * que fazer quando copiar falha).
 *
 * ── QUANDO A ÁREA DE TRANSFERÊNCIA FALHA ───────────────────────────────────
 * O Safari recusa `navigator.clipboard.writeText` fora de um gesto directo do
 * utilizador (um `await` a mais pelo meio já chega para deixar de contar como
 * um), e há quem tenha as permissões desligadas. Nenhum dos dois pode virar um
 * erro seco: o texto fica visível E SELECCIONADO, pronto a copiar à mão com
 * Cmd/Ctrl+C — nunca uma mensagem a mandá-la "tentar outra vez" sem dar outra
 * saída.
 */
export function CopiarResumo({ texto }: { texto: string }) {
  const { toast } = useToast();
  const [falhou, setFalhou] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  async function copiar() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Sem área de transferência.");
      await navigator.clipboard.writeText(texto);
      setFalhou(false);
      toast("Resumo copiado.", "success");
    } catch {
      setFalhou(true);
    }
  }

  // A caixa só aparece quando falhou, e é aí que o texto se selecciona
  // sozinho — é o gesto que substitui o botão que não funcionou.
  useEffect(() => {
    if (falhou) areaRef.current?.select();
  }, [falhou]);

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => void copiar()}>
        Copiar resumo
      </Button>
      {falhou && (
        <div className="mt-2 max-w-md rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] p-3">
          <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
            Não foi possível copiar automaticamente. O texto está seleccionado: copia com
            Cmd/Ctrl+C.
          </p>
          <textarea
            ref={areaRef}
            aria-label="Resumo da proposta, para copiar à mão"
            readOnly
            value={texto}
            onFocus={(e) => e.currentTarget.select()}
            rows={4}
            className="bo-input mt-2 w-full px-3 py-2 text-xs text-[var(--bo-text)]"
          />
        </div>
      )}
    </div>
  );
}
