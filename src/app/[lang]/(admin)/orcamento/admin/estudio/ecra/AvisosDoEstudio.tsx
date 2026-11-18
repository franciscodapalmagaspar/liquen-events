"use client";

import { ESTADO, PRESSAO } from "../../ui/movimento";
import { Button } from "../../ui";
import CriarAPartirDe from "../../CriarAPartirDe";
import { useEstudio } from "../contexto";

export function AvisosDoEstudio() {
  const {
    avisos: { toast },
    confirmacoes: { anularLimpeza, confirmarDinheiro },
    copia: {
      aplicarCopia,
      copiaSubstitui,
      copiarAberto,
      guardarComoModelo,
      nomeModelo,
      setCopiarAberto,
      setNomeModelo,
    },
    documento: { doc },
    pedido: { quote },
    reversiveis: { confirmacaoDeDinheiro, limpo, setConfirmacaoDeDinheiro },
  } = useEstudio();
  return (
    <>
      {limpo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2">
          <span className="text-xs text-[var(--bo-tinta-72)]">
            {limpo.motivo} Pode anular durante {limpo.segundos}s.
          </span>
          <button
            type="button"
            className={`alvo-toque text-xs font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
            onClick={anularLimpeza}
          >
            Anular
          </button>
        </div>
      )}

      {/* ── A PERGUNTA COM OS DOIS NÚMEROS À VISTA ─────────────────────────
          Fica no topo do estúdio e não ao lado do botão que a levantou: as
          acções que mexem no dinheiro estão espalhadas por três secções (o
          «Usar X €», a deslocação do painel interno, o «×» de um valor
          adicional) e uma pergunta que aparece cada vez noutro sítio é uma
          pergunta que se responde sem procurar o que ela diz. Aqui é sempre
          o mesmo sítio, e é o primeiro que se vê.

          `assertive` porque interrompe mesmo: é uma pergunta, e ficar à espera
          de resposta sem ser anunciada seria deixar quem usa leitor de ecrã a
          carregar num botão que não fez nada. */}
      {confirmacaoDeDinheiro && confirmacaoDeDinheiro.docNoMomento === doc && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label="Confirmar alteração ao valor"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bo-aviso-tom)]/45 bg-[var(--bo-aviso-tom)]/[0.08] px-3 py-2.5"
        >
          <span className="min-w-[12rem] flex-1 text-xs leading-relaxed text-[var(--bo-text)]">
            {confirmacaoDeDinheiro.pergunta}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setConfirmacaoDeDinheiro(null)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={confirmarDinheiro}>
            Substituir
          </Button>
        </div>
      )}

      {nomeModelo !== null && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-3">
          <label className="flex-1 min-w-[14rem]">
            <span className="bo-eyebrow">Nome do modelo</span>
            <input
              autoFocus
              value={nomeModelo}
              onChange={(e) => setNomeModelo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardarComoModelo(nomeModelo);
                if (e.key === "Escape") setNomeModelo(null);
              }}
              placeholder="Casamento standard"
              className="bo-input mt-1 w-full px-3 py-2 text-sm"
            />
          </label>
          <Button
            size="sm"
            disabled={!nomeModelo.trim()}
            onClick={() => void guardarComoModelo(nomeModelo)}
          >
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNomeModelo(null)}>
            Cancelar
          </Button>
        </div>
      )}

      <CriarAPartirDe
        open={copiarAberto}
        onClose={() => setCopiarAberto(false)}
        quoteId={quote.id}
        clienteAtual={quote.name ?? ""}
        onEscolhido={aplicarCopia}
        toast={toast}
        substitui={copiaSubstitui}
      />
    </>
  );
}
