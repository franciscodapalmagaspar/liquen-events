/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ORIGENS QUE A `img-src` TEM DE DEIXAR PASSAR — E PORQUE É QUE ISTO
 * DEIXOU DE SER UMA LINHA DENTRO DO `next.config.ts`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Todas as fotografias do estúdio de propostas são `<img>` apontados ao Storage
 * do Supabase (URLs assinados, bucket privado). O browser só as pede se a
 * `img-src` da Content-Security-Policy nomear aquela origem. Se não nomear, não
 * há pedido nenhum: não há código de estado, não há registo no servidor, não há
 * nada — só a célula a dizer que não conseguiu mostrar a fotografia. Em TODAS
 * as células, porque o que falha não é a foto, é a política.
 *
 * ── O QUE TORNA ISTO PERIGOSO: a política é escrita NO BUILD ───────────────
 * O `headers()` do `next.config.ts` corre uma vez, quando o build carrega a
 * configuração, e o resultado é gravado no `.next/routes-manifest.json`; é de
 * lá que a política é servida em todos os pedidos. MEDIDO no build que estava
 * nesta árvore:
 *
 *     $ node -e "…routes-manifest.json…"
 *     img-src 'self' data: blob: https://www.googletagmanager.com …
 *
 * Nenhuma origem do Supabase. Ou seja: um build cujo ambiente não tenha
 * `SUPABASE_URL` publica um sítio onde NENHUMA fotografia de proposta aparece,
 * mesmo com o servidor, o Storage e as assinaturas todos impecáveis — e sem uma
 * única linha nos registos a dizê-lo. O `Dockerfile` deste repositório é
 * exactamente esse caso: a etapa `builder` corre `npm run build` sem receber
 * variável nenhuma.
 *
 * ── A RESPOSTA: a política nunca pode ficar SEM o Storage ─────────────────
 * Quando a origem exacta se sabe, é essa que entra, e é a mais apertada
 * possível. Quando não se sabe, entra a FAMÍLIA de hosts do Supabase alojado
 * (`https://*.supabase.co`) em vez de nada. Isso é mais largo do que o ideal —
 * e é incomparavelmente melhor do que o que estava: um `img-src` sem Storage
 * nenhum não protege coisa alguma que não estivesse já protegida (os buckets
 * são privados e os URLs assinados), e apaga o produto inteiro.
 *
 * `usouCuringa` existe para isto ser DITO: o build avisa, e o diagnóstico de
 * fotografias (`/api/admin/fotos-diagnostico`) nomeia-o como avaria a corrigir.
 *
 * ── PORQUE É QUE VIVE AQUI E NÃO NO `next.config.ts` ──────────────────────
 * Para poder ser testado sem um build, e para o diagnóstico usar a MESMA
 * função que escreve a política. Duas cópias da regra seriam duas
 * oportunidades de o diagnóstico dizer que está tudo bem sobre uma política
 * diferente da que é servida. Este módulo não importa nada — nem `server-only`,
 * nem nada do projecto — porque é lido dos dois lados: pelo `next.config.ts`
 * (que corre fora do bundler da aplicação) e por uma rota de API.
 */

/**
 * A família de hosts do Supabase alojado, para quando a origem exacta não se
 * sabe. Um só nível de subdomínio, que é o que a CSP entende por `*.`.
 */
import { origemDoBlob } from "./armazenamento/baldes";

export const CURINGA_SUPABASE = "https://*.supabase.co";

/** As variáveis de onde a origem do Storage pode vir, por ordem de preferência. */
export const VARIAVEIS_DE_ORIGEM = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_IMAGE_CDN",
] as const;

export interface OrigensDeImagem {
  /** O que entra na `img-src`, já sem repetições e pela ordem em que foi lido. */
  origens: string[];
  /** As origens que se conseguiram derivar do ambiente (vazio = nenhuma). */
  derivadas: string[];
  /** Não se soube nenhuma origem e ficou a família do Supabase alojado. */
  usouCuringa: boolean;
}

/** A origem de um URL, ou "" quando não é um URL que se consiga ler. */
function origemDe(valor: string | undefined): string {
  if (!valor) return "";
  try {
    return new URL(valor).origin;
  } catch {
    return "";
  }
}

/**
 * As origens de imagem desta instalação.
 *
 * Recebe o ambiente em vez de o ler do global para poder ser testado — e
 * porque o `next.config.ts` e a rota de diagnóstico correm em momentos
 * diferentes, com ambientes que podem não ser o mesmo (é precisamente essa
 * diferença que produziu a avaria).
 */
export function origensDeImagem(
  env: Record<string, string | undefined> = process.env,
): OrigensDeImagem {
  const derivadas: string[] = [];
  for (const nome of VARIAVEIS_DE_ORIGEM) {
    const origem = origemDe(env[nome]);
    if (origem && !derivadas.includes(origem)) derivadas.push(origem);
  }
  /**
   * O Vercel Blob (16/11): com o token, os originais e os PDF podem vir de
   * `https://<loja>.private.blob.vercel-storage.com` — directamente (endereços
   * de prazo curto) ou pelo redireccionamento de `/api/ficheiro/…`, e a CSP
   * vale também para o destino de um redireccionamento. Sem o token, nada
   * muda. A origem é a EXACTA do store (o identificador vem do token, sem o
   * segredo), nunca um curinga de todos os stores da Vercel.
   */
  const blob = origemDoBlob(env);
  const extra = blob ? [blob] : [];
  if (derivadas.length > 0)
    return { origens: [...derivadas, ...extra], derivadas, usouCuringa: false };
  return { origens: [CURINGA_SUPABASE, ...extra], derivadas, usouCuringa: true };
}

/**
 * Um host da CSP (`https://x.y`, `https://*.y`) cobre esta origem?
 *
 * Só o que é preciso para responder à pergunta desta casa — esquema e host,
 * com um nível de curinga —, e não um analisador de CSP completo. As regras
 * seguidas são as do documento: `*.` substitui **um** rótulo, e nunca um ponto.
 */
function hostCobre(fonte: string, alvo: URL): boolean {
  let f = fonte.trim();
  if (!f || f.startsWith("'")) return false;
  // Esquema, quando o há: tem de ser o mesmo.
  const comEsquema = f.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (comEsquema) {
    if (`${comEsquema[1].toLowerCase()}:` !== alvo.protocol) return false;
    f = f.slice(comEsquema[0].length);
  }
  // Porta e caminho não entram nesta pergunta.
  f = f.split("/")[0];
  const [host] = f.split(":");
  if (!host) return false;
  if (host === "*") return true;
  if (host.startsWith("*.")) {
    const sufixo = host.slice(1).toLowerCase(); // ".supabase.co"
    const nome = alvo.hostname.toLowerCase();
    if (!nome.endsWith(sufixo)) return false;
    // Um só rótulo à frente: `*.supabase.co` não cobre `a.b.supabase.co`.
    return !nome.slice(0, nome.length - sufixo.length).includes(".");
  }
  return host.toLowerCase() === alvo.hostname.toLowerCase();
}

/**
 * Esta directiva `img-src` deixa o browser pedir este URL?
 *
 * É a pergunta que ninguém estava a fazer, e é a que separa «a fotografia não
 * existe» de «a fotografia nunca chegou a ser pedida».
 */
export function permiteOrigem(directivaImgSrc: string, url: string): boolean {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return false;
  }
  const fontes = directivaImgSrc.trim().split(/\s+/).slice(1); // fora o nome da directiva
  return fontes.some((f) => hostCobre(f, alvo));
}
