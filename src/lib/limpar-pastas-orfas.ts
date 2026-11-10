import "server-only";
import { getSupabase } from "@/lib/supabase";
import { apagarPastaDoPedido } from "@/lib/proposal-storage";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS DE PEDIDOS QUE JÁ NÃO EXISTEM (10/11, decisão dela)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «eu não quero pagar nada» — o Supabase fica no plano gratuito (1 GB), e
 * a 10/11 ia em 929 MB. Medido nesse dia: 136 MB eram fotografias de 11 pedidos
 * apagados em julho e agosto, ANTES de a Reciclagem existir. Nessa altura,
 * apagar um pedido deixava a pasta `proposal-assets/<pedido>/` (e as derivadas)
 * para trás. Hoje a Reciclagem já a apaga quando o pedido sai de vez
 * (`reciclagem.ts`, `largar`) — isto limpa o que ficou de antes, e fica de
 * guarda para o caso de algum caminho futuro voltar a esquecer-se.
 *
 * Uma pasta só sai se TODAS estas forem verdade:
 *   · o nome tem a forma de um pedido (`LIQ-…`);
 *   · não há pedido com esse id, nem entrada na Reciclagem que o possa repor;
 *   · nenhuma proposta, rascunho, modelo, pedido ou entrada da Reciclagem
 *     menciona a pasta (um modelo pode ter guardado uma foto de lá);
 *   · nenhum ficheiro lá dentro tem menos de {@link DIAS} dias.
 *
 * Se UMA das leituras da base de dados falhar, não se apaga nada: «não sei»
 * nunca pode valer o mesmo que «não existe». E nada disto lança.
 *
 * Custo: numa noite normal não há pasta candidata, e o trabalho é uma
 * listagem do balde e duas leituras de ids. Os textos das propostas só se lêem
 * quando há candidatas — na primeira noite, e depois quase nunca.
 */
export const DIAS = 30;

const BUCKET = "proposal-assets";
const FORMA_DE_PEDIDO = /^LIQ-[A-Za-z0-9-]+$/;

type Resultado = { candidatas: number; apagadas: number; acabou: boolean };

export async function limparPastasDePedidosApagados(
  agora: Date,
  prazoMs = 10_000,
): Promise<Resultado> {
  const nada: Resultado = { candidatas: 0, apagadas: 0, acabou: true };
  const sb = getSupabase();
  if (!sb) return nada;
  const fim = Date.now() + prazoMs;
  const limite = agora.getTime() - DIAS * 24 * 60 * 60_000;

  const { data: raiz, error: erroRaiz } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
  if (erroRaiz || !raiz) return { ...nada, acabou: false };
  const pastas = raiz.filter((e) => !e.id && FORMA_DE_PEDIDO.test(e.name)).map((e) => e.name);
  if (pastas.length === 0) return nada;

  const pedidos = await sb.from("quotes").select("id");
  const reciclagem = await sb.from("reciclagem").select("origem_id");
  if (pedidos.error || !pedidos.data || reciclagem.error || !reciclagem.data) {
    return { ...nada, acabou: false };
  }
  const vivos = new Set<string>([
    ...pedidos.data.map((p: { id: string }) => p.id),
    ...reciclagem.data.map((r: { origem_id: string | null }) => r.origem_id ?? ""),
  ]);
  const candidatas = pastas.filter((p) => !vivos.has(p));
  if (candidatas.length === 0) return nada;

  // Só agora, e só porque há candidatas: tudo o que pode mencionar uma pasta.
  const leituras = await Promise.all([
    sb.from("proposals").select("quote_id, doc, line_items"),
    sb.from("app_state").select("key, value"),
    sb.from("proposal_settings").select("value"),
    sb.from("quotes").select("data"),
    sb.from("reciclagem").select("retrato, ficheiros"),
  ]);
  if (leituras.some((l) => l.error || !l.data)) {
    return { candidatas: candidatas.length, apagadas: 0, acabou: false };
  }
  const texto = leituras.map((l) => JSON.stringify(l.data)).join("\n");

  let apagadas = 0;
  for (const pasta of candidatas) {
    if (Date.now() > fim) return { candidatas: candidatas.length, apagadas, acabou: false };
    if (texto.includes(pasta)) continue;
    const { data: ficheiros, error } = await sb.storage.from(BUCKET).list(pasta, { limit: 1000 });
    if (error || !ficheiros) continue;
    const recente = ficheiros.some(
      (f) =>
        !f.created_at ||
        Number.isNaN(Date.parse(f.created_at)) ||
        Date.parse(f.created_at) >= limite,
    );
    if (recente) continue;
    if (await apagarPastaDoPedido(pasta)) apagadas++;
  }
  return { candidatas: candidatas.length, apagadas, acabou: true };
}
