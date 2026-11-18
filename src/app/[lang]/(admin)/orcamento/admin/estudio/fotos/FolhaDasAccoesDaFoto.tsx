"use client";

import { FolhaOuDialogo } from "../../ui";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { ehPrimeiraDestrutiva, type AccaoDaFoto } from "./accoes-da-foto";

/** A folha do dedo: as acções da fotografia escritas por extenso. Ver `AccoesDaFoto`. */
export function FolhaDasAccoesDaFoto({
  aberta,
  aoFechar,
  nome,
  accoes,
}: {
  aberta: boolean;
  aoFechar: () => void;
  nome: string;
  accoes: readonly AccaoDaFoto[];
}) {
  return (
    <FolhaOuDialogo
      aberto={aberta}
      onFechar={aoFechar}
      titulo={nome}
      descricao="O que se pode fazer a esta fotografia."
      largura="sm"
    >
      <div className="flex flex-col">
        {accoes.map((a, i) => {
          const primeiraDestrutiva = ehPrimeiraDestrutiva(accoes, i);
          return (
            <button
              key={a.id}
              type="button"
              disabled={a.desativada}
              onClick={() => {
                aoFechar();
                a.onAccao();
              }}
              className={`alvo-toque !justify-start flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm  disabled:opacity-30 ${
                a.destrutiva
                  ? "text-[var(--bo-perigo)] hover:bg-[var(--bo-perigo)]/[0.07]"
                  : "text-[var(--bo-text)] hover:bg-[var(--bo-tinta-6)]"
              } ${primeiraDestrutiva ? "mt-1 border-t border-[var(--bo-hairline)] pt-3" : ""} ${ESTADO} ${PRESSAO}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] ${
                  a.activa
                    ? "bg-sage-600 text-white"
                    : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
                }`}
              >
                {a.glifo}
              </span>
              {a.rotulo}
            </button>
          );
        })}
      </div>
    </FolhaOuDialogo>
  );
}
