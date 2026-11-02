"use client";

import { useState } from "react";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { Button, CampoData, FolhaOuDialogo } from "./ui";

/**
 * ── «MUDAR DE DIA…» — ARRASTAR NUNCA É O ÚNICO CAMINHO ────────────────────
 *
 * Parte 5 do `docs/APPLE-CALENDARIO.md`: «Alternativa por menu obrigatória:
 * `Mudar de dia…`». A mesma mudança do arrasto (`useArrastoDeMarcacoes`, com
 * «Anular»), escolhida num campo de data: quem usa o teclado ou o dedo chega
 * lá pelo menu da marcação.
 *
 * O dia escolhido vive aqui dentro: o componente é remontado por `key` a cada
 * marcação, e o calendário — que já está no limite do React Compiler — não
 * ganha mais estado.
 */
export default function MudarDeDia({
  marcacao,
  onFechar,
  onMudar,
}: {
  marcacao: CalendarEvent | null;
  onFechar: () => void;
  onMudar: (ev: CalendarEvent, dia: string) => void;
}) {
  const [dia, setDia] = useState(marcacao?.date ?? "");
  return (
    <FolhaOuDialogo
      aberto={!!marcacao}
      onFechar={onFechar}
      titulo={marcacao ? `Mudar «${marcacao.title}» de dia` : "Mudar de dia"}
      largura="sm"
      accoes={
        <>
          <Button variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!marcacao || !dia || dia === marcacao.date}
            onClick={() => {
              if (!marcacao) return;
              onFechar();
              onMudar(marcacao, dia);
            }}
          >
            Mudar
          </Button>
        </>
      }
    >
      {marcacao && <CampoData label="Novo dia" value={dia} onChange={setDia} />}
    </FolhaOuDialogo>
  );
}
