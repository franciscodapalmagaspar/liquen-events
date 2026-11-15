"use client";

import { eur0 } from "@/lib/money";
import type { EventMetrics } from "@/lib/orcamento/dossier";

/**
 * Faixa de métricas do cockpit — Valor, Margem, % Pago, contagem decrescente e
 * RSVP. Graciosa quando faltam dados: cada célula cai para "—".
 *
 * ── CADA CÉLULA DIZ A BASE DE IVA EM QUE ESTÁ ────────────────────────────
 * O dinheiro que o cliente move (valor contratado, recebido) é COM IVA; a
 * margem é LÍQUIDA contra LÍQUIDA, porque o IVA não é receita nem é custo (ver
 * `EventMetrics.margin`). A célula da margem dizia «c/ IVA» sobre um número que
 * já era líquido e mostrava por baixo os custos brutos — quem tentava fechar a
 * conta de cabeça não conseguia e ficava sem saber qual dos números acreditar.
 * O rótulo segue o número, e os custos ao lado seguem a base da margem.
 */
interface Props {
  metrics: EventMetrics;
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    // `justify-start` e não `center`: as células sem subtítulo («Valor c/ IVA»,
    // «% Recebido») centravam e ficavam ~11 px abaixo das outras na mesma
    // fila. Os rótulos alinham-se pelo topo, como uma fila de indicadores.
    <div className="bo-card px-4 py-3.5 flex flex-col justify-start">
      <p className="text-foreground/30 text-[9px] tracking-[0.22em] uppercase mb-1.5">{label}</p>
      <p className={`text-lg font-semibold leading-none ${tone ?? "text-[var(--bo-text)]"}`}>
        {value}
      </p>
      {sub && <p className="text-foreground/35 text-[10px] mt-1">{sub}</p>}
    </div>
  );
}

export default function MetricStrip({ metrics }: Props) {
  const {
    contracted,
    margin,
    supplierCosts,
    supplierCostsNet,
    pctPaid,
    paid,
    countdownDays,
    rsvpConfirmed,
    rsvpTotal,
  } = metrics;

  // Contagem decrescente: rótulo + tom de urgência (esta semana / hoje / passou).
  let cdValue = "—";
  let cdSub: string | undefined;
  let cdTone: string | undefined;
  if (countdownDays !== null) {
    if (countdownDays === 0) {
      cdValue = "Hoje";
      cdTone = "text-[var(--bo-perigo)]";
    } else if (countdownDays > 0) {
      // «26 507» e não «26507»: o número escreve-se em pt-PT.
      cdValue = countdownDays.toLocaleString("pt-PT", { useGrouping: "always" });
      cdSub = countdownDays === 1 ? "dia" : "dias";
      cdTone = countdownDays <= 7 ? "text-[var(--bo-perigo)]" : undefined;
    } else {
      cdValue = Math.abs(countdownDays).toLocaleString("pt-PT", { useGrouping: "always" });
      cdSub = Math.abs(countdownDays) === 1 ? "dia (passou)" : "dias (passou)";
      cdTone = "text-foreground/40";
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Cell label="Valor c/ IVA" value={contracted > 0 ? eur0(contracted) : "—"} />
      <Cell
        label="Margem s/ IVA"
        value={supplierCosts > 0 ? eur0(margin) : "—"}
        sub={
          supplierCosts > 0 ? `custos s/ IVA ${eur0(supplierCostsNet)}` : "sem custos registados"
        }
        tone={
          supplierCosts > 0
            ? margin >= 0
              ? "text-sage-600"
              : "text-[var(--bo-perigo)]"
            : undefined
        }
      />
      {/* «% Recebido», e já não «% Pago».
          Esta célula lia o livro de faturas: era a fatia do contratado que
          estava FACTURADA E MARCADA COMO PAGA. Sem livro, passa a ser a fatia
          que está REGISTADA COMO RECEBIDA no painel de Pagamentos — a mesma
          conta do «Recebido» logo abaixo dela, e o mesmo número para todo o
          evento cujo dinheiro foi registado ali (que é o fluxo normal).
          O rótulo muda com ela: pôr um número novo debaixo do rótulo antigo é
          a maneira mais silenciosa de enganar quem o lê todos os dias. */}
      <Cell
        label="% Recebido"
        value={contracted > 0 ? `${Math.round(pctPaid * 100)}%` : "—"}
        sub={contracted > 0 ? `recebido ${eur0(paid)}` : undefined}
        tone={pctPaid >= 1 ? "text-sage-600" : undefined}
      />
      <Cell
        label={countdownDays !== null && countdownDays > 0 ? "Faltam" : "Evento"}
        value={cdValue}
        sub={cdSub}
        tone={cdTone}
      />
      <Cell
        label="RSVP"
        value={rsvpTotal > 0 ? `${rsvpConfirmed}/${rsvpTotal}` : "—"}
        sub={rsvpTotal > 0 ? "confirmados" : "sem lista"}
      />
    </div>
  );
}
