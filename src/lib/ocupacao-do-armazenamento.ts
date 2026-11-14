import "server-only";
import { getStates, gravarEstadoSeNaoMudou, lerEstadoComVersao, setState } from "@/lib/app-state";
import { getSupabase } from "@/lib/supabase";
import type { ManifestoDeFotografias } from "@/lib/manifesto-de-fotografias";
import { log } from "@/lib/logger";
import {
  espacoQueSobra,
  type EspacoNoArmazenamento,
  type Ocupacao,
} from "@/lib/ocupacao-do-armazenamento-regras";

export * from "@/lib/ocupacao-do-armazenamento-regras";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO OCUPA O ARMAZENAMENTO — LIDO DE NOITE, GUARDADO, LIDO BARATO (13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Para o importador poder subir as fotografias TODAS das propostas antigas
 * sem nunca passar dos 90% do plano gratuito, alguém tem de saber quanto o
 * armazenamento ocupa. O Supabase não o diz pela API das chaves que temos;
 * soma-se a lista dos ficheiros.
 *
 *  · os ORIGINAIS (`proposal-assets`, `theme-assets`): o manifesto da noite já
 *    os lista todos, com o tamanho — custo zero;
 *  · os OUTROS buckets (miniaturas, médias, AVIF, capas, PDF, fotos tratadas):
 *    o de medição mais velha primeiro, enquanto houver tempo (o tecto da
 *    noite); cada um volta a ser medido ao fim de 7 dias e só conta como
 *    medido até aos 14. Um bucket que não acabe no tempo fica com o valor
 *    anterior;
 *  · o que se carregou DEPOIS da medição soma-se num contador por bucket
 *    ({@link somarCarregado}); a medição de cada bucket põe o dele a zero.
 *
 * Tudo vai para DUAS linhas de `app_state` (`armazenamento:ocupacao` e
 * `armazenamento:desde-a-medicao`), e o importador lê-as numa ida só.
 */

export const CHAVE_OCUPACAO = "armazenamento:ocupacao";
export const CHAVE_DESDE = "armazenamento:desde-a-medicao";

/** O espaço como está agora. `null` nunca: sem medição, `conhecido: false`. */
export async function lerEspaco(): Promise<EspacoNoArmazenamento> {
  const m = await getStates<unknown>([CHAVE_OCUPACAO, CHAVE_DESDE]);
  const oc = m.get(CHAVE_OCUPACAO) as Ocupacao | undefined;
  return espacoQueSobra(oc ?? null, m.get(CHAVE_DESDE) ?? null);
}

type Contador = Record<string, number>;

function contadorValido(v: unknown): Contador {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Contador = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(x);
    if (k && Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

/** Muda o contador com compare-and-set, até 4 tentativas. Nunca lança. */
async function mudarContador(f: (c: Contador) => Contador): Promise<void> {
  for (let t = 0; t < 4; t++) {
    try {
      const { valor, versao } = await lerEstadoComVersao<unknown>(CHAVE_DESDE, 3_000);
      const r = await gravarEstadoSeNaoMudou(CHAVE_DESDE, f(contadorValido(valor)), versao);
      if (r !== "conflito") return;
    } catch {
      return;
    }
  }
}

/**
 * Soma bytes acabados de guardar, POR BUCKET (`{ "proposal-assets": 354000,
 * "proposal-thumbs": 15000 }`): a medição de cada bucket põe a zero só o dele.
 * Compare-and-set: dois carregamentos ao mesmo tempo não se apagam. Nunca lança.
 */
export async function somarCarregado(porBucket: Readonly<Record<string, number>>): Promise<void> {
  const somar = Object.entries(porBucket).filter(([, n]) => Number.isFinite(n) && n > 0);
  if (somar.length === 0) return;
  await mudarContador((c) => {
    for (const [b, n] of somar) c[b] = (c[b] ?? 0) + Math.round(n);
    return c;
  });
}

/** Quanto ocupa um bucket inteiro, com várias listagens em paralelo e tecto de tempo. */
async function somarBucket(
  bucket: string,
  ateMs: number,
): Promise<{ bytes: number; ficheiros: number } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  let bytes = 0;
  let ficheiros = 0;
  const pastas: { prefixo: string; fundura: number }[] = [{ prefixo: "", fundura: 4 }];
  let falhou = false;
  const trabalhar = async () => {
    for (;;) {
      if (falhou || Date.now() > ateMs) return;
      const p = pastas.shift();
      if (!p) return;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await sb.storage
          .from(bucket)
          .list(p.prefixo, { limit: 1000, offset });
        if (error) {
          falhou = true;
          return;
        }
        const lote = data ?? [];
        for (const e of lote) {
          if (e.name.startsWith(".")) continue;
          const caminho = p.prefixo ? `${p.prefixo}/${e.name}` : e.name;
          if (!e.id) {
            if (p.fundura > 0) pastas.push({ prefixo: caminho, fundura: p.fundura - 1 });
            continue;
          }
          bytes += Number((e.metadata as { size?: number } | null)?.size ?? 0);
          ficheiros++;
        }
        if (lote.length < 1000) break;
      }
    }
  };
  // Quatro vias: as pastas novas entram na fila enquanto as outras correm.
  for (;;) {
    await Promise.all(Array.from({ length: 4 }, trabalhar));
    if (falhou || Date.now() > ateMs || pastas.length === 0) break;
  }
  if (falhou || pastas.length > 0) return null;
  return { bytes, ficheiros };
}

/** Quanto tempo uma medição de um bucket que não é de originais serve. */
const IDADE_MAXIMA_MS = 14 * 24 * 3600_000;

/**
 * A medição da noite. Os originais vêm do manifesto (já feito); dos outros
 * buckets mede-se o que tem a medição mais velha (ou nenhuma), enquanto
 * houver tempo. Grava a ocupação e põe o contador do dia a zero. Nunca lança.
 */
export async function medirOcupacao(
  manifesto: Pick<ManifestoDeFotografias, "buckets" | "completo"> | null,
  agora: Date,
  opcoes: { prazoMs: number },
): Promise<Ocupacao | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const ate = Date.now() + opcoes.prazoMs;
  try {
    const antes = (await lerEstadoComVersao<Ocupacao>(CHAVE_OCUPACAO, 4_000)).valor;
    const porBucket: Ocupacao["porBucket"] = { ...(antes?.porBucket ?? {}) };
    const iso = agora.toISOString();
    const originais = new Set<string>();
    if (manifesto?.completo) {
      for (const b of manifesto.buckets) {
        porBucket[b.bucket] = { bytes: b.bytes, medidoEm: iso };
        originais.add(b.bucket);
      }
    }
    const { data: buckets, error } = await sb.storage.listBuckets();
    if (error || !buckets) throw new Error(error?.message ?? "sem buckets");
    const nomes = buckets.map((b) => b.name);
    // Um bucket que deixou de existir sai da conta.
    for (const k of Object.keys(porBucket)) if (!nomes.includes(k)) delete porBucket[k];
    const porMedir = nomes
      .filter((n) => !originais.has(n))
      .filter((n) => {
        const m = porBucket[n];
        return !m || agora.getTime() - Date.parse(m.medidoEm) > IDADE_MAXIMA_MS / 2;
      })
      .sort((a, b) => (porBucket[a]?.medidoEm ?? "").localeCompare(porBucket[b]?.medidoEm ?? ""));
    for (const n of porMedir) {
      if (Date.now() > ate) break;
      const r = await somarBucket(n, ate);
      if (r) porBucket[n] = { bytes: r.bytes, medidoEm: iso };
    }
    const completo = nomes.every((n) => {
      const m = porBucket[n];
      return !!m && agora.getTime() - Date.parse(m.medidoEm) <= IDADE_MAXIMA_MS;
    });
    const ocupacao: Ocupacao = {
      medidoEm: iso,
      bytes: Object.values(porBucket).reduce((s, m) => s + m.bytes, 0),
      porBucket,
      completo,
    };
    await setState(CHAVE_OCUPACAO, ocupacao);
    // Os buckets medidos esta noite já contam o que se carregou até agora.
    const medidos = Object.entries(porBucket)
      .filter(([, m]) => m.medidoEm === iso)
      .map(([b]) => b);
    if (medidos.length > 0) {
      await mudarContador((c) => {
        for (const b of medidos) delete c[b];
        return c;
      });
    }
    return ocupacao;
  } catch (e) {
    log.warn("ocupação do armazenamento: não medida", { erro: String(e) });
    return null;
  }
}
