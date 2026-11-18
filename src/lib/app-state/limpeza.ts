import { ESPACOS } from "./espacos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE A NOITE TIRA DO `app_state` — AS REGRAS, SEM I/O
 * ════════════════════════════════════════════════════════════════════════════
 *
 * docs/ESTRUTURA-DOS-DADOS.md, P3 (G3). Saem só coisas que não são trabalho de
 * ninguém, ou que o dono autorizou (17/11):
 *
 *  · as LÁPIDES dos rascunhos (`proposal-draft:` com valor nulo — o que o
 *    `clearProposalDraft` gravava até 17/11 em vez de apagar);
 *  · os rascunhos e os envios de PEDIDOS QUE JÁ NÃO EXISTEM (autorizado pelo
 *    dono a 17/11, desde que a cópia da noite os leve primeiro);
 *  · a cache da proposta online (`proposta-web:`) de propostas que já não
 *    existem, os retratos já expirados, e as linhas substituídas há mais de
 *    {@link SUBSTITUIDA_HA_DIAS} dias por outra da mesma proposta;
 *  · as ligações curtas (`ligacao-*`) de propostas que já não existem.
 *
 * NÃO saem — nem aqui nem em lado nenhum, até o dono decidir — os
 * `tempo-activo:` sem pedido.
 *
 * «Existe» inclui a Reciclagem: um pedido ou uma proposta apagados há menos
 * de 30 dias podem voltar, e voltam com o que tinham.
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
  | "proposta-web-substituida"
  | "ligacao-sem-proposta";

/** Pela ordem em que saem quando há mais do que o tecto da noite: primeiro o
 *  que não tem dados de ninguém, por último o que tem. */
export const ORDEM_DE_SAIDA: readonly MotivoDeSaida[] = [
  "lapide",
  "retrato-expirado",
  "proposta-web-sem-proposta",
  "proposta-web-substituida",
  "ligacao-sem-proposta",
  "envio-sem-pedido",
  "rascunho-sem-pedido",
];

export const SUBSTITUIDA_HA_DIAS = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface LinhaLida {
  key: string;
  value: unknown;
  /** O `updated_at` (ver `listStateByPrefix`). */
  versao: string;
}

export interface QuemExiste {
  /** Os pedidos, os vivos e os da Reciclagem. */
  pedidos: ReadonlySet<string>;
  /** As propostas, as vivas e as da Reciclagem. */
  propostas: ReadonlySet<string>;
}

export interface Saida extends LinhaLida {
  motivo: MotivoDeSaida;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resto = (chave: string, prefixo: string) => chave.slice(prefixo.length);

function campoDeTexto(valor: unknown, campo: string): string | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const v: unknown = Reflect.get(valor, campo);
  return typeof v === "string" ? v : null;
}

function campoNumerico(valor: unknown, campo: string): number | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const v: unknown = Reflect.get(valor, campo);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * `proposta-web:<tipo>:<proposta>:<impressão>`. Só conta como proposta um
 * uuid: a paleta do PDF guarda-se com `refs` no lugar dela, e nunca é órfã.
 */
function partesDaPropostaWeb(chave: string): { tipo: string; proposta: string | null } {
  const [tipo = "", proposta = ""] = resto(chave, ESPACOS.propostaWeb.chave).split(":");
  return { tipo, proposta: UUID.test(proposta) ? proposta : null };
}

/** A regra de cada linha, sozinha (a «substituída» precisa do grupo: à parte). */
function motivoDaLinha(l: LinhaLida, existe: QuemExiste, agora: number): MotivoDeSaida | null {
  const { key, value } = l;
  if (key.startsWith(ESPACOS.rascunhos.chave)) {
    if (value === null) return "lapide";
    const pedido = resto(key, ESPACOS.rascunhos.chave).split("--")[0];
    return existe.pedidos.has(pedido) ? null : "rascunho-sem-pedido";
  }
  if (key.startsWith(ESPACOS.enviosDeProposta.chave)) {
    return existe.pedidos.has(resto(key, ESPACOS.enviosDeProposta.chave))
      ? null
      : "envio-sem-pedido";
  }
  if (key.startsWith(ESPACOS.ligacoesInversas.chave)) {
    return existe.propostas.has(resto(key, ESPACOS.ligacoesInversas.chave))
      ? null
      : "ligacao-sem-proposta";
  }
  if (key.startsWith(ESPACOS.ligacoes.chave)) {
    // Sem `propostaId` legível não se sabe de quem é: fica.
    const proposta = campoDeTexto(value, "propostaId");
    return proposta === null || existe.propostas.has(proposta) ? null : "ligacao-sem-proposta";
  }
  if (key.startsWith(ESPACOS.propostaWeb.chave)) {
    const { tipo, proposta } = partesDaPropostaWeb(key);
    if (proposta !== null && !existe.propostas.has(proposta)) return "proposta-web-sem-proposta";
    // Um retrato expirado nunca mais é servido (`retrato.ts` refá-lo e grava-o).
    const validoAte = tipo === "retrato" ? campoNumerico(value, "validoAte") : null;
    if (validoAte !== null && validoAte < agora) return "retrato-expirado";
  }
  return null;
}

/**
 * As linhas da proposta online que outra linha da MESMA proposta e do mesmo
 * tipo substituiu há mais de {@link SUBSTITUIDA_HA_DIAS} dias. A impressão
 * muda quando o documento muda, e a linha velha ficava para sempre.
 */
function substituidas(linhas: readonly LinhaLida[], jaSaem: ReadonlySet<string>): Set<string> {
  const grupos = new Map<string, LinhaLida[]>();
  for (const l of linhas) {
    if (!l.key.startsWith(ESPACOS.propostaWeb.chave) || jaSaem.has(l.key)) continue;
    const { tipo, proposta } = partesDaPropostaWeb(l.key);
    if (proposta === null || tipo === "retrato") continue; // o retrato tem prazo próprio
    const g = `${tipo}:${proposta}`;
    grupos.set(g, [...(grupos.get(g) ?? []), l]);
  }
  const sai = new Set<string>();
  for (const grupo of grupos.values()) {
    const datas = grupo.map((l) => Date.parse(l.versao)).filter(Number.isFinite);
    if (datas.length !== grupo.length || grupo.length < 2) continue;
    const maisNova = Math.max(...datas);
    for (const l of grupo) {
      if (Date.parse(l.versao) + SUBSTITUIDA_HA_DIAS * DIA_MS < maisNova) sai.add(l.key);
    }
  }
  return sai;
}

/**
 * O que sai esta noite, no máximo `tecto` linhas, pela {@link ORDEM_DE_SAIDA}.
 * `ficam` diz quantas ficaram para a noite seguinte por causa do tecto.
 */
export function oQueSaiDoAppState(
  linhas: readonly LinhaLida[],
  existe: QuemExiste,
  agora: number,
  tecto: number,
): { saem: Saida[]; ficam: number } {
  const candidatas: Saida[] = [];
  for (const l of linhas) {
    const motivo = motivoDaLinha(l, existe, agora);
    if (motivo) candidatas.push({ ...l, motivo });
  }
  const jaSaem = new Set(candidatas.map((c) => c.key));
  const trocadas = substituidas(linhas, jaSaem);
  for (const l of linhas) {
    if (trocadas.has(l.key)) candidatas.push({ ...l, motivo: "proposta-web-substituida" });
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
