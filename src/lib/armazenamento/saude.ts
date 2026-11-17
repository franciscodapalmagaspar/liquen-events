import "server-only";
import { log } from "@/lib/logger";
import { BALDES_DO_BLOB, blobConfigurado } from "./baldes";
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
 *  - SEM o token: se a medição da noite registou um balde em modo `blob`, é
 *    um ERRO — esses ficheiros só estão no Blob, e sem o token deixam de
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

/**
 * `null` quando não há nada a dizer. Nunca lança.
 *
 * SEM o token não se lê NADA da base de dados (2.ª revisão de 17/11, n.º 4:
 * desligado, tem de ser igual a `main`). O erro «há ficheiros no Blob e não há
 * token» só se dá a partir de `blobEmUso`, um marcador que vem DENTRO de uma
 * leitura que já se faz (a ocupação do armazenamento, ver
 * `ocupacao-do-armazenamento.ts`): quem não o tiver à mão não o passa, e
 * sem token isto devolve `null` sem perguntar nada.
 */
export async function estadoDoBlob(blobEmUso?: boolean): Promise<EstadoDoBlob | null> {
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
    if (blobEmUso === true) {
      registarComTravao("sem-token", "blob: há ficheiros no Blob e não há token", {});
      return { avisos: [], erro: ERRO_SEM_TOKEN };
    }
    return null;
  } catch (e) {
    log.warn("blob: estado não apurado", { erro: String(e) });
    return null;
  }
}

/**
 * O marcador que a medição da noite guarda na ocupação: COM token e com os
 * modos LIDOS, «algum balde está em modo `blob`»; sem token, ou com a leitura
 * dos modos falhada (`modos: null`), fica o que estava — um `true` nunca
 * desce por uma leitura que não confirmou (3.ª revisão de 17/11, n.º 3).
 */
export function marcadorDoBlob(
  antes: boolean | undefined,
  modos: Readonly<Record<string, string>> | null,
  configurado: boolean,
): boolean | undefined {
  if (!configurado || !modos) return antes;
  return BALDES_DO_BLOB.some((b) => modos[b] === "blob");
}

const ALERTA_DIARIO_MS = 24 * 3600_000;
let alertadoEm = 0;

/**
 * Na medição da noite: o marcador diz que há ficheiros no Blob e o token não
 * está — é um ALERTA (`log.error`), uma vez por dia (3.ª revisão, n.º 3).
 */
export function alertarSemToken(marcador: boolean | undefined): void {
  if (marcador !== true || blobConfigurado()) return;
  if (Date.now() - alertadoEm < ALERTA_DIARIO_MS) return;
  alertadoEm = Date.now();
  log.error("blob: há ficheiros no Vercel Blob e o token não está configurado", null, {
    oQueFazer: "voltar a pôr BLOB_READ_WRITE_TOKEN (ligar o store ao projecto na Vercel)",
  });
}

/** Só para os testes. */
export function esquecerRegistos(): void {
  registadoEm.clear();
  alertadoEm = 0;
}
