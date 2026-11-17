"use client";

import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { MAX_THEME_NAME, type ThemeSummary } from "@/lib/theme-types";
import { dataPorExtenso, desdeQuando, plural } from "../../../../../../lib/temas/textos-dos-temas";
import { SugestaoDeNome } from "../SugestaoDeNome";
import { Button, MenuDeAccoes, type AccaoDeItem } from "../ui";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { PlusIcon } from "./icones";

/** O cabeçalho da pasta de um tema: o nome (que se renomeia ali), as contas,
 *  as notas, «Adicionar fotos» e o menu do tema. (Saiu da pasta do tema na fase
 *  8 da estrutura do código, tal e qual.) */
export interface CabecalhoDaPastaProps {
  theme: ThemeSummary;
  accoes: readonly AccaoDeItem[];
  usos: Record<string, number> | null | undefined;
  loading: boolean;
  uploadingCount: number;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  renaming: boolean;
  setRenaming: Dispatch<SetStateAction<boolean>>;
  inputRef: RefObject<HTMLInputElement | null>;
  rename: () => Promise<void>;
  leave: () => void;
  countLine: string;
}

export function CabecalhoDaPasta({
  theme,
  accoes,
  usos,
  loading,
  uploadingCount,
  name,
  setName,
  renaming,
  setRenaming,
  inputRef,
  rename,
  leave,
  countLine,
}: CabecalhoDaPastaProps) {
  return (
    <>
      {/* ══════════════════════════════════════════════════════════════
          O CABEÇALHO DO TEMA (9/11)
          ══════════════════════════════════════════════════════════════

          Ela: «melhora mesmo imenso essa parte dos temas. quero mesmo algo
          incrível». O tema abria com o nome em `text-xl` e «3 fotos» em letra
          de 12 px ao lado — o cabeçalho de uma pasta, não de uma colecção.

          Agora é o título da vista, no degrau `title1` da casa, e por baixo
          UMA linha que responde ao que se pergunta antes de escolher fotos:
          quantas tem, quantas vezes já saiu numa proposta, e quando lhe
          tocaram. A nota do tema, quando a há, vem logo a seguir — é a frase
          que ela escreveu para se lembrar do que o tema é. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-3 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* ── «← TEMAS» DESAPARECE NO SPLIT VIEW ──────────────────────
              Parte 6 do `docs/APPLE-TEMAS.md`, à letra: «← Temas →
              (desaparece — split view)». A partir de `lg` o caminho de volta
              é o «Todos os temas» da coluna da esquerda, e ter os dois seria
              duas saídas com nomes diferentes para o mesmo sítio.

              Abaixo de `lg` a coluna não existe, e este botão é o único
              caminho — por isso não sai, esconde-se onde há substituto. */}
            <Button variant="ghost" size="sm" onClick={leave} className="lg:hidden">
              ← Temas
            </Button>
            {renaming ? (
              <div>
                <input
                  autoFocus
                  value={name}
                  maxLength={MAX_THEME_NAME}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={rename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename();
                    if (e.key === "Escape") {
                      setName(theme.name);
                      setRenaming(false);
                    }
                  }}
                  aria-label="Nome do tema"
                  className="bo-input px-3 py-1.5 text-sm text-[var(--bo-text)]"
                />
                <SugestaoDeNome valor={name} onAceitar={setName} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className={`alvo-toque text-left font-display text-title2 text-[var(--bo-text)] hover:text-sage-600 sm:text-title1 ${ESTADO} ${PRESSAO}`}
                title="Renomear tema"
              >
                {theme.name}
              </button>
            )}
          </div>
          <p
            className="mt-1 text-footnote tabular-nums text-[var(--bo-text-muted)]"
            aria-live="polite"
          >
            {loading ? "A ler a pasta…" : countLine}
            {usos && !loading
              ? usos[theme.id]
                ? ` · usado em ${plural(usos[theme.id], "proposta", "propostas")}`
                : " · nunca usado numa proposta"
              : ""}
            {!loading && desdeQuando(theme.updatedAt) ? (
              <span title={dataPorExtenso(theme.updatedAt)}>
                {` · alterado ${/^\d/.test(desdeQuando(theme.updatedAt) ?? "") ? "a " : ""}${desdeQuando(theme.updatedAt)}`}
              </span>
            ) : null}
            {theme.favorito ? (
              <span className="text-[var(--bo-accent)]">
                {" · "}
                <span aria-hidden="true">★ </span>Favorito
              </span>
            ) : null}
          </p>
          {theme.notes?.trim() ? (
            <p className="mt-2 max-w-prose text-callout text-[var(--bo-tinta-72)]">{theme.notes}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            iconLeft={PlusIcon}
            loading={uploadingCount > 0}
            onClick={() => inputRef.current?.click()}
          >
            Adicionar fotos
          </Button>
          {/* ── «ELIMINAR TEMA» SAIU DAQUI ───────────────────────────────
              T3 do `docs/PROPOSTAS-E-TEMAS-APPLE.md` e ponto 20 da auditoria
              do `APPLE-TEMAS.md`: era um botão de texto encostado a
              «Adicionar fotos» — uma acção destrutiva com o peso de um link,
              ao lado da acção principal. Passa para o «⋯» das acções do
              tema, a vermelho e no fim, com a confirmação que diz o custo.
              O «⋯» está sempre à vista: aqui não há linha nenhuma a cujo
              hover ele pudesse responder. */}
          <MenuDeAccoes accoes={accoes} sobre={theme.name} sempreVisivel />
        </div>
      </div>
    </>
  );
}
