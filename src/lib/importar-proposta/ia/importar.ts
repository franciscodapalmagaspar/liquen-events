import { lerTextosDoZip } from "../zip-node";
import { FicheiroIlegivel } from "../zip";
import { formatoDe, porqueNaoE } from "../extrair";
import { lerDocx } from "../docx";
import { lerPptx } from "../pptx";
import { mapearConteudo, type PropostaImportada } from "../mapear";
import {
  documentoEmTexto,
  LeituraIncompleta,
  lerDocxCompleto,
  lerPptxCompleto,
  type DocumentoCompleto,
  type ParteLida,
  type UnidadeLida,
} from "../documento-completo";
import { lerLeitura, type Leitura } from "./esquema";
import { pedidoParaOClaude } from "./instrucoes";
import { custoEmDolares, LeituraFalhou, perceber, type ChamarModelo, type Uso } from "./perceber";
import {
  verificar,
  type Aviso,
  type Contas,
  type ValorDoDocumento,
  type Verificacao,
} from "./verificar";
import { preencher } from "./preencher";

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
  tecto: { usadas: number | null; maximo: number } | null;
  /** O pedido para a via de custo zero (só fora da via «ia»/«json»). */
  pedidoParaOClaude: string | null;
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
  reservar?: () => Promise<{ ok: boolean; usadas: number | null; maximo: number; motivo?: string }>;
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

function revisaoBase(c: DocumentoCompleto, via: Via, porque: string): Revisao {
  return {
    via,
    porque,
    documento: { formato: c.formato, partes: c.partes, unidades: c.unidades },
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
    pedidoParaOClaude: null,
    avisosDaLeitura: c.avisos,
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
  r.pedidoParaOClaude = pedidoParaOClaude(documentoEmTexto(c));
  const naProposta = new Map(regras.fotos.map((f) => [f.caminho, f]));
  r.imagens = r.imagens.map((i) => {
    const f = naProposta.get(i.caminho);
    return f ? { ...i, destino: f.destino, tema: f.seccao } : i;
  });
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

  // 2. A API — só com chave e com lugar no tecto do mês.
  if (!opcoes.chamar) {
    return viaDasRegras(regras, completo, "Importação sem IA (não há chave da API configurada).");
  }
  const reserva = opcoes.reservar ? await opcoes.reservar() : { ok: true, usadas: null, maximo: 0 };
  const tecto = { usadas: reserva.usadas, maximo: reserva.maximo };
  if (!reserva.ok) {
    return viaDasRegras(
      regras,
      completo,
      reserva.motivo === "tecto"
        ? `Importação sem IA: este mês já se fizeram ${reserva.usadas} de ${reserva.maximo} leituras com IA (o tecto). Para ler com IA na mesma e sem custo, usa o pedido para o Claude abaixo.`
        : "Importação sem IA: não foi possível confirmar quantas leituras com IA já se fizeram este mês, e sem isso o tecto não trava.",
      tecto,
    );
  }
  try {
    const p = await perceber(opcoes.chamar, completo);
    const out = comLeitura(completo, p.leitura, "ia", p.conflitos);
    out.revisao.custo = { dolares: custoEmDolares(p.uso), uso: p.uso, partes: p.partes };
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
    if (r.revisao && e.uso.length)
      r.revisao.custo = { dolares: custoEmDolares(e.uso), uso: e.uso, partes: 0 };
    return r;
  }
}
