import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { preparar, type Tratamento } from "./imagens";
import { guardarFotoEditorial, lerFotoEditorialGuardada } from "@/lib/fotos-editoriais-guardadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTOGRAFIA JÁ TRATADA PARA A PÁGINA, GUARDADA (3/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO a 3/11, com a medição por rota (`comCpu`) e ela a trabalhar no
 * estúdio: cada PDF inteiro (`proposta-doc`) gastava **~10 s de processador**,
 * e cada «página real» desenhada (`pagina-do-rascunho`) ~1,4 s. Quase tudo é o
 * `preparar` (`imagens.ts`): recortar cada fotografia para a caixa, o fundo
 * «arrastado», o calor, os degradés, o grão e a JPEG final — para cada imagem
 * de cada página, a cada geração, com o mesmo resultado da vez anterior.
 *
 * O resultado é DETERMINÍSTICO: o grão usa uma semente fixa (`comGrao`), e o
 * resto são as mesmas operações do `sharp` sobre os mesmos bytes. Por isso
 * guardá-lo não muda um byte do PDF — só deixa de o refazer.
 *
 * Dois níveis, como nas fotografias reduzidas (`fotos-editoriais-guardadas`):
 *   · a MEMÓRIA desta instância (com tecto), para as gerações seguidas;
 *   · o ARMAZENAMENTO, para a instância nova — que é a de cada manhã, de cada
 *     pausa e de cada pico, e era onde se pagava tudo outra vez.
 *
 * A chave é o resumo dos BYTES de entrada mais a RECEITA completa (medidas,
 * largura da folha, tratamento e a versão abaixo). Outra fotografia, outra
 * caixa ou outro tratamento são outra chave — nunca se serve uma imagem velha.
 *
 * ⚠ {@link VERSAO_DO_TRATAMENTO} tem de mudar sempre que o `preparar` (ou o
 * que ele usa: `comGrao`, `QUENTE`, os degradés, a JPEG) mudar de resultado. O
 * teste `preparadas-guardadas.test.ts` prende o resultado de uma imagem de
 * referência e falha quando isso acontece, a lembrar de a mudar.
 */
export const VERSAO_DO_TRATAMENTO = "preparar-v1";

/** Tecto da memória desta instância. Uma proposta inteira cabe com folga. */
const TECTO_DA_MEMORIA = 96 * 1024 * 1024;

const memoria = new Map<string, Buffer>();
let ocupado = 0;

function lembrar(chave: string, jpeg: Buffer): void {
  if (memoria.has(chave)) return;
  memoria.set(chave, jpeg);
  ocupado += jpeg.byteLength;
  // A mais antiga sai primeiro (o `Map` guarda a ordem de entrada).
  for (const [k, v] of memoria) {
    if (ocupado <= TECTO_DA_MEMORIA) break;
    memoria.delete(k);
    ocupado -= v.byteLength;
  }
}

/** Para os testes. */
export function esquecerPreparadas(): void {
  memoria.clear();
  ocupado = 0;
}

/** A receita que entra na chave — tudo o que muda o resultado do `preparar`. */
export function receitaDoTratamento(
  w: number,
  h: number,
  larguraFolha: number,
  t: Tratamento,
): string {
  return `${VERSAO_DO_TRATAMENTO}|${Math.round(w)}x${Math.round(h)}|${larguraFolha}|${JSON.stringify(t)}`;
}

/**
 * O mesmo que o {@link preparar}, mas sem refazer o que já foi feito.
 * Nunca lança por causa do armazenamento: se ler ou guardar falhar, faz-se
 * como antes.
 */
export async function prepararGuardado(
  bytes: Buffer,
  w: number,
  h: number,
  larguraFolha: number,
  t: Tratamento = {},
): Promise<Buffer | null> {
  const resumo = createHash("sha256").update(bytes).digest("hex");
  const ref = `preparada:${resumo}`;
  const receita = receitaDoTratamento(w, h, larguraFolha, t);
  const chave = `${receita}|${resumo}`;

  const naMemoria = memoria.get(chave);
  if (naMemoria) return naMemoria;

  const guardada = await lerFotoEditorialGuardada(ref, receita);
  if (guardada) {
    lembrar(chave, guardada);
    return guardada;
  }

  const feita = await preparar(bytes, w, h, larguraFolha, t);
  if (feita) {
    lembrar(chave, feita);
    // Guardar não atrasa a página: corre depois de a resposta sair (`after`).
    // Fora de um pedido (testes, scripts) o `after` não existe, e guarda-se já.
    const guardar = () => guardarFotoEditorial(ref, receita, feita);
    try {
      after(guardar);
    } catch {
      await guardar();
    }
  }
  return feita;
}
