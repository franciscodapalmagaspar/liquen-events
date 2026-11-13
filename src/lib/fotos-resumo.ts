import "server-only";
import { createHash } from "crypto";
import { getState, getStates, setState } from "@/lib/app-state";
import { getSupabase } from "@/lib/supabase";
import { getTheme } from "@/lib/themes-store";
import { PROPOSAL_BUCKET } from "@/lib/proposal-assinaturas";
import { isFingerprint, FINGERPRINT_HEX } from "@/lib/theme-fingerprint";
import { THEME_BUCKET, caminhoDoRefDeTema, ehRefDeTema, refDeTema } from "@/lib/theme-ref";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTOGRAFIA NUNCA SE GUARDA DUAS VEZES (13/11, pedido dele)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O armazenamento ia em 997 MB de 1 024 (plano gratuito), e boa parte disso
 * eram cópias: a mesma fotografia carregada outra vez para o mesmo pedido, ou
 * uma foto que já estava na Biblioteca de temas carregada de novo para uma
 * proposta. A junção nocturna (`juntar-fotos-duplicadas.ts`) arruma as que já
 * lá estão; isto IMPEDE que nasçam novas.
 *
 * ── O índice ───────────────────────────────────────────────────────────────
 *
 * Uma chave por resumo em `app_state`: `foto-resumo:<32 hex>` → a lista dos
 * caminhos onde essa fotografia está guardada (`<pedido>/<x>.jpg` na pasta de
 * um pedido, ou `tema:<pasta>/<x>.jpg` na Biblioteca). Sem migração.
 *
 * O resumo é o MESMO da Biblioteca (`theme-fingerprint.ts`): os primeiros
 * 16 bytes do SHA-256, em hex. Cada fotografia entra com até DOIS resumos:
 *
 *   · o dos bytes GUARDADOS — calculado aqui, no servidor, sobre o que vai
 *     para o bucket. É o que apanha a mesma foto carregada duas vezes;
 *   · o do ficheiro ORIGINAL, quando o navegador o manda (o estúdio, a
 *     importação e a Biblioteca já o calculam antes de preparar a foto). É o
 *     que apanha uma foto da Biblioteca carregada outra vez para uma proposta,
 *     porque a Biblioteca prepara as fotos com outro tamanho e os bytes
 *     guardados nunca batem.
 *
 * ── O que custa e como se limita ───────────────────────────────────────────
 *
 *   · ~150 bytes por fotografia (chave + até {@link MAX_CAMINHOS} caminhos),
 *     duas linhas por foto no máximo: com as ~3 000 fotos de hoje, < 1 MB dos
 *     500 da base de dados;
 *   · procurar é UMA leitura `key in (…)` por pedido, mais, só quando há
 *     candidata, um `exists` (HEAD) no Storage e um `getTheme` — nunca uma
 *     listagem do Storage;
 *   · um caminho que já não existe sai do índice na primeira vez que alguém
 *     o encontra (`exists` falso). O índice nunca cresce sem tecto: cada
 *     chave guarda no máximo {@link MAX_CAMINHOS}, os mais recentes.
 *
 * ── O que é preciso para devolver um caminho em vez de guardar ─────────────
 *
 *   · na pasta DESTE pedido: o ficheiro existe;
 *   · na Biblioteca: o tema existe, NÃO está arquivado, e o ficheiro existe.
 *     A referência `tema:` é a mesma que o estúdio grava ao escolher uma foto
 *     da Biblioteca — assinada, com miniatura, média, PDF e proposta online
 *     pelos mesmos caminhos (`proposal-assinaturas.ts`, `miniatura/route.ts`,
 *     `proposta-fotos.ts`), e protegida por `theme-materializar.ts` se a foto
 *     sair da Biblioteca;
 *   · na pasta de OUTRO pedido: nunca. Apagar esse pedido leva a pasta
 *     (`apagar-pedido.ts`), e esta proposta ficava sem a foto — a mesma regra
 *     da junção nocturna.
 *
 * Primeiro a pasta deste pedido, depois a Biblioteca: se a foto já está na
 * galeria do pedido, devolver a `tema:` mostrava-a duas vezes na galeria.
 *
 * Nada aqui lança. Uma leitura que falhe é «não sei» — e «não sei» quer dizer
 * guardar, que é exactamente o que se fazia antes disto existir.
 */

export const PREFIXO_DO_INDICE = "foto-resumo:";
/** Quantos caminhos se guardam por resumo (os mais recentes). */
export const MAX_CAMINHOS = 6;
/** Quantos resumos uma pergunta pode trazer (a rota da importação). */
export const MAX_RESUMOS_POR_PERGUNTA = 60;

const chaveDe = (resumo: string) => `${PREFIXO_DO_INDICE}${resumo}`;
/** Sem estreitar o tipo (o `ehRefDeTema` é um guarda de tipo). */
const eTema = (c: string): boolean => ehRefDeTema(c);

/** O resumo de uns bytes, na forma da Biblioteca (32 hex do SHA-256). */
export function resumoDosBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, FINGERPRINT_HEX);
}

/** Só resumos bem formados, sem repetidos. */
function limpos(resumos: readonly unknown[]): string[] {
  return [...new Set(resumos.filter(isFingerprint))];
}

function caminhosValidos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : [];
}

/**
 * Regista que `caminho` guarda a fotografia com estes resumos. Melhor esforço:
 * uma falha deixa a foto fora do índice (e a próxima cópia dela guarda-se,
 * como antes), nunca falha um carregamento que correu bem.
 */
export async function registarResumos(resumos: readonly unknown[], caminho: string): Promise<void> {
  if (!caminho) return;
  for (const r of limpos(resumos)) {
    try {
      // `ouFalha`: uma leitura falhada não pode passar por «chave vazia» e
      // apagar os caminhos que lá estavam.
      const antes = caminhosValidos(await getState<string[]>(chaveDe(r), { ouFalha: true }));
      if (antes[0] === caminho) continue;
      const depois = [caminho, ...antes.filter((c) => c !== caminho)].slice(0, MAX_CAMINHOS);
      await setState(chaveDe(r), depois);
    } catch (e) {
      log.warn("fotos-resumo: não registado", { caminho, erro: String(e) });
    }
  }
}

/** Tira do índice caminhos que se viu que já não existem. Melhor esforço. */
async function esquecer(resumo: string, mortos: readonly string[]): Promise<void> {
  if (mortos.length === 0) return;
  try {
    const antes = caminhosValidos(await getState<string[]>(chaveDe(resumo), { ouFalha: true }));
    const depois = antes.filter((c) => !mortos.includes(c));
    if (depois.length !== antes.length) await setState(chaveDe(resumo), depois);
  } catch {
    /* fica para a próxima vez */
  }
}

/** O ficheiro está mesmo no bucket? `null` = não se conseguiu saber. */
async function existe(bucket: string, path: string): Promise<boolean | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    // storage-js 2.106: um HEAD. `data: false` (com erro) só para 400/404 —
    // «não existe»; qualquer outra avaria lança e cai no `catch` («não sei»).
    const { data } = await sb.storage.from(bucket).exists(path);
    if (data === true) return true;
    if (data === false) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Destes resumos, quais já estão guardados num sítio que esta proposta pode
 * usar? Devolve `resumo → caminho` (só os encontrados).
 *
 * `quoteId` nulo = a pergunta da importação, antes de o pedido existir: só a
 * Biblioteca conta.
 */
export async function procurarExistentes(
  resumos: readonly unknown[],
  quoteId: string | null,
): Promise<Map<string, string>> {
  const saida = new Map<string, string>();
  const pedidos = limpos(resumos).slice(0, MAX_RESUMOS_POR_PERGUNTA);
  if (pedidos.length === 0) return saida;
  const indice = await getStates<string[]>(pedidos.map(chaveDe));
  if (indice.size === 0) return saida;

  const safeId = quoteId ? quoteId.replace(/[^a-zA-Z0-9_-]/g, "") : "";
  const temaVivo = new Map<string, Promise<boolean>>();
  const vivo = (pasta: string): Promise<boolean> => {
    let p = temaVivo.get(pasta);
    if (!p) {
      p = getTheme(pasta)
        .then((t) => !!t && t.arquivado !== true)
        .catch(() => false);
      temaVivo.set(pasta, p);
    }
    return p;
  };

  for (const r of pedidos) {
    const caminhos = caminhosValidos(indice.get(chaveDe(r)));
    if (caminhos.length === 0) continue;
    const proprios = safeId ? caminhos.filter((c) => !eTema(c) && c.startsWith(`${safeId}/`)) : [];
    const daBiblioteca = caminhos.filter(ehRefDeTema);
    const mortos: string[] = [];
    let achado: string | null = null;
    for (const c of proprios) {
      const ok = await existe(PROPOSAL_BUCKET, c);
      if (ok) {
        achado = c;
        break;
      }
      if (ok === false) mortos.push(c);
    }
    if (!achado) {
      for (const ref of daBiblioteca) {
        const caminho = caminhoDoRefDeTema(ref);
        const pasta = caminho.slice(0, caminho.indexOf("/"));
        // Um tema arquivado não serve, mas também não se esquece: pode voltar.
        if (!(await vivo(pasta))) continue;
        const ok = await existe(THEME_BUCKET, caminho);
        if (ok) {
          achado = refDeTema(caminho);
          break;
        }
        if (ok === false) mortos.push(ref);
      }
    }
    if (achado) saida.set(r, achado);
    await esquecer(r, mortos);
  }
  return saida;
}
