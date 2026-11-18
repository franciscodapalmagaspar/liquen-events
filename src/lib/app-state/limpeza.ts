import { ESPACOS } from "./espacos";
import type { LinhaVarrida } from "./varrer";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE A NOITE TIRA DO `app_state` — AS REGRAS, SEM I/O
 * ════════════════════════════════════════════════════════════════════════════
 *
 * docs/ESTRUTURA-DOS-DADOS.md, P3 (G3). Saem só coisas que não são trabalho de
 * ninguém, ou que o dono autorizou (17/11):
 *
 *  · as LÁPIDES (valor nulo) dos espaços limpos — o que o `clearProposalDraft`
 *    e as reposições gravavam até 18/11 em vez de apagar;
 *  · os rascunhos e os envios de PEDIDOS QUE JÁ NÃO EXISTEM (autorizado pelo
 *    dono a 17/11, desde que a cópia da noite os leve primeiro);
 *  · a cache da proposta online (`proposta-web:`) de propostas que já não
 *    existem, e os RETRATOS EXPIRADOS — um retrato substituído expira em sete
 *    dias (`retrato.ts`), e um expirado nunca mais é servido;
 *  · as ligações curtas (`ligacao-*`) de propostas que já não existem.
 *
 * NÃO saem: os `tempo-activo:` sem pedido (o dono ainda não decidiu); e o
 * resto da cache da proposta online (`conteudo`, `cores`, `pontos`, a paleta)
 * enquanto a proposta existir — a impressão na chave mistura a língua, as
 * fotografias e o que falta, e «a linha mais nova do grupo» não diz qual é a
 * atual (revisão de 18/11): apagar a errada era pagar o cálculo outra vez.
 *
 * «Existe» inclui a Reciclagem: um pedido apagado há menos de 30 dias pode
 * voltar, e volta com o que tinha (as propostas que foram com o pedido também
 * contam). E nada com menos de {@link IDADE_MINIMA_HORAS} horas sai por
 * ser órfão: quem existe lê-se no início da noite, e uma proposta enviada a
 * meio da limpeza não pode ver o link que acabou de seguir ser apagado.
 *
 * O id de um rascunho é o do pedido ANTES do primeiro `--`: o estúdio guarda
 * quatro chaves por pedido (`<id>`, `<id>--orcamento-linhas`, `<id>--sobreposto`,
 * `<id>--orcamento-linhas--sobreposto`, ver `reciclagem.ts`). Contar a chave
 * inteira dava 13 rascunhos vivos como órfãos (medido a 17/11).
 */

export type MotivoDeSaida =
  | "lapide"
  | "rascunho-sem-pedido"
  | "envio-sem-pedido"
  | "proposta-web-sem-proposta"
  | "retrato-expirado"
  | "ligacao-sem-proposta";

/** Pela ordem em que saem quando há mais do que o tecto da noite: primeiro o
 *  que não tem dados de ninguém, por último o que tem. */
export const ORDEM_DE_SAIDA: readonly MotivoDeSaida[] = [
  "lapide",
  "retrato-expirado",
  "proposta-web-sem-proposta",
  "ligacao-sem-proposta",
  "envio-sem-pedido",
  "rascunho-sem-pedido",
];

export const IDADE_MINIMA_HORAS = 24;
const HORA_MS = 60 * 60 * 1000;

/** Os campos de topo que as regras leem (o resto do valor não se traz). */
export const CAMPOS_POR_ESPACO: Readonly<Record<string, readonly string[]>> = {
  [ESPACOS.ligacoes.chave]: ["propostaId", "pedidoId"],
  [ESPACOS.ligacoesInversas.chave]: ["codigo"],
  [ESPACOS.propostaWeb.chave]: ["validoAte"],
};

/** Os espaços que a noite limpa. */
export const ESPACOS_LIMPOS: readonly string[] = [
  ESPACOS.rascunhos.chave,
  ESPACOS.enviosDeProposta.chave,
  ESPACOS.ligacoes.chave,
  ESPACOS.ligacoesInversas.chave,
  ESPACOS.propostaWeb.chave,
];

export interface QuemExiste {
  /** Os pedidos, os vivos e os da Reciclagem. */
  pedidos: ReadonlySet<string>;
  /** As propostas, as vivas e as da Reciclagem. */
  propostas: ReadonlySet<string>;
}

export interface Saida extends LinhaVarrida {
  motivo: MotivoDeSaida;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resto = (chave: string, prefixo: string) => chave.slice(prefixo.length);
const texto = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * `proposta-web:<tipo>:<proposta>:<impressão>`. Só conta como proposta um
 * uuid: a paleta do PDF guarda-se com `refs` no lugar dela, e nunca é órfã.
 */
function partesDaPropostaWeb(chave: string): { tipo: string; proposta: string | null } {
  const [tipo = "", proposta = ""] = resto(chave, ESPACOS.propostaWeb.chave).split(":");
  return { tipo, proposta: UUID.test(proposta) ? proposta : null };
}

/** Uma ligação está viva se a proposta dela existir (ou estiver na Reciclagem). */
function ligacaoViva(campos: LinhaVarrida["campos"], existe: QuemExiste): boolean | null {
  const proposta = texto(campos.propostaId);
  if (proposta === null) return null; // não se sabe de quem é: fica
  return existe.propostas.has(proposta);
}

/** Órfã: a regra de cada espaço, sem a idade (que se vê à parte). */
function orfa(l: LinhaVarrida, existe: QuemExiste, ligacoes: Map<string, boolean | null>) {
  const { key, campos } = l;
  if (key.startsWith(ESPACOS.rascunhos.chave)) {
    const pedido = resto(key, ESPACOS.rascunhos.chave).split("--")[0];
    return existe.pedidos.has(pedido) ? null : "rascunho-sem-pedido";
  }
  if (key.startsWith(ESPACOS.enviosDeProposta.chave)) {
    const pedido = resto(key, ESPACOS.enviosDeProposta.chave);
    return existe.pedidos.has(pedido) ? null : "envio-sem-pedido";
  }
  if (key.startsWith(ESPACOS.ligacoesInversas.chave)) {
    if (existe.propostas.has(resto(key, ESPACOS.ligacoesInversas.chave))) return null;
    // O inverso segue o código para que aponta: fica se esse estiver vivo.
    const codigo = texto(campos.codigo);
    const viva = codigo === null ? undefined : ligacoes.get(`${ESPACOS.ligacoes.chave}${codigo}`);
    return viva === true || viva === null ? null : "ligacao-sem-proposta";
  }
  if (key.startsWith(ESPACOS.ligacoes.chave)) {
    return ligacoes.get(key) === false ? "ligacao-sem-proposta" : null;
  }
  if (key.startsWith(ESPACOS.propostaWeb.chave)) {
    const { proposta } = partesDaPropostaWeb(key);
    return proposta !== null && !existe.propostas.has(proposta)
      ? "proposta-web-sem-proposta"
      : null;
  }
  return null;
}

function motivoDaLinha(
  l: LinhaVarrida,
  existe: QuemExiste,
  ligacoes: Map<string, boolean | null>,
  agora: number,
): MotivoDeSaida | null {
  if (!ESPACOS_LIMPOS.some((p) => l.key.startsWith(p))) return null;
  if (l.nula) return "lapide";
  if (l.key.startsWith(ESPACOS.propostaWeb.chave)) {
    const validoAte = l.campos.validoAte;
    const retrato = partesDaPropostaWeb(l.key).tipo === "retrato";
    if (retrato && typeof validoAte === "number" && validoAte < agora) return "retrato-expirado";
  }
  const motivo = orfa(l, existe, ligacoes);
  if (!motivo) return null;
  // Sem base de dados (desenvolvimento) não há data, e não há noite a meio.
  if (l.escritaEm === null) return motivo;
  // Uma data ilegível ou recente: não se sabe se nasceu depois de se ler
  // quem existe. Fica para outra noite.
  const escrita = Date.parse(l.escritaEm);
  return Number.isFinite(escrita) && escrita < agora - IDADE_MINIMA_HORAS * HORA_MS ? motivo : null;
}

/**
 * O que sai esta noite, no máximo `tecto` linhas, pela {@link ORDEM_DE_SAIDA}.
 * `ficam` diz quantas ficaram para a noite seguinte por causa do tecto.
 */
export function oQueSaiDoAppState(
  todas: readonly LinhaVarrida[],
  existe: QuemExiste,
  agora: number,
  tecto: number,
): { saem: Saida[]; ficam: number } {
  // Uma chave vista nas duas passagens (lápide e com valor) mudou durante a
  // varredura: não se decide nada sobre ela esta noite.
  const vistas = new Map<string, number>();
  for (const l of todas) vistas.set(l.key, (vistas.get(l.key) ?? 0) + 1);
  const linhas = todas.filter((l) => vistas.get(l.key) === 1);
  const ligacoes = new Map<string, boolean | null>();
  for (const l of linhas) {
    if (l.key.startsWith(ESPACOS.ligacoes.chave) && !l.nula) {
      ligacoes.set(l.key, ligacaoViva(l.campos, existe));
    }
  }
  const candidatas: Saida[] = [];
  for (const l of linhas) {
    const motivo = motivoDaLinha(l, existe, ligacoes, agora);
    if (motivo) candidatas.push({ ...l, motivo });
  }
  const ordem = (m: MotivoDeSaida) => ORDEM_DE_SAIDA.indexOf(m);
  candidatas.sort((a, b) => ordem(a.motivo) - ordem(b.motivo) || a.key.localeCompare(b.key));
  const limite = Math.max(0, Math.floor(tecto));
  return { saem: candidatas.slice(0, limite), ficam: Math.max(0, candidatas.length - limite) };
}

/** Quantas por motivo — para o registo da noite (sem chaves nem valores). */
export function contarPorMotivo(saidas: readonly Saida[]): Partial<Record<MotivoDeSaida, number>> {
  const n: Partial<Record<MotivoDeSaida, number>> = {};
  for (const s of saidas) n[s.motivo] = (n[s.motivo] ?? 0) + 1;
  return n;
}
