import "server-only";
import { z } from "zod";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O REGISTO DOS ESPAÇOS DO `app_state`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `app_state` é um chave/valor partilhado por ~30 espaços de nomes
 * (docs/ESTRUTURA-DOS-DADOS.md, §1.3 e P2). Até aqui não havia uma lista deles:
 * cinco ficheiros tinham cada um a sua cópia à mão, e um prefixo novo tinha de
 * ser lembrado em todos. Agora há UMA, esta — e as outras derivam dela:
 *
 *  · a cópia de segurança (`api/backup/route.ts`) leva os espaços com
 *    `copia.leva`, e o compilador obriga a haver uma função de leitura por
 *    conjunto (`ConjuntoDaCopia`);
 *  · as limpezas da noite sabem o que é índice de fotografias
 *    (`indiceDeFotos`) e o que nomeia fotos ou PDFs sem os usar
 *    (`mencionaFotos`, `mencionaPdfs`);
 *  · as guardas da reposição usam os prefixos daqui.
 *
 * Cada espaço diz também a FORMA do valor (um esquema zod raso: o tipo e os
 * campos que o dono escreve sempre). Nesta fase o esquema só REGISTA o que não
 * bate certo (`vigiar.ts`), nunca recusa — e é raso de propósito: valida o
 * topo do valor, não percorre um rascunho de 500 KB a cada leitura.
 *
 * `tipo: "chave"` é uma chave fixa; `tipo: "prefixo"` é um espaço de nomes
 * (`<prefixo><id>`). Um espaço novo entra AQUI primeiro: o teste
 * `espacos.test.ts` varre o código e falha se encontrar uma chave por registar.
 */

/** Quanto tempo uma linha vive, e quem a faz sair. */
export type Prazo =
  | { tipo: "substitui-se" }
  | { tipo: "tecto"; porque: string }
  | { tipo: "expira"; quem: string }
  | { tipo: "limpeza-da-noite"; quem: string }
  | { tipo: "nenhum"; porque: string };

/** Se vai na cópia de segurança diária, e em que conjunto do ficheiro. */
export type Copia = { leva: true; conjunto: string } | { leva: false };

export interface Espaco {
  chave: string;
  tipo: "chave" | "prefixo";
  /** O módulo que escreve (e é dono da forma). */
  dono: string;
  valor: z.ZodType;
  prazo: Prazo;
  copia: Copia;
  /** Um índice que nomeia TODAS as fotografias para as encontrar: nunca conta
   *  como uso de uma (ver `indices-de-fotos.ts`). */
  indiceDeFotos?: true;
  /** `false`: nomeia fotografias sem as usar (uma cache que se refaz). */
  mencionaFotos?: false;
  /** `false`: nomeia uma proposta sem precisar do PDF dela. */
  mencionaPdfs?: false;
}

const objeto = z.looseObject({});
const qualquerObjeto = z.record(z.string(), z.unknown());
const listaDeTextos = z.array(z.string());
const iso = z.string();

const SUBSTITUI: Prazo = { tipo: "substitui-se" };
const FORA: Copia = { leva: false };

export const ESPACOS = {
  // ── Trabalho de pessoas (vai na cópia) ────────────────────────────────────
  rascunhos: {
    chave: "proposal-draft:",
    tipo: "prefixo",
    dono: "proposal-drafts.ts",
    valor: z.looseObject({ doc: objeto, updatedAt: iso, savedBy: z.string().optional() }),
    prazo: { tipo: "limpeza-da-noite", quem: "limpar-app-state.ts (lápides e órfãos)" },
    copia: { leva: true, conjunto: "proposalDrafts" },
  },
  enviosDeProposta: {
    chave: "envio-de-proposta:",
    tipo: "prefixo",
    dono: "envios-de-proposta.ts",
    valor: z.looseObject({ envios: z.array(z.unknown()) }),
    prazo: { tipo: "limpeza-da-noite", quem: "limpar-app-state.ts (de pedidos apagados)" },
    copia: { leva: true, conjunto: "proposalEmails" },
    mencionaPdfs: false,
  },
  indiceDoBlob: {
    chave: "blob:i:",
    tipo: "prefixo",
    dono: "armazenamento/indice.ts",
    valor: z.looseObject({ t: z.number(), c: iso }),
    prazo: { tipo: "nenhum", porque: "uma linha por ficheiro no Blob; sai com o ficheiro" },
    copia: { leva: true, conjunto: "indiceDoBlob" },
    indiceDeFotos: true,
  },

  // ── Caches e índices (refazem-se) ─────────────────────────────────────────
  propostaWeb: {
    chave: "proposta-web:",
    tipo: "prefixo",
    dono: "proposta-web/guardado.ts, proposta-web/retrato.ts",
    // `retrato`, `conteudo`, `pontos`, `cores`, `paleta-do-pdf`: cada tipo
    // tem a sua forma; o que todos têm em comum é ser JSON composto.
    valor: z.union([objeto, z.array(z.unknown())]),
    prazo: { tipo: "limpeza-da-noite", quem: "limpar-app-state.ts (impressões substituídas)" },
    copia: FORA,
    mencionaFotos: false,
    mencionaPdfs: false,
  },
  resumosDeFotos: {
    chave: "foto-resumo:",
    tipo: "prefixo",
    dono: "fotos-resumo.ts",
    valor: listaDeTextos,
    prazo: { tipo: "tecto", porque: "≤ 6 caminhos por resumo" },
    copia: FORA,
    indiceDeFotos: true,
  },
  impressoesVisuais: {
    chave: "foto-visual:",
    tipo: "prefixo",
    dono: "fotos-parecidas.ts",
    valor: qualquerObjeto,
    prazo: { tipo: "tecto", porque: "64 baldes pela forma da chave" },
    copia: FORA,
    indiceDeFotos: true,
  },
  aquecimentoDePdf: {
    chave: "aquecimento-pdf:",
    tipo: "prefixo",
    dono: "aquecimento-de-pdf.ts",
    valor: z.looseObject({ falhadas: qualquerObjeto }),
    prazo: SUBSTITUI,
    copia: FORA,
    mencionaPdfs: false,
  },

  // ── As ligações curtas (P7 leva-as para uma tabela) ───────────────────────
  ligacoes: {
    chave: "ligacao-proposta:",
    tipo: "prefixo",
    dono: "proposta-link-curto.ts",
    valor: z.looseObject({
      propostaId: z.string(),
      pedidoId: z.string(),
      criadaEm: iso,
      expiraEm: iso,
      revogadaEm: iso.optional(),
    }),
    prazo: { tipo: "limpeza-da-noite", quem: "limpar-app-state.ts (de propostas apagadas)" },
    copia: FORA,
    mencionaPdfs: false,
  },
  ligacoesInversas: {
    chave: "ligacao-de-proposta:",
    tipo: "prefixo",
    dono: "proposta-link-curto.ts",
    valor: z.looseObject({ codigo: z.string() }),
    prazo: { tipo: "limpeza-da-noite", quem: "limpar-app-state.ts (de propostas apagadas)" },
    copia: FORA,
    mencionaPdfs: false,
  },

  // ── Medições e registos ───────────────────────────────────────────────────
  tempoActivo: {
    chave: "tempo-activo:",
    tipo: "prefixo",
    dono: "tempo-activo-servidor.ts",
    valor: z.looseObject({ ms: z.number(), porSeccao: qualquerObjeto.optional(), updatedAt: iso }),
    prazo: { tipo: "nenhum", porque: "por decidir pelo dono (P3)" },
    copia: FORA,
  },
  diagnosticoDoVideo: {
    chave: "diagnostico-video:",
    tipo: "prefixo",
    dono: "api/diagnostico-video/route.ts",
    valor: z.looseObject({ v: z.number(), sessao: z.string(), recebidoEm: iso }),
    prazo: { tipo: "limpeza-da-noite", quem: "limpar-diagnosticos-video.ts (30 dias)" },
    copia: FORA,
  },
  registosDasLimpezas: {
    chave: "limpeza:",
    tipo: "prefixo",
    dono: "registos-das-limpezas.ts",
    valor: objeto,
    prazo: SUBSTITUI,
    copia: FORA,
  },
  ocupacao: {
    chave: "armazenamento:",
    tipo: "prefixo",
    dono: "ocupacao-do-armazenamento.ts",
    valor: objeto,
    prazo: SUBSTITUI,
    copia: FORA,
  },
  usoDoBlob: {
    chave: "armazenamento-blob:",
    tipo: "prefixo",
    dono: "armazenamento/uso.ts",
    valor: objeto,
    prazo: SUBSTITUI,
    copia: FORA,
  },
  modosDoBlob: {
    chave: "armazenamento-blob",
    tipo: "chave",
    dono: "armazenamento/modos.ts",
    valor: qualquerObjeto,
    prazo: SUBSTITUI,
    copia: FORA,
  },
  diagnosticoDoArmazenamento: {
    chave: "diagnostico-de-armazenamento",
    tipo: "chave",
    dono: "estado-do-armazenamento.ts",
    valor: z.looseObject({ em: iso }),
    prazo: SUBSTITUI,
    copia: FORA,
  },
  marcadorDaCopia: {
    chave: "copia-de-seguranca:",
    tipo: "prefixo",
    dono: "copia-de-seguranca-marcador.ts",
    valor: objeto,
    prazo: SUBSTITUI,
    copia: FORA,
  },
  tectoDaIa: {
    chave: "importar-com-ia:",
    tipo: "prefixo",
    dono: "importar-proposta/ia/tecto.ts",
    valor: objeto,
    prazo: { tipo: "tecto", porque: "uma linha por mês" },
    copia: FORA,
  },
  retomaDosLembretes: {
    chave: "cron-reminders:",
    tipo: "prefixo",
    dono: "api/cron/reminders/route.ts",
    valor: objeto,
    prazo: SUBSTITUI,
    copia: FORA,
  },
  fechosNaMeta: {
    chave: "meta-fechos-enviados",
    tipo: "chave",
    dono: "api/meta/fechos/route.ts",
    valor: listaDeTextos,
    prazo: SUBSTITUI,
    copia: FORA,
  },

  // ── Trincos, sessões, recuperação ─────────────────────────────────────────
  trincos: {
    chave: "trinco:",
    tipo: "prefixo",
    dono: "trinco.ts",
    valor: z.looseObject({ ate: z.union([z.string(), z.number()]) }),
    prazo: { tipo: "expira", quem: "trinco.ts (`ate`)" },
    copia: FORA,
  },
  linksCortados: {
    chave: "links-cortados:",
    tipo: "prefixo",
    dono: "links-cortados.ts",
    valor: z.looseObject({ cortadoEm: iso, por: z.string().optional() }),
    prazo: { tipo: "nenhum", porque: "um por pedido; saber que se cortou vale mais" },
    copia: FORA,
  },
  sessoesRevogadas: {
    chave: "sessoes-revogadas",
    tipo: "chave",
    dono: "sessoes-revogadas.ts",
    valor: z.looseObject({ desde: qualquerObjeto, terminadas: qualquerObjeto }),
    prazo: SUBSTITUI,
    copia: FORA,
  },
  recuperacaoDaConta: {
    chave: "admin-recuperacao",
    tipo: "chave",
    dono: "admin-recuperacao.ts",
    valor: objeto,
    prazo: SUBSTITUI,
    copia: FORA,
  },

  // ── Modelos e preferências ────────────────────────────────────────────────
  modelosDeProposta: {
    chave: "proposal-templates",
    tipo: "chave",
    dono: "proposal-templates.ts",
    valor: z.array(z.unknown()),
    prazo: SUBSTITUI,
    copia: FORA,
  },
  modelosDeGuiao: {
    chave: "guiao-templates",
    tipo: "chave",
    dono: "guiao-modelos-guardados.ts",
    valor: z.array(z.unknown()),
    prazo: SUBSTITUI,
    copia: FORA,
  },
  preferenciasDaProposta: {
    chave: "proposal-prefs",
    tipo: "chave",
    dono: "proposal-prefs.ts",
    valor: objeto,
    prazo: SUBSTITUI,
    copia: FORA,
  },

  // ── Herança ───────────────────────────────────────────────────────────────
  numeracaoDeDesenvolvimento: {
    chave: "invoice-seq-",
    tipo: "prefixo",
    dono: "backup-restore.ts (só sem base de dados; em produção é `invoice_counters`)",
    valor: z.number(),
    prazo: { tipo: "tecto", porque: "uma por ano" },
    copia: FORA,
  },
  ultimoEmailLido: {
    chave: "inbox-last-uid",
    tipo: "chave",
    dono: "nenhum: a caixa de entrada foi apagada (RUNBOOK); a linha ficou",
    valor: z.number(),
    prazo: SUBSTITUI,
    copia: FORA,
  },
} as const satisfies Record<string, Espaco>;

export type NomeDoEspaco = keyof typeof ESPACOS;

type EspacoQueVaiNaCopia = Extract<(typeof ESPACOS)[NomeDoEspaco], { copia: { leva: true } }>;

/** Os conjuntos do `app_state` no ficheiro da cópia — um por espaço que vai. */
export type ConjuntoDaCopia = EspacoQueVaiNaCopia["copia"]["conjunto"];

function ehNomeDoEspaco(nome: string): nome is NomeDoEspaco {
  return Object.hasOwn(ESPACOS, nome);
}

const TODOS: readonly (readonly [NomeDoEspaco, Espaco])[] = Object.entries(ESPACOS).flatMap(
  ([nome, e]) => (ehNomeDoEspaco(nome) ? [[nome, e] as const] : []),
);

/**
 * O espaço a que uma chave pertence: a chave fixa igual, ou o prefixo MAIS
 * LONGO que a abre (`armazenamento-blob:uso` é do uso do Blob, não da chave
 * fixa `armazenamento-blob` nem de `armazenamento:`).
 */
export function espacoDaChave(chave: string): NomeDoEspaco | null {
  let melhor: NomeDoEspaco | null = null;
  let tamanho = -1;
  for (const [nome, e] of TODOS) {
    const pertence = e.tipo === "chave" ? chave === e.chave : chave.startsWith(e.chave);
    if (pertence && e.chave.length > tamanho) {
      melhor = nome;
      tamanho = e.chave.length;
    }
  }
  return melhor;
}

/** As chaves (prefixos e fixas) dos espaços que cumprem a condição. */
export function chavesDosEspacos(condicao: (e: Espaco) => boolean): readonly string[] {
  return TODOS.filter(([, e]) => condicao(e)).map(([, e]) => e.chave);
}
