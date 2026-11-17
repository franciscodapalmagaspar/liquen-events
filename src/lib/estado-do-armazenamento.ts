import "server-only";
import { estadoDoBlob, type EstadoDoBlob } from "./armazenamento/saude";
import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
import { getState, setState, oFicheiroEhEfemero, type MotivoDeFalha } from "./app-state";
import { PROPOSAL_BUCKET } from "./proposal-storage";
import { THEME_BUCKET } from "./theme-ref";
import { estadoDaCopia, type EstadoDaCopia } from "./copia-de-seguranca-marcador";
import { log } from "./logger";
import { colunasEmFalta, oQueFazerComAsColunas, tituloDasColunas } from "./estado-das-colunas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ARMAZENAMENTO ESTÁ LIGADO? — perguntar ANTES, não depois
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que já estava feito: a partir do momento em que uma gravação falha, a
 * verdade chega ao ecrã — o `setState` diz onde ficou, a rota do rascunho
 * responde 503, o estúdio avisa. É a cadeia certa e continua toda de pé.
 *
 * O que falta a essa cadeia: ela só fala DEPOIS. Na instalação onde isto
 * aconteceu a sério, a tabela `app_state` não existia e a colaboradora montou
 * uma proposta inteira — fotos, mood boards, textos — antes de alguém descobrir
 * que nada daquilo estava a ser gravado. Perder três horas e só então ler o
 * aviso é ler o aviso tarde demais.
 *
 * Este módulo responde à pergunta antes de o trabalho começar.
 *
 * ── A honestidade está em TENTAR ──────────────────────────────────────────
 *
 * Uma verificação que olha para as variáveis de ambiente e responde «Supabase
 * configurado ✓» teria dado exactamente essa resposta naquela instalação: as
 * variáveis estavam lá, a tabela é que não. E teria dado a mesma resposta com a
 * chave `anon` no lugar da `service_role` — a `app_state` tem RLS ligada e
 * nenhuma política, portanto com a chave pública TODA a escrita é recusada,
 * ainda que a configuração pareça completa.
 *
 * Por isso isto ESCREVE: uma chave própria de diagnóstico, com uma prova
 * aleatória lá dentro, e depois volta a lê-la. Uma escrita que ninguém
 * confirma não é um armazenamento a funcionar, por mais bem configurado que
 * pareça.
 *
 * ── E não avisa quando não há o que avisar ────────────────────────────────
 *
 * Um aviso que aparece quando está tudo bem é um aviso que se deixa de ler — e
 * a próxima vez que aparecer a sério não vai ser lido. Por isso o `avisar` é
 * `false` no caso normal, é `false` numa máquina de desenvolvimento sem base de
 * dados (aí o ficheiro é legítimo e é o desenho), e é `false` para buckets que
 * ainda não existem numa instalação por estrear (são criados na primeira
 * fotografia carregada).
 */

/**
 * A chave onde a prova é escrita.
 *
 * Fora do espaço de nomes dos rascunhos (`proposal-draft:`) de propósito: essa
 * varredura é a que alimenta a cópia de segurança e a que responde «que
 * rascunhos usam esta foto?». Um diagnóstico a passear-se por lá seria um
 * rascunho falso em qualquer das duas.
 */
export const CHAVE_DE_DIAGNOSTICO = "diagnostico-de-armazenamento";

/**
 * O que se passa com o armazenamento. Cada um destes tem uma RESOLUÇÃO
 * diferente, que é a única razão para os distinguir:
 *
 *  - `ok`                        → nada a fazer;
 *  - `ficheiro-de-desenvolvimento` → nada a fazer, mas isto é uma máquina;
 *  - `sem-configuracao`          → faltam as variáveis SUPABASE_*;
 *  - `tabela-em-falta`           → falta correr o `db/schema.sql`;
 *  - `sem-permissao`             → a chave em uso não é a `service_role`;
 *  - `escrita-recusada`          → o Supabase não respondeu (pode ser passageiro);
 *  - `leitura-nao-confirma`      → escreveu, releu, e não veio o que se escreveu.
 */
export type EstadoDoArmazenamento =
  | "ok"
  | "ficheiro-de-desenvolvimento"
  | "sem-configuracao"
  | "tabela-em-falta"
  | "sem-permissao"
  | "escrita-recusada"
  | "leitura-nao-confirma";

/** Os buckets das fotos. `por-criar` NÃO é uma avaria: os buckets nascem no
 *  primeiro carregamento (ver `ensureBucket`), por isso uma instalação nova e
 *  correcta responde exactamente isto. */
export type EstadoDasFotos = "ok" | "por-criar" | "sem-resposta" | "sem-base-de-dados";

export interface DiagnosticoDoArmazenamento {
  estado: EstadoDoArmazenamento;
  /** O que se gravar agora sobrevive a um deploy? */
  duradouro: boolean;
  /** Vale a pena interromper alguém com isto? */
  avisar: boolean;
  /** O que se passa, numa linha. */
  titulo: string;
  /** O que fazer a seguir — com o nome do ficheiro a correr ou da variável a
   *  confirmar. Nunca «erro de armazenamento». */
  oQueFazer: string;
  fotos: EstadoDasFotos;
  /** O que fazer quanto às fotos, quando há alguma coisa a fazer. */
  fotosOQueFazer?: string;
  /**
   * Há quanto tempo não chega uma cópia de segurança — e se isso é para dizer.
   *
   * Ausente quando a pergunta não se fez, e ela não se faz em dois casos (ver
   * `apurar`): numa máquina de desenvolvimento, onde a tarefa agendada não
   * corre, e com o armazenamento em baixo, onde o carimbo não se pode ler e a
   * avaria a resolver é a outra.
   */
  copia?: EstadoDaCopia;
  /**
   * ── AS COLUNAS QUE FALTAM, QUANDO FALTAM ────────────────────────────────
   *
   * A pergunta irmã das outras duas, e a que custou uma proposta a sério: a
   * base responde, grava e relê — e não tem a coluna onde o DOCUMENTO da
   * proposta é guardado. Tudo funciona; só o casal é que não vê a proposta.
   *
   * Ausente quando está tudo lá e ausente também sem base de dados nenhuma
   * (ver `estado-das-colunas`). Nomes com a tabela à frente: `proposals.doc`.
   */
  colunasEmFalta?: string[];
  /** O que fazer quanto a elas. Nomeia o ficheiro a correr. */
  colunasTitulo?: string;
  colunasOQueFazer?: string;
  /** O que o servidor disse, para os registos. Não é para substituir o
   *  `oQueFazer` — é para quem for investigar. */
  detalhe?: string;
  /** Quando esta resposta foi apurada (ISO). Com cache, pode não ser agora. */
  verificadoEm: string;
  /**
   * O Vercel Blob (17/11): os avisos dos tectos, ou o ERRO de ficheiros no
   * Blob sem o token. Ausente quando não há nada a dizer. Não mexe no
   * `avisar` (o painel do topo é sobre a base de dados e a cópia); quem o lê
   * é o bloco «Hoje» e a janela da importação.
   */
  blob?: EstadoDoBlob;
}

/**
 * As frases. Vivem juntas de propósito: é assim que se vê, de uma vez, que
 * nenhum caso sai daqui com um «ocorreu um erro» — o que essa frase faz é pôr
 * uma pessoa a escrever a alguém, e é isso que se está a tentar evitar.
 *
 * Português europeu, e à altura de quem lê: quem abre o back office não sabe o
 * que é RLS, mas consegue correr um ficheiro que lhe digam pelo nome e consegue
 * confirmar uma variável cujo nome lhe digam.
 */
const FRASES: Record<EstadoDoArmazenamento, { titulo: string; oQueFazer: string }> = {
  ok: {
    titulo: "O armazenamento está ligado.",
    oQueFazer:
      "Não é preciso fazer nada: o que gravar fica na base de dados e sobrevive a deploys e a alterações no código.",
  },
  "ficheiro-de-desenvolvimento": {
    titulo: "A gravar no ficheiro local (esta máquina).",
    oQueFazer:
      "Nesta máquina é o esperado — o trabalho fica em data/app-state.json e mantém-se entre arranques. Em produção é preciso a base de dados: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
  },
  "sem-configuracao": {
    titulo:
      "O trabalho não está a ser guardado — fica no disco do servidor, que o próximo deploy apaga.",
    oQueFazer:
      "Define SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (a chave service_role, não a anon) nas variáveis de ambiente do alojamento e publica outra vez. Até lá, faz uma cópia do que estiveres a montar noutro sítio.",
  },
  "tabela-em-falta": {
    titulo: "A base de dados não tem a tabela onde o trabalho é guardado (app_state).",
    oQueFazer:
      "Corre o ficheiro db/schema.sql no editor de SQL do Supabase. Leva um minuto, pode ser corrido as vezes que forem precisas e não apaga nada do que já lá está.",
  },
  "sem-permissao": {
    titulo: "A base de dados está a recusar as gravações por falta de permissões.",
    oQueFazer:
      "A chave em uso não tem permissões de serviço. Confirma que SUPABASE_SERVICE_ROLE_KEY é mesmo a chave service_role do projeto (a anon não escreve nestas tabelas) e publica outra vez.",
  },
  "escrita-recusada": {
    titulo: "A base de dados não respondeu à gravação de teste.",
    oQueFazer:
      "Pode ser passageiro: verifica de novo dentro de um minuto. Se continuar, vê no painel do Supabase se o projeto está ativo (os projetos gratuitos são suspensos por inatividade) e confirma SUPABASE_URL.",
  },
  "leitura-nao-confirma": {
    titulo: "A gravação foi aceite mas o que se leu a seguir não é o que se escreveu.",
    oQueFazer:
      "Confirma que SUPABASE_URL aponta para o projeto certo (duas instalações a apontar para bases diferentes dão exactamente isto) e volta a verificar. Enquanto durar, não contes com o que o ecrã disser sobre gravações.",
  },
};

const FOTOS_O_QUE_FAZER: Partial<Record<EstadoDasFotos, string>> = {
  "por-criar":
    "Ainda não há pastas de fotografias — são criadas sozinhas na primeira fotografia carregada. Não é preciso fazer nada.",
  "sem-resposta": `O Storage do Supabase não respondeu (pastas ${PROPOSAL_BUCKET} e ${THEME_BUCKET}). As fotografias podem não abrir nem carregar. Confirma SUPABASE_URL e que o projeto não está suspenso no painel do Supabase.`,
  "sem-base-de-dados":
    "Sem base de dados ligada não há Storage: as fotografias carregadas ficam sem sítio onde viver.",
};

/**
 * Quanto tempo vale uma resposta.
 *
 * Isto é perguntado à abertura do back office e por cada ecrã que o mostre, em
 * cada separador aberto, e custa uma escrita e uma leitura numa tabela
 * partilhada. Sem tecto, um dia de trabalho com o portátil e o tablet abertos
 * são centenas de escritas só para dizer «está tudo bem».
 *
 * Um minuto é o compromisso: quem acabou de correr o `db/schema.sql` não espera
 * muito para ver o aviso desaparecer (e tem o `forcar` para não esperar nada), e
 * ninguém paga uma escrita por clique.
 */
export const VALIDADE_MS = 60_000;

let cache: { valor: DiagnosticoDoArmazenamento; expiraEm: number } | null = null;
/** Três ecrãs a montar ao mesmo tempo são UMA verificação, como no
 *  `useCachedList`: sem isto, o arranque do back office fazia três escritas. */
let emCurso: Promise<DiagnosticoDoArmazenamento> | null = null;

/** O bucket responde? `getBucket` é a pergunta mais barata que o Storage tem —
 *  não lista ficheiros nem transfere bytes. */
async function verBuckets(): Promise<{ estado: EstadoDasFotos; detalhe?: string }> {
  const sb = getSupabase();
  if (!sb) return { estado: "sem-base-de-dados" };
  const storage = sb.storage;
  if (!storage || typeof storage.getBucket !== "function") {
    return { estado: "sem-resposta", detalhe: "o cliente não expõe Storage" };
  }
  let porCriar = false;
  for (const bucket of [PROPOSAL_BUCKET, THEME_BUCKET]) {
    try {
      const { data, error } = await storage.getBucket(bucket);
      if (data) continue;
      const msg = error?.message ?? "";
      // "Bucket not found" é uma instalação por estrear, não uma avaria: o
      // `ensureBucket` cria-o na primeira fotografia. Confundir as duas coisas
      // era pôr um aviso vermelho à frente de quem ainda não fez nada de errado.
      if (/not found|não encontrad|does not exist/i.test(msg)) {
        porCriar = true;
        continue;
      }
      return { estado: "sem-resposta", detalhe: msg || "sem resposta do Storage" };
    } catch (e) {
      return { estado: "sem-resposta", detalhe: e instanceof Error ? e.message : String(e) };
    }
  }
  return { estado: porCriar ? "por-criar" : "ok" };
}

/** O estado que corresponde a uma escrita recusada. O `motivo` do `app-state` é
 *  o mesmo vocabulário — não se traduz aqui, reaproveita-se. */
function estadoDoMotivo(motivo: MotivoDeFalha | undefined): EstadoDoArmazenamento {
  if (motivo === "tabela-em-falta") return "tabela-em-falta";
  if (motivo === "sem-permissao") return "sem-permissao";
  return "escrita-recusada";
}

async function apurar(): Promise<DiagnosticoDoArmazenamento> {
  const sb = getSupabase();
  const prova = randomUUID();

  // A ida e volta, pelo MESMO caminho que uma gravação a sério faz. Um caminho
  // próprio de diagnóstico podia estar de pé com o verdadeiro em baixo.
  const escrita = await setState(CHAVE_DE_DIAGNOSTICO, {
    em: new Date().toISOString(),
    prova,
  });
  let confirmada = false;
  let detalhe: string | undefined;
  if (escrita.gravado) {
    const lido = await getState<{ prova?: string }>(CHAVE_DE_DIAGNOSTICO);
    confirmada = !!lido && lido.prova === prova;
    if (!confirmada) detalhe = "a releitura não devolveu a prova acabada de escrever";
  }

  const fotos = await verBuckets();

  let estado: EstadoDoArmazenamento;
  if (!sb) {
    // Sem base de dados o veredicto é do AMBIENTE, e não do resultado da
    // escrita: em Vercel o ficheiro até pode aceitar a escrita nesta invocação
    // — e continua a não ser um sítio. Dizer "escrita recusada" aqui mandava
    // investigar uma base de dados que não existe.
    if (oFicheiroEhEfemero()) estado = "sem-configuracao";
    else if (escrita.gravado && confirmada) estado = "ficheiro-de-desenvolvimento";
    else estado = escrita.gravado ? "leitura-nao-confirma" : estadoDoMotivo(escrita.motivo);
  } else if (!escrita.gravado) {
    estado = estadoDoMotivo(escrita.motivo);
  } else if (!confirmada) {
    estado = "leitura-nao-confirma";
  } else {
    estado = "ok";
  }

  const saudavel = estado === "ok" || estado === "ficheiro-de-desenvolvimento";

  /**
   * ── E SE ISTO DESAPARECER, HÁ DE ONDE VOLTAR? ────────────────────────────
   *
   * A pergunta irmã, no mesmo painel e pela mesma razão: é aqui que ela olha.
   * A cópia diária depende de `CRON_SECRET` e, sem ela, para em silêncio — uma
   * cópia que não corre há semanas é pior do que não ter cópia, porque dá a
   * certeza de estar salvo a quem já não está.
   *
   * Só se pergunta com o estado `ok`, e são duas exclusões deliberadas:
   *
   *  • `ficheiro-de-desenvolvimento` — a tarefa agendada não corre no portátil
   *    de ninguém. Um vermelho a cada `next dev` era o alarme falso perfeito;
   *  • qualquer estado de avaria — o carimbo vive na `app_state`, que é
   *    precisamente o que não está a responder. Dizer duas coisas vermelhas
   *    pela mesma causa divide a atenção em vez de a dirigir, e a que resolve
   *    o problema é a outra.
   */
  const copia = estado === "ok" ? await estadoDaCopia() : undefined;

  /**
   * ── E AS COLUNAS, ESTÃO LÁ? ──────────────────────────────────────────────
   *
   * Só com o estado `ok`, e pela mesma razão que a cópia: sem base de dados não
   * há esquema para lhe faltar coluna nenhuma (o ficheiro de desenvolvimento
   * aceita qualquer campo), e com a base em baixo a pergunta não tem resposta —
   * dizer duas coisas vermelhas pela mesma causa divide a atenção.
   */
  const colunas = estado === "ok" ? await colunasEmFalta() : [];

  const diagnostico: DiagnosticoDoArmazenamento = {
    estado,
    duradouro: saudavel ? escrita.duradouro : false,
    // Só se interrompe alguém quando há mesmo alguma coisa para essa pessoa
    // fazer. Ver o cabeçalho: um aviso que aparece sempre deixa de ser lido.
    avisar:
      !saudavel || fotos.estado === "sem-resposta" || copia?.avisar === true || colunas.length > 0,
    ...FRASES[estado],
    fotos: fotos.estado,
    ...(copia ? { copia } : {}),
    ...(colunas.length
      ? {
          colunasEmFalta: colunas,
          colunasTitulo: tituloDasColunas(colunas),
          colunasOQueFazer: oQueFazerComAsColunas(colunas),
        }
      : {}),
    ...(FOTOS_O_QUE_FAZER[fotos.estado] ? { fotosOQueFazer: FOTOS_O_QUE_FAZER[fotos.estado] } : {}),
    ...(detalhe || fotos.detalhe
      ? { detalhe: [detalhe, fotos.detalhe].filter(Boolean).join(" · ") }
      : {}),
    verificadoEm: new Date().toISOString(),
  };

  if (diagnostico.avisar) {
    log.warn("armazenamento: verificação com aviso", {
      estado,
      fotos: fotos.estado,
      colunas,
      detalhe: diagnostico.detalhe,
    });
  }
  return diagnostico;
}

/**
 * O estado do armazenamento, com cache de um minuto.
 *
 * NUNCA lança: quem chama é um ecrã de aviso, e um aviso que rebenta é pior do
 * que não haver aviso nenhum — some sem dizer porquê. Uma avaria da própria
 * verificação sai como `escrita-recusada`, que é a verdade do ponto de vista de
 * quem está do outro lado: não se conseguiu provar que a gravação funciona.
 *
 * `forcar` é para o botão «Verificar de novo»: quem acabou de correr o
 * `db/schema.sql` quer ver o aviso desaparecer agora, não daqui a um minuto.
 * Salta a CACHE, mas junta-se a uma verificação já a decorrer — essa começou há
 * instantes e responde ao que ele quer saber; duas escritas em paralelo na
 * mesma chave só dariam trabalho à base de dados para dizer o mesmo.
 */
export async function verificarArmazenamento(opcoes?: {
  forcar?: boolean;
}): Promise<DiagnosticoDoArmazenamento> {
  const agora = Date.now();
  if (!opcoes?.forcar && cache && cache.expiraEm > agora) return cache.valor;
  if (emCurso) return emCurso;

  emCurso = (async () => {
    try {
      const [valor, blob] = await Promise.all([apurar(), estadoDoBlob()]);
      return blob ? { ...valor, blob } : valor;
    } catch (e) {
      log.error("armazenamento: a própria verificação falhou", e);
      return {
        estado: "escrita-recusada" as const,
        duradouro: false,
        avisar: true,
        ...FRASES["escrita-recusada"],
        fotos: "sem-resposta" as const,
        fotosOQueFazer: FOTOS_O_QUE_FAZER["sem-resposta"],
        detalhe: e instanceof Error ? e.message : String(e),
        verificadoEm: new Date().toISOString(),
      };
    }
  })();

  try {
    const valor = await emCurso;
    cache = { valor, expiraEm: Date.now() + VALIDADE_MS };
    return valor;
  } finally {
    emCurso = null;
  }
}

/** Esquece a última resposta. Existe para os testes e para quem mude a
 *  configuração dentro do mesmo processo. */
export function esquecerVerificacao(): void {
  cache = null;
}
