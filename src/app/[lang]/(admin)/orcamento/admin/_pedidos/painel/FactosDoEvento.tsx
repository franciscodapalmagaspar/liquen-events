"use client";

import {
  CATEGORIES,
  EVENT_TYPES_BY_CATEGORY,
  PACKAGES,
  ceremonyTypeLabel,
  coordenacaoLabel,
  guestRangeLabel,
  spaceTypeLabel,
} from "@/lib/orcamento/data";
import { rotularPontos } from "@/lib/orcamento/decoracao";
import { usePedidoAberto } from "./pedido-aberto";

/** Os factos do evento, compactos e só de leitura — o contexto por cima do
 *  formulário. (Saíram da gestão do pedido na fase 7 da estrutura do código.) */

export function FactosDoEvento() {
  const { selected } = usePedidoAberto();
  return (
    <>
      {/* Factos do evento — contexto compacto, só leitura. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--bo-text-muted)]">
        {[
          {
            l: "Tipo",
            v: CATEGORIES.find((c) => c.id === selected.category)?.label,
          },
          {
            l: "Sub-tipo",
            v:
              selected.category && selected.eventType
                ? EVENT_TYPES_BY_CATEGORY[selected.category]?.find(
                    (e) => e.id === selected.eventType,
                  )?.label
                : null,
          },
          {
            l: "Pacote",
            v: PACKAGES.find((p) => p.id === selected.packageTier)?.label,
          },
          {
            l: "Duração",
            v: selected.duration ? `${selected.duration}h` : null,
          },
          {
            l: "Extras",
            v: selected.addons?.length ? `${selected.addons.length} serviços` : null,
          },
          {
            // Sem número exacto, a ordem de grandeza. Um
            // pedido a dizer só "por definir" não deixa
            // decidir nada; "~ 100 a 150" deixa.
            l: "Convidados",
            v: selected.guests
              ? null
              : guestRangeLabel(selected.guestsRange)
                ? `~ ${guestRangeLabel(selected.guestsRange)}`
                : null,
          },
          {
            // Interior ou exterior. Fica ao lado do
            // local porque é a continuação da mesma
            // pergunta — e porque é o que diz se há uma
            // montagem alternativa a preparar.
            l: "Espaço",
            v: spaceTypeLabel(selected.spaceType) || null,
          },
          {
            // Civil, religiosa ou as duas: é o que diz se
            // são dois sítios para montar num só dia.
            l: "Cerimónia",
            v: ceremonyTypeLabel(selected.ceremonyType) || null,
          },
          {
            // Pedido dela, 25/10: se também querem
            // que a equipa coordene o dia.
            l: "Coordenação do dia",
            v: coordenacaoLabel(selected.dayCoordination) || null,
          },
          {
            // O que o casal marcou no pedido. Aparece
            // aqui em cima, com a data e o local, porque
            // é o que decide o desenho da proposta e não
            // se pode ficar a saber só ao abri-la.
            l: "Decoração",
            v: rotularPontos(selected.decorPoints ?? [], "pt").join(" · ") || null,
          },
        ]
          .filter((f) => f.v)
          .map(({ l, v }) => (
            <span key={l}>
              <span className="uppercase tracking-wide text-foreground/40 text-[9px] mr-1">
                {l}
              </span>
              {v}
            </span>
          ))}
      </div>
    </>
  );
}
