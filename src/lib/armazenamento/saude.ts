import "server-only";
import { getState } from "@/lib/app-state";
import { log } from "@/lib/logger";
import { BALDES_DO_BLOB, CHAVE_DOS_MODOS, blobConfigurado } from "./baldes";
import { modosValidos } from "./modos";
import { indiceDebaixoDe } from "./indice";
import { avisosDoBlob } from "./tectos";
import { usoAtual } from "./uso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O BACK OFFICE TEM DE SABER DO BLOB — os avisos e o erro (17/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Revisão de 17/11, n.os 6 e 7. Corre só dentro de leituras que JÁ existem (a
 * verificação do armazenamento, com cache de 60 s, e o espaço da importação) —
 * não há pedido novo ao servidor por causa disto.
 *
 *  - Com o token: os avisos dos tectos (`tectos.ts`), e um aviso se o
 *    contador não se lê (o travão está fechado e o Blob parado).
 *  - SEM o token: se algum balde ficou em modo `blob` com ficheiros no índice,
 *    é um ERRO — esses ficheiros só estão no Blob, e sem o token deixam de
 *    aparecer. Tirar ou trocar o token depois da migração faz isto.
 *
 * Cada situação vai também aos registos com `log.warn`, no máximo uma vez por
 * hora por instância (o travão dos registos).
 */

export interface EstadoDoBlob {
  avisos: string[];
  erro?: string;
}

export const ERRO_SEM_TOKEN =
  "Há ficheiros no Vercel Blob mas o token não está configurado (BLOB_READ_WRITE_TOKEN): " +
  "essas fotografias e PDF não aparecem até o token voltar.";

const INTERVALO_DOS_REGISTOS_MS = 3600_000;
const registadoEm = new Map<string, number>();

function registarComTravao(chave: string, mensagem: string, extra: Record<string, unknown>) {
  const antes = registadoEm.get(chave) ?? 0;
  if (Date.now() - antes < INTERVALO_DOS_REGISTOS_MS) return;
  registadoEm.set(chave, Date.now());
  log.warn(mensagem, extra);
}

/** `null` quando não há nada a dizer. Nunca lança. */
export async function estadoDoBlob(): Promise<EstadoDoBlob | null> {
  try {
    if (blobConfigurado()) {
      const uso = await usoAtual();
      if (!uso) {
        const aviso =
          "Vercel Blob: o contador do mês não se leu — o Blob está parado (escritas e leituras vão ao Supabase).";
        registarComTravao("contador", "blob: contador ilegível — travão fechado", {});
        return { avisos: [aviso] };
      }
      const avisos = avisosDoBlob(uso);
      if (avisos.length === 0) return null;
      registarComTravao(`avisos:${avisos.join("|")}`, "blob: perto (ou acima) do tecto", {
        avisos,
      });
      return { avisos };
    }
    // Sem token: só a linha dos modos (uma leitura) e, para um balde em
    // `blob`, uma linha do índice.
    const modos = modosValidos(await getState<unknown>(CHAVE_DOS_MODOS));
    for (const b of BALDES_DO_BLOB) {
      if (modos[b] !== "blob") continue;
      const { linhas, completa } = await indiceDebaixoDe(b, "", 1);
      if (linhas.size > 0 || !completa) {
        registarComTravao("sem-token", "blob: há ficheiros no Blob e não há token", { balde: b });
        return { avisos: [], erro: ERRO_SEM_TOKEN };
      }
    }
    return null;
  } catch (e) {
    log.warn("blob: estado não apurado", { erro: String(e) });
    return null;
  }
}

/** Só para os testes. */
export function esquecerRegistos(): void {
  registadoEm.clear();
}
