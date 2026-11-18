"use client";

import type { StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import type { CampoAMudar } from "@/lib/proposal-copy";
import { eCasamento } from "@/lib/proposal-evento";
import { Field } from "../../../ui";

/**
 * QUEM, QUANDO, ONDE (Fase 4 do redesenho, 10/11) — os campos do Evento.
 *
 * Eram oito caixas numa grelha só, pela ordem em que foram acrescentadas.
 * Agora três grupos com nome — os mesmos campos, as mesmas chaves
 * (`data-campo`), as mesmas marcas de «veio de fora» (`realce`).
 */
export function QuemQuandoOnde({
  confirmado,
  doc,
  isDeco,
  patch,
  realce,
}: {
  confirmado: (campo: CampoAMudar) => void;
  doc: StudioDoc;
  isDeco: boolean;
  patch: (p: Partial<StudioDoc>) => void;
  realce: (campo: CampoAMudar) => string | undefined;
}) {
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="min-w-0">
        <legend className="bo-eyebrow mb-2">Quem</legend>
        <div className="grid grid-cols-1 gap-4 @min-[26rem]:grid-cols-2">
          <Field
            label="Clientes"
            value={doc.clientNames ?? ""}
            onChange={(e) => {
              confirmado("clientNames");
              patch({ clientNames: e.target.value });
            }}
            containerClassName={realce("clientNames")}
            data-campo="clientNames"
            placeholder="Maria & Zé"
          />
          <Field
            label="Tipo de evento"
            value={doc.eventType ?? ""}
            onChange={(e) => {
              confirmado("eventType");
              patch({ eventType: e.target.value });
            }}
            containerClassName={realce("eventType")}
            data-campo="eventType"
            list="sug-tipos-de-evento"
            placeholder="Casamento, festa, jantar…"
            hint={
              eCasamento(doc.eventType)
                ? "Casamento: o PDF arruma os mood boards em Cerimónia, Cocktail, Jantar e Complementos."
                : "O PDF diz «Cliente», e cada mood board abre o seu capítulo, com o título que lhe deram."
            }
          />
          <Field
            label="Convidados"
            value={doc.guests ?? ""}
            onChange={(e) => {
              confirmado("guests");
              patch({ guests: e.target.value });
            }}
            containerClassName={realce("guests")}
            data-campo="guests"
            placeholder="150 pax"
          />
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="bo-eyebrow mb-2">Quando</legend>
        <div className="grid grid-cols-1 gap-4 @min-[26rem]:grid-cols-2">
          <Field
            label="Data"
            value={doc.eventDate ?? ""}
            onChange={(e) => {
              confirmado("eventDate");
              patch({ eventDate: e.target.value });
            }}
            containerClassName={realce("eventDate")}
            data-campo="eventDate"
            placeholder="12 de setembro de 2026"
          />
          {isDeco && (
            <Field
              label="Hora"
              value={doc.time ?? ""}
              onChange={(e) => {
                confirmado("time");
                patch({ time: e.target.value });
              }}
              containerClassName={realce("time")}
              data-campo="time"
              placeholder="A definir"
            />
          )}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="bo-eyebrow mb-2">Onde</legend>
        <div className="grid grid-cols-1 gap-4 @min-[26rem]:grid-cols-2">
          <Field
            label="Local"
            list="sug-locais"
            value={doc.location ?? ""}
            onChange={(e) => {
              confirmado("location");
              patch({ location: e.target.value });
            }}
            containerClassName={realce("location")}
            data-campo="location"
            placeholder="Monte da Oliveirinha"
          />
          {/* Só num casamento — ou se já tiver texto, para não o
            esconder de quem o escreveu. */}
          {isDeco && (eCasamento(doc.eventType) || (doc.ceremony ?? "").trim() !== "") && (
            <Field
              label="Cerimónia"
              value={doc.ceremony ?? ""}
              onChange={(e) => {
                confirmado("ceremony");
                patch({ ceremony: e.target.value });
              }}
              containerClassName={realce("ceremony")}
              data-campo="ceremony"
              placeholder="Civil, simbólica"
            />
          )}
        </div>
      </fieldset>
    </div>
  );
}
