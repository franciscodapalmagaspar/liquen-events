// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { describe } from "../../../../../../test/em-partes";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProposalStudio, {
  avisoDeConteudoIncompleto,
  contagemDePrecos,
  cortesDoCabecalho,
  modoDoAdicional,
  porqueFalhouOEnvio,
  textoDoAdicional,
  textoDoTotal,
} from "./ProposalStudio";
import { totaisDaProposta } from "@/lib/proposal-budget";
// A MESMA geometria que o gerador usa. As caixas esperadas não se escrevem à
// mão: sai daqui o que a página desenha, e é com isso que a grelha do estúdio
// tem de concordar.
import {
  ASPETO_POR_OMISSAO,
  alturaDaLegenda,
  aspetoDaCaixa,
  caixasDoMoodboard,
  linhasDaLegendaAprox,
} from "@/lib/proposal-geometria";
import { parseMoneyText } from "@/lib/proposal-doc";
import { eur } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";

/** O runtime de importação do seletor, reduzido aos três momentos que o estúdio
 *  tem de saber tratar: o lugar é RESERVADO no instante do clique, a cópia
 *  CONFIRMA (e traz o caminho definitivo), ou FALHA. É por aqui que uma foto
 *  entra num mood board sem passar por um ficheiro real (o carregamento
 *  verdadeiro precisa de canvas/worker, que o jsdom não tem). */
const seletor = vi.hoisted(() => ({ marcadores: [] as string[], n: 0 }));

interface FotoImportada {
  path: string;
  url: string;
  thumbUrl?: string;
  sourcePath?: string;
  marcador?: string;
}

vi.mock("./ThemePicker", () => ({
  default: ({
    onPicked,
    onReserve,
    onDropped,
  }: {
    onPicked: (imgs: FotoImportada[]) => void;
    onReserve?: (r: { marcador: string; thumbUrl?: string; sourcePath: string }[]) => void;
    onDropped?: (marcadores: string[]) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() => {
          const n = ++seletor.n;
          const marcador = `pending:tok-${n}`;
          seletor.marcadores.push(marcador);
          onReserve?.([
            { marcador, thumbUrl: `tema-thumb-${n}`, sourcePath: `t1/origem-${n}.jpg` },
          ]);
        }}
      >
        reservar-foto-de-teste
      </button>
      <button
        type="button"
        onClick={() => {
          // Confirma a ÚLTIMA reservada — é o que deixa verificar que a troca é
          // no lugar dela, e não no fim da lista.
          const marcador = seletor.marcadores.pop();
          const n = marcador?.replace("pending:tok-", "") ?? "0";
          onPicked([
            {
              path: `LQ-001/copia-${n}.jpg`,
              url: `u-${n}`,
              thumbUrl: `copia-thumb-${n}`,
              sourcePath: `t1/origem-${n}.jpg`,
              marcador,
            },
          ]);
        }}
      >
        confirmar-foto-de-teste
      </button>
      <button
        type="button"
        onClick={() => {
          const marcador = seletor.marcadores.pop();
          if (marcador) onDropped?.([marcador]);
        }}
      >
        falhar-foto-de-teste
      </button>
      <button type="button" onClick={() => onPicked([{ path: "board/nova.jpg", url: "u" }])}>
        escolher-foto-de-teste
      </button>
    </>
  ),
}));

/**
 * NADA SE PODE PERDER EM SILÊNCIO ENTRE O ESTÚDIO E O PDF.
 *
 * A página de mood board do documento desenha 6 fotos. A sétima era carregada,
 * ficava guardada, aparecia na miniatura — e não era impressa. Ninguém avisava:
 * nem ao pôr a foto, nem ao gerar o PDF, nem ao enviar. A proposta seguia para
 * um noivo com menos fotos do que a Catarina escolheu, e a primeira pessoa a
 * dar por isso era ele.
 *
 * Estes testes prendem os dois momentos em que ela tem de saber:
 *  1. AO MONTAR — a foto que não vai ser impressa fica marcada nesse instante;
 *  2. ANTES DE SEGUIR — o aviso do PDF diz o que ficou de fora, tanto o que não
 *     chegou (fotos em falta) como o que não coube (conteúdo cortado).
 */

const quote = {
  id: "q1",
  name: "Maria & Zé",
  email: "maria@example.pt",
  category: "casamentos",
  eventType: "casamentos",
  status: "novo",
  createdAt: "2026-01-01T00:00:00.000Z",
} as unknown as Quote;

const DRAFT_KEY = `liquen-proposal-studio-${quote.id}`;

/** Um rascunho já com um mood board de `n` fotos, como se ela tivesse acabado
 *  de as carregar (o estúdio restaura o rascunho local ao abrir).
 *
 *  `extra` acrescenta campos ao mood board — é como se semeia um rascunho que já
 *  traz uma disposição escolhida à mão (`{ layout: "mosaico" }`), que é o caso
 *  que distingue «apagar a escolha» de «nunca ter havido escolha». */
/**
 * A mesma proposta, com o inglês feito.
 *
 * Uma proposta em EN só sai traduzida (ver `oQueFaltaParaEnviar`) — e é bem
 * que seja: metade em inglês e metade em português é um documento que o casal
 * não percebe. Os testes que escolhem «Inglês» e esperam que o envio siga
 * precisam, portanto, de uma proposta que na vida real pudesse sair.
 *
 * Vive à parte do `seedDraft` de propósito: pôr as traduções na semente comum
 * liga o modo bilingue por omissão, e há quatro testes que medem justamente o
 * ecrã SEM ele.
 */
function seedDraftEmIngles(n: number, extra: Record<string, unknown> = {}) {
  seedDraft(n, extra);
  const doc = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>;
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      ...doc,
      serviceGroups: [
        {
          letter: "a)",
          title: "Decoração",
          titleEn: "Decoration",
          items: [{ label: "Cerimónia", labelEn: "Ceremony" }],
        },
      ],
      moodBoards: [
        {
          title: "Cerimónia",
          titleEn: "Ceremony",
          annotation: "",
          images: Array.from({ length: n }, (_, i) => `board/foto-${i}.jpg`),
          ...extra,
        },
      ],
      // O rótulo do total também é prosa que o casal lê. Sem inglês, uma
      // proposta em EN imprimia «Valor Total Decoração» no meio do documento —
      // e é por isso que o envio a trava.
      totalLabel: "Valor Total Decoração",
      totalLabelEn: "Total Decoration Value",
    }),
  );
}

function seedDraft(n: number, extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      template: "decoracao",
      ref: "PO Decoração",
      clientNames: "Maria & Zé",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2026",
      location: "Évora",
      guests: "80 pax",
      serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
      moodBoards: [
        {
          title: "Cerimónia",
          annotation: "",
          images: Array.from({ length: n }, (_, i) => `board/foto-${i}.jpg`),
          ...extra,
        },
      ],
      budgetItems: [],
      coverImages: ["", ""],
      totalAmount: 3000,
      totalVatMode: "acrescer",
    }),
  );
}

/** Resposta mínima que o estúdio sabe ler. */
function reply(body: {
  ok?: boolean;
  /** O código, quando não basta «correu bem / não correu» — um 503 do rascunho
   *  não é a mesma coisa que um 500, e o estúdio trata-os de maneira diferente. */
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
}): Response {
  // A chave do PDF final visto (ver «ver o PDF antes de enviar»): toda a
  // pré-visualização deste teste a devolve, como a rota a devolve no PDF final.
  const headers: Record<string, string> = {
    "X-Chave-Do-Pdf": "chave-de-teste",
    ...(body.headers ?? {}),
  };
  return {
    ok: body.ok ?? true,
    status: body.status ?? (body.ok === false ? 500 : 200),
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body.json ?? {},
    blob: async () => new Blob(["%PDF-"], { type: "application/pdf" }),
  } as unknown as Response;
}

/** O que a rota `proposta-doc` devolve neste teste (pré-visualização e envio). */
let propostaDoc: Response = reply({ headers: {}, json: { ok: true, emailed: true } });
/**
 * O RASCUNHO DO EMAIL que o servidor prepara para o passo 3.
 *
 * `null` = a rota falha (409, rede em baixo): o painel do email mostra a frase
 * e o envio segue sem corpo, exactamente como antes deste ecrã existir.
 */
let rascunhoDoEmail: Record<string, unknown> | null = {
  rascunho: {
    chave: "registo-formal",
    nome: "Registo formal",
    assunto: "A vossa proposta — Líquen Events",
    texto: "Olá Maria & Zé,\n\nSegue a proposta: {{link_proposta}}",
    origem: "guardado",
    avisos: [],
  },
  porPreencher: [],
  porOmissao: "registo-formal",
  remetente: "Catarina Gaspar",
  destinatario: { nome: "Maria & Zé", email: "cliente@exemplo.pt" },
  modelos: [{ chave: "registo-formal", nome: "Registo formal", temEsteIdioma: true }],
};
/** O rascunho que o SERVIDOR tem guardado (null = não tem nenhum). */
let rascunhoServidor: { doc: unknown; updatedAt: string } | null = null;
/** O que está na GAVETA DO RESGATE (`?variante=sobreposto`). É de propósito
 *  uma variável à parte de `rascunhoServidor`: o defeito que isto prende era
 *  precisamente as duas serem lidas como se fossem a mesma. */
let rascunhoSobreposto: { doc: unknown; updatedAt: string } | null = null;
/**
 * Um portão para segurar a LEITURA do rascunho.
 *
 * O merge do rascunho chega 100–300 ms depois de o ecrã abrir, e é nessa
 * janela que ela começa a escrever. Sem uma forma de segurar a resposta, o
 * duplo devolve-a antes de o teste conseguir carregar uma tecla — e o defeito
 * que se quer prender fica por fora do alcance do teste.
 */
let portaoDoRascunho: Promise<void> | null = null;
let abrirPortaoDoRascunho: (() => void) | null = null;
/**
 * O que o servidor responde ao PUT do rascunho.
 *
 * Por omissão GUARDA — que é o caso normal, e era o que este duplo não fazia:
 * respondia sempre `ok: false`, ou seja, todos estes testes corriam com o
 * servidor a recusar a gravação sem nada nem ninguém dar por isso. Era
 * exactamente o problema real, reproduzido aqui dentro sem intenção.
 * A recusa passa a ter de ser PEDIDA, e há testes que a pedem.
 */
let gravacaoDoRascunho: () => Response = () =>
  reply({ json: { ok: true, guardado: true, updatedAt: new Date().toISOString() } });
/** A LEITURA do rascunho falha (rede em baixo). Diferente de «não há rascunho». */
let leituraDoRascunhoFalha = false;
/** As versões já enviadas, e o documento de cada uma (`?doc=<id>`). */
let versoesServidor: unknown[] = [];
let docsDeVersao: Record<string, unknown> = {};
/** As propostas anteriores e os modelos, para o «Criar a partir de…». */
let propostasServidor: unknown[] = [];
let modelosServidor: unknown[] = [];
/** O que /api/propostas/copiar devolve — a cópia inteira ou o mapa das fotos. */
let copiaServidor: unknown = {};
/** O servidor tem serviço de tradução configurado? Por omissão NÃO — é o
 *  estado em que a maior parte destes testes corre, e o lado seguro. */
let traducaoLigadaNoServidor = false;
/** O que a rota da tradução responde ao POST. */
let traducaoResponde: (textos: string[]) => Response = (textos) =>
  reply({ json: { textos: textos.map((t) => `EN: ${t}`) } });
/** As fotos que o servidor conhece para este pedido (`GET /assets`). */
let assetsServidor: {
  path: string;
  url: string;
  thumbUrl?: string;
  /** A derivada de 1200 px — o degrau do meio da cascata. */
  midUrl?: string;
  cor?: string;
}[] = [];
/**
 * O `/assets` FALHA (Storage em baixo, sessão caducada, rede a cair).
 *
 * É o caso que deixava a grelha inteira com caixas cinzentas a dizer «Imagem»,
 * para sempre e sem uma palavra — ver o bloco «porque é que ela não vê as
 * fotografias».
 */
let assetsFalham = false;
/** Segura a resposta do `/assets`, para se poder olhar para o ecrã ENQUANTO a
 *  lista vem a caminho. É nesse intervalo que ela tirou as capturas. */
let travaDosAssets: Promise<void> | null = null;
function segurarOsAssets(): () => void {
  let abrir = () => {};
  travaDosAssets = new Promise<void>((r) => (abrir = r));
  return () => {
    abrir();
    travaDosAssets = null;
  };
}
/** Tudo o que saiu daqui — é onde se lê o que foi GRAVADO e o que foi ENVIADO. */
let pedidos: { url: string; init?: RequestInit }[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const metodo = init?.method ?? "GET";
  pedidos.push({ url, init });
  if (url.includes("proposta-doc")) return propostaDoc;
  // Antes do `proposta-rascunho`: os dois têm «rascunho» no nome.
  if (url.includes("email-rascunho")) {
    return rascunhoDoEmail
      ? reply({ json: rascunhoDoEmail })
      : reply({
          ok: false,
          status: 409,
          json: { error: "Não há nenhum modelo «registo-formal»." },
        });
  }
  if (url.includes("proposta-rascunho")) {
    // A leitura RESPONDE, mesmo quando não há rascunho nenhum — «não há» é uma
    // resposta e é diferente de «não se conseguiu perguntar». É essa diferença
    // que decide se o estúdio pode reenviar o que tem preso no navegador.
    if (metodo === "GET") {
      if (portaoDoRascunho) await portaoDoRascunho;
      if (leituraDoRascunhoFalha) return reply({ ok: false });
      // A gaveta do resgate é OUTRA gaveta. Devolver aqui o rascunho do
      // estúdio é exactamente o que o servidor fazia antes de a porta existir,
      // e um duplo que não distinga as duas não testa porta nenhuma.
      const querResgate = /[?&]variante=/.test(url);
      return reply({
        json: { ok: true, draft: querResgate ? rascunhoSobreposto : rascunhoServidor },
      });
    }
    if (metodo === "PUT") return gravacaoDoRascunho();
    return reply({ ok: false });
  }
  if (url.includes("/versoes")) {
    const qual = /[?&]doc=([^&]+)/.exec(url);
    if (qual) return reply({ json: { doc: docsDeVersao[qual[1]] ?? null } });
    return reply({ json: { versoes: versoesServidor } });
  }
  // Antes do `/propostas` genérico: senão a cópia caía na lista de resumos.
  if (url.includes("/propostas/copiar")) return reply({ json: copiaServidor });
  // A tradução automática: o GET diz se o SERVIDOR tem serviço configurado (a
  // chave nunca chega ao browser), o POST devolve os textos traduzidos.
  if (url.includes("/propostas/traduzir")) {
    if (metodo === "GET") return reply({ json: { ligada: traducaoLigadaNoServidor } });
    const enviados = (JSON.parse(String(init?.body ?? "{}")).textos ?? []) as string[];
    return traducaoResponde(enviados);
  }
  if (url.includes("/propostas/modelos")) return reply({ json: { modelos: modelosServidor } });
  if (url.includes("/api/propostas?")) return reply({ json: propostasServidor });
  // As fotos que o SERVIDOR conhece para este pedido, com as assinaturas
  // frescas. É por aqui que a grelha volta a ter miniaturas num navegador que
  // nunca viu esta proposta — ver «o mesmo pedido, no outro endereço».
  if (url.includes("/assets")) {
    if (travaDosAssets) await travaDosAssets;
    if (assetsFalham) return reply({ ok: false, status: 500 });
    return reply({ json: { images: assetsServidor } });
  }
  return reply({ json: { images: [] } });
});

/** Os corpos enviados a uma rota, pela ordem. */
/**
 * «VER O PDF PRIMEIRO» (14/10): antes de enviar, descarrega-se o PDF final e
 * marca-se «Vi a proposta e está tudo certo». Os testes do envio passam por
 * aqui como uma pessoa passaria — e a descarga sai da contagem dos pedidos,
 * para eles continuarem a contar só o que medem (o envio).
 */
async function verEConfirmar() {
  fireEvent.click(await screen.findByRole("button", { name: "Descarregar o PDF final" }));
  const caixa = await screen.findByRole("checkbox", { name: "Vi a proposta e está tudo certo" });
  fireEvent.click(caixa);
  await waitFor(() => expect(caixa).toBeChecked());
  const eDescarga = (url: unknown, init?: RequestInit) =>
    String(url).includes("proposta-doc") && String(init?.body ?? "").includes('"mode":"preview"');
  pedidos = pedidos.filter((p) => !eDescarga(p.url, p.init));
  const chamadas = fetchMock.mock.calls.filter(([u, i]) => !eDescarga(u, i as RequestInit));
  fetchMock.mock.calls.splice(0, fetchMock.mock.calls.length, ...chamadas);
}

/**
 * A barra larga do «Rever e enviar» numa linha (14/10, «melhora isto
 * drasticamente»): o que a caixa vermelha e a frase do inglês diziam abre-se da
 * pastilha do estado, num painel por cima dela.
 */
async function abrirPastilhaDoEnvio(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole("button", { name: /^Antes de enviar:/ }));
  return await screen.findByRole("dialog", { name: "Antes de enviar" });
}

function corpos(parte: string, metodo = "PUT"): string[] {
  return pedidos
    .filter((p) => p.url.includes(parte) && (p.init?.method ?? "GET") === metodo)
    .map((p) => String(p.init?.body ?? ""));
}

/**
 * Carregar no «Confirmar» do envio como uma pessoa: depois de a pergunta estar
 * à vista. O botão ignora cliques nos primeiros 400 ms — é o que impede o
 * segundo clique de um duplo clique de enviar a proposta (achado n.º 3).
 */
async function confirmarEnvio(user: { click: (el: Element) => Promise<void> }) {
  const botao = await screen.findByRole("button", { name: /^Confirmar$/ });
  await new Promise((r) => setTimeout(r, 450));
  await user.click(botao);
  // Por email, o envio espera 10 s para se poder cancelar (`useEnvioAdiado`).
  // Os testes que medem o envio não esperam: carregam em «Enviar já». No
  // WhatsApp não há espera, e o botão não aparece.
  const ja = screen.queryByRole("button", { name: /^Enviar já$/ });
  if (ja) await user.click(ja);
}

beforeEach(() => {
  localStorage.clear();
  seletor.marcadores.length = 0;
  seletor.n = 0;
  pedidos = [];
  propostaDoc = reply({ headers: {}, json: { ok: true, emailed: true } });
  rascunhoServidor = null;
  rascunhoSobreposto = null;
  portaoDoRascunho = null;
  abrirPortaoDoRascunho = null;
  gravacaoDoRascunho = () =>
    reply({ json: { ok: true, guardado: true, updatedAt: new Date().toISOString() } });
  leituraDoRascunhoFalha = false;
  rascunhoDoEmail = {
    rascunho: {
      chave: "registo-formal",
      nome: "Registo formal",
      assunto: "A vossa proposta — Líquen Events",
      texto: "Olá Maria & Zé,\n\nSegue a proposta: {{link_proposta}}",
      origem: "guardado",
      avisos: [],
    },
    porPreencher: [],
    porOmissao: "registo-formal",
    remetente: "Catarina Gaspar",
    destinatario: { nome: "Maria & Zé", email: "cliente@exemplo.pt" },
    modelos: [{ chave: "registo-formal", nome: "Registo formal", temEsteIdioma: true }],
  };
  versoesServidor = [];
  docsDeVersao = {};
  propostasServidor = [];
  modelosServidor = [];
  copiaServidor = {};
  assetsServidor = [];
  assetsFalham = false;
  travaDosAssets = null;
  traducaoLigadaNoServidor = false;
  traducaoResponde = (textos) => reply({ json: { textos: textos.map((t) => `EN: ${t}`) } });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  // O descarregamento do PDF passa por um blob: URL, que o jsdom não tem.
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL() {} }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Os cinco passos do estúdio (A2). Os passos 1 a 4 vivem num formulário só,
 * sempre montado, e cada secção esconde-se fora do seu passo — um teste que
 * mexe no orçamento ou nos mood boards vai primeiro ao passo deles, como ela.
 */
type NomeDoPasso =
  | "Evento"
  | "Serviços"
  | "Inspiração"
  | "Cronograma"
  | "Orçamento"
  | "Rever e enviar";
const NUMERO_DO_PASSO: Record<NomeDoPasso, number> = {
  Evento: 1,
  Serviços: 2,
  Inspiração: 3,
  Cronograma: 3,
  Orçamento: 4,
  "Rever e enviar": 5,
};
function irAoPasso(nome: NomeDoPasso) {
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`^${NUMERO_DO_PASSO[nome]}\\s*${nome}`) }),
  );
}

const renderStudio = (passo?: NomeDoPasso) => {
  const r = render(
    <ToastProvider>
      <ProposalStudio quote={quote} />
    </ToastProvider>,
  );
  if (passo) irAoPasso(passo);
  return r;
};

/**
 * O CASO DA CATARINA MARTINS.
 *
 * A proposta saiu com cinco pontos de decoração; a resposta dela foi «pode me
 * atualizar o orçamento apenas para» três, e o trabalho teve de ser refeito.
 * Agora o casal escolhe no pedido — e o estúdio abre já com esses pontos.
 *
 * O teste que interessa não é o feliz: é o de baixo, que garante que quem NÃO
 * escolheu nada continua a ver o estúdio de sempre, em vez de uma proposta
 * inventada por mim.
 */
/**
 * O ORÇAMENTO QUE SE SOMA SOZINHO.
 *
 * Palavras dela: «altero um item e esqueço-me de atualizar o total». O aviso
 * existe para esse esquecimento ter voz.
 */
/**
 * LIMPAR O RASCUNHO — a única acção destrutiva da página.
 *
 * Tinha uma caixa de confirmação. A caixa pergunta ANTES, quando ela ainda
 * não viu o que ia perder, e a resposta certa é quase sempre "sim" — por isso
 * carrega-se sem ler. A anulação pergunta DEPOIS, com o estrago à vista.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TRABALHO ESMAGADO TEM DE TER PORTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O cenário, que já aconteceu: a Ana abre o estúdio de manhã e deixa o
 * separador aberto. A Catarina abre a MESMA proposta à tarde noutro
 * computador, compõe dois mood boards e escreve os textos. A Ana volta ao
 * portátil e escreve um carácter. Oitocentos milissegundos depois, o documento
 * das nove da manhã é gravado por cima do das quatro da tarde.
 *
 * O servidor sempre fez a parte difícil: guarda a versão que ia desaparecer
 * numa gaveta irmã e devolve o nome dela em `resgate`. A regra da casa — «se
 * falhar, não perder trabalho» — estava cumprida onde importa.
 *
 * O que faltava era tudo o resto. O estúdio lia `overwrote` e `previousBy`,
 * ignorava o `resgate`, e dizia «Ficou a tua versão.» — a frase que faz quem a
 * lê concluir, com toda a razão, que as duas horas da outra pessoa acabaram.
 * E mesmo que soubesse, não havia como lá chegar: a lista de gavetas que a
 * leitura aceitava não tinha esta lá dentro.
 *
 * Estes testes prendem as duas metades: que a barra aparece e diz de quem e de
 * quando, e que o botão vai à GAVETA CERTA e traz o documento de volta.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * A NOTA QUE PERTENCE A UMA SECÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo `notasPorSeccao` existia há muito, e bem tratado em três sítios: o
 * tipo no documento, o guarda do gerador do PDF («as notas por secção nunca são
 * desenhadas», com teste próprio em `notas-internas-ficam-em-casa.test.ts`) e a
 * limpeza ao copiar para outro pedido.
 *
 * Três sítios a cuidar de uma coisa que NINGUÉM ESCREVIA: não havia caixa
 * nenhuma no estúdio. Era uma funcionalidade inteira, acabada e protegida, sem
 * porta de entrada.
 *
 * O `notasInternas` que já existia é sobre o negócio inteiro («recusaram em
 * 2025 por preço») e vive na primeira secção. Estas são outra escala — «as
 * capas são as duas do mesmo ângulo», «esta linha é a que dá a margem toda» —
 * e o ponto é estarem onde a dúvida nasce.
 */
describe("notas presas a cada secção", () => {
  const seccoes = [
    "Nota sobre a capa",
    "Nota sobre os serviços",
    "Nota sobre os mood boards",
    "Nota sobre o orçamento",
    "Nota sobre o total",
  ];

  it("cada secção do trabalho tem a sua caixa", async () => {
    renderStudio();
    for (const titulo of seccoes) {
      expect(
        await screen.findByLabelText(new RegExp(titulo, "i")),
        `falta a caixa de «${titulo}»`,
      ).toBeTruthy();
    }
  });

  it("a secção do Evento NÃO ganha uma segunda caixa", async () => {
    /**
     * Ali já vive a nota do negócio inteiro. Duas caixas amarelas na mesma
     * secção, uma por baixo da outra, seriam duas gavetas para a mesma coisa —
     * e quem escrevesse na de baixo perdia a nota que a proposta seguinte
     * herda.
     */
    renderStudio();
    await screen.findByLabelText(/Notas internas/i);
    expect(screen.queryByLabelText(/Nota sobre o evento/i)).toBeNull();
  });

  it("o que se escreve fica guardado na chave daquela secção", async () => {
    renderStudio();
    const user = userEvent.setup();
    const caixa = await screen.findByLabelText(/Nota sobre o orçamento/i);
    await user.type(caixa, "A margem toda está na linha das flores.");
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 4000,
    });
    const gravado = corpos("proposta-rascunho").at(-1) ?? "";
    expect(gravado).toContain("notasPorSeccao");
    expect(gravado).toContain("A margem toda está na linha das flores.");
    // E na chave certa — uma nota do orçamento guardada como sendo das capas
    // aparecia na secção errada seis meses depois.
    expect(JSON.parse(gravado).doc.notasPorSeccao.orcamento).toContain("margem toda");
  });

  it("apagar a nota TIRA a chave, em vez de deixar um vazio", async () => {
    /**
     * Seis caixas que gravassem `""` punham seis chaves sem conteúdo em todos
     * os documentos — e faziam a comparação de versões e o resgate acusarem
     * diferenças que não existem. Um documento sem notas tem de ficar
     * exactamente como era antes de isto existir.
     */
    renderStudio();
    const user = userEvent.setup();
    const caixa = await screen.findByLabelText(/Nota sobre a capa/i);
    await user.type(caixa, "trocar a segunda");
    await waitFor(
      () => expect(corpos("proposta-rascunho").at(-1) ?? "").toContain("trocar a segunda"),
      {
        timeout: 4000,
      },
    );
    pedidos = [];
    await user.clear(caixa);
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 4000,
    });
    const depois = JSON.parse(corpos("proposta-rascunho").at(-1)!).doc;
    expect(depois.notasPorSeccao, "ficou uma gaveta vazia no documento").toBeUndefined();
  });

  it("uma nota só com espaços não entra no documento", async () => {
    /**
     * Escrever espaços não provoca gravação nenhuma — e isso é a resposta
     * certa, não uma falha: o documento não mudou, portanto não há o que
     * gravar. A regra que interessa é a outra, e é esta: espaços em branco
     * nunca podem chegar ao documento como se fossem uma nota.
     */
    renderStudio();
    const user = userEvent.setup();
    const caixa = await screen.findByLabelText(/Nota sobre o total/i);
    await user.type(caixa, "   ");
    // Tempo de sobra para uma gravação automática, se ela chegasse a existir.
    await new Promise((r) => setTimeout(r, 1500));
    expect(
      corpos("proposta-rascunho").some((c) => c.includes("notasPorSeccao")),
      "espaços em branco entraram no documento como se fossem uma nota",
    ).toBe(false);
  });
});

describe("o trabalho que uma gravação esmagou", () => {
  /** Uma gravação que sobrepôs alguém, tal como o servidor a responde. */
  function gravacaoQueSobrepos(opcoes: { resgate?: string; quem?: string } = {}) {
    const { resgate = "q1--sobreposto", quem = "Catarina" } = opcoes;
    gravacaoDoRascunho = () =>
      reply({
        json: {
          ok: true,
          guardado: true,
          updatedAt: new Date().toISOString(),
          overwrote: true,
          previousBy: quem,
          ...(resgate ? { resgate, resgateEm: "2026-07-28T15:30:00.000Z" } : {}),
        },
      });
  }

  /** Um rascunho com conteúdo, para haver onde escrever. */
  function semear() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [{ label: "Igreja" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
      }),
    );
  }

  /** Escreve alguma coisa, para a gravação automática disparar. */
  async function mexerNoDocumento(user: ReturnType<typeof userEvent.setup>) {
    const campo = await screen.findByDisplayValue("Decoração Floral");
    await user.type(campo, "!");
  }

  it("a barra aparece, e diz de quem era e de quando", async () => {
    gravacaoQueSobrepos();
    semear();
    renderStudio();
    const user = userEvent.setup();
    await mexerNoDocumento(user);

    const barra = await screen.findByText(
      /A versão de Catarina ficou guardada/i,
      {},
      {
        timeout: 4000,
      },
    );
    expect(barra).toBeTruthy();
    // A hora importa: é o que dá a noção do que está em jogo antes de decidir.
    expect(document.body.textContent).toMatch(/às \d/);
  });

  it("o aviso deixa de dizer que ficou só a tua versão, e ponto", async () => {
    /**
     * A frase antiga era verdadeira e mesmo assim a pior possível: fechava a
     * porta. Quem a lia não tinha razão nenhuma para procurar mais.
     */
    gravacaoQueSobrepos();
    semear();
    renderStudio();
    const user = userEvent.setup();
    await mexerNoDocumento(user);
    await screen.findByText(/A versão de Catarina ficou guardada/i, {}, { timeout: 4000 });
    expect(document.body.textContent).toMatch(/a outra está guardada/i);
  });

  it("REPOR vai à GAVETA DO RESGATE, e não ao rascunho do estúdio", async () => {
    /**
     * É esta a regra que prende a porta. Antes, um pedido com `?variante=`
     * caía no rascunho do estúdio — ou seja, «repor» devolvia exactamente o
     * documento que estava no ecrã, e o trabalho da outra pessoa continuava
     * inalcançável.
     */
    rascunhoServidor = {
      doc: { ref: "o que está no ecrã" },
      updatedAt: "2026-07-28T16:00:00.000Z",
    };
    rascunhoSobreposto = {
      doc: {
        template: "decoracao",
        ref: "AS DUAS HORAS DA CATARINA",
        serviceGroups: [{ letter: "a)", title: "Cerimónia ao pôr do sol", items: [] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
      },
      updatedAt: "2026-07-28T15:30:00.000Z",
    };
    gravacaoQueSobrepos();
    semear();
    renderStudio();
    const user = userEvent.setup();
    await mexerNoDocumento(user);

    await screen.findByText(/A versão de Catarina ficou guardada/i, {}, { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: /Repor essa versão/i }));

    // Foi à gaveta certa.
    await waitFor(() =>
      expect(
        pedidos.some((p) => p.url.includes("proposta-rascunho") && p.url.includes("variante=")),
        "o «repor» não pediu a variante: foi buscar o rascunho do estúdio",
      ).toBe(true),
    );
    // E o documento voltou mesmo.
    expect(await screen.findByDisplayValue("Cerimónia ao pôr do sol")).toBeTruthy();
  });

  it("repor pode ser anulado — é um gesto que substitui o documento", async () => {
    rascunhoSobreposto = {
      doc: {
        template: "decoracao",
        ref: "a versão da Catarina",
        serviceGroups: [{ letter: "a)", title: "Cerimónia ao pôr do sol", items: [] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
      },
      updatedAt: "2026-07-28T15:30:00.000Z",
    };
    gravacaoQueSobrepos();
    semear();
    renderStudio();
    const user = userEvent.setup();
    await mexerNoDocumento(user);
    await screen.findByText(/A versão de Catarina ficou guardada/i, {}, { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: /Repor essa versão/i }));
    await screen.findByDisplayValue("Cerimónia ao pôr do sol");
    // A mesma rede dos outros gestos que deitam fora o que estava no ecrã.
    expect(await screen.findByText(/Pode anular durante/i)).toBeTruthy();
  });

  it("dispensar tira o lembrete e não vai ao servidor — nada se apaga", async () => {
    gravacaoQueSobrepos();
    semear();
    renderStudio();
    const user = userEvent.setup();
    await mexerNoDocumento(user);
    await screen.findByText(/A versão de Catarina ficou guardada/i, {}, { timeout: 4000 });

    pedidos = [];
    await user.click(screen.getByRole("button", { name: /Dispensar o aviso/i }));
    expect(screen.queryByText(/ficou guardada/i)).toBeNull();
    expect(
      pedidos.some((p) => p.init?.method === "DELETE"),
      "dispensar o lembrete apagou alguma coisa no servidor",
    ).toBe(false);
  });

  it("sem gaveta, não promete o que não pode cumprir", async () => {
    /**
     * O servidor pode não conseguir guardar a cópia (e regista-o). Nesse caso
     * a frase antiga é a honesta, e não pode aparecer barra nenhuma a oferecer
     * um resgate que não existe.
     */
    gravacaoQueSobrepos({ resgate: undefined });
    semear();
    renderStudio();
    const user = userEvent.setup();
    await mexerNoDocumento(user);
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 4000,
    });
    expect(screen.queryByRole("button", { name: /Repor essa versão/i })).toBeNull();
  });
});

describe("limpar o rascunho pode ser anulado", () => {
  function seedComConteudo() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [{ label: "Igreja" }] }],
        moodBoards: [],
        budgetItems: ["Decor Cerimónia"],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
  }

  it("não pergunta antes — limpa e oferece anular", async () => {
    seedComConteudo();
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Limpar rascunho/ }));
    expect(await screen.findByText(/Pode anular durante/i)).toBeTruthy();
    // E limpou mesmo: o grupo que lá estava desapareceu.
    expect(screen.queryByDisplayValue("Decoração Floral")).toBeNull();
  });

  it("anular devolve o que lá estava", async () => {
    seedComConteudo();
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Limpar rascunho/ }));
    await user.click(await screen.findByRole("button", { name: /^Anular$/ }));
    expect(await screen.findByDisplayValue("Decoração Floral")).toBeTruthy();
    expect(screen.getByDisplayValue("Igreja")).toBeTruthy();
    // E a oferta desaparece — anulada uma vez, não fica lá a pedir de novo.
    expect(screen.queryByText(/Pode anular durante/i)).toBeNull();
  });
});

describe("total desalinhado da soma das linhas", () => {
  function seedComPrecos(total: number) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: ["Decor Cerimónia", "Decor Jantar"],
        budgetAmounts: [900, 2350],
        coverImages: ["", ""],
        totalAmount: total,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
  }

  /**
   * ── O CONTADOR, NO LUGAR DA SOMA ──────────────────────────────────────
   * «Soma das linhas: 3.250,00 €» saiu daqui: era uma das TRÊS somas que
   * apareciam ao mesmo tempo no ecrã, e a soma verdadeira vive agora no bloco
   * de totais. O que fica é o que só este sítio pode responder — quantas destas
   * caixas estão mesmo preenchidas —, que é a outra metade da resposta ao
   * `placeholder="900"`: tirar o número falso e dizer o número verdadeiro.
   */
  it("conta quantas linhas têm preço, em vez de repetir a soma", async () => {
    seedComPrecos(3250);
    renderStudio();
    expect(await screen.findByText("2 de 2 linhas com preço")).toBeTruthy();
    expect(screen.queryByText(/^Soma das linhas:/)).toBeNull();
  });

  it("com umas linhas por orçamentar, diz que a soma está incompleta", async () => {
    // Duas linhas, uma só com preço: o caso em que a soma dá um número
    // plausível e errado por baixo.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: ["Decor Cerimónia", "Decor Jantar"],
        budgetAmounts: [900, null],
        coverImages: ["", ""],
        totalAmount: 900,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
    renderStudio();
    expect(await screen.findByText("1 de 2 linhas com preço")).toBeTruthy();
    expect(await screen.findByText(/a soma dos serviços está incompleta/i)).toBeTruthy();
  });

  /**
   * ── «0 DE 4 LINHAS COM PREÇO» NUMA PROPOSTA QUE ESTÁ CERTA ───────────────
   * Palavras dela, de uma fotografia do telemóvel: o contador lia-se como
   * erro. E lia-se bem — «0 de 2» tem a forma de um contador por preencher.
   * Só que há propostas em que as linhas NUNCA levam valor: o preço vive no
   * total e as linhas são a lista do que está incluído, que é o formato das
   * propostas desta casa há anos.
   *
   * Distingue-se por um facto, não por um palpite: nenhuma linha com preço E
   * um total escrito.
   */
  it("com o preço só no total, diz onde ele está em vez de contar «0 de 2»", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: ["Decor Cerimónia", "Decor Jantar"],
        budgetAmounts: [null, null],
        coverImages: ["", ""],
        totalAmount: 12500,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
    renderStudio();
    expect(
      await screen.findByText("Preço definido no total — as linhas não levam valor"),
    ).toBeTruthy();
    expect(screen.queryByText("0 de 2 linhas com preço")).toBeNull();
  });

  it("com todas as linhas orçamentadas, não avisa de soma incompleta", async () => {
    seedComPrecos(3250);
    renderStudio();
    await screen.findByText("2 de 2 linhas com preço");
    expect(screen.queryByText(/a soma dos serviços está incompleta/i)).toBeNull();
  });

  /**
   * O `placeholder="900"` era a mentira que fazia quatro campos vazios
   * parecerem preenchidos. Palavras dela: «mais cedo ou mais tarde alguém pensa
   * que já está preenchido».
   */
  it("um campo de preço vazio não sugere um número", async () => {
    seedComPrecos(3250);
    renderStudio();
    const campo = await screen.findByLabelText(/^Preço de Decor Cerimónia/);
    expect(campo.getAttribute("placeholder")).toBe("sem preço");
  });

  it("avisa quando o total escrito à mão já não bate certo", async () => {
    seedComPrecos(4000);
    renderStudio();
    const aviso = await screen.findByText(/difere da soma das linhas/i);
    expect(aviso.textContent).toMatch(/750/);
  });

  it("cala-se quando o total bate certo", async () => {
    seedComPrecos(3250);
    renderStudio();
    await screen.findByText("2 de 2 linhas com preço");
    expect(screen.queryByText(/difere da soma das linhas/i)).toBeNull();
  });

  /**
   * ── «USAR X €» É UM BOTÃO PERIGOSO ────────────────────────────────────
   * Palavras dela. Escrevia o número novo por cima do preço final — o valor de
   * que saem a fatura, o sinal e o saldo — sem mostrar o que ia desaparecer.
   * Estes três testes prendem as três coisas que passou a fazer: perguntar com
   * os dois valores, deixar anular, e ficar no histórico do pedido.
   */
  it("o botão do aviso pergunta primeiro, com os dois valores à vista", async () => {
    seedComPrecos(4000);
    renderStudio("Orçamento");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    const pergunta = await screen.findByText(/Substituir o total de/i);
    expect(pergunta.textContent).toMatch(/4\s?000,00/);
    expect(pergunta.textContent).toMatch(/3\s?250,00/);
    // E ainda não escreveu nada.
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("4000");
  });

  it("confirmado, arruma o total e deixa dez segundos para anular", async () => {
    seedComPrecos(4000);
    renderStudio("Orçamento");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    await user.click(await screen.findByRole("button", { name: /^Substituir$/ }));
    expect(screen.queryByText(/difere da soma das linhas/i)).toBeNull();
    expect(await screen.findByText(/Pode anular durante/i)).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /^Anular$/ }));
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("4000");
  });

  it("e fica escrito no histórico do pedido", async () => {
    seedComPrecos(4000);
    renderStudio("Orçamento");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    await user.click(await screen.findByRole("button", { name: /^Substituir$/ }));
    const registos = fetchMock.mock.calls.filter(([, init]) =>
      String(init?.body ?? "").includes("activityLogAppend"),
    );
    expect(registos.length).toBeGreaterThan(0);
    const corpo = JSON.parse(String(registos.at(-1)?.[1]?.body));
    expect(corpo.activityLogAppend[0].kind).toBe("price_set");
    expect(corpo.activityLogAppend[0].summary).toMatch(/3\s?250,00/);
  });

  /**
   * A pergunta guarda o gesto que a vai aplicar, composto com os números
   * daquele instante. Escrever entretanto no formulário torna-a uma pergunta
   * sobre um documento que já não existe — e aplicá-la escrevia por cima do
   * que se acabou de escrever.
   */
  it("a pergunta caduca se o documento mudar entretanto", async () => {
    seedComPrecos(4000);
    renderStudio("Orçamento");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    await screen.findByText(/Substituir o total de/i);
    await user.type(await screen.findByLabelText("Clientes"), "!");
    await waitFor(() => expect(screen.queryByText(/Substituir o total de/i)).toBeNull());
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("4000");
  });

  it("cancelado, não mexe no total nem escreve no histórico", async () => {
    seedComPrecos(4000);
    renderStudio("Orçamento");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    await user.click(await screen.findByRole("button", { name: /^Cancelar$/ }));
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("4000");
    expect(await screen.findByText(/difere da soma das linhas/i)).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        String(init?.body ?? "").includes("activityLogAppend"),
      ),
    ).toHaveLength(0);
  });

  /**
   * ── O BLOCO DE TOTAIS BATE CERTO COM `totaisDaProposta` ────────────────
   * É a razão de ser do bloco: os números do ecrã e os do papel saem da MESMA
   * função. Este teste compara linha a linha com o que a biblioteca devolve —
   * se alguém voltar a fazer contas na marcação, falha aqui antes de falhar
   * numa proposta.
   */
  it("o bloco de totais mostra exactamente o que `totaisDaProposta` devolve", async () => {
    seedComPrecos(4000);
    renderStudio();
    const doc = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    const esperado = totaisDaProposta(doc, 30);
    const bloco = (await screen.findByText("Totais")).parentElement!;
    for (const [rotulo, valor] of [
      ["Subtotal dos serviços", esperado.servicos],
      ["Valores adicionais", esperado.adicionais],
      ["Total sem IVA", esperado.total],
      ["Total a pagar", esperado.aPagar],
      ["Saldo 70%", esperado.saldo],
    ] as const) {
      const dt = within(bloco).getByText(rotulo);
      expect(dt.nextElementSibling?.textContent).toBe(eur(valor));
    }
    expect(within(bloco).getByText(`IVA (23%)`).nextElementSibling?.textContent).toBe(
      eur(esperado.iva),
    );
  });

  /**
   * ── DE DUAS LEITURAS PARA UMA ─────────────────────────────────────────
   *
   * Palavras dela: «retira com o IVA incluído. É apenas com o valor sem IVA
   * mais o IVA acresce».
   *
   * Eram dois cartões, e carregar num deles ESCOLHIA o modo. A escolha não
   * valia nada (as propostas da casa são todas «acresce») e custava o pior
   * engano que este ecrã pode ter: um toque distraído no cartão errado mudava
   * o que o casal paga sem mexer no número que ela está a olhar.
   *
   * Fica a leitura — é onde ela confere o IVA e o total a pagar. Saiu o
   * controlo, não a informação.
   */
  it("mostra UMA leitura do IVA, e nenhuma para escolher", async () => {
    seedComPrecos(3250);
    renderStudio();
    // A barra fixa do fundo também diz "o cliente paga" (precedida de
    // "sem IVA ·"), daí a âncora no início: a do bloco de totais é a única.
    expect(await screen.findAllByText(/^o cliente paga/)).toHaveLength(1);
    // E não há nada para carregar: o modo deixou de ser uma escolha.
    expect(screen.queryByRole("radiogroup", { name: "Modo de IVA" })).toBeNull();
    expect(screen.queryByRole("radio", { name: /IVA incluído/i })).toBeNull();
  });

  it("e um documento novo nasce em «acresce», não em «IVA incluído»", async () => {
    // `detectVatMode` devolvia "incluido" quando não havia texto nenhum para
    // ler — retrocompatibilidade com propostas antigas. Um documento acabado
    // de começar também não tem texto, e caía na mesma porta.
    renderStudio();
    expect(await screen.findByText(/\+ IVA \(acresce\)/)).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «TOTAL» ERA A MESMA PALAVRA PARA DOIS NÚMEROS DIFERENTES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela trabalha no iPhone e confere no computador, e queixou-se durante dias de
 * que «os valores estão diferentes». Estavam — mas não era a conta.
 *
 * A barra do fundo escrevia a palavra «Total» FORA do corte de largura e
 * deixava só o NÚMERO trocar por dentro:
 *
 *     <span>Total</span>
 *     <strong>
 *       <span className="sm:hidden">{aPagar}</span>       ← com IVA
 *       <span className="hidden sm:inline">{total}</span> ← sem IVA
 *     </strong>
 *
 * No telemóvel lia-se «Total 3.025,80 €»; no computador, «Total 2.460,00 € sem
 * IVA». A mesma proposta, a mesma palavra, dois valores — e nada no ecrã a
 * dizer qual era qual.
 *
 * A escolha de mostrar no telemóvel o que o CLIENTE paga estava certa e está
 * explicada no ficheiro. O que faltava era a etiqueta viajar com o número. O
 * que estes testes prendem é isso: cada ramo da barra tem de se explicar
 * sozinho a quem só vê esse.
 */
describe("a barra do fundo chama cada número pelo seu nome", () => {
  /** Com `acrescer`, os dois números afastam-se — que é o que dá para medir. */
  function seedBarra(total: number) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: ["Decor Cerimónia", "Decor Jantar"],
        budgetAmounts: [900, 2350],
        coverImages: ["", ""],
        totalAmount: total,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
  }

  /** Os dois ramos da barra do fundo, cada um com o texto que ele mostra. */
  async function ramosDaBarra(total: number) {
    seedBarra(total);
    const { container } = renderStudio();
    await screen.findByText("Totais");
    const doc = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    const esperado = totaisDaProposta(doc, 30);
    // ── PROCURA-SE PELO QUE ISTO É, NÃO POR ONDE ESTÁ ────────────────────
    // Isto dizia `p.mr-auto`, e apanhou uma reorganização da barra: o `mr-auto`
    // mudou-se para o parágrafo do ESTADO, à esquerda, quando o total passou a
    // viajar ao lado do botão que o consome. A regra que este describe guarda —
    // a etiqueta viver dentro do mesmo ramo que o número — nunca se partiu; o
    // que se partiu foi o localizador, agarrado a uma margem.
    //
    // Uma margem é arranjo e muda quando o desenho muda. O que NÃO muda é o que
    // define este parágrafo: é o único da barra com os dois ramos de largura
    // como filhos directos, um para o telemóvel e outro para o computador.
    const barra = [...container.querySelectorAll("p")].find((el) =>
      [...el.children].some((f) => f.className.includes("sm:hidden")),
    )!;
    const ramos = [...barra.querySelectorAll(":scope > span")];
    const estreito = ramos.find((el) => el.className.includes("sm:hidden"));
    const largo = ramos.find((el) => el.className.includes("sm:inline"));
    return { esperado, estreito, largo };
  }

  it("no telemóvel o número traz a sua etiqueta, e ela não é «Total»", async () => {
    const { esperado, estreito } = await ramosDaBarra(2460);
    expect(estreito).toBeTruthy();
    // O que o iPhone mostra é o que o cliente paga — com IVA.
    expect(estreito!.textContent).toContain(eur(esperado.aPagar));
    expect(estreito!.textContent).toContain("A pagar");
    // E a palavra que sobrava do lado de fora não pode voltar para aqui.
    expect(estreito!.textContent).not.toContain("Total");
  });

  it("no computador «Total» fica com o número que ele nomeia — o sem IVA", async () => {
    const { esperado, largo } = await ramosDaBarra(2460);
    expect(largo).toBeTruthy();
    expect(largo!.textContent).toContain("Total");
    expect(largo!.textContent).toContain(eur(esperado.total));
    expect(largo!.textContent).toContain(`a pagar ${eur(esperado.aPagar)}`);
  });

  it("os dois ecrãs nunca dão a mesma etiqueta a valores diferentes", async () => {
    const { esperado, estreito, largo } = await ramosDaBarra(2460);
    // A premissa do teste: com IVA a acrescer, os dois números são mesmo outros.
    expect(esperado.aPagar).not.toBe(esperado.total);
    // A rede: cada ramo é auto-suficiente — etiqueta e número no mesmo sítio.
    for (const ramo of [estreito!, largo!]) {
      expect(ramo.textContent).toMatch(/A pagar|Total/);
    }
    // E «Total», onde aparecer sozinho a nomear um valor, nomeia o sem IVA.
    expect(estreito!.textContent).not.toBe(largo!.textContent);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COLUNA DE PREÇOS DE ORGANIZAÇÃO, DESALINHADA, VISTA ANTES DE ENVIAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caso é o de uma proposta gerada a sério: 6.500 + 1.850 impressos numa
 * coluna, por baixo de um TOTAL de 12.500. São 4.150 € que o casal encontra ao
 * somar a coluna e que o documento não explica.
 *
 * A verificação vive em `totaisDaProposta` (com o porquê ao lado), e o que
 * ESTE teste prende é a outra metade: que ela apareça AQUI, no ecrã onde os
 * números se escrevem, e não só no registo do servidor depois de o PDF estar
 * feito. Um aviso que só se lê depois de o documento sair não é uma rede.
 */
describe("as linhas de Organização que não somam o total", () => {
  /** O rascunho da proposta do relatório, à letra. */
  function seedOrganizacao(over: Record<string, unknown> = {}) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "organizacao",
        ref: "PO Organização",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        budgetRows: [
          { item: "Coordenação e planeamento integral", price: "6.500,00 €" },
          { item: "Coordenação no dia do evento", price: "1.850,00 € + IVA (a confirmar)" },
          { item: "Gestão de fornecedores e contratos", price: "[Valor]" },
          { item: "Assessoria de imagem e papelaria", price: "" },
        ],
        coverImages: ["", ""],
        totalEstimatedText: "12.500,00 €",
        totalAmount: 12500,
        totalVatMode: "acrescer",
        ...over,
      }),
    );
  }

  it("acende o aviso no bloco de totais, com os três números", async () => {
    seedOrganizacao();
    renderStudio();
    const aviso = await screen.findByText(/As contas não fecham/);
    // O que a coluna soma, o que o quadro fecha, e a diferença que fica por
    // explicar — as três coisas que o casal vê e não consegue ligar.
    expect(aviso.textContent).toContain("8350");
    expect(aviso.textContent).toContain("12500");
    expect(aviso.textContent).toContain("4150");
  });

  it("uma proposta em que a coluna fecha não acende nada", async () => {
    // 7.890 + 2.500 = 10.390. É o caso normal, e o caso normal tem de ser
    // silencioso: um aviso que dispara em condições normais aprende-se a
    // ignorar.
    seedOrganizacao({
      budgetRows: [
        { item: "Planeamento integral", price: "7890,00 €" },
        { item: "Coordenação no dia", price: "2.500,00 €" },
      ],
      totalEstimatedText: "10.390,00 €",
      totalAmount: 10390,
    });
    renderStudio();
    // O bloco de totais está lá (é o que garante que se estaria a ver o aviso
    // se ele existisse) e o aviso não.
    expect(await screen.findByText("Totais")).toBeTruthy();
    expect(screen.queryByText(/As contas não fecham/)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TECTO DE TEMPO, DITO ANTES DE SE BATER NELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A rota que redesenha o documento para o CASAL tem 60 segundos, e uma
 * proposta no tecto do gerador (80 fotografias) gasta 23 a 29 s no desenho
 * novo, com a rede do mau dia. A conta é do `custo-do-pdf.ts`, com os números
 * medidos; o que se prende aqui é que o ecrã onde as fotografias se escolhem
 * não grita por uma conta que cabe — e que, se deixar de caber, o aviso diz o
 * tecto verdadeiro e não um número escrito à mão.
 */
describe("o aviso de tempo antes de gerar", () => {
  it("uma proposta no tecto do gerador cabe no tecto da rota: não há aviso", async () => {
    seedDraft(78);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    expect(await screen.findByText(/Gerar este PDF demora/)).toBeTruthy();
    expect(screen.queryByText(/a página onde o casal o abre desiste/)).toBeNull();
  });

  it("uma proposta normal não diz nada sobre tempo nenhum", async () => {
    seedDraft(6);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    // A frase da estimativa continua lá — é o aviso do tecto que não aparece.
    expect(await screen.findByText(/Gerar este PDF demora/)).toBeTruthy();
    expect(screen.queryByText(/a página onde o casal o abre desiste/)).toBeNull();
  });
});

describe("pontos de decoração escolhidos no pedido", () => {
  const comEscolhas = {
    ...quote,
    decorPoints: ["cocktail", "seating", "mesas"],
  } as unknown as Quote;

  const renderCom = (q: Quote) =>
    render(
      <ToastProvider>
        <ProposalStudio quote={q} />
      </ToastProvider>,
    );

  it("abre a proposta já com as linhas que o casal pediu", async () => {
    renderCom(comEscolhas);
    // As palavras são as do quadro "3. Orçamento Proposto" das propostas
    // reais — o que o casal marcou e o que ela vê no estúdio têm de ser
    // reconhecivelmente a mesma coisa.
    expect(await screen.findAllByDisplayValue("Decoração Cocktail")).not.toHaveLength(0);
    expect(screen.getAllByDisplayValue("Design Floral e Decoração Mesas")).not.toHaveLength(0);
    expect(
      screen.getAllByDisplayValue("Seating Plan e Decor Floral Seating Plan"),
    ).not.toHaveLength(0);
  });

  it("não semeia o que o casal NÃO pediu", async () => {
    renderCom(comEscolhas);
    await screen.findAllByDisplayValue("Decoração Cocktail");
    // A cerimónia e os complementos dos noivos foram exactamente os dois
    // pontos que a Catarina mandou tirar. Não podem reaparecer sozinhos.
    expect(screen.queryByDisplayValue("Decoração Cerimónia")).toBeNull();
    expect(screen.queryByDisplayValue("Complementos dos Noivos")).toBeNull();
  });

  it("um pedido sem escolhas abre o estúdio como sempre abriu", async () => {
    renderCom(quote);
    // Um grupo vazio à espera de ser escrito — nada semeado.
    const grupo = await screen.findByPlaceholderText("Escreve aqui o título do grupo");
    expect((grupo as HTMLInputElement).value).toBe("");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUAS PÁGINAS COM O MESMO NOME, UMA A SEGUIR À OUTRA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «páginas 6 e 7 dos mood boards: "Complementos Dos Noivos" e
 * "Complementos Noivos". Uma é bouquet, outra lapelas — mas na proposta
 * aparecem dois títulos praticamente idênticos seguidos».
 *
 * As regras de o que é «parecido» estão presas em `proposal-titulos-parecidos`.
 * O que se prende AQUI é que o aviso chegue ao ecrã onde ela escreve o título —
 * é o único sítio onde o problema se resolve.
 */
describe("títulos de páginas quase iguais", () => {
  /** Um rascunho com os títulos que interessam, e uma foto em cada página. */
  function seedComTitulos(...titulos: string[]) {
    seedDraft(1);
    const doc = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...doc,
        moodBoards: titulos.map((title, i) => ({
          title,
          annotation: "",
          images: [`board/foto-${i}.jpg`],
        })),
      }),
    );
  }

  it("avisa no cartão do board, e cita o outro título", async () => {
    seedComTitulos("Complementos Dos Noivos", "Complementos Noivos");
    renderStudio();
    const avisos = await screen.findAllByText(/lê-se como esta página/i);
    expect(avisos).toHaveLength(2);
    expect(avisos[0].textContent).toContain("«Complementos Noivos»");
    expect(avisos[1].textContent).toContain("«Complementos Dos Noivos»");
  });

  it("«Mesa 1» e «Mesa 2» não levam aviso nenhum", async () => {
    // Um aviso que trava uma escolha legítima ensina-se a ignorar, e o próximo
    // — o que interessa — ignora-se com ele.
    seedComTitulos("Mesa 1", "Mesa 2");
    renderStudio();
    await screen.findByDisplayValue("Mesa 1");
    expect(screen.queryByText(/lê-se como esta página/i)).toBeNull();
  });
});

describe("um tema com mais fotografias do que uma página leva", () => {
  /**
   * No PDF antigo uma página imprimia dez e as outras ficavam de fora, com o
   * aviso «fora do PDF». No novo nenhuma fica de fora: acima de doze o tema
   * passa a duas páginas (a segunda diz «Mais ideias…»). Diz-se, em voz baixa.
   */
  it("acima de doze diz que o tema ocupa duas páginas, e não marca nenhuma de fora", async () => {
    seedDraft(14);
    renderStudio();
    expect(await screen.findByText(/14 fotos: no PDF este tema ocupa 2 páginas/)).toBeTruthy();
    expect(screen.queryByText("fora do PDF")).toBeNull();
  });

  /**
   * ── UM AVISO CORTADO NÃO É UM AVISO ─────────────────────────────────────
   *
   * `white-space` e `text-overflow` HERDAM-SE: um `truncate` em qualquer
   * antepassado deste parágrafo desce até ele. A defesa é declarada no próprio
   * parágrafo.
   */
  it("o aviso quebra a linha, aconteça o que acontecer por cima dele", async () => {
    seedDraft(14);
    renderStudio();
    const aviso = await screen.findByText(/no PDF este tema ocupa 2 páginas/);
    expect(aviso.className).toContain("whitespace-normal");
  });

  it("diz NO INSTANTE em que o tema passa a duas páginas", async () => {
    seedDraft(12);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Escolher da biblioteca de temas/ }),
    );
    await user.click(await screen.findByRole("button", { name: "escolher-foto-de-teste" }));
    expect(
      await screen.findByText(/fica com 13 fotos e passa a ocupar 2 páginas no PDF/),
    ).toBeTruthy();
  });

  it("até doze não diz nada", async () => {
    seedDraft(12);
    renderStudio("Inspiração");
    await screen.findByRole("heading", { name: "Mood boards" });
    expect(screen.queryByText(/ocupa 2 páginas/)).toBeNull();
    expect(screen.queryByText("fora do PDF")).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE O PDF FAZ COM CADA TEMA — E A DISPOSIÇÃO À ESCOLHA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sem escolha, o PDF decide a composição pelo número de fotografias, e o cartão
 * di-lo. A 15/10 ela pediu de volta o selector das disposições, com as
 * composições do PDF novo (`EscolherDisposicao`). O «Manter a forma de cada
 * fotografia» do PDF antigo não volta.
 */
describe("a composição de cada tema", () => {
  it("diz o capítulo e a composição, e acompanha o número de fotos", async () => {
    seedDraft(5);
    renderStudio();
    const linha = (await screen.findAllByText(/^Capítulo:/))[0].closest("p")!;
    // Cinco fotografias: a célula de texto num canto e duas filas (§6.6b).
    expect(linha.textContent).toMatch(/O texto num canto e as fotografias em duas filas/);
  });

  it("escolher uma disposição grava-a no tema, e a linha di-lo", async () => {
    seedDraft(5);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    const grupo = await screen.findByRole("radiogroup", { name: "Disposição das fotos na página" });
    expect(within(grupo).getByRole("radio", { name: "Automática" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(grupo).getByRole("radio", { name: "Destaque" }));
    await waitFor(() => {
      expect(corpos("proposta-rascunho").at(-1) ?? "").toContain('"disposicao":"destaque"');
    });
    const linha = (await screen.findAllByText(/^Capítulo:/))[0].closest("p")!;
    expect(linha.textContent).toMatch(/Destaque/);
    expect(within(grupo).getByRole("radio", { name: "Destaque" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("uma disposição que não serve para tão poucas fotos está desligada e diz porquê", async () => {
    seedDraft(2);
    renderStudio("Inspiração");
    const grupo = await screen.findByRole("radiogroup", { name: "Disposição das fotos na página" });
    expect(
      within(grupo).getByRole("radio", { name: /^Soltas — precisa de pelo menos 3 fotografias$/ }),
    ).toBeDisabled();
    expect(within(grupo).getByRole("radio", { name: "Uma fila" })).toBeEnabled();
  });

  it("«Anular» repõe a automática", async () => {
    seedDraft(5);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    const grupo = await screen.findByRole("radiogroup", { name: "Disposição das fotos na página" });
    await user.click(within(grupo).getByRole("radio", { name: "Grelha" }));
    await user.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() =>
      expect(within(grupo).getByRole("radio", { name: "Automática" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });

  it("não volta o interruptor de recorte do PDF antigo", async () => {
    seedDraft(5);
    renderStudio();
    await screen.findAllByText(/^Capítulo:/);
    expect(screen.queryByRole("checkbox", { name: /manter a forma/i })).toBeNull();
  });

  it("o subtítulo do mood board é gravado", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Subtítulo do mood board"),
      "Ramo de Noiva (a definir com a Noiva)",
    );
    await waitFor(() => {
      expect(corpos("proposta-rascunho").at(-1) ?? "").toContain(
        "Ramo de Noiva (a definir com a Noiva)",
      );
    });
  });
});

describe("aviso antes de a proposta seguir para o cliente", () => {
  it("a pré-visualização diz o que o desenho cortou", async () => {
    seedDraft(8);
    const cortes = [{ where: "Mood board «Cerimónia»", dropped: 2, unit: "fotos" }];
    propostaDoc = reply({
      headers: {
        "X-Fotos-Em-Falta": "0",
        "X-Conteudo-Cortado": Buffer.from(JSON.stringify(cortes), "utf8").toString("base64"),
      },
    });
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await user.click(await screen.findByRole("button", { name: /Descarregar PDF/ }));

    const alerta = await screen.findByRole("alert");
    expect(
      within(alerta).getByText(/Mood board «Cerimónia»: 2 fotos não entram no PDF/),
    ).toBeTruthy();
    expect(within(alerta).getByText(/Verifica antes de enviar/)).toBeTruthy();
  });

  /**
   * Achado n.º 3 da auditoria: o «Confirmar» aparece exactamente onde estava a
   * ponta direita do «Gerar e enviar ao cliente». Um duplo clique ali enviava
   * a proposta sem a pergunta chegar a ser vista.
   */
  it("o segundo clique de um duplo clique não confirma o envio", async () => {
    seedDraft(2);
    propostaDoc = reply({ json: { ok: true, emailed: true } });
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    const gerar = await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ });
    // Os dois cliques no MESMO instante, como um duplo clique. O relógio fica
    // parado entre os dois: o estúdio redesenha-se por inteiro depois do
    // primeiro, e numa máquina carregada isso chegou a passar dos 400 ms — e aí
    // o «Confirmar» aceitava, e bem, porque já não era um duplo clique. Falhava
    // de vez em quando também no `main`; o que se mede é a regra, não a
    // velocidade da máquina.
    const relogio = vi.spyOn(performance, "now").mockReturnValue(1_000);
    try {
      fireEvent.click(gerar);
      fireEvent.click(screen.getByRole("button", { name: /^Confirmar$/ }));
    } finally {
      relogio.mockRestore();
    }
    expect(corpos("proposta-doc", "POST")).toHaveLength(0);
    // Depois de a ler, confirma.
    await confirmarEnvio(user);
    await waitFor(() => expect(corpos("proposta-doc", "POST")).toHaveLength(1));
  });

  /**
   * «10 s para cancelar», a escolha dela (`docs/TUDO-REVERSIVEL.md`): depois do
   * «Confirmar», o email ainda não saiu — há uma faixa «A enviar em N s…» com
   * «Cancelar». Cancelar não manda nada; esperar os 10 s manda.
   */
  it("depois de confirmar, o envio por email espera e pode ser cancelado", async () => {
    seedDraft(2);
    propostaDoc = reply({ json: { ok: true, emailed: true } });
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    const botao = await screen.findByRole("button", { name: /^Confirmar$/ });
    await new Promise((r) => setTimeout(r, 450));
    await user.click(botao);
    expect(await screen.findByText(/A enviar para .* em \d+ s/)).toBeTruthy();
    expect(corpos("proposta-doc", "POST")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: /^Cancelar$/ }));
    expect(screen.queryByText(/A enviar para .* em \d+ s/)).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(corpos("proposta-doc", "POST")).toHaveLength(0);
    // E o botão volta, para enviar quando ela quiser.
    expect(screen.getByRole("button", { name: /Gerar e enviar ao cliente/ })).toBeTruthy();
  });

  it("sem cancelar, o envio sai sozinho ao fim dos 10 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setInterval", "clearInterval", "Date"] });
    try {
      seedDraft(2);
      propostaDoc = reply({ json: { ok: true, emailed: true } });
      renderStudio();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
      await verEConfirmar();
      await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
      const botao = await screen.findByRole("button", { name: /^Confirmar$/ });
      await new Promise((r) => setTimeout(r, 450));
      await user.click(botao);
      await screen.findByText(/A enviar para .* em \d+ s/);
      await act(async () => {
        vi.advanceTimersByTime(9_000);
      });
      expect(corpos("proposta-doc", "POST")).toHaveLength(0);
      await act(async () => {
        vi.advanceTimersByTime(1_500);
      });
      await waitFor(() => expect(corpos("proposta-doc", "POST")).toHaveLength(1));
    } finally {
      vi.useRealTimers();
    }
  });

  it("o envio avisa das duas perdas ao mesmo tempo, sem as confundir", async () => {
    seedDraft(2);
    propostaDoc = reply({
      json: {
        ok: true,
        emailed: true,
        missingImages: 1,
        truncations: [{ where: "Campo «Local»", dropped: 1, unit: "linhas" }],
      },
    });
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    // Enviar exige duas carregadas: a acção e a confirmação.
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);

    const alerta = await screen.findByRole("alert");
    const texto = alerta.textContent ?? "";
    expect(texto).toMatch(/1 foto não entrou \(não foi possível ir buscá-la ou desenhá-la\)/);
    expect(texto).toMatch(/Campo «Local»: 1 linha cortada/);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE FICA CORTADO É UMA PERGUNTA ANTES DO EMAIL, NÃO UM AVISO DEPOIS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O teste acima é o mundo antigo: o aviso chegava com o email já fora. O
   * servidor passa a parar antes de gravar e de enviar (409), e o que se prende
   * aqui é o que ela vê e o que acontece a seguir — a lista do que ficou de
   * fora, e um segundo clique que envia com a resposta dada.
   */
  it("pergunta antes de enviar, com o que ficou cortado à vista", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    // O 409 é a resposta do ENVIO — a descarga do PDF, antes, correu bem.
    propostaDoc = reply({
      ok: false,
      status: 409,
      json: {
        error: "O documento sai com conteúdo cortado.",
        precisaConfirmarCortes: true,
        truncations: [
          { where: "Nome na capa", dropped: 2, unit: "linhas" },
          { where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" },
        ],
      },
    });
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);

    // A pergunta, com os dois cortes escritos por extenso.
    expect(await screen.findByText(/O documento sai com conteúdo cortado/)).toBeTruthy();
    expect(screen.getByText(/Nome na capa: 2 linhas cortadas/)).toBeTruthy();
    expect(screen.getByText(/Mood board «Cerimónia»: 3 fotos não entram no PDF/)).toBeTruthy();
    // E não se disfarça de avaria: não há «não foi possível enviar» nenhum.
    expect(screen.queryByText(/Não foi possível enviar/)).toBeNull();
    // O envio parou mesmo: o passo não ficou dado por feito.
    expect(screen.queryByRole("button", { name: /Voltar ao evento/ })).toBeNull();

    // O segundo clique é o mesmo envio, com a resposta dada.
    propostaDoc = reply({ json: { ok: true, emailed: true } });
    await user.click(await screen.findByRole("button", { name: /Enviar assim mesmo/ }));
    await screen.findByRole("button", { name: /Voltar ao evento/ });
    const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c || "{}"));
    expect(enviados.at(-1)?.cortesConfirmados, "o segundo envio não levou a resposta").toBe(true);
    // E o primeiro NÃO a levava — senão a pergunta nunca chegaria a ser feita.
    expect(enviados.at(-2)?.cortesConfirmados).toBeUndefined();
  });

  it("«voltar e corrigir» leva ao passo do corte e não envia nada", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    // O 409 é a resposta do ENVIO — a descarga do PDF, antes, correu bem.
    propostaDoc = reply({
      ok: false,
      status: 409,
      json: {
        precisaConfirmarCortes: true,
        truncations: [{ where: "Nome na capa", dropped: 2, unit: "linhas" }],
      },
    });
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);
    await user.click(await screen.findByRole("button", { name: /Voltar e corrigir/ }));

    // Um envio só — o que fez a pergunta.
    expect(corpos("proposta-doc", "POST")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Voltar ao evento/ })).toBeNull();
    // E levou ao passo onde o nome da capa se corrige.
    expect(screen.getByRole("button", { name: /^1\s*Evento/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });
});

/**
 * A FOTO APARECE NO INSTANTE DO CLIQUE — E O MARCADOR NUNCA SAI DAQUI.
 *
 * Escolher fotos na Biblioteca de Temas fecha o diálogo já, mas a CÓPIA para a
 * pasta desta proposta demora. Entre o clique e a confirmação, o que ocupa o
 * lugar no documento é um marcador `pending:<uuid>` — que não é caminho de
 * coisa nenhuma. Fixa-se aqui o ciclo inteiro:
 *
 *  1. ao clicar, a foto está no mood board, esbatida e anunciada (`aria-busy`);
 *  2. ao confirmar, o marcador dá lugar ao caminho definitivo NA MESMA CÉLULA —
 *     nada reordena, nada salta;
 *  3. ao falhar, o marcador sai (e o aviso é da pastilha, não daqui);
 *  4. e — o mais importante — um marcador NUNCA é gravado no rascunho nem vai
 *     dentro do documento que gera o PDF. Gravado, sobrevivia ao recarregar da
 *     página como uma foto que não existe; enviado, era um buraco silencioso no
 *     PDF do cliente.
 */
describe("fotos da biblioteca em estado provisório", () => {
  /**
   * As células de foto do documento, por ordem no DOM.
   *
   * Era `queryAllByRole("button", { name: "Remover imagem" })` + `parentElement`:
   * uma célula identificava-se pelo × que tinha lá dentro. O × das grelhas dos
   * mood boards mudou-se para a barra de acções (visível ao toque, que é onde
   * um botão só-com-hover não existe), e o teste passou a não encontrar
   * célula nenhuma. `[data-foto]` diz o que a célula É.
   */
  const celulas = () => Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"));
  const estados = () => celulas().map((c) => c.getAttribute("aria-busy"));

  async function abrirBiblioteca(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: /Escolher da biblioteca de temas/ }),
    );
  }
  const reservar = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "reservar-foto-de-teste" }));
  const confirmar = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "confirmar-foto-de-teste" }));

  /** Esquece o que já foi gravado e espera pela PRÓXIMA gravação do rascunho
   *  (que é feita com debounce). */
  async function proximaGravacao() {
    pedidos = [];
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
  }

  it("a foto entra no mood board no INSTANTE do clique, em estado provisório", async () => {
    seedDraft(1);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    /**
     * Os pedidos de antes, DESCONTADAS as GRAVAÇÕES.
     *
     * Este teste chegou a contar todos e a falhar de vez em quando na
     * integração: a gravação do rascunho sai com oitocentos milissegundos de
     * atraso e, com a máquina carregada, cabe dentro desta janela. É outra
     * coisa — persistência, não a fotografia — e não se controla daqui.
     * Contá-la fazia o teste ficar vermelho por uma razão que nada tem a ver
     * com o que ele afirma, e um teste que falha por acaso deixa de se ler.
     *
     * ── E PASSOU A HAVER UMA SEGUNDA GRAVAÇÃO ATRASADA ──────────────────
     * O `PATCH` do preço, que o ramo do «o pedido ainda não tem preço» dispara
     * 600 ms depois da montagem para levar ao pedido o valor que só o rascunho
     * tinha. Cai na MESMA descrição e pela mesma razão — persistência, não a
     * fotografia — e foi assim que apareceu: verde aqui, vermelho na
     * integração, que é mais lenta e chega aos 600 ms dentro da janela.
     *
     * Descontam-se as duas pelo que são (escritas), e não pelo instante em que
     * calham: um teste afinado ao relógio da máquina volta a falhar sozinho.
     *
     * ── E UMA PERGUNTA ATRASADA, A DAS FOTOGRAFIAS DO PDF (15/10) ───────
     * O estúdio pergunta à rota `fotos-do-pdf` que fotografia vai em cada
     * página, 900 ms depois de o documento mudar (`useFotosDoPdf`). Também não
     * é a miniatura: é a mesma família, e com a máquina carregada cai dentro
     * da janela.
     */
    const escrita = (p: (typeof pedidos)[number]) => {
      const metodo = p.init?.method ?? "GET";
      return (
        p.url.includes("proposta-rascunho") || p.url.includes("fotos-do-pdf") || metodo === "PATCH"
      );
    };
    const semGravacoes = (ps: typeof pedidos) => ps.filter((p) => !escrita(p)).length;
    const antes = semGravacoes(pedidos);
    await reservar(user);

    // Sem esperar por rede nenhuma: são duas células, a nova por assentar.
    expect(estados()).toEqual([null, "true"]);
    // Percetível por quem não vê o esbatido, e não só por opacidade.
    expect(screen.getByText("a entrar…")).toBeInTheDocument();
    // E ZERO pedidos novos: a miniatura é a que o seletor já tinha em memória.
    expect(semGravacoes(pedidos)).toBe(antes);
  });

  it("ao confirmar, o marcador dá lugar ao caminho definitivo NA MESMA POSIÇÃO", async () => {
    seedDraft(1);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);
    await reservar(user);
    expect(estados()).toEqual([null, "true", "true"]);

    // Confirma-se a SEGUNDA das duas. Se a troca fosse um "acrescentar", ela
    // ia parar ao fim da lista e a primeira descia de posição.
    await confirmar(user);
    expect(estados()).toEqual([null, "true", null]);

    await confirmar(user);
    expect(estados()).toEqual([null, null, null]);
    await proximaGravacao();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).moodBoards[0].images).toEqual([
      "board/foto-0.jpg",
      "LQ-001/copia-1.jpg",
      "LQ-001/copia-2.jpg",
    ]);
  });

  it("ao falhar, o marcador sai do documento — e o aviso não se repete", async () => {
    seedDraft(1);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);
    expect(estados()).toEqual([null, "true"]);

    await user.click(screen.getByRole("button", { name: "falhar-foto-de-teste" }));

    expect(estados()).toEqual([null]);
    expect(screen.queryByText("a entrar…")).not.toBeInTheDocument();
    // A pastilha do seletor é que avisa e oferece "Repetir"; o estúdio cala-se
    // (a região de avisos existe sempre, mas fica vazia).
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("um marcador provisório NUNCA é gravado no rascunho", async () => {
    seedDraft(1);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);
    await proximaGravacao();

    // Nem na cópia local (documento e mapas de apoio)…
    expect(localStorage.getItem(DRAFT_KEY)).not.toContain("pending:");
    expect(localStorage.getItem(`${DRAFT_KEY}:meta`)).not.toContain("pending:");
    // …nem na do servidor, que é a que viaja para o outro dispositivo.
    expect(corpos("proposta-rascunho").join("")).not.toContain("pending:");
    // E o que já lá estava não se perdeu no caminho.
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).moodBoards[0].images).toEqual([
      "board/foto-0.jpg",
    ]);
  });

  it("a capa reservada grava-se no lugar da capa, e só quando entra", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    // UM lugar de capa: o primeiro «Da biblioteca de temas» do passo é o dela.
    const daBiblioteca = await screen.findAllByRole("button", { name: "Da biblioteca de temas" });
    await user.click(daBiblioteca[0]);
    await reservar(user);
    await proximaGravacao();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).coverImages).toEqual(["", ""]);

    await confirmar(user);
    await proximaGravacao();
    // Escreve-se na posição e não se compacta: a segunda das propostas antigas
    // fica onde estava.
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).coverImages).toEqual([
      "LQ-001/copia-1.jpg",
      "",
    ]);
  });

  it("a pré-visualização sai sem o marcador e diz que a foto ainda não entrou", async () => {
    seedDraft(1);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);

    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await user.click(await screen.findByRole("button", { name: /Descarregar PDF/ }));

    const corpo = corpos("proposta-doc", "POST").at(-1) ?? "";
    expect(corpo).not.toContain("pending:");
    expect(JSON.parse(corpo).doc.moodBoards[0].images).toEqual(["board/foto-0.jpg"]);
    // E dito por extenso, senão o PDF que ela acabou de abrir parecia um erro.
    expect(
      await screen.findByText(/PDF gerado sem 1 foto que ainda está a entrar/),
    ).toBeInTheDocument();
  });

  it("o ENVIO espera pelas fotos por confirmar, e depois leva o caminho definitivo", async () => {
    seedDraft(1);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);

    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    // O gesto irreversível não segue com a proposta a meio: fica travado, com
    // a razão escrita — e não uma mensagem a mandá-la preencher campos.
    // (O resumo do mesmo passo diz a mesma coisa do PDF; a linha do ENVIO é
    // a que diz que o envio espera.)
    expect(
      await screen.findByText(/1 foto ainda está a entrar na proposta\. O envio fica disponível/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar e enviar ao cliente/ })).toBeDisabled();
    expect(corpos("proposta-doc", "POST")).toHaveLength(0);

    // Mal assenta, o envio abre sozinho — e o documento leva o caminho real.
    await confirmar(user);
    await verEConfirmar();
    const enviar = screen.getByRole("button", { name: /Gerar e enviar ao cliente/ });
    expect(enviar).toBeEnabled();
    await user.click(enviar);
    await confirmarEnvio(user);

    const corpo = corpos("proposta-doc", "POST").at(-1) ?? "";
    expect(corpo).not.toContain("pending:");
    expect(JSON.parse(corpo).doc.moodBoards[0].images).toEqual([
      "board/foto-0.jpg",
      "LQ-001/copia-1.jpg",
    ]);
  });

  it("um marcador deixado num rascunho antigo não sobrevive a reabrir o estúdio", async () => {
    // Uma versão anterior (ou um rascunho corrompido) podia ter gravado um.
    // Abrir com ele seria pôr no ecrã uma foto que não existe em lado nenhum.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [
          { title: "Cerimónia", annotation: "", images: ["board/foto-0.jpg", "pending:antigo"] },
        ],
        budgetItems: [],
        coverImages: ["pending:capa", "board/capa-1.jpg"],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    renderStudio("Inspiração");

    // O TÍTULO da secção: a coluna lateral (NavEstudio) também diz "Mood
    // boards", e um `findByText` solto passou a encontrar os dois.
    await screen.findByRole("heading", { name: "Mood boards" });
    // Uma foto no mood board, uma capa — e nenhuma célula provisória.
    expect(estados()).toEqual([null, null]);
    // Espera-se pela reescrita da CÓPIA LOCAL, e não pelo primeiro PUT: desde
    // que o estúdio reenvia ao abrir o rascunho que estava preso no navegador,
    // o primeiro PUT é esse reenvio — acontece antes do debounce, e chegava cá
    // com o `localStorage` ainda por limpar.
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).not.toContain("pending:"), {
      timeout: 3000,
    });
    // E o que segue para o servidor também vai limpo, incluindo o reenvio.
    expect(corpos("proposta-rascunho").join("")).not.toContain("pending:");
  });
});

describe("a frase do aviso", () => {
  it("junta as duas perdas mantendo-as distintas", () => {
    expect(
      avisoDeConteudoIncompleto(2, [
        { where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" },
        { where: "Nome na capa", dropped: 1, unit: "linhas" },
      ]),
    ).toBe(
      "2 fotos não entraram (não foi possível ir buscá-las ou desenhá-las); " +
        "Mood board «Cerimónia»: 3 fotos não entram no PDF; " +
        "Nome na capa: 1 linha cortada",
    );
  });

  it("cala-se quando o documento vai completo", () => {
    expect(avisoDeConteudoIncompleto(0, [])).toBeNull();
  });

  it("lê o cabeçalho com acentos e ignora lixo em vez de rebentar", () => {
    const cortes = [{ where: "Descrição do mood board «Cerimónia»", dropped: 4, unit: "linhas" }];
    const header = Buffer.from(JSON.stringify(cortes), "utf8").toString("base64");
    expect(cortesDoCabecalho(header)).toEqual(cortes);
    expect(cortesDoCabecalho(null)).toEqual([]);
    expect(cortesDoCabecalho("isto-não-é-base64-de-json")).toEqual([]);
    expect(cortesDoCabecalho(Buffer.from('[{"where":1}]').toString("base64"))).toEqual([]);
  });
});

describe("O valor é UM só — o do pedido", () => {
  /**
   * O defeito: havia duas caixas com o mesmo número (aqui e na Gestão do
   * pedido) e elas podiam DISCORDAR. O estúdio só copiava o preço quando ainda
   * não havia rascunho; a partir daí, alterar o "Preço final" no pedido não
   * mexia aqui, e o PDF seguia para o cliente com o valor antigo — sem nada no
   * ecrã a dizê-lo.
   */
  const comPreco = (preco?: number) => ({ ...quote, quotedPrice: preco }) as Quote;

  function desenhar(q: Quote, onQuoteUpdated?: (q: Quote) => void) {
    return render(
      <ToastProvider>
        <ProposalStudio quote={q} onQuoteUpdated={onQuoteUpdated} />
      </ToastProvider>,
    );
  }

  it("abre com o preço do pedido, mesmo havendo já um rascunho com outro valor", async () => {
    // Este é o caso que se partia: o rascunho tem 3000, o pedido passou a 4500.
    seedDraft(2);
    desenhar(comPreco(4500));
    const campo = await screen.findByLabelText(/Valor \(sem IVA\)/i);
    expect(campo).toHaveValue("4500");
  });

  it("escrever aqui GRAVA no preço do pedido", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const atualizado = vi.fn();
    desenhar(comPreco(3000), atualizado);

    const campo = await screen.findByLabelText(/Valor \(sem IVA\)/i);
    await user.clear(campo);
    await user.type(campo, "4200");
    // A gravação tem a mão travada — quatro teclas não podem ser quatro
    // gravações.
    await vi.advanceTimersByTimeAsync(800);

    // Só contam as gravações do que ela ESCREVEU: um estúdio de um teste
    // anterior ainda pode mandar o preço com que abriu (3000) por um relógio
    // que ficou a correr — descobriu-se ao correr este ficheiro em partes, com
    // outra ordem (`test/em-partes.ts`).
    const gravacoes = fetchMock.mock.calls.filter(
      ([, init]) =>
        init?.method === "PATCH" &&
        (JSON.parse(String(init.body)) as { quotedPrice?: number }).quotedPrice !== 3000,
    );
    expect(gravacoes.length, "escreveu uma vez por tecla").toBe(1);
    expect(JSON.parse(String(gravacoes[0][1]?.body))).toMatchObject({ quotedPrice: 4200 });
    vi.useRealTimers();
  });

  it("apagar o valor grava NULL — senão o pedido ficava com o preço antigo", async () => {
    // `undefined` desaparece no JSON e o merge parcial do servidor mantinha o
    // valor velho: apagar nunca chegava a gravar.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    desenhar(comPreco(3000));
    await user.clear(await screen.findByLabelText(/Valor \(sem IVA\)/i));
    await vi.advanceTimersByTimeAsync(800);

    const gravacoes = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(gravacoes.at(-1)?.[1]?.body))).toMatchObject({ quotedPrice: null });
    vi.useRealTimers();
  });

  /**
   * ── JÁ NÃO SE TROCA O MODO, E ERA ESSE O PONTO ────────────────────────
   *
   * O caso de antes carregava no cartão «IVA incluído» e provava que a base
   * não se mexia. O controlo desapareceu (ver «mostra UMA leitura do IVA»), e
   * com ele o engano que ele permitia — um toque a mudar o que o casal paga.
   *
   * O que continua a ter de ser verdade é a outra metade da afirmação antiga:
   * o número que viaja para o pedido é a BASE, e o rótulo «(sem IVA)» da
   * Gestão do pedido é verdadeiro.
   */
  it("o número do pedido é a base, e o ecrã não deixa trocar o modo do IVA", async () => {
    desenhar(comPreco(3000));
    const campo = await screen.findByLabelText(/Valor \(sem IVA\)/i);
    expect(campo).toHaveValue("3000");
    expect(screen.queryByRole("radio", { name: /IVA incluído/i })).toBeNull();
  });
});

describe("linhas que escalam com os convidados", () => {
  /**
   * Metade das linhas de um orçamento de casamento é uma multiplicação, não um
   * preço. O que se prende aqui é o que a torna confiável: a conta aparece, e
   * mudar o tipo de escala não faz o total saltar debaixo dos pés.
   */
  it("mostra a conta ao lado do número quando a linha passa a ser por mesa", async () => {
    renderStudio("Orçamento");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ Adicionar item/ }));
    const nome = screen.getAllByLabelText("Item de orçamento").at(-1)!;
    await user.clear(nome);
    await user.type(nome, "Arranjos de mesa");

    // O pedido de teste não traz convidados; escreve-se o número no campo do
    // Evento, que é de onde a conta os lê.
    const campoConvidados = screen.getByLabelText("Convidados");
    await user.clear(campoConvidados);
    await user.type(campoConvidados, "120 pax");

    const comoEscala = screen.getByLabelText(/Como escala Arranjos de mesa/);
    await user.selectOptions(comoEscala, "por-mesa");

    const unitario = screen.getByLabelText(/Preço por mesa de Arranjos de mesa/);
    await user.clear(unitario);
    await user.type(unitario, "45");
    await user.tab();

    // 120 convidados → 12 mesas de 10, a 45 € cada.
    await waitFor(() => expect(screen.getByText(/12 mesas × /)).toBeTruthy());
  });

  it("uma linha fixa não mostra fórmula nenhuma", async () => {
    renderStudio("Orçamento");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /\+ Adicionar item/ }));
    expect(screen.queryByText(/mesas × /)).toBeNull();
    expect(screen.queryByText(/pessoas × /)).toBeNull();
  });
});

// ── A pré-visualização das fotos do documento ──────────────────────────────
describe("uma célula que não conseguiu desenhar a foto", () => {
  /**
   * O `jsdom` não descarrega imagens: um `new Image()` nunca dispara `load` nem
   * `error`. E o estúdio pré-carrega a URL nova antes de a trocar no ecrã (para
   * a célula não piscar), portanto SEM este duplo a troca nunca se observa e
   * este teste mediria o nada.
   */
  beforeEach(() => {
    class ImagemQueCarrega {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decoding = "";
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    vi.stubGlobal("Image", ImagemQueCarrega);
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Um rascunho com UMA foto no mood board e os dois URLs dela: o que se
   *  desenha (a miniatura) e o plano B (o original). */
  function seedComFoto() {
    seedDraft(1);
    localStorage.setItem(
      `${DRAFT_KEY}:meta`,
      JSON.stringify({
        urls: { "board/foto-0.jpg": "https://storage.test/mini.jpg" },
        originais: { "board/foto-0.jpg": "https://storage.test/original.jpg" },
      }),
    );
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O DEFEITO QUE ELA VIU: "Guardada, mas não foi possível pré-visualizar"
   * ════════════════════════════════════════════════════════════════════════
   *
   * As duas células que desenham fotos no estúdio guardavam "falhou" num
   * estado que ninguém voltava a limpar. Bastava UM erro — um URL assinado que
   * expirou, um instante sem rede, um service worker a servir uma resposta
   * estragada — para a célula ficar para sempre com aquela frase. A fotografia
   * estava lá e o URL seguinte estava bom; a célula é que já não olhava.
   *
   * E não havia plano B: uma miniatura que não existe (assinar um caminho no
   * Storage NÃO garante que o ficheiro lá está) dava a célula por perdida com
   * a fotografia inteira a um pedido de distância.
   *
   * Os dois testes abaixo são o defeito, um de cada vez.
   */

  /** A primeira célula de foto do documento, e o `<img>` lá dentro. */
  const imagemDaCapa = () =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"))
      .map((c) => c.querySelector("img"))
      .filter(Boolean)[0] as HTMLImageElement | undefined;

  const avisoDeFalha = () => screen.queryByText(/não foi possível pré-visualizar/i);

  it("tenta o ORIGINAL antes de desistir", async () => {
    seedComFoto();
    renderStudio();
    const img = await waitFor(() => {
      const i = imagemDaCapa();
      expect(i).toBeTruthy();
      return i!;
    });
    const primeiro = img.getAttribute("src");

    // A miniatura falha (é o caso de a derivada não existir no bucket).
    await act(async () => {
      img.dispatchEvent(new Event("error"));
    });

    // NÃO desiste: passa a pedir outro URL — o original.
    await waitFor(() => {
      const agora = imagemDaCapa();
      expect(agora, "a célula desistiu à primeira falha").toBeTruthy();
      expect(agora!.getAttribute("src")).not.toBe(primeiro);
    });
    expect(avisoDeFalha()).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS «VALORES ADICIONAIS» ENTRAM NO TOTAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «colocámos a deslocação da equipa Líquen, que são mil
 * quinhentos e cinquenta euros, e depois no total, naquela aba onde diz total
 * IVA e validade, isto não soma.»
 *
 * O que estava em jogo não era só o ecrã: este total é o PREÇO FINAL do pedido,
 * e é dele que saem o sinal de 30% e a factura. Uma deslocação escrita aqui
 * aparecia na proposta que o cliente lê e não entrava em nada do que se cobra.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P0 — O VALOR NÃO PODE MUDAR SOZINHO ENTRE VISITAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «ao voltar à mesma proposta, o valor total está diferente do
 * que estava». Numa proposta observada: 3.000 → 3.140 → 3.280 → 3.420, com uma
 * deslocação de 140 €. Três visitas, três somas. 3.420 − 3.000 = 3 × 140.
 *
 * ── A CAUSA ───────────────────────────────────────────────────────────────
 *
 * Com «estes valores somam-se» há dois números diferentes: o que ela escreve
 * (só os serviços) e o «Preço final (sem IVA)» do pedido (o que o casal paga,
 * serviços MAIS adicionais). Há duas conversões inversas para atravessar entre
 * eles — e a abertura do estúdio usava só uma. Punha o preço do pedido no
 * campo do escrito sem lhe tirar os adicionais, e a gravação seguinte
 * voltava a somá-los.
 *
 * ── O QUE ESTE BLOCO PRENDE ───────────────────────────────────────────────
 *
 * O que ela pediu, literalmente: abrir, gravar, recarregar dez vezes, e o
 * valor não mexer nem um cêntimo. Dez e não duas porque o defeito era de UM
 * cêntimo por volta em alguns arredondamentos e de 140 € noutros — e uma
 * acumulação lenta é a que passa despercebida durante meses.
 *
 * O valor que o utilizador introduz é IMUTÁVEL. Só muda quando ele o altera.
 */
describe("P0: o valor não muda sozinho entre visitas", () => {
  const desenhar = (preco: number | undefined) => {
    const r = render(
      <ToastProvider>
        <ProposalStudio quote={{ ...quote, quotedPrice: preco } as Quote} />
      </ToastProvider>,
    );
    // O valor e os adicionais vivem no passo do Orçamento.
    irAoPasso("Orçamento");
    return r;
  };

  /** O que está escrito no campo «Valor (sem IVA)» — o número DELA. */
  async function valorEscrito(): Promise<string> {
    return ((await screen.findByLabelText(/Valor \(sem IVA\)/i)) as HTMLInputElement).value;
  }

  /**
   * Abre, deixa assentar, fecha — e devolve o que ficou no campo e o último
   * preço que o estúdio mandou gravar no pedido. É uma VISITA.
   */
  async function umaVisita(precoDoPedido: number | undefined, gravados: number[]) {
    desenhar(precoDoPedido);
    await screen.findByLabelText(/Valor \(sem IVA\)/i);
    // O tempo de tudo assentar: a hidratação do rascunho, a sincronização do
    // preço e a gravação com a mão travada (600 ms).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    const escrito = await valorEscrito();
    cleanup();
    return { escrito, gravado: gravados.at(-1) ?? precoDoPedido };
  }

  /** Um `fetch` que guarda cada preço gravado e o devolve como o pedido novo. */
  function espiarGravacoes(gravados: number[]) {
    const original = global.fetch;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const corpo = String(init?.body ?? "");
      if (String(url).includes("/api/orcamento/") && corpo.includes("quotedPrice")) {
        const lido = JSON.parse(corpo) as { quotedPrice: number | null };
        if (typeof lido.quotedPrice === "number") gravados.push(lido.quotedPrice);
        return new Response(JSON.stringify({ ...quote, quotedPrice: lido.quotedPrice }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return original(url, init);
    }) as typeof fetch;
    return () => {
      global.fetch = original;
    };
  }

  /**
   * ── O CASO DELA, EXACTAMENTE ────────────────────────────────────────────
   * 3.000 de serviços, 140 de deslocação, «Somam ao valor». Dez visitas.
   */
  it("com os adicionais a SOMAREM, dez visitas não mexem um cêntimo", async () => {
    const gravados: number[] = [];
    const parar = espiarGravacoes(gravados);
    try {
      // Primeira visita: escreve o valor e a deslocação.
      desenhar(3000);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: /Adicionar valor adicional/i }));
      const campo = await screen.findByLabelText(/^Valor de /i);
      await user.type(campo, "140");
      await user.tab();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 700));
      });
      // O pedido leva o efectivo — serviços mais deslocação.
      expect(gravados.at(-1)).toBe(3140);
      expect(await valorEscrito()).toBe("3000");
      cleanup();

      // E agora dez visitas seguidas, cada uma a abrir com o preço que a
      // anterior deixou no pedido.
      let preco: number | undefined = gravados.at(-1);
      for (let volta = 1; volta <= 10; volta += 1) {
        const r = await umaVisita(preco, gravados);
        expect(r.escrito, `o valor escrito mudou na visita ${volta}`).toBe("3000");
        expect(r.gravado, `o preço do pedido mudou na visita ${volta}`).toBe(3140);
        preco = r.gravado;
      }
    } finally {
      parar();
    }
    // Onze montagens de um ecrã com onze mil linhas, cada uma com a mão
    // travada da gravação (600 ms) a assentar. Não cabe nos 5 s por omissão —
    // e a alternativa, relógios falsos, não convive com o `userEvent`.
  }, 60_000);

  /**
   * Com os adicionais DENTRO do valor escrito, as duas conversões não fazem
   * nada — e o valor tem de ficar igualmente parado. É o controlo do teste de
   * cima: prova que a estabilidade não vem de a conversão estar desligada.
   */
  it("com os adicionais DENTRO do valor, dez visitas também não mexem", async () => {
    const gravados: number[] = [];
    const parar = espiarGravacoes(gravados);
    try {
      desenhar(3000);
      const user = userEvent.setup();
      await user.selectOptions(
        await screen.findByLabelText(/Como contam os valores adicionais/i),
        "dentro",
      );
      await user.click(await screen.findByRole("button", { name: /Adicionar valor adicional/i }));
      const campo = await screen.findByLabelText(/^Valor de /i);
      await user.type(campo, "140");
      await user.tab();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 700));
      });
      const depoisDeEscrever = await valorEscrito();
      cleanup();

      let preco: number | undefined = gravados.at(-1);
      for (let volta = 1; volta <= 10; volta += 1) {
        const r = await umaVisita(preco, gravados);
        expect(r.escrito, `o valor escrito mudou na visita ${volta}`).toBe(depoisDeEscrever);
        preco = r.gravado;
      }
    } finally {
      parar();
    }
    // Onze montagens de um ecrã com onze mil linhas, cada uma com a mão
    // travada da gravação (600 ms) a assentar. Não cabe nos 5 s por omissão —
    // e a alternativa, relógios falsos, não convive com o `userEvent`.
  }, 60_000);

  /**
   * Trocar de modo de IVA muda o que o casal VÊ, nunca a base. E não pode
   * deixar rasto: dez visitas depois de a trocar, o valor continua o mesmo.
   */
  it("trocar o modo de IVA não move a base, e não deixa rasto nas visitas", async () => {
    const gravados: number[] = [];
    const parar = espiarGravacoes(gravados);
    try {
      desenhar(3000);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: /Adicionar valor adicional/i }));
      const campo = await screen.findByLabelText(/^Valor de /i);
      await user.type(campo, "140");
      await user.tab();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 700));
      });
      const antes = await valorEscrito();
      // Pelas OPÇÕES e não pelo rótulo: «IVA» aparece em vários sítios deste
      // ecrã, e o que interessa aqui é o único selector que decide entre
      // «acrescer» e «incluído».
      const seletorDeIva = [...document.querySelectorAll("select")].find((sel) =>
        [...sel.options].some((o) => o.value === "acrescer"),
      );
      expect(seletorDeIva, "não encontrei o selector do modo de IVA").toBeTruthy();
      await user.selectOptions(seletorDeIva!, "incluido");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 700));
      });
      expect(await valorEscrito(), "trocar o modo de IVA mexeu na base").toBe(antes);
      cleanup();

      let preco: number | undefined = gravados.at(-1);
      for (let volta = 1; volta <= 10; volta += 1) {
        const r = await umaVisita(preco, gravados);
        expect(r.escrito, `o valor escrito mudou na visita ${volta}`).toBe(antes);
        preco = r.gravado;
      }
    } finally {
      parar();
    }
    // Onze montagens de um ecrã com onze mil linhas, cada uma com a mão
    // travada da gravação (600 ms) a assentar. Não cabe nos 5 s por omissão —
    // e a alternativa, relógios falsos, não convive com o `userEvent`.
  }, 60_000);
});

describe("os valores adicionais somam ao total", () => {
  const comPreco = (preco?: number) => ({ ...quote, quotedPrice: preco }) as Quote;
  const desenhar = (q: Quote) => {
    const r = render(
      <ToastProvider>
        <ProposalStudio quote={q} />
      </ToastProvider>,
    );
    // O valor e os adicionais vivem no passo do Orçamento.
    irAoPasso("Orçamento");
    return r;
  };

  /**
   * O campo do valor de um adicional passou a ser NUMÉRICO e a normalizar-se ao
   * sair (`defaultValue` + `onBlur`, como o preço de uma linha): normalizar a
   * cada tecla apagava o que ela estava a escrever a meio. Escrever aqui é
   * portanto escrever E sair do campo.
   */
  async function escreverExtra(valor: string) {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Adicionar valor adicional/i }));
    const campo = await screen.findByLabelText(/^Valor de /i);
    await user.type(campo, valor);
    await user.tab();
    return user;
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «HÁ UM NÚMERO SÓ» ERA MENTIRA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «sempre que vou à proposta os valores estão diferentes; não
   * estão iguais àquilo que nós colocamos».
   *
   * Estava numa frase, por cima do campo: prometia que este valor e o «Preço
   * final» do pedido eram o MESMO número. Não são, sempre que há adicionais a
   * somar — o pedido guarda o que o casal PAGA (serviços + deslocação) e este
   * campo é só os SERVIÇOS, porque a deslocação tem linha própria e somá-la
   * aqui era contá-la duas vezes na mesma folha.
   *
   * Ela escrevia 3.000 na Gestão do pedido e o estúdio mostrava 2.860. Os dois
   * números estavam certos; o ecrã é que jurava que eram um só.
   */
  it("sem adicionais, continua a ser um número só — e diz isso", async () => {
    desenhar(comPreco(3000));
    expect(await screen.findByText(/Há um número só/i)).toBeInTheDocument();
  });

  it("com adicionais, deixa de prometer que são o mesmo, e mostra a conta", async () => {
    desenhar(comPreco(3000));
    await escreverExtra("140");

    // A promessa falsa desapareceu…
    await waitFor(() => expect(screen.queryByText(/Há um número só/i)).toBeNull());
    // …e no lugar dela está a conta, com os DOIS números à vista para ela
    // poder conferir num relance qual é qual.
    // O parágrafo INTEIRO, e não o `<strong>` que o `findByText` devolve: os
    // números vivem noutros filhos do mesmo parágrafo.
    const nota = (await screen.findByText(/só os serviços/i)).closest("p");
    expect(nota).not.toBeNull();
    expect(nota!.textContent).toMatch(/3000,00/);
    expect(nota!.textContent).toMatch(/140,00/);
    expect(nota!.textContent).toMatch(/3140,00/);
  });

  /**
   * ── ESTE BLOCO DESCREVE A REGRA ANTIGA, E CONTINUA A DESCREVÊ-LA ─────────
   *
   * Uma proposta NOVA nasce hoje com «o valor escrito é só dos serviços, estas
   * linhas somam-se» — foi o que a dona pediu, e está explicado no
   * `seedDefaults`. Neste modo, escrever um adicional NÃO mexe no campo do
   * valor: os 1.550 aparecem por baixo dos 6.875 e o total efectivo passa a
   * 8.425.
   *
   * A regra antiga continua a existir, e continua a ser escolhível: o valor
   * escrito JÁ INCLUI os adicionais, e por isso escrever um faz o campo subir
   * para os incluir. É isso que estes testes prendem, e por isso trocam
   * primeiro o selector. Sem esta troca, estariam a medir uma regra que já não
   * é a de partida — e o teste seguinte, esse, mede a nova.
   */
  async function comOsAdicionaisDentroDoValor() {
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByLabelText(/Como contam os valores adicionais/i),
      "dentro",
    );
  }

  it("com os adicionais DENTRO do valor, escrever 1550 leva o campo de 6875 a 8425", async () => {
    desenhar(comPreco(6875));
    // A troca vem ANTES de escrever: o selector diz como LER o valor escrito,
    // não reinterpreta o que já foi escrito com a outra regra.
    await comOsAdicionaisDentroDoValor();
    await escreverExtra("1550");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
  });

  it("com os adicionais a somarem, o PREÇO FINAL do pedido leva-os", async () => {
    /**
     * ── A PEÇA QUE FALTAVA, E SEM ELA A MUDANÇA ESTRAGAVA OS NÚMEROS ───────
     *
     * O «Preço final (sem IVA)» do pedido é de onde a Visão Geral, as
     * Estatísticas e o dossier leem o dinheiro dos pedidos que ainda não têm
     * proposta enviada. Com os adicionais a somarem, o campo do estúdio passa a
     * ser só os SERVIÇOS — e se fosse esse número a ir para o pedido, as
     * deslocações desapareciam desses ecrãs em silêncio.
     *
     * Por isso o que viaja para o pedido é o efectivo: 6875 + 1550 = 8425.
     */
    const gravados: number[] = [];
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const corpo = String(init?.body ?? "");
      if (String(url).includes("/api/orcamento/") && corpo.includes("quotedPrice")) {
        const lido = JSON.parse(corpo) as { quotedPrice: number | null };
        if (typeof lido.quotedPrice === "number") gravados.push(lido.quotedPrice);
        return new Response(JSON.stringify({ ...quote, quotedPrice: lido.quotedPrice }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    }) as typeof fetch;

    try {
      desenhar(comPreco(6875));
      await escreverExtra("1550");
      await waitFor(() => expect(gravados.at(-1)).toBe(8425), { timeout: 3000 });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("por omissão, os 1550 somam-se: o campo fica nos 6875 e o total vai a 8425", async () => {
    // A regra que ela pediu, e que uma proposta nova passa a ter de partida:
    // «não quero que a parte dos serviços apareça como base somada à
    // deslocação; quero que seja três mil mais a deslocação».
    desenhar(comPreco(6875));
    await escreverExtra("1550");
    // O campo do preço não mexe: continua a ser o dos SERVIÇOS.
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("6875");
    // E o quadro de totais soma os dois: 6875 de serviços mais 1550 da linha
    // dão 8425 sem IVA, que é a conta que ela quer ver.
    // `findAllByText`: estes números aparecem em mais do que um sítio do ecrã
    // de propósito (o quadro de totais e a barra do fundo dizem o mesmo), e o
    // que se está a afirmar é que aparecem, não que aparecem uma só vez.
    expect((await screen.findAllByText(/6875,00/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/1550,00/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/8425,00/)).length).toBeGreaterThan(0);
  });

  /**
   * A razão de a conta ser feita pela DIFERENÇA e não pelo valor inteiro:
   * escrever «1550» são quatro teclas, e quatro somas do valor inteiro davam um
   * total absurdo. Este teste é o que garante que a tecla a tecla converge.
   */
  it("escrever tecla a tecla não soma quatro vezes", async () => {
    desenhar(comPreco(1000));
    // Este caso descreve a regra em que o valor escrito JÁ INCLUI os
    // adicionais, e por isso troca o selector antes de escrever.
    await comOsAdicionaisDentroDoValor();
    await escreverExtra("100");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("1100");
  });

  /**
   * Apagar um adicional TIRA-O do total — e portanto do sinal e da fatura. Por
   * isso passou a pedir confirmação com os dois números à vista, como o «Usar
   * X €»: era o mesmo estrago atrás de um «×» de doze pixéis.
   */
  it("apagar o valor adicional devolve o total ao que era — depois de confirmar", async () => {
    desenhar(comPreco(6875));
    // Este caso descreve a regra em que o valor escrito JÁ INCLUI os
    // adicionais, e por isso troca o selector antes de escrever.
    await comOsAdicionaisDentroDoValor();
    const user = await escreverExtra("1550");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
    await user.click(await screen.findByRole("button", { name: /Remover linha adicional/i }));
    // A pergunta traz os DOIS valores, e o total ainda não mudou.
    const pergunta = await screen.findByText(/Substituir o total de/i);
    expect(pergunta.textContent).toMatch(/8\s?425,00/);
    expect(pergunta.textContent).toMatch(/6\s?875,00/);
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
    await user.click(await screen.findByRole("button", { name: /^Substituir$/ }));
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("6875");
  });

  it("e cancelar deixa o total exactamente como estava", async () => {
    desenhar(comPreco(6875));
    // Este caso descreve a regra em que o valor escrito JÁ INCLUI os
    // adicionais, e por isso troca o selector antes de escrever.
    await comOsAdicionaisDentroDoValor();
    const user = await escreverExtra("1550");
    await user.click(await screen.findByRole("button", { name: /Remover linha adicional/i }));
    await user.click(await screen.findByRole("button", { name: /^Cancelar$/ }));
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
    expect(screen.queryByText(/Substituir o total de/i)).toBeNull();
  });

  it("um valor sem número («a definir») não mexe no total", async () => {
    desenhar(comPreco(6875));
    await escreverExtra("a definir");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("6875");
  });

  /**
   * O «Somado ao total: X» saiu daqui: era a terceira soma no mesmo ecrã. A
   * conta continua à vista, agora no BLOCO DE TOTAIS, na linha que o PDF também
   * imprime — e é a mesma `totaisDaProposta` a dizê-la nos dois sítios.
   */
  it("a conta fica à vista no bloco de totais, não numa segunda soma", async () => {
    desenhar(comPreco(6875));
    await escreverExtra("1550");
    expect(screen.queryByText(/Somado ao total:/i)).toBeNull();
    // A do bloco de totais é a que está num `dt` — a outra é o cabeçalho da
    // secção onde os adicionais se escrevem.
    const bloco = (await screen.findByText("Totais")).parentElement!;
    expect(within(bloco).getByText("Valores adicionais").nextElementSibling?.textContent).toMatch(
      /1\s?550,00/,
    );
  });

  it("e chega ao PREÇO FINAL do pedido — é dele que sai a fatura", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    desenhar(comPreco(6875));
    // Este caso descreve a regra em que o valor escrito JÁ INCLUI os
    // adicionais, e por isso troca o selector antes de escrever.
    await comOsAdicionaisDentroDoValor();
    await escreverExtra("1550");
    await vi.advanceTimersByTimeAsync(800);
    const gravacoes = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      // O histórico do pedido também entra por PATCH (`activityLogAppend`); o
      // que este teste verifica é a gravação do PREÇO.
      .filter(([, init]) => String(init?.body).includes("quotedPrice"));
    expect(JSON.parse(String(gravacoes.at(-1)?.[1]?.body))).toMatchObject({ quotedPrice: 8425 });
    vi.useRealTimers();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ENVIADA» SÓ QUANDO FOI MESMO ENVIADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um pedido sem email de cliente válido devolvia 200 com `emailed:false` — e o
 * ecrã mostrava um aviso cinzento, marcava o passo como «Proposta enviada ✓» e
 * seguia. Ela ficava convencida de que tinha ido; o casal não recebia nada.
 *
 * É, ao pé da letra, «não dá para mandar a proposta para o cliente» — e da pior
 * maneira, porque nem sequer parecia falhar.
 */
describe("o envio não se dá por feito quando o email não saiu", () => {
  const comPreco = (preco?: number) => ({ ...quote, quotedPrice: preco }) as Quote;

  function desenhar(q: Quote) {
    return render(
      <ToastProvider>
        <ProposalStudio quote={q} />
      </ToastProvider>,
    );
  }

  it("diz que o email NÃO saiu, e não dá o passo por feito", async () => {
    propostaDoc = reply({
      json: {
        ok: true,
        emailed: false,
        emailError: "O pedido não tem um email de cliente válido.",
        missingImages: 0,
        truncations: [],
      },
    });
    // Uma proposta que PODE sair: o que este teste mede é o que acontece
    // quando o servidor diz que o email não foi entregue, e para lá chegar é
    // preciso passar primeiro pelo que impede uma proposta incompleta de sair.
    seedDraft(1);
    desenhar(comPreco(3000));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent ?? "").toMatch(/email de cliente válido/i);
    // E o passo NÃO fica dado por feito: o botão continua lá para ela poder
    // corrigir o contacto e enviar a sério.
    expect(screen.queryByText(/Proposta enviada ✓/)).toBeNull();
  });
});

/**
 * Cada falha do envio tinha a MESMA frase de oito palavras, e a pior delas — o
 * tempo esgotado — nem sequer traz corpo na resposta para se poder explicar.
 */
describe("porqueFalhouOEnvio", () => {
  it("o tempo esgotado diz que demorou demais E o que fazer", () => {
    for (const status of [504, 502, 408]) {
      const frase = porqueFalhouOEnvio(status);
      expect(frase, String(status)).toMatch(/demor/i);
      expect(frase, String(status)).toMatch(/fotografias|fotos/i);
    }
  });

  it("a sessão expirada tranquiliza sobre o rascunho", () => {
    expect(porqueFalhouOEnvio(401)).toMatch(/rascunho está guardado/i);
  });

  it("e o que não se conhece leva o número, para se poder procurar", () => {
    expect(porqueFalhouOEnvio(500)).toContain("500");
  });

  it("nenhuma das frases é a antiga de oito palavras", () => {
    for (const status of [504, 401, 413, 503]) {
      expect(porqueFalhouOEnvio(status)).not.toBe("Não foi possível enviar a proposta.");
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O NÚMERO É UM SÓ — E O RASCUNHO DO SERVIDOR NÃO PODE DESFAZÊ-LO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O percurso: ela corrige o preço final de 8.100 para 9.400 na Gestão do
 * pedido, sai, volta ao estúdio, e o campo volta sozinho a 8.100. Envia, e a
 * correcção desaparece dos dois lados.
 *
 * A corrida: o valor do PEDIDO é aplicado ao montar; o rascunho do servidor
 * chega 100–300 ms depois e reescreve `totalAmount`. E ganha quase sempre,
 * porque o carimbo local é escrito ANTES do PUT e o `updatedAt` do servidor
 * DEPOIS — a comparação de datas está sempre a favor do servidor.
 */
describe("o preço do pedido sobrevive ao rascunho do servidor", () => {
  /** Um rascunho de servidor com um valor JÁ ULTRAPASSADO lá dentro. */
  function rascunhoComValorVelho() {
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: {
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        // Marca para se saber que o rascunho do servidor JÁ chegou.
        location: "Herdade do Servidor",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 8100,
        totalVatMode: "acrescer",
        totalText: "8100,00 € + IVA",
        totalLabel: "Valor Total Decoração",
      },
    };
  }

  const comPrecoCorrigido = { ...quote, quotedPrice: 9400 } as Quote;

  const renderComPreco = () =>
    render(
      <ToastProvider>
        <ProposalStudio quote={comPrecoCorrigido} />
      </ToastProvider>,
    );

  it("o campo do valor continua a dizer o que a Gestão do pedido diz", async () => {
    rascunhoComValorVelho();
    renderComPreco();
    // Esperar que o rascunho do servidor tenha MESMO chegado — senão o teste
    // passava por não ter havido corrida nenhuma.
    await screen.findByDisplayValue("Herdade do Servidor");
    expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("9400");
  });

  it("e o documento que se grava leva o valor corrigido, não o do rascunho", async () => {
    rascunhoComValorVelho();
    renderComPreco();
    await screen.findByDisplayValue("Herdade do Servidor");
    // 8100 + IVA são 9963; 9400 + IVA são 11562. É pelo valor do documento que
    // se vê qual dos dois ficou.
    await waitFor(() => {
      const gravados = corpos("proposta-rascunho");
      expect(gravados.length).toBeGreaterThan(0);
      expect(gravados[gravados.length - 1]).toContain('"totalAmount":9400');
    });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UM PEDIDO SEM PREÇO E UMA PROPOSTA COM ELE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A abertura tem um ramo para isto — «o pedido ainda não tem preço mas o
 * rascunho tem um valor escrito; adopta-se, e GRAVA-SE no pedido» — e ele lia
 * `totalInput`, que naquele instante é SEMPRE a cadeia vazia: começa vazio e o
 * `setTotalInput` da linha de cima só entra em vigor na render seguinte.
 *
 * Ou seja, nunca gravou nada. O pedido continuava sem dinheiro nenhum na Visão
 * Geral, no Kanban e no dossier, com a proposta escrita ao lado a dizer o
 * contrário.
 */
describe("o rascunho leva o preço ao pedido que ainda não o tem", () => {
  function precosNoPedido(): unknown[] {
    return corpos(`/api/orcamento/${quote.id}`, "PATCH")
      .map((b) => {
        try {
          return (JSON.parse(b) as { quotedPrice?: unknown }).quotedPrice;
        } catch {
          return undefined;
        }
      })
      .filter((v) => v !== undefined);
  }

  it("e leva o que o casal paga, com os adicionais somados", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        location: "Évora",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        budgetExtras: [{ label: "Deslocação equipa Líquen", valueText: "895,00 €" }],
        budgetExtrasSomam: true,
        totalAmount: 9883.74,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
    // O pedido não tem «Preço final» nenhum.
    render(
      <ToastProvider>
        <ProposalStudio quote={{ ...quote } as Quote} />
      </ToastProvider>,
    );
    await screen.findByDisplayValue("Évora");
    // 9.883,74 de serviços + 895,00 de deslocação.
    await waitFor(() => expect(precosNoPedido()).toContain(10778.74), { timeout: 3000 });
  }, 20_000);

  /**
   * ── E ADOPTAR O PREÇO NÃO PODE APAGAR O ECRÃ ──────────────────────────
   *
   * O ramo de cima chama `persistirPreco`, e `persistirPreco` marca 10.778,74
   * como «enviado por mim». Só que o PATCH volta 600 ms depois: na montagem, o
   * `quote.quotedPrice` ainda está por preencher.
   *
   * A sincronização que ouve o pedido usava esse mesmo carimbo como detector
   * de mudança. Lia `undefined ≠ 10.778,74`, concluía que o preço tinha sido
   * APAGADO na Gestão do pedido, e limpava o total: `setTotalInput("")` e
   * `totalAmount: undefined`. O campo ficava em branco.
   *
   * Com rede, voltava quando a resposta chegasse — um piscar. SEM rede, ficava
   * em branco, e era o branco que o rascunho seguinte gravava: o valor dela
   * desaparecia por não haver rede. É a regra da casa ao contrário («se
   * falhar, não perder trabalho»), e por isso tem caso próprio.
   */
  it("e o valor não desaparece do campo enquanto o pedido não responde", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        location: "Évora",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        budgetExtras: [{ label: "Deslocação equipa Líquen", valueText: "895,00 €" }],
        budgetExtrasSomam: true,
        totalAmount: 9883.74,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
    render(
      <ToastProvider>
        <ProposalStudio quote={{ ...quote } as Quote} />
      </ToastProvider>,
    );
    await screen.findByDisplayValue("Évora");
    const campo = (await screen.findByLabelText(/Valor \(sem IVA\)/)) as HTMLInputElement;
    expect(campo.value).toBe("9883,74");
    // E continua lá depois de o PATCH ter tido tempo de ir e não voltar: é o
    // caso da rede em baixo, que é onde isto doía.
    await waitFor(() => expect(precosNoPedido()).toContain(10778.74), { timeout: 3000 });
    expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("9883,74");
  }, 20_000);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SEGUIU PARA O CLIENTE TEM DE APARECER ESCRITO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre uma proposta já enviada: «eu quero igual o valor!!! até
 * eu alterar por mim!».
 *
 * As contas que faziam o número mexer sozinho estão corrigidas. Isto é a REDE
 * por baixo delas: o estúdio nunca olhava para o documento que SEGUIU. O que
 * reabria era o rascunho deste aparelho com o «Preço final» do pedido por
 * cima — dois números que nada obriga a continuar iguais ao terceiro, o que o
 * casal recebeu.
 *
 * O caso real, ao cêntimo: o PDF dizia 13.257,85 € a pagar e a proposta
 * reabria a dizer 15.090,55 €.
 */
describe("a proposta enviada e o que está no aparelho", () => {
  /** A proposta tal como seguiu: 9.883,74 de serviços + 895,00 de deslocação,
   *  13.257,85 € a pagar. */
  function jaSeguiuPor13257() {
    versoesServidor = [
      {
        id: "v1",
        enviadaEm: "2026-06-01T10:00:00.000Z",
        total: 13257.85,
        estado: "enviada",
        mudancas: [],
        resumo: "Primeira versão enviada",
      },
    ];
    docsDeVersao.v1 = {
      template: "decoracao",
      ref: "PO Decoração",
      clientNames: "Maria & Zé",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2026",
      location: "Évora",
      guests: "80 pax",
      serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
      moodBoards: [],
      budgetItems: [],
      coverImages: ["", ""],
      budgetExtras: [{ label: "Deslocação equipa Líquen", valueText: "895,00 €" }],
      budgetExtrasSomam: true,
      totalAmount: 9883.74,
      totalVatMode: "acrescer",
      totalLabel: "Valor Total Decoração",
    };
  }

  /** Os `quotedPrice` que foram gravados no pedido, pela ordem. */
  function precosNoPedido(): unknown[] {
    return corpos(`/api/orcamento/${quote.id}`, "PATCH")
      .map((b) => {
        try {
          return (JSON.parse(b) as { quotedPrice?: unknown }).quotedPrice;
        } catch {
          return undefined;
        }
      })
      .filter((v) => v !== undefined);
  }

  /**
   * O pedido ficou com um número que não é o que seguiu, e NINGUÉM mexeu no
   * preço depois do envio — o histórico do pedido não tem `price_set` nenhum
   * posterior a 1 de junho. Ou seja: o número mexeu-se sozinho. É esta a
   * situação que ela viu, e é a que se resolve sem lhe perguntar nada.
   */
  const abrirDesalinhado = () =>
    render(
      <ToastProvider>
        <ProposalStudio quote={{ ...quote, quotedPrice: 12268.74 } as Quote} />
      </ToastProvider>,
    );

  /**
   * A MESMA diferença, com uma causa diferente: ela corrigiu o preço de
   * propósito DEPOIS de a proposta ter saído, e isso ficou escrito no histórico
   * do pedido. Aqui repor por cima apagava trabalho dela — e é o único caso em
   * que os dois números vão ao ecrã com a escolha.
   */
  const abrirDepoisDeElaMudar = () =>
    render(
      <ToastProvider>
        <ProposalStudio
          quote={
            {
              ...quote,
              quotedPrice: 12268.74,
              activityLog: [
                {
                  id: "a1",
                  at: "2026-06-14T09:00:00.000Z",
                  kind: "price_set",
                  summary: "Preço final alterado para 12.268,74 €.",
                },
              ],
            } as Quote
          }
        />
      </ToastProvider>,
    );

  /**
   * ══════════════════════════════════════════════════════════════════════
   * O QUE SE MEXEU SOZINHO VOLTA SOZINHO
   * ══════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «eu quero que o valor enviado para o cliente seja o valor
   * que fica na proposta (…). ISTO É SIMPLES, O VALOR NÃO ALTERA CASO EU NÃO
   * MUDO».
   *
   * Isto punha os dois números no ecrã e esperava por ela. A razão escrita era
   * boa — duas causas dão a mesma diferença — mas obrigava-a a escolher entre
   * um valor certo e um avariado, de cada vez que abria a proposta. Sem
   * `price_set` no histórico depois do envio, não há dúvida nenhuma a ter.
   */
  it("sem ninguém ter mexido no preço, o valor volta ao que o cliente recebeu — sozinho", async () => {
    jaSeguiuPor13257();
    abrirDesalinhado();
    // Abre a 12.268,74 (o número avariado) e assenta no 9.883,74 do envio.
    await waitFor(
      () =>
        expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe(
          "9883,74",
        ),
      { timeout: 3000 },
    );
    // E o «Preço final» do pedido volta com ele: 9.883,74 + 895,00 de deslocação.
    await waitFor(() => expect(precosNoPedido()).toContain(10778.74), { timeout: 3000 });
  }, 20_000);

  it("e não lhe pergunta nada — não há aviso a pedir para escolher", async () => {
    jaSeguiuPor13257();
    abrirDesalinhado();
    await waitFor(
      () =>
        expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe(
          "9883,74",
        ),
      { timeout: 3000 },
    );
    expect(screen.queryByRole("alert", { name: /não é o que seguiu para o cliente/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Repor os valores que seguiram/ })).toBeNull();
  }, 20_000);

  /**
   * Mas não é silencioso: a regra da casa é que ela nunca fica sem saber que
   * algo aconteceu. O aviso diz o que mudou e deixa dez segundos para anular.
   */
  it("mas diz-lhe o que fez, e deixa-lhe dez segundos para anular", async () => {
    jaSeguiuPor13257();
    abrirDesalinhado();
    await waitFor(
      () =>
        expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe(
          "9883,74",
        ),
      { timeout: 3000 },
    );
    expect(document.body.textContent).toMatch(/voltaram ao que seguiu para o cliente/i);
    expect(await screen.findByRole("button", { name: /Anular/i })).toBeTruthy();
  }, 20_000);

  it("os dois números aparecem lado a lado, com a data do envio", async () => {
    jaSeguiuPor13257();
    abrirDepoisDeElaMudar();
    const aviso = await screen.findByRole("alert", { name: /não é o que seguiu para o cliente/i });
    expect(aviso.textContent).toContain("já seguiu para o cliente");
    expect(aviso.textContent).toContain("1 de junho de 2026");
    // O que ele recebeu…
    expect(aviso.textContent).toContain(eur(13257.85));
    // …e o que este ecrã mostra.
    expect(aviso.textContent).toContain(eur(15090.55));
  });

  /**
   * NENHUM DOS DOIS GANHA SOZINHO. Uma correcção de preço feita de propósito
   * depois do envio produz exactamente esta mesma diferença, e o código não as
   * distingue — escolher por ela apagava trabalho em metade dos casos, em
   * silêncio nos dois.
   */
  it("e nada muda enquanto ela não escolher", async () => {
    jaSeguiuPor13257();
    abrirDepoisDeElaMudar();
    await screen.findByRole("alert", { name: /não é o que seguiu para o cliente/i });
    expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("12268,74");
    // E o documento que seguiu não entrou no que está gravado: a conferência
    // lê, escreve o que encontrou, e não mexe em nada.
    expect(corpos("proposta-rascunho").join("")).not.toContain('"totalAmount":9883.74');
  });

  it("repor põe no ecrã os valores que o cliente recebeu", async () => {
    jaSeguiuPor13257();
    abrirDepoisDeElaMudar();
    await screen.findByRole("alert", { name: /não é o que seguiu para o cliente/i });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Repor os valores que seguiram/ }));

    await waitFor(() => {
      expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe(
        "9883,74",
      );
    });
    expect(document.body.textContent).toContain(eur(13257.85));
    // E o «Preço final» do pedido volta ao que o casal paga: 9.883,74 + 895,00.
    await waitFor(() => expect(precosNoPedido()).toContain(10778.74));
    // O aviso sai do ecrã: já não há divergência nenhuma para mostrar.
    expect(screen.queryByRole("alert", { name: /não é o que seguiu para o cliente/i })).toBeNull();
  }, 20_000);

  it("e repor mexe só nos valores — o texto fica como estava", async () => {
    jaSeguiuPor13257();
    // O rascunho deste aparelho tem um local escrito DEPOIS do envio.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        location: "Herdade da Malhadinha, Albernoa",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        budgetExtras: [{ label: "Deslocação equipa Líquen", valueText: "895,00 €" }],
        budgetExtrasSomam: true,
        totalAmount: 11373.74,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
    abrirDepoisDeElaMudar();
    await screen.findByRole("alert", { name: /não é o que seguiu para o cliente/i });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Repor os valores que seguiram/ }));
    await waitFor(() => {
      expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe(
        "9883,74",
      );
    });
    // O documento que seguiu dizia «Évora». O que ela escreveu depois FICA.
    expect(screen.getByDisplayValue("Herdade da Malhadinha, Albernoa")).toBeTruthy();
  }, 20_000);

  it("«manter» fica com o do aparelho, e não volta a perguntar o mesmo", async () => {
    jaSeguiuPor13257();
    abrirDepoisDeElaMudar();
    await screen.findByRole("alert", { name: /não é o que seguiu para o cliente/i });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Manter os deste aparelho/ }));
    expect(screen.queryByRole("alert", { name: /não é o que seguiu para o cliente/i })).toBeNull();
    expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("12268,74");
    cleanup();

    // A visita seguinte, com o MESMO número: já foi respondida.
    abrirDepoisDeElaMudar();
    await screen.findByLabelText(/Valor \(sem IVA\)/);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.queryByRole("alert", { name: /não é o que seguiu para o cliente/i })).toBeNull();
  }, 20_000);

  it("quando bate certo, não há aviso nenhum nem leitura a mais", async () => {
    jaSeguiuPor13257();
    // O pedido guarda o que o casal paga sem IVA: 10.778,74. 13.257,85 com IVA.
    render(
      <ToastProvider>
        <ProposalStudio quote={{ ...quote, quotedPrice: 10778.74 } as Quote} />
      </ToastProvider>,
    );
    await screen.findByLabelText(/Valor \(sem IVA\)/);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.queryByRole("alert", { name: /não é o que seguiu para o cliente/i })).toBeNull();
  });

  it("uma proposta que nunca foi enviada não tem com que se comparar", async () => {
    versoesServidor = [];
    abrirDesalinhado();
    await screen.findByLabelText(/Valor \(sem IVA\)/);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.queryByRole("alert", { name: /não é o que seguiu para o cliente/i })).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TROCAR «COMO CONTAM OS ADICIONAIS» É MEXER NO DINHEIRO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O selector decide se os 140 € da deslocação estão DENTRO do valor escrito ou
 * se lhe SOMAM — ou seja, decide se o casal paga 3.000 ou 3.140. A frase por
 * baixo dele diz exactamente isso, com os números.
 *
 * E não gravava nada no pedido. O estúdio passava a dizer um número e o
 * «Preço final» continuava com o outro, sem nada no ecrã a dizê-lo — até à
 * abertura seguinte, em que o pedido é quem manda e o total saltava sozinho o
 * valor inteiro dos adicionais. É «o valor está diferente do que enviámos»,
 * pela porta do lado.
 */
describe("trocar o modo dos adicionais grava o preço no pedido", () => {
  /** Os `quotedPrice` que foram gravados no pedido, pela ordem. */
  function precosGravadosNoPedido(): unknown[] {
    return corpos(`/api/orcamento/${quote.id}`, "PATCH")
      .map((b) => {
        try {
          return (JSON.parse(b) as { quotedPrice?: unknown }).quotedPrice;
        } catch {
          return undefined;
        }
      })
      .filter((v) => v !== undefined);
  }

  async function comDeslocacaoDe140() {
    render(
      <ToastProvider>
        <ProposalStudio quote={{ ...quote, quotedPrice: 3000 } as Quote} />
      </ToastProvider>,
    );
    irAoPasso("Orçamento");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Adicionar valor adicional/i }));
    const campo = await screen.findByLabelText(/^Valor de /i);
    await user.type(campo, "140");
    await user.tab();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    // O ponto de partida: «Somam ao valor», e o pedido já leva os 3.140.
    expect(precosGravadosNoPedido().at(-1)).toBe(3140);
    return user;
  }

  it("passar a «já incluídas» faz o pedido descer para o que o casal paga", async () => {
    const user = await comDeslocacaoDe140();
    await user.selectOptions(
      await screen.findByLabelText(/Como contam os valores adicionais/i),
      "dentro",
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    // O campo do escrito não mexe: continua a dizer 3.000. O que muda é o que
    // o casal paga — e é isso que o pedido guarda.
    expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("3000");
    expect(precosGravadosNoPedido().at(-1)).toBe(3000);
  }, 20_000);

  it("e voltar a «somam» devolve-lhe a deslocação", async () => {
    const user = await comDeslocacaoDe140();
    const seletor = await screen.findByLabelText(/Como contam os valores adicionais/i);
    await user.selectOptions(seletor, "dentro");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    await user.selectOptions(seletor, "somam");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(precosGravadosNoPedido().at(-1)).toBe(3140);
  }, 20_000);

  /**
   * E o que isto vale, ao pé da letra: trocar o modo e voltar amanhã não move
   * o total. Sem a gravação, a visita seguinte abria com o pedido a dizer
   * 3.140 e o documento a dizer «já incluídas» — total 3.140 em vez de 3.000.
   */
  it("e a visita seguinte mostra o mesmo total", async () => {
    const user = await comDeslocacaoDe140();
    await user.selectOptions(
      await screen.findByLabelText(/Como contam os valores adicionais/i),
      "dentro",
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    const aPagar = eur(3000 * 1.23);
    expect(document.body.textContent).toContain(aPagar);
    const preco = precosGravadosNoPedido().at(-1) as number;
    cleanup();

    render(
      <ToastProvider>
        <ProposalStudio quote={{ ...quote, quotedPrice: preco } as Quote} />
      </ToastProvider>,
    );
    await screen.findByLabelText(/Valor \(sem IVA\)/);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(document.body.textContent).toContain(aPagar);
  }, 30_000);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ABRIR NO TELEMÓVEL SOMAVA A DESLOCAÇÃO OUTRA VEZ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre uma proposta JÁ ENVIADA: «eu quero igual o valor!!! até
 * eu alterar por mim!».
 *
 * O PDF que seguiu dizia:
 *
 *     Subtotal dos serviços        9.883,74 €
 *     Deslocação equipa Líquen     +  895,00 €
 *     TOTAL (sem IVA)             10.778,74 €
 *     Total a pagar               13.257,85 €
 *
 * ── A MECÂNICA ────────────────────────────────────────────────────────────
 *
 * Há DOIS efeitos de abertura, e só um sabia a conversão. A montagem punha o
 * «Preço final» do pedido no campo do escrito depois de lhe TIRAR os
 * adicionais (`baseParaOEstudio`). O merge do rascunho do SERVIDOR, 100-300 ms
 * depois, punha lá o mesmo número em CRU — e `dinheiroDaProposta` voltava a
 * somar-lhe a deslocação por baixo.
 *
 * O salto é exactamente o valor dos adicionais, e é redondo por construção.
 *
 * E o caminho não é raro: é o de sempre. O carimbo local é escrito ANTES do
 * PUT e o `updatedAt` do servidor DEPOIS — a comparação de datas está
 * estruturalmente a favor do servidor —, e é também o do telemóvel que abre
 * dias depois sem rascunho nenhum guardado.
 */
describe("o rascunho do servidor não soma os adicionais outra vez", () => {
  /** O documento tal como seguiu: 9.883,74 de serviços e 895,00 de deslocação. */
  function rascunhoComoSeguiu() {
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: {
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Herdade do Servidor",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        budgetExtras: [{ label: "Deslocação equipa Líquen", valueText: "895,00 €" }],
        budgetExtrasSomam: true,
        totalAmount: 9883.74,
        totalVatMode: "acrescer",
        totalText: "9.883,74 € + IVA",
        totalLabel: "Valor Total Decoração",
      },
    };
  }

  /** O «Preço final (sem IVA)» do pedido é o que o casal paga: serviços MAIS
   *  deslocação. É o número que a rota do envio lá gravou (`money.base`). */
  const comOPrecoQueSeguiu = { ...quote, quotedPrice: 10778.74 } as Quote;

  const abrir = () =>
    render(
      <ToastProvider>
        <ProposalStudio quote={comOPrecoQueSeguiu} />
      </ToastProvider>,
    );

  it("o campo do valor continua a dizer só os serviços", async () => {
    rascunhoComoSeguiu();
    abrir();
    // O rascunho do servidor TEM de ter chegado — senão o teste passava por
    // não ter havido merge nenhum.
    await screen.findByDisplayValue("Herdade do Servidor");
    expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("9883,74");
  });

  it("e o total a pagar é o que o casal recebeu, ao cêntimo", async () => {
    rascunhoComoSeguiu();
    abrir();
    await screen.findByDisplayValue("Herdade do Servidor");
    // 10.778,74 + 23% = 13.257,85. O defeito dava 12.268,74 + IVA = 15.090,55.
    await waitFor(() => {
      expect(document.body.textContent).toContain(eur(13257.85));
    });
    expect(document.body.textContent).not.toContain(eur(15090.55));
  });

  /**
   * ── E NÃO ESCALA ────────────────────────────────────────────────────────
   *
   * O defeito não parava numa soma: o número inflacionado ficava no
   * `totalAmount` do rascunho gravado a seguir, e ia para o servidor. A visita
   * seguinte partia de lá e somava outra vez. Três visitas, três deslocações.
   *
   * Cada volta aqui é uma abertura a sério: o rascunho que a anterior GRAVOU
   * passa a ser o do servidor, e o preço que ela mandou para o pedido passa a
   * ser o `quotedPrice` com que o estúdio abre. É a cadeia real.
   */
  it("e três aberturas seguidas não movem um cêntimo", async () => {
    const gravados: number[] = [];
    const original = global.fetch;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const corpo = String(init?.body ?? "");
      if (String(url).includes("/api/orcamento/") && corpo.includes("quotedPrice")) {
        const lido = JSON.parse(corpo) as { quotedPrice: number | null };
        if (typeof lido.quotedPrice === "number") gravados.push(lido.quotedPrice);
        return new Response(JSON.stringify({ ...quote, quotedPrice: lido.quotedPrice }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return original(url, init);
    }) as typeof fetch;
    try {
      rascunhoComoSeguiu();
      let preco = 10778.74;
      for (let volta = 1; volta <= 3; volta += 1) {
        // O telemóvel não tem rascunho local nenhum: quem manda é o do
        // servidor. É o caso «envia no computador, abre no telemóvel».
        localStorage.clear();
        render(
          <ToastProvider>
            <ProposalStudio quote={{ ...quote, quotedPrice: preco } as Quote} />
          </ToastProvider>,
        );
        await screen.findByDisplayValue("Herdade do Servidor");
        await act(async () => {
          await new Promise((r) => setTimeout(r, 700));
        });
        expect(
          (screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value,
          `o valor escrito mudou na visita ${volta}`,
        ).toBe("9883,74");
        expect(document.body.textContent, `o total a pagar mudou na visita ${volta}`).toContain(
          eur(13257.85),
        );
        // O que este ecrã gravou passa a ser o rascunho do servidor e o preço
        // do pedido da visita seguinte.
        const ultimo = corpos("proposta-rascunho").at(-1);
        if (ultimo) {
          rascunhoServidor = {
            updatedAt: new Date().toISOString(),
            doc: (JSON.parse(ultimo) as { doc: Record<string, unknown> }).doc,
          };
        }
        preco = gravados.at(-1) ?? preco;
        expect(preco, `o preço do pedido mudou na visita ${volta}`).toBeCloseTo(10778.74, 2);
        cleanup();
      }
    } finally {
      global.fetch = original;
    }
    // Três montagens de um ecrã com doze mil linhas, cada uma com a mão travada
    // da gravação (600 ms) a assentar.
  }, 60_000);

  it("e o documento gravado leva a base sem a deslocação lá dentro", async () => {
    rascunhoComoSeguiu();
    abrir();
    await screen.findByDisplayValue("Herdade do Servidor");
    await waitFor(() => {
      const gravados = corpos("proposta-rascunho");
      expect(gravados.length).toBeGreaterThan(0);
      expect(gravados[gravados.length - 1]).toContain('"totalAmount":9883.74');
    });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REPOR UMA VERSÃO E COPIAR UMA PROPOSTA TAMBÉM MEXEM NO PREÇO DO PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Escrever no campo do valor GRAVA no pedido — é a promessa escrita ao lado do
 * campo: «Há um número só». Repor uma versão antiga e copiar uma proposta
 * trocavam o documento inteiro (valor incluído) e não gravavam nada: o estúdio
 * passava a dizer 8.000 e a Gestão do pedido, o Kanban e o dossier continuavam
 * a dizer 9.400 até ela enviar.
 */
describe("repor e copiar gravam o preço no pedido", () => {
  const comPreco = { ...quote, quotedPrice: 9400 } as Quote;

  /** Os `quotedPrice` que foram gravados no pedido, pela ordem. */
  function precosGravados(): unknown[] {
    return corpos(`/api/orcamento/${quote.id}`, "PATCH")
      .map((b) => {
        try {
          return (JSON.parse(b) as { quotedPrice?: unknown }).quotedPrice;
        } catch {
          return undefined;
        }
      })
      .filter((v) => v !== undefined);
  }

  it("repor uma versão antiga grava o valor dessa versão", async () => {
    versoesServidor = [
      {
        id: "v1",
        enviadaEm: "2026-02-01T10:00:00.000Z",
        total: 9840,
        estado: "enviada",
        mudancas: [],
        resumo: "Primeira",
      },
    ];
    docsDeVersao.v1 = {
      template: "decoracao",
      ref: "PO Decoração v1",
      clientNames: "Maria & Zé",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2026",
      location: "Évora",
      guests: "80 pax",
      serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
      moodBoards: [],
      budgetItems: [],
      coverImages: ["", ""],
      totalAmount: 8000,
      totalVatMode: "acrescer",
      totalLabel: "Valor Total Decoração",
    };
    render(
      <ToastProvider>
        <ProposalStudio quote={comPreco} />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    // O painel das versões vive no passo do envio.
    await user.click(await screen.findByRole("button", { name: /^5\s*Rever e enviar/ }));
    await user.click(await screen.findByRole("button", { name: /Repor esta versão/ }));

    await waitFor(() => {
      expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("8000");
    });
    await waitFor(() => expect(precosGravados()).toContain(8000));
  });

  /**
   * ── E COM OS ADICIONAIS DA VERSÃO, NÃO OS DO ECRÃ ───────────────────────
   *
   * A conversão escrito → pedido soma os adicionais, e lia-os do `doc` da
   * render — que, na linha a seguir a um `setDoc` que troca o documento
   * inteiro, ainda é o documento ANTIGO.
   *
   * O caso: no ecrã está um rascunho com 895,00 € de deslocação; repõe-se a
   * versão que seguiu para o cliente, que trazia 1.490,00 € de adicionais e
   * 8.000,00 € de serviços. O pedido tem de ficar com 9.490,00 €, que é o que
   * o casal recebeu. Com os adicionais do ecrã ficava 8.895,00 € — e a
   * abertura seguinte punha esse número no ecrã como se fosse o enviado.
   */
  it("repor uma versão soma os adicionais DESSA versão, não os do ecrã", async () => {
    versoesServidor = [
      {
        id: "v1",
        enviadaEm: "2026-02-01T10:00:00.000Z",
        total: 11672.7,
        estado: "enviada",
        mudancas: [],
        resumo: "Primeira",
      },
    ];
    docsDeVersao.v1 = {
      template: "decoracao",
      ref: "PO Decoração v1",
      clientNames: "Maria & Zé",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2026",
      location: "Évora",
      guests: "80 pax",
      serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
      moodBoards: [],
      budgetItems: [],
      coverImages: ["", ""],
      budgetExtras: [{ label: "Deslocação e coordenação", valueText: "1.490,00 €" }],
      budgetExtrasSomam: true,
      totalAmount: 8000,
      totalVatMode: "acrescer",
      totalLabel: "Valor Total Decoração",
    };
    // O que está no ecrã antes de repor: 895,00 € de deslocação.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        budgetExtras: [{ label: "Deslocação equipa Líquen", valueText: "895,00 €" }],
        budgetExtrasSomam: true,
        totalAmount: 8505,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
    render(
      <ToastProvider>
        <ProposalStudio quote={{ ...quote, quotedPrice: 9400 } as Quote} />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^5\s*Rever e enviar/ }));
    await user.click(await screen.findByRole("button", { name: /Repor esta versão/ }));

    await waitFor(() => {
      expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("8000");
    });
    await waitFor(() => expect(precosGravados()).toContain(9490));
    expect(precosGravados()).not.toContain(8895);
  }, 20_000);

  it("copiar uma proposta grava o valor copiado e arruma o campo", async () => {
    propostasServidor = [
      {
        id: "p1",
        quoteId: "q9",
        clientName: "Rita & Paulo",
        createdAt: "2026-01-05T10:00:00.000Z",
        status: "aceite",
        temDoc: true,
        eventType: "Casamento",
        eventDate: "1 de junho de 2026",
        location: "Estremoz",
        guests: "100 pax",
        grupos: 1,
        moodBoards: 0,
        linhas: 1,
        fotos: 0,
      },
    ];
    copiaServidor = {
      nomeDaOrigem: "Rita & Paulo",
      camposAMudar: [],
      fotosCopiadas: 0,
      fotosPartilhadas: 0,
      doc: {
        template: "decoracao",
        ref: "",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração Copiada", items: [] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 6000,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      },
    };
    render(
      <ToastProvider>
        <ProposalStudio quote={comPreco} />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Criar a partir de…/ }));
    await user.click(await screen.findByRole("button", { name: /Rita & Paulo/ }));
    await screen.findByDisplayValue("Decoração Copiada");

    // O campo mostrava o número ANTERIOR enquanto o documento já tinha outro.
    await waitFor(() => {
      expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("6000");
    });
    await waitFor(() => expect(precosGravados()).toContain(6000));
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TROCAR DE CLIENTE A MEIO DE UMA FRASE NÃO PODE APAGAR A FRASE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A gravação é um `setTimeout` a 800 ms e a limpeza corre em QUALQUER
 * desmontagem. O «Trocar de cliente», o link «Rápida» e mudar de separador
 * desmontam o estúdio — e cancelavam a gravação. O indicador continuava a
 * dizer «Guardado às 14:32», e ao voltar faltava a última linha escrita.
 */
describe("o rascunho por gravar não se perde ao desmontar", () => {
  it("desmontar dentro dos 800 ms grava o que estava escrito", async () => {
    const { unmount } = renderStudio();
    const user = userEvent.setup();
    const campo = await screen.findByLabelText("Clientes");
    // Uma gravação já aconteceu ao semear o rascunho; contam-se as de agora.
    const antes = corpos("proposta-rascunho").length;
    await user.type(campo, "Beatriz e Nuno");
    unmount();
    await waitFor(() => {
      const gravados = corpos("proposta-rascunho");
      expect(gravados.length).toBeGreaterThan(antes);
      expect(gravados[gravados.length - 1]).toContain("Beatriz e Nuno");
    });
    expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain("Beatriz e Nuno");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODELOS PARCIAIS DE MOOD BOARD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * (a) As fotos de um modelo vêm da pasta de OUTRO pedido. Inseridas tal e qual,
 *     o documento novo aponta para lá — as células abrem sem miniatura, e no
 *     dia em que esse pedido for apagado a proposta fica sem imagens.
 * (b) O «Guardar como modelo» era único para a secção inteira e guardava sempre
 *     o PRIMEIRO mood board com título. Não havia maneira de guardar o terceiro.
 */
describe("modelos parciais de mood board", () => {
  function seedComTresBoards() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [
          { title: "Cerimónia", annotation: "", images: [] },
          { title: "Cocktail", annotation: "", images: [] },
          { title: "Jantar", annotation: "", images: [] },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
  }

  it("dá para guardar o TERCEIRO mood board, não só o primeiro", async () => {
    seedComTresBoards();
    renderStudio("Inspiração");
    const user = userEvent.setup();
    const guardar = await screen.findAllByRole("button", { name: /Guardar como modelo/ });
    // Um controlo por mood board (mais o da proposta inteira, no cabeçalho) —
    // senão o terceiro board não tem como ser guardado de todo.
    expect(guardar.length).toBeGreaterThanOrEqual(4);
    await user.click(guardar[guardar.length - 1]);
    const nome = await screen.findByLabelText(/Nome do modelo/);
    // O nome sugerido é o do board em que ela carregou.
    expect((nome as HTMLInputElement).value).toBe("Jantar");
    await user.click(screen.getByRole("button", { name: /^Guardar$/ }));
    await waitFor(() => {
      const corpo = corpos("/api/propostas/modelos", "POST").at(-1) ?? "";
      expect(corpo).toContain("Jantar");
      expect(corpo).not.toContain("Cerimónia");
    });
  });

  it("as fotos de um modelo são recopiadas para a pasta deste pedido", async () => {
    seedComTresBoards();
    modelosServidor = [
      {
        id: "mb1",
        nome: "Cerimónia na igreja",
        tipo: "moodboard",
        moodboard: {
          title: "Cerimónia na igreja",
          annotation: "",
          // A pasta de OUTRO pedido — é isto que não pode ficar no documento.
          images: ["LQ-999/aaa.jpg", "LQ-999/bbb.jpg"],
        },
      },
    ];
    copiaServidor = {
      fotos: { "LQ-999/aaa.jpg": "q1/nova-1.jpg", "LQ-999/bbb.jpg": "q1/nova-2.jpg" },
    };
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: /De um modelo…/ }))[0]);
    await user.click(await screen.findByRole("button", { name: "Cerimónia na igreja" }));

    // Pediu a recópia…
    await waitFor(() => {
      const corpo = corpos("/api/propostas/copiar", "POST").at(-1) ?? "";
      expect(corpo).toContain("LQ-999/aaa.jpg");
    });
    // …e o documento gravado já não aponta para a pasta do outro pedido.
    await waitFor(() => {
      const gravado = corpos("proposta-rascunho").at(-1) ?? "";
      expect(gravado).toContain("q1/nova-1.jpg");
      expect(gravado).not.toContain("LQ-999/aaa.jpg");
    });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «GUARDADO» SÓ SE DIZ QUANDO CHEGOU AO SERVIDOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que aconteceu: uma colaboradora montou uma proposta inteira — imagens,
 * textos, orçamento — numa instalação onde a tabela `app_state` não existia. A
 * gravação no servidor falhava de cada vez, a falha era engolida ao longo de
 * toda a cadeia, e o indicador dizia «guardado às 14:32» porque a cópia LOCAL
 * tinha corrido bem. A dona do negócio foi ver noutro computador e não estava
 * lá nada.
 *
 * O indicador tem de ter três estados e tem de os DIZER — e o do meio, o que
 * faltava, é o que muda o comportamento de quem está a trabalhar.
 */
describe("o indicador diz onde é que o rascunho ficou", () => {
  /** A resposta da rota quando o `app_state` recusa a escrita (a instalação
   *  dela: falta correr o `db/schema.sql`). */
  const naoGuardou = () =>
    reply({
      ok: false,
      status: 503,
      json: {
        ok: false,
        guardado: false,
        motivo: "tabela-em-falta",
        permanente: true,
        erro: "A base de dados não tem a tabela dos rascunhos (falta correr o db/schema.sql no Supabase).",
      },
    });

  /**
   * Semeia um rascunho local JÁ sincronizado — o servidor tem uma cópia mais
   * recente. É preciso porque, com um rascunho local órfão, o estúdio reenvia-o
   * ao abrir (e faz bem: é o resgate, testado mais abaixo). Aqui o que se olha é
   * o indicador das gravações que vêm A SEGUIR, e o resgate só faria ruído.
   */
  function jaSincronizado() {
    seedDraft(1);
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now() - 3600_000));
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: JSON.parse(localStorage.getItem(DRAFT_KEY)!),
    };
  }

  /** O texto do próprio indicador, que começa sempre pela palavra «guardado» —
   *  ao contrário das mensagens, que começam por outra coisa. */
  const soLocal = /^(⚠ )?guardado só neste computador/i;
  const noServidor = /^guardado às /;

  async function escrever() {
    const user = userEvent.setup();
    const campo = await screen.findByLabelText("Clientes");
    await user.type(campo, "!");
    // A gravação tem 800 ms de travão; esperar por ela é esperar pelo momento
    // em que o indicador já tem alguma coisa verdadeira para dizer.
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain("!"), {
      timeout: 3000,
    });
  }

  it("no caso normal continua a dizer a hora a que guardou", async () => {
    jaSincronizado();
    renderStudio();
    await escrever();
    expect(await screen.findAllByText(noServidor, undefined, { timeout: 5000 })).not.toEqual([]);
    expect(screen.queryAllByText(soLocal)).toEqual([]);
  });

  it("quando o servidor recusa, diz «só neste computador» — não «guardado»", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    await escrever();
    // Está no ecrã, por extenso, e não escondido num visto de outra cor.
    expect(await screen.findAllByText(soLocal, undefined, { timeout: 5000 })).not.toEqual([]);
    // E o que NÃO pode aparecer é a frase que a fazia fechar o portátil.
    expect(screen.queryAllByText(noServidor)).toEqual([]);
  });

  it("diz também o que é preciso fazer para o servidor voltar a aceitar", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    await escrever();
    expect(await screen.findAllByText(/schema\.sql/i, undefined, { timeout: 5000 })).not.toEqual(
      [],
    );
  });

  /** A edição NUNCA falha porque a gravação falhou: o que muda é o que se diz. */
  it("continua a deixar escrever com o servidor a recusar", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    await escrever();
    await screen.findAllByText(soLocal, undefined, { timeout: 5000 });
    const campo = (await screen.findByLabelText("Clientes")) as HTMLInputElement;
    expect(campo.disabled).toBe(false);
    expect(campo.value).toContain("!");
    // E o trabalho está mesmo salvo no navegador — é o que o resgate vai buscar.
    expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain("!");
  });

  /**
   * Uma gravação que falha por rede não pode morrer à primeira — é o mesmo
   * desenho do envio da proposta. À segunda tentativa passa, e o que ela vê é
   * um rascunho guardado, sem nunca ter sabido que houve uma falha.
   */
  it("uma falha passageira é repetida, e a segunda tentativa guarda", async () => {
    let n = 0;
    gravacaoDoRascunho = () =>
      ++n === 1
        ? reply({ ok: false, status: 500, json: { ok: false } })
        : reply({ json: { ok: true, guardado: true, updatedAt: new Date().toISOString() } });
    jaSincronizado();
    renderStudio();
    await escrever();
    expect(await screen.findAllByText(noServidor, undefined, { timeout: 5000 })).not.toEqual([]);
    expect(n).toBeGreaterThan(1);
    expect(screen.queryAllByText(soLocal)).toEqual([]);
  });

  /** Uma instalação sem a tabela responde o mesmo à terceira vez que à
   *  primeira: repetir só atrasa o aviso. */
  it("uma falha permanente não é repetida", async () => {
    let n = 0;
    gravacaoDoRascunho = () => {
      n++;
      return naoGuardou();
    };
    jaSincronizado();
    renderStudio();
    await escrever();
    await screen.findAllByText(soLocal, undefined, { timeout: 5000 });
    // Uma por gravação — nunca três.
    expect(n).toBe(corpos("proposta-rascunho").length);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE FICOU PRESO NO NAVEGADOR VOLTA AO ABRIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É por aqui que o trabalho da colaboradora regressa. Enquanto o servidor
 * recusou as gravações, tudo o que ela montou ficou no `localStorage` daquele
 * portátil — intacto e invisível. O estúdio abria, via que o servidor não tinha
 * rascunho nenhum, e não fazia nada com essa informação.
 */
describe("o rascunho preso neste navegador é reenviado ao abrir", () => {
  /** Um rascunho local com marca de tempo — como o que ficou no portátil dela. */
  function rascunhoOrfaoLocal(marca: string) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: marca,
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
  }

  it("um rascunho local sem nenhum no servidor é enviado, e diz-se que foi", async () => {
    rascunhoOrfaoLocal("Beatriz e Nuno");
    rascunhoServidor = null;
    renderStudio();
    await waitFor(
      () => expect(corpos("proposta-rascunho").at(0) ?? "").toContain("Beatriz e Nuno"),
      { timeout: 3000 },
    );
    expect(
      await screen.findAllByText(/foi enviado para o servidor/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
  });

  it("um rascunho local MAIS RECENTE do que o do servidor também é reenviado", async () => {
    rascunhoOrfaoLocal("Beatriz e Nuno");
    rascunhoServidor = {
      // Uma hora mais velho do que a cópia deste navegador.
      updatedAt: new Date(Date.now() - 3600_000).toISOString(),
      doc: { template: "decoracao", ref: "PO", clientNames: "Versão velha do servidor" },
    };
    renderStudio();
    expect(
      await screen.findAllByText(/foi enviado para o servidor/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
    expect(corpos("proposta-rascunho").at(0) ?? "").toContain("Beatriz e Nuno");
    // E a versão velha do servidor NÃO é posta por cima do que está no ecrã.
    expect((await screen.findByLabelText("Clientes")) as HTMLInputElement).toHaveProperty(
      "value",
      "Beatriz e Nuno",
    );
  });

  it("com o servidor mais recente não se reenvia nada — seria apagar trabalho", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ template: "decoracao", clientNames: "Velha" }),
    );
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now() - 3600_000));
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: { template: "decoracao", ref: "PO", clientNames: "Herdade do Servidor" },
    };
    renderStudio();
    await screen.findByDisplayValue("Herdade do Servidor");
    expect(corpos("proposta-rascunho").join("")).not.toContain("Velha");
  });

  /** Se o GET falhou não se sabe o que lá está: escrever por cima às cegas
   *  podia apagar uma versão mais recente feita noutro dispositivo. */
  it("não reenvia às cegas quando nem sequer se conseguiu ler o servidor", async () => {
    rascunhoOrfaoLocal("Beatriz e Nuno");
    leituraDoRascunhoFalha = true;
    renderStudio();
    await screen.findByDisplayValue("Beatriz e Nuno");
    // Sem tecla nenhuma não há gravação — e portanto nenhum reenvio cego.
    await new Promise((r) => setTimeout(r, 300));
    expect(corpos("proposta-rascunho")).toEqual([]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORÇAR A GRAVAÇÃO — O ⌘S, E O BOTÃO QUE SÓ APARECE QUANDO É PRECISO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O botão «Guardar agora» estava SEMPRE na barra, ao lado de «Tudo guardado».
 * Palavras dela: «é redundante e contraditório». É — e a gravação automática
 * cobre mesmo o que ele cobria, porque é a MESMA função (`flushDraft.current`)
 * que os dois chamam.
 *
 * O que não é redundante é o caso em que o servidor RECUSA: aí a cópia local
 * já apagou o «por gravar» e o temporizador só volta a correr à tecla seguinte
 * — carregar era a única forma de tentar outra vez. Por isso o botão fica, mas
 * só nesse estado e com o nome do que faz.
 *
 * Estes testes prendem as duas metades: o gesto de forçar continua a existir
 * (⌘S), e continua a não poder mentir sobre o que aconteceu — quem lê
 * «guardado» fecha o portátil.
 */
describe("forçar a gravação do rascunho", () => {
  const naoGuardou = () =>
    reply({
      ok: false,
      status: 503,
      json: {
        ok: false,
        guardado: false,
        motivo: "tabela-em-falta",
        permanente: true,
        erro: "A base de dados não tem a tabela dos rascunhos (falta correr o db/schema.sql no Supabase).",
      },
    });

  /** Um rascunho local já sincronizado, para o resgate da abertura não fazer
   *  ruído nas contagens de gravações (é o mesmo cuidado do indicador). */
  function jaSincronizado() {
    seedDraft(1);
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now() - 3600_000));
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: JSON.parse(localStorage.getItem(DRAFT_KEY)!),
    };
  }

  /** O gesto de forçar. É o ⌘S: o botão de sempre saiu da barra. */
  const forcar = (user: ReturnType<typeof userEvent.setup>) =>
    user.keyboard("{Control>}s{/Control}");

  it("ao lado de «tudo guardado» já não há botão nenhum", async () => {
    jaSincronizado();
    renderStudio();
    await screen.findByLabelText("Clientes");
    expect(screen.queryByRole("button", { name: /guardar agora/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tentar outra vez/i })).toBeNull();
  });

  /** O único caso em que o botão não era redundante: com o servidor a recusar,
   *  era a única forma de voltar a tentar. */
  it("com o servidor a recusar, aparece o «Tentar outra vez»", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    const botaoDeRepetir = await screen.findByRole(
      "button",
      { name: /tentar outra vez/i },
      { timeout: 3000 },
    );
    const antes = corpos("proposta-rascunho").length;
    await user.click(botaoDeRepetir);
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(antes), {
      timeout: 1000,
    });
  });

  it("grava JÁ o que estava por gravar, sem esperar pelos 800 ms", async () => {
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "Beatriz e Nuno");
    const antes = corpos("proposta-rascunho").length;
    await forcar(user);
    // O tecto de 500 ms é a prova: o travão da gravação automática são 800 ms,
    // portanto uma gravação que aparece aqui só pode ter vindo do botão.
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(antes), {
      timeout: 500,
    });
    expect(corpos("proposta-rascunho").at(-1) ?? "").toContain("Beatriz e Nuno");
  });

  it("diz que guardou — depois de o servidor o ter dito, não antes", async () => {
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    await forcar(user);
    expect(
      await screen.findAllByText(/rascunho guardado no servidor/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
  });

  it("com o servidor a recusar, diz «só neste computador» — nunca «guardado»", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    await forcar(user);
    // As MESMAS palavras do indicador. Ela não pode ter de aprender duas
    // linguagens no mesmo back office.
    expect(
      await screen.findAllByText(/só neste computador/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
    expect(screen.queryAllByText(/rascunho guardado no servidor/i)).toEqual([]);
  });

  /** À segunda tentativa o aviso grande já não aparece (aparece uma vez só) —
   *  e é aí que um botão calado passaria por um botão que guardou. */
  it("continua a dizer a verdade à segunda vez que se carrega", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    await forcar(user);
    await screen.findAllByText(/só neste computador/i, undefined, { timeout: 3000 });
    await user.type(await screen.findByLabelText("Clientes"), "?");
    await forcar(user);
    await waitFor(
      () => expect(screen.queryAllByText(/rascunho guardado no servidor/i)).toEqual([]),
      { timeout: 1000 },
    );
    expect(screen.queryAllByText(/só neste computador/i)).not.toEqual([]);
  });

  it("sem nada por gravar, di-lo em vez de fingir que gravou", async () => {
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    // Espera pela gravação automática: a partir daqui não há nada pendente.
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain("!"), {
      timeout: 3000,
    });
    await forcar(user);
    expect(
      await screen.findAllByText(/não havia nada por gravar/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS DEIXAM DE SER CORTADAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, em duas páginas de PDF: «há imagens que estão cortadas,
 * resolve isso». Estava medido: no mosaico deitava-se fora entre 16% e 79% da
 * área de cada fotografia, no destaque entre 3% e 72%. Uma foto de um portão
 * coberto de flores chegava à proposta com dois terços do portão de fora — e a
 * página existe para mostrar o portão.
 *
 * A geometria que resolve isto já existe (`proposal-geometria`), e nasce
 * DESLIGADA de propósito: o PDF é redesenhado a cada vez que o casal abre o
 * link, e ligá-la calada mudava propostas que já foram enviadas, discutidas ao
 * telefone e talvez impressas.
 *
 * O interruptor e o diagrama saíram com o PDF novo, que não recorta (cada
 * célula do mosaico tem quase a forma da sua fotografia). Fica o que ainda vale:
 * um mood board NOVO nasce marcado sem recorte (o gerador antigo lê-o), e a
 * capa, que é UMA fotografia a cobrir a folha.
 */
describe("as fotografias do mood board deixam de ser cortadas", () => {
  it("um mood board novo nasce a manter a forma das fotografias", async () => {
    seedDraft(0);
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Adicionar mood board/ }));
    await waitFor(
      () => expect(corpos("proposta-rascunho").at(-1) ?? "").toContain("forma-da-foto"),
      { timeout: 3000 },
    );
  });

  /** Por fotografia e não por disposição: na mesma página uma panorâmica perde
   *  5% e uma vertical 69%. Um aviso por página obrigava-a a adivinhar qual. */
  /**
   * A capa do desenho novo é UMA fotografia a cobrir a folha deitada. Ela
   * escolheu «Usa a minha, com aviso»: se a dela não servir, o estúdio diz
   * porquê e o que o PDF faz em vez disso.
   */
  const comCapas = (capas: string[]) => {
    // O servidor CONHECE estas fotos: sem endereço assinado o `Thumb` não
    // desenha imagem nenhuma, e sem imagem não há nada para medir.
    assetsServidor = capas
      .filter(Boolean)
      .map((path) => ({ path, url: `https://exemplo.pt/${path}` }));
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: capas,
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    renderStudio();
  };

  /**
   * A miniatura mede-se sozinha no `onLoad`, e num teste as imagens não
   * carregam. Isto é o que o navegador faz por ela: dá à imagem uma forma e
   * dispara o `load`.
   */
  async function medirCapas(formas: { w: number; h: number }[]) {
    // Pelo DOM e não por papel: um `<img alt="">` é decorativo e não tem
    // papel nenhum de acessibilidade — `getAllByRole("img")` não o encontra.
    //
    // ── E DENTRO DA SECÇÃO DAS CAPAS, NÃO NA PÁGINA TODA ─────────────────
    // A mesma fotografia de capa aparece agora em DOIS sítios: aqui e na
    // «Vista de conjunto», que passou a desenhar-se sozinha no fim do passo 1.
    // Procurar `capas/` no documento inteiro trazia as duas cópias, e as
    // `formas` são atribuídas POR ÍNDICE — a primeira forma ia parar à
    // miniatura da vista e a capa verdadeira ficava por medir. Por medir não
    // há aviso, e o teste caía a dizer que o aviso desapareceu.
    //
    // A secção é a unidade certa: é dela que o aviso fala.
    const capas = await waitFor(() => {
      const seccao = document.getElementById("sec-capas");
      if (!seccao) throw new Error("a secção das capas ainda não está desenhada");
      const encontradas = [...seccao.querySelectorAll("img")].filter((i) =>
        (i.getAttribute("src") ?? "").includes("capas/"),
      );
      if (encontradas.length === 0) throw new Error("as capas ainda não estão desenhadas");
      return encontradas;
    });
    capas.forEach((img, i) => {
      const forma = formas[i];
      if (!forma) return;
      Object.defineProperty(img, "naturalWidth", { value: forma.w, configurable: true });
      Object.defineProperty(img, "naturalHeight", { value: forma.h, configurable: true });
      Object.defineProperty(img, "complete", { value: true, configurable: true });
      fireEvent.load(img);
    });
  }

  it("há UM lugar, «Fotografia da capa», e não dois", async () => {
    comCapas(["", ""]);
    const seccao = await waitFor(() => {
      const el = document.getElementById("sec-capas");
      if (!el) throw new Error("a secção da capa ainda não está desenhada");
      return el;
    });
    expect(within(seccao).getAllByText(/^Fotografia da capa$/).length).toBeGreaterThan(0);
    expect(within(seccao).queryByText(/Capa esquerda|Capa direita/)).toBeNull();
  });

  it("uma fotografia ao alto: diz que a capa é deitada e o que o PDF usa", async () => {
    comCapas(["capas/ao-alto.jpg", ""]);
    await medirCapas([{ w: 1000, h: 1500 }]);
    const aviso = await screen.findByText(/É ao alto, e a capa é deitada/);
    expect(aviso.textContent).toMatch(/melhor fotografia deitada dos temas/);
    expect(within(aviso.closest("p")!).getByRole("button", { name: "Trocar" })).toBeTruthy();
  });

  it("uma deitada não tem aviso nenhum", async () => {
    comCapas(["capas/deitada.jpg", ""]);
    await medirCapas([{ w: 1500, h: 1000 }]);
    await waitFor(() => expect(screen.queryByText(/a capa é deitada/)).toBeNull());
    // 3:2 numa folha de 1123 × 794 perde menos de um oitavo: não se avisa.
    expect(screen.queryByText(/perde \d+% da área/i)).toBeNull();
  });

  it("uma panorâmica diz quanto perde na folha", async () => {
    comCapas(["capas/panoramica.jpg", ""]);
    await medirCapas([{ w: 3000, h: 1000 }]);
    expect(await screen.findByText(/perde \d+% da área/i)).toBeTruthy();
  });

  it("uma proposta antiga só com a da «Direita» mostra essa como a capa", async () => {
    comCapas(["", "capas/direita.jpg"]);
    await medirCapas([{ w: 1000, h: 1500 }]);
    expect(await screen.findByText(/É ao alto/)).toBeTruthy();
  });

  it("sem a forma medida, NÃO se inventa um aviso", async () => {
    comCapas(["capas/uma.jpg", ""]);
    await waitFor(() =>
      expect(
        [...document.querySelectorAll("img")].some((i) =>
          (i.getAttribute("src") ?? "").includes("capas/"),
        ),
      ).toBe(true),
    );
    expect(screen.queryByText(/perde \d+% da área/i)).toBeNull();
    expect(screen.queryByText(/a capa é deitada/)).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CONTADOR DE PREÇOS, EM SI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A regra que interessa é a do meio: nenhuma linha com preço é «ainda não
 * orçamentei» e não avisa de nada; todas com preço é uma soma verdadeira. Só
 * o meio — umas sim, outras não — dá um número plausível que está errado por
 * baixo, e é esse que tem de falar.
 */
describe("contagemDePrecos", () => {
  it("conta as que têm preço e diz a frase por extenso", () => {
    expect(contagemDePrecos([900, null, 1500, null])).toMatchObject({
      comPreco: 2,
      semPreco: 2,
      total: 4,
      incompleta: true,
      frase: "2 de 4 linhas com preço",
    });
  });

  it("com uma linha só, fala no singular", () => {
    expect(contagemDePrecos([900]).frase).toBe("1 de 1 linha com preço");
  });

  it("nenhuma com preço não é uma soma incompleta — é uma proposta por orçamentar", () => {
    expect(contagemDePrecos([null, null]).incompleta).toBe(false);
  });

  it("todas com preço não é uma soma incompleta", () => {
    expect(contagemDePrecos([900, 1500]).incompleta).toBe(false);
  });

  it("zero é um preço, e não a falta dele", () => {
    // Uma linha oferecida custa zero. Contá-la como «sem preço» mandava
    // procurar um campo que está preenchido de propósito.
    expect(contagemDePrecos([0, 900])).toMatchObject({ comPreco: 2, incompleta: false });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O IVA QUE UM VALOR ADICIONAL DECLARA, LIDO DE VOLTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O campo passou a numérico e o «+ IVA» passou a ser um selector — mas o que
 * se GRAVA continua a ser o texto que o PDF imprime. Estes testes prendem as
 * duas metades: que o texto sai bem composto, e que o selector lê de volta
 * exactamente o que a soma vai entender.
 */
describe("o valor de uma linha adicional", () => {
  const TAXA = 0.23;

  it("normaliza «1.500», «1500» e «1 500 €» no mesmo número", () => {
    for (const escrito of ["1.500", "1500", "1 500 €", "1500,00"]) {
      expect(textoDoAdicional(escrito, "documento")).toBe(eur(1500));
    }
  });

  it("não perde o «+ IVA» — escreve-o no texto que vai para o PDF", () => {
    expect(textoDoAdicional("895", "acrescer")).toBe(`${eur(895)} + IVA`);
    expect(textoDoAdicional("895", "incluido")).toBe(`${eur(895)} (IVA incluído)`);
  });

  it("um texto sem número («a definir») fica exactamente como foi escrito", () => {
    // É uma frase que o casal tem de ver na proposta, não um número.
    expect(textoDoAdicional("a definir", "acrescer")).toBe("a definir");
    expect(textoDoAdicional("sob consulta", "documento")).toBe("sob consulta");
  });

  it("o texto composto volta a ser lido com o mesmo sentido", () => {
    for (const modo of ["documento", "acrescer", "incluido"] as const) {
      expect(modoDoAdicional(textoDoAdicional("895", modo), TAXA)).toBe(modo);
    }
  });

  it("lê as propostas antigas pelo que elas escreveram", () => {
    expect(modoDoAdicional("895,00 € + IVA", TAXA)).toBe("acrescer");
    expect(modoDoAdicional("896,00 €", TAXA)).toBe("documento");
    expect(modoDoAdicional("1.550,00 € c/ IVA", TAXA)).toBe("incluido");
    expect(modoDoAdicional("a definir", TAXA)).toBe("documento");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CAMPO DO TOTAL ESCRITO POR CÓDIGO — CEM VEZES MAIS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O campo do total é texto e relê-se com `parseMoneyText`, que segue o
 * português: o ponto separa MILHARES. Quem lá escrevia por código usava
 * `String(n)`, e o JavaScript escreve os decimais com PONTO —
 * `String(3355.98)` dava «3355.98», relido como 335 598.
 *
 * Não era teórico: o botão «Usar X €» numa proposta de 2.460,00 € com uma
 * deslocação de 75,00 € lida com IVA incluído sugere 3.355,98 €, e o campo
 * ficava com 335.598,00 € — que é o número que seguia para o preço final do
 * pedido, para o sinal e para a fatura.
 */
describe("textoDoTotal", () => {
  it("um valor com cêntimos volta a ser lido pelo mesmo número", () => {
    for (const n of [3355.98, 8425.5, 2520.98, 0.99, 1500.05]) {
      expect(parseMoneyText(textoDoTotal(n))).toBe(n);
    }
  });

  it("um inteiro continua a aparecer como sempre apareceu", () => {
    expect(textoDoTotal(2460)).toBe("2460");
    expect(parseMoneyText(textoDoTotal(2460))).toBe(2460);
  });

  /**
   * ── A REDE DE BAIXO MUDOU; ESTA CONTINUA A FAZER FALTA ───────────────────
   *
   * Este teste afirmava que `parseMoneyText(String(3355.98))` dava 335 598 —
   * era esse o defeito que obrigou a escrever o `textoDoTotal`. Deixou de ser
   * verdade: o leitor passou a aceitar as duas escritas (ver o comentário em
   * `proposal-doc.ts`, escrito quando se descobriu que uma proposta INGLESA
   * importada valia três euros), e um ponto seguido de um ou dois dígitos é
   * hoje um decimal.
   *
   * O `textoDoTotal` fica na mesma, e não por hábito: o campo é o que ELA lê.
   * Um total escrito «3355.98» num ecrã português está errado à vista de
   * qualquer pessoa daqui, mesmo que a máquina já o entenda. E há uma escrita
   * que continua a ter uma só leitura possível — «3.000» são três mil, nunca
   * três —, portanto quem escreve no campo tem de escrever português.
   */
  it("o leitor já aguenta o `String(n)`, mas o campo continua a mostrar português", () => {
    expect(parseMoneyText(String(3355.98))).toBe(3355.98);
    expect(textoDoTotal(3355.98)).toBe("3355,98");
    // E a escrita ambígua continua a ler-se como sempre se leu por cá.
    expect(parseMoneyText("3.000")).toBe(3000);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DO AVISO DE ORTOGRAFIA ATÉ AO CAMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Verificação ortográfica automática de todos os campos que
 * saem no PDF, com aviso e LINK DIRECTO PARA O CAMPO.»
 *
 * O aviso vive no passo do envio e o campo no do conteúdo — e pode estar dentro
 * de um mood board fechado. O caminho tem três degraus e todos podem partir em
 * silêncio, por isso são medidos aqui: a pega existe no controlo certo, o salto
 * volta ao conteúdo, e o campo fica com o foco.
 */
describe("o «Ver no campo» do aviso de ortografia", () => {
  it("põe a pega no controlo que a palavra habita", async () => {
    seedDraft(1, { title: "Decoracao Cerimonia" });
    renderStudio();
    const titulo = await screen.findByLabelText("Título do mood board");
    expect(titulo.getAttribute("data-campo")).toBe("boardTitulo:0");
  });

  it("leva mesmo lá — volta ao conteúdo e deixa o campo com o foco", async () => {
    seedDraft(1, { title: "Decoracao Cerimonia" });
    renderStudio();
    await screen.findByLabelText("Título do mood board");

    // Até ao passo do envio, que é onde o aviso vive.
    const utilizador = userEvent.setup();
    // Pela navegação do estúdio, como ela faz: 2 Pré-visualizar → 3 Enviar.
    await utilizador.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await utilizador.click(await screen.findByRole("button", { name: /Rever e enviar/ }));

    const ir = await screen.findAllByRole("button", { name: "Ver no campo" });
    await act(async () => {
      ir[0].click();
    });

    const titulo = await screen.findByLabelText("Título do mood board");
    expect(document.activeElement, "o campo não ficou com o foco").toBe(titulo);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CUSTO DA GERAÇÃO, ANTES DO BOTÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «tempo estimado de geração do PDF» e «aviso se o PDF
 * ultrapassar o limite de anexo de email (8 MB)».
 *
 * Sem número nenhum, dez segundos e sessenta são a mesma coisa: uma barra a
 * rodar, sem forma de distinguir «está a demorar» de «isto encravou».
 */
describe("o custo de gerar o PDF", () => {
  const irAoPasso2 = async () => {
    const utilizador = userEvent.setup();
    await utilizador.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
  };

  it("diz quanto demora e quanto pesa, com as fotos que a proposta tem", async () => {
    seedDraft(3);
    renderStudio();
    await screen.findByLabelText("Título do mood board");
    await irAoPasso2();
    expect(await screen.findByText(/Gerar este PDF demora/)).toBeTruthy();
  });

  /** Uma proposta sem fotografias não tem custo nenhum que valha a pena dizer. */
  it("sem fotos, não diz nada", async () => {
    seedDraft(0);
    renderStudio();
    await irAoPasso2();
    expect(screen.queryByText(/Gerar este PDF demora/)).toBeNull();
  });

  /**
   * O aviso que evita o pior desfecho: o servidor de email do cliente recusa a
   * mensagem e, do lado dela, o envio parece ter corrido bem.
   */
  it("com gerações pesadas medidas, avisa que o anexo pode ser recusado", async () => {
    // Duas medições anteriores: ~1,5 MB por fotografia. Com 20 fotos a
    // estimativa passa dos 8 MB — e é isso que o aviso tem de apanhar.
    localStorage.setItem(
      "liquen-proposal-studio:geracoes-editorial",
      JSON.stringify([
        { fotos: 4, ms: 4000, bytes: 6_500_000 },
        { fotos: 8, ms: 6000, bytes: 12_500_000 },
      ]),
    );
    seedDraft(20);
    renderStudio();
    await screen.findByLabelText("Título do mood board");
    await irAoPasso2();
    expect(await screen.findByText(/pode ser recusado pelo servidor de email/)).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MARGEM ONDE A DECISÃO SE TOMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Falta o número que permite decidir com noção» — dentro do
 * bloco de Totais.
 *
 * A margem já era calculada no painel interno, onde os custos se escrevem. O
 * que faltava era estar no ecrã onde se decide baixar (ou não) o preço.
 */
describe("a margem no bloco dos totais", () => {
  const comCustos = (custos: (number | null)[], precos: number[]) => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: precos.map((_, i) => `Linha ${i + 1}`),
        budgetAmounts: precos,
        budgetCosts: custos,
        coverImages: ["", ""],
        totalAmount: precos.reduce((a, b) => a + b, 0),
        totalVatMode: "acrescer",
      }),
    );
  };

  it("sem custos escritos, não diz nada — zero não é a mesma coisa que «não sei»", async () => {
    comCustos([null, null], [1000, 2000]);
    renderStudio();
    await waitFor(() => expect(screen.getByText("Totais")).toBeTruthy());
    expect(screen.queryByText("Só para si")).toBeNull();
  });

  /**
   * ── PORQUE É QUE ISTO PASSOU A `getAllByText` ─────────────────────────────
   * O painel «Só para si» nascia fechado, e a margem só existia uma vez no
   * ecrã — no crachá do resumo. Ela pediu-o aberto por omissão («coloca esta
   * barra já aberta por definição»), e agora a margem está nos DOIS sítios: no
   * crachá e dentro do painel. Não é duplicação a corrigir; é o resumo a
   * resumir o que está aberto por baixo.
   *
   * O que se guarda continua a ser o mesmo — «a margem aparece» —, e guarda-se
   * com um piso (`length` ≥ 1) em vez de exigir exactamente uma, que era uma
   * afirmação sobre a dobra e não sobre a margem.
   */
  it("com custos, mostra a margem em euros e em percentagem", async () => {
    comCustos([400, 600], [1000, 1000]);
    renderStudio();
    await screen.findByText("Só para si");
    // 2000 cobrados, 1000 de custos → 1000 € e 50%.
    expect(screen.getAllByText(/50%/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Não sai no PDF/)).toBeTruthy();
  });

  /** Uma margem sobre metade dos custos, dita como «a margem», seria uma
   *  mentira sempre optimista. */
  it("com custos a meio, diz que a conta é parcial", async () => {
    comCustos([400, null], [1000, 1000]);
    renderStudio();
    await screen.findByText("Só para si");
    expect(screen.getByText(/1 de 2 linhas que já têm custo/)).toBeTruthy();
  });

  it("abaixo do limite, avisa — sem impedir nada", async () => {
    comCustos([900, 900], [1000, 1000]);
    renderStudio();
    await screen.findByText("Só para si");
    // Mesma razão do caso acima: com o painel aberto por omissão, o aviso está
    // no crachá do resumo e dentro do painel.
    await waitFor(() =>
      expect(screen.getAllByText(/Abaixo dos \d+% que definiu/).length).toBeGreaterThan(0),
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CAMPO DE PREÇO É DA LINHA, NÃO DA POSIÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O defeito mais caro que esta página teve, porque grava o número errado com
 * bom aspecto. As linhas desenham-se com `key={i}` — a POSIÇÃO — e o campo do
 * preço era não-controlado (`defaultValue` + `onBlur`): apagada a linha do
 * meio, o React reaproveita o nó que sobrevive na posição e o `defaultValue`
 * não se volta a aplicar. O campo ficava com o preço da linha ANTERIOR ao lado
 * do nome da linha nova, e o `blur` seguinte gravava-o por cima do verdadeiro.
 *
 * Daí ia para o PDF, para o sinal e para a factura, sem nada a assinalar.
 */
describe("apagar uma linha do meio do orçamento", () => {
  function seedTresLinhas(extra: Record<string, unknown> = {}) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: ["Alfa", "Beta", "Gama"],
        budgetAmounts: [100, 200, 300],
        coverImages: ["", ""],
        totalAmount: 600,
        totalVatMode: "acrescer",
        ...extra,
      }),
    );
  }

  /** Carrega no × da linha com este nome. */
  async function apagar(user: ReturnType<typeof userEvent.setup>, nome: string) {
    const campo = await screen.findByDisplayValue(nome);
    await user.click(within(campo.parentElement!).getByLabelText("Remover item"));
  }

  const gravado = () => JSON.parse(localStorage.getItem(DRAFT_KEY)!);

  it("o preço que fica no campo é o da linha que sobrou — e é esse que se grava", async () => {
    seedTresLinhas();
    renderStudio();
    const user = userEvent.setup();
    await apagar(user, "Beta");

    // A metade visível do defeito: o campo mostrava «200» ao lado da «Gama».
    const preco = await screen.findByLabelText("Preço de Gama");
    expect(preco).toHaveValue("300");

    // E a metade cara: tocar no campo e sair dele gravava o que lá estava.
    await user.click(preco);
    await user.tab();
    await waitFor(() => expect(gravado().budgetAmounts).toEqual([100, 300]));
  });

  /** O preço unitário da escala tem o mesmo mal e a mesma cura — e uma fórmula
   *  ao lado a explicar, com toda a confiança, a conta de outra linha. */
  it("o preço unitário que fica no campo é o da linha que sobrou", async () => {
    seedTresLinhas({
      budgetScales: [
        { tipo: "por-convidado", unitario: 10 },
        { tipo: "por-convidado", unitario: 20 },
        { tipo: "por-convidado", unitario: 30 },
      ],
    });
    renderStudio();
    const user = userEvent.setup();
    await apagar(user, "Beta");

    const unitario = await screen.findByLabelText("Preço por convidado de Gama");
    expect(unitario).toHaveValue("30");

    await user.click(unitario);
    await user.tab();
    await waitFor(() =>
      expect((gravado().budgetScales as { unitario: number }[]).map((e) => e.unitario)).toEqual([
        10, 30,
      ]),
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ARRUMAR EU» LEVA A MARCA DE EXTRA COM A LINHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `budgetOpcional` é um array paralelo às linhas como os preços e os custos.
 * Ficava de fora da permutação: arrumar a ordem deixava a marca «extra» na
 * rubrica errada — o PDF imprimia-a ao lado da linha que não era, e a versão
 * sem extras ficava cem euros ao lado da verdade.
 */
describe("arrumar a ordem do orçamento", () => {
  function seedForaDeOrdem() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        // A ordem manda-a a lista de Serviços: primeiro a Cerimónia, depois o
        // Jantar. O orçamento está escrito ao contrário.
        serviceGroups: [
          { letter: "a)", title: "Cerimónia", items: [{ label: "Igreja" }] },
          { letter: "b)", title: "Jantar", items: [{ label: "Mesas" }] },
        ],
        moodBoards: [],
        budgetItems: ["Decor Jantar", "Decor Cerimónia"],
        budgetAmounts: [200, 100],
        // O extra está na CERIMÓNIA, que é a linha que vai mudar de sítio.
        budgetOpcional: [false, true],
        coverImages: ["", ""],
        totalAmount: 300,
        totalVatMode: "acrescer",
      }),
    );
  }

  it("a marca «extra» viaja com a linha, como o preço", async () => {
    seedForaDeOrdem();
    renderStudio("Orçamento");
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: "Arrumar eu" }))[0]);

    await waitFor(() => {
      const doc = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
      expect(doc.budgetItems).toEqual(["Decor Cerimónia", "Decor Jantar"]);
      // Os preços já viajavam; a marca de extra é que ficava para trás.
      expect(doc.budgetAmounts).toEqual([100, 200]);
      expect(doc.budgetOpcional).toEqual([true, false]);
    });

    // E o que ela vê bate certo com o que ficou gravado.
    expect(screen.getByLabelText("Decor Cerimónia é um extra opcional")).toBeChecked();
    expect(screen.getByLabelText("Decor Jantar é um extra opcional")).not.toBeChecked();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LEGENDA ROUBA ALTURA ÀS FOTOS — TAMBÉM NA GRELHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A página reserva altura para a descrição, e reserva mais quanto mais linhas
 * ela tiver. A grelha das fotos e o aviso «esta foto perde X%» pediam as caixas
 * SEM essa altura (ficavam com a omissão de 8 pt, a de quem não tem legenda
 * nenhuma), enquanto a miniatura desenhada no mesmo cartão já a contava: as
 * duas metades do cartão discordavam, e o aviso disparava — ou calava-se —
 * pelas razões erradas.
 */
describe("a grelha das fotos conta com a legenda", () => {
  /** Duas linhas de descrição, medidas por `linhasDaLegendaAprox`. */
  const LEGENDA =
    "Flores brancas e verdes, com muito verde e pouca cor, para a cerimónia toda ao ar livre, ao fim da tarde, com velas nos bancos e no altar.";

  function seedBoardComLegenda() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [
          {
            title: "Cerimónia",
            annotation: LEGENDA,
            layout: "mosaico",
            images: Array.from({ length: 4 }, (_, i) => `board/foto-${i}.jpg`),
          },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  // O jsdom não descarrega imagens, portanto nenhuma foto é medida e todas
  // entram com a forma por omissão — a mesma que o gerador assume.
  const aspectos = Array.from({ length: 4 }, () => ASPETO_POR_OMISSAO);
  const comLegenda = caixasDoMoodboard(
    "mosaico",
    aspectos,
    alturaDaLegenda(linhasDaLegendaAprox(LEGENDA)),
    false,
  );
  const semLegenda = caixasDoMoodboard("mosaico", aspectos, undefined, false);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * AS CÉLULAS SÃO TODAS IGUAIS — E ISTO JÁ MEDIU O CONTRÁRIO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Este teste exigia que cada célula tivesse a forma da CAIXA que aquela
   * fotografia vai ocupar na página. Estava certo, e media uma coisa que valia
   * a pena: sem isso, ela escolhia uma foto pelo que via e o cliente recebia a
   * mesma fotografia cortada noutro sítio.
   *
   * Foi-lhe dito exactamente isso, e a decisão dela foi igualar à mesma: «as
   * fotos umas são maiores que outras. coloca tudo igual aqui». A grelha ficava
   * aos degraus, porque a caixa do destaque é alta e as da direita são baixas.
   *
   * O teste passa a prender a decisão NOVA. E prende também o que a torna
   * defensável: a geometria verdadeira não desapareceu do ecrã — continua a
   * alimentar o aviso de quanto é que cada fotografia perde, que é o teste
   * logo a seguir, e o diagrama do selector de disposição.
   */
  it("as células têm todas a mesma forma, mesmo quando as caixas não têm", async () => {
    // O que dá sentido a igualar: as caixas da página são MESMO diferentes
    // entre si. Se um dia deixarem de ser, isto deixa de provar alguma coisa.
    const formasDasCaixas = comLegenda.map((caixa) => aspetoDaCaixa(caixa));
    expect(new Set(formasDasCaixas).size).toBeGreaterThan(1);
    // E as duas geometrias continuam a divergir — é o que o teste do aviso,
    // aqui em baixo, precisa que seja verdade.
    expect(aspetoDaCaixa(comLegenda[0])).not.toBe(aspetoDaCaixa(semLegenda[0]));

    seedBoardComLegenda();
    renderStudio();
    const cartao = await waitFor(() => {
      const el = document.getElementById("mood-board-0");
      expect(el).toBeTruthy();
      return el!;
    });
    const celulas = [...cartao.querySelectorAll<HTMLElement>("[data-foto]")];
    expect(celulas).toHaveLength(4);
    // `parseFloat` porque o jsdom normaliza o `aspect-ratio` para «1 / 1» — o
    // número é o mesmo, a escrita é que é dele.
    expect(celulas.map((c) => parseFloat(c.style.aspectRatio))).toEqual([1, 1, 1, 1]);
  });

  /**
   * A conta do aviso é a mesma da grelha. Com a omissão de 8 pt, a 3.ª foto
   * aparecia na lista das cortadas (perdia 14%); com a altura verdadeira perde
   * 4% e não é caso para aviso nenhum. O aviso existe para ela ir trocar UMA
   * fotografia — apontar-lhe a errada é pior do que estar calado.
   */
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VISTA DE CONJUNTO OCUPA A LARGURA TODA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estava dentro da grelha de duas colunas do índice, como TERCEIRO filho: por
 * colocação automática ficava com a coluna do índice e empurrava a lista dos
 * mood boards para os 11 rem — 176 px de largura para as fotografias todas, a
 * partir dos 1024 px.
 */
describe("ver as páginas lado a lado", () => {
  function seedDoisBoards() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [
          { title: "Cerimónia", annotation: "", images: ["board/a.jpg"] },
          { title: "Jantar", annotation: "", images: ["board/b.jpg"] },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  /**
   * ── ESTÁ LÁ SEM SE PEDIR ────────────────────────────────────────────────
   *
   * Palavras dela: «eu quero que apareça isto automaticamente no final sem
   * pedirmos ou carregarmos para ver».
   *
   * Havia um botão («Ver as páginas lado a lado») e o botão só existia com
   * mais do que um mood board. O teste de antes carregava nele — o que quer
   * dizer que provava a vista DEPOIS de um clique, que é exactamente o clique
   * que ela não quer dar. Passa a provar que ela lá está sem ninguém lhe
   * tocar, e que o botão desapareceu.
   */
  function seedUmBoard() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [{ title: "Cerimónia", annotation: "", images: ["board/a.jpg"] }],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  it("aparece sozinha, sem botão nenhum para a abrir", async () => {
    seedDoisBoards();
    renderStudio();
    await screen.findByText("Vista de conjunto");
    expect(screen.queryByRole("button", { name: "Ver as páginas lado a lado" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fechar a vista de conjunto" })).toBeNull();
    // E o painel não tem «Fechar» PRÓPRIO: não há estado nenhum para onde
    // fechar. (Procurado DENTRO dele — «Fechar» é palavra de mais sítios.)
    const painel = screen.getByText("Vista de conjunto").closest("div.rounded-2xl") as HTMLElement;
    expect(within(painel).queryByRole("button", { name: "Fechar" })).toBeNull();
  });

  /**
   * E com UM board — ou nenhum — também. O botão antigo exigia dois, o que
   * era herança de isto ter sido uma vista dos mood boards; desde que passou a
   * mostrar o DOCUMENTO (capa, apresentação, orçamento, condições, contracapa)
   * a condição deixou de querer dizer nada.
   */
  it("e também com um só mood board, que era onde o botão nunca aparecia", async () => {
    seedUmBoard();
    renderStudio();
    await screen.findByText("Vista de conjunto");
  });

  it("não entra na grelha do índice — a grelha continua com duas colunas e dois filhos", async () => {
    seedDoisBoards();
    renderStudio();

    const vista = await screen.findByText("Vista de conjunto");
    const grelha = document.querySelector('[class*="grid-cols-[11rem"]');
    expect(grelha).toBeTruthy();
    // O índice e a lista dos boards, e mais nada: um terceiro filho é o que
    // mandava a lista para a coluna de 176 px.
    expect(grelha!.children).toHaveLength(2);
    expect(grelha!.contains(vista)).toBe(false);
  });

  /**
   * ── E NÃO É UMA QUARTA COLUNA ───────────────────────────────────────────
   *
   * O passo 1 é uma fila (`lg:flex`): índice, coluna de escrita, painel. Se a
   * vista subisse um nível ficava lá dentro como quarto filho, e umas folhas
   * lado a lado espremidas numa coluna não se comparam — que é a única coisa
   * que esta vista serve. Tem de ser o último filho da COLUNA DE ESCRITA.
   */
  it("fica dentro da coluna de escrita, e não como mais uma coluna da fila", async () => {
    seedDoisBoards();
    renderStudio();
    const vista = await screen.findByText("Vista de conjunto");
    const fila = document.querySelector('[class*="estudio:flex"][class*="estudio:gap-6"]');
    expect(fila).toBeTruthy();
    expect(fila!.contains(vista)).toBe(true);
    // Nenhum dos filhos directos da fila É a vista.
    for (const filho of Array.from(fila!.children)) {
      expect(filho.textContent === vista.textContent).toBe(false);
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PROPOSTA, NA LÍNGUA DO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «preparamos a proposta em português e, na parte de descarregar
 * ou gerar, um botão para escolher gerar em inglês».
 *
 * A escolha vive ao lado do «Descarregar PDF» e não num menu: é uma decisão
 * sobre AQUELE clique, e o documento guardado continua a ser um só, em
 * português. O que estes testes prendem:
 *
 *  1. o caminho por omissão — português, tal e qual como era;
 *  2. a escolha viaja mesmo até ao servidor;
 *  3. a ressalva está no ecrã ANTES de se carregar, e também para quem ouve o
 *     controlo em vez de o ver. Sem ela, um PDF meio inglês parece avariado.
 */
describe("gerar a proposta em inglês", () => {
  /** O duplo do `fetch` deste ficheiro, para o repor: um teste daqui troca-o
   *  por uma resposta que nunca chega, e `mockClear` não desfaz isso. */
  const fetchDeSempre = fetchMock.getMockImplementation()!;
  /** O espião do descarregamento, quando algum teste o põe. */
  let espiaoDoClique: { mockRestore: () => void } | null = null;

  afterEach(() => {
    fetchMock.mockImplementation(fetchDeSempre);
    espiaoDoClique?.mockRestore();
    espiaoDoClique = null;
  });

  /**
   * Chega ao passo onde se descarrega o PDF.
   *
   * O botão diz «Descarregar rascunho» quando há um erro por resolver (B1) —
   * e uma proposta em inglês com campos por traduzir tem um. Aqui o que se
   * prova é a língua, não o rascunho: serve qualquer dos dois.
   */
  async function irParaPrever(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    return await screen.findByRole("button", { name: /Descarregar (PDF|rascunho)/ });
  }

  /** O `idioma` do último POST à rota da proposta. */
  function idiomaEnviado(): unknown {
    const corpo = corpos("proposta-doc", "POST").at(-1) ?? "";
    return JSON.parse(corpo || "{}").idioma;
  }

  /** Os nomes com que os ficheiros foram descarregados, pela ordem. O estúdio
   *  descarrega por uma âncora fabricada à mão — é ali que o nome se lê. */
  function espiarDescarregamentos(): string[] {
    const nomes: string[] = [];
    espiaoDoClique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      nomes.push(this.download);
    });
    return nomes;
  }

  it("por omissão é português — e a barra diz que língua vai sair", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    const grupo = screen.getByRole("radiogroup", { name: "Idioma da proposta" });
    expect(within(grupo).getByRole("radio", { name: "Português" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(grupo).getByRole("radio", { name: /^Inglês/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  /**
   * ── A BARRA COLADA NÃO É SÍTIO PARA PROSA ──────────────────────────────
   * Ela mandou a fotografia do «Fazer proposta» num iPhone: o rodapé colado
   * ocupava quase metade do ecrã e tapava a linha do email do cliente a meio.
   *
   * A barra é `sticky` e `flex-wrap`, e um filho `w-full` não ocupa uma linha
   * — ocupa uma LINHA SÓ PARA ELE. A 375 px estas três frases sobre o inglês
   * dão cinco linhas, e a barra cresce outro tanto por cima do conteúdo.
   *
   * Já havia uma máquina a medir a barra e a reservar essa altura ao conteúdo.
   * Resolvia o sintoma e deixava a causa: uma barra livre de crescer cresce.
   *
   * Não se esconde a explicação — mostra-se quando é a pergunta. Com
   * «Português» escolhido fica uma linha; com «Inglês», abre inteira, porque
   * aí é a consequência do que ela acabou de fazer.
   */
  it("a explicação do inglês já não ocupa a barra: abre-se da pastilha", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    // A barra larga é uma linha só (14/10): a frase não está nela.
    expect(screen.queryByText("Em inglês muda a moldura do documento.")).toBeNull();
    expect(screen.queryByText(/Da tua prosa sai em inglês/)).toBeNull();
    // Está no painel da pastilha, inteira.
    const painel = await abrirPastilhaDoEnvio();
    expect(within(painel).getByText(/Da tua prosa sai em inglês/)).toBeVisible();
  });

  it("escolhido o inglês, a explicação abre inteira em qualquer ecrã", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    // O que o código antigo violava não era o TEXTO — era o facto de a escolha
    // do idioma não fazer diferença nenhuma a este parágrafo. Por isso o que
    // se compara é o antes e o depois da mesma renderização: sem esta linha, o
    // teste passava por vacuidade contra o código que ele existe para apanhar.
    const grupo = screen.getByRole("radiogroup", { name: "Idioma da proposta" });
    await user.click(within(grupo).getByRole("radio", { name: /^Inglês/ }));

    // Com o inglês escolhido, o painel da pastilha diz inteiro o que muda.
    const painel = await abrirPastilhaDoEnvio();
    expect(within(painel).getByText(/Da tua prosa sai em inglês/)).toBeVisible();
  });

  it("o caminho por omissão fica intacto: «pt», e o ficheiro chama-se proposta-…", async () => {
    seedDraftEmIngles(1);
    const nomes = espiarDescarregamentos();
    renderStudio();
    const user = userEvent.setup();
    await user.click(await irParaPrever(user));

    await waitFor(() => expect(corpos("proposta-doc", "POST")).toHaveLength(1));
    expect(idiomaEnviado()).toBe("pt");
    /**
     * O MESMO NOME QUE O CASAL VAI VER.
     *
     * Isto dizia `proposta-Maria & Zé.pdf` — um nome só deste botão, e o quarto
     * nome diferente para o mesmo documento (o anexo do email, a descarga do
     * link do casal e o portal tinham cada um o seu). Ela confere o PDF na
     * pasta de transferências e envia-o a seguir; se o que confere não se chama
     * como o que segue, a conferência não prova nada.
     *
     * Agora sai da mesma função que o servidor usa — casa, casal e data — e o
     * «&» e o acento saem, porque o mesmo nome viaja num cabeçalho e num anexo.
     */
    expect(nomes).toEqual(["Proposta-Liquen-Events-Maria-e-Ze-12-09-2026.pdf"]);
  });

  it("escolher inglês manda «en» e o ficheiro sai com outro nome", async () => {
    seedDraftEmIngles(1);
    const nomes = espiarDescarregamentos();
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    await user.click(screen.getByRole("radio", { name: /^Inglês/ }));
    await user.click(screen.getByRole("button", { name: /Descarregar PDF/ }));

    await waitFor(() => expect(corpos("proposta-doc", "POST")).toHaveLength(1));
    expect(idiomaEnviado()).toBe("en");
    // Duas versões da mesma proposta na pasta de transferências têm de se
    // distinguir sem as abrir — e é o «Proposal» que as distingue, como no
    // anexo que o casal recebe.
    expect(nomes).toEqual(["Proposal-Liquen-Events-Maria-e-Ze-12-09-2026.pdf"]);
  });

  it("a escolha alcança-se pelo teclado, com as setas", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    // O grupo é UMA paragem de tabulação (foco andante); a seta é que escolhe.
    screen.getByRole("radio", { name: "Português" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /^Inglês/ })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: /Descarregar PDF/ }));
    await waitFor(() => expect(idiomaEnviado()).toBe("en"));
  });

  /**
   * ── A ESCOLHA TEM DE DIZER O QUE FAZ ──────────────────────────────────────
   *
   * Só a MOLDURA é traduzida; os títulos, as descrições e as legendas que ela
   * escreveu saem tal e qual. Quem carrega em «Inglês» sem saber disto abre um
   * PDF meio inglês e conclui que está avariado.
   *
   * E a ressalva tem de nomear a DATA. É o caso que mais engana: lido no PDF
   * inglês, o cabeçalho diz «Event Date: 12 de setembro de 2026» — inglês o
   * rótulo, português a data — porque a data do evento é um campo preenchido e
   * não moldura. Uma ressalva que se ficasse por «o que escreveste» deixava-a
   * supor que as datas eram nossas e vinham traduzidas.
   */
  it("diz, antes do clique, que só a moldura muda de língua", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    // Está a um toque (o painel da pastilha) ANTES de se escolher o que fosse.
    const painel = await abrirPastilhaDoEnvio();
    const ressalva = within(painel).getByText(/Em inglês sai a moldura do documento/);
    expect(ressalva).toBeInTheDocument();
    // E diz, com todas as letras, que a data não vai traduzida.
    expect(ressalva.textContent).toMatch(/data/i);
  });

  it("e diz o mesmo a quem ouve o controlo em vez de o ver", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    const ingles = screen.getByRole("radio", { name: /^Inglês/ });
    // Começa pelo rótulo visível — o nome falado e o escrito não podem divergir.
    expect(ingles.getAttribute("aria-label")).toMatch(
      /^Inglês — o documento, o email ao cliente e a página onde ele responde saem em inglês; os campos que preencheste, incluindo a data do evento, ficam como os escreveste$/,
    );
  });

  it("«A gerar…» diz em que língua está a desenhar", async () => {
    seedDraftEmIngles(1);
    // A resposta da rota fica PENDURADA: o estado que se quer ver é o do meio,
    // e sem isto o botão volta a «Descarregar PDF» antes de se poder olhar.
    let libertar: (r: Response) => void = () => {};
    const pendurada = new Promise<Response>((r) => {
      libertar = r;
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("proposta-doc")) {
        pedidos.push({ url: String(input), init });
        return pendurada;
      }
      return fetchDeSempre(input, init);
    });

    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);
    await user.click(screen.getByRole("radio", { name: /^Inglês/ }));
    await user.click(screen.getByRole("button", { name: /Descarregar PDF/ }));

    // Dezenas de segundos numa proposta com fotografias a sério — tempo que
    // chega para deixar de haver a certeza do que se escolheu.
    //
    // A frase mudou de sítio, e é por isso que este teste mudou: enquanto o
    // documento se desenha, o botão dá o lugar ao cartão de espera partilhado
    // (`ui/EmCurso`) — um botão a rodar durante meio minuto lê-se como «isto
    // encravou». O que se prende continua a ser o mesmo: que a língua está
    // dita enquanto se espera.
    const frase = await screen.findByText(/A gerar o PDF em inglês…/);
    // E é o cartão de espera da casa, não um texto solto: o `role="status"` é
    // o que faz um leitor de ecrã dar pela espera sem ninguém lhe roubar o foco.
    expect(frase.closest('[role="status"]')).not.toBeNull();
    // E o botão não fica ao lado a convidar a um segundo pedido.
    expect(screen.queryByRole("button", { name: /Descarregar PDF/ })).toBeNull();
    await act(async () => {
      libertar(reply({ headers: {} }));
    });
  });

  /**
   * ── O ENVIO LEVA A LÍNGUA, E É A MESMA QUE SE PRÉ-VISUALIZOU ──────────────
   *
   * O envio não mandava língua nenhuma, e a decisão de então estava escrita: um
   * PDF inglês dentro de um email português seria pior do que os dois em
   * português. Agora o email, a página do aceite e a segunda descarga seguem a
   * língua da proposta, portanto a razão caiu — e escolher «Inglês» para
   * pré-visualizar e receber uma proposta portuguesa a seguir seria a
   * surpresa maior das duas.
   */
  it("o envio ao cliente leva a língua escolhida", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);
    await user.click(screen.getByRole("radio", { name: /^Inglês/ }));

    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);

    await waitFor(() => {
      const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c));
      expect(enviados.find((c) => c.mode === "send")?.idioma).toBe("en");
    });
  });

  it("e no caminho de sempre manda «pt», dito e não subentendido", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);

    await waitFor(() => {
      const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c));
      expect(enviados.find((c) => c.mode === "send")?.idioma).toBe("pt");
    });
  });

  /**
   * A ESCOLHA TEM DE ESTAR ONDE SE ENVIA, E NÃO SÓ ONDE SE PRÉ-VISUALIZA.
   *
   * Os passos do estúdio são clicáveis: dá para ir do Conteúdo direito ao
   * Enviar sem passar pela pré-visualização. Enquanto a língua só desenhava um
   * PDF para ela ver, isso não tinha consequência nenhuma; agora decide o email
   * que o casal recebe e a página onde ele responde. Quem envia sem passar pelo
   * passo 2 tem de poder escolher — e de VER o que está escolhido.
   */
  it("o passo 3 deixa escolher a língua, e diz o que ela decide", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));

    const grupo = await screen.findByRole("radiogroup", { name: "Idioma da proposta" });
    expect(within(grupo).getByRole("radio", { name: "Português" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // E diz, antes do clique, o que sai em inglês além do PDF — no nome do
    // próprio «Inglês» (a nota escrita saiu com o bloco do envio, 14/10).
    expect(
      within(grupo)
        .getByRole("radio", { name: /^Inglês/ })
        .getAttribute("aria-label"),
    ).toMatch(/email ao cliente e a página onde ele responde/);

    await user.click(within(grupo).getByRole("radio", { name: /^Inglês/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);

    await waitFor(() => {
      const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c));
      expect(enviados.find((c) => c.mode === "send")?.idioma).toBe("en");
    });
  });

  /** A escolha é UMA, e há UM controlo para ela. Com os cinco passos (A2), o
   *  selector da pré-visualização e o do envio ficaram no mesmo ecrã — dois
   *  controlos para o mesmo estado. Ficou o da barra, ao lado dos botões. */
  it("no «Rever e enviar» há um selector da língua só", async () => {
    seedDraftEmIngles(1);
    renderStudio("Rever e enviar");
    await screen.findByRole("button", { name: /Gerar e enviar ao cliente|Ver o PDF final/ });
    expect(screen.getAllByRole("radiogroup", { name: "Idioma da proposta" })).toHaveLength(1);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A LÍNGUA ESCOLHIDA TEM DE SOBREVIVER A FECHAR O SEPARADOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O relato: «não estava a dar; depois mudei para inglês e deu». É o sintoma
   * exacto de uma escolha que se apaga sozinha — ela escolhe «Inglês», traduz,
   * pré-visualiza, fecha o portátil, volta no dia seguinte e o selector está em
   * «Português» outra vez, sem nada a dizê-lo. Carrega em «Inglês», e «dá».
   *
   * E o custo não é ela ter de carregar duas vezes. A língua vai GRAVADA com o
   * envio: decide o email que o casal recebe, o nome do anexo, a página onde
   * ele responde e a segunda descarga. Uma proposta escrita e revista em
   * inglês, enviada com o selector reposto, chega ao casal britânico em
   * português — e no ecrã dela nada indicou que se tinha perdido a escolha.
   *
   * Fica no `meta` do rascunho, ao lado do interruptor bilingue e da mensagem
   * ao cliente, e pela mesma razão: não é conteúdo da proposta, é a maneira
   * como ela está a trabalhar nesta.
   */
  it("a língua escolhida volta com o rascunho", async () => {
    seedDraftEmIngles(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);
    await user.click(screen.getByRole("radio", { name: /^Inglês/ }));

    // Fica gravada ao lado do rascunho — é o que sobrevive a fechar o separador.
    await waitFor(() =>
      expect(localStorage.getItem(`${DRAFT_KEY}:meta`) ?? "").toContain('"idioma":"en"'),
    );

    // O separador fecha e volta a abrir.
    cleanup();
    renderStudio();
    const outra = userEvent.setup();
    await irParaPrever(outra);
    expect(
      within(screen.getByRole("radiogroup", { name: "Idioma da proposta" })).getByRole("radio", {
        name: /^Inglês/,
      }),
    ).toHaveAttribute("aria-checked", "true");
  });

  /** E o envio que se segue a essa reabertura leva «en» — que é o que o casal
   *  recebe. Sem isto, o teste de cima provava um pixel e não o desfecho. */
  it("e o envio depois de reabrir leva a língua que ela tinha escolhido", async () => {
    seedDraftEmIngles(1);
    localStorage.setItem(`${DRAFT_KEY}:meta`, JSON.stringify({ idioma: "en" }));
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);

    await waitFor(() => {
      const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c));
      expect(enviados.find((c) => c.mode === "send")?.idioma).toBe("en");
    });
  });

  /** Voltar atrás também tem de pegar: um `meta` com «en» não pode ressuscitar
   *  uma escolha que ela desfez. É a diferença entre guardar a escolha e
   *  guardar só metade dela. */
  it("e voltar a «Português» também fica guardado", async () => {
    seedDraft(1);
    localStorage.setItem(`${DRAFT_KEY}:meta`, JSON.stringify({ idioma: "en" }));
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);
    await user.click(screen.getByRole("radio", { name: "Português" }));

    await waitFor(() =>
      expect(localStorage.getItem(`${DRAFT_KEY}:meta`) ?? "").toContain('"idioma":"pt"'),
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «COPIAR RESUMO» — PARA QUANDO O CASAL PREFERE WHATSAPP
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Toda a comunicação sai por email; o botão dá as três ou quatro linhas
 * prontas a colar noutro sítio, com os números que o estúdio já tem
 * (`totaisDaProposta`) — nunca uma conta nova.
 */
describe("o botão «Copiar resumo»", () => {
  afterEach(() => {
    // O `clipboard` não existe por omissão no ambiente de testes (é assim que
    // se prova o caminho de recurso); o que um teste lhe põe não pode
    // sobreviver para o seguinte.
    Reflect.deleteProperty(navigator, "clipboard");
  });

  /**
   * A área de transferência a funcionar: `writeText` resolve.
   *
   * `userEvent.setup()` instala o SEU PRÓPRIO duplo de `navigator.clipboard`
   * por omissão (`writeToClipboard: true`, para as suas APIs `.copy()` /
   * `.paste()`) — e o instala DEPOIS de qualquer `Object.defineProperty` feito
   * antes, apagando-o. Por isso o `user` nasce aqui, com essa instalação
   * desligada, e só depois é que se define o duplo que os testes leem.
   */
  function comClipboardAFuncionar() {
    const user = userEvent.setup({ writeToClipboard: false });
    const writeText = vi.fn(async (_texto: string) => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    return { user, writeText };
  }

  /** Antes do envio já não há «Copiar resumo»: saiu com o bloco «Enviar ao
   *  cliente» (14/10, pedido dela). Fica no painel do «Proposta enviada». */
  async function enviarEAbrirOFim(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    expect(screen.queryByRole("button", { name: "Copiar resumo" })).toBeNull();
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);
    await screen.findByRole("button", { name: "Enviar de novo / nova revisão" });
  }

  it("depois de enviar, copia o nome, a data e o valor a pagar", async () => {
    seedDraft(1);
    const { user, writeText } = comClipboardAFuncionar();
    renderStudio();
    await enviarEAbrirOFim(user);

    await user.click(await screen.findByRole("button", { name: "Copiar resumo" }));

    // O `writeText` é assíncrono; espera-se pelo aviso de sucesso antes de
    // ler o que lhe foi passado, senão a asserção corre antes da promessa
    // resolver.
    await screen.findByText(/^Resumo copiado/);
    expect(writeText).toHaveBeenCalledTimes(1);
    const texto = writeText.mock.calls[0][0] as string;
    expect(texto).toContain("Maria & Zé");
    expect(texto).toContain("12 de setembro de 2026");
    // 3.000 € + IVA (23%) = 3.690 €, o mesmo bloco que a barra do fundo e o
    // resumo do passo mostram (`totaisDaProposta`).
    expect(texto).toContain("3.690,00");
  });

  it("depois de enviar, o resumo já leva o link — sem precisar de reabrir o estúdio", async () => {
    seedDraft(1);
    propostaDoc = reply({
      json: {
        ok: true,
        emailed: true,
        estado: "enviada",
        acceptUrl: "https://liquen-events.com/proposta/abc.sig",
      },
    });
    const { user, writeText } = comClipboardAFuncionar();
    renderStudio();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);
    await screen.findByRole("button", { name: "Enviar de novo / nova revisão" });

    await user.click(screen.getByRole("button", { name: "Copiar resumo" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const texto = writeText.mock.calls.at(-1)?.[0] as string;
    expect(texto).toContain("https://liquen-events.com/proposta/abc.sig");
  });

  it("sem área de transferência (Safari sem gesto, permissões): nunca um erro seco, o texto fica visível e seleccionado", async () => {
    seedDraft(1);
    // O `userEvent.setup()` instala SEMPRE um `navigator.clipboard` seu
    // (mesmo com `writeToClipboard: false`, que só desliga a escrita real por
    // trás dos gestos de copiar/colar) — e é um duplo A FUNCIONAR, o que
    // impediria precisamente o caminho de recurso que este teste prende.
    // Tira-se a seguir, para o `navigator.clipboard` ficar por definir de
    // propósito, como aconteceria num Safari sem o gesto ou sem permissões.
    const user = userEvent.setup({ writeToClipboard: false });
    Reflect.deleteProperty(navigator, "clipboard");
    renderStudio();
    await enviarEAbrirOFim(user);

    await user.click(await screen.findByRole("button", { name: "Copiar resumo" }));

    const caixa = (await screen.findByRole("textbox", {
      name: "Resumo da proposta, para copiar à mão",
    })) as HTMLTextAreaElement;
    expect(caixa.tagName).toBe("TEXTAREA");
    expect(caixa.value).toContain("Maria & Zé");
    // Visível E seleccionada — pronta a copiar à mão com Cmd/Ctrl+C.
    await waitFor(() => expect(caixa.selectionStart).toBe(0));
    expect(caixa.selectionEnd).toBe(caixa.value.length);
    // Nenhum aviso de erro seco: a caixa É a resposta. (O contentor
    // `role="alert"` do `ToastProvider` existe sempre, vazio; o que se prova
    // é que não tem NENHUM aviso lá dentro.)
    expect(
      screen.queryByRole("alert", { name: /não é o que seguiu para o cliente/i })?.textContent ??
        "",
    ).toBe("");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAIXA DA MENSAGEM SAIU (14/10)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: tirar o bloco «Enviar ao cliente» e deixar só o email que o
 * cliente vai receber. O texto do email é editável e é o que segue; uma nota
 * pessoal escreve-se lá. Um rascunho antigo com mensagem gravada deixa de a
 * mandar — o que segue é o que está à vista.
 */
describe("o passo 5 fica só com o email", () => {
  const SIDE_KEY = `${DRAFT_KEY}:meta`;

  function envio(): Record<string, unknown> {
    return JSON.parse(corpos("proposta-doc", "POST").at(-1) ?? "{}");
  }

  it("sem a caixa, sem o resumo e sem o «Copiar resumo» antes do envio", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await screen.findByText("O email que o cliente vai receber");
    expect(screen.queryByLabelText("Mensagem para o cliente")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Enviar ao cliente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copiar resumo" })).toBeNull();
  });

  it("um rascunho antigo com mensagem gravada já não a manda", async () => {
    seedDraft(1);
    localStorage.setItem(SIDE_KEY, JSON.stringify({ mensagem: "O arco fica incluído." }));
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);

    await waitFor(() => expect(envio().mode).toBe("send"));
    expect(envio()).not.toHaveProperty("mensagem");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA BILINGUE — DUAS CAIXAS POR CAMPO, E SÓ QUANDO SE PEDEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decisão dela: cada campo de prosa passa a ter uma caixa portuguesa e uma
 * inglesa, escritas por ela. O interruptor existe porque o `ServicesEditor` é o
 * ecrã mais escrito da casa — dobrar-lhe a altura para toda a gente, incluindo
 * as propostas que nunca vão a inglês, era pagar todos os dias por um caso
 * ocasional.
 *
 * O primeiro teste é o que protege as propostas só-portuguesas: desligado, não
 * há uma única caixa inglesa no ecrã.
 */
describe("proposta bilingue", () => {
  const interruptor = () => screen.getByRole("button", { name: /Proposta bilingue/i });
  /** Todas as caixas inglesas desenhadas agora — reconhecem-se pelo `data-campo`
   *  terminado em `:en`, que é a mesma pega por onde o salto as encontra. */
  const caixasInglesas = () => document.querySelectorAll("[data-campo$=':en']");

  it("desligado, o ecrã é o de hoje: nenhuma caixa inglesa no DOM", async () => {
    seedDraft(1);
    renderStudio();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    expect(caixasInglesas()).toHaveLength(0);
  });

  it("ligado, cada campo de prosa passa a ter duas caixas", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    await waitFor(() => expect(caixasInglesas().length).toBeGreaterThan(0));
    // O par do título do mood board: a portuguesa e a inglesa, com a mesma
    // chave e o sufixo que as distingue.
    expect(document.querySelector('[data-campo="boardTitulo:0"]')).toBeTruthy();
    expect(document.querySelector('[data-campo="boardTitulo:0:en"]')).toBeTruthy();
  });

  it("a caixa inglesa diz-se em voz alta — quem ouve o ecrã ouve a diferença", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const inglesa = await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]');
      if (!el) throw new Error("ainda não");
      return el as HTMLInputElement;
    });
    expect(inglesa.getAttribute("aria-label") ?? "").toMatch(/ingl[êe]s/i);
  });

  it("escrever na caixa inglesa grava-a no rascunho", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const inglesa = await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]');
      if (!el) throw new Error("ainda não");
      return el as HTMLInputElement;
    });
    await user.type(inglesa, "Ceremony");
    await waitFor(
      () => expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain('"titleEn":"Ceremony"'),
      { timeout: 3000 },
    );
    // E o português fica onde estava.
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).moodBoards[0].title).toBe("Cerimónia");
  });

  /**
   * O CASO DO OUTRO PORTÁTIL.
   *
   * O interruptor vive no `meta` do rascunho, que é estado do EDITOR. Abrir a
   * proposta noutro computador, restaurá-la do servidor ou copiá-la de outra
   * deixa o `meta` para trás — e sem esta regra os textos ingleses existiam no
   * documento e o ecrã não os mostrava: invisíveis e editáveis por acidente.
   */
  it("uma proposta que já traz inglês abre com o interruptor LIGADO, sem meta nenhum", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [{ title: "Cerimónia", titleEn: "Ceremony", images: ["board/f.jpg"] }],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    renderStudio();
    await waitFor(() => expect(caixasInglesas().length).toBeGreaterThan(0));
    expect(
      (document.querySelector('[data-campo="boardTitulo:0:en"]') as HTMLInputElement).value,
    ).toBe("Ceremony");
  });

  /**
   * O RESTAURO DO RASCUNHO É ZONA MINADA — ver o bloco «CORRE UMA VEZ SÓ» no
   * `ProposalStudio.tsx`. O `meta.bilingue` lê-se DENTRO do efeito que já
   * existe; um efeito novo a ler o `localStorage` traria de volta o defeito que
   * abria o estúdio vazio com o trabalho todo guardado.
   */
  it("o interruptor volta ligado do meta, e as traduções do rascunho ficam lá", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [{ title: "Cerimónia", images: ["board/f.jpg"] }],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    localStorage.setItem(`${DRAFT_KEY}:meta`, JSON.stringify({ bilingue: true }));
    renderStudio();
    await waitFor(() => expect(caixasInglesas().length).toBeGreaterThan(0));
    // E o documento restaurado é o dela, não um vazio escrito por cima.
    expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0);
  });

  it("o estado do interruptor fica gravado ao lado do rascunho, e não dentro dele", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    await waitFor(
      () => expect(localStorage.getItem(`${DRAFT_KEY}:meta`) ?? "").toContain('"bilingue":true'),
      { timeout: 3000 },
    );
    // O documento não ganhou um campo que não diz nada sobre a proposta.
    expect(localStorage.getItem(DRAFT_KEY) ?? "").not.toContain("bilingue");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE VAI SAIR EM PORTUGUÊS, DITO ANTES DE SAIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A caixa inglesa vazia cai para o português, calada e sem marca no papel. O
 * preço de o fazer calado são estes três avisos, e é por eles que a decisão
 * deixa de ser tomada por distracção: o contador em cima do botão que gera, a
 * verificação da Conferência e o painel «Por traduzir».
 */
describe("os avisos da proposta inglesa", () => {
  /** Um rascunho com prosa por traduzir: um grupo, uma linha e uma rubrica. */
  function seedPorTraduzir() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ title: "Decoração Floral", items: [{ label: "Decor Cerimónia" }] }],
        moodBoards: [],
        budgetItems: ["Decor Cocktail"],
        coverImages: ["", ""],
        totalLabel: "Valor Total Decoração",
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  /** O selector do idioma é um `Segmented` — os segmentos são `role="radio"`,
   *  e o nome acessível vem do `ariaLabel` que explica o que a escolha faz. */
  const escolherIngles = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole("radio", { name: /^Inglês/ })[0]);
  };

  it("em português não há painel nem contador — o ecrã é o de sempre", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    expect(screen.queryByText(/Por traduzir/i)).toBeNull();
  });

  it("com «Inglês» escolhido, o painel lista os campos que vão sair em português", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await escolherIngles(user);
    const painel = await screen.findByRole("region", { name: /Por traduzir/i });
    expect(within(painel).getByText(/Serviços · grupo 1/)).toBeTruthy();
    expect(within(painel).getByText(/Orçamento · linha 1/)).toBeTruthy();
  });

  it("a Conferência passa a contar os campos por traduzir em vez da frase antiga", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await escolherIngles(user);
    const conferencia = await screen.findByRole("region", { name: /Conferência/i });
    await waitFor(() =>
      expect(within(conferencia).getByText(/não têm versão inglesa/i)).toBeTruthy(),
    );
    expect(conferencia.textContent).not.toContain("a proposta é escrita em português");
  });

  /**
   * «Ficar em português» transforma o esquecimento em decisão. Sem ele, um
   * campo que não precisa de tradução — «Lisianthus» — contava como falta para
   * sempre, e um aviso sempre aceso é um aviso que se aprende a ignorar.
   */
  it("«Ficar em português» copia o texto e faz a contagem baixar", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await escolherIngles(user);
    const painel = await screen.findByRole("region", { name: /Por traduzir/i });
    // Quatro: o título do grupo, a linha, a rubrica do orçamento e o rótulo do
    // total — todos com português escrito e a caixa inglesa em branco.
    expect(within(painel).getAllByRole("button", { name: /^Ficar em português$/ })).toHaveLength(4);
    // A linha do título do grupo, pelo rótulo — e não a primeira da lista: a
    // ordem é a dos campos no documento, e o rótulo do total vem antes.
    const linha = within(painel)
      .getByText(/Serviços · grupo 1/)
      .closest("li")!;
    await user.click(
      within(linha as HTMLElement).getByRole("button", { name: /^Ficar em português$/ }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: /Por traduzir/i })).getAllByRole("button", {
          name: /^Ficar em português$/,
        }),
      ).toHaveLength(3),
    );
    // E o que ficou gravado é o português na caixa inglesa — a decisão, escrita.
    await waitFor(
      () => expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain('"titleEn":"Decoração Floral"'),
      { timeout: 3000 },
    );
  });

  it("«Traduzir» leva ao conteúdo, acende as caixas inglesas e foca a certa", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await escolherIngles(user);
    const painel = await screen.findByRole("region", { name: /Por traduzir/i });
    await user.click(within(painel).getAllByRole("button", { name: /^Traduzir$/ })[0]);
    // O interruptor acende-se sozinho: saltar para uma caixa que não está
    // desenhada deixava-a a olhar para o campo português sem perceber porquê.
    const caixa = await waitFor(() => {
      const el = document.querySelector('[data-campo="grupoTitulo:0:en"]');
      if (!el) throw new Error("ainda não");
      return el as HTMLInputElement;
    });
    expect(caixa).toBeTruthy();
  });

  it("o contador em cima do botão que gera diz o que vai acontecer, antes do clique", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    // A frase do CONTADOR, que é diferente da da Conferência de propósito: o
    // passo «Enviar» está desenhado (escondido) ao mesmo tempo que este, e uma
    // procura por palavras comuns encontrava as duas.
    const contador = /ainda não têm versão inglesa/i;
    expect(screen.queryByText(contador)).toBeNull();
    await escolherIngles(user);
    // No ecrã largo o contador vive no painel da pastilha (14/10).
    const painel = await abrirPastilhaDoEnvio();
    await waitFor(() => expect(within(painel).getByText(contador)).toBeTruthy());
  });

  it("a ressalva já não promete que a prosa dela fica toda como está", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    const painel = await abrirPastilhaDoEnvio();
    const ressalva = within(painel).getByText(/Em inglês sai a moldura do documento/i);
    expect(ressalva.textContent).toMatch(/caixas «EN»/);
    expect(ressalva.textContent).not.toMatch(/ficam como os escreveste/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «TRADUZIR PARA INGLÊS» — O BOTÃO QUE AINDA NÃO TEM MOTOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decisão dela: o sistema traduz, ela revê o que quiser. O motor não existe —
 * não há serviço escolhido nem chave nenhuma no projecto —, e o que existe é a
 * fronteira onde ele vai entrar (`proposal-traducao.ts`).
 *
 * Enquanto não existir, o botão diz-o. Um botão que finge traduzir e não traduz
 * mandava-a enviar uma proposta a acreditar que estava traduzida — que é o
 * único desfecho pior do que não haver botão nenhum.
 */
describe("traduzir para inglês", () => {
  const interruptor = () => screen.getByRole("button", { name: /Proposta bilingue/i });
  /** O duplo do `fetch` deste ficheiro, para o repor: um teste daqui troca-o
   *  por um servidor que recusa, e `mockClear` não desfaz isso. */
  const fetchDeSempre = fetchMock.getMockImplementation()!;
  afterEach(() => {
    fetchMock.mockImplementation(fetchDeSempre);
  });

  it("o botão só aparece com a proposta bilingue ligada", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /Traduzir para inglês/i })).toBeNull();
    await user.click(interruptor());
    expect(await screen.findByRole("button", { name: /Traduzir para inglês/i })).toBeTruthy();
  });

  it("sem motor configurado, o botão está desligado e DIZ que ainda não está ligado", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const botao = await screen.findByRole("button", { name: /Traduzir para inglês/i });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    // A razão está à vista, e não escondida num `title` que ninguém abre.
    expect(screen.getByText(/tradução automática ainda não está ligada/i)).toBeTruthy();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «AINDA NÃO ESTÁ LIGADA» É UMA AFIRMAÇÃO SOBRE A CONFIGURAÇÃO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O estúdio pergunta ao servidor, uma vez, ao abrir. Se a pergunta não chegar
   * a ter resposta — sessão caducada, rede em baixo, um 500 — o botão tem de
   * ficar desligado na mesma: prometer uma tradução que não vai acontecer é
   * pior. O que NÃO pode acontecer é dizer-lhe que falta configurar uma chave.
   *
   * Essa frase manda-a à Vercel procurar uma variável de ambiente, ou fá-la
   * desistir e escrever as caixas inglesas à mão, quando o que estava avariado
   * se curava recarregando a página. É a diferença entre «isto não existe» e
   * «não consegui perguntar», e é a diferença entre uma tarde perdida e um F5.
   */
  it("uma pergunta que não teve resposta NÃO se lê como «falta a chave»", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      // A rota da tradução responde 401 — a sessão do back office caducou. Tudo
      // o resto continua a responder como sempre.
      if (String(input).includes("/propostas/traduzir")) {
        pedidos.push({ url: String(input), init });
        return reply({ ok: false, status: 401, json: { error: "Não autorizado" } });
      }
      return fetchDeSempre(input, init);
    });
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());

    // O botão fica desligado — isso é que está certo e não muda.
    const botao = await screen.findByRole("button", { name: /Traduzir para inglês/i });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    // Mas a frase não pode culpar a configuração de um problema que não é dela.
    expect(screen.queryByText(/tradução automática ainda não está ligada/i)).toBeNull();
    // Diz o que se sabe — que não se soube — e o que fazer a seguir.
    expect(screen.getByText(/não deu para saber/i)).toBeTruthy();
    expect(screen.getByText(/recarrega/i)).toBeTruthy();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ENQUANTO A TRADUÇÃO VEM A CAMINHO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Pedido dela: «quero estes detalhes de animações em imensas coisas
   * espalhadas pelo site» — ou seja, onde ela carrega e fica sem saber se
   * aquilo está a andar, tem de passar a ver que está.
   *
   * O botão dizia «A traduzir…» e mais nada, durante uma ida à rede que numa
   * proposta cheia são vários segundos. Passa a ser o cartão de espera da casa
   * (`ui/EmCurso`), no lugar onde o botão estava — e diz QUANTOS campos vão,
   * que é do que o código sabe. Quantos já voltaram não se diz, porque é um
   * pedido só e inventar essa contagem seria mentir.
   */
  it("enquanto traduz, o cartão de espera diz quantos campos vão", async () => {
    traducaoLigadaNoServidor = true;
    seedDraft(1);
    // A resposta fica PENDURADA: o estado que se quer ver é o do meio.
    let libertar: () => void = () => {};
    const pendurada = new Promise<void>((r) => {
      libertar = r;
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/propostas/traduzir") && (init?.method ?? "GET") !== "GET") {
        await pendurada;
      }
      return fetchDeSempre(input, init);
    });

    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const botao = await waitFor(async () => {
      const b = (await screen.findByRole("button", {
        name: /Traduzir para inglês/i,
      })) as HTMLButtonElement;
      if (b.disabled) throw new Error("ainda a perguntar ao servidor");
      return b;
    });
    await user.click(botao);

    const frase = await screen.findByText(/A traduzir para inglês…/);
    // É o cartão de espera da casa, e não um texto solto: o `role="status"` é o
    // que faz um leitor de ecrã dar pela espera sem lhe roubar o foco.
    expect(frase.closest('[role="status"]')).not.toBeNull();
    // Quantos campos vão — o número que o servidor ainda não sabe, mas o
    // documento sabe.
    expect(screen.getByText(/campos? ao serviço de tradução/)).toBeTruthy();
    // E o botão não fica ao lado a convidar a um segundo pedido.
    expect(screen.queryByRole("button", { name: /Traduzir para inglês/i })).toBeNull();

    await act(async () => {
      libertar();
    });
  });

  it("com o serviço ligado, o botão preenche as caixas «EN» de uma vez", async () => {
    traducaoLigadaNoServidor = true;
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const botao = await waitFor(async () => {
      const b = (await screen.findByRole("button", {
        name: /Traduzir para inglês/i,
      })) as HTMLButtonElement;
      if (b.disabled) throw new Error("ainda a perguntar ao servidor");
      return b;
    });
    await user.click(botao);
    const caixa = await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]') as HTMLInputElement;
      if (!el || !el.value) throw new Error("ainda não");
      return el;
    });
    /*
     * «Ceremony», e não «EN: Cerimónia».
     *
     * «Cerimónia» é um dos termos do GLOSSÁRIO da casa (ver
     * `proposal-traducao.ts`): tem uma tradução única e verificada, e por isso
     * nem chega a ir ao motor. O que este teste continua a provar é o que diz
     * provar — o botão preenche a caixa inglesa —, e passa a provar também que
     * o glossário chega ao estúdio. O caminho do motor está coberto no teste do
     * próprio tradutor, com textos que ninguém pôs no glossário.
     */
    expect(caixa.value).toBe("Ceremony");
    // O português não se mexe: a tradução vive nos campos `…En`, e é por isso
    // que ela pode corrigi-la sem perder o que escreveu.
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).moodBoards[0].title).toBe("Cerimónia");
  });

  it("um serviço que recusa não estraga o documento, e diz porquê", async () => {
    traducaoLigadaNoServidor = true;
    traducaoResponde = () =>
      reply({ ok: false, status: 502, json: { error: "a quota de tradução deste mês acabou" } });
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const botao = await waitFor(async () => {
      const b = (await screen.findByRole("button", {
        name: /Traduzir para inglês/i,
      })) as HTMLButtonElement;
      if (b.disabled) throw new Error("ainda a perguntar ao servidor");
      return b;
    });
    await user.click(botao);
    // A frase vem do servidor, escrita em português, e nunca leva a chave.
    expect(await screen.findByText(/quota de tradução deste mês acabou/i)).toBeTruthy();
    const caixa = document.querySelector('[data-campo="boardTitulo:0:en"]') as HTMLInputElement;
    expect(caixa.value).toBe("");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * METADE TRADUZIDA NÃO PODE APARECER A VERDE E MAIS NADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O motor manda os textos em lotes de 50, e um lote que falhe volta VAZIO nas
   * suas posições — de propósito, para não deitar fora os que já vieram. Só
   * atira quando NENHUM passa.
   *
   * Numa proposta grande, portanto, um 429 ou uma quota que acaba no segundo
   * lote devolve os primeiros campos traduzidos e o resto em português, sem
   * erro nenhum. O ecrã dizia «N campos traduzidos», a verde, e mais nada.
   *
   * Do lado dela isto lê-se como «não está a dar»: dá numa proposta pequena e
   * não dá numa grande. E o número que aparece está certo — o que faltava era a
   * outra metade da frase, e a indicação de que carregar outra vez adianta (o
   * que já veio está escrito e não se volta a pedir).
   */
  it("o que foi pedido e não voltou é DITO, e não escondido atrás do contador", async () => {
    traducaoLigadaNoServidor = true;
    // O primeiro texto volta traduzido; os outros voltam vazios — a forma de um
    // lote que falhou no meio de uma proposta grande.
    traducaoResponde = (textos) =>
      reply({ json: { textos: textos.map((t, i) => (i === 0 ? `EN: ${t}` : "")) } });
    // Um documento com prosa que chegue para haver «o primeiro» e «os outros».
    seedDraft(1);
    const rascunho = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    rascunho.serviceGroups = [
      {
        title: "Decoração Floral",
        items: [
          { label: "Decor Cerimónia", desc: "Arco e coxia" },
          { label: "Decor Jantar", desc: "Centros de mesa" },
        ],
      },
    ];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rascunho));

    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const botao = await waitFor(async () => {
      const b = (await screen.findByRole("button", {
        name: /Traduzir para inglês/i,
      })) as HTMLButtonElement;
      if (b.disabled) throw new Error("ainda a perguntar ao servidor");
      return b;
    });
    await user.click(botao);

    // Os que vieram entram — isso não muda.
    expect(await screen.findByText(/campo traduzido|campos traduzidos/i)).toBeTruthy();
    // E os que não vieram são ditos, com o número e o que fazer a seguir.
    const aviso = await screen.findByText(/não voltaram do serviço/i);
    expect(aviso.textContent).toMatch(/outra vez/i);
  });

  it("as caixas continuam a poder ser escritas à mão enquanto não há motor", async () => {
    // É o que impede a mudança de direcção de deixar a funcionalidade parada à
    // espera de uma chave: ela pode traduzir uma proposta hoje, à mão.
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const caixa = await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]');
      if (!el) throw new Error("ainda não");
      return el as HTMLInputElement;
    });
    await user.type(caixa, "Ceremony");
    expect(caixa.value).toBe("Ceremony");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TRADUZIR COM AS FOTOS A MEIO — «JÁ ESTAVA A ALTERAR FOTOS»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O relato, à letra: «quando alterou para inglês, deu, mas já estava a alterar
 * fotos». A tradução DEU — as caixas «EN» encheram-se, o toast disse que sim —
 * e as fotos que ela estava a mexer nesse intervalo desapareceram.
 *
 * A tradução é uma ida à rede: entre a carregada no botão e a resposta passam
 * segundos, e nesses segundos o estúdio continua vivo. Ela carrega uma foto,
 * tira outra, arruma a grelha. Se a resposta voltar e REPUSER o documento que
 * existia no instante do clique, tudo o que ela fez entretanto vai fora — e
 * vai fora em silêncio, porque a gravação automática grava logo a seguir a
 * versão amputada, no `localStorage` e no servidor.
 *
 * É a mesma disciplina que a cópia de fotos da biblioteca já segue, escrita lá
 * ao lado: «se ela já tiver mexido no bloco entretanto (arrastado, removido uma
 * foto), a troca acompanha na mesma em vez de escrever por cima do que ela
 * fez». A tradução tem de a seguir também.
 */
describe("traduzir com as fotos a meio", () => {
  const interruptor = () => screen.getByRole("button", { name: /Proposta bilingue/i });
  const celulas = () => Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"));
  const fotosDoRascunho = (): string[] => {
    const cru = localStorage.getItem(DRAFT_KEY);
    if (!cru) return [];
    return (JSON.parse(cru)?.moodBoards?.[0]?.images ?? []) as string[];
  };

  /**
   * A rota da tradução fica PRESA até se soltar a corda que isto devolve.
   *
   * É a janela real: o pedido saiu, a resposta ainda não chegou, e o estúdio
   * continua a responder às mãos dela.
   */
  function traducaoPresa(): () => void {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => {
      soltar = r;
    });
    traducaoResponde = (textos) =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => {
          await espera;
          return { textos: textos.map((t) => `EN: ${t}`) };
        },
      }) as unknown as Response;
    return () => soltar();
  }

  /** Liga o bilingue e devolve o botão de traduzir já activo. */
  async function botaoDeTraduzir(user: ReturnType<typeof userEvent.setup>) {
    await user.click(interruptor());
    return waitFor(async () => {
      const b = (await screen.findByRole("button", {
        name: /Traduzir para inglês/i,
      })) as HTMLButtonElement;
      if (b.disabled) throw new Error("ainda a perguntar ao servidor");
      return b;
    });
  }

  /** Espera pela caixa inglesa preenchida — a prova de que a tradução chegou. */
  async function traducaoChegou() {
    await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]') as HTMLInputElement;
      if (!el || !el.value) throw new Error("ainda não");
    });
  }

  it("uma foto acrescentada enquanto a tradução vai a caminho NÃO desaparece", async () => {
    traducaoLigadaNoServidor = true;
    const soltar = traducaoPresa();
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));

    // O interruptor da proposta bilingue vive no passo do Evento; o mood board,
    // no da Inspiração.
    const botao = await botaoDeTraduzir(user);
    await user.click(botao);
    irAoPasso("Inspiração");

    // Ela não fica a olhar para o botão: continua a montar o mood board.
    await user.click(
      await screen.findByRole("button", { name: /Escolher da biblioteca de temas/ }),
    );
    await user.click(await screen.findByRole("button", { name: "escolher-foto-de-teste" }));
    expect(celulas()).toHaveLength(2);

    // E só agora é que a tradução responde.
    await act(async () => {
      soltar();
      await Promise.resolve();
    });
    await traducaoChegou();

    // A tradução entrou — e a foto que ela pôs continua lá, no ecrã e no
    // rascunho gravado.
    expect(celulas()).toHaveLength(2);
    await waitFor(() => expect(fotosDoRascunho()).toContain("board/nova.jpg"));
  });

  it("uma foto removida enquanto a tradução vai a caminho NÃO volta", async () => {
    traducaoLigadaNoServidor = true;
    const soltar = traducaoPresa();
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));

    // O interruptor da proposta bilingue vive no passo do Evento; o mood board,
    // no da Inspiração.
    const botao = await botaoDeTraduzir(user);
    await user.click(botao);
    irAoPasso("Inspiração");

    // Remover passou a ser uma acção da folha, e não um círculo em cima da
    // fotografia — ver «SEIS CÍRCULOS EM CIMA DA FOTOGRAFIA». O caminho é o
    // mesmo dela: abrir as acções da primeira foto e escolher «Remover».
    await user.click(screen.getAllByRole("button", { name: /^Acções de / })[0]);
    await user.click(await screen.findByRole("button", { name: "Remover fotografia" }));
    await waitFor(() => expect(celulas()).toHaveLength(1));

    await act(async () => {
      soltar();
      await Promise.resolve();
    });
    await traducaoChegou();

    expect(celulas()).toHaveLength(1);
    await waitFor(() => expect(fotosDoRascunho()).toEqual(["board/foto-1.jpg"]));
  });

  it("as fotos reordenadas enquanto a tradução vai a caminho ficam pela ordem nova", async () => {
    traducaoLigadaNoServidor = true;
    const soltar = traducaoPresa();
    seedDraft(3);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));

    const botao = await botaoDeTraduzir(user);
    await user.click(botao);

    // «Para trás» na segunda foto: a ordem passa a 1, 0, 2.
    const paraTras = document.querySelectorAll<HTMLElement>('[aria-label="Mover para trás"]');
    await user.click(paraTras[1]);
    await waitFor(() =>
      expect(fotosDoRascunho()).toEqual([
        "board/foto-1.jpg",
        "board/foto-0.jpg",
        "board/foto-2.jpg",
      ]),
    );

    // A partir daqui só interessa o que for gravado DEPOIS da tradução chegar:
    // o `localStorage` ainda tem a versão de há um instante, e lê-lo cedo
    // demais dava um teste verde sobre um documento que ainda vai ser
    // reescrito.
    pedidos = [];
    await act(async () => {
      soltar();
      await Promise.resolve();
    });
    await traducaoChegou();
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });

    const gravado = corpos("proposta-rascunho").at(-1)!;
    expect(JSON.parse(gravado).doc.moodBoards[0].images).toEqual([
      "board/foto-1.jpg",
      "board/foto-0.jpg",
      "board/foto-2.jpg",
    ]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «AS FOTOS DESAPARECERAM DEPOIS DO DEPLOYMENT»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma foto posta numa proposta são TRÊS coisas em três sítios diferentes, e
 * confundi-las é confundir o que se perdeu:
 *
 *   · os BYTES         → o bucket do Supabase (`proposal-storage.ts`). Não há
 *                        um único caminho que os escreva em disco local: sem
 *                        base de dados a rota das fotos responde 503 e o
 *                        carregamento não acontece. Um deploy não lhes toca.
 *   · as ASSINATURAS   → pedidas ao servidor a cada abertura (`/assets`).
 *                        Expiram, e voltam a nascer. Também não se perdem.
 *   · a LISTA          → quais, por que ordem, em que mood board. Isto é a
 *                        MONTAGEM, é trabalho de horas, e vive no documento do
 *                        estúdio. É a única das três que se pode perder.
 *
 * A lista tem três cópias, e só uma delas dura: o `localStorage` (por ORIGEM,
 * neste navegador), o rascunho no servidor (`app_state`) e a proposta gravada
 * ao enviar. Os dois testes que se seguem cobrem os dois desfechos.
 */
describe("a lista das fotos e o que sobrevive a um deployment", () => {
  const celulas = () => Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"));

  /**
   * ── A HIPÓTESE DO ENDEREÇO ──────────────────────────────────────────────
   *
   * O `localStorage` é POR ORIGEM. O endereço de pré-visualização
   * (`…-git-….vercel.app`) e o domínio de produção são origens diferentes para
   * o navegador: um rascunho montado num não existe no outro. Do lado de quem
   * trabalha isso lê-se exactamente como «as fotos desapareceram depois do
   * deployment» — sem que nada se tenha perdido.
   *
   * Este teste é a boa notícia, e é o que autoriza dizê-la: com o rascunho no
   * SERVIDOR, abrir o mesmo pedido num navegador que nunca viu esta proposta
   * (é o que um `localStorage` vazio é) devolve a montagem inteira, com as
   * fotos e as assinaturas frescas.
   */
  it("o MESMO pedido, no outro endereço: a montagem volta inteira do servidor", async () => {
    // Um navegador que nunca viu esta proposta — nem rascunho, nem `meta`, nem
    // uma única assinatura guardada. É o que a outra origem é.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: {
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [
          { title: "Cerimónia", images: ["q1/a.jpg", "q1/b.jpg", "q1/c.jpg"] },
          { title: "Copo de água", images: ["q1/d.jpg"] },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      },
    };
    // O servidor conhece as fotos e assina-as de novo: as assinaturas não são
    // trabalho dela, nascem a cada abertura.
    assetsServidor = [
      { path: "q1/a.jpg", url: "https://sb/q1/a.jpg?assinado=1" },
      { path: "q1/b.jpg", url: "https://sb/q1/b.jpg?assinado=1" },
      { path: "q1/c.jpg", url: "https://sb/q1/c.jpg?assinado=1" },
      { path: "q1/d.jpg", url: "https://sb/q1/d.jpg?assinado=1" },
    ];
    renderStudio();

    // A montagem: os dois mood boards, com as fotos e pela ordem em que ela as
    // pôs. É isto que não pode depender do endereço.
    //
    // «Cerimónia» aparece DUAS vezes: o título do mood board e a linha dos
    // Serviços. Este teste procurava-a uma vez só, e passava porque os Serviços
    // do servidor NÃO voltavam — era o achado n.º 1 da auditoria (o carimbo
    // dos ids contava como «ela escreveu» e tirava os Serviços da fusão).
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia")).toHaveLength(2));
    await screen.findByDisplayValue("Copo de água");
    await waitFor(() => expect(celulas()).toHaveLength(4));

    // E as células têm mesmo por onde desenhar — a assinatura fresca do
    // servidor. Sem isto o ecrã tinha quatro buracos, que se lê na mesma como
    // «as fotos desapareceram».
    await waitFor(() => {
      const fontes = Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));
      expect(fontes.filter((f) => f?.includes("assinado=1")).length).toBeGreaterThanOrEqual(4);
    });
  });

  /**
   * ── O CASO EM QUE SE PERDE MESMO ────────────────────────────────────────
   *
   * Produção sem Supabase: o `app_state` cai no `data/app-state.json`, que em
   * Vercel é o disco da função — o `setState` devolve `duradouro: false` e a
   * rota di-lo por escrito, com `guardado: true`, `duradouro: false` e a frase
   * a explicar que o próximo deploy o apaga.
   *
   * O estúdio lê o `updatedAt`, o `overwrote` e o `previousBy` dessa resposta —
   * e deita fora o `duradouro`. Resultado: o indicador escreve «guardado às
   * 14:32» sobre um rascunho que o deploy seguinte leva. É a MESMA frase, sobre
   * a MESMA perda, que este ficheiro inteiro existe para não voltar a deixar
   * dizer: «"Guardado" é a palavra que faz uma pessoa fechar o portátil
   * descansada».
   */
  it("um rascunho guardado onde o deploy apaga NÃO pode ser anunciado como guardado", async () => {
    gravacaoDoRascunho = () =>
      reply({
        json: {
          ok: true,
          guardado: true,
          // O servidor diz a verdade: ficou, e não dura.
          duradouro: false,
          onde: "ficheiro-efemero",
          aviso:
            "Guardado apenas no disco do servidor, que é apagado no próximo deploy. " +
            "Liga a base de dados (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY) para o trabalho ficar mesmo guardado.",
          updatedAt: new Date().toISOString(),
          overwrote: false,
        },
      });
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));

    // Ela mexe na proposta — é o que dispara a gravação.
    await user.type(screen.getByLabelText("Clientes"), "!");
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });

    // O indicador assenta — e não pode assentar na frase de sempre, que é a
    // que faz uma pessoa fechar o portátil descansada.
    // O indicador assenta — e não pode assentar na frase de sempre, que é a
    // que faz uma pessoa fechar o portátil descansada.
    await waitFor(
      () => {
        expect(screen.queryByText(/^guardado às \d{2}:\d{2}$/)).toBeNull();
        expect(screen.getAllByText(/próximo deploy apaga/i)).not.toEqual([]);
      },
      { timeout: 3000 },
    );
    // E ela tem de ficar a saber o que se passa, com o nome das variáveis que
    // resolvem — é quem está no ecrã que pode ir falar com quem gere a
    // instalação.
    expect(
      await screen.findAllByText(/apagado no próximo deploy/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PORQUE É QUE ELA NÃO VÊ AS FOTOGRAFIAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «estava a ver, pelo back office, se conseguia ver as imagens
 * quando estava a fazer a proposta e não consigo» — em 4G, e nas capturas cada
 * célula era uma caixa cinzenta com a palavra «Imagem».
 *
 * Essa caixa era o ramo em que a célula NÃO TEM URL. Num telemóvel que nunca
 * abriu esta proposta não há `localStorage` nenhum: o mapa dos URL começa
 * vazio, e tudo depende de uma leitura só (`GET /assets`). Ela era silenciosa
 * nos dois sentidos — enquanto vinha a caminho, e quando não vinha de todo.
 *
 * MEDIDO no estúdio a 1,6 Mbps, telemóvel de 375×667, 24 células sem
 * miniatura: as **24 caixas cinzentas** no instante em que a lista chega, a
 * primeira fotografia pintada aos **34,0 s**, a grelha que está no ecrã só
 * completa aos **67,6 s**, e 1099 KB por célula (26,4 MB nas 24) para caixas de
 * 174 px. Com miniatura: 20 KB por célula, 0,4 MB, e tudo o que está no ecrã
 * pintado aos **2,5 s**.
 */
describe("porque é que ela não vê as fotografias", () => {
  const celulas = () => Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"));
  const comSrc = () =>
    Array.from(document.querySelectorAll<HTMLImageElement>("[data-foto] img")).filter((i) =>
      i.getAttribute("src"),
    );

  /**
   * O ramo «a caminho». A célula não pode dizer o mesmo que uma célula
   * avariada: uma caixa parada com «Imagem» lê-se como «esta foto não existe»,
   * e foi essa leitura que fez concluir que não se via nada.
   */
  it("enquanto a lista vem a caminho, a célula diz que está a carregar — não «Imagem»", async () => {
    seedDraft(3);
    const abrirOsAssets = segurarOsAssets();
    renderStudio();
    await waitFor(() => expect(celulas()).toHaveLength(3));

    for (const c of celulas()) {
      expect(c.querySelector("[data-a-carregar]")).not.toBeNull();
      // A palavra sozinha era tudo o que havia. Não pode voltar.
      expect(c.textContent?.trim()).not.toBe("Imagem");
    }

    abrirOsAssets();
  });

  /**
   * O ramo «não veio». Era um `return` mudo: a célula ficava cinzenta para
   * sempre, sem explicação e sem saída, e a única forma de tentar outra vez era
   * recarregar a página inteira — em 4G, com tudo o que isso custa.
   */
  it("quando a lista FALHA, a célula diz-o e dá um botão para tentar outra vez", async () => {
    seedDraft(2);
    assetsFalham = true;
    renderStudio("Inspiração");

    const aviso = await screen.findAllByText(/Não carregou/i);
    expect(aviso.length).toBeGreaterThan(0);

    // E o botão pede MESMO a lista outra vez — com a resposta boa, as fotos
    // aparecem sem recarregar nada.
    assetsFalham = false;
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/0.jpg", thumbUrl: "https://sb/mini-0.jpg" },
      { path: "board/foto-1.jpg", url: "https://sb/1.jpg", thumbUrl: "https://sb/mini-1.jpg" },
    ];
    await userEvent.click(
      screen.getAllByRole("button", { name: /Ir buscar outra vez as fotografias/i })[0],
    );

    await waitFor(() => {
      const fontes = comSrc().map((i) => i.getAttribute("src"));
      expect(fontes.filter((f) => f?.includes("mini-")).length).toBe(2);
    });
  });

  /**
   * A MINIATURA GANHA AO ORIGINAL, e o original fica como plano B.
   *
   * É a diferença entre 20 KB e 1099 KB por célula — e, com 24 células, entre
   * 0,4 MB e 26,4 MB.
   */
  it("a célula desenha a miniatura, e não o original", async () => {
    seedDraft(1);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/original.jpg", thumbUrl: "https://sb/mini.jpg" },
    ];
    renderStudio();
    await waitFor(() => expect(comSrc()).toHaveLength(1));
    expect(comSrc()[0].getAttribute("src")).toBe("https://sb/mini.jpg");
  });

  /**
   * ── A FILA ────────────────────────────────────────────────────────────────
   *
   * Uma foto sem derivada leve puxa o ORIGINAL. Vinte e quatro ao mesmo tempo
   * repartem o canal e acabam TODAS no fim: medido, a primeira só aos 30 s. A
   * fila deixa passar três de cada vez — e as da primeira dobra não esperam por
   * ninguém, porque são as que ela está a olhar.
   *
   * O que se conta aqui são os `src` POSTOS: um `src` posto é um download
   * começado, e é por isso que uma célula à espera de vez fica sem ele.
   */
  it("com 24 fotos SEM miniatura, não são 24 downloads ao mesmo tempo", async () => {
    seedDraft(24);
    assetsServidor = Array.from({ length: 24 }, (_, i) => ({
      path: `board/foto-${i}.jpg`,
      url: `https://sb/original-${i}.jpg`,
    }));
    renderStudio();
    await waitFor(() => expect(celulas()).toHaveLength(24));
    // Sem miniatura, o `url` do servidor É o original: todas as células
    // esperam pela vez, incluindo as da primeira dobra (a prioridade não fura a
    // fila — medido, furá-la punha a primeira fotografia aos 32,0 s em vez dos
    // 16,0 s a que chega com o tecto de três).
    await waitFor(() => expect(comSrc().length).toBeGreaterThan(0));
    expect(comSrc().length).toBeLessThanOrEqual(3);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UMA CAIXA DE ~100 px NUNCA PEDE 1099 KB HAVENDO 150
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Este é o caso que a fotografia do ecrã dela obrigou a escrever: sete de dez
   * células a dizer «Imagem guardada / Tentar novamente», num iPhone com 4G.
   *
   * A cascata tinha DOIS degraus — a miniatura e, a falhar essa, o ORIGINAL — e
   * nada pelo meio. Os pesos, medidos no estúdio a 1,6 Mbps:
   *
   *     miniatura (400 px)     20 KB    a célula desenha esta
   *     derivada  (1200 px)  ~200 KB    ESTE degrau não existia
   *     original  (2200 px)   1099 KB   e a queda ia direita aqui
   *
   * As células destas grelhas medem ~101 px aos 375, ~126 entre 640 e 1023 e
   * ~92 aos 1024 (medido no navegador, ver `GrelhaDeFotos`). Uma miniatura que
   * falha é um acidente banal — uma assinatura de seis horas caducada, um
   * pedido que expirou. O que não pode ser banal é o preço: cinquenta e cinco
   * vezes o peso para desenhar a mesma caixa de cem píxeis.
   */
  it("quando a miniatura falha, a célula cai para os 1200 px — NUNCA para o original", async () => {
    seedDraft(1);
    assetsServidor = [
      {
        path: "board/foto-0.jpg",
        url: "https://sb/original.jpg",
        thumbUrl: "https://sb/mini.jpg",
        midUrl: "https://sb/media.jpg",
      },
    ];
    renderStudio();
    const morrer = async () => {
      const img = document.querySelector<HTMLImageElement>("[data-foto] img");
      if (!img) return;
      await act(async () => {
        img.dispatchEvent(new Event("error"));
      });
    };

    await waitFor(() => expect(comSrc()).toHaveLength(1));
    expect(comSrc()[0].getAttribute("src")).toBe("https://sb/mini.jpg");

    // A miniatura falha. É AQUI que estava o salto para os 1099 KB.
    await morrer();
    await waitFor(() =>
      expect(
        comSrc()[0]?.getAttribute("src"),
        "a célula saltou a derivada de 1200 px e foi pedir o ficheiro grande",
      ).toBe("https://sb/media.jpg"),
    );

    // E o original continua a ser a última rede — mas é a ÚLTIMA.
    await morrer();
    await waitFor(() => expect(comSrc()[0]?.getAttribute("src")).toBe("https://sb/original.jpg"));
  });

  /**
   * A outra metade da mesma regra: sem derivada de 1200 px fabricada (o
   * `/assets` só devolve `midUrl` quando o Storage a tem), a cascata é a de
   * antes. Um degrau que não existe não pode gastar uma tentativa — a célula
   * ficaria a pedir `undefined` e a desistir uma volta mais cedo.
   */
  it("sem derivada de 1200 px, a queda é a de sempre — e não uma tentativa perdida", async () => {
    seedDraft(1);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/original.jpg", thumbUrl: "https://sb/mini.jpg" },
    ];
    renderStudio();
    await waitFor(() => expect(comSrc()).toHaveLength(1));
    await act(async () => {
      document
        .querySelector<HTMLImageElement>("[data-foto] img")
        ?.dispatchEvent(new Event("error"));
    });
    await waitFor(() => expect(comSrc()[0]?.getAttribute("src")).toBe("https://sb/original.jpg"));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA VEIO VAZIA — QUE NÃO É A MESMA COISA QUE A LISTA NÃO TER VINDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `listProposalImages` devolve `[]` quando não alcança o bucket, em vez de
 * atirar. Do lado do estúdio isso chega como um 200 com zero fotografias: a
 * hidratação dá-se por concluída e o mapa dos URL fica vazio.
 *
 * As células ficavam cinzentas com a palavra «Imagem» — exactamente o mesmo
 * ecrã de quando a leitura falha, e exactamente o mesmo de quando a foto ainda
 * vem a caminho. Três causas, um só ecrã, nenhuma saída.
 */
describe("uma foto do documento que não veio na lista do servidor", () => {
  it("di-lo, e não fica cinzenta a dizer «Imagem»", async () => {
    seedDraft(2);
    // O servidor responde bem — e não conhece nenhuma destas fotos.
    assetsServidor = [];
    renderStudio();

    const aviso = await screen.findAllByText(/Não veio na lista/i);
    expect(aviso.length).toBeGreaterThan(0);
    // E não é a etiqueta da leitura falhada: as duas causas têm respostas
    // diferentes do lado de quem as vai investigar.
    expect(screen.queryByText(/Não carregou/i)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTÚDIO NO TELEMÓVEL DELA — as três coisas de que ela mandou fotografia
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um bloco só, no fim do ficheiro e de propósito: são três defeitos vistos no
 * mesmo ecrã, a 390 px, na mesma proposta.
 */
describe("o estúdio no telemóvel: fotos, acções e descrições", () => {
  /** A barra dos sete ícones — encontrada pelo primeiro botão dela. */
  const barraDasAccoes = () =>
    document.querySelector('button[aria-label="Mover para trás"]')?.closest("div") ?? null;

  /**
   * ── A BARRA QUE VOLTOU A TAPAR A CÉLULA ──────────────────────────────────
   *
   * Estava escondida com `[@media(hover:none)]` e os botões cresciam com
   * `(pointer: coarse)` (`.alvo-toque`) — duas perguntas diferentes sobre o
   * mesmo aparelho. Num iPhone com AssistiveTouch, num iPad com trackpad ou
   * num portátil de ecrã táctil, a primeira responde NÃO e a segunda SIM: a
   * barra fica e cada ícone salta de 24 px para 44. MEDIDO a 390 px nesse
   * aparelho: 89 × 328 px por cima de uma célula de 89 × 104, a subir 209 px
   * acima dela, com cinco pedaços de texto tapados.
   *
   * Aqui prende-se a REGRA, que é o que não pode voltar a divergir: a barra
   * pergunta pelo ponteiro inteiro (`com-rato`) e os botões dela não são alvos
   * de toque — porque uma barra que só existe com rato não precisa de 44 px,
   * e foi esse mínimo que a transformou numa coluna.
   */
  it("a barra de acções não existe sem rato, e os botões dela não são alvos de toque", async () => {
    seedDraft(1);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/0.jpg", thumbUrl: "https://sb/mini-0.jpg" },
    ];
    renderStudio();
    await waitFor(() => expect(barraDasAccoes()).not.toBeNull());

    const barra = barraDasAccoes()!;
    const classes = barra.className;
    expect(classes, "a barra tem de estar escondida por omissão").toContain("hidden");
    expect(classes, "e só aparecer onde há MESMO rato").toContain("com-rato:flex");
    expect(
      classes,
      "`(hover: none)` é metade da pergunta — a que falha no aparelho que trouxe isto",
    ).not.toContain("hover:none");

    for (const b of Array.from(barra.querySelectorAll("button"))) {
      expect(
        b.className,
        `«${b.getAttribute("aria-label")}» é da barra do rato e não pode ser um alvo de 44 px`,
      ).not.toContain("alvo-toque");
    }

    // E o caminho do dedo existe por omissão: é ele que fica quando a barra sai.
    const pontos = document.querySelector('button[aria-label^="Acções de"]')!;
    expect(pontos.className).toContain("com-rato:hidden");
    expect(pontos.className).toContain("alvo-toque");
  });

  /**
   * ── SEIS CÍRCULOS EM CIMA DA FOTOGRAFIA ──────────────────────────────────
   *
   * Palavras dela: «controlos sobrepostos à imagem». A barra do rato tinha seis
   * botões escuros a tapar a faixa de baixo da fotografia — que é onde costuma
   * estar o que interessa numa foto de mesa posta —, e tapava-a precisamente
   * enquanto ela estava a olhar para ela.
   *
   * Ficam as setas, que são o gesto de todos os dias: mandá-las para dentro de
   * uma folha era trocar um clique por dois no trabalho normal. As outras
   * quatro, e a que APAGA, passam para a folha que o dedo já usa.
   */
  it("a barra do rato tem as setas e mais nada — o resto está na folha", async () => {
    seedDraft(2);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/0.jpg", thumbUrl: "https://sb/mini-0.jpg" },
      { path: "board/foto-1.jpg", url: "https://sb/1.jpg", thumbUrl: "https://sb/mini-1.jpg" },
    ];
    renderStudio();
    await waitFor(() => expect(barraDasAccoes()).not.toBeNull());

    const rotulos = Array.from(barraDasAccoes()!.querySelectorAll("button")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(rotulos).toEqual([
      "Mover para trás",
      "Mover para a frente",
      expect.stringMatching(/^Mais acções de /),
    ]);

    // O botão que APAGA sai da barra: uma lista escrita por extenso, com o
    // «Remover» separado por um traço, é melhor sítio para ele do que um
    // círculo de 24 px ao lado de outros cinco iguais.
    expect(rotulos).not.toContain("Remover fotografia");
    expect(rotulos).not.toContain("Ver em grande");
  });

  it("e as quatro que saíram continuam todas na folha", async () => {
    // Duas listas seriam duas versões da verdade — a acção acrescentada num
    // sítio e esquecida no outro é a forma mais barata de os caminhos
    // divergirem. É a MESMA folha do dedo.
    seedDraft(1);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/0.jpg", thumbUrl: "https://sb/mini-0.jpg" },
    ];
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Mais acções de / }));
    for (const nome of [
      "Ver em grande",
      "Trocar por outra fotografia",
      "Escolher para mover em conjunto",
      "Remover fotografia",
    ]) {
      expect(await screen.findByRole("button", { name: nome }), nome).toBeTruthy();
    }
  });

  /**
   * ── A DESCRIÇÃO QUE CORTAVA TEXTO A MEIO ─────────────────────────────────
   *
   * `rows={2}` e o resto a rolar por dentro. MEDIDO a 390 px: 70 px de caixa
   * para 224 px de texto português (154 px escondidos) e 276 de inglês (206
   * escondidos). O jsdom não maquetiza, portanto o que se prende aqui é a
   * causa e não o efeito: a altura deixa de estar escrita no `rows`.
   */
  it("a descrição do mood board não abre com altura fixa", async () => {
    seedDraft(1, { annotation: "uma descrição comprida ".repeat(12) });
    renderStudio();
    const campo = await waitFor(() => {
      const c = document.querySelector<HTMLTextAreaElement>('[data-campo="boardNota:0"]');
      expect(c).not.toBeNull();
      return c!;
    });
    expect(campo.rows, "a altura volta a estar presa a duas linhas").toBe(1);
  });

  /**
   * ── «GUARDADA MAS NÃO A CONSIGO MOSTRAR» QUANDO NÃO FOI ISSO ─────────────
   *
   * Uma `img-src` que não nomeia a origem do Storage faz o browser recusar a
   * fotografia ANTES de a pedir: sem pedido, sem código de estado, só o
   * `onerror` — igual, do lado do JavaScript, a um 404. E o remédio é o
   * oposto: um «Tentar novamente» vai falhar exactamente da mesma maneira
   * todas as vezes.
   *
   * O casamento é por ORIGEM, e é isso que este teste prende: o `blockedURI`
   * vem inteiro no Chromium mas a norma deixa entregá-lo cortado à origem — e
   * o telemóvel dela é um iPhone.
   */
  it("distingue «o sítio recusou» de «o ficheiro não veio»", async () => {
    seedDraft(1);
    assetsServidor = [
      {
        path: "board/foto-0.jpg",
        url: "https://storage.exemplo/0.jpg",
        thumbUrl: "https://storage.exemplo/mini-0.jpg",
      },
    ];
    renderStudio("Inspiração");

    // As duas moradas falham, como falham quando o browser as recusa.
    const morrer = async () => {
      const img = document.querySelector<HTMLImageElement>("[data-foto] img");
      if (!img) return;
      await act(async () => {
        img.dispatchEvent(new Event("error"));
      });
    };
    await waitFor(() => expect(document.querySelector("[data-foto] img")).not.toBeNull());
    await morrer();
    await morrer();
    // Sem notícias do browser, é o ramo de sempre: «Imagem guardada» e um
    // botão para tentar outra vez.
    expect(await screen.findByText(/Imagem guardada/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeNull();
    expect(screen.queryByText(/O site não a deixa aparecer/i)).toBeNull();

    // O browser anuncia a recusa — com o `blockedURI` CORTADO À ORIGEM.
    await act(async () => {
      const e = new Event("securitypolicyviolation");
      Object.assign(e, {
        blockedURI: "https://storage.exemplo",
        effectiveDirective: "img-src",
        violatedDirective: "img-src",
      });
      document.dispatchEvent(e);
    });

    expect(
      await screen.findByText(/O site não a deixa aparecer/i),
      "a célula continuou a acusar a fotografia de uma coisa que não é dela",
    ).toBeTruthy();
    expect(
      screen.queryByText(/Imagem guardada/i),
      "continuou no ramo do ficheiro que não veio",
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Tentar novamente" }),
      "um botão que não pode funcionar é uma promessa vazia",
    ).toBeNull();
  });

  /**
   * ── O BOTÃO QUE NÃO PODIA FUNCIONAR ──────────────────────────────────────
   *
   * MEDIDO com a rede a devolver 503: o «Tentar novamente» repetia, ao byte,
   * os dois URL que acabavam de falhar. Contra a causa mais provável de uma
   * grelha inteira morta — assinaturas que já não servem — isso é um botão
   * que não pode funcionar por construção.
   */
  it("o «Tentar novamente» de uma célula morta vai buscar assinaturas frescas", async () => {
    seedDraft(1);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/0.jpg", thumbUrl: "https://sb/mini-0.jpg" },
    ];
    renderStudio("Inspiração");
    const morrer = async () => {
      const img = document.querySelector<HTMLImageElement>("[data-foto] img");
      if (!img) return;
      await act(async () => {
        img.dispatchEvent(new Event("error"));
      });
    };
    await waitFor(() => expect(document.querySelector("[data-foto] img")).not.toBeNull());
    await morrer();
    await morrer();
    const botao = await screen.findByRole("button", { name: "Tentar novamente" });

    const leituras = () => pedidos.filter((p) => p.url.includes("/assets")).length;
    const antes = leituras();
    await userEvent.click(botao);
    await waitFor(() => expect(leituras()).toBeGreaterThan(antes));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE ELA LÊ NO ECRÃ É O EMAIL QUE SAI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel do email (`EmailDoEnvio`) prepara o texto; é o ESTÚDIO que o envia.
 * Estes testes prendem essa junta — a que não se vê em nenhum dos dois lados
 * sozinho: o que está na caixa quando ela carrega em Enviar é o que viaja, e
 * quando não há texto nenhum o envio é byte a byte o de antes deste ecrã.
 */
describe("o email do passo 3 viaja com o envio", () => {
  const caixaDoEmail = () => screen.getByLabelText("Texto do email") as HTMLTextAreaElement;

  function envio(): Record<string, unknown> {
    return JSON.parse(corpos("proposta-doc", "POST").at(-1) ?? "{}");
  }

  async function irParaEnviar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
  }

  async function enviar(user: ReturnType<typeof userEvent.setup>) {
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await confirmarEnvio(user);
  }

  it("o texto que está na caixa é o que segue, com o assunto e o modelo", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaEnviar(user);
    await waitFor(() => expect(caixaDoEmail().value).toContain("Olá Maria & Zé,"));
    await enviar(user);

    await waitFor(() => expect(envio().mode).toBe("send"));
    expect(envio().corpo).toContain("Olá Maria & Zé,");
    expect(envio().assunto).toBe("A vossa proposta — Líquen Events");
    // A chave do modelo vai para a CÓPIA do envio — não escolhe texto nenhum.
    expect(envio().modelo).toBe("registo-formal");
  });

  it("o que ela reescreve é o que viaja", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaEnviar(user);
    await waitFor(() => expect(caixaDoEmail().value).toContain("Olá"));
    await user.clear(caixaDoEmail());
    await user.type(caixaDoEmail(), "Escrevi isto à mão.");
    await enviar(user);

    await waitFor(() => expect(envio().corpo).toBe("Escrevi isto à mão."));
  });

  /**
   * CONTROLO POSITIVO das duas ausências abaixo: os testes acima provam que o
   * campo VIAJA quando há texto. Sem rascunho preparado, o pedido tem de sair
   * exactamente como saía antes deste ecrã existir — uma rota que passasse a
   * EXIGIR o corpo partia tudo o que já a chama.
   */
  it("sem texto preparado, o envio não leva corpo nenhum", async () => {
    rascunhoDoEmail = null;
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaEnviar(user);
    await waitFor(() => expect(screen.getByText(/Não há nenhum modelo/)).toBeTruthy());
    await enviar(user);

    await waitFor(() => expect(envio().mode).toBe("send"));
    expect(envio()).not.toHaveProperty("corpo");
    expect(envio()).not.toHaveProperty("assunto");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A NOTA INTERNA, MONTADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O campo existia e não estava em lado nenhum: a única referência a
 * `NotasInternas.tsx` em todo o `src/` era o seu próprio teste. Passa a viver
 * na secção «Evento» do estúdio, e o que se escreve lá vai no rascunho — que é
 * o que faz a nota sobreviver a fechar o separador.
 *
 * A garantia de que NÃO sai no PDF está onde tem de estar, no gerador:
 * `src/lib/notas-internas-ficam-em-casa.test.ts`, com controlo positivo.
 */
describe("as notas internas vivem no estúdio", () => {
  it("o campo está montado e diz que não sai na proposta", () => {
    /**
     * O `getByText` desta garantia era único quando havia UMA caixa. Desde que
     * cada secção passou a ter a sua, a mesma frase aparece seis vezes — e
     * deve mesmo: é ela a garantia, e uma caixa amarela sem ela ao lado de
     * campos que SAEM na proposta é precisamente a confusão que este
     * componente existe para evitar.
     *
     * Por isso a regra passa a dizer DE QUAL fala: a frase tem de estar no
     * rótulo do campo, que é onde um leitor de ecrã a vai buscar.
     */
    seedDraft(0);
    renderStudio();
    const campo = screen.getByLabelText(/Notas internas/);
    expect(campo).toBeTruthy();
    expect(
      campo.getAttribute("aria-label") ??
        document.querySelector(`label[for="${campo.id}"]`)?.textContent ??
        "",
    ).toMatch(/só para ti, nunca sai na proposta/);
    // E continua a haver uma por cada caixa, e não uma solitária.
    expect(screen.getAllByText(/só para ti, nunca sai na proposta/).length).toBeGreaterThan(1);
  });

  it("o que se escreve na nota entra no rascunho gravado", async () => {
    seedDraft(0);
    renderStudio();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Notas internas/), "Decide a mãe");

    await waitFor(() => {
      const gravados = corpos("proposta-rascunho");
      expect(gravados.some((b) => b.includes("Decide a mãe"))).toBe(true);
    });
    // CONTROLO POSITIVO da leitura acima: o corpo gravado é MESMO o documento,
    // e o campo tem MESMO o nome por que o PDF pergunta. Sem isto, um
    // `includes` sobre um corpo qualquer passaria por acidente.
    const ultimo = corpos("proposta-rascunho").at(-1) ?? "";
    expect(JSON.parse(ultimo).doc.notasInternas).toContain("Decide a mãe");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE FALTA PARA ENVIAR DEIXA DE SER INVISÍVEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A lista vivia numa coluna lateral `xl:block` — abaixo de 1280 px ela nunca a
 * via — e o passo de envio tinha uma frase estática, sempre com as mesmas
 * palavras e sem link nenhum: «Preenche clientes, referência e um total maior
 * que 0».
 *
 * Passa a estar na Conferência, que é a lista que já se lê antes de carregar em
 * enviar e que não depende da largura do ecrã. E cada linha leva ao campo.
 */
describe("o que falta para enviar, no passo de enviar", () => {
  /** Um rascunho a que falta o nome dos clientes — o que TRAVA o envio. */
  function seedSemNome() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [{ label: "Igreja" }] }],
        moodBoards: [],
        budgetItems: ["Decor"],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  it("a frase estática saiu — no lugar dela está o nome do que falta", async () => {
    seedSemNome();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    expect(
      screen.queryByText(/Preenche clientes, referência e um total maior que 0 \(no passo/),
    ).toBeNull();
    expect(await screen.findByText(/Uma coisa impede o envio/)).toBeTruthy();
    expect(screen.getByText("Nome dos clientes")).toBeTruthy();
  });

  it("tocar na linha volta ao conteúdo e põe o cursor no campo", async () => {
    seedSemNome();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await user.click(await screen.findByRole("button", { name: /Nome dos clientes/ }));

    // De volta ao passo 1 — o campo vive lá.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^1\s*Evento/ })).toHaveAttribute(
        "aria-current",
        "step",
      ),
    );
    const campo = document.querySelector<HTMLInputElement>('[data-campo="clientNames"]');
    expect(campo).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(campo));
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE VEIO DO PEDIDO **NÃO** FICA ASSINALADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este bloco estava ao contrário, e o ecrã dela é que decidiu.
 *
 * O anel laranja acendia em todos os campos semeados a partir do formulário do
 * casal. A intenção era boa — um campo semeado lia-se como um campo escrito por
 * ela, e um campo escrito por ela não se relê. O resultado não era: SEIS anéis à
 * volta de seis campos, em todas as propostas, sempre, e ela a ter de tocar num
 * a um para os apagar. Palavras dela, com a fotografia ao lado: «fica com essas
 * coisas à volta amarelas e eu quero tirar isso».
 *
 * Um aviso que está sempre ligado não é um aviso; é decoração que ensina a não
 * olhar — e a partir do dia em que ela deixa de olhar, também não vê o anel no
 * caso em que ele importa.
 *
 * ── O CASO EM QUE IMPORTA FICA ────────────────────────────────────────────
 *
 * A proposta COPIADA DE OUTRA. Aí os campos trazem mesmo o casal de outra
 * pessoa, e é a única forma de a duplicação fazer mal em vez de bem: uma
 * proposta enviada com o nome ou a data de outro casamento. Esse caminho
 * continua a acender, e tem passeio próprio a guardá-lo
 * (`e2e/proposta-fluxos.spec.ts`, «os campos copiados ficam assinalados»).
 *
 * O que os testes daqui guardam agora é o contrário do que guardavam: que abrir
 * uma proposta não põe anel nenhum.
 *
 * E o GESTO de confirmar — tocar no campo apaga o anel — deixa de ter teste
 * aqui, de propósito. Em jsdom já não há como chegar ao estado «por confirmar»
 * pela porta da frente: só a cópia o produz, e a cópia precisa de outra proposta
 * no servidor. Cheguei a escrever um teste que punha a classe à mão e verificava
 * que ela desaparecia — mas isso mede o meu fingimento, não o produto. O gesto
 * é medido onde é verdadeiro: num browser, no passeio da cópia.
 */
describe("o que veio do pedido não pede confirmação", () => {
  const comTudo = {
    ...quote,
    date: "2026-09-12",
    location: "Évora",
    guests: 80,
    ceremonyType: "civil",
  } as unknown as Quote;

  const renderCom = (q: Quote) =>
    render(
      <ToastProvider>
        <ProposalStudio quote={q} />
      </ToastProvider>,
    );

  /** O invólucro do campo leva o anel — é lá que o `containerClassName` cai. */
  const anelDe = (rotulo: string) =>
    screen.getByLabelText(rotulo).closest("div")?.className.includes("ring-2") ?? false;

  it("abre sem anel nenhum, mesmo com o pedido todo respondido", async () => {
    renderCom(comTudo);
    // Espera pelo ecrã montado com os dados do pedido — senão isto passava por
    // medir uma proposta que ainda não tinha semeado nada.
    await waitFor(() => expect(screen.getByLabelText("Clientes")).toHaveValue("Maria & Zé"));
    for (const campo of [
      "Clientes",
      "Data",
      "Local",
      "Convidados",
      "Tipo de evento",
      "Cerimónia",
    ]) {
      expect(anelDe(campo), `«${campo}» voltou a abrir com o anel laranja`).toBe(false);
    }
  });

  it("e um rascunho já começado também não", async () => {
    seedDraft(0);
    renderCom(comTudo);
    await waitFor(() => expect(screen.getByLabelText("Clientes")).toHaveValue("Maria & Zé"));
    expect(anelDe("Clientes")).toBe(false);
    expect(anelDe("Local")).toBe(false);
  });
});

describe("fotos repetidas dentro da mesma proposta", () => {
  /** Dois boards, com a mesma foto no primeiro lugar de cada um. */
  function seedComRepetida() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [
          { title: "Cerimónia", images: ["board/a.jpg", "board/b.jpg"] },
          { title: "Jantar", images: ["board/a.jpg", "board/c.jpg"] },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  it("marca as DUAS células, e diz quantas vezes", async () => {
    seedComRepetida();
    renderStudio();
    const marcas = await screen.findAllByText("2× nesta proposta");
    expect(marcas).toHaveLength(2);
  });

  it("CONTROLO POSITIVO: sem repetição não marca nada", async () => {
    // O mesmo ecrã, com o mesmo mecanismo ligado. Sem isto, «duas marcas»
    // acima podia estar a passar por a grelha marcar sempre todas as fotos.
    seedDraft(3);
    renderStudio();
    // A grelha está mesmo desenhada — três células, três fotos diferentes.
    expect(await screen.findAllByLabelText(/Arrastar a fotografia/)).toHaveLength(3);
    expect(screen.queryByText(/nesta proposta$/)).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CHOQUE DE DATAS TAMBÉM AO ESCREVER A DATA AQUI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O aviso disparava só ao ESCOLHER o cliente, a partir do `quote.date`. Mas a
 * data que sai impressa é a deste documento, e este campo é texto livre: o
 * casal liga a mudar o dia, ela corrige aqui, e o aviso continuava a olhar
 * para a data do formulário.
 */
describe("o dia ocupado, a partir da data escrita na proposta", () => {
  /** Um casamento já COTADO no dia 20, a 3 km — para o choque ter matéria. */
  const jaMarcado = {
    id: "LQ-outro",
    name: "Sara e Nuno",
    status: "cotado",
    date: "2026-09-20",
    location: "Évora",
  } as unknown as Quote;

  const renderCom = (q: Quote) =>
    render(
      <ToastProvider>
        <ProposalStudio quote={q} quotes={[q, jaMarcado]} />
      </ToastProvider>,
    );

  function seedComData(data: string) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: data,
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  const pedido = { ...quote, date: "2026-05-02", location: "Évora" } as unknown as Quote;

  it("avisa quando a data escrita cai em cima de um evento já marcado", async () => {
    seedComData("20 de setembro de 2026");
    renderCom(pedido);
    expect(await screen.findByText(/Já há um evento nesta data/)).toBeTruthy();
    expect(screen.getByText("Sara e Nuno")).toBeTruthy();
    // E diz que a data é a DESTE documento, não a do pedido.
    expect(screen.getByText(/data que escreveste na proposta/)).toBeTruthy();
  });

  it("cala-se quando não consegue ler a data", async () => {
    // «a definir» é uma resposta legítima deste campo. Um aviso sobre um dia
    // inventado por uma leitura falhada é pior do que aviso nenhum.
    seedComData("a definir");
    renderCom(pedido);
    await waitFor(() => expect(screen.getByLabelText("Data")).toHaveValue("a definir"));
    expect(screen.queryByText(/Já há um evento nesta data/)).toBeNull();
  });

  it("cala-se numa data que não choca com nada", async () => {
    // CONTROLO POSITIVO do teste de cima: o mecanismo está ligado e sabe ler
    // esta data — o que falta é o choque.
    seedComData("12 de setembro de 2026");
    renderCom(pedido);
    await waitFor(() =>
      expect(screen.getByLabelText("Data")).toHaveValue("12 de setembro de 2026"),
    );
    expect(screen.queryByText(/Já há um evento nesta data/)).toBeNull();
  });

  it("não repete o aviso quando a data escrita É a do pedido", async () => {
    // Aí o cartão já está no ecrã, por cima do estúdio (`FazerProposta`). O
    // mesmo cartão duas vezes na mesma página ensina a saltar os dois.
    seedComData("20 de setembro de 2026");
    renderCom({ ...pedido, date: "2026-09-20" } as unknown as Quote);
    await waitFor(() =>
      expect(screen.getByLabelText("Data")).toHaveValue("20 de setembro de 2026"),
    );
    expect(screen.queryByText(/Já há um evento nesta data/)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ELA ESCREVE NO PRIMEIRO SEGUNDO NÃO É APAGADO PELO RASCUNHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio vai buscar o rascunho ao servidor ao abrir, e o merge chega
 * 100–300 ms depois. Era `{ ...d, ...doServidor }` — campo a campo, o servidor
 * ganhava. Se ela começasse a escrever nessa janela, o PRINCÍPIO do que
 * escreveu era apagado.
 *
 * MEDIDO no produto, oito rondas a escrever `ABCDEFGHIJKLMNOPQRST` meio
 * segundo depois de o ecrã abrir: SETE perderam texto. Ficaram coisas como
 * `HIJKLMNOPQRST`, `MNOPQRST`, `QRST`. Em quatro caixas diferentes — e a
 * «Cerimónia» chegou a ficar COMPLETAMENTE vazia. Sem erro e sem aviso: a
 * frase fica truncada pela frente, e é assim que vai no PDF para o casal.
 */
describe("o rascunho do servidor não escreve por cima de quem está a escrever", () => {
  function rascunhoComTudoPreenchido() {
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: {
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Herdade do Servidor",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalLabel: "Valor Total Decoração",
      },
    };
  }

  /** Segura a leitura do rascunho até o teste a soltar. */
  function segurarORascunho() {
    portaoDoRascunho = new Promise<void>((resolver) => {
      abrirPortaoDoRascunho = resolver;
    });
  }

  it("o que ela escreveu no Local fica — e o resto do rascunho entra à mesma", async () => {
    rascunhoComTudoPreenchido();
    segurarORascunho();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProposalStudio quote={quote} />
      </ToastProvider>,
    );

    const local = await screen.findByLabelText("Local");
    await user.clear(local);
    await user.type(local, "Monte da Oliveirinha");

    // Agora o rascunho chega — a corrida, encenada.
    abrirPortaoDoRascunho?.();

    // Prova que o merge CORREU MESMO: um campo em que ela não tocou passa a
    // ter o valor do servidor. Sem isto, o teste passava por não ter havido
    // corrida nenhuma — que é a forma mais fácil de ele deixar de servir.
    await waitFor(() => expect(screen.getByLabelText("Convidados")).toHaveValue("80 pax"));

    // E o que ela escreveu continua inteiro.
    expect(local).toHaveValue("Monte da Oliveirinha");
  });

  it("num campo em que ela NÃO tocou, o rascunho manda (controlo positivo)", async () => {
    rascunhoComTudoPreenchido();
    segurarORascunho();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProposalStudio quote={quote} />
      </ToastProvider>,
    );

    const local = await screen.findByLabelText("Local");
    await user.clear(local);
    await user.type(local, "Monte da Oliveirinha");
    abrirPortaoDoRascunho?.();

    // O «Tipo de evento» não foi tocado: o rascunho tem de o preencher.
    await waitFor(() => expect(screen.getByLabelText("Tipo de evento")).toHaveValue("Casamento"));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ABRIR UM PEDIDO SÓ PARA LER NÃO É TRABALHO POR GRAVAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio abre, semeia o que vem do PEDIDO (os pontos de decoração que o
 * casal marcou, o preço final, a regra dos adicionais) — e essa semeadura
 * mexia no documento. O efeito que vigia o documento não distingue quem lhe
 * mexeu: marcava «por gravar», gravava no `localStorage`, e mandava um PUT do
 * rascunho ao servidor.
 *
 * Duas consequências, e a segunda é a que custa:
 *
 *   1. Uma linha de rascunho gravada em cada pedido que ela ABRE para ler.
 *   2. O «Guardar tudo (1)» aceso por nada, várias vezes por hora — e um
 *      alarme que mente é um alarme que se deixa de ver. É esse botão que ela
 *      olha antes de fechar o portátil.
 *
 * A semeadura é DERIVADA do pedido: reabrir produz exactamente o mesmo
 * documento. Não há nada para perder em não a gravar — e quando ela escrever
 * a primeira letra, grava-se tudo, semeadura incluída.
 */
describe("abrir um pedido só para ler não é trabalho por gravar", () => {
  /** O debounce da gravação é de 800 ms. Isto passa-o com folga. */
  const passarODebounce = () => new Promise((r) => setTimeout(r, 1400));

  it("não manda rascunho nenhum ao servidor", async () => {
    renderStudio("Inspiração");
    await screen.findByRole("heading", { name: "Mood boards" });
    await passarODebounce();
    expect(corpos("proposta-rascunho")).toEqual([]);
  });

  it("não deixa cópia local de um documento que ela não escreveu", async () => {
    renderStudio("Inspiração");
    await screen.findByRole("heading", { name: "Mood boards" });
    await passarODebounce();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("e o indicador cala-se — não diz «guardado» ao que não foi feito", async () => {
    renderStudio("Inspiração");
    await screen.findByRole("heading", { name: "Mood boards" });
    await passarODebounce();
    expect(screen.queryByTitle(/a guardar/i)).toBeNull();
    expect(screen.queryByTitle(/guardado às/i)).toBeNull();
  });

  it("um clique que não muda nada continua a não gravar", async () => {
    // O gesto FECHA a janela de abertura, mas não é o gesto que decide: o que
    // decide é o documento ser igual ao que se abriu. Sem isto, tocar no ecrã
    // para ler acendia o alarme na mesma — e era esse o defeito.
    const user = userEvent.setup();
    renderStudio("Inspiração");
    await user.click(await screen.findByRole("heading", { name: "Mood boards" }));
    await passarODebounce();
    expect(corpos("proposta-rascunho")).toEqual([]);
  });

  it("escrita SEM teclas — preenchimento automático — também conta (controlo positivo)", async () => {
    // Nem toda a escrita passa por uma tecla: o preenchimento automático do
    // browser, um gestor de palavras-passe e a ditadura de voz põem o valor e
    // disparam só `input`. Se a abertura só fechasse com `keydown`, esse texto
    // ficava por gravar — e foi assim que o passeio automático das propostas
    // apanhou este buraco.
    renderStudio();
    const local = (await screen.findByLabelText("Local")) as HTMLInputElement;
    fireEvent.input(local, { target: { value: "Herdade do Automático" } });
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
    expect(corpos("proposta-rascunho").at(-1)).toContain("Herdade do Automático");
  });

  it("mas com rascunho GUARDADO, abrir continua a gravar (controlo positivo)", async () => {
    // A fronteira. Abrir um pedido virgem é semear o que veio do pedido — e
    // isso re-deriva-se ao reabrir. Abrir um pedido COM rascunho é outra coisa:
    // o restauro CORRIGE o que lá está (tira marcadores de fotos que nunca
    // chegaram a existir, acerta o total pelo «Preço final» do pedido), e uma
    // correcção que não fica gravada é uma correcção que se volta a fazer
    // amanhã. Ver também «um marcador deixado num rascunho antigo» e «o preço
    // do pedido sobrevive ao rascunho do servidor».
    seedDraft(1);
    renderStudio("Inspiração");
    await screen.findByRole("heading", { name: "Mood boards" });
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
  });

  it("à PRIMEIRA letra dela, grava tudo — semeadura incluída (controlo positivo)", async () => {
    // Sem esta, a correcção podia ser «nunca gravar», que é muito pior do que
    // o defeito.
    const user = userEvent.setup();
    renderStudio();
    await user.type(await screen.findByLabelText("Local"), "Évora");
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
    const gravado = JSON.parse(corpos("proposta-rascunho").at(-1) ?? "{}");
    expect(gravado.doc.location).toBe("Évora");
    // A semeadura vai lá dentro: é o grupo de serviços que o estúdio abre.
    expect(gravado.doc.serviceGroups.length).toBeGreaterThan(0);
    expect(localStorage.getItem(DRAFT_KEY)).toContain("Évora");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA SECÇÃO NUNCA APARECE FECHADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «as secções aparecem colapsadas». E uma secção colapsada é o
 * mesmo que uma secção que não existe — a proposta abria e o que se via era
 * uma pilha de títulos.
 *
 * Havia um automatismo — «secções concluídas recolhem-se automaticamente» —
 * que fotografava o que já estava preenchido ao abrir e fechava essas. Numa
 * proposta a meio, funciona; numa proposta ACABADA, que é o caso de todas as
 * que ela reabre para conferir antes de enviar, está tudo preenchido e
 * fechava-se tudo. Era mais certeiro onde fazia mais estrago.
 *
 * E havia a memória: a dobra ficava no `localStorage`, e um «fechar» de há três
 * semanas continuava a fechar a secção hoje sem nada que o explicasse.
 *
 * As três regras que ficam presas aqui: **abre aberta**, **não se fecha por
 * baixo das mãos dela**, e **nada de visitas anteriores lhe fecha nada**.
 */
describe("as secções nunca aparecem fechadas", () => {
  async function seccao(id: string) {
    return waitFor(() => {
      const el = document.getElementById(`seccao-${id}`);
      if (!el) throw new Error("ainda não");
      return el;
    });
  }

  /**
   * O botão do TÍTULO da secção, e não um `aria-expanded` qualquer lá dentro.
   *
   * O mesmo `:scope > div >` que o salto da Conferência usa, e pela mesma
   * razão: dentro de uma secção há outras coisas que abrem e fecham — os mood
   * boards têm as suas dobras, os Serviços têm as suas —, e apanhá-las aqui
   * fazia este teste falhar por uma dobra que não é a que se está a medir.
   */
  const cabecalho = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>(":scope > div > button[aria-expanded]");

  it("uma proposta acabada abre com tudo à vista", async () => {
    seedDraft(1);
    renderStudio();
    for (const id of ["evento", "capas", "servicos", "orcamento", "total"]) {
      const el = await seccao(id);
      expect(cabecalho(el)?.getAttribute("aria-expanded"), `a secção «${id}» abriu fechada`).toBe(
        "true",
      );
    }
  });

  it("uma dobra guardada numa visita anterior já não fecha nada", async () => {
    // A chave antiga pode continuar no browser dela durante meses. Ignorá-la é
    // o que faz esta correcção valer também para quem já a tem escrita.
    localStorage.setItem("liquen-estudio-secoes", JSON.stringify({ evento: true, total: true }));
    seedDraft(1);
    renderStudio();
    const evento = await seccao("evento");
    await waitFor(() => expect(cabecalho(evento)?.getAttribute("aria-expanded")).toBe("true"));
    expect(cabecalho(await seccao("total"))?.getAttribute("aria-expanded")).toBe("true");
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   *
   * Um editor que se mexe sozinho enquanto se escreve é pior do que um editor
   * comprido.
   */
  it("uma secção que fica completa ENQUANTO ela escreve não se fecha", async () => {
    seedDraft(1);
    renderStudio();
    const total = await seccao("total");
    const comoAbriu = cabecalho(total)?.getAttribute("aria-expanded");
    const campo = document.querySelector<HTMLInputElement>('[data-campo="clientNames"]');
    if (campo) fireEvent.change(campo, { target: { value: "Ana & Rui" } });
    await waitFor(() => expect(cabecalho(total)?.getAttribute("aria-expanded")).toBe(comoAbriu));
  });

  it("mas dobrar à mão continua a dobrar", async () => {
    // O gesto não desapareceu: fechar os Serviços para chegar ao Total num
    // telemóvel é legítimo. O que desapareceu foi a dobra que ninguém pediu.
    seedDraft(1);
    renderStudio();
    const servicos = await seccao("servicos");
    fireEvent.click(cabecalho(servicos)!);
    await waitFor(() => expect(cabecalho(servicos)?.getAttribute("aria-expanded")).toBe("false"));
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS CAIXAS DE TEXTO DO ORÇAMENTO NUM TELEMÓVEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do registo do audit, e é um dos oito bloqueios: «a caixa do nome da linha do
 * orçamento tem 62 px — 27 com a proposta bilingue ligada».
 *
 * MEDIDO a 390 px: a fila tem 318 px dentro do cartão, e as colunas fixas (a
 * escala, o preço) mais os espaços comem 264. Sobram 54 px para os campos de
 * texto — e como eles são `flex-1` com `min-w-0`, não quebram: encolhem.
 * Escrever «Decoração da Cerimónia» numa caixa de 62 px é escrever às cegas, e
 * o que ali se escreve é o texto que o casal lê no PDF.
 *
 * O jsdom não faz layout: não há aqui píxeis para medir — a geometria está
 * medida no browser e vive no relatório. O que se prende é a DECISÃO, para que
 * ninguém a desfaça sem dar por isso.
 */
describe("o orçamento a 390 px", () => {
  it("o nome de uma linha não encolhe abaixo do mínimo da casa", async () => {
    seedDraft(1);
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>),
        budgetItems: ["Decor Cerimónia"],
      }),
    );
    renderStudio("Orçamento");
    const nome = await screen.findByRole("textbox", { name: "Item de orçamento" });
    // `min-w-[12rem]` é o mesmo mínimo que a fase do cronograma e os títulos de
    // grupo do `ServicesEditor` já usam. Com ele, o `flex-wrap` que já lá estava
    // passa a fazer o que existe para fazer: o nome fica sozinho numa fila.
    expect(nome.className).toContain("min-w-[12rem]");
  });

  it("e a linha do modelo de Organização parte em duas filas no telemóvel", async () => {
    seedDraft(1, {});
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>),
        template: "organizacao",
        budgetRows: [{ item: "Coordenação do dia", price: "1.500,00 €" }],
      }),
    );
    renderStudio("Orçamento");
    const item = await screen.findByRole("textbox", { name: "Item" });
    // A descrição ocupa a fila toda enquanto a LISTA for estreita, e o valor
    // desce para baixo — o mesmo desenho que as linhas adicionais já usavam.
    // O limiar deixou de ser `sm:` (640 de JANELA): a fila quebra pela largura
    // da caixa, e aos 1024 a coluna de conteúdo tem 504 px e não 975.
    expect(item.className).toContain("col-span-2");
    expect(item.className).toContain("@min-[26rem]:col-span-1");
    expect(item.parentElement?.className).toContain(
      "@min-[26rem]:grid-cols-[minmax(0,1fr)_10rem_auto]",
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE APAGA E NÃO VOLTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um inventário do estúdio contou vinte e uma acções irreversíveis, e várias
 * não tinham nada: nem pergunta, nem anular, nem sequer um aviso depois. O
 * item desaparecia e mais nada — uma página de inspiração com oito fotografias
 * curadas uma a uma, uma fase do cronograma com seis tarefas escritas à mão,
 * uma linha do orçamento.
 *
 * A regra está escrita por extenso em `aRemover` (`ProposalStudio.tsx`) e é
 * uma só: PERGUNTA-SE o que é raro e caro, OFERECE-SE ANULAR o que é frequente
 * e barato de refazer. Uma coisa ou a outra, nunca as duas.
 *
 * O que estes testes prendem é o que separa uma pergunta útil de um «Tens a
 * certeza?»: que a frase NOMEIA a coisa, que DIZ O NÚMERO do que vai com ela e
 * a consequência, e que responder «não» (ou «Anular») devolve exactamente o
 * que lá estava sem escrever nada.
 */
describe("acções irreversíveis: pergunta ou anulação, nunca nada", () => {
  /** Um rascunho de decoração com duas páginas de inspiração e o orçamento
   *  escrito — que é como uma proposta está quando estes «×» fazem estrago. */
  function seedDuasPaginas() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [
          // Os títulos não repetem nenhum rótulo de serviço de propósito: um
          // `getByDisplayValue("Cerimónia")` apanharia os dois campos.
          {
            title: "Altar e corredor",
            annotation: "",
            images: ["board/a.jpg", "board/b.jpg", "board/c.jpg"],
          },
          { title: "Mesa do jantar", annotation: "", images: ["board/d.jpg", "board/e.jpg"] },
        ],
        budgetItems: ["Decoração de cerimónia", "Centros de mesa"],
        budgetAmounts: [1200, 800],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  /** Um rascunho de organização, que é o modelo que tem cronograma. */
  function seedComCronograma() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "organizacao",
        ref: "PO Organização",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [
          { letter: "a)", title: "Coordenação", items: [{ label: "Dia do evento" }] },
        ],
        moodBoards: [],
        budgetItems: [],
        budgetRows: [
          { item: "Coordenação e planeamento integral", price: "6.500,00 €" },
          { item: "Coordenação no dia do evento", price: "1.850,00 €" },
        ],
        cronograma: [
          {
            title: "6-12 meses antes do casamento",
            items: ["Definição do conceito", "Escolha do espaço", "Reunião com fornecedores"],
          },
          { title: "1 mês antes", items: ["Confirmação de convidados"] },
        ],
        coverImages: ["", ""],
        totalAmount: 8350,
        totalVatMode: "acrescer",
      }),
    );
  }

  /** Os mood boards tal como estão gravados no rascunho, agora. */
  const boardsGravados = () =>
    (JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}").moodBoards ?? []) as {
      title: string;
      images: string[];
    }[];

  // ── A página de inspiração: PERGUNTA ────────────────────────────────────
  // A acção mais cara do estúdio — leva as fotografias todas daquela página e a
  // folha que elas ocupam no PDF. Rara e cara, portanto pergunta.

  it("remover uma página pergunta, e a pergunta nomeia, conta e diz onde ela saía", async () => {
    seedDuasPaginas();
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await screen.findAllByLabelText("Título do mood board");
    await user.click(screen.getAllByRole("button", { name: "Remover mood board" })[0]);

    const pergunta = (await screen.findByRole("alertdialog")).textContent ?? "";
    // O NOME que ela deu à página, e não «esta página».
    expect(pergunta).toMatch(/Altar e corredor/);
    // O NÚMERO de fotografias que vão com ela.
    expect(pergunta).toMatch(/3 fotografias/);
    // E ONDE ela estava a sair — a parte que decide a resposta e a única que
    // não se vê a olhar para o cartão.
    expect(pergunta).toMatch(/1\.ª das 2 páginas de inspiração do PDF/);
    // Nunca a frase que não acrescenta nada nenhuma.
    expect(pergunta).not.toMatch(/certeza/i);
  });

  it("cancelar a remoção da página não perde nada nem escreve nada", async () => {
    seedDuasPaginas();
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await screen.findAllByLabelText("Título do mood board");
    // O que está gravado ANTES — é com isto que se compara no fim.
    await waitFor(() => expect(boardsGravados()).toHaveLength(2));
    const antes = JSON.stringify(boardsGravados());

    await user.click(screen.getAllByRole("button", { name: "Remover mood board" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Cancelar$/ }));

    // A pergunta sai do ecrã, as duas páginas continuam lá…
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByDisplayValue("Altar e corredor")).toBeTruthy();
    expect(screen.getByDisplayValue("Mesa do jantar")).toBeTruthy();
    // …e o rascunho gravado é exactamente o mesmo: cancelar não escreve nada.
    expect(JSON.stringify(boardsGravados())).toBe(antes);
    // E não fica uma barra de «Anular» a oferecer o resgate de nada.
    expect(screen.queryByText(/Pode anular durante/)).toBeNull();
  });

  it("e confirmar remove mesmo — o caminho feliz não mudou", async () => {
    seedDuasPaginas();
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await screen.findAllByLabelText("Título do mood board");
    await user.click(screen.getAllByRole("button", { name: "Remover mood board" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Remover a página$/ }));
    await waitFor(() => expect(screen.queryByDisplayValue("Altar e corredor")).toBeNull());
    expect(screen.getByDisplayValue("Mesa do jantar")).toBeTruthy();
  });

  // ── A fase do cronograma: PERGUNTA ──────────────────────────────────────
  // Leva as tarefas todas que lhe estão dentro, e o «×» que a apaga fica dois
  // centímetros acima dos «×» das tarefas, do mesmo tamanho.

  it("remover uma fase pergunta, nomeando-a e contando as tarefas", async () => {
    seedComCronograma();
    renderStudio("Cronograma");
    const user = userEvent.setup();
    await screen.findAllByLabelText("Título da fase");
    await user.click(screen.getAllByRole("button", { name: "Remover fase" })[0]);

    const pergunta = (await screen.findByRole("alertdialog")).textContent ?? "";
    expect(pergunta).toMatch(/6-12 meses antes do casamento/);
    expect(pergunta).toMatch(/3 tarefas/);
    expect(pergunta).not.toMatch(/certeza/i);
  });

  it("cancelar a remoção da fase não perde nada nem escreve nada", async () => {
    seedComCronograma();
    renderStudio("Cronograma");
    const user = userEvent.setup();
    await screen.findAllByLabelText("Título da fase");
    await user.click(screen.getAllByRole("button", { name: "Remover fase" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Cancelar$/ }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    // A fase e as três tarefas continuam inteiras.
    expect(screen.getByDisplayValue("6-12 meses antes do casamento")).toBeTruthy();
    expect(screen.getByDisplayValue("Definição do conceito")).toBeTruthy();
    expect(screen.getByDisplayValue("Escolha do espaço")).toBeTruthy();
    expect(screen.getByDisplayValue("Reunião com fornecedores")).toBeTruthy();
    expect(screen.queryByText(/Pode anular durante/)).toBeNull();
  });

  it("a fase que é a última com tarefas diz que o cronograma perde a página", async () => {
    // A consequência que não se vê a olhar para o cartão: sem nenhuma fase com
    // tarefas, o cronograma deixa de ter folha no PDF.
    seedComCronograma();
    renderStudio("Cronograma");
    const user = userEvent.setup();
    await screen.findAllByLabelText("Título da fase");
    // Tira-se a segunda (uma tarefa só) e volta-se à primeira, que fica
    // sozinha a segurar a página.
    await user.click(screen.getAllByRole("button", { name: "Remover fase" })[1]);
    await user.click(await screen.findByRole("button", { name: /^Remover a fase$/ }));
    await waitFor(() => expect(screen.queryByDisplayValue("1 mês antes")).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Remover fase" })[0]);
    const pergunta = (await screen.findByRole("alertdialog")).textContent ?? "";
    expect(pergunta).toMatch(/3 tarefas/);
    expect(pergunta).toMatch(/cronograma deixa de ter página no PDF/);
  });

  // ── A tarefa: ANULAR ────────────────────────────────────────────────────
  // Gesto frequente: escreve-se a lista às apalpadelas. Uma caixa por cada «×»
  // seria cinco caixas para compor uma fase.

  it("remover uma tarefa faz-se já, e a barra diz qual saiu e quantas ficam", async () => {
    seedComCronograma();
    renderStudio();
    const user = userEvent.setup();
    const tarefa = await screen.findByDisplayValue("Escolha do espaço");
    await user.click(within(tarefa.parentElement!).getByLabelText("Remover tarefa"));

    // Sem pergunta pelo meio.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByDisplayValue("Escolha do espaço")).toBeNull();

    const barra = (await screen.findByText(/Pode anular durante/)).textContent ?? "";
    expect(barra).toMatch(/Escolha do espaço/);
    expect(barra).toMatch(/6-12 meses antes do casamento/);
    expect(barra).toMatch(/fica com 2/);
  });

  it("anular devolve a tarefa ao sítio de onde saiu", async () => {
    seedComCronograma();
    renderStudio();
    const user = userEvent.setup();
    const tarefa = await screen.findByDisplayValue("Escolha do espaço");
    await user.click(within(tarefa.parentElement!).getByLabelText("Remover tarefa"));
    await user.click(await screen.findByRole("button", { name: /^Anular$/ }));

    expect(await screen.findByDisplayValue("Escolha do espaço")).toBeTruthy();
    // As outras duas não se mexeram — anular repõe, não duplica.
    expect(screen.getByDisplayValue("Definição do conceito")).toBeTruthy();
    expect(screen.getByDisplayValue("Reunião com fornecedores")).toBeTruthy();
    // E a oferta desaparece: anulada uma vez, não fica a pedir de novo.
    expect(screen.queryByText(/Pode anular durante/)).toBeNull();
  });

  // ── A linha do orçamento: ANULAR ────────────────────────────────────────
  // O gesto mais repetido do estúdio — compõe-se linha a linha com o cliente ao
  // telefone. Uma pergunta a cada uma é um editor que ninguém usa.

  it("remover uma linha do orçamento faz-se já, e a barra diz qual era e quanto valia", async () => {
    seedDuasPaginas();
    renderStudio();
    const user = userEvent.setup();
    const campo = await screen.findByDisplayValue("Decoração de cerimónia");
    await user.click(within(campo.parentElement!).getByLabelText("Remover item"));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    const barra = (await screen.findByText(/Pode anular durante/)).textContent ?? "";
    expect(barra).toMatch(/Decoração de cerimónia/);
    expect(barra).toContain(eur(1200));
  });

  it("anular devolve a linha do orçamento com o preço que tinha", async () => {
    seedDuasPaginas();
    renderStudio();
    const user = userEvent.setup();
    const campo = await screen.findByDisplayValue("Decoração de cerimónia");
    await user.click(within(campo.parentElement!).getByLabelText("Remover item"));
    await user.click(await screen.findByRole("button", { name: /^Anular$/ }));

    expect(await screen.findByDisplayValue("Decoração de cerimónia")).toBeTruthy();
    // O preço volta com ela — uma linha sem preço não é a linha que lá estava.
    expect(await screen.findByLabelText("Preço de Decoração de cerimónia")).toHaveValue("1200");
    expect(screen.getByDisplayValue("Centros de mesa")).toBeTruthy();
    expect(screen.queryByText(/Pode anular durante/)).toBeNull();
  });

  it("a linha de Organização leva o mesmo — anular, com o valor tal como está escrito", async () => {
    seedComCronograma();
    renderStudio();
    const user = userEvent.setup();
    const campo = await screen.findByDisplayValue("Coordenação no dia do evento");
    await user.click(within(campo.parentElement!).getByLabelText("Remover linha"));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    const barra = (await screen.findByText(/Pode anular durante/)).textContent ?? "";
    expect(barra).toMatch(/Coordenação no dia do evento/);
    // Aqui o valor é TEXTO, e a barra di-lo à letra em vez de o tentar somar.
    expect(barra).toMatch(/1\.850,00 €/);

    await user.click(await screen.findByRole("button", { name: /^Anular$/ }));
    expect(await screen.findByDisplayValue("Coordenação no dia do evento")).toBeTruthy();
    expect(screen.getByDisplayValue("1.850,00 €")).toBeTruthy();
  });

  // ── O «Limpar rascunho» ─────────────────────────────────────────────────
  // Continua sem pergunta, de propósito (ver `clearDraft`): já tem a sua
  // protecção, e as duas seriam duas respostas ao mesmo gesto. O que faltava
  // era o NÚMERO — quem não sabe o que perdeu não sabe se vale a pena anular.

  it("«Limpar rascunho» diz o que levou, com os números, enquanto dá para anular", async () => {
    seedDuasPaginas();
    renderStudio();
    const user = userEvent.setup();
    await screen.findAllByLabelText("Título do mood board");
    await user.click(await screen.findByRole("button", { name: /Limpar rascunho/ }));

    const barra = (await screen.findByText(/Pode anular durante/)).textContent ?? "";
    // Duas páginas de inspiração, cinco fotografias, um serviço, duas linhas.
    expect(barra).toMatch(/2 páginas de inspiração/);
    expect(barra).toMatch(/5 fotografias/);
    expect(barra).toMatch(/2 linhas de orçamento/);
    // E continua sem pergunta nenhuma antes — é a decisão escrita em `limpo`.
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  // ── O envio ─────────────────────────────────────────────────────────────
  // A acção mais irreversível da casa. A pergunta confirmava só a MORADA.

  it("a confirmação do envio diz para quem vai, quantas páginas, que total e em que língua", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));

    const resumo = (await screen.findByText(/Enviar para/)).textContent ?? "";
    // PARA QUEM.
    expect(resumo).toContain("maria@example.pt");
    // QUANTAS PÁGINAS — com o «cerca de» que a contagem promete, e não um
    // número exacto que o desenho do PDF pode desmentir.
    expect(resumo).toMatch(/cerca de \d+ páginas/);
    // EM QUE LÍNGUA — tira-se uma prova em inglês no passo anterior e o
    // selector fica lá.
    expect(resumo).toMatch(/em português/);
    // QUE TOTAL — o mesmo bloco de totais que o gerador do PDF usa.
    expect(resumo).toContain(eur(3690));
  });

  it("cancelar o envio não envia nada — e o passo não fica dado por feito", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Cancelar$/ }));

    // Nada seguiu para o servidor: nem um POST à rota da proposta.
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("/proposta-doc") &&
          ((init as RequestInit | undefined)?.method ?? "GET") === "POST",
      ),
    ).toHaveLength(0);
    // Nem o cartão de êxito («Enviar de novo / nova revisão» só existe lá).
    expect(screen.queryByRole("button", { name: /Enviar de novo/ })).toBeNull();
    // E o botão volta ao sítio, para se poder responder outra vez.
    expect(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ })).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE MUDOU, DITO ONDE O GESTO FOI FEITO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quatro acções do estúdio corriam bem e deixavam a pessoa na dúvida: o
 * resultado acontecia FORA do sítio onde ela carregou — a meio de um documento
 * de catorze páginas, dentro de uma secção fechada, ou em lado nenhum que se
 * visse.
 *
 * A régua destes testes é a mesma da casa: a frase diz o que MUDOU, com o
 * número do que mudou mesmo — nunca o do que foi pedido.
 */
describe("o estúdio diz o que mudou quando não se vê", () => {
  it("inserir um bloco de modelo diz em que página do PDF ele calhou", async () => {
    // O bloco entra no FIM do array; o PDF sai pela ordem dos Serviços, e por
    // isso ele aterra em PRIMEIRO. É exactamente essa diferença que não se vê.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [
          { letter: "a)", title: "Cerimónia", items: [{ label: "Igreja" }] },
          { letter: "b)", title: "Jantar", items: [{ label: "Mesas" }] },
        ],
        moodBoards: [{ title: "Jantar", annotation: "", images: ["q1/jantar-1.jpg"] }],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    // As fotos do modelo já são deste pedido — não há recópia a fazer, e o que
    // se está a medir é só a frase.
    modelosServidor = [
      {
        id: "mb1",
        nome: "Cerimónia",
        tipo: "moodboard",
        moodboard: { title: "Cerimónia", annotation: "", images: ["q1/cerimonia-1.jpg"] },
      },
    ];
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: /De um modelo…/ }))[0]);
    await user.click(await screen.findByRole("button", { name: "Cerimónia" }));

    expect(
      await screen.findByText("«Cerimónia» entrou como a 1.ª das 2 páginas de inspiração do PDF."),
    ).toBeTruthy();
  });

  it("«Arrumar eu» conta as linhas que MUDARAM de sítio, não as que existem", async () => {
    // Três linhas, e só duas trocam de lugar: a Cerimónia já estava no sítio.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [
          { letter: "a)", title: "Cerimónia", items: [{ label: "Igreja" }] },
          { letter: "b)", title: "Jantar", items: [{ label: "Mesas" }] },
          { letter: "c)", title: "Bolo", items: [{ label: "Bolo de noiva" }] },
        ],
        moodBoards: [],
        budgetItems: ["Decor Cerimónia", "Decor Bolo", "Decor Jantar"],
        budgetAmounts: [100, 200, 300],
        coverImages: ["", ""],
        totalAmount: 600,
        totalVatMode: "acrescer",
      }),
    );
    renderStudio("Orçamento");
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: "Arrumar eu" }))[0]);

    expect(
      await screen.findByText(
        "2 linhas do orçamento mudaram de sítio. Daqui para a frente manda a ordem que aqui está.",
      ),
    ).toBeTruthy();
    // «3 linhas» seria a mentira pequena: é o tamanho da lista, não o do que
    // se mexeu.
    expect(screen.queryByText(/3 linhas do orçamento/)).toBeNull();
    // As páginas de inspiração não entram na frase quando não há nenhuma a
    // mexer — um zero na conta é ruído.
    expect(screen.queryByText(/páginas de inspiração/)).toBeNull();
  });

  it("corrigir UMA gralha diz que palavra ficou escrita, e em que campo", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
        moodBoards: [],
        budgetItems: ["Decor Cerimonia"],
        budgetAmounts: [100],
        coverImages: ["", ""],
        totalAmount: 100,
        totalVatMode: "acrescer",
      }),
    );
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^5\s*Rever e enviar/ }));
    await user.click(await screen.findByRole("button", { name: "Corrigir" }));

    // A palavra muda numa linha do orçamento que está no passo 1 — fora do
    // ecrã. O que se vê aqui é a linha sair da lista, e isso não diz o que
    // ficou escrito lá.
    expect(
      await screen.findByText("«Cerimonia» passou a «Cerimónia» — Orçamento · linha 1."),
    ).toBeTruthy();
  });

  it("o «Tentar» de uma célula sem fotografia diz quando também não deu", async () => {
    seedDraft(1);
    assetsFalham = true;
    renderStudio("Inspiração");

    await user_clicarNoTentar();
    // Falha outra vez: a célula volta EXACTAMENTE ao que era antes do clique,
    // e sem esta frase isso é indistinguível de um botão que não faz nada.
    expect(
      await screen.findByText(
        "Também não deu desta vez. As fotografias estão guardadas — é a lista que não vem.",
      ),
    ).toBeTruthy();
  });

  it("duplicar um mood board diz QUAL foi e em que página caiu a cópia", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [
          { letter: "a)", title: "Cerimónia", items: [{ label: "Igreja" }] },
          { letter: "b)", title: "Jantar", items: [{ label: "Mesas" }] },
        ],
        moodBoards: [
          { title: "Cerimónia", annotation: "", images: ["q1/c1.jpg"] },
          { title: "Jantar", annotation: "", images: ["q1/j1.jpg"] },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    renderStudio("Inspiração");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Duplicar o mood board 1" }));

    // O botão é um ícone de 28 px repetido em cada cartão, e o cartão é alto:
    // a cópia nasce abaixo da dobra. «Mood board duplicado.» não dizia nem
    // qual deles nem onde.
    expect(
      await screen.findByText(
        "«Cerimónia» duplicado — a cópia é a 2.ª das 3 páginas de inspiração do PDF.",
      ),
    ).toBeTruthy();
  });

  /** O botão da célula que não tem URL nenhum para mostrar. */
  async function user_clicarNoTentar() {
    const botao = (
      await screen.findAllByRole("button", { name: /Ir buscar outra vez as fotografias/i })
    )[0];
    await userEvent.click(botao);
  }
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTÚDIO VIVE NUMA COLUNA, E NÃO NUMA JANELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre as fotografias que mandou do telemóvel: «está tudo
 * enorme, pouco adaptado», «isto está super pouco prático».
 *
 * A CONTA QUE MANDA EM TUDO. A coluna onde ela escreve vive dentro de três
 * outras — a barra lateral do back office (`w-64`, a partir de 1024), o índice
 * do estúdio (`w-48`, a partir de 1024) e o painel «O que vai sair»
 * (`w-[21rem]`, a partir de 1440). Medida:
 *
 *     janela   coluna de conteúdo
 *       375        ~351 px
 *       640        ~592 px
 *      1023        ~975 px
 *      1024        ~504 px   ← perde 471 px de um pixel para o outro
 *      1440        ~560 px
 *
 * `sm:` dispara aos 640 de JANELA e nunca mais volta atrás: tudo o que decidiu
 * «duas colunas» com 592 px de caixa continuava a decidir duas colunas quando a
 * caixa passava a ter 504. Era esse o defeito de fundo, e é isso que estes
 * testes prendem.
 *
 * ── PORQUE É QUE O TESTE RESOLVE AS CLASSES À MÃO ──────────────────────────
 *
 * O jsdom não faz disposição e não avalia `@media` nem `@container`: desenhar a
 * 375 e a 1024 dá o mesmo DOM com a mesma `className`. Um teste que se ficasse
 * pelo `toContain("@min-[26rem]:grid-cols-2")` afirmava a ORTOGRAFIA da classe
 * e não a decisão — e passava na mesma se alguém lhe pusesse um `sm:` ao lado,
 * que é precisamente o defeito a apanhar.
 *
 * Por isso o `efectivas()` faz o que o navegador faria: separa cada classe nas
 * suas variantes, decide quais estão ligadas naquela JANELA e naquela CAIXA, e
 * devolve os utilitários que sobram. Uma variante que ele não conheça REBENTA
 * em vez de ser ignorada em silêncio. É o mesmo molde do `Cortes.movel.test.tsx`
 * — aqui com o eixo que falta, que é o do contentor.
 *
 * A geometria a sério mede-se no browser; o que aqui se prende é a DECISÃO.
 */
describe("o estúdio numa coluna, e não numa janela", () => {
  /** A largura da coluna de conteúdo em cada janela — a tabela lá de cima. */
  const COLUNA: Record<number, number> = {
    375: 351,
    640: 592,
    1023: 975,
    1024: 504,
    1440: 560,
  };

  type Contexto = {
    /** A largura da JANELA — é o que `sm:` e `lg:` medem. */
    janela: number;
    /** A largura do CONTENTOR mais próximo — é o que `@min-[…]:` mede. */
    caixa: number;
    /**
     * A largura da FILA das três colunas — é o que `@min-[…]/estudio:` mede.
     *
     * Passou a haver um segundo contentor, com nome, e a razão está medida: o
     * índice e a própria fila perguntavam `lg:`, ou seja à JANELA. No painel que
     * abre a partir do cartão de um cliente a janela tinha 1280 e a fila tinha
     * 498 px — a fila montava-se na mesma e a coluna onde ela escreve ficava com
     * 282. Agora perguntam à zona, e este resolvedor tem de saber responder por
     * ela.
     */
    fila: number;
  };

  /**
   * Em cada janela, a coluna de conteúdo é o contentor de topo — e a fila é ela
   * mais o índice ao lado (12rem) e a folga (1,5rem). É uma aproximação, e
   * chega: o que estes casos decidem é bloco contra fila, e as duas pontas
   * ficam do lado certo em qualquer estimativa razoável.
   */
  const naColuna = (janela: number): Contexto => ({
    janela,
    caixa: COLUNA[janela],
    fila: COLUNA[janela] + 192 + 24,
  });

  /**
   * Separa `@min-[36rem]:hidden` em `["@min-[36rem]", "hidden"]` — sem partir
   * os dois pontos que vivem DENTRO de um valor arbitrário, como em
   * `[&::-webkit-details-marker]:hidden`.
   */
  function separar(classe: string): string[] {
    const partes: string[] = [];
    let actual = "";
    let dentro = 0;
    for (const c of classe) {
      if (c === "[" || c === "(") dentro++;
      else if (c === "]" || c === ")") dentro--;
      if (c === ":" && dentro === 0) {
        partes.push(actual);
        actual = "";
        continue;
      }
      actual += c;
    }
    partes.push(actual);
    return partes;
  }

  /** Esta variante está ligada neste contexto? */
  function ligada(variante: string, ctx: Contexto): boolean {
    if (variante === "sm") return ctx.janela >= 640;
    if (variante === "lg") return ctx.janela >= 1024;

    const emPixeis = (v: string, u: string) => Number(v) * (u === "rem" ? 16 : 1);

    const daFila = /^@min-\[(\d+(?:\.\d+)?)(px|rem)\]\/estudio$/.exec(variante);
    if (daFila) return ctx.fila >= emPixeis(daFila[1], daFila[2]);

    const doContentor = /^@min-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(variante);
    if (doContentor) return ctx.caixa >= emPixeis(doContentor[1], doContentor[2]);

    const daJanela = /^min-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(variante);
    if (daJanela) return ctx.janela >= emPixeis(daJanela[1], daJanela[2]);

    // Estes três não existem neste back office (ver `Cortes.contrato.test.ts`).
    // Rebentam aqui com o nome, em vez de passarem por «variante desconhecida».
    if (/^(max-)?(md|xl|2xl)$/.test(variante)) {
      throw new Error(`\`${variante}:\` não é um corte deste back office`);
    }

    // O que não é uma pergunta sobre LARGURA — um selector, um estado, um
    // grupo — não decide nada aqui e fica ligado.
    return true;
  }

  /** As classes de um elemento — `className` num `<svg>` não é uma string. */
  const classesDe = (el: Element) => el.getAttribute("class") ?? "";

  /** Os utilitários que sobram depois de resolver as variantes. */
  function efectivas(className: string, ctx: Contexto): Set<string> {
    const fora = new Set<string>();
    for (const classe of className.split(/\s+/).filter(Boolean)) {
      const partes = separar(classe);
      const utilitario = partes.pop()!;
      if (partes.every((v) => ligada(v, ctx))) fora.add(utilitario);
    }
    return fora;
  }

  /** Os utilitários de `display`, que são os que decidem «vê-se ou não». */
  const DISPLAY = new Set([
    "hidden",
    "block",
    "inline",
    "inline-block",
    "flex",
    "inline-flex",
    "grid",
    "inline-grid",
    "contents",
  ]);

  /**
   * Este elemento vê-se, resolvidas as variantes?
   *
   * `hidden @min-[36rem]:flex` é o idioma da casa e conta-se como o navegador o
   * conta: entre dois `display` ligados, o que traz VARIANTE ganha ao que não
   * traz — é o que a ordem da folha de estilos do Tailwind garante.
   */
  function seVe(el: Element, ctx: Contexto): boolean {
    let base: string | null = null;
    let comVariante: string | null = null;
    for (const classe of classesDe(el).split(/\s+/).filter(Boolean)) {
      const partes = separar(classe);
      const utilitario = partes.pop()!;
      if (!DISPLAY.has(utilitario)) continue;
      if (!partes.every((v) => ligada(v, ctx))) continue;
      if (partes.length === 0) base = utilitario;
      else comVariante = utilitario;
    }
    return (comVariante ?? base) !== "hidden";
  }

  /**
   * Vê-se, aqui dentro, um rótulo que diga exactamente estas palavras?
   *
   * Só FOLHAS: um `<label>` que embrulha o rótulo e o campo tem o mesmo
   * `textContent` do rótulo, e contá-lo dava por visível um nome que estava
   * escondido — o teste passava a dizer o contrário do que se vê.
   */
  function rotuloVisivel(dentro: Element, palavras: string, ctx: Contexto): boolean {
    return [...dentro.querySelectorAll("*")].some(
      (el) =>
        el.children.length === 0 &&
        el.textContent?.trim() === palavras &&
        [el, ...ascendentes(el, dentro)].every((a) => seVe(a, ctx)),
    );
  }

  function ascendentes(el: Element, ate: Element): Element[] {
    const fora: Element[] = [];
    let p = el.parentElement;
    while (p && p !== ate.parentElement) {
      fora.push(p);
      p = p.parentElement;
    }
    return fora;
  }

  /** A coluna onde ela escreve. */
  const colunaDeConteudo = () =>
    document.querySelector('[class~="@container"][class~="flex-1"]') as HTMLElement;

  /** O contentor `@container` mais próximo, a subir. */
  function contentorDe(el: Element): HTMLElement {
    let p: HTMLElement | null = el.parentElement;
    while (p) {
      if (p.className.split(/\s+/).includes("@container")) return p;
      p = p.parentElement;
    }
    throw new Error("este elemento não vive dentro de nenhum `@container`");
  }

  // ══════════════════════════════════════════════════════════════════════
  // 1 · O CONTENTOR DE TOPO
  // ══════════════════════════════════════════════════════════════════════

  it("a coluna onde ela escreve declara-se contentor — é ela que manda, não a janela", async () => {
    seedDraft(1);
    renderStudio();
    await screen.findByRole("textbox", { name: "Clientes" });

    const coluna = colunaDeConteudo();
    expect(coluna, "a coluna de conteúdo perdeu o `@container`").toBeTruthy();
    // `min-w-0` continua lá: sem ele, um filho longo empurra a coluna e a
    // conta de cima deixa de valer.
    expect(coluna.className.split(/\s+/)).toContain("min-w-0");
  });

  /**
   * O índice do estúdio era `hidden … lg:block` e passou a existir também
   * abaixo de 1024 (uma tira que rola de lado). O invólucro dos dois, porém,
   * era `flex gap-6` em TODAS as larguras: enquanto o índice estava escondido a
   * fila tinha um filho só e não se notava, mas assim que ele existe a 375 px
   * fica AO LADO do conteúdo e esmaga a coluna onde ela escreve.
   *
   * O teste tem de olhar para o INVÓLUCRO e não para o índice: do lado do filho
   * não há classe nenhuma que desfaça uma fila, e um teste ao índice passaria
   * por acidente — como passava enquanto ele estava `hidden`.
   */
  it("numa zona estreita o índice não fica ao lado da coluna: a fila só existe quando cabe", async () => {
    seedDraft(1);
    renderStudio();
    await screen.findByRole("textbox", { name: "Clientes" });
    const coluna = colunaDeConteudo();
    const indice = screen.getByRole("navigation", { name: "Secções da proposta" });
    const involucro = coluna.parentElement!;
    expect(involucro.contains(indice), "o índice e a coluna são irmãos").toBe(true);

    // Numa zona estreita o invólucro é um bloco: o índice empilha por cima do
    // conteúdo. A pergunta é à ZONA e não à janela — a razão está medida no
    // `LARGURA_MINIMA_DA_FILA`: com a janela a 1280, esta zona tinha 498 px, o
    // `lg:` dizia que sim, e a coluna onde ela escreve ficava com 282.
    expect(efectivas(classesDe(involucro), naColuna(375)).has("flex")).toBe(false);
    // Com zona que chegue é a fila de sempre, com o mesmo intervalo.
    const noPortatil = efectivas(classesDe(involucro), naColuna(1024));
    expect(noPortatil.has("flex")).toBe(true);
    expect(noPortatil.has("gap-6")).toBe(true);
  });

  it("e nenhuma classe do estúdio pergunta pelos cortes que esta casa não usa", async () => {
    seedDraft(1);
    renderStudio();
    await screen.findByRole("textbox", { name: "Clientes" });

    // O resolvedor rebenta com o nome da variante proibida. Passar por todas
    // as classes desenhadas é a rede que apanha um `xl:` que volte por outra
    // porta — incluindo um que venha de uma constante fora do JSX.
    const ctx = naColuna(1024);
    for (const el of document.querySelectorAll("[class]")) {
      expect(() => efectivas(classesDe(el), ctx), classesDe(el)).not.toThrow();
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // 2 · A MINIATURA REPETIDA SETE VEZES
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Palavras dela: «minúscula e repetida sete vezes».
   *
   * A pré-visualização de cada página era desenhada SEMPRE e só escondida por
   * CSS a partir de 1536 — o custo que o `PainelDoEstudio.tsx:52-57` conta por
   * extenso, aqui multiplicado pelo número de mood boards. E o número estava
   * errado: o painel da direita passou a aparecer aos 1440, portanto entre
   * 1440 e 1535 apareciam as DUAS.
   */
  describe("a pré-visualização da página só se monta onde se vê", () => {
    /** Faz o `useMedida` responder «sim» a tudo — o ecrã largo. */
    /**
     * ── ALARGAR A FILA, E JÁ NÃO A JANELA ──────────────────────────────────
     *
     * Isto alargava a JANELA (`matchMedia`), porque era à janela que o painel
     * perguntava. Era essa a avaria: MEDIDO num Chromium, no painel que abre a
     * partir do cartão de um cliente, a janela tinha 2000 px e a fila onde o
     * painel aterra tinha 712 — a coluna onde ela escreve ficava com 136 px.
     *
     * Agora quem responde é a fila, medida. Aqui dá-se-lhe uma largura que
     * chegue, que é o que o produto passou a perguntar.
     */
    function ecraLargo() {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        width: 1400,
        height: 0,
        top: 0,
        left: 0,
        right: 1400,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    }

    it("sem espaço para o painel da direita, a miniatura está lá", async () => {
      // Sem `matchMedia`, o `useMedida` responde `false` — o caminho estreito.
      seedDraft(2);
      renderStudio();
      expect(await screen.findByText("A página, como vai sair")).toBeTruthy();
    });

    it("com espaço para o painel, não se DESENHA — não é `hidden`", async () => {
      ecraLargo();
      seedDraft(2);
      renderStudio();
      await screen.findByRole("textbox", { name: "Clientes" });

      // Não é «está escondida»: é não existir. Escondida por CSS, ela era
      // desenhada na mesma — uma vez por mood board, com as URLs de todas as
      // fotografias.
      expect(screen.queryByText("A página, como vai sair")).toBeNull();
    });

    it("e a coluna de 15 rem não fica aberta e vazia quando ela sai", async () => {
      ecraLargo();
      seedDraft(2);
      renderStudio();
      await screen.findByRole("textbox", { name: "Clientes" });

      const grelhas = [...document.querySelectorAll('[class*="grid-cols-[minmax(0,1fr)_15rem]"]')];
      expect(grelhas, "sem miniatura, a segunda coluna não tem para quem existir").toHaveLength(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 3 · A GRELHA DAS FOTOGRAFIAS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * O portátil mostrava as fotografias MAIS PEQUENAS do que o telemóvel: aos
   * 1024 a grelha tinha ~300 px úteis e desenhava quatro colunas (miniaturas de
   * 68 px); a 375, com os mesmos ~300, desenhava três (92 px). A pergunta é a
   * largura do CARTÃO, não a da janela.
   */
  describe("a grelha das fotografias", () => {
    /**
     * A largura interior do cartão do board em cada janela: a coluna de
     * conteúdo, menos o índice das páginas quando ele é coluna (176 + 20 de
     * intervalo — só a 1023, ver o bloco 3b), menos os 32 do `p-4`.
     *
     * Não é uma constante escrita à mão por preguiça: a mesma conta é REFEITA
     * a partir do DOM no último teste do bloco 3b, que lê a decisão da grelha
     * do índice em vez de a assumir. Este mapa é a leitura, aquele é a prova.
     */
    const CARTAO: Record<number, number> = { 375: 319, 640: 560, 1023: 747, 1024: 472, 1440: 528 };

    /**
     * O contexto de uma classe escrita NO CARTÃO: a janela, o cartão como
     * contentor mais próximo, e a fila do estúdio — que este bloco não decide,
     * mas de que o resolvedor precisa para responder por `@min-[…]/estudio:`.
     * A fila é a mesma estimativa do `naColuna`: a coluna mais o índice (12rem)
     * e a folga (1,5rem).
     */
    const noCartao = (janela: number): Contexto => ({
      janela,
      caixa: CARTAO[janela],
      fila: COLUNA[janela] + 192 + 24,
    });

    async function grelha() {
      seedDraft(4);
      renderStudio();
      await screen.findByRole("textbox", { name: "Clientes" });
      const el = document.querySelector('[class*="grid-cols-3"]') as HTMLElement;
      expect(el, "a grelha das fotografias desapareceu").toBeTruthy();
      return el;
    }

    it("o cartão do board é o contentor — a grelha não pergunta à janela", async () => {
      const el = await grelha();
      const cartao = contentorDe(el);
      // O contentor mais próximo é o CARTÃO e não a coluna de conteúdo: é a
      // largura dele que decide quantas fotografias cabem numa fila.
      expect(cartao.className).toContain("rounded-2xl");
      expect(cartao).not.toBe(colunaDeConteudo());
    });

    it("a 375 px são três colunas, porque em 319 px quatro não cabem", async () => {
      const el = await grelha();
      const cols = efectivas(classesDe(el), noCartao(375));
      expect(cols.has("grid-cols-4")).toBe(false);
      expect(cols.has("grid-cols-3")).toBe(true);
    });

    /**
     * O que uma pergunta de contentor garante e uma de janela nunca pode: um
     * cartão mais estreito NUNCA leva mais colunas do que um cartão mais largo.
     * Era exactamente isso que estava partido — o cartão a 1024 encolhia para
     * 276 px e ganhava na mesma a quarta coluna que a 375, com 319, não tinha.
     */
    it("um cartão mais estreito nunca leva mais colunas do que um mais largo", async () => {
      const el = await grelha();
      const colunas = (janela: number) =>
        efectivas(classesDe(el), noCartao(janela)).has("grid-cols-4") ? 4 : 3;

      const janelas = [375, 640, 1023, 1024, 1440];
      for (const a of janelas) {
        for (const b of janelas) {
          if (CARTAO[a] >= CARTAO[b]) continue;
          expect(
            colunas(a),
            `o cartão a ${a} tem ${CARTAO[a]} px e leva ${colunas(a)} colunas; ` +
              `a ${b} tem ${CARTAO[b]} e leva ${colunas(b)}`,
          ).toBeLessThanOrEqual(colunas(b));
        }
      }
    });

    /** A tabela das cinco larguras, que é o resultado desta missão. */
    it("a miniatura em cada uma das cinco larguras", async () => {
      const el = await grelha();
      const miniatura = (janela: number) => {
        const n = efectivas(classesDe(el), noCartao(janela)).has("grid-cols-4") ? 4 : 3;
        return Math.floor((CARTAO[janela] - (n - 1) * 8) / n);
      };
      // Antes: 101 · 134 · 229 · 68 · 105 — o portátil dela era o pior de todos.
      expect(miniatura(375)).toBe(101);
      expect(miniatura(640)).toBe(134);
      expect(miniatura(1023)).toBe(180);
      expect(miniatura(1024)).toBe(112);
      expect(miniatura(1440)).toBe(126);
      // E nenhuma desce abaixo do telemóvel, que era o defeito de partida.
      for (const janela of [640, 1023, 1024, 1440]) {
        expect(miniatura(janela), `a ${janela}`).toBeGreaterThanOrEqual(miniatura(375));
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 3b · O ÍNDICE DAS PÁGINAS — O ÚLTIMO SÍTIO ONDE OS CORTES SE SOMAVAM
  // ══════════════════════════════════════════════════════════════════════

  /**
   * A coluna de 176 px do índice abria-se em `lg:` — no pixel exacto em que a
   * coluna de conteúdo cai de 975 para 504 px. Os dois cortes SOMAVAM-SE: o
   * cartão do board ficava com 276 px e as miniaturas com 86, quando sem a
   * coluna ficariam com 472 e 112.
   *
   * A resposta obriga a escrever uma inversão que parece errada e não é: a
   * caixa é MAIOR abaixo de 1024 do que acima, portanto a coluna lateral
   * desliga-se em todas as larguras de desktop e liga-se entre 640 e 1023.
   *
   * E as DUAS METADES têm de ler o mesmo sinal: a grelha que dá a largura vive
   * no `ProposalStudio` e a forma do índice (tira ou coluna) vive no
   * `MoodBoardIndice`, que não tem largura própria nenhuma. Em sinais
   * diferentes seria uma tira de `overflow-x-auto` espremida em 176 px de um
   * lado e um índice vertical à largura toda do outro — o defeito do
   * `useMedida.ts:16-21`.
   */
  describe("o índice das páginas de inspiração", () => {
    async function pecas() {
      seedDraft(4);
      renderStudio();
      await screen.findByRole("textbox", { name: "Clientes" });
      irAoPasso("Inspiração");
      const indice = screen.getByRole("navigation", { name: "Índice das páginas de inspiração" });
      const grelha = indice.parentElement!;
      const tira = indice.querySelector("ul")!;
      return { indice, grelha, tira };
    }

    it("a coluna lateral já não se abre no pixel em que a caixa encolhe 471", async () => {
      const { grelha } = await pecas();
      // A 1023 a caixa tem 975 px e a coluna cabe sem tirar nada.
      expect(efectivas(classesDe(grelha), naColuna(1023)).has("grid")).toBe(true);
      // A 1024 tem 504 — e 196 px de índice são 39% do sítio onde ela escreve.
      expect(efectivas(classesDe(grelha), naColuna(1024)).has("grid")).toBe(false);
      expect(efectivas(classesDe(grelha), naColuna(1440)).has("grid")).toBe(false);
      // No telemóvel continua a ser a tira, como sempre foi.
      expect(efectivas(classesDe(grelha), naColuna(375)).has("grid")).toBe(false);
    });

    it("e a forma do índice lê o MESMO limiar da grelha que lhe dá a largura", async () => {
      const { indice, grelha, tira } = await pecas();
      /** O limiar que traz um dado utilitário. */
      const limiar = (className: string, utilitario: string) => {
        for (const classe of className.split(/\s+/).filter(Boolean)) {
          const partes = separar(classe);
          if (partes.pop() === utilitario && partes.length) return partes.join(":");
        }
        return null;
      };
      const daGrelha = limiar(classesDe(grelha), "grid");
      expect(daGrelha, "a grelha do índice perdeu o limiar").toBeTruthy();
      expect(daGrelha).toMatch(/^@min-\[/);
      // A tira vira coluna exactamente onde a grelha abre a coluna…
      expect(limiar(classesDe(tira), "flex-col")).toBe(daGrelha);
      // …e o `sticky` do invólucro liga-se no mesmo sítio.
      expect(limiar(classesDe(indice), "sticky")).toBe(daGrelha);
    });

    it("o cartão do board deixa de perder 196 px no portátil dela", async () => {
      const { grelha } = await pecas();
      const foto = document.querySelector('[class*="grid-cols-3"]') as HTMLElement;
      /** A largura interior do cartão: caixa − índice (quando é coluna) − `p-4`. */
      const cartao = (janela: number) => {
        const comColuna = efectivas(classesDe(grelha), naColuna(janela)).has("grid");
        return COLUNA[janela] - (comColuna ? 176 + 20 : 0) - 32;
      };
      const miniatura = (janela: number) => {
        const n = efectivas(classesDe(foto), { ...naColuna(janela), caixa: cartao(janela) }).has(
          "grid-cols-4",
        )
          ? 4
          : 3;
        return Math.floor((cartao(janela) - (n - 1) * 8) / n);
      };
      // Os dois números que a missão pediu: 86 → 112 e 105 → 126.
      expect(cartao(1024)).toBe(472);
      expect(miniatura(1024)).toBe(112);
      expect(cartao(1440)).toBe(528);
      expect(miniatura(1440)).toBe(126);
      // E o telemóvel não mexeu.
      expect(miniatura(375)).toBe(101);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 4 · A FILA DO ORÇAMENTO — E O RÓTULO QUE DESAPARECIA SEM SUBSTITUTO
  // ══════════════════════════════════════════════════════════════════════

  /**
   * O cabeçalho («Item · Como escala · Preço · Extra») aparecia aos 640 de
   * JANELA, e a fila por baixo quebra por CAIXA. Num portátil a 1024 o
   * cabeçalho nomeava quatro colunas por cima de filas já quebradas em duas
   * linhas — que é literalmente a razão escrita no código para o esconder no
   * telemóvel.
   *
   * E havia informação a desaparecer sem substituto: onde a fila quebra,
   * «Como escala» e «Preço (sem IVA)» não voltavam em lado nenhum. Ficavam um
   * `<select>` e um `<input>` com `aria-label` — o leitor de ecrã sabia, o olho
   * não. É a mesma família do «Total» que se corrigiu esta semana.
   */
  describe("a fila do orçamento e os nomes das suas colunas", () => {
    async function fila() {
      seedDraft(1);
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>),
          budgetItems: ["Decor Cerimónia"],
        }),
      );
      renderStudio("Orçamento");
      const nome = await screen.findByRole("textbox", { name: "Item de orçamento" });
      const linha = nome.parentElement!;
      const lista = contentorDe(nome);
      const cabecalho = [...lista.children].find((c) =>
        c.textContent?.startsWith("Item"),
      ) as HTMLElement;
      expect(cabecalho, "o cabeçalho de colunas desapareceu").toBeTruthy();
      return { linha, lista, cabecalho };
    }

    it("o cabeçalho e a fila lêem a MESMA caixa, e não a janela", async () => {
      const { lista } = await fila();
      // A lista é o contentor: é a largura dela que diz se a fila cabe numa
      // linha só (medido: 548 px).
      expect(lista.className.split(/\s+/)).toContain("@container");
      expect(lista).not.toBe(colunaDeConteudo());
    });

    it("num portátil a 1024 o cabeçalho já não nomeia colunas que não estão lá", async () => {
      const { cabecalho } = await fila();
      // 504 px de coluna, e a fila precisa de 548 para caber numa linha:
      // o cabeçalho tem de estar calado.
      expect(seVe(cabecalho, naColuna(1024))).toBe(false);
      // E onde a fila cabe mesmo, ele volta.
      expect(seVe(cabecalho, naColuna(1023))).toBe(true);
      expect(seVe(cabecalho, naColuna(640))).toBe(true);
    });

    /**
     * O TESTE QUE MAIS VALE DESTA MISSÃO. A 375 px o cabeçalho não existe — e
     * nenhum destes nomes pode desaparecer com ele.
     */
    it("a 375 px nenhum rótulo de coluna desaparece sem substituto visível", async () => {
      const { linha, cabecalho } = await fila();
      const ctx = naColuna(375);
      expect(seVe(cabecalho, ctx), "a 375 px não há cabeçalho nenhum").toBe(false);

      for (const nome of ["Como escala", "Preço (sem IVA)"]) {
        expect(
          rotuloVisivel(linha, nome, ctx),
          `«${nome}» desaparece com o cabeçalho e não volta em lado nenhum`,
        ).toBe(true);
      }
      // O «Extra» já tinha o seu, em minúsculas, ao lado da quadrícula.
      expect(rotuloVisivel(linha, "extra", ctx)).toBe(true);
    });

    it("e onde o cabeçalho existe, o rótulo da fila cala-se — nunca os dois", async () => {
      const { linha, cabecalho } = await fila();
      const ctx = naColuna(640);
      expect(seVe(cabecalho, ctx)).toBe(true);
      for (const nome of ["Como escala", "Preço (sem IVA)", "extra"]) {
        expect(rotuloVisivel(linha, nome, ctx), `«${nome}» dito duas vezes no mesmo ecrã`).toBe(
          false,
        );
      }
    });

    it("o rótulo de dentro da fila não se anuncia duas vezes a quem ouve", async () => {
      const { linha } = await fila();
      const escala = within(linha).getByLabelText(/^Como escala/);
      // O `aria-label` já diz o nome; o rótulo visível é para o olho.
      const visivel = linha.querySelector('[aria-hidden="true"]');
      expect(visivel?.textContent?.trim()).toBe("Como escala");
      expect(escala.getAttribute("aria-label")).toContain("Como escala");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 5 · AS DUAS TABELAS DE PREÇOS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * 7 rem + 9 rem + botão + intervalos são ~308 px fixos; numa caixa de 504
   * sobram 196 para a DESCRIÇÃO — que é onde ela escreve o texto que o casal
   * lê. E os `col-span` têm de partilhar o variante da grelha: separados, dão
   * parágrafos a meia largura numa grelha de uma coluna.
   */
  describe("as duas tabelas de preços", () => {
    /** O variante que traz um dado utilitário, ou `""` se vier sem nenhum. */
    function varianteDe(className: string, prefixo: string): string | null {
      for (const classe of className.split(/\s+/).filter(Boolean)) {
        const partes = separar(classe);
        const utilitario = partes.pop()!;
        if (!utilitario.startsWith(prefixo)) continue;
        if (partes.length === 0) continue;
        return partes.join(":");
      }
      return null;
    }

    it("os valores adicionais: cabeçalho, fila e descrição no MESMO limiar", async () => {
      seedComPrecosEAdicionais();
      renderStudio("Orçamento");
      const desc = await screen.findByRole("textbox", { name: "Descrição da linha adicional" });
      const linha = desc.parentElement!.parentElement!;
      const lista = contentorDe(desc);
      const cabecalho = [...lista.children].find((c) =>
        c.textContent?.startsWith("Descrição"),
      ) as HTMLElement;

      const daFila = varianteDe(linha.className, "grid-cols-[minmax");
      expect(daFila, "a fila deixou de ter limiar").toBeTruthy();
      // O cabeçalho aparece exactamente onde a fila ganha as quatro colunas.
      expect(varianteDe(cabecalho.className, "grid")).toBe(daFila);
      // E a descrição larga a fila inteira exactamente aí.
      expect(varianteDe(desc.parentElement!.className, "col-span-")).toBe(daFila);
      // É uma pergunta de CAIXA, não de janela.
      expect(daFila).toMatch(/^@min-\[/);
      expect(lista.className.split(/\s+/)).toContain("@container");
    });

    it("as linhas de Organização: o mesmo, com a mesma resposta", async () => {
      seedDraft(1);
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>),
          template: "organizacao",
          budgetRows: [{ item: "Coordenação do dia", price: "1.500,00 €" }],
        }),
      );
      renderStudio("Orçamento");
      const item = await screen.findByRole("textbox", { name: "Item" });
      const linha = item.parentElement!;
      const daFila = varianteDe(linha.className, "grid-cols-[minmax");
      expect(daFila).toMatch(/^@min-\[/);
      expect(varianteDe(item.className, "col-span-")).toBe(daFila);
      expect(contentorDe(item).className.split(/\s+/)).toContain("@container");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 6 · AS GRELHAS DE CAMPOS E OS PARES PT/EN
  // ══════════════════════════════════════════════════════════════════════

  it("as grelhas de campos abrem a segunda coluna pela CAIXA, e não pela janela", async () => {
    seedDraft(1);
    renderStudio();
    const clientes = await screen.findByRole("textbox", { name: "Clientes" });
    const grelha = clientes.closest('[class*="grid-cols-1"]') as HTMLElement;

    // A 375 continua a ser uma coluna, como sempre foi.
    expect(efectivas(classesDe(grelha), naColuna(375)).has("grid-cols-2")).toBe(false);
    // E a decisão passou a ser sobre a caixa: `sm:` desapareceu.
    expect(classesDe(grelha)).not.toContain("sm:grid-cols-2");
    expect(efectivas(classesDe(grelha), naColuna(640)).has("grid-cols-2")).toBe(true);
  });

  it("o par PT/EN só fica lado a lado onde as duas caixas cabem — sem corte nenhum", async () => {
    seedDraftEmIngles(1);
    renderStudio("Orçamento");
    const rotulo = await screen.findByRole("textbox", { name: "Rótulo do total" });
    // O invólucro do par: `flex-wrap` puro, que é a resposta que o
    // `Cortes.contrato.test.ts` manda dar quando a pergunta é sobre a caixa.
    const par = rotulo.closest('[class*="flex-wrap"]') as HTMLElement;
    expect(par, "o par PT/EN perdeu o invólucro").toBeTruthy();
    expect(par.className).toContain("flex-wrap");
    // Nenhuma pergunta de largura: nem à janela, nem ao contentor.
    for (const classe of par.className.split(/\s+/)) {
      expect(separar(classe).length, `«${classe}» é um corte disfarçado`).toBe(1);
    }
    // E a caixa portuguesa pede a largura de que precisa, para o `flex-wrap`
    // ter o que decidir.
    const caixaPt = rotulo.closest('[class*="basis-"]') as HTMLElement;
    expect(caixaPt.className).toMatch(/basis-\[\d+rem\]/);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 7 · A ALTURA — O CABEÇALHO CUSTAVA UM TERÇO DO ECRÃ
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Num iPhone SE (375×667) gastavam-se ~702 px antes do primeiro campo onde
   * ela escreve: ele nascia abaixo da dobra. ~213 desses píxeis eram o
   * cabeçalho do estúdio, e ~74 eram três linhas de instrução que se lêem uma
   * vez. É o mesmo critério — e a mesma correcção — que a explicação do
   * «Extra» já levou duzentas linhas abaixo.
   */
  describe("o cabeçalho do estúdio", () => {
    const INSTRUCAO = /Monta aqui a proposta em PDF para o cliente/;

    it("não gasta três linhas com uma instrução que se lê uma vez", async () => {
      seedDraft(1);
      renderStudio();
      await screen.findByRole("textbox", { name: "Clientes" });
      expect(screen.queryByText(INSTRUCAO)).toBeNull();
    });

    it("mas ela continua a poder pedir-se, e num sítio só", async () => {
      seedDraft(1);
      renderStudio();
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", { name: "Ajuda: o que se faz no estúdio de propostas" }),
      );
      expect(screen.getAllByText(INSTRUCAO)).toHaveLength(1);
    });
  });
});

/** Um rascunho com preços e uma linha de valores adicionais. */
function seedComPrecosEAdicionais() {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      template: "decoracao",
      ref: "PO Decoração",
      clientNames: "Maria & Zé",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2026",
      location: "Évora",
      guests: "80 pax",
      serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
      moodBoards: [],
      budgetItems: ["Decor Cerimónia"],
      budgetAmounts: [900],
      budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "896,00 €" }],
      coverImages: ["", ""],
      totalAmount: 3000,
      totalVatMode: "acrescer",
      totalLabel: "Valor Total Decoração",
    }),
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PASSO 2 NÃO DESMONTA O ECRÃ — E É POR ISSO QUE NÃO HÁ NADA PARA ENCHER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto não corrige nada. É um prego, e vale a pena dizer porquê, porque a
 * auditoria ao back office pediu uma correcção para um mecanismo que este
 * ficheiro nunca teve.
 *
 * O achado F-04 dizia: «entre o clique em "Pré-visualizar" e o aparecimento do
 * resumo passam 3 a 8 segundos com a página completamente branca — nem sequer
 * o cabeçalho fica». A proposta que vinha atrás era desenhar o esqueleto das
 * páginas a encher-se uma a uma, 600–800 ms cada, para dar corpo a essa espera.
 *
 * ── PORQUE É QUE O ECRÃ BRANCO NÃO É EXPRIMÍVEL AQUI ──────────────────────
 *
 * O salto para o passo 2 é UM `setStep("prever")` chamado direito de um
 * `onClick`. Não há `useTransition`, não há `Suspense`, não há `React.lazy` e
 * não há um único `await` neste caminho — o `dynamic()` que traz o estúdio
 * resolve-se uma vez, ao abrir o painel, e nunca mais. O React fecha isso num
 * commit síncrono ANTES de devolver o fio ao navegador, e um navegador que não
 * chega a pintar nada pelo meio não tem como pintar branco: os píxeis antigos
 * ficam no ecrã até os novos estarem prontos. O ecrã branco não é um defeito
 * que se corrigiu — é um estado que este código não sabe produzir.
 *
 * E o cabeçalho não vai a lado nenhum: o passo 1 é `hidden`, não é
 * desmontado, e o `StepNav` vive por fora dos três passos. Medido com um
 * `MutationObserver` a vigiar onze mudanças de passo seguidas: 33 elementos
 * removidos ao todo, todos eles a árvore do PRÓPRIO passo 2 a desmontar-se no
 * caminho de volta. O `body` nunca ficou vazio.
 *
 * ── E A ESPERA, MEDIDA ────────────────────────────────────────────────────
 *
 * Mediana de cinco saltos, neste ambiente (jsdom monta cada nó em JS, portanto
 * é um TECTO generoso do que um motor a sério gasta a construir a mesma
 * árvore):
 *
 *     1 board ×3 fotos    1798 → 1865 nós   (+67)    94 ms
 *     7 boards ×6 fotos   3803 → 3873 nós   (+70)   198 ms
 *    14 boards ×8 fotos   6932 → 7005 nós   (+73)   313 ms
 *
 * O resumo inteiro são ~70 nós. Os 3 a 8 segundos não têm de onde sair, e o
 * que se paga são uns 100 a 300 ms — a banda dos ESTADOS de interface
 * (200–320 ms), não a de uma apresentação. Um esqueleto de seis páginas a
 * 600–800 ms cada seriam 3,6 a 4,8 segundos: não encheria a espera, criá-la-ia,
 * e é isso que a regra da casa proíbe («nenhuma animação atrasa uma tarefa»).
 *
 * As esperas a sério deste ecrã — desenhar o PDF e enviar a proposta, 10 a 60
 * segundos — já têm o `EmCurso` com o seu nome, a sua barra opaca e a
 * estimativa aprendida das gerações anteriores (`ProposalStudio.tsx`, ao lado
 * do «Descarregar PDF», e `AEnviarAProposta.tsx`).
 *
 * O que este prego guarda: no dia em que alguém trocar o `hidden` do passo 1
 * por uma montagem condicional, ou puser o salto atrás de qualquer coisa que
 * não seja síncrona, isto cai — e quem o fizer tem de dizer o que fica no ecrã
 * pelo meio antes de o refazer passar.
 *
 * Um prego que passa sempre não é um prego, portanto isto foi verificado ao
 * contrário: trocou-se à mão o `hidden` do passo 1 por `{step === "conteudo" &&
 * (…)}` e o teste caiu na linha do campo dos clientes. Depois desfez-se, e
 * volta a passar.
 */
describe("o salto para a pré-visualização não deixa o ecrã sem nada", () => {
  it("mantém o cabeçalho e o campo onde ela escrevia — os MESMOS nós — e não esvazia nada", async () => {
    seedDraft(3);
    renderStudio();

    const stepper = document.querySelector('nav[aria-label="Passos da proposta"]');
    expect(stepper).not.toBeNull();
    // O campo é o prego melhor do que o contentor do passo: é um nó que SÓ
    // existe dentro do passo 1, e é onde o dedo dela estava um segundo antes.
    // (Perguntar por `[hidden]` não serve — o passo 3 também é `hidden` e
    // responde à pergunta por ele, e então o teste passa mesmo com o passo 1
    // desmontado. Foi o que aconteceu à primeira versão disto.)
    const campoDosClientes = await screen.findByRole("textbox", { name: "Clientes" });

    // Vigia TODAS as remoções de elementos enquanto o passo muda. É a única
    // maneira honesta de perguntar «alguma coisa desapareceu?»: procurar o
    // cabeçalho DEPOIS não distingue «ficou» de «foi removido e reposto».
    const removidos: Element[] = [];
    const observador = new MutationObserver((registos) => {
      for (const r of registos)
        for (const n of Array.from(r.removedNodes)) {
          if (n.nodeType !== 1) continue;
          const el = n as Element;
          removidos.push(el, ...Array.from(el.querySelectorAll("*")));
        }
    });
    observador.observe(document.body, { childList: true, subtree: true });

    fireEvent.click(screen.getAllByRole("button", { name: /^5\s*Rever e enviar/ })[0]);

    // SEM `await`: o resumo tem de estar no ecrã no mesmo commit síncrono do
    // clique. É esta linha que fecha a porta ao ecrã branco — se o resumo
    // passar a chegar depois, há um intervalo por explicar, e é aí (e só aí)
    // que um esqueleto passaria a fazer sentido.
    expect(screen.getByText("Resumo da proposta")).toBeTruthy();

    observador.takeRecords();
    observador.disconnect();

    // O cabeçalho e o campo são os mesmos objectos, e continuam na página — o
    // passo 1 apenas escondido, nunca desmontado.
    expect(document.body.contains(stepper!)).toBe(true);
    expect(document.body.contains(campoDosClientes)).toBe(true);
    expect(removidos).not.toContain(stepper);
    expect(removidos).not.toContain(campoDosClientes);
    expect(campoDosClientes.closest("[hidden]")).not.toBeNull();
    expect(document.body.children.length).toBeGreaterThan(0);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SE DOBRA E DESDOBRA NESTE ECRÃ APARECE, EM VEZ DE SALTAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três dobras, o mesmo defeito: o corpo passava de inexistente a inteiro no
 * mesmo fotograma, porque abrir e fechar é uma troca de `display` e uma troca
 * de `display` é o corte mais seco que há.
 *
 * ── E A REGRA QUE ISTO NÃO PODE VIOLAR ────────────────────────────────────
 *
 * As nove secções abrem TODAS abertas, de propósito («uma secção nunca aparece
 * fechada», aqui em cima), e uma proposta com sete páginas de inspiração tem
 * sete dobras de disposição. Uma entrada ligada só ao «está aberto» corria em
 * todas ao carregar o estúdio — dezasseis blocos a animar de uma vez, por cima
 * da `.view-in` que o passo já traz. Isso não é uma entrada, é ruído; e é a
 * metade que se perde primeiro, porque a captura de ecrã é igual nos dois
 * casos.
 *
 * Por isso os testes vêm aos pares: um diz que a entrada CHEGA quando ela abre,
 * e o outro que ela NÃO chega quando a proposta abre.
 */
describe("as dobras do estúdio apresentam o que abrem", () => {
  const cartaoDaSeccao = (id: string) =>
    waitFor(() => {
      const el = document.getElementById(`seccao-${id}`);
      if (!el) throw new Error("ainda não");
      return el;
    });
  /** O botão do TÍTULO — o mesmo `:scope > div >` que o salto da Conferência usa. */
  const cabecalho = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>(":scope > div > button[aria-expanded]")!;
  const corpoDaSeccao = (id: string) => document.getElementById(`sec-${id}`)!;

  it("ao carregar a proposta, NENHUM corpo de secção anima", async () => {
    seedDraft(1);
    renderStudio("Inspiração");
    await screen.findByRole("heading", { name: "Mood boards" });
    const corpos = Array.from(document.querySelectorAll<HTMLElement>('[id^="sec-"]'));
    // CONTROLO POSITIVO: as secções estão MESMO desenhadas — senão «nenhuma
    // anima» era verdade por não haver nenhuma.
    expect(corpos.length).toBeGreaterThan(3);
    expect(
      corpos.filter((c) => c.className.includes("bo-entrada")).map((c) => c.id),
      "as secções animam todas ao abrir o estúdio — por cima da `.view-in` do passo",
    ).toEqual([]);
  });

  it("mas quando ELA abre uma secção, o corpo entra", async () => {
    seedDraft(1);
    renderStudio();
    const cartao = await cartaoDaSeccao("servicos");
    const botao = cabecalho(cartao);

    fireEvent.click(botao);
    await waitFor(() => expect(botao.getAttribute("aria-expanded")).toBe("false"));
    fireEvent.click(botao);
    await waitFor(() => expect(botao.getAttribute("aria-expanded")).toBe("true"));

    const classes = corpoDaSeccao("servicos").className.split(/\s+/);
    expect(classes, "a secção volta a aparecer a corte seco").toContain("bo-entrada");
    // Oito píxeis e não quatro: é um bloco de conteúdo a descer para dentro da
    // página, não um menu encostado ao botão que o abriu.
    expect(classes).toContain("bo-entrada-folha");
  });

  it("e a secção fechada continua a ter os campos — a entrada não desmontou nada", async () => {
    // A armadilha desta dobra está escrita no `Section`: desmontar apagava o
    // que lá está escrito. Uma entrada feita com `key` ou com montagem
    // condicional passava nos dois testes acima e partia isto.
    seedDraft(1);
    renderStudio();
    const cartao = await cartaoDaSeccao("servicos");
    fireEvent.click(cabecalho(cartao));
    await waitFor(() => expect(cabecalho(cartao).getAttribute("aria-expanded")).toBe("false"));
    const corpo = corpoDaSeccao("servicos");
    expect(corpo, "o corpo da secção fechada foi desmontado").toBeTruthy();
    expect(corpo.hidden).toBe(true);
  });

  it("a seta da secção escolhe a duração — não cai nos 150 ms de omissão", async () => {
    seedDraft(1);
    renderStudio();
    const cartao = await cartaoDaSeccao("servicos");
    const seta = cabecalho(cartao).querySelector<HTMLElement>("span[aria-hidden]")!;
    const classes = seta.className.split(/\s+/);
    // As duas setas irmãs da casa já escolheram: 200 ms na curva do back
    // office (`Overview.tsx` pela `.bo-mais-seta`, `Tarefas.tsx`). Sem duração
    // escrita, o Tailwind serve o seu `--default-transition-duration` — 150 ms
    // que ninguém escolheu, e uma quarta velocidade num ecrã com três.
    expect(classes, "a seta voltou aos 150 ms de omissão do Tailwind").toContain(
      "motion-safe:duration-200",
    );
    expect(classes).toContain("motion-safe:ease-[cubic-bezier(0,0,0.2,1)]");
    // ── E A LISTA TEM DE COBRIR O `rotate` ──────────────────────────────
    // No Tailwind v4 `rotate-90` emite a propriedade AUTÓNOMA `rotate`. A
    // forma NOMEADA `transition-transform` compila para
    // `transform, translate, scale, rotate` e cobre-a; a forma entre
    // parênteses rectos sai literal e deixa-a de fora — é a armadilha que já
    // mordeu esta casa duas vezes, e trocar uma pela outra apagava a animação
    // sem apagar uma única classe do ecrã.
    expect(classes).toContain("motion-safe:transition-transform");
    expect(seta.className, "a lista entre rectos não cobre o `rotate` autónomo").not.toMatch(
      /transition-\[[^\]]*\]/,
    );
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ESQUELETO DA MINIATURA ESBATE-SE — A SAÍDA QUE SAI DE GRAÇA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O esqueleto destas células é um `<span absolute inset-0>` POR CIMA da
 * fotografia, e não no lugar dela — decisão antiga, contada no `Thumb`. Ou
 * seja: quando a foto chega, ela já está pintada por baixo, e o esqueleto
 * desaparecia num fotograma. A fotografia dava um salto para dentro do ecrã
 * quando o que se passou foi só o pano levantar-se.
 *
 * É a única saída desta casa que não precisa de segurar nada montado à espera
 * — o destino final já está desenhado. O que ela NÃO pode ter é entrada: meio
 * segundo antes de aparecer conteúdo é o contrário do que um esqueleto faz.
 */
describe("o esqueleto da miniatura", () => {
  const celulas = () => Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"));
  const esqueleto = (celula: HTMLElement) => celula.querySelector<HTMLElement>(".bo-skeleton");

  /** O que o navegador faria: dar forma à imagem e disparar o `load`. */
  function aFotoChega(celula: HTMLElement) {
    const img = celula.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { value: 1500, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 1000, configurable: true });
    Object.defineProperty(img, "complete", { value: true, configurable: true });
    fireEvent.load(img);
  }

  async function comUmaCelulaAEsperar() {
    seedDraft(1);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/original.jpg", thumbUrl: "https://sb/mini.jpg" },
    ];
    renderStudio();
    await waitFor(() => {
      const img = celulas()[0]?.querySelector("img");
      if (!img?.getAttribute("src")) throw new Error("ainda não");
    });
    return celulas()[0];
  }

  it("enquanto a foto vem, está lá — e SEM entrada nenhuma", async () => {
    const celula = await comUmaCelulaAEsperar();
    const esq = esqueleto(celula);
    expect(esq, "a célula à espera ficou sem esqueleto").toBeTruthy();
    // A regra que não se pode violar: um esqueleto que se apresenta soma meio
    // segundo ANTES de aparecer conteúdo, que é o oposto do que ele faz.
    expect(esq!.className).not.toContain("bo-entrada");
    expect(esq!.className).not.toContain("bo-saida");
    // E continua a dizer aos testes que esta célula está à espera.
    expect(celula.querySelector("[data-a-carregar]")).not.toBeNull();
  });

  it("quando a foto chega, ESBATE-SE — não desaparece num fotograma", async () => {
    const celula = await comUmaCelulaAEsperar();
    aFotoChega(celula);
    const esq = await waitFor(() => {
      const e = esqueleto(celula);
      if (!e) throw new Error("o esqueleto desapareceu de um fotograma para o outro");
      if (!e.className.includes("bo-saida")) throw new Error("ainda não");
      return e;
    });
    const classes = esq.className.split(/\s+/);
    // `bo-saida-fundo` e não `bo-saida`: zero de deslocação. Quatro píxeis a
    // subir fariam a mancha cinzenta DESLIZAR por cima da fotografia — uma
    // coisa a mover-se onde não se moveu nada.
    expect(classes, "o esqueleto sai a deslizar por cima da fotografia").toContain(
      "bo-saida-fundo",
    );
    // E a pega dos testes cala-se: a célula já não está à espera de nada.
    expect(celula.querySelector("[data-a-carregar]")).toBeNull();
  });

  it("e quando a leitura FALHA, ele também se cala — não fica cinzento por cima do aviso", async () => {
    // A célula esteve mesmo à espera (a leitura começou «a caminho»), portanto
    // há esqueleto e ele esbate-se. O que não pode acontecer é ficar aceso: por
    // baixo dele está a única coisa que ela pode fazer — «Não carregou» e o
    // botão de tentar outra vez.
    seedDraft(1);
    assetsFalham = true;
    renderStudio();
    await screen.findAllByText(/Não carregou/i);
    for (const c of celulas()) {
      const esq = esqueleto(c);
      if (!esq) continue;
      expect(esq.className, "o esqueleto ficou aceso por cima do aviso").toContain(
        "bo-saida-fundo",
      );
      expect(c.querySelector("[data-a-carregar]")).toBeNull();
    }
  });
});

/**
 * Achados n.º 5, 16 e 17 da auditoria: «-500» via-se negativo e contava +500;
 * «0» voltava sozinho ao valor anterior; «150%» de sinal voltava a 30% — os
 * três sem uma palavra.
 */
describe("o que não é um valor diz-se, e não se grava", () => {
  it("«-500» e «0» dizem porquê e não mexem no total", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    const valor = await screen.findByLabelText(/^Valor \(sem IVA\)/);
    await user.clear(valor);
    await user.type(valor, "-500");
    expect(await screen.findByText(/não pode ser negativo/)).toBeTruthy();
    await user.clear(valor);
    await user.type(valor, "0");
    expect(await screen.findByText(/Com 0 € não há proposta a enviar/)).toBeTruthy();
    await user.clear(valor);
    await user.type(valor, "4000");
    expect(screen.queryByText(/não pode ser negativo|Com 0 € não há/)).toBeNull();
  });

  it("um sinal fora de 1–99 fica escrito, com a razão, e o documento não muda", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    const sinal = await screen.findByLabelText("Percentagem do sinal");
    await user.clear(sinal);
    await user.type(sinal, "150");
    expect((sinal as HTMLInputElement).value).toBe("150");
    expect(document.getElementById("sinal-erro")?.textContent).toMatch(/entre 1% e 99%/);
    await user.tab();
    expect((sinal as HTMLInputElement).value).toBe("30");
  });
});

/**
 * UMA PROPOSTA PARA UM RESTAURANTE NÃO É UM CASAMENTO.
 *
 * O caso dela, a 13/10: um restaurante no Halloween. O pedido veio com «Outro»
 * (sem tipo) e o estúdio escrevia «Casamento» sozinho — e com isso o PDF
 * punha «Noivos» e arrumava os mood boards em Cerimónia e Cocktail.
 */
describe("o tipo de evento não é «Casamento» por omissão", () => {
  const halloween = {
    id: "q-halloween",
    name: "TESTE Restaurante Lua",
    email: "lua@example.pt",
    category: "particulares",
    eventType: null,
    eventName: "Halloween no restaurante",
    ceremonyType: "civil",
    status: "novo",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Quote;
  const abrir = () =>
    render(
      <ToastProvider>
        <ProposalStudio quote={halloween} />
      </ToastProvider>,
    );

  it("um pedido «Outro» abre com o nome que o cliente deu ao evento, e sem Cerimónia", async () => {
    abrir();
    const campo = (await screen.findByLabelText(/^Tipo de evento/)) as HTMLInputElement;
    expect(campo.value).toBe("Halloween no restaurante");
    expect(screen.queryByLabelText(/^Cerimónia/)).toBeNull();
    expect(screen.queryByText(/Este pedido não parece um casamento/)).toBeNull();
  });

  it("um rascunho que ficou com «Casamento» avisa, e um toque corrige-o", async () => {
    localStorage.setItem(
      `liquen-proposal-studio-${halloween.id}`,
      JSON.stringify({
        template: "decoracao",
        ref: "",
        clientNames: "TESTE Restaurante Lua",
        eventType: "Casamento",
        eventDate: "31 de outubro de 2026",
        serviceGroups: [],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
      }),
    );
    abrir();
    expect(await screen.findByText(/Este pedido não parece um casamento/)).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Mudar para «Halloween no restaurante»/ }));
    const campo = (await screen.findByLabelText(/^Tipo de evento/)) as HTMLInputElement;
    await waitFor(() => expect(campo.value).toBe("Halloween no restaurante"));
    expect(screen.queryByText(/Este pedido não parece um casamento/)).toBeNull();
  });

  it("um casamento continua a abrir como casamento, sem aviso", async () => {
    renderStudio();
    const campo = (await screen.findByLabelText(/^Tipo de evento/)) as HTMLInputElement;
    expect(campo.value).toBe("Casamento");
    expect(screen.queryByText(/Este pedido não parece um casamento/)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CINCO PASSOS (A2 de `docs/FAZER-PROPOSTA-MELHORIAS.md`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O critério de pronto do documento dela: «percorro os cinco passos, saio e
 * volto, e nada se perdeu; cada passo mostra o seu estado».
 */
describe("os cinco passos do estúdio", () => {
  const passoActivo = () =>
    screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-current") === "step")
      ?.textContent?.replace(/[✓•!]|,.*$/g, "")
      .trim();

  it("percorre os cinco com «Seguinte», volta ao primeiro, e nada se perdeu", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    const clientes = (await screen.findByLabelText(/^Clientes/)) as HTMLInputElement;
    await user.clear(clientes);
    await user.type(clientes, "Ana & Rui");

    for (const proximo of ["Serviços", "Inspiração", "Orçamento", "Rever e enviar"]) {
      await user.click(screen.getByRole("button", { name: new RegExp(`^Seguinte: ${proximo}`) }));
      expect(passoActivo()).toMatch(new RegExp(proximo));
    }

    await user.click(screen.getByRole("button", { name: /^1\s*Evento/ }));
    // O MESMO campo, e não um novo com o mesmo valor: o formulário não remontou.
    const deVolta = screen.getByLabelText(/^Clientes/) as HTMLInputElement;
    expect(deVolta).toBe(clientes);
    expect(deVolta.value).toBe("Ana & Rui");
  });

  it("o «← anterior» só existe a partir do segundo passo", async () => {
    seedDraft(1);
    renderStudio();
    await screen.findByLabelText(/^Clientes/);
    expect(screen.queryByRole("button", { name: /^← / })).toBeNull();
    irAoPasso("Serviços");
    expect(screen.getByRole("button", { name: /^← Evento/ })).toBeTruthy();
  });

  it("uma falta que trava põe o seu passo e o «Rever e enviar» em erro", async () => {
    seedDraft(1);
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>),
        clientNames: "",
      }),
    );
    renderStudio();
    await screen.findByLabelText(/^Clientes/);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^1\s*Evento/ })).toHaveAttribute(
        "data-estado",
        "erro",
      ),
    );
    expect(screen.getByRole("button", { name: /^5\s*Rever e enviar/ })).toHaveAttribute(
      "data-estado",
      "erro",
    );
    // E di-lo a quem ouve, não só com o «!».
    expect(screen.getByRole("button", { name: /^1\s*Evento/ }).textContent).toMatch(/com erros/);
  });

  it("o sinal do «Rever e enviar» bate com o botão de descarregar", async () => {
    seedDraft(1);
    renderStudio("Rever e enviar");
    const descarregar = await screen.findByRole("button", { name: /^Descarregar (PDF|rascunho)$/ });
    const estado = screen
      .getByRole("button", { name: /^5\s*Rever e enviar/ })
      .getAttribute("data-estado");
    // A mesma lista decide as duas coisas: rascunho ⇔ erro.
    expect(estado === "erro").toBe(/rascunho/.test(descarregar.textContent ?? ""));
  });

  it("na Inspiração o índice da esquerda sai, e volta no passo seguinte", async () => {
    seedDraft(1);
    renderStudio();
    expect(await screen.findByRole("navigation", { name: "Secções da proposta" })).toBeTruthy();
    irAoPasso("Inspiração");
    expect(screen.queryByRole("navigation", { name: "Secções da proposta" })).toBeNull();
    irAoPasso("Orçamento");
    expect(screen.getByRole("navigation", { name: "Secções da proposta" })).toBeTruthy();
  });

  it("carregar no índice numa secção de outro passo leva a esse passo", async () => {
    seedDraft(1);
    renderStudio();
    const indice = await screen.findByRole("navigation", { name: "Secções da proposta" });
    const user = userEvent.setup();
    await user.click(within(indice).getAllByRole("button", { name: /^Total/ })[0]);
    await waitFor(() => expect(passoActivo()).toMatch(/Orçamento/));
  });
});

/**
 * «POR ONDE SEGUE» LOGO EM CIMA (14/10). Palavras dela: «coloca isto em cima
 * para se ver logo no início e coloca o logo do email e do WhatsApp».
 */
describe("por onde segue, no topo do passo do envio", () => {
  it("vem antes do resumo, e cada canal leva o seu logótipo", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    const grupo = await screen.findByRole("radiogroup", {
      name: "Por onde é que a proposta segue",
    });
    const resumo = await screen.findByText("Resumo da proposta");
    // O grupo aparece ANTES do resumo na ordem do documento.
    expect(grupo.compareDocumentPosition(resumo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const opcao = (nome: string) => within(grupo).getByRole("radio", { name: nome });
    expect(opcao("Email").querySelectorAll("svg")).toHaveLength(1);
    expect(opcao("WhatsApp").querySelectorAll("svg")).toHaveLength(1);
    expect(opcao("Os dois").querySelectorAll("svg")).toHaveLength(2);
    // «coloca mesmo os logos do email coloridos e do whatsapp» — nas cores deles.
    expect(opcao("Email").querySelector("svg.bo-marca-email")).not.toBeNull();
    expect(opcao("WhatsApp").querySelector("svg.bo-marca-whatsapp")).not.toBeNull();
  });

  /** 14/10: também na barra de baixo, debaixo de «Gerar e enviar ao cliente»
   *  — o MESMO estado: mudar num muda o outro. */
  it("também na barra de baixo, e os dois andam juntos", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    const cima = await screen.findByRole("radiogroup", { name: "Por onde é que a proposta segue" });
    const baixo = await screen.findByRole("radiogroup", { name: "Por onde segue (em baixo)" });
    expect(
      within(baixo).getByRole("radio", { name: "WhatsApp" }).querySelector("svg.bo-marca-whatsapp"),
    ).not.toBeNull();

    await user.click(within(baixo).getByRole("radio", { name: "WhatsApp" }));
    expect(within(cima).getByRole("radio", { name: "WhatsApp" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(within(cima).getByRole("radio", { name: "Os dois" }));
    expect(within(baixo).getByRole("radio", { name: "Os dois" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

/**
 * A BARRA DO ENVIO NO TELEMÓVEL (14/10): «esta aba de enviar ao cliente no
 * telemóvel tapa tudo… transforma isto em algo inteligente que se adapte».
 * Numa caixa estreita fica uma linha — voltar, o estado numa pastilha, enviar —
 * e o resto abre-se numa folha.
 */
describe("a barra do envio, numa caixa estreita", () => {
  afterEach(() => vi.restoreAllMocks());
  const estreita = () =>
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 360,
      bottom: 600,
      width: 360,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect);

  it("leva só o voltar, a pastilha e o enviar; o resto abre-se na folha", async () => {
    estreita();
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    // Só falta ver o PDF: o botão guia esse passo (14/10), curto no telemóvel.
    const enviar = await screen.findByRole("button", { name: "Ver o PDF final" });
    expect(enviar).toHaveTextContent(/^Ver o PDF/);
    expect(screen.getByRole("button", { name: "Voltar a Orçamento" })).toBeInTheDocument();
    // Fora da folha não há língua, nem descarregar, nem lista.
    expect(screen.queryByRole("radiogroup", { name: "Idioma da proposta" })).toBeNull();
    expect(screen.queryByText(/Não dá para enviar/)).toBeNull();

    const pastilha = screen.getByRole("button", { name: /^Antes de enviar: Ver o PDF/ });
    await user.click(pastilha);
    const folha = await screen.findByRole("dialog", { name: "Antes de enviar" });
    expect(
      within(folha).getByRole("radiogroup", { name: "Idioma da proposta" }),
    ).toBeInTheDocument();
    expect(within(folha).getByRole("button", { name: /Descarregar PDF/ })).toBeInTheDocument();
    expect(within(folha).getByText(/Falta ver o PDF final/)).toBeInTheDocument();
  });

  it("com o teclado aberto, a barra sai da frente", async () => {
    estreita();
    const vv = Object.assign(new EventTarget(), { height: 300 });
    vi.stubGlobal("visualViewport", vv);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    try {
      seedDraft(2);
      renderStudio();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
      const enviar = await screen.findByRole("button", {
        name: "Ver o PDF final",
        hidden: true,
      });
      await waitFor(() => expect(enviar.closest("[inert]")).not.toBeNull());
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * «VER O PDF PRIMEIRO» (14/10). Palavras dela: «quero que haja algo que antes
 * de enviar para os clientes obrigue os colaboradores da Líquen a verificar se
 * está tudo bem na proposta a ser enviada».
 */
describe("ver o PDF final antes de enviar", () => {
  it("o envio fica fechado até descarregar o PDF final e confirmar — e o envio leva a chave", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    // Só falta ver o PDF: o botão principal guia esse passo em vez de estar
    // apagado (14/10), e a pastilha diz o que falta.
    expect(await screen.findByRole("button", { name: "Ver o PDF final" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Antes de enviar: Ver o PDF/ })).toBeInTheDocument();

    // O caminho pela caixa do corpo do passo continua a valer.
    await user.click(screen.getByRole("button", { name: "Descarregar o PDF final" }));
    const caixa = await screen.findByRole("checkbox", { name: "Vi a proposta e está tudo certo" });
    await user.click(caixa);
    const enviar = await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ });
    await waitFor(() => expect(enviar).toBeEnabled());

    // Fica no histórico do pedido quem verificou.
    const historico = corpos(`/api/orcamento/${quote.id}`, "PATCH").join("\n");
    expect(historico).toContain("proposal_reviewed");

    await user.click(enviar);
    await confirmarEnvio(user);
    await waitFor(() =>
      expect(
        corpos("proposta-doc", "POST").some((c) => c.includes('"pdfVisto":"chave-de-teste"')),
      ).toBe(true),
    );
  });

  it("o botão guia: «Ver o PDF final», depois «Está certo — enviar», e o envio leva a chave", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));

    await user.click(await screen.findByRole("button", { name: "Ver o PDF final" }));
    const confirmar = await screen.findByRole("button", { name: /Está certo — enviar/ });
    await user.click(confirmar);

    // Ficou registado que viu e confirmou, e abriu a pergunta de sempre.
    await waitFor(() =>
      expect(corpos(`/api/orcamento/${quote.id}`, "PATCH").join("\n")).toContain(
        "proposal_reviewed",
      ),
    );
    await confirmarEnvio(user);
    await waitFor(() =>
      expect(
        corpos("proposta-doc", "POST").some((c) => c.includes('"pdfVisto":"chave-de-teste"')),
      ).toBe(true),
    );
  });

  it("no ecrã largo, a falta do PDF salta para a caixa «Antes de enviar»", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    const painel = await abrirPastilhaDoEnvio();
    expect(within(painel).getByText(/Vai para/)).toBeInTheDocument();
    // A caixa vermelha já não está na barra; está no painel.
    expect(within(painel).getByText(/Não dá para enviar/)).toBeInTheDocument();
    const caixa = document.querySelector('[data-campo="pdf-visto"]');
    expect(caixa).not.toBeNull();
    await user.click(within(painel).getByRole("button", { name: /Falta ver o PDF final/ }));
    // O painel fecha-se ao saltar.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Antes de enviar" })).toBeNull(),
    );
  });

  it("mudar o documento depois de o ver volta a pedir o PDF", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    const enviar = await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ });
    await waitFor(() => expect(enviar).toBeEnabled());

    // Muda a língua do PDF: já não é o documento que se viu.
    await user.click(
      within(screen.getByRole("radiogroup", { name: "Idioma da proposta" })).getByRole("radio", {
        name: /Inglês/,
      }),
    );
    // Já não se pode enviar: a versão inglesa não foi vista (e, neste rascunho,
    // tem campos por traduzir — por isso o botão fica apagado em vez de guiar).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Gerar e enviar ao cliente/ })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: /^Antes de enviar:/ })).toHaveTextContent(/Falta/);
    // A confirmação da versão portuguesa não vale para a inglesa.
    expect(screen.queryByRole("checkbox", { name: "Vi a proposta e está tudo certo" })).toBeNull();
  });
});

/**
 * DESCARGAS MAIS RÁPIDAS (14/10): o PDF final prepara-se em segundo plano no
 * passo «Rever e enviar», e o botão entrega-o sem pedir outro; depois de
 * enviada, «Descarregar PDF» entrega o que seguiu sem o desenhar outra vez.
 */
describe("o PDF final preparado antes de ela carregar", () => {
  const descargas = () =>
    corpos("proposta-doc", "POST").filter((c) => c.includes('"mode":"preview"'));

  it("prepara-se sozinho no último passo, e o botão não pede outro", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await waitFor(() => expect(descargas()).toHaveLength(1), { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: "Descarregar o PDF final" }));
    await screen.findByRole("checkbox", { name: "Vi a proposta e está tudo certo" });
    expect(descargas()).toHaveLength(1);
  });

  it("depois de enviada, «Descarregar PDF» entrega o que seguiu sem o desenhar outra vez", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await verEConfirmar();
    const enviar = await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ });
    await waitFor(() => expect(enviar).toBeEnabled());
    await user.click(enviar);
    await confirmarEnvio(user);
    const descarregar = await screen.findByRole("button", { name: "Descarregar PDF" });
    await user.click(descarregar);
    await screen.findByText(/o mesmo que seguiu para o cliente/);
    expect(descargas()).toHaveLength(0);
    // D2: a espera acaba à vista — «PDF pronto» com o visto — e o botão volta.
    expect(await screen.findByText("PDF pronto")).toBeInTheDocument();
    expect(document.querySelector("[data-em-curso=visto]")).not.toBeNull();
    expect(
      await screen.findByRole("button", { name: "Descarregar PDF" }, { timeout: 3000 }),
    ).toBeEnabled();
  });

  it("o PDF que se descarrega no último passo acaba com «PDF pronto» na barra", async () => {
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^5\s*Rever e enviar/ }));
    await user.click(screen.getByRole("button", { name: "Descarregar o PDF final" }));
    expect(await screen.findByText("PDF pronto")).toBeInTheDocument();
  });
});
