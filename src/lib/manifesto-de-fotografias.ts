import "server-only";
import { balde } from "@/lib/armazenamento/balde";
import { getSupabase } from "./supabase";
import { PROPOSAL_BUCKET } from "./proposal-storage";
import { THEME_BUCKET } from "./theme-ref";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE EXISTIA NOS BUCKETS — a lista, já que os bytes não cabem no email
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fotografias são a ÚNICA categoria de dados desta casa sem cópia de
 * segurança nenhuma. A cópia diária leva os dados e deixa as imagens (são
 * gigabytes e não cabem num anexo), portanto uma reposição devolve propostas e
 * mood boards a apontar para ficheiros que têm de já existir no Storage.
 *
 * Copiar os BYTES para fora do Supabase é uma decisão de custo e de
 * fornecedor, e a recomendação está escrita no RESILIENCE.md — não é código,
 * é uma definição na consola do Supabase (Point-in-Time Recovery / cópias do
 * projecto) ou um descarregamento periódico feito de fora. Este módulo faz a
 * outra metade, a que custa quase nada e hoje não existe: a LISTA.
 *
 * ── PORQUE É QUE UMA LISTA VALE A PENA SEM OS BYTES ───────────────────────
 *
 * Porque o dia mau começa sempre pela mesma pergunta — «o que é que faltou?» —
 * e hoje não há como responder. Uma proposta reposta aponta para
 * `LIQ-3/mood-2.jpg`; sem manifesto ninguém sabe se essa foto alguma vez
 * existiu, quantas eram, nem quais desapareceram. Com manifesto, comparar o
 * que está no bucket com o ficheiro de ontem é uma diferença de duas listas, e
 * o que se perdeu fica com nome, tamanho e data.
 *
 * ── PORQUE É QUE É BARATO ─────────────────────────────────────────────────
 *
 * Não transfere um único byte. A própria listagem do Storage já traz o tamanho
 * e a assinatura de cada ficheiro (`metadata.size`, `metadata.eTag`), portanto
 * o custo é uma chamada por pasta — a mesma ordem de grandeza que o painel das
 * miniaturas em falta (`derivadas.ts`) já paga sem ninguém dar por isso.
 *
 * ── SOBRE A «SOMA DE VERIFICAÇÃO» ─────────────────────────────────────────
 *
 * O `eTag` é o que o Storage dá, e é o que se guarda. Para um ficheiro enviado
 * de uma vez é o MD5 do conteúdo; para um envio em partes (ficheiros grandes,
 * TUS) é uma assinatura composta com um sufixo `-N` que NÃO se recalcula com um
 * `md5sum` local. Serve para o que um manifesto precisa — dizer se o ficheiro
 * de hoje é o mesmo de ontem — e não serve para provar a integridade de uma
 * cópia feita à mão. Está dito aqui para ninguém prometer a segunda coisa a
 * partir da primeira.
 *
 * ── SÓ OS ORIGINAIS ───────────────────────────────────────────────────────
 *
 * `proposal-assets` e `theme-assets`. As derivadas (`proposal-thumbs`,
 * `theme-thumbs`, `theme-micro`, `proposal-capas`, `theme-capas`) ficam de
 * fora de propósito: refazem-se a partir dos originais num botão (Definições →
 * Miniaturas), e listá-las era encher o manifesto — e o email — com o que não
 * é preciso salvar. Insubstituível é o original.
 */

/** Os buckets cujo conteúdo não se refaz. A ordem é a do manifesto. */
export const BUCKETS_ORIGINAIS = [PROPOSAL_BUCKET, THEME_BUCKET] as const;

/** O Storage devolve no máximo 1000 por página; 500 é o que o resto da casa usa. */
const PAGINA = 500;

/**
 * Fundura máxima da travessia. Hoje os dois buckets são de um nível
 * (`<pedido>/ficheiro`, `<tema>/ficheiro`), mas uma pasta dentro de uma pasta
 * não pode fazer isto andar às voltas nem custar centenas de listagens.
 */
const FUNDURA = 3;

/**
 * Tecto de entradas. Um manifesto é lido, comprimido e enviado por email: sem
 * tecto, um bucket com centenas de milhares de ficheiros fazia a tarefa
 * agendada esgotar o tempo — e uma tarefa que morre a meio não manda cópia
 * nenhuma, que é o oposto do que isto serve.
 *
 * 50 000 entradas são ~6 MB de JSON e comprimem para uma fracção disso. Muito
 * acima do que este negócio tem (milhares) e muito abaixo do que mata a função.
 */
export const LIMITE_DE_ENTRADAS = 50_000;

export interface EntradaDoManifesto {
  /** `<bucket>/<caminho>` — a chave completa, como o Storage a conhece. */
  chave: string;
  bytes: number;
  /** O `eTag` do Storage. Ver a nota no cabeçalho sobre o que ele prova. */
  soma?: string;
  /** Última alteração conhecida, para se saber a idade do que se perdeu. */
  alteradoEm?: string;
}

export interface ResumoDeBucket {
  bucket: string;
  ficheiros: number;
  bytes: number;
}

export interface ManifestoDeFotografias {
  geradoEm: string;
  buckets: ResumoDeBucket[];
  ficheiros: number;
  bytes: number;
  /**
   * Viu-se tudo? `false` quando um bucket não respondeu, quando o tecto foi
   * atingido ou quando não há Storage. Um manifesto truncado a passar por
   * completo faz dar por perdidas fotos que existem — e por salvas fotos que
   * não estão lá.
   */
  completo: boolean;
  /** O que impediu de ver tudo, por extenso. Nunca vazio quando `completo` é falso. */
  avisos: string[];
  entradas: EntradaDoManifesto[];
  /** Para quem abrir o ficheiro daqui a um ano sem saber o que tem na mão. */
  readme: string;
}

const README = [
  "Manifesto das fotografias da Líquen Events: a LISTA do que existia nos buckets de originais do Supabase Storage — não as fotografias.",
  "Serve para responder a «o que é que se perdeu?»: comparando este ficheiro com o conteúdo do bucket vê-se, com nome, tamanho e data, o que desapareceu.",
  "NÃO inclui as derivadas (miniaturas e capas): essas refazem-se dos originais no back office, em Definições → Miniaturas.",
  "A coluna `soma` é o eTag do Storage. Para ficheiros enviados de uma vez é o MD5 do conteúdo; para envios em partes é uma assinatura composta (sufixo -N) que não se recalcula com um md5sum local.",
  "Se `completo` for falso, ESTA LISTA ESTÁ INCOMPLETA — ver `avisos`. Não concluas daqui que uma fotografia não existe.",
].join(" ");

type Cliente = NonNullable<ReturnType<typeof getSupabase>>;

/** Marcadores de pasta e ficheiros escondidos não são fotografias. */
const ehEscondido = (nome: string) => nome.startsWith(".");

interface Travessia {
  entradas: EntradaDoManifesto[];
  ficheiros: number;
  bytes: number;
  truncado: boolean;
}

/**
 * Percorre um prefixo e tudo o que estiver por baixo dele.
 *
 * Uma entrada sem `id` é uma pasta (é assim que o Storage as devolve, e é a
 * mesma leitura que o `derivadas.ts` faz). Lança quando a listagem falha: quem
 * chama transforma isso num aviso E em `completo: false` — devolver o que se
 * conseguiu ver como se fosse tudo é a única falha grave que este ficheiro
 * pode ter.
 */
async function percorrer(
  sb: Cliente,
  bucket: string,
  prefixo: string,
  fundura: number,
  acc: Travessia,
): Promise<void> {
  const pastas: string[] = [];

  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await balde(bucket, sb).list(prefixo, { limit: PAGINA, offset });
    if (error) throw new Error(error.message);
    const lote = data ?? [];

    for (const entrada of lote) {
      if (ehEscondido(entrada.name)) continue;
      const caminho = prefixo ? `${prefixo}/${entrada.name}` : entrada.name;

      if (!entrada.id) {
        if (fundura > 0) pastas.push(caminho);
        continue;
      }
      if (acc.entradas.length >= LIMITE_DE_ENTRADAS) {
        acc.truncado = true;
        return;
      }
      const meta = entrada.metadata as { size?: number; eTag?: string } | null;
      const bytes = Number(meta?.size ?? 0);
      // O eTag vem entre aspas do S3 (`"abc123"`). Guardá-lo com as aspas
      // fazia qualquer comparação futura falhar por causa de dois caracteres.
      const soma = typeof meta?.eTag === "string" ? meta.eTag.replace(/^"|"$/g, "") : undefined;
      acc.entradas.push({
        chave: `${bucket}/${caminho}`,
        bytes,
        ...(soma ? { soma } : {}),
        ...(entrada.updated_at ? { alteradoEm: entrada.updated_at } : {}),
      });
      acc.ficheiros++;
      acc.bytes += bytes;
    }

    if (lote.length < PAGINA) break;
  }

  for (const pasta of pastas) {
    if (acc.truncado) return;
    await percorrer(sb, bucket, pasta, fundura - 1, acc);
  }
}

/**
 * A lista do que existe nos buckets de originais. **Não descarrega nada.**
 *
 * Nunca lança: é chamada pela tarefa agendada da cópia de segurança, e um
 * manifesto que rebenta não pode levar a cópia dos DADOS atrás — essa é a
 * parte que mais importa das duas.
 */
export async function construirManifesto(): Promise<ManifestoDeFotografias> {
  const geradoEm = new Date().toISOString();
  const sb = getSupabase();
  if (!sb) {
    return {
      geradoEm,
      buckets: [],
      ficheiros: 0,
      bytes: 0,
      completo: false,
      avisos: [
        "Sem base de dados configurada não há Storage: não foi possível listar fotografia nenhuma.",
      ],
      entradas: [],
      readme: README,
    };
  }

  const entradas: EntradaDoManifesto[] = [];
  const buckets: ResumoDeBucket[] = [];
  const avisos: string[] = [];
  let truncado = false;

  for (const bucket of BUCKETS_ORIGINAIS) {
    const acc: Travessia = { entradas, ficheiros: 0, bytes: 0, truncado: false };
    try {
      await percorrer(sb, bucket, "", FUNDURA, acc);
    } catch (e) {
      // O que se conseguiu ver deste bucket fica — e o aviso diz que não é tudo.
      avisos.push(`${bucket}: ${e instanceof Error ? e.message : String(e)}`);
    }
    truncado = truncado || acc.truncado;
    buckets.push({ bucket, ficheiros: acc.ficheiros, bytes: acc.bytes });
  }

  if (truncado) {
    avisos.push(
      `A listagem parou no tecto de ${LIMITE_DE_ENTRADAS} ficheiros: há mais fotografias do que as que estão nesta lista.`,
    );
  }

  const manifesto: ManifestoDeFotografias = {
    geradoEm,
    buckets,
    ficheiros: buckets.reduce((n, b) => n + b.ficheiros, 0),
    bytes: buckets.reduce((n, b) => n + b.bytes, 0),
    completo: avisos.length === 0,
    avisos,
    entradas,
    readme: README,
  };

  if (!manifesto.completo) {
    log.warn("manifesto de fotografias: incompleto", {
      avisos: manifesto.avisos,
      ficheiros: manifesto.ficheiros,
    });
  }
  return manifesto;
}
