"use client";

import { FUSO_DO_ESTUDIO } from "@/lib/fuso";
import { type Quote } from "@/lib/orcamento/types";
import { linkDaConversa } from "@/lib/whatsapp";
import { type useToast } from "../../Toast";
import { SectionCard } from "../../ui";
import { ESTADO, PRESSAO } from "../../ui/movimento";

/** Como falar com o cliente (email, telefone, WhatsApp), as notas que ele
 *  deixou no pedido, e quando o submeteu. (Saiu do painel do pedido na fase 7 da
 *  estrutura do código, tal e qual.) */
export interface ContactoDoClienteProps {
  selected: Quote;
  toast: ReturnType<typeof useToast>["toast"];
}

export function ContactoDoCliente({ selected, toast }: ContactoDoClienteProps) {
  return (
    <>
      {/* Contacto — como falar com o cliente. */}
      <SectionCard eyebrow="Contacto" padding="sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <a
              href={`mailto:${selected.email}`}
              className={`alvo-toque !justify-start min-w-0 text-xs text-sage-600 hover:underline ${ESTADO} ${PRESSAO}`}
            >
              {/* O corte vive num filho: num `inline-flex` (o
                  que o `alvo-toque` faz do link no dedo) o
                  `truncate` no próprio link é inerte. */}
              <span className="min-w-0 truncate">{selected.email}</span>
            </a>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(selected.email);
                toast("Email copiado", "success");
              }}
              className={`alvo-toque shrink-0 text-foreground/25 ${ESTADO} ${PRESSAO} hover:text-[var(--bo-text-muted)]`}
              title="Copiar email"
              aria-label="Copiar email"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`tel:${selected.phone}`}
              className={`alvo-toque text-xs text-[var(--bo-tinta-72)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
            >
              {selected.phone}
            </a>
            {linkDaConversa(selected.phone) && (
              <a
                // Um número antigo sem +351 dava um link
                // partido — ver `linkDaConversa`.
                href={linkDaConversa(selected.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className={`alvo-toque shrink-0 gap-1 text-[10px] uppercase tracking-[0.08em] text-sage-600 ${ESTADO} ${PRESSAO} hover:opacity-80 inline-flex items-center`}
                title="Abrir conversa no WhatsApp"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.86-4.6-4.04-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.27.67 1.1 1.44 1.78.99.88 1.82 1.16 2.08 1.29.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.58.75 1.85.88.27.13.45.2.52.31.07.11.07.64-.17 1.32Z" />
                </svg>
                WhatsApp
              </a>
            )}
          </div>
          {selected.company && (
            <p className="text-xs text-[var(--bo-tinta-72)]">{selected.company}</p>
          )}
          {selected.nif && <p className="text-xs text-[var(--bo-tinta-72)]">NIF: {selected.nif}</p>}
        </div>
      </SectionCard>

      {/* Notas do cliente — contexto imediato, se existirem. */}
      {selected.notes && (
        <div>
          <p className="bo-eyebrow mb-2">Notas do Cliente</p>
          {/* `whitespace-pre-line`: o casal escreve em
              parágrafos, e «Linha 1 Linha 2» numa linha só
              era outra coisa (achado n.º 35). */}
          <p className="rounded-lg bg-[var(--bo-tinta-6)] p-3 text-xs leading-relaxed whitespace-pre-line text-[var(--bo-tinta-72)]">
            {selected.notes}
          </p>
        </div>
      )}

      <p className="text-[10px] text-foreground/50">
        Submetido em{" "}
        {new Date(selected.submittedAt).toLocaleString("pt-PT", {
          // Achado n.º 20: o servidor (UTC) e o browser (Lisboa) escreviam dias
          // diferentes entre a meia-noite e a uma — erro de hidratação.
          timeZone: FUSO_DO_ESTUDIO,
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </>
  );
}
