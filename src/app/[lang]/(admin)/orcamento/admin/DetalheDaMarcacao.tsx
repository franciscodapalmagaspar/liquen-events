"use client";

import type { CalendarEvent } from "@/lib/orcamento/types";
import { comMaiuscula, diaPorExtenso } from "@/lib/data-curta";
import { Button, FolhaOuDialogo } from "./ui";
import { GlifoDoTipo, TIPO_META } from "./CalendariosFiltraveis";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DETALHE DE UMA MARCAÇÃO — o que um toque abre
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (15/11): um toque numa marcação abria logo «Remover …?». Num
 * telemóvel, um toque é a forma de PERGUNTAR o que é aquilo — e a resposta era
 * uma pergunta destrutiva. Passa a abrir isto: o título, o dia e a hora, o
 * tipo e a nota, e as acções, com «Remover» lá dentro.
 *
 * ── O QUE NÃO MUDOU ───────────────────────────────────────────────────────
 *
 *  · «Remover» continua a passar pela pergunta da casa (`PerguntaDestrutiva`)
 *    e pela Reciclagem — quem decide isso é o `Calendario.tsx`, e aqui só se
 *    PEDE (`onRemover`).
 *  · O toque longo e o botão direito continuam a abrir o menu de contexto, e a
 *    tecla Delete numa marcação com foco continua a abrir a pergunta.
 *  · Arrastar para outro dia continua no `useArrastoDeMarcacoes`.
 *
 * Folha no telemóvel, diálogo no computador — o `FolhaOuDialogo` da casa, o
 * mesmo do «Mudar de dia…». Opaco: o vidro deste ecrã é o do cabeçalho.
 */
export default function DetalheDaMarcacao({
  marcacao,
  onFechar,
  onRemover,
  onMudarDeDia,
  onVerNaVistaDeDia,
}: {
  marcacao: CalendarEvent | null;
  onFechar: () => void;
  onRemover: (ev: CalendarEvent) => void;
  onMudarDeDia: (ev: CalendarEvent) => void;
  onVerNaVistaDeDia: (ev: CalendarEvent) => void;
}) {
  const ev = marcacao;
  const tipo = ev ? TIPO_META[ev.kind] : null;
  return (
    <FolhaOuDialogo
      aberto={!!ev}
      onFechar={onFechar}
      titulo={ev?.title ?? "Marcação"}
      sobretitulo={tipo?.label}
      largura="sm"
      // Só «Remover» no rodapé: o fecho é o «Fechar» da própria folha (e o
      // Escape, o fundo e o arrasto para baixo), como em todas as da casa.
      accoes={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              if (!ev) return;
              // Fecha primeiro: a pergunta é outra folha, e duas empilhadas
              // no telemóvel tapam a grelha toda.
              onFechar();
              onRemover(ev);
            }}
          >
            {/* A cor num `span`: o `cn()` da casa não funde classes, e um
                `text-*` ao lado do da variante ficava à sorte da ordem do CSS. */}
            <span className="text-[var(--bo-perigo)]">Remover</span>
          </Button>
        </>
      }
    >
      {ev && tipo && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--bo-text-muted)]">Dia</dt>
            <dd className="text-[var(--bo-text)]">
              {comMaiuscula(diaPorExtenso(ev.date, { ano: true }))}
            </dd>
            <dt className="text-[var(--bo-text-muted)]">Hora</dt>
            <dd className="tabular-nums text-[var(--bo-text)]">{ev.time || "Dia inteiro"}</dd>
            <dt className="text-[var(--bo-text-muted)]">Tipo</dt>
            <dd className="flex items-center gap-2 text-[var(--bo-text)]">
              <GlifoDoTipo kind={ev.kind} />
              {tipo.label}
            </dd>
            {ev.note ? (
              <>
                <dt className="text-[var(--bo-text-muted)]">Nota</dt>
                <dd className="whitespace-pre-wrap break-words text-[var(--bo-text)]">{ev.note}</dd>
              </>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onFechar();
                onMudarDeDia(ev);
              }}
            >
              Mudar de dia…
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onFechar();
                onVerNaVistaDeDia(ev);
              }}
            >
              Ver na vista de dia
            </Button>
          </div>
        </div>
      )}
    </FolhaOuDialogo>
  );
}
