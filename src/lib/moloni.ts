import "server-only";
import {
  ARTIGOS,
  type ArtigoId,
  type FaseDaFatura,
  type ParcelaDoArtigo,
} from "@/lib/orcamento/artigos-de-faturacao";
import { round2 } from "@/lib/money";
import { hojeNoEstudio } from "@/lib/fuso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LIGAÇÃO AO MOLONI — CRIAR O RASCUNHO DA FATURA, NUNCA FECHÁ-LA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (5/11): «quero mesmo também ligar ao Moloni». O que esta ligação faz é
 * UMA coisa: pôr no Moloni um RASCUNHO (estado 0) da fatura do sinal ou do
 * saldo de um cliente, com uma linha por artigo. Quem a fecha (e lhe dá número,
 * que é o que a torna um documento fiscal) é ela, no Moloni. Nada é enviado ao
 * cliente daqui.
 *
 * Tudo o que se usa está na documentação oficial (https://www.moloni.pt/dev/):
 *   · `GET  /v1/grant/?grant_type=password&client_id&client_secret&username&password`
 *   · `POST /v1/products/getBySearch/`   (company_id, search)
 *   · `POST /v1/customers/getBySearch/`  (company_id, search)
 *   · `POST /v1/documentSets/getAll/`    (company_id)
 *   · `POST /v1/companies/getAll/`
 *   · `POST /v1/invoices/insert/`        (status 0 = rascunho)
 * Os pedidos POST vão em formulário (o formato por omissão da API), com o
 * `access_token` no endereço.
 *
 * ── O CUSTO (regra 7) ────────────────────────────────────────────────────
 * Corre só quando alguém carrega no botão: nenhuma tarefa agendada, nenhum
 * polling. Cada rascunho são ~9 pedidos ao Moloni, quase tudo tempo à espera da
 * rede (não é processador). O token não se guarda: pede-se um por gesto, porque
 * guardá-lo obrigava a um sítio no armazenamento para poupar um pedido raro.
 *
 * ── AS CHAVES ────────────────────────────────────────────────────────────
 * Vivem nas variáveis de ambiente da Vercel, postas por ela — nunca no código,
 * nunca no registo, nunca na resposta ao browser. Ver `docs/MOLONI.md`.
 */

const BASE = "https://api.moloni.pt/v1";

export interface ConfigMoloni {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  companyId: number;
  /** A série das faturas. Sem ela, usa-se a série «por omissão» do Moloni. */
  documentSetId?: number;
}

/** O nome de cada variável, para o ecrã dizer qual falta. */
export const VARIAVEIS_DO_MOLONI = [
  "MOLONI_CLIENT_ID",
  "MOLONI_CLIENT_SECRET",
  "MOLONI_USERNAME",
  "MOLONI_PASSWORD",
  "MOLONI_COMPANY_ID",
] as const;

export function variaveisEmFalta(env: Record<string, string | undefined> = process.env): string[] {
  return VARIAVEIS_DO_MOLONI.filter((k) => !env[k]?.trim());
}

export function configDoMoloni(
  env: Record<string, string | undefined> = process.env,
): ConfigMoloni | null {
  if (variaveisEmFalta(env).length > 0) return null;
  const companyId = Number(env.MOLONI_COMPANY_ID);
  if (!Number.isInteger(companyId) || companyId <= 0) return null;
  const serie = Number(env.MOLONI_DOCUMENT_SET_ID);
  return {
    clientId: env.MOLONI_CLIENT_ID!.trim(),
    clientSecret: env.MOLONI_CLIENT_SECRET!.trim(),
    username: env.MOLONI_USERNAME!.trim(),
    password: env.MOLONI_PASSWORD!,
    companyId,
    documentSetId: Number.isInteger(serie) && serie > 0 ? serie : undefined,
  };
}

export type CodigoDoErro =
  | "autenticacao"
  | "artigo"
  | "iva"
  | "cliente"
  | "serie"
  | "moloni"
  | "rede";

/** Um erro que se mostra a ela tal como está — em português, sem segredos. */
export class ErroDoMoloni extends Error {
  constructor(
    message: string,
    public readonly codigo: CodigoDoErro,
  ) {
    super(message);
    this.name = "ErroDoMoloni";
  }
}

type Buscar = typeof fetch;

/**
 * Os parâmetros em formulário, com os arrays e objectos no formato que o PHP lê
 * (`products[0][taxes][0][tax_id]=1`) — é o formato por omissão da API.
 */
export function corpoDoFormulario(params: Record<string, unknown>): URLSearchParams {
  const out = new URLSearchParams();
  const por = (chave: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => por(`${chave}[${i}]`, x));
    else if (typeof v === "object")
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) por(`${chave}[${k}]`, x);
    else out.append(chave, String(v));
  };
  for (const [k, v] of Object.entries(params)) por(k, v);
  return out;
}

async function lerJson(res: Response): Promise<unknown> {
  const texto = await res.text();
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** Um token novo (válido uma hora). */
export async function pedirToken(cfg: ConfigMoloni, buscar: Buscar = fetch): Promise<string> {
  const q = new URLSearchParams({
    grant_type: "password",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    username: cfg.username,
    password: cfg.password,
  });
  let res: Response;
  try {
    res = await buscar(`${BASE}/grant/?${q}`, { method: "GET", cache: "no-store" });
  } catch {
    throw new ErroDoMoloni(
      "Não foi possível falar com o Moloni agora. Tenta daqui a pouco.",
      "rede",
    );
  }
  const j = (await lerJson(res)) as { access_token?: string } | null;
  if (!res.ok || !j?.access_token) {
    throw new ErroDoMoloni(
      "O Moloni recusou as credenciais. Confirma o utilizador, a palavra-passe e as chaves de developer na Vercel.",
      "autenticacao",
    );
  }
  return j.access_token;
}

async function chamar<T>(
  buscar: Buscar,
  token: string,
  metodo: string,
  params: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await buscar(`${BASE}/${metodo}/?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpoDoFormulario(params).toString(),
      cache: "no-store",
    });
  } catch {
    throw new ErroDoMoloni(
      "Não foi possível falar com o Moloni agora. Tenta daqui a pouco.",
      "rede",
    );
  }
  const j = await lerJson(res);
  if (!res.ok || j === null) {
    throw new ErroDoMoloni(`O Moloni respondeu com um erro (${metodo}, ${res.status}).`, "moloni");
  }
  return j as T;
}

/**
 * Uma resposta que devia ser uma LISTA. O Moloni pode responder 200 com um
 * objecto de erros em vez da lista — e sem esta guarda o `.name` de um erro
 * rebentava mais à frente com uma mensagem que ninguém percebe.
 */
function lista<T extends object>(resposta: unknown, metodo: string, campo: keyof T): T[] {
  if (!Array.isArray(resposta)) {
    throw new ErroDoMoloni(`O Moloni respondeu de forma inesperada (${metodo}).`, "moloni");
  }
  return resposta.filter(
    (x): x is T => !!x && typeof x === "object" && typeof (x as T)[campo] !== "undefined",
  );
}

/** Para comparar nomes: sem acentos, sem maiúsculas, espaços simples. */
export function nomeNormalizado(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

interface TaxaMoloni {
  tax_id: number;
  value: number;
  order?: number;
  cumulative?: number;
  tax?: { type?: number; value?: number; name?: string };
}

export interface ProdutoMoloni {
  product_id: number;
  name: string;
  reference?: string;
  taxes?: TaxaMoloni[];
}

/** O IVA (em %) de um artigo do Moloni: a soma das taxas que ele tem. */
export function ivaDoProduto(p: ProdutoMoloni): number {
  return round2((p.taxes ?? []).reduce((s, t) => s + (Number(t.value) || 0), 0));
}

/**
 * Procura cada artigo pelo CÓDIGO do Moloni (EXE.11, EXE.2…), que não tem
 * acentos nem muda de grafia — e só aceita o produto cuja referência é
 * exactamente essa. O nome que vai para o rascunho é o do Moloni.
 */
export async function artigosNoMoloni(
  cfg: ConfigMoloni,
  token: string,
  buscar: Buscar = fetch,
  quais: readonly ArtigoId[] = ARTIGOS.map((a) => a.id),
): Promise<{
  encontrados: Map<ArtigoId, ProdutoMoloni>;
  /** O que o Moloni devolveu para cada código procurado — para o ecrã mostrar. */
  vistos: Map<ArtigoId, string[]>;
}> {
  const encontrados = new Map<ArtigoId, ProdutoMoloni>();
  const vistos = new Map<ArtigoId, string[]>();
  await Promise.all(
    quais.map(async (id) => {
      const ref = ARTIGOS.find((a) => a.id === id)!.ref;
      const resposta = await chamar<unknown>(buscar, token, "products/getBySearch", {
        company_id: cfg.companyId,
        search: ref,
      });
      const produtos = lista<ProdutoMoloni>(resposta, "products/getBySearch", "product_id").filter(
        (p) => typeof p.name === "string",
      );
      vistos.set(
        id,
        produtos.map((p) => (p.reference ? `${p.name} (${p.reference})` : p.name)),
      );
      const exactos = produtos.filter(
        (p) => (p.reference ?? "").trim().toLowerCase() === ref.toLowerCase(),
      );
      if (exactos.length === 1) encontrados.set(id, exactos[0]);
    }),
  );
  return { encontrados, vistos };
}

interface ClienteMoloni {
  customer_id: number;
  name: string;
  vat?: string;
}

/**
 * O cliente no Moloni. Pelo NIF quando o pedido o tem; senão pelo nome exacto,
 * e só se houver UM. Nunca se cria um cliente daqui: o Moloni pede morada,
 * país, prazo e meio de pagamento, e inventar qualquer um deles numa fatura é
 * pior do que pedir que o criem lá.
 */
export async function clienteNoMoloni(
  cfg: ConfigMoloni,
  token: string,
  quem: { nif?: string; nome: string },
  buscar: Buscar = fetch,
): Promise<ClienteMoloni> {
  const nif = (quem.nif ?? "").replace(/\D/g, "");
  const procura = nif.length === 9 ? nif : quem.nome.trim();
  if (!procura)
    throw new ErroDoMoloni("O pedido não tem nome nem NIF para procurar no Moloni.", "cliente");
  const resposta = await chamar<unknown>(buscar, token, "customers/getBySearch", {
    company_id: cfg.companyId,
    search: procura,
  });
  const clientes = lista<ClienteMoloni>(resposta, "customers/getBySearch", "customer_id").filter(
    (c) => typeof c.name === "string",
  );
  if (nif.length === 9) {
    const c = clientes.find((x) => (x.vat ?? "").replace(/\D/g, "") === nif);
    if (c) return c;
    throw new ErroDoMoloni(
      `Não há no Moloni nenhum cliente com o NIF ${nif}. Cria-o lá (com a morada) e volta a carregar.`,
      "cliente",
    );
  }
  const iguais = clientes.filter((x) => nomeNormalizado(x.name) === nomeNormalizado(procura));
  if (iguais.length === 1) return iguais[0];
  throw new ErroDoMoloni(
    iguais.length > 1
      ? `Há ${iguais.length} clientes no Moloni chamados «${procura}». Escreve o NIF no pedido para se saber qual é.`
      : `Não há no Moloni nenhum cliente chamado «${procura}». Cria-o lá, ou escreve o NIF no pedido.`,
    "cliente",
  );
}

/** A série das faturas: a das variáveis, ou a que o Moloni tem por omissão. */
export async function serieDasFaturas(
  cfg: ConfigMoloni,
  token: string,
  buscar: Buscar = fetch,
): Promise<number> {
  if (cfg.documentSetId) return cfg.documentSetId;
  const resposta = await chamar<unknown>(buscar, token, "documentSets/getAll", {
    company_id: cfg.companyId,
  });
  const series = lista<{ document_set_id: number; active_by_default?: number }>(
    resposta,
    "documentSets/getAll",
    "document_set_id",
  );
  const porOmissao =
    series.find((s) => Number(s.active_by_default) === 1) ??
    (series.length === 1 ? series[0] : null);
  if (!porOmissao) {
    throw new ErroDoMoloni(
      "O Moloni tem várias séries e nenhuma por omissão. Escolhe uma no Moloni, ou põe MOLONI_DOCUMENT_SET_ID na Vercel.",
      "serie",
    );
  }
  return porOmissao.document_set_id;
}

export interface PedidoDeRascunho {
  fase: FaseDaFatura;
  /** A percentagem do sinal (30). */
  pct: number;
  /** A taxa de IVA da proposta (0,23). */
  vatRate: number;
  partes: ParcelaDoArtigo[];
  cliente: { nif?: string; nome: string };
  /** O que aparece em «a nossa referência»: o n.º de contrato, ou o pedido. */
  referencia: string;
  /** Uma linha a dizer de que evento é, para o resumo de cada linha. */
  evento: string;
}

/** Cria o rascunho e devolve o id do documento no Moloni. */
export async function criarRascunhoDeFatura(
  cfg: ConfigMoloni,
  pedido: PedidoDeRascunho,
  buscar: Buscar = fetch,
  agora = new Date(),
): Promise<{ documentId: number; valorSemIva: number }> {
  if (pedido.partes.length === 0) {
    throw new ErroDoMoloni("Não há nada a faturar nesta fase.", "moloni");
  }
  const token = await pedirToken(cfg, buscar);
  const [{ encontrados, vistos }, cliente, serie] = await Promise.all([
    artigosNoMoloni(
      cfg,
      token,
      buscar,
      pedido.partes.map((p) => p.artigo),
    ),
    clienteNoMoloni(cfg, token, pedido.cliente, buscar),
    serieDasFaturas(cfg, token, buscar),
  ]);

  const emFalta = pedido.partes.filter((p) => !encontrados.has(p.artigo));
  if (emFalta.length > 0) {
    throw new ErroDoMoloni(
      emFalta
        .map((p) => {
          const vi = vistos.get(p.artigo) ?? [];
          const ref = ARTIGOS.find((a) => a.id === p.artigo)?.ref ?? "";
          return vi.length
            ? `O artigo «${p.nome}» (código ${ref}) não está no Moloni com esse código (encontrei: ${vi.slice(0, 4).join(", ")}).`
            : `O artigo «${p.nome}» (código ${ref}) não está no Moloni.`;
        })
        .join(" "),
      "artigo",
    );
  }

  // O IVA do artigo no Moloni tem de ser o da proposta: uma fatura a 6% de uma
  // proposta a 23% cobrava ao cliente outra coisa que não a que ele aceitou.
  const ivaDaProposta = round2(pedido.vatRate * 100);
  const ivaErrado = pedido.partes.filter(
    (p) => ivaDoProduto(encontrados.get(p.artigo)!) !== ivaDaProposta,
  );
  if (ivaErrado.length > 0) {
    throw new ErroDoMoloni(
      ivaErrado
        .map(
          (p) =>
            `O artigo «${p.nome}» tem IVA de ${ivaDoProduto(encontrados.get(p.artigo)!)}% no Moloni, e a proposta é a ${ivaDaProposta}%.`,
        )
        .join(" "),
      "iva",
    );
  }

  const titulo = pedido.fase === "sinal" ? `Sinal ${pedido.pct}%` : `Saldo ${100 - pedido.pct}%`;
  const hoje = hojeNoEstudio(agora);
  const resposta = await chamar<{ valid?: number; document_id?: number }>(
    buscar,
    token,
    "invoices/insert",
    {
      company_id: cfg.companyId,
      date: hoje,
      expiration_date: hoje,
      document_set_id: serie,
      customer_id: cliente.customer_id,
      our_reference: pedido.referencia.slice(0, 60),
      // 0 = rascunho. É ela que o fecha no Moloni — nunca este código.
      status: 0,
      products: pedido.partes.map((p, i) => {
        const produto = encontrados.get(p.artigo)!;
        return {
          product_id: produto.product_id,
          name: produto.name,
          summary: `${titulo} · ${pedido.evento}`.slice(0, 250),
          qty: 1,
          price: p.valor,
          order: i,
          taxes: (produto.taxes ?? []).map((t, j) => ({
            tax_id: t.tax_id,
            value: t.value,
            order: t.order ?? j,
            cumulative: t.cumulative ?? 0,
          })),
        };
      }),
    },
  );
  if (Number(resposta?.valid) !== 1 || !resposta?.document_id) {
    throw new ErroDoMoloni(
      "O Moloni não aceitou o rascunho. Confirma no Moloni o cliente e os artigos, e tenta outra vez.",
      "moloni",
    );
  }
  return {
    documentId: resposta.document_id,
    valorSemIva: round2(pedido.partes.reduce((s, p) => s + p.valor, 0)),
  };
}

/** Para o botão «Verificar ligação»: a empresa, a série e os cinco artigos. */
export async function estadoDaLigacao(
  cfg: ConfigMoloni,
  buscar: Buscar = fetch,
): Promise<{
  empresa: string | null;
  artigos: {
    artigo: ArtigoId;
    nome: string;
    encontrado: boolean;
    iva: number | null;
    vistos: string[];
  }[];
}> {
  const token = await pedirToken(cfg, buscar);
  const [empresas, { encontrados, vistos }] = await Promise.all([
    chamar<{ company_id: number; name: string }[]>(buscar, token, "companies/getAll", {}),
    artigosNoMoloni(cfg, token, buscar),
  ]);
  const empresa = Array.isArray(empresas)
    ? (empresas.find((e) => Number(e.company_id) === cfg.companyId)?.name ?? null)
    : null;
  return {
    empresa,
    artigos: ARTIGOS.map((a) => {
      const p = encontrados.get(a.id);
      return {
        artigo: a.id,
        nome: a.nome,
        encontrado: !!p,
        iva: p ? ivaDoProduto(p) : null,
        vistos: vistos.get(a.id) ?? [],
      };
    }),
  };
}
