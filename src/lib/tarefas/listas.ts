import type { Task, TaskPriority } from "@/lib/orcamento/types";
import { diaDoPrazo } from "./prazo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS LISTAS, OS GRUPOS E A ORDEM DAS TAREFAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fases 05 e 06 do `docs/APPLE-TAREFAS.md` — «Hoje · Esta semana ·
 * Atrasadas · Sem data · Todas, mais listas por evento» e «Agrupar por: Data ·
 * Evento · Responsável · Nenhum», «Ordenar por: Data · Prioridade · Criação ·
 * Manual».
 *
 * ── PORQUE É QUE ISTO NÃO VIVE DENTRO DO ECRÃ ─────────────────────────────
 *
 * Porque o que está aqui são REGRAS e não desenho: o que é uma tarefa de hoje,
 * o que conta como atrasada, onde é que uma tarefa sem data vai parar. São as
 * respostas que ela vai discutir — «isto devia contar como desta semana?» — e
 * discutem-se mal dentro de um `useMemo` de mil linhas. Aqui têm nome, têm
 * teste, e mudam-se num sítio só.
 *
 * Nada disto conhece o React, o `fetch` ou o relógio: o dia de hoje ENTRA como
 * argumento (`hoje`, em `YYYY-MM-DD` local). Uma função que lê o relógio por
 * dentro não se testa — testa-se o dia em que se corre o teste.
 *
 * ── AS TRÊS DECISÕES QUE O DOCUMENTO DEIXOU EM ABERTO ─────────────────────
 *
 * O documento nomeia as listas e não diz onde ficam as fronteiras. Ficam
 * escritas aqui, cada uma ao pé da função que a executa, porque uma fronteira
 * inventada em silêncio é a que ninguém consegue contestar depois.
 */

/** A ordem por que a prioridade se lê: primeiro o que arde. */
const ORDEM_DA_PRIORIDADE: Record<TaskPriority, number> = { alta: 0, normal: 1, baixa: 2 };

/** As cinco listas inteligentes. As por evento nascem das tarefas, mais abaixo. */
export type ListaInteligente = "hoje" | "semana" | "atrasadas" | "sem-data" | "todas";

/** Uma lista de evento é sempre `evento:` mais a chave do evento. */
export type ListaDeEvento = `evento:${string}`;

export type ListaId = ListaInteligente | ListaDeEvento;

export interface Lista {
  id: ListaId;
  rotulo: string;
}

/**
 * As cinco, pela ordem do documento — que é a ordem do horizonte: hoje, esta
 * semana, o que já passou, o que não tem prazo, e tudo.
 */
export const LISTAS_INTELIGENTES: readonly Lista[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "semana", rotulo: "Esta semana" },
  { id: "atrasadas", rotulo: "Atrasadas" },
  { id: "sem-data", rotulo: "Sem data" },
  { id: "todas", rotulo: "Todas" },
];

/**
 * A LISTA POR OMISSÃO É «TODAS», E NÃO «HOJE».
 *
 * O desenho da Parte 2 põe «Hoje» no título da barra, e é a escolha certa numa
 * app em que toda a tarefa nasce com data. Nesta não nasce: o prazo é um campo
 * opcional da linha de escrever, e a maior parte das tarefas desta casa não o
 * tem. Abrir em «Hoje» dava, no primeiro dia, um ecrã vazio por cima de uma
 * lista cheia — o pior arranque possível, porque não se distingue de «não há
 * nada».
 *
 * «Todas» é o que o ecrã mostrava antes destas duas fases. Ninguém perde nada
 * de vista no dia em que as listas aparecem, e as outras quatro ficam ali ao
 * lado, com a contagem, a explicar-se sozinhas.
 */
export const LISTA_POR_OMISSAO: ListaInteligente = "todas";

/**
 * O último dia da semana a que `hoje` pertence, em `YYYY-MM-DD`.
 *
 * SEMANA DE SEGUNDA A DOMINGO, e não «os próximos sete dias». Duas razões, e a
 * segunda é a que decide: em português «esta semana» é a semana do calendário,
 * e nesta casa os eventos são ao sábado — com uma janela deslizante de sete
 * dias, o casamento deste sábado saltava para fora da lista na segunda-feira
 * seguinte à sua semana de montagem, que é precisamente quando ela mais a lê.
 *
 * Ao meio-dia, e não à meia-noite: `new Date("2026-03-29")` é UTC, e num dia de
 * mudança de hora a meia-noite local cai no dia anterior. É a mesma precaução
 * do `todayKey`.
 */
export function fimDaSemana(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00`);
  // `getDay()` dá 0 ao domingo. Faltam `(7 - dia) % 7` dias para o domingo —
  // zero quando já é domingo, que é o último dia da sua própria semana.
  const diasAteDomingo = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + diasAteDomingo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** O dia seguinte a `hoje`, em `YYYY-MM-DD`. */
export function amanha(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A chave do evento de uma tarefa, ou `null` se ela não pertencer a nenhum.
 *
 * A proposta manda sobre o nome escrito: duas tarefas da mesma proposta são do
 * mesmo evento mesmo que o `clientName` tenha sido gravado de duas maneiras
 * («Melanie» e «Melanie e Sebastien»). Sem `quoteId` resta o nome, em minúsculas
 * e sem espaços à volta, que é o que impede «Daniela » e «daniela» de virarem
 * duas listas.
 */
export function chaveDoEvento(t: Task): string | null {
  if (t.quoteId) return `q:${t.quoteId}`;
  const nome = (t.clientName ?? "").trim();
  return nome ? `c:${nome.toLowerCase()}` : null;
}

/**
 * Uma tarefa cai nesta lista?
 *
 * ── ONDE FICAM AS FRONTEIRAS, E PORQUÊ ───────────────────────────────────
 *
 * `hoje` — prazo HOJE **ou já passado**. É o que os Lembretes fazem, e a razão
 * é a pergunta a que a lista responde: «o que é que eu tenho para fazer hoje?»
 * Uma tarefa que devia estar feita há dois dias é, hoje, mais urgente do que
 * uma que vence hoje — escondê-la de «Hoje» era mandar procurá-la noutro sítio
 * para descobrir o que já ardia. É também o que faz bater a contagem do desenho
 * da Parte 2: «Hoje 8» com «2 atrasadas» ao lado são as MESMAS oito, com duas
 * delas nomeadas.
 *
 * `semana` — tudo o que `hoje` apanha, mais o que vence até domingo. As listas
 * de horizonte encaixam umas nas outras: atrasadas ⊂ hoje ⊂ esta semana ⊂
 * todas. É essa a propriedade que faz uma barra lateral ler-se sem instruções.
 *
 * `atrasadas` — prazo passado e **por fazer**. É a única lista que olha para o
 * `done`, e é de propósito: uma tarefa concluída na semana passada não está
 * atrasada, está feita. Sem esta condição, a secção «Concluídas» desta lista
 * encher-se-ia de trabalho que ninguém deve nada.
 *
 * `sem-data` — sem prazo nenhum. É a lista onde vai parar o que se escreve à
 * pressa, e existe para esse monte ter um sítio em vez de se diluir em «Todas».
 */
export function pertenceALista(t: Task, lista: ListaId, hoje: string): boolean {
  if (lista.startsWith("evento:")) return chaveDoEvento(t) === lista.slice("evento:".length);
  // Lido como DIA: um prazo antigo com hora agarrada («…T10:00») comparava-se
  // como texto mais comprido e saía de «Hoje» (ver `lib/tarefas/prazo.ts`).
  const dia = diaDoPrazo(t.dueDate);
  switch (lista) {
    case "hoje":
      return !!dia && dia <= hoje;
    case "semana":
      return !!dia && dia <= fimDaSemana(hoje);
    case "atrasadas":
      return !!dia && dia < hoje && !t.done;
    case "sem-data":
      return !t.dueDate;
    case "todas":
      return true;
    default:
      return true;
  }
}

/**
 * As listas por evento que estas tarefas justificam, por ordem alfabética.
 *
 * ── NASCEM DAS TAREFAS, E NÃO DAS PROPOSTAS ──────────────────────────────
 *
 * O documento diz «geradas automaticamente das propostas ativas». Ficam a
 * nascer das tarefas, e a razão está na Parte 8: «contador de zero como
 * cabeçalho» é proibição deste ecrã. Com trinta propostas activas e tarefas em
 * seis, a barra lateral ganhava vinte e quatro listas a dizer 0 — e a lista da
 * Melanie, que interessa, ficava a meio de um monte que não interessa. Uma
 * lista de evento aparece quando há trabalho nela, e desaparece quando o
 * trabalho acaba.
 *
 * ── E POR ORDEM ALFABÉTICA, E NÃO POR CONTAGEM ───────────────────────────
 *
 * O desenho da Parte 2 mostra-as por contagem decrescente (6, 4, 3). Uma barra
 * ordenada pela contagem REORDENA-SE quando ela risca uma tarefa: o destino
 * seguinte muda de sítio debaixo do cursor, que é exactamente o defeito que a
 * espera de segundo e meio da fase 04 existe para não ter. Alfabética não se
 * mexe.
 */
/**
 * O nome de cada pedido, pelo id — para as tarefas que só têm o `quoteId`.
 *
 * Auditoria de 14/11, n.º 16: «Evento sem nome» quando o pedido tinha nome.
 * Uma tarefa criada a partir de um pedido pode ter sido gravada sem
 * `clientName` (ou com ele vazio), e as listas só olhavam para esse campo. O
 * nome do pedido manda — é o mesmo que a chave já usa para juntar as tarefas.
 */
export type NomesDosPedidos = ReadonlyMap<string, string>;

/** O nome que um evento mostra, ou "" se ninguém o souber. */
export function nomeDoEvento(t: Task, nomes?: NomesDosPedidos): string {
  const doPedido = t.quoteId ? (nomes?.get(t.quoteId) ?? "").trim() : "";
  return doPedido || (t.clientName ?? "").trim();
}

const SEM_NOME = "Evento sem nome";

export function listasDeEvento(tarefas: readonly Task[], nomes?: NomesDosPedidos): Lista[] {
  const rotulos = new Map<string, string>();
  for (const t of tarefas) {
    const chave = chaveDoEvento(t);
    if (!chave) continue;
    // Um nome vazio NÃO fica com o lugar: a tarefa seguinte do mesmo evento
    // pode trazer o nome que esta não tem.
    if (rotulos.get(chave)) continue;
    rotulos.set(chave, nomeDoEvento(t, nomes));
  }
  return [...rotulos.entries()]
    .map(([chave, rotulo]): Lista => ({ id: `evento:${chave}`, rotulo: rotulo || SEM_NOME }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-PT"));
}

/**
 * Quantas tarefas POR FAZER tem cada lista.
 *
 * Só as por fazer, como no filtro por pessoa que já cá estava: a contagem ao
 * lado do nome de uma lista é uma dívida, não um inventário. «Todas 31» com 19
 * concluídas lá dentro não diz nada a ninguém.
 */
export function contarPorLista(
  tarefas: readonly Task[],
  hoje: string,
  eventos: readonly Lista[] = listasDeEvento(tarefas),
): Map<ListaId, number> {
  const ids = [...LISTAS_INTELIGENTES, ...eventos].map((l) => l.id);
  const contas = new Map<ListaId, number>(ids.map((id) => [id, 0]));
  for (const t of tarefas) {
    if (t.done) continue;
    for (const id of ids) {
      if (pertenceALista(t, id, hoje)) contas.set(id, (contas.get(id) ?? 0) + 1);
    }
  }
  return contas;
}

/* ═══════════════════════════════════════════════════════════════════════════
   AGRUPAR
   ═══════════════════════════════════════════════════════════════════════════ */

export type Agrupamento = "data" | "evento" | "responsavel" | "nenhum";

export const AGRUPAMENTOS: readonly { id: Agrupamento; rotulo: string }[] = [
  { id: "data", rotulo: "Data" },
  { id: "evento", rotulo: "Evento" },
  { id: "responsavel", rotulo: "Responsável" },
  { id: "nenhum", rotulo: "Nenhum" },
];

/** Por omissão, Data — é o que o ponto 11 do documento manda. */
export const AGRUPAMENTO_POR_OMISSAO: Agrupamento = "data";

export interface Grupo {
  id: string;
  /** `null` só no agrupamento «Nenhum»: uma lista corrida não leva cabeçalho. */
  titulo: string | null;
  tarefas: Task[];
}

/**
 * Os degraus do agrupamento por data, por ordem de leitura.
 *
 * «Atrasadas» primeiro, e isso é o desenho da Parte 2 — o que já falhou lê-se
 * antes do que ainda não. E não há degrau «Ontem» nem «Anteontem»: uma tarefa
 * atrasada não se lê pela data em que devia ter sido feita, lê-se pelo facto de
 * o ter falhado. A data continua na linha, com o ⚠ ao lado.
 */
const DEGRAUS_DE_DATA = ["atrasadas", "hoje", "amanha", "semana", "depois", "sem-data"] as const;

const TITULO_DO_DEGRAU: Record<(typeof DEGRAUS_DE_DATA)[number], string> = {
  atrasadas: "Atrasadas",
  hoje: "Hoje",
  amanha: "Amanhã",
  semana: "Esta semana",
  depois: "Mais tarde",
  "sem-data": "Sem data",
};

function degrauDaData(t: Task, hoje: string): (typeof DEGRAUS_DE_DATA)[number] {
  const dia = diaDoPrazo(t.dueDate);
  if (!dia) return "sem-data";
  if (dia < hoje) return "atrasadas";
  if (dia === hoje) return "hoje";
  if (dia === amanha(hoje)) return "amanha";
  if (dia <= fimDaSemana(hoje)) return "semana";
  return "depois";
}

/**
 * Reparte as tarefas em grupos, pela ordem por que os grupos se desenham.
 *
 * A ordem DENTRO de cada grupo é a que entrar: quem agrupa já ordenou (ver
 * `ordenarTarefas`). Repartir e ordenar são duas perguntas, e misturá-las era
 * o caminho para o «Ordenar por prioridade» não valer dentro dos grupos.
 *
 * Grupos vazios não saem. É a Parte 8, letra por letra: «contador de zero como
 * cabeçalho» e «separador por baixo de um cabeçalho sem conteúdo».
 */
export function agruparTarefas(
  tarefas: readonly Task[],
  modo: Agrupamento,
  hoje: string,
  nomes?: NomesDosPedidos,
): Grupo[] {
  if (modo === "nenhum") {
    return tarefas.length ? [{ id: "todas", titulo: null, tarefas: [...tarefas] }] : [];
  }

  if (modo === "data") {
    const baldes = new Map<string, Task[]>();
    for (const t of tarefas) {
      const degrau = degrauDaData(t, hoje);
      const balde = baldes.get(degrau);
      if (balde) balde.push(t);
      else baldes.set(degrau, [t]);
    }
    return DEGRAUS_DE_DATA.filter((d) => baldes.has(d)).map((d) => ({
      id: d,
      titulo: TITULO_DO_DEGRAU[d],
      tarefas: baldes.get(d)!,
    }));
  }

  /**
   * Evento e responsável partilham a mesma mecânica e a mesma cauda: o grupo
   * dos que não têm vai SEMPRE para o fim, por muito grande que seja. «Sem
   * responsável» no topo era pôr o que ninguém assumiu à frente do trabalho de
   * quem o assumiu.
   */
  const semChave: Task[] = [];
  const baldes = new Map<string, { titulo: string; tarefas: Task[] }>();
  for (const t of tarefas) {
    const chave = modo === "evento" ? chaveDoEvento(t) : (t.assignee ?? "").trim() || null;
    if (!chave) {
      semChave.push(t);
      continue;
    }
    const titulo = modo === "evento" ? nomeDoEvento(t, nomes) : chave;
    const balde = baldes.get(chave);
    if (balde) {
      balde.tarefas.push(t);
      if (!balde.titulo) balde.titulo = titulo;
    } else baldes.set(chave, { titulo, tarefas: [t] });
  }

  const grupos: Grupo[] = [...baldes.entries()]
    .map(
      ([chave, { titulo, tarefas: lista }]): Grupo => ({
        id: chave,
        titulo: titulo || SEM_NOME,
        tarefas: lista,
      }),
    )
    .sort((a, b) => (a.titulo ?? "").localeCompare(b.titulo ?? "", "pt-PT"));

  if (semChave.length) {
    grupos.push({
      id: "sem-chave",
      titulo: modo === "evento" ? "Sem evento" : "Sem responsável",
      tarefas: semChave,
    });
  }
  return grupos;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ORDENAR
   ═══════════════════════════════════════════════════════════════════════════ */

export type Ordenacao = "data" | "prioridade" | "criacao" | "manual";

export const ORDENACOES: readonly { id: Ordenacao; rotulo: string }[] = [
  { id: "data", rotulo: "Data" },
  { id: "prioridade", rotulo: "Prioridade" },
  { id: "criacao", rotulo: "Criação" },
  { id: "manual", rotulo: "Manual" },
];

export const ORDENACAO_POR_OMISSAO: Ordenacao = "data";

/**
 * Ordena SEM tocar na lista que recebe.
 *
 * `data` é a ordem que este ecrã já tinha: o prazo mais próximo primeiro, o que
 * não tem prazo no fim, e a prioridade a desempatar. `prioridade` troca as duas
 * chaves de lugar em vez de ignorar a data — dentro da mesma prioridade, o que
 * vence primeiro continua a vir primeiro. `criacao` é a mais recente no topo,
 * que é onde a linha de escrever a acabou de pôr.
 *
 * `manual` é a ordem que ELA escolheu, guardada em `ordemManual` como uma lista
 * de ids. Um id que não esteja lá — uma tarefa criada depois de a ordem ter
 * sido fixada — fica no TOPO, pela mesma razão: é onde ela apareceu ao ser
 * criada, e uma tarefa nova que aterrasse no fim de uma lista de quarenta era
 * uma tarefa que se escreve e se perde de vista.
 */
export function ordenarTarefas(
  tarefas: readonly Task[],
  modo: Ordenacao,
  ordemManual: readonly string[] = [],
): Task[] {
  const lista = [...tarefas];
  switch (modo) {
    case "prioridade":
      return lista.sort(
        (a, b) =>
          ORDEM_DA_PRIORIDADE[a.priority] - ORDEM_DA_PRIORIDADE[b.priority] || compararPrazo(a, b),
      );
    case "criacao":
      // Decrescente: a mais recente no topo. `localeCompare` porque o
      // `createdAt` é uma cadeia ISO e comparar cadeias ISO é comparar instantes.
      return lista.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    case "manual": {
      const posicao = new Map(ordemManual.map((id, i) => [id, i]));
      // `-1` para quem não está na ordem: fica antes de toda a gente, e o
      // `sort` estável do JavaScript guarda a ordem relativa entre elas.
      return lista.sort((a, b) => (posicao.get(a.id) ?? -1) - (posicao.get(b.id) ?? -1));
    }
    case "data":
    default:
      return lista.sort(
        (a, b) =>
          compararPrazo(a, b) || ORDEM_DA_PRIORIDADE[a.priority] - ORDEM_DA_PRIORIDADE[b.priority],
      );
  }
}

/** Prazo mais próximo primeiro; sem prazo no fim. */
function compararPrazo(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return 0;
}

/**
 * ── A COSTURA DO ARRASTAR (fase 09) ──────────────────────────────────────
 *
 * A fase 06 entrega «ordenação manual ACTIVA o arrastar»; o arrastar em si é a
 * fase 09. O que fica pronto é o motor: a ordem manual é uma lista de ids, e
 * mover uma tarefa é esta função — a mesma que o arrasto vai chamar ao largar e
 * que um «Mover para cima» de teclado chamaria com o id do vizinho.
 *
 * `mover` sai de onde está e ENTRA NO LUGAR de `destino`, empurrando-o para
 * baixo. É o que uma linha de inserção desenha entre duas linhas, e é o que
 * torna a operação reversível: mover A para o sítio de B e depois B para o
 * sítio de A devolve a lista ao princípio.
 *
 * Sem `destino` (ou com um destino que já não existe) a tarefa vai para o fim.
 */
export function reordenarManualmente(
  ordem: readonly string[],
  mover: string,
  destino?: string | null,
): string[] {
  // Largar uma tarefa em cima de si própria não é mover nada. Sem esta linha, o
  // mais pequeno tremor do rato ao começar o arrasto mandava a linha para o fim.
  if (destino === mover) return [...ordem];
  const sem = ordem.filter((id) => id !== mover);
  if (!destino) return [...sem, mover];
  const onde = sem.indexOf(destino);
  if (onde < 0) return [...sem, mover];
  return [...sem.slice(0, onde), mover, ...sem.slice(onde)];
}

/**
 * A ordem manual de arranque: a que estiver no ecrã no momento em que ela
 * escolhe «Manual».
 *
 * Escolher «Manual» não pode fazer a lista saltar — se a ordem manual nascesse
 * vazia, as quarenta linhas mudavam todas de sítio no instante em que ela pede
 * para as poder arrumar à mão. Nasce igual ao que está à frente dela, e a
 * primeira mudança é a primeira que ela fizer.
 */
export function ordemVisivel(grupos: readonly Grupo[]): string[] {
  return grupos.flatMap((g) => g.tarefas.map((t) => t.id));
}
