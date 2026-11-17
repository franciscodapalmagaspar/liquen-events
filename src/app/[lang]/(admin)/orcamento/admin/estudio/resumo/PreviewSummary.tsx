"use client";

import { eur } from "@/lib/money";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { resolveProposalMoney, countPendingImages, isPendingImage } from "@/lib/proposal-doc";
import { Section } from "../formulario/Section";
import { PreviewThumb } from "./PreviewThumb";

/** Linha "rótulo → valor" para os resumos (pré-visualização e envio). */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--bo-hairline)] pb-1.5">
      <dt className="text-foreground/45">{label}</dt>
      <dd className="text-right text-[var(--bo-text)]">{value}</dd>
    </div>
  );
}

export function PreviewSummary({
  doc,
  assetUrls,
  assetOriginais,
  assetMedias,
  money,
  split,
  pctSinal,
}: {
  doc: StudioDoc;
  assetUrls: Record<string, string>;
  /** O ORIGINAL de cada foto — o último degrau da cascata das células. */
  assetOriginais: Record<string, string>;
  /** A derivada de 1200 px, o degrau do meio. Ver `assetMedias` no estúdio. */
  assetMedias: Record<string, string>;
  money: ReturnType<typeof resolveProposalMoney>;
  /** O sinal e o saldo, tal como `totaisDaProposta` os devolve. */
  split: { sinal: number; saldo: number };
  /** A percentagem do sinal DESTA proposta (`depositPercentOf`), não um 30 fixo. */
  pctSinal: number;
}) {
  // UMA capa no desenho novo: a primeira que houver (a segunda das propostas
  // antigas fica guardada e não sai no PDF — não se mostra como se saísse).
  const covers = (doc.coverImages ?? []).filter(Boolean).slice(0, 1) as string[];
  const groups = doc.serviceGroups.filter((g) => (g.title ?? "").trim() || g.items.length > 0);
  const extras = (doc.budgetExtras ?? []).filter(
    (e) => (e.label ?? "").trim() || (e.valueText ?? "").trim(),
  );
  /** Calculado aqui e não recebido: este resumo só conhece o documento. */
  const fotosPorConfirmar = countPendingImages(doc);
  return (
    <Section title="Resumo da proposta">
      <p className="-mt-2 mb-4 text-sm leading-relaxed text-[var(--bo-text-muted)]">
        Esta é a forma da proposta que o cliente vai receber. Para o documento completo, usa
        «Descarregar PDF».
      </p>

      {/* O resumo mostra as fotos a caminho esbatidas; dizer quantas são evita
          que um PDF gerado agora — que não as leva — pareça um erro. */}
      {fotosPorConfirmar > 0 && (
        <p
          aria-live="polite"
          className="-mt-2 mb-4 text-sm leading-relaxed text-[var(--bo-perigo)]"
        >
          {fotosPorConfirmar === 1
            ? "1 foto ainda está a entrar na proposta e não entra num PDF gerado agora."
            : `${fotosPorConfirmar} fotos ainda estão a entrar na proposta e não entram num PDF gerado agora.`}
        </p>
      )}

      {covers.length > 0 && (
        <div className="mb-5 max-w-sm">
          {covers.map((path, i) => (
            <PreviewThumb
              key={i}
              url={assetUrls[path]}
              planoB={[assetMedias[path], assetOriginais[path]]}
              pendente={isPendingImage(path)}
            />
          ))}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <SummaryRow label="Clientes" value={doc.clientNames || "—"} />
        <SummaryRow label="Tipo de evento" value={doc.eventType || "—"} />
        <SummaryRow label="Data" value={doc.eventDate || "—"} />
        <SummaryRow label="Local" value={doc.location || "—"} />
        {doc.guests ? <SummaryRow label="Convidados" value={doc.guests} /> : null}
      </dl>

      {groups.length > 0 && (
        <div className="mt-5">
          <p className="bo-eyebrow mb-2">Serviços</p>
          <ul className="flex flex-col gap-1 text-sm text-[var(--bo-tinta-72)]">
            {groups.map((g, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-foreground/40">{g.letter || `${i + 1}.`}</span>
                <span>
                  {g.title || "(sem título)"}
                  {g.items.length > 0 && (
                    <span className="text-foreground/40">
                      {" "}
                      · {g.items.length} {g.items.length === 1 ? "item" : "itens"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {extras.length > 0 && (
        <div className="mt-5">
          <p className="bo-eyebrow mb-2">Valores adicionais</p>
          <ul className="flex flex-col gap-1 text-sm text-[var(--bo-tinta-72)]">
            {extras.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span>{e.label || "—"}</span>
                <span className="text-[var(--bo-text-muted)]">{e.valueText || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-4">
        {money.gross > 0 ? (
          <dl className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/50">Sem IVA</dt>
              <dd className="text-[var(--bo-text)]">{eur(money.base)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/50">IVA ({Math.round(money.vatRate * 100)}%)</dt>
              <dd className="text-[var(--bo-text)]">{eur(money.vat)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-[var(--bo-hairline)] pt-1.5">
              <dt className="font-medium text-[var(--bo-tinta-72)]">Com IVA</dt>
              <dd className="text-base text-[var(--bo-text)]">{eur(money.gross)}</dd>
            </div>
            {/* A PERCENTAGEM É A DO DOCUMENTO. Este resumo dizia «Sinal 30%»
                escrito à letra ao lado do valor certo: numa proposta a 40%
                mostrava 30% e o número de 40% — o mesmo defeito que o PDF e o
                portal já tinham corrigido, deixado para trás aqui. */}
            <div className="mt-1 flex items-baseline justify-between text-xs text-foreground/50">
              <dt>Sinal {pctSinal}%</dt>
              <dd>{eur(split.sinal)}</dd>
            </div>
            <div className="flex items-baseline justify-between text-xs text-foreground/50">
              <dt>Saldo {100 - pctSinal}%</dt>
              <dd>{eur(split.saldo)}</dd>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-foreground/40">
              Sobre o valor com IVA.
            </p>
          </dl>
        ) : (
          <p className="text-sm text-foreground/50">
            Ainda sem total. Define o valor no passo «Orçamento» → «Total e validade».
          </p>
        )}
      </div>
    </Section>
  );
}
