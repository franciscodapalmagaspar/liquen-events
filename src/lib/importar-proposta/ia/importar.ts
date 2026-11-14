import { lerTextosDoZip } from "../zip-node";
import { FicheiroIlegivel } from "../zip";
import { formatoDe, porqueNaoE } from "../extrair";
import { lerDocx } from "../docx";
import { lerPptx } from "../pptx";
import { mapearConteudo, type PropostaImportada } from "../mapear";
import {
  LeituraIncompleta,
  lerDocxCompleto,
  lerPptxCompleto,
  type DocumentoCompleto,
  type ParteLida,
  type UnidadeLida,
} from "../documento-completo";
import { lerLeitura, type Leitura } from "./esquema";
import {
  custoEmDolares,
  custoMaximoEmDolares,
  LeituraFalhou,
  MAX_PARTES,
  partirEmPedacos,
  perceber,
  type ChamarModelo,
  type Uso,
} from "./perceber";
import {
  verificar,
  analisarIva,
  prepararDocumento,
  type Aviso,
  type Contas,
  type ValorDoDocumento,
  type Verificacao,
} from "./verificar";
import { preencher } from "./preencher";
import { round2 } from "../../money";
import { DEFAULT_VAT_RATE } from "../../proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A IMPORTAÇÃO INTEIRA: LER TUDO → PERCEBER → VERIFICAR → PREENCHER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três vias, por esta ordem de preferência, e o ecrã diz sempre qual foi:
 *
 *  · «json» — ela carregou, junto com o documento, o JSON que o Claude Code do
 *    plano dela (ou o claude.ai) devolveu ao pedido que este ecrã lhe deu.
 *    CUSTO ZERO para a casa.
 *  · «ia» — há chave (`ANTHROPIC_API_KEY`) e o tecto do mês não está gasto.
 *  · «regras» — o importador determinístico de sempre (`mapear.ts`). É a via
 *    por omissão: sem chave, com o tecto gasto, ou quando a IA falha, recusa ou
 *    corta a resposta. Nunca se preenche com uma resposta que falhou.
 *
 * Em todas, o documento inteiro (`documento-completo.ts`) vai para o lado
 * esquerdo da revisão.
 *
 * Não grava nada (a rota também não): a criação é um segundo passo, dela.
 */

export type Via = "json" | "ia" | "regras";

export interface Revisao {
  via: Via;
  /** Porque é que foi esta via (sem chave, tecto, a IA falhou…). Vazio na via pedida. */
  porque: string;
  documento: {
    formato: DocumentoCompleto["formato"];
    partes: ParteLida[];
    unidades: UnidadeLida[];
  };
  avisos: Aviso[];
  valores: ValorDoDocumento[];
  naoColocados: Verificacao["naoColocados"];
  contas: Contas | null;
  /** Para onde vai cada imagem (pelo caminho no ficheiro). */
  imagens: {
    id: string;
    caminho: string;
    destino: "capa" | "moodboard" | "fora" | null;
    tema: string | null;
    motivo: string | null;
  }[];
  inventados: number;
  custo: { dolares: number; uso: Uso[]; partes: number } | null;
  tecto: {
    usadas: number | null;
    maximo: number;
    dolares: number | null;
    maxDolares: number;
  } | null;
  /**
   * O documento é grande demais para seguir inteiro para o ecrã (a resposta da
   * rota não pode passar de ~4 MB): `documento.unidades` vai vazio, e diz-se.
   * O pedido para o Claude (via de custo zero) é feito NO NAVEGADOR a partir
   * de `documento` (`pedidoParaOClaude`), para não ir duas vezes o mesmo texto.
   */
  documentoGrandeDemais: boolean;
  /** Avisos da leitura do ficheiro (comentários, gráficos…). */
  avisosDaLeitura: string[];
}

export interface Importacao {
  proposta: PropostaImportada;
  revisao: Revisao | null;
}

export interface Opcoes {
  /** Um JSON carregado por ela (via de custo zero). */
  leituraCarregada?: string | null;
  /** O cliente da API, ou `null` sem chave. */
  chamar?: ChamarModelo | null;
  /** Reserva um lugar no tecto do mês; só se chama quando se vai mesmo à IA. */
  reservar?: (custoMaximo: number) => Promise<{
    ok: boolean;
    usadas: number | null;
    maximo: number;
    dolares: number | null;
    maxDolares: number;
    motivo?: string;
  }>;
  /** Troca a reserva pelo custo real, depois de a resposta chegar. */
  acertar?: (reservado: number, real: number) => Promise<unknown>;
  /** O prazo da leitura com IA (por omissão `PRAZO_MS`). */
  prazoMs?: number;
}

function lerDocumento(textos: Map<string, string>): {
  regras: PropostaImportada;
  completo: DocumentoCompleto | null;
  falhaDaLeitura: string;
} {
  const formato = formatoDe(textos);
  if (!formato) {
    throw new FicheiroIlegivel(
      "Este ficheiro não parece um documento do Word (.docx) nem do PowerPoint (.pptx).",
    );
  }
  const regras = mapearConteudo(formato === "docx" ? lerDocx(textos) : lerPptx(textos));
  try {
    const completo = formato === "docx" ? lerDocxCompleto(textos) : lerPptxCompleto(textos);
    return { regras, completo, falhaDaLeitura: "" };
  } catch (e) {
    if (e instanceof LeituraIncompleta)
      return { regras, completo: null, falhaDaLeitura: e.message };
    throw e;
  }
}

/**
 * A resposta da rota não pode passar de ~4 MB (o limite da Vercel). O texto do
 * documento vai UMA vez (em `documento.unidades`); acima disto não vai.
 */
export const MAX_CARACTERES_NO_ECRA = 1_500_000;
function tamanhoDoDocumento(c: DocumentoCompleto): number {
  let n = 0;
  for (const u of c.unidades) {
    n +=
      u.tipo === "paragrafo"
        ? u.texto.length
        : u.tipo === "linha-de-tabela"
          ? u.celulas.join("").length
          : 80;
  }
  return n;
}

function revisaoBase(c: DocumentoCompleto, via: Via, porque: string): Revisao {
  const grande = tamanhoDoDocumento(c) > MAX_CARACTERES_NO_ECRA;
  return {
    via,
    porque,
    documento: { formato: c.formato, partes: c.partes, unidades: grande ? [] : c.unidades },
    avisos: [],
    valores: [],
    naoColocados: [],
    contas: null,
    imagens: c.imagens.map((i) => ({
      id: i.id,
      caminho: i.caminho,
      destino: null,
      tema: null,
      motivo: null,
    })),
    inventados: 0,
    custo: null,
    tecto: null,
    documentoGrandeDemais: grande,
    avisosDaLeitura: grande
      ? [
          ...c.avisos,
          "O documento é grande demais para o mostrar inteiro ao lado: confirma tudo com o original aberto.",
        ]
      : c.avisos,
  };
}

function comLeitura(c: DocumentoCompleto, leitura: Leitura, via: Via, extra: string[] = []) {
  const v = verificar(c, leitura);
  const proposta = preencher(c, v);
  const r = revisaoBase(c, via, "");
  r.avisos = [
    ...extra.map(
      (texto, i): Aviso => ({
        id: `conflito:${i}`,
        texto,
        campo: "documento",
        dinheiro: /total|IVA|€/.test(texto),
        gravidade: "aviso",
      }),
    ),
    ...v.avisos,
  ];
  r.valores = v.valores;
  r.naoColocados = v.naoColocados;
  r.contas = v.contas;
  r.inventados = v.inventados;
  const destinos = new Map(v.leitura.imagens.map((i) => [i.id, i]));
  r.imagens = c.imagens.map((i) => {
    const x = destinos.get(i.id);
    return {
      id: i.id,
      caminho: i.caminho,
      destino: x?.destino ?? null,
      tema: x?.tema ?? null,
      motivo: x?.motivo ?? null,
    };
  });
  return { proposta, revisao: r };
}

function viaDasRegras(
  regras: PropostaImportada,
  c: DocumentoCompleto | null,
  porque: string,
  tecto: Revisao["tecto"] = null,
): Importacao {
  if (!c) {
    return {
      proposta: { ...regras, avisos: [porque, ...regras.avisos].filter(Boolean) },
      revisao: null,
    };
  }
  const r = revisaoBase(c, "regras", porque);
  r.tecto = tecto;
  const naProposta = new Map(regras.fotos.map((f) => [f.caminho, f]));
  r.imagens = r.imagens.map((i) => {
    const f = naProposta.get(i.caminho);
    return f ? { ...i, destino: f.destino, tema: f.seccao } : i;
  });
  // O IVA, também nesta via: sempre por escolher, com as MESMAS sugestões.
  const escritos = (regras.linhasEscritas ?? []).filter((x): x is number => x !== null);
  const soma = escritos.length ? round2(escritos.reduce((a, b) => a + b, 0)) : null;
  // A taxa escrita no documento é só uma SUGESTÃO para o campo da taxa
  // (ela confirma-a lá); as sugestões do IVA usam-na.
  const vatRate = regras.taxaSugerida ?? DEFAULT_VAT_RATE;
  const analise = analisarIva(prepararDocumento(c), vatRate, {
    soma,
    total: regras.candidatasAoTotal?.find((x) => !x.derivada)?.valor ?? null,
  });
  r.contas = {
    vatRate,
    somaDasLinhas: soma,
    linhasSemValor: 0,
    modoDasLinhas: "desconhecido",
    modoDoTotal: "desconhecido",
    ivaPorEscolher: Boolean(regras.ivaPorEscolher),
    sugestaoDasContas: analise.sugestaoDasContas,
    sugestaoDasFrases: analise.sugestaoDasFrases,
    discordancia: analise.discordancia,
    frasesDoIva: analise.frasesDoIva,
    leituraDoIva: {
      linhas: { valor: "desconhecido", citacao: null },
      total: { valor: "desconhecido", citacao: null },
    },
  };
  return { proposta: regras, revisao: r };
}

export async function importarDocumento(
  bytes: Uint8Array,
  opcoes: Opcoes = {},
): Promise<Importacao> {
  const recusa = porqueNaoE(bytes);
  if (recusa) throw new FicheiroIlegivel(recusa);
  const { regras, completo, falhaDaLeitura } = lerDocumento(lerTextosDoZip(bytes));

  if (!completo) {
    return viaDasRegras(
      regras,
      null,
      `A leitura completa do documento falhou (${falhaDaLeitura}). Usei a importação sem IA: confirma tudo com o documento aberto ao lado.`,
    );
  }

  // 1. O JSON que ela trouxe — custo zero.
  if (opcoes.leituraCarregada) {
    const lida = lerLeitura(opcoes.leituraCarregada);
    if (!lida.ok) {
      return viaDasRegras(
        regras,
        completo,
        `O ficheiro da leitura não serviu: ${lida.erro} Usei a importação sem IA.`,
      );
    }
    return comLeitura(completo, lida.leitura, "json");
  }

  // 2. A API — só com chave, só se couber, e com lugar no tecto do mês.
  if (!opcoes.chamar) {
    return viaDasRegras(regras, completo, "Importação sem IA (não há chave da API configurada).");
  }
  // As partes primeiro: o que se reserva no tecto é o pior caso DESTA importação.
  const pedacos = partirEmPedacos(completo);
  if (pedacos.length > MAX_PARTES) {
    return viaDasRegras(
      regras,
      completo,
      `Importação sem IA: o documento é grande demais para a leitura com IA (${pedacos.length} partes; o máximo é ${MAX_PARTES}). O pedido para o Claude abaixo lê-o sem custo.`,
    );
  }
  const reservado = custoMaximoEmDolares(pedacos);
  const reserva = opcoes.reservar
    ? await opcoes.reservar(reservado)
    : { ok: true, usadas: null, maximo: 0, dolares: null, maxDolares: 0 };
  const tecto = {
    usadas: reserva.usadas,
    maximo: reserva.maximo,
    dolares: reserva.dolares,
    maxDolares: reserva.maxDolares,
  };
  if (!reserva.ok) {
    return viaDasRegras(
      regras,
      completo,
      reserva.motivo === "tecto"
        ? `Importação sem IA: este mês já se fizeram ${reserva.usadas} de ${reserva.maximo} leituras com IA (o tecto). Para ler com IA na mesma e sem custo, usa o pedido para o Claude abaixo.`
        : reserva.motivo === "dolares"
          ? `Importação sem IA: esta leitura podia custar até ${reservado.toFixed(2).replace(".", ",")} US$, e este mês já se gastaram ${(reserva.dolares ?? 0).toFixed(2).replace(".", ",")} dos ${reserva.maxDolares} US$ do tecto. O pedido para o Claude abaixo lê-o sem custo.`
          : "Importação sem IA: não foi possível confirmar quanto já se gastou este mês com a IA, e sem isso o tecto não trava.",
      tecto,
    );
  }
  const acertar = async (real: number) => {
    try {
      await opcoes.acertar?.(reservado, real);
    } catch {
      /* a reserva fica: gasta-se menos, nunca mais */
    }
  };
  try {
    const p = await perceber(opcoes.chamar, pedacos, { prazoMs: opcoes.prazoMs });
    const real = custoEmDolares(p.uso);
    await acertar(real);
    const out = comLeitura(completo, p.leitura, "ia", p.conflitos);
    out.revisao.custo = { dolares: real, uso: p.uso, partes: p.partes };
    out.revisao.tecto = tecto;
    return out;
  } catch (e) {
    if (!(e instanceof LeituraFalhou)) throw e;
    const r = viaDasRegras(
      regras,
      completo,
      `${e.message} Usei a importação sem IA — nada da resposta da IA foi usado.`,
      tecto,
    );
    // Acerta-se pelo que se SABE: o uso somado das partes que responderam,
    // mais a reserva INTEIRA das que pararam sem uso conhecido (prazo, rede).
    if (e.partesSemUso.length < pedacos.length || e.uso.length) {
      const semUso = e.partesSemUso.length
        ? custoMaximoEmDolares(e.partesSemUso.map((k) => pedacos[k]))
        : 0;
      await acertar(Math.min(reservado, round2(custoEmDolares(e.uso) + semUso)));
    }
    if (r.revisao && e.uso.length)
      r.revisao.custo = { dolares: custoEmDolares(e.uso), uso: e.uso, partes: 0 };
    return r;
  }
}
