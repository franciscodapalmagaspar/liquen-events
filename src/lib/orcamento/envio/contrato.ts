/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO DA ROTA DA PROPOSTA — O QUE ELA RESPONDE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tipos, os nomes dos cabeçalhos e a codificação dos cortes — mais nada. O
 * que corre aqui é só JavaScript da plataforma (`btoa`, `TextEncoder`) e
 * `todos-os-valores.ts`; nem o zod nem o servidor entram, e
 * `contrato.browser.test.ts` prende-o — o estúdio, que corre no browser, lê-o
 * sem levar um byte a mais.
 *
 * Os CABEÇALHOS já prendem os dois lados: a rota escreve-os e o estúdio lê-os
 * pelos mesmos nomes ({@link CABECALHOS_DA_PRE_VISUALIZACAO}), e um nome mudado
 * aqui muda dos dois lados. Os CORPOS ainda não: o `ProposalStudio.tsx` lê-os
 * à mão (`data?.precisaConfirmarFotos`), e passar a tipá-los daqui é da fase
 * em que o estúdio se parte — `docs/ESTRUTURA-DO-CODIGO.md`, Parte −1, desvio 9.
 */
import type { Proposal } from "@/lib/orcamento/types";
import type { Impedimento } from "@/lib/proposal-progress";
import type { RelatorioDoPdf } from "@/lib/proposal-preview-cache";
import { ehUmDe, todosOsValores } from "@/lib/todos-os-valores";

/**
 * Os cabeçalhos da PRÉ-VISUALIZAÇÃO (o corpo é o PDF): escritos por
 * `pre-visualizacao.ts`, lidos pelo estúdio (`pedirOPdf`, no `ProposalStudio`).
 */
export const CABECALHOS_DA_PRE_VISUALIZACAO = {
  /** Quantas fotografias não entraram. */
  fotosEmFalta: "X-Fotos-Em-Falta",
  /** O que o desenho cortou — JSON em base64 (`Truncagens`). */
  conteudoCortado: "X-Conteudo-Cortado",
  /** A chave do PDF FINAL que se está a ver (o rascunho não a leva). */
  chaveDoPdf: "X-Chave-Do-Pdf",
  /** `"1"` quando o PDF saiu da memória e não foi desenhado agora. */
  pdfDaMemoria: "X-Pdf-Da-Memoria",
} as const;

/** Os cabeçalhos da resposta da pré-visualização: os do HTTP e os nossos,
 *  pelos nomes do contrato (um nome mal escrito não compila). */
export type CabecalhosDaPreVisualizacao = Record<"Content-Type" | "Content-Disposition", string> &
  Partial<
    Record<
      (typeof CABECALHOS_DA_PRE_VISUALIZACAO)[keyof typeof CABECALHOS_DA_PRE_VISUALIZACAO],
      string
    >
  >;

/** O que o desenho deixou de fora (a sétima foto de um mood board…). */
export type Truncagens = RelatorioDoPdf["truncations"];
/** Uma dessas perdas: onde, quantas, e de quê («fotos» ou «linhas»). */
export type Corte = Truncagens[number];

/**
 * Os cortes no cabeçalho {@link CABECALHOS_DA_PRE_VISUALIZACAO}.conteudoCortado:
 * JSON em base64 sobre UTF-8 — o corpo da resposta é o PDF, e um cabeçalho
 * HTTP não transporta com segurança os acentos dos nomes dos campos. Os dois
 * lados (`pre-visualizacao.ts` e o estúdio) usam este par, e só este.
 */
export function cortesEmCabecalho(cortes: Truncagens): string {
  let binario = "";
  for (const byte of new TextEncoder().encode(JSON.stringify(cortes))) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario);
}

/** As unidades de um corte, presas ao tipo do gerador. */
const UNIDADES_DO_CORTE = todosOsValores<Corte["unit"]>()(["fotos", "linhas"]);

/** Só o que tem forma de corte — o resto é ignorado em vez de rebentar o
 *  aviso (uma resposta estranha nunca pode tapar o que ficou de fora). */
export function normalizaCortes(cru: unknown): Corte[] {
  if (!Array.isArray(cru)) return [];
  return cru.filter(
    (c): c is Corte =>
      !!c &&
      typeof c === "object" &&
      typeof (c as Corte).where === "string" &&
      typeof (c as Corte).dropped === "number" &&
      (c as Corte).dropped > 0 &&
      ehUmDe(UNIDADES_DO_CORTE, (c as Corte).unit),
  );
}

/** O inverso de {@link cortesEmCabecalho}, já conferido: os cortes que o
 *  cabeçalho traz, ou nenhum quando não é base64 de JSON. */
export function cortesDoCabecalho(cabecalho: string | null): Corte[] {
  if (!cabecalho) return [];
  try {
    const bytes = Uint8Array.from(atob(cabecalho), (ch) => ch.charCodeAt(0));
    return normalizaCortes(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return [];
  }
}

/**
 * Cada etapa devolve um `Passo` (`passo.ts`): segue, ou pára o pedido já com
 * o desfecho. Este ficheiro diz a FORMA do que viaja até ao estúdio.
 *
 * Uma recusa — o pedido não pode seguir, e é uma DECISÃO: o código HTTP e o
 * corpo, tal e qual a rota os responde. Cada código com os corpos que lhe
 * pertencem: o estúdio lê o 409 como uma pergunta e o 422 como uma trava, e
 * um corpo de pergunta com um 422 não compila.
 */
export type Recusa =
  /** A frase, e mais nada: o pedido mal formado, o texto do email comprido. */
  | { status: 400; corpo: { error: string } }
  /** A proposta é grande demais para se guardar. */
  | { status: 413; corpo: { error: string } }
  | {
      status: 409;
      corpo: /** Outro pedido está a enviar esta proposta neste momento. */
        | { error: string; aEnviar: true }
        /** Faltam fotografias — uma pergunta, não uma avaria. */
        | { error: string; precisaConfirmarFotos: true; missingImages: number }
        /** O desenho cortou conteúdo — outra pergunta. */
        | { error: string; precisaConfirmarCortes: true; truncations: Truncagens };
    }
  | {
      status: 422;
      corpo: /** O que o estúdio também trava (`travas-do-envio.ts`). */
        | { error: string; faltas: Impedimento[] }
        /** O domínio do email do cliente não recebe correio. */
        | { error: string; campo: "email" };
    };

/** Uma falha — a base ou outro serviço não deixou: não é uma decisão sobre a
 *  proposta. O estúdio lê o 503 como avaria («tenta outra vez»,
 *  `porqueFalhouOEnvio`), e as recusas como respostas a dar — por isso o tipo
 *  não deixa uma passar pela outra. */
export interface Falha {
  status: 503;
  corpo: { error: string };
}

/** O que as duas respostas 200 do envio têm em comum. */
interface OQueOEnvioResponde {
  ok: true;
  id: string;
  /** O correio saiu. */
  emailed: boolean;
  /** Porque é que não saiu, quando foi avaria (e não escolha). */
  emailError?: string;
  /** Não saiu email porque ela escolheu o WhatsApp. */
  semEmailPorEscolha?: true;
  /** O estado em que a proposta FICOU. */
  estado: Proposal["status"];
  missingImages: number;
  truncations: Truncagens;
  pdfBytes: number;
}

/** O envio a sério (`resposta-do-envio.ts`). */
export interface EnvioFeito extends OQueOEnvioResponde {
  estadoError?: string;
  copiaError?: string;
  pedidoError?: string;
  /** O link do casal — só quando a proposta seguiu mesmo. */
  acceptUrl: string | null;
  pdfDaMemoria?: true;
  /** Só quando a linha não se guardou inteira — e então com o porquê. */
  docSaved?: false;
  docError?: string;
}

/** Uma repetição reconhecida (`repeticao-do-envio.ts`): não se enviou outra vez. */
export interface EnvioRepetido extends OQueOEnvioResponde {
  /** O link que o casal JÁ recebeu. */
  acceptUrl: string;
  repetido: true;
  /** A frase que o ecrã mostra em vez de fingir um envio. */
  repetidoAviso: string;
}

/**
 * O que um ENVIO responde (200): o envio a sério, ou uma repetição
 * reconhecida — distinguíveis pelo `repetido`. (A pré-visualização responde o PDF.)
 */
export type RespostaDoEnvio = EnvioFeito | EnvioRepetido;
