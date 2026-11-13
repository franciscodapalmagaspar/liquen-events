import "server-only";
import { getSupabase } from "@/lib/supabase";
import { apagarPastaDoPedido } from "@/lib/proposal-storage";
import { getState, setState } from "@/lib/app-state";
import { lerTodasAsLinhas } from "./ler-todas-as-linhas";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS DE PEDIDOS QUE JÁ NÃO EXISTEM (10/11, decisão dela)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «eu não quero pagar nada» — o Supabase fica no plano gratuito (1 GB), e
 * a 10/11 ia em 929 MB. Medido nesse dia: ~95 MB de originais (mais as
 * derivadas) eram pastas `proposal-assets/<pedido>/` de pedidos apagados em
 * julho e agosto, ANTES de a Reciclagem existir. Hoje apagar um pedido já leva
 * as fotos (`apagar-pedido.ts`; a Reciclagem quando sai de vez). Isto limpa o
 * que ficou de antes, e fica de guarda.
 *
 * E ela, no mesmo dia: «é mesmo importante não estarmos a apagar coisas que
 * depois vamos ver e deviam estar lá e não estão». As fotografias NÃO têm
 * cópia de segurança dos bytes (ver `manifesto-de-fotografias.ts`): o que sai
 * daqui não volta. Por isso cada pasta passa por TODAS estas portas:
 *
 *   1. o nome tem a forma de um pedido (`LIQ-…`);
 *   2. não há pedido com esse id, nem entrada na Reciclagem que o reponha;
 *   3. nenhuma chave guardada o nomeia (ex.: `proposal-draft:<pedido>` — a
 *      10/11 havia rascunhos de 4 pedidos apagados, dois com fotos de lá);
 *   4. nenhuma proposta pertence a esse pedido;
 *   5. NENHUMA linha de nenhuma tabela com conteúdo menciona a pasta (uma
 *      proposta «criada a partir de» outra, um modelo, um contrato…);
 *   6. nenhum ficheiro lá dentro tem menos de {@link DIAS} dias;
 *   7. e a pasta tem de ter sido candidata numa noite anterior, há pelo menos
 *      {@link ESPERA_DIAS} dias, e continuar a sê-lo hoje. A lista do que está
 *      à espera fica em `app_state` ({@link CHAVE}), à vista: se alguma coisa
 *      mudar entretanto (o pedido reposto, uma proposta nova a apontar para
 *      lá), a pasta deixa de ser candidata e sai da lista.
 *
 * Se UMA das leituras falhar, não se apaga nada: «não sei» nunca vale o mesmo
 * que «não existe». No máximo {@link POR_NOITE} pastas por noite, cada uma
 * registada no log com o número de ficheiros. Nada disto lança.
 *
 * Custo: numa noite sem candidatas, uma listagem do balde e quatro leituras de
 * ids e chaves (KB). Com candidatas, lêem-se também os textos (~7 MB a 10/11)
 * — só nas noites em que há o que confirmar.
 */
export const DIAS = 30;
export const ESPERA_DIAS = 7;
export const POR_NOITE = 10;
export const CHAVE = "limpeza:pastas-de-pedidos-apagados";

const BUCKET = "proposal-assets";
const FORMA_DE_PEDIDO = /^LIQ-[A-Za-z0-9-]+$/;
const DIA_MS = 24 * 60 * 60_000;
/** O máximo que o Supabase devolve por leitura (`max-rows`): uma lista cheia pode estar cortada. */

/** As tabelas cujo conteúdo pode mencionar uma fotografia de um pedido. */
export const TABELAS_COM_CONTEUDO = [
  "proposals",
  "app_state",
  "proposal_settings",
  "quotes",
  "reciclagem",
  "proposal_themes",
  "contracts",
  "invoices",
  "calendar_events",
  "tasks",
  "message_links",
  "email_templates",
  "event_material",
  "event_material_items",
  "service_catalog",
] as const;

/** Pasta → quando foi vista candidata pela primeira vez (ISO). */
export type EmEspera = Record<string, string>;

type Resultado = {
  candidatas: number;
  emEspera: number;
  apagadas: number;
  acabou: boolean;
};

export async function limparPastasDePedidosApagados(
  agora: Date,
  prazoMs = 10_000,
): Promise<Resultado> {
  const nada: Resultado = { candidatas: 0, emEspera: 0, apagadas: 0, acabou: true };
  const falhou: Resultado = { ...nada, acabou: false };
  const sb = getSupabase();
  if (!sb) return nada;
  const fim = Date.now() + prazoMs;
  const limiteFicheiros = agora.getTime() - DIAS * DIA_MS;

  // ── Portas 1 e 2 ─────────────────────────────────────────────────────────
  const { data: raiz, error: erroRaiz } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
  if (erroRaiz || !raiz) return falhou;
  const pastas = raiz.filter((e) => !e.id && FORMA_DE_PEDIDO.test(e.name)).map((e) => e.name);

  // Às páginas: o Supabase devolve no máximo 1000 linhas e corta o resto SEM
  // AVISAR. Um pedido vivo que ficasse de fora pareceria órfão, e a pasta dele
  // seria apagada (auditoria e revisão de 13/11).
  const [pedidos, reciclagem, chaves, propostas] = await Promise.all([
    lerTodasAsLinhas(sb, "quotes", "id"),
    lerTodasAsLinhas(sb, "reciclagem", "origem_id"),
    lerTodasAsLinhas(sb, "app_state", "key"),
    lerTodasAsLinhas(sb, "proposals", "quote_id"),
  ]);
  if ([pedidos, reciclagem, chaves, propostas].some((r) => r.error || !r.data)) return falhou;

  const vivos = new Set<string>([
    ...(pedidos.data as { id: string }[]).map((p) => p.id),
    ...(reciclagem.data as { origem_id: string | null }[]).map((r) => r.origem_id ?? ""),
    ...(propostas.data as { quote_id: string | null }[]).map((p) => p.quote_id ?? ""),
  ]);
  const nomesDeChaves = (chaves.data as { key: string }[]).map((c) => c.key).join("\n");
  // Portas 3 e 4.
  let candidatas = pastas.filter((p) => !vivos.has(p) && !nomesDeChaves.includes(p));

  // ── Porta 5: só se há candidatas é que se lê o conteúdo ──────────────────
  if (candidatas.length > 0) {
    const leituras = await Promise.all(
      TABELAS_COM_CONTEUDO.map((t) => lerTodasAsLinhas(sb, t, "*")),
    );
    if (leituras.some((l) => l.error || !l.data)) return falhou;
    // A própria lista de espera (porta 7) vive em `app_state` e nomeia as
    // pastas: lida como «menção», nenhuma pasta sairia nunca.
    const texto = leituras
      .map((l, i) =>
        JSON.stringify(
          TABELAS_COM_CONTEUDO[i] === "app_state"
            ? (l.data as { key?: string }[]).filter((r) => r.key !== CHAVE)
            : l.data,
        ),
      )
      .join("\n");
    candidatas = candidatas.filter((p) => !texto.includes(p));
  }

  // ── Porta 6 ──────────────────────────────────────────────────────────────
  const prontas: { pasta: string; ficheiros: number }[] = [];
  for (const pasta of candidatas) {
    if (Date.now() > fim) return { ...falhou, candidatas: candidatas.length };
    const { data: ficheiros, error } = await sb.storage.from(BUCKET).list(pasta, { limit: 1000 });
    if (error || !ficheiros) continue;
    const recente = ficheiros.some(
      (f) =>
        !f.created_at ||
        Number.isNaN(Date.parse(f.created_at)) ||
        Date.parse(f.created_at) >= limiteFicheiros,
    );
    if (!recente) prontas.push({ pasta, ficheiros: ficheiros.length });
  }

  // ── Porta 7: a lista de espera ───────────────────────────────────────────
  const antes = (await getState<EmEspera>(CHAVE)) ?? {};
  const espera: EmEspera = {};
  for (const { pasta } of prontas) espera[pasta] = antes[pasta] ?? agora.toISOString();
  const gravou = await setState(CHAVE, espera);
  if (!gravou.gravado || !gravou.duradouro) {
    return { ...falhou, candidatas: prontas.length, emEspera: prontas.length };
  }

  let apagadas = 0;
  for (const { pasta, ficheiros } of prontas) {
    if (apagadas >= POR_NOITE || Date.now() > fim) break;
    const visto = espera[pasta];
    const desde = Date.parse(visto);
    if (Number.isNaN(desde) || agora.getTime() - desde < ESPERA_DIAS * DIA_MS) continue;
    if (await apagarPastaDoPedido(pasta)) {
      apagadas++;
      delete espera[pasta];
      log.info("limpeza: pasta de pedido apagado saiu do armazenamento", {
        pasta,
        ficheiros,
        candidataDesde: visto,
      });
    }
  }
  if (apagadas > 0) await setState(CHAVE, espera);
  return {
    candidatas: prontas.length,
    emEspera: Object.keys(espera).length,
    apagadas,
    acabou: true,
  };
}
