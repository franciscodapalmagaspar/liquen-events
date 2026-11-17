"use client";

import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { MAX_THEME_NAME, MAX_THEME_NOTES } from "@/lib/theme-types";
import { SugestaoDeNome } from "../SugestaoDeNome";
import { Button, Card, Field } from "../ui";

/** O cartão de criar um tema novo, com a sugestão de nome e o aviso de tema
 *  parecido. (Saiu da Biblioteca de Temas na fase 8 da estrutura do código,
 *  tal e qual.) */
export interface NovoTemaProps {
  adding: boolean;
  caixaDoNovoTema: RefObject<HTMLDivElement | null>;
  newName: string;
  setNewName: Dispatch<SetStateAction<string>>;
  newNotes: string;
  setNewNotes: Dispatch<SetStateAction<string>>;
  saving: boolean;
  create: () => Promise<void>;
}

export function NovoTema({
  adding,
  caixaDoNovoTema,
  newName,
  setNewName,
  newNotes,
  setNewNotes,
  saving,
  create,
}: NovoTemaProps) {
  return (
    <>
      {adding && (
        <Card padding="sm" className="@container mb-6">
          {/* Duas colunas quando o CARTÃO as comporta, não quando a janela as
              comporta. Era `sm:grid-cols-2`, e o cartão não tem a largura da
              janela: tira-lhe o `px` da vista e os 34 px da moldura e do `p-4`
              dele, e a partir de `lg` mais os 256 px da barra lateral. O
              limiar em contentor que reproduz o corte de hoje é 36rem — 576 px
              de cartão dão duas colunas de 280 px, que é o que ele já dava a
              640 px de janela —, com a diferença de continuar a valer se este
              cartão alguma vez for para uma coluna estreita. */}
          <div className="grid grid-cols-1 gap-4 @min-[36rem]:grid-cols-2">
            <div ref={caixaDoNovoTema}>
              <Field
                label="Nome do tema"
                required
                maxLength={MAX_THEME_NAME}
                value={newName}
                disabled={saving}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Terracotta, Itália, Branco & Verde"
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
              />
              {/* A sugestão de grafia, no momento em que a atenção já está no
                  campo. Depois de gravar é tarde: o nome fica no índice por
                  onde ela procura. */}
              <SugestaoDeNome valor={newName} onAceitar={setNewName} />
            </div>
            <Field
              label="Nota (opcional)"
              maxLength={MAX_THEME_NOTES}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Ex.: tons quentes, para espaços de pedra"
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={create} loading={saving} disabled={!newName.trim() || saving}>
              Criar tema
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
