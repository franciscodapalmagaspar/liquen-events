"use client";

import type { Quote, ActivityEntry } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "@/lib/orcamento/data";
import { ActivityLog } from "../../lazy";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { linkDaConversa } from "@/lib/whatsapp";

/**
 * Coluna lateral do Dossier — Contacto (só leitura) + factos do Evento,
 * levantados da marcação do drawer, mais o registo de atividade (ActivityLog).
 * A edição dos factos vive nas zonas/ferramentas; aqui é referência rápida.
 */
interface Props {
  quote: Quote;
  actor: string;
  /** Devolve se ficou gravada — ver `ActivityLog`, que só limpa a caixa
   *  quando ficou. */
  onAddEntry: (entry: ActivityEntry) => Promise<boolean>;
}

export default function DossierAside({ quote, actor, onAddEntry }: Props) {
  const facts: { l: string; v?: string | null }[] = [
    { l: "Tipo", v: CATEGORIES.find((c) => c.id === quote.category)?.label },
    {
      l: "Sub-tipo",
      v:
        quote.category && quote.eventType
          ? EVENT_TYPES_BY_CATEGORY[quote.category]?.find((e) => e.id === quote.eventType)?.label
          : null,
    },
    { l: "Pacote", v: PACKAGES.find((p) => p.id === quote.packageTier)?.label },
    { l: "Duração", v: quote.duration ? `${quote.duration}h` : null },
    { l: "Convidados", v: quote.guests ? String(quote.guests) : null },
    { l: "Local", v: quote.location || null },
  ];

  // Um número antigo sem +351 dava um link partido — ver `linkDaConversa`.
  const wa = linkDaConversa(quote.phone);

  return (
    /* ── TRÊS MOLDURAS A SEGUIR A TRÊS MOLDURAS ───────────────────────────────
       Abaixo de 1024 este painel cai POR BAIXO do conteúdo: quem chega aqui no
       telemóvel acabou de rolar as três zonas e encontra mais três caixas
       iguais, cada uma com 40 px de enchimento e 2 de borda. A moldura sai
       abaixo de 640 e fica um risco no lugar dela — a mesma decisão das zonas
       (ver o cabeçalho do `FinanceZone`), pela mesma conta: ~126 px de altura e
       ~40 de largura devolvidos. A partir de 640 volta o cartão. */
    <div className="flex flex-col gap-[var(--bo-gap-vista)]">
      {/* Contacto */}
      <div className="border-t border-[var(--bo-hairline)] pt-[var(--bo-p-cartao)] sm:rounded-[var(--bo-radius-lg)] sm:border sm:bg-[var(--bo-surface)] sm:p-[var(--bo-p-cartao)]">
        <p className="bo-eyebrow mb-3">Contacto</p>
        {/* ── OS TRÊS ALVOS QUE SÓ EXISTEM NO TELEMÓVEL ──────────────────────
            Medidos a 375 px: o email 301×16, o telefone 63×16, o WhatsApp
            76×19. Dezasseis píxeis de altura — pouco mais de um terço do
            mínimo — em três links que são, dos alvos deste dossier, os que
            MAIS pertencem a um telemóvel: `mailto:`, `tel:` e o WhatsApp
            abrem a aplicação do aparelho. Num portátil são texto que se lê;
            aqui são a forma de ligar ao cliente.

            `alvo-toque` põe o chão de 44 px onde se toca. `!justify-start`
            porque a classe centra o conteúdo por omissão (é feita para botões
            de ícone) e estes são itens de uma coluna `flex`, portanto
            esticados à largura do cartão: sem isto o email saltava para o meio
            da caixa. É o mesmo par que a gaveta de navegação já usa.

            A letra e a cor não mudam — cresce a CAIXA, não o desenho. */}
        <div className="flex flex-col gap-2">
          <a
            href={`mailto:${quote.email}`}
            className={`alvo-toque !justify-start text-sage-600 text-xs hover:underline ${ESTADO} ${PRESSAO}`}
          >
            {/* O `truncate` mudou-se para cá: num `inline-flex` (que é o que o
                `alvo-toque` faz do link) o corte com reticências não pega no
                próprio link — precisa de um filho que possa encolher, daí o
                `min-w-0`. Antes estava no `<a>`, onde era inerte. */}
            <span className="min-w-0 truncate">{quote.email}</span>
          </a>
          {quote.phone && (
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`tel:${quote.phone}`}
                className={`alvo-toque !justify-start text-[var(--bo-text-muted)] text-xs hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
              >
                {quote.phone}
              </a>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className={`alvo-toque !justify-start inline-flex items-center gap-1 text-sage-600 text-[10px] tracking-[0.08em] uppercase hover:opacity-80 ${ESTADO} ${PRESSAO}`}
                title="Abrir conversa no WhatsApp"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.86-4.6-4.04-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.27.67 1.1 1.44 1.78.99.88 1.82 1.16 2.08 1.29.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.58.75 1.85.88.27.13.45.2.52.31.07.11.07.64-.17 1.32Z" />
                </svg>
                WhatsApp
              </a>
            </div>
          )}
          {quote.company && <p className="text-foreground/40 text-xs">{quote.company}</p>}
          {quote.nif && <p className="text-foreground/30 text-xs">NIF: {quote.nif}</p>}
        </div>
      </div>

      {/* Factos do evento */}
      {/* `@container` e não `sm:`: a pergunta é «cabem duas colunas NESTE
          painel?», e o painel não tem a largura da janela — a 375 px é o ecrã
          quase todo (343), mas no computador é uma coluna de 20 rem, ou seja
          280 px de conteúdo. Um `sm:` respondia à janela e acertava no
          telemóvel por acidente enquanto errava no sítio onde o painel é mais
          estreito. Duas colunas assim que houver 15 rem de caixa (~114 px por
          coluna, que é o mínimo em que «Casamento» cabe numa linha); abaixo
          disso, uma. */}
      <div className="@container border-t border-[var(--bo-hairline)] pt-[var(--bo-p-cartao)] sm:rounded-[var(--bo-radius-lg)] sm:border sm:bg-[var(--bo-surface)] sm:p-[var(--bo-p-cartao)]">
        <p className="bo-eyebrow mb-3">Evento</p>
        <div className="grid grid-cols-1 @min-[15rem]:grid-cols-2 gap-3">
          {facts.map(({ l, v }) => (
            <div key={l}>
              <p className="text-foreground/25 text-[9px] tracking-wide uppercase mb-0.5">{l}</p>
              <p className="text-[var(--bo-text-muted)] text-xs">{v ?? "—"}</p>
            </div>
          ))}
        </div>
        {quote.notes && (
          <div className="mt-4 pt-3 border-t border-[var(--bo-hairline)]">
            <p className="text-foreground/25 text-[9px] tracking-wide uppercase mb-1">
              Notas do cliente
            </p>
            <p className="text-foreground/45 text-xs leading-relaxed whitespace-pre-line">
              {quote.notes}
            </p>
          </div>
        )}
      </div>

      {/* Registo de atividade */}
      <div className="border-t border-[var(--bo-hairline)] pt-[var(--bo-p-cartao)] sm:rounded-[var(--bo-radius-lg)] sm:border sm:bg-[var(--bo-surface)] sm:p-[var(--bo-p-cartao)]">
        <ActivityLog quote={quote} actor={actor} onAddEntry={onAddEntry} />
      </div>
    </div>
  );
}
