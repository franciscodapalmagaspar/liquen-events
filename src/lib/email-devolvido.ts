import "server-only";
import { ImapFlow } from "imapflow";
import { log } from "./logger";
import type { Quote } from "./orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL VOLTOU PARA TRÁS? — LIDO NA CAIXA DA LÍQUEN
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (9/11): a proposta da Adecco foi para «addecco.com» e voltou com
 * «Endereço não encontrado» — e ela só soube porque foi ver o Gmail. «O sistema
 * tem que perceber logo se o e-mail existe ou não.» Disse que sim a ler a
 * caixa para isto.
 *
 * Nenhum servidor diz ANTES se uma caixa existe. Depois de enviar, o servidor
 * do outro lado responde, e o Gmail põe a resposta na caixa da Líquen: uma
 * mensagem do «Mail Delivery Subsystem» com o endereço que falhou. É essa que
 * se procura aqui.
 *
 * ── QUANDO CORRE (regra 7 — o custo) ─────────────────────────────────────
 * Só quando ela abre um pedido com um envio nos últimos `JANELA_DIAS` dias, e
 * no máximo uma vez a cada `GUARDAR_MS` por pedido (memória da instância). Sem
 * tarefa agendada e sem polling. Cada verificação é uma ligação IMAP com uma
 * pesquisa — cerca de um segundo de espera e uma fracção de processador.
 *
 * ── COM QUE CHAVE ────────────────────────────────────────────────────────
 * As do SMTP que já envia as propostas (`SMTP_USER` e `SMTP_PASS`, uma
 * palavra-passe de app do Gmail serve aos dois). O servidor IMAP é o
 * `IMAP_HOST`, se existir; senão, o do Gmail quando o SMTP é o do Gmail.
 * Sem nada disto, a resposta é «não verificado» — nunca um falso «chegou».
 */

export const JANELA_DIAS = 7;
const GUARDAR_MS = 10 * 60 * 1000;
const TEMPO_MAXIMO_MS = 8000;

export type EstadoDaEntrega =
  | { estado: "devolvido"; endereco: string; em: string }
  | { estado: "sem-devolucao"; endereco: string; desde: string }
  | { estado: "sem-envio-recente" }
  | { estado: "nao-verificado"; porque: string };

/** Um envio: quando seguiu e para que endereço. */
export interface Envio {
  em: string;
  para: string;
}

/**
 * O envio mais recente ao cliente nos últimos `JANELA_DIAS` dias. Conta o que
 * ficou guardado do envio da proposta (`envios-de-proposta.ts`, com o endereço
 * para onde foi DE FACTO), a proposta enviada do histórico, e as mensagens que
 * SAÍRAM de facto (`emailed: true`), com o endereço para onde foram.
 *
 * ── PORQUE É QUE O `message_sent` DO HISTÓRICO JÁ NÃO CONTA ───────────────
 * Escrevem-no coisas que não são emails ao cliente: o mapa de mesas enviado à
 * quinta, o lembrete de pagamento por WhatsApp, e a mensagem que não saiu por
 * falta de email. Contado como «email para o cliente», um mapa enviado à
 * quinta no dia 2 escondia a devolução da proposta do dia 1 — a pesquisa no
 * Gmail começa no envio mais recente (achado n.º 6 da auditoria 6).
 */
export function ultimoEnvio(
  quote: Pick<Quote, "activityLog" | "email" | "messages">,
  envios: readonly { enviadoEm: string; para: string }[] = [],
  agora = Date.now(),
): Envio | null {
  const todos: Envio[] = envios.map((e) => ({ em: e.enviadoEm, para: e.para }));
  for (const e of quote.activityLog ?? []) {
    if (e.kind === "proposal_sent") todos.push({ em: e.at, para: quote.email ?? "" });
  }
  for (const m of quote.messages ?? []) {
    if (m.emailed === true && m.para) todos.push({ em: m.at, para: m.para });
    // As mensagens anteriores ao campo `emailed` contam como saídas, para o
    // email do pedido — a mesma regra de `mensagemSaiu` (revisão de 13/11).
    else if (m.emailed === undefined) todos.push({ em: m.at, para: quote.email ?? "" });
  }
  let ultimo: Envio | null = null;
  for (const e of todos) {
    if (!e.para.trim() || Number.isNaN(Date.parse(e.em))) continue;
    if (!ultimo || Date.parse(e.em) > Date.parse(ultimo.em)) ultimo = e;
  }
  if (!ultimo) return null;
  return agora - Date.parse(ultimo.em) <= JANELA_DIAS * 86_400_000 ? ultimo : null;
}

/** A pesquisa do Gmail: avisos de entrega falhada que falam deste endereço. */
export function pesquisaDoGmail(endereco: string, desde: string): string {
  const depois = Math.floor(Date.parse(desde) / 1000) - 120;
  const limpo = endereco.replace(/["\\]/g, "");
  return `from:(mailer-daemon OR postmaster) "${limpo}" after:${depois}`;
}

function servidorImap(): { host: string; port: number } | null {
  if (process.env.IMAP_HOST) {
    return { host: process.env.IMAP_HOST, port: Number(process.env.IMAP_PORT ?? 993) };
  }
  const smtp = (process.env.SMTP_HOST ?? "").toLowerCase();
  if (smtp === "smtp.gmail.com" || smtp === "smtp.googlemail.com") {
    return { host: "imap.gmail.com", port: 993 };
  }
  return null;
}

const guardados = new Map<string, { ate: number; r: EstadoDaEntrega }>();

/** Para os testes. */
export function esquecerVerificacoes(): void {
  guardados.clear();
}

/** Uma ligação IMAP a sério; os testes trocam-na por uma falsa. */
export type Procurar = (pesquisa: string) => Promise<{ em: string }[]>;

async function procurarNoGmail(pesquisa: string): Promise<{ em: string }[]> {
  const servidor = servidorImap();
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!servidor || !user || !pass) throw new Error("sem-credenciais");
  const cliente = new ImapFlow({
    host: servidor.host,
    port: servidor.port,
    secure: true,
    auth: { user, pass },
    logger: false,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 7000,
  });
  await cliente.connect();
  try {
    // «Todo o correio», para apanhar o aviso mesmo que já tenha sido arquivado.
    const caixas = await cliente.list();
    const todos = caixas.find((c) => c.specialUse === "\\All")?.path ?? "INBOX";
    const trinco = await cliente.getMailboxLock(todos, { readOnly: true });
    try {
      const uids = await cliente.search({ gmraw: pesquisa }, { uid: true });
      if (!uids || uids.length === 0) return [];
      const achados: { em: string }[] = [];
      for await (const m of cliente.fetch(uids.slice(-5), { internalDate: true }, { uid: true })) {
        const d = m.internalDate;
        achados.push({
          em: (d instanceof Date ? d : new Date(String(d ?? Date.now()))).toISOString(),
        });
      }
      return achados;
    } finally {
      trinco.release();
    }
  } finally {
    await cliente.logout().catch(() => {});
  }
}

/**
 * O email deste pedido voltou para trás depois do último envio? Nunca lança:
 * na dúvida é «nao-verificado», com a razão.
 */
export async function estadoDaEntrega(
  quote: Pick<Quote, "id" | "email" | "activityLog">,
  envios: readonly { enviadoEm: string; para: string }[] = [],
  procurar: Procurar = procurarNoGmail,
  agora = Date.now(),
): Promise<EstadoDaEntrega> {
  const envio = ultimoEnvio(quote, envios, agora);
  if (!envio) return { estado: "sem-envio-recente" };
  const endereco = envio.para.trim();
  const desde = envio.em;

  const chave = `${quote.id}\0${endereco.toLowerCase()}\0${desde}`;
  const guardado = guardados.get(chave);
  if (guardado && guardado.ate > agora) return guardado.r;

  let r: EstadoDaEntrega;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const achados = await Promise.race([
      procurar(pesquisaDoGmail(endereco, desde)),
      new Promise<never>((_, rejeitar) => {
        timer = setTimeout(() => rejeitar(new Error("tempo")), TEMPO_MAXIMO_MS);
      }),
    ]);
    r =
      achados.length > 0
        ? { estado: "devolvido", endereco, em: achados[achados.length - 1].em }
        : { estado: "sem-devolucao", endereco, desde };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("email-devolvido: não deu para ler a caixa", { motivo: msg.slice(0, 120) });
    r = {
      estado: "nao-verificado",
      porque:
        msg === "sem-credenciais"
          ? "O site ainda não tem acesso à caixa de correio."
          : "Não deu para ler a caixa de correio agora.",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
  // Um «não verificado» não se guarda: a próxima abertura tenta outra vez.
  if (r.estado !== "nao-verificado") guardados.set(chave, { ate: agora + GUARDAR_MS, r });
  return r;
}
