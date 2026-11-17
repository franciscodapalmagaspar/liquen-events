import "server-only";
import { listStateByPrefix } from "@/lib/app-state";
import { getSupabase } from "@/lib/supabase";
import type { Mapper } from "@/lib/repository";
import { BALDES_DO_BLOB, blobConfigurado, caminhoValido, ehBaldeDoBlob } from "./baldes";
import { PREFIXO_DO_INDICE, linhaValida, type LinhaDoIndice } from "./indice";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ÍNDICE DO BLOB NA CÓPIA DE SEGURANÇA (revisão de 17/11, n.º 7)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As linhas `blob:i:…` são a ÚNICA lista do que está no Vercel Blob: o Blob
 * nunca se lista no dia a dia. Uma base de dados reposta sem elas deixava os
 * ficheiros lá, pagos, e invisíveis — nenhuma listagem os mostrava e nenhuma
 * leitura os ia buscar. Por isso vão na cópia, como os rascunhos e os envios.
 *
 * A REPOSIÇÃO JUNTA, NÃO SUBSTITUI. Ao contrário dos outros conjuntos, nada
 * do índice actual se apaga: uma cópia de há dois meses não conhece os
 * ficheiros de ontem, e apagar-lhes a linha era escondê-los. Uma linha a mais
 * (de um ficheiro entretanto apagado) custa uma leitura que recua para o
 * Supabase e dá «não existe» — o mesmo que uma fotografia que falta.
 */

export interface LinhaNaCopia {
  key: string;
  value: LinhaDoIndice;
}

/** Uma chave do índice que a reposição pode escrever — e só essas. */
export function ehChaveDoIndice(key: unknown): key is string {
  if (typeof key !== "string" || !key.startsWith(PREFIXO_DO_INDICE)) return false;
  const resto = key.slice(PREFIXO_DO_INDICE.length);
  const barra = resto.indexOf("/");
  if (barra <= 0) return false;
  return ehBaldeDoBlob(resto.slice(0, barra)) && caminhoValido(resto.slice(barra + 1));
}

export const mapper: Mapper<LinhaNaCopia> = {
  table: "app_state",
  fileName: "app-state.json",
  getId: (l) => l.key,
  idColumn: "key",
  toRow: (l) => ({ key: l.key, value: l.value }),
  fromRow: (row) => ({ key: String(row.key ?? ""), value: row.value as LinhaDoIndice }),
};

const LIMITE = 50_000;

/**
 * Todas as linhas. LANÇA se a varredura não ficou inteira (nada de cópias com
 * ar de completas).
 *
 * SEM o token do Blob devolve `[]` SEM varrer (2.ª revisão de 17/11, n.º 4):
 * desligado, a cópia e o plano da reposição não fazem leitura nenhuma a mais
 * do que em `main`.
 */
export async function listIndiceDoBlob(): Promise<LinhaNaCopia[]> {
  if (!blobConfigurado()) return [];
  const tudo: LinhaNaCopia[] = [];
  for (const b of BALDES_DO_BLOB) {
    const { entradas, completa } = await listStateByPrefix<unknown>(
      `${PREFIXO_DO_INDICE}${b}/`,
      LIMITE,
    );
    if (!completa) {
      throw new Error(
        `não foi possível varrer o índice do Vercel Blob (chaves \`${PREFIXO_DO_INDICE}${b}/\` em app_state) inteiro.`,
      );
    }
    for (const { key, value } of entradas) {
      if (ehChaveDoIndice(key) && linhaValida(value)) tudo.push({ key, value });
    }
  }
  return tudo.sort((a, b) => a.key.localeCompare(b.key));
}

/** Escreve as linhas da cópia (por cima das iguais) sem apagar nenhuma. LANÇA se falhar. */
export async function juntarIndiceDoBlob(linhas: readonly LinhaNaCopia[]): Promise<void> {
  for (const l of linhas) {
    if (!ehChaveDoIndice(l.key) || !linhaValida(l.value)) {
      throw new Error(
        `a cópia traz uma linha do índice do Blob inválida ("${String(l.key).slice(0, 60)}") — nada foi escrito neste conjunto.`,
      );
    }
  }
  const sb = getSupabase();
  if (!sb) throw new Error("sem base de dados para repor o índice do Blob.");
  const agora = new Date().toISOString();
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await sb
      .from("app_state")
      .upsert(
        linhas.slice(i, i + 500).map((l) => ({ key: l.key, value: l.value, updated_at: agora })),
      );
    if (error) throw new Error(`o índice do Blob não ficou reposto: ${error.message}`);
  }
}
