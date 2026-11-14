import {
  MOOD_BOARD_MAX_IMAGES,
  resolveProposalMoney,
  type ServiceGroup,
  type VatMode,
} from "../../proposal-doc";
import { round2 } from "../../money";
import { lerTipoDeEvento, type Confianca } from "../heuristicas";
import type {
  CampoImportado,
  FotoImportada,
  MoodBoardImportado,
  PropostaImportada,
} from "../mapear";
import type { DocumentoCompleto } from "../documento-completo";
import type { Leitura, LinhaLida } from "./esquema";
import type { Verificacao } from "./verificar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PREENCHER — DA LEITURA VERIFICADA À MESMA PRÉ-VISUALIZAÇÃO DE SEMPRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sai uma {@link PropostaImportada}, a forma que o ecrã e o `montar.ts` já
 * conhecem: o resto do caminho (o pedido, as fotografias, o rascunho) é o de
 * sempre, sem uma regra de dinheiro nova.
 *
 *  · Os valores de cada linha vão SEM IVA, como o estúdio os guarda. Quando o
 *    documento os escreve com IVA, a base sai da regra da casa
 *    (`resolveProposalMoney`, modo «incluído»), não de uma conta à parte.
 *    Quando não se percebe, NÃO passam (como no importador por regras).
 *  · As linhas «opcionais» ficam marcadas como extra (`budgetOpcional`); as
 *    «incluídas» entram sem valor.
 *  · O total vai com o modo de IVA que o documento diz; sem o dizer, vai sem
 *    modo, e o ecrã obriga a escolher.
 *  · As descrições vão INTEIRAS, pela ordem; os subitens ficam na descrição do
 *    item, uma linha cada.
 *  · As condições, as notas e o texto que não coube em nenhum campo vão para as
 *    notas internas (que o PDF nunca desenha) — as condições gerais da casa
 *    continuam a ser as da casa.
 */

function letra(i: number): string {
  return `${String.fromCharCode(97 + (i % 26))})`;
}

const ROTULO_DAS_NOTAS: Record<Leitura["notas"][number]["tipo"], string> = {
  condicao: "Condição",
  pagamento: "Pagamento",
  validade: "Validade",
  nota: "Nota",
};

export function preencher(d: DocumentoCompleto, v: Verificacao): PropostaImportada {
  const l = v.leitura;
  const { vatRate, modoDasLinhas } = v.contas;
  const o = l.orcamento;

  // ── Os serviços ──
  const serviceGroups: ServiceGroup[] = l.servicos
    .filter((g) => g.itens.length || g.titulo)
    .map((g, i) => ({
      letter: letra(i),
      title: g.titulo ?? "",
      items: g.itens.map((it) => ({
        label: it.titulo ?? "",
        desc: [
          it.descricao ?? "",
          ...it.subitens.map((s) => [s.titulo, s.descricao].filter(Boolean).join(" — ")),
        ]
          .filter(Boolean)
          .join("\n"),
      })),
    }));

  // ── O orçamento ──
  const valorDaLinha = (x: LinhaLida): number | null => {
    if (x.tipo === "incluido") return null;
    const t =
      x.totalDaLinha.valor ??
      (x.precoUnitario.valor !== null
        ? round2((x.quantidade.valor ?? 1) * x.precoUnitario.valor)
        : null);
    if (t === null) return null;
    if (modoDasLinhas === "sem_iva") return round2(t);
    if (modoDasLinhas === "com_iva") {
      return resolveProposalMoney({ totalAmount: t, totalVatMode: "incluido", vatRate }).base;
    }
    return null;
  };
  const linhas = o.linhas.filter(
    (x) => x.descricao || x.totalDaLinha.valor !== null || x.precoUnitario.valor !== null,
  );
  const budgetItems = linhas.map((x) => x.descricao ?? "");
  const budgetAmounts = linhas.map(valorDaLinha);
  const budgetOpcional = linhas.map((x) => x.tipo === "opcional");
  const somaDasLinhas = round2(
    budgetAmounts.reduce<number>((s, x, i) => (x !== null && !budgetOpcional[i] ? s + x : s), 0),
  );

  const base = o.totalSemIva.valor;
  const bruto = o.totalComIva.valor;
  let totalAmount: number | null = null;
  let totalVatMode: VatMode | null = null;
  if (base !== null) {
    totalAmount = base;
    totalVatMode = bruto !== null || o.iva.valoresDoTotal === "sem_iva" ? "acrescer" : null;
  } else if (bruto !== null) {
    totalAmount = bruto;
    totalVatMode = o.iva.valoresDoTotal === "com_iva" ? "incluido" : null;
  }

  // ── As fotografias ──
  const caminhoDe = new Map(d.imagens.map((i) => [i.id, i.caminho]));
  const fotos: FotoImportada[] = [];
  let capa: string | null = null;
  const porTema = new Map<string, string[]>();
  for (const im of l.imagens) {
    const caminho = caminhoDe.get(im.id);
    if (!caminho || im.destino === "fora") continue;
    if (im.destino === "capa" && !capa) {
      capa = caminho;
      fotos.push({ caminho, seccao: "Capa", destino: "capa" });
      continue;
    }
    const tema = im.tema?.trim() || "Inspiração";
    if (!porTema.has(tema)) porTema.set(tema, []);
    porTema.get(tema)!.push(caminho);
    fotos.push({ caminho, seccao: tema, destino: "moodboard" });
  }
  const moodBoards: MoodBoardImportado[] = [];
  for (const [tema, imagens] of porTema) {
    for (let k = 0; k < imagens.length; k += MOOD_BOARD_MAX_IMAGES) {
      const n = k / MOOD_BOARD_MAX_IMAGES;
      moodBoards.push({
        title: n === 0 ? tema : `${tema} (${n + 1})`,
        images: imagens.slice(k, k + MOOD_BOARD_MAX_IMAGES),
      });
    }
  }

  // ── As notas internas: as condições do documento e o que não coube ──
  const notas: string[] = [];
  if (l.notas.length) {
    notas.push(
      "Condições e notas do documento original:",
      ...l.notas.map((n) => `· ${ROTULO_DAS_NOTAS[n.tipo]}: ${n.texto}`),
    );
  }
  if (l.cliente.telefone) notas.push(`Telefone no documento: ${l.cliente.telefone}`);
  if (v.naoColocados.length) {
    if (notas.length) notas.push("");
    notas.push(...v.naoColocados.map((x) => x.texto));
  }

  // ── O tipo de evento, pelas mesmas palavras do formulário de pedidos ──
  const tipo = l.evento.tipo.valor
    ? lerTipoDeEvento(`${l.evento.tipo.valor} ${l.evento.tipo.citacao ?? ""}`, l.evento.tipo.valor)
    : null;

  const campos = new Set(v.avisos.map((a) => a.campo));
  const conf = (presente: boolean, ...onde: string[]): Confianca =>
    !presente
      ? "nada"
      : onde.some((c) => [...campos].some((x) => x === c || x.startsWith(`${c}.`)))
        ? "baixa"
        : "alta";
  const confianca: Record<CampoImportado, Confianca> = {
    clientNames: conf(Boolean(l.cliente.nomes), "cliente.nomes"),
    email: conf(Boolean(l.cliente.email), "cliente.email"),
    eventDate: conf(Boolean(l.evento.data.valor), "evento.data"),
    location: conf(Boolean(l.evento.local), "evento.local"),
    eventType: conf(Boolean(l.evento.tipo.valor), "evento.tipo"),
    guests: conf(l.evento.convidados.valor !== null, "evento.convidados"),
    servicos: conf(serviceGroups.length > 0, "servicos"),
    total: conf(totalAmount !== null, "orcamento"),
    iva: conf(totalVatMode !== null, "orcamento.iva", "orcamento.total"),
    fotos: fotos.length ? "alta" : "nada",
  };

  const guests = l.evento.convidados.valor;
  return {
    formato: d.formato,
    clientNames: l.cliente.nomes ?? "",
    email: l.cliente.email ?? "",
    dataIso: l.evento.data.valor ?? "",
    location: l.evento.local ?? "",
    eventType: l.evento.tipo.valor ?? "",
    categoria: tipo?.valor.categoria ?? "",
    tipoDoPedido: tipo?.valor.tipo ?? "",
    guests: guests !== null && guests > 0 ? Math.round(guests) : null,
    serviceGroups,
    budgetItems,
    budgetAmounts,
    ...(budgetOpcional.some(Boolean) ? { budgetOpcional } : {}),
    ...(Math.abs(vatRate - 0.23) > 1e-9 ? { vatRate } : {}),
    totalAmount,
    totalVatMode,
    somaDasLinhas,
    moodBoards,
    capa,
    fotos,
    notasInternas: notas.join("\n").trim(),
    confianca,
    // Os avisos da leitura com IA vão no painel da revisão (`revisao.avisos`),
    // com o campo e a marca de dinheiro; aqui ficariam repetidos.
    avisos: [],
  };
}
