import "server-only";
import { lerTodasAsLinhas } from "./ler-todas-as-linhas";
import { createHash } from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import { getState, setState } from "@/lib/app-state";
import { log } from "@/lib/logger";
import { TABELAS_COM_CONTEUDO } from "@/lib/limpar-pastas-orfas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS PDF DE PROPOSTA QUE JÁ FORAM SUBSTITUÍDOS (10/11, decisão dela)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada envio guarda o PDF em `proposal-pdfs/<proposta>/<chave>.pdf`, e a chave
 * é o CONTEÚDO (`proposal-pdf-guardado.ts`): uma proposta revista e reenviada
 * deixa o ficheiro anterior lá, «órfão e inofensivo» — mas a ocupar espaço no
 * plano gratuito. A 10/11 eram 9 ficheiros (~9 MB). Ela não quis apagá-los à
 * mão («vou demorar bue tempo») e pediu que saíssem sozinhos, como as
 * fotografias dos pedidos apagados (`limpar-pastas-orfas.ts`).
 *
 * E vale a regra que ela pôs nesse dia: nada sai que depois faça falta. Um PDF
 * fica SEMPRE que for qualquer uma destas coisas:
 *
 *   1. o mais recente da sua proposta, se a proposta existe (ou está na
 *      Reciclagem, e pode voltar);
 *   2. o que foi ACEITE: o `sha256` dele está selado no contrato
 *      (`contracts.proposta_pdf_sha256`). Um contrato sem selo guarda a pasta
 *      inteira — «não sei qual foi» não autoriza apagar nenhum;
 *   3. o último ENVIADO (`proposals.pdf_sha256`);
 *   4. mencionado em qualquer tabela com conteúdo (o nome do ficheiro, ou o id
 *      de uma proposta que já não existe — um resgate na Reciclagem, por ex.);
 *   5. com menos de {@link DIAS} dias;
 *   6. e só sai depois de ter sido candidato numa noite anterior, há pelo menos
 *      {@link ESPERA_DIAS} dias, continuando a sê-lo (lista em `app_state`,
 *      {@link CHAVE}).
 *
 * Os pontos 2 e 3 comparam o tamanho primeiro e só descarregam o ficheiro
 * para calcular o `sha256` quando o tamanho coincide (ou não se sabe). Se a
 * descarga falhar, o ficheiro fica.
 *
 * Se UMA leitura falhar, não se apaga nada. No máximo {@link POR_NOITE}
 * ficheiros por noite, cada um no log. Nada disto lança.
 *
 * Custo: uma listagem da raiz, uma por proposta (dezenas), e três leituras de
 * colunas pequenas. Os textos das tabelas só se lêem nas noites com
 * candidatos; os PDF só se descarregam quando o tamanho coincide com o de um
 * enviado ou aceite.
 */
export const DIAS = 30;
export const ESPERA_DIAS = 7;
export const POR_NOITE = 10;
export const CHAVE = "limpeza:pdfs-substituidos";

const BUCKET = "proposal-pdfs";
const DIA_MS = 24 * 60 * 60_000;

/** Ficheiro → quando foi visto candidato pela primeira vez (ISO). */
export type EmEspera = Record<string, string>;

type Resultado = { candidatos: number; emEspera: number; apagados: number; acabou: boolean };

type Ficheiro = { caminho: string; nome: string; criado: number; bytes: number | null };

type Selo = { sha: string; bytes: number | null };

export async function limparPdfsSubstituidos(agora: Date, prazoMs = 8_000): Promise<Resultado> {
  const nada: Resultado = { candidatos: 0, emEspera: 0, apagados: 0, acabou: true };
  const falhou: Resultado = { ...nada, acabou: false };
  const sb = getSupabase();
  if (!sb) return nada;
  const fim = Date.now() + prazoMs;
  const limite = agora.getTime() - DIAS * DIA_MS;

  const { data: raiz, error: erroRaiz } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
  if (erroRaiz || !raiz) return falhou;
  const pastas = raiz.filter((e) => !e.id).map((e) => e.name);
  if (pastas.length === 0) return nada;

  // Às páginas: lidas só até às 1000, uma proposta da linha 1001 não estava em
  // `existe` nem nos `selos`, e o PDF enviado e o aceite dela passavam a
  // candidatos (revisão de 13/11, n.º 8).
  const [propostas, contratos, reciclagem] = await Promise.all([
    lerTodasAsLinhas(sb, "proposals", "id, pdf_sha256, pdf_bytes"),
    lerTodasAsLinhas(sb, "contracts", "proposal_id, proposta_pdf_sha256, proposta_pdf_bytes"),
    lerTodasAsLinhas(sb, "reciclagem", "origem_id"),
  ]);
  if ([propostas, contratos, reciclagem].some((r) => r.error || !r.data)) return falhou;

  const existe = new Set<string>([
    ...(propostas.data as { id: string }[]).map((p) => p.id),
    ...(reciclagem.data as { origem_id: string | null }[]).map((r) => r.origem_id ?? ""),
  ]);
  /** Por proposta, os PDF que não podem sair: o último enviado e o aceite. */
  const selos = new Map<string, Selo[]>();
  /** Propostas com um contrato sem selo: a pasta inteira fica. */
  const semSelo = new Set<string>();
  const juntar = (id: string, sha: string | null, bytes: number | null) => {
    if (!sha) return;
    selos.set(id, [...(selos.get(id) ?? []), { sha: sha.toLowerCase(), bytes }]);
  };
  for (const p of propostas.data as {
    id: string;
    pdf_sha256: string | null;
    pdf_bytes: number | null;
  }[]) {
    juntar(p.id, p.pdf_sha256, p.pdf_bytes);
  }
  for (const c of contratos.data as {
    proposal_id: string | null;
    proposta_pdf_sha256: string | null;
    proposta_pdf_bytes: number | null;
  }[]) {
    if (!c.proposal_id) continue;
    if (!c.proposta_pdf_sha256) semSelo.add(c.proposal_id);
    juntar(c.proposal_id, c.proposta_pdf_sha256, c.proposta_pdf_bytes);
  }

  // ── Portas 1 e 5: por pasta ──────────────────────────────────────────────
  let candidatos: Ficheiro[] = [];
  for (const pasta of pastas) {
    if (Date.now() > fim) return { ...falhou, candidatos: candidatos.length };
    if (semSelo.has(pasta)) continue;
    const { data: lista, error } = await sb.storage.from(BUCKET).list(pasta, { limit: 1000 });
    if (error || !lista) continue;
    const pdfs = lista
      .filter((f) => f.id && f.name.endsWith(".pdf"))
      .map((f) => ({
        caminho: `${pasta}/${f.name}`,
        nome: f.name,
        criado: f.created_at ? Date.parse(f.created_at) : Number.NaN,
        bytes: typeof f.metadata?.size === "number" ? f.metadata.size : null,
      }));
    if (pdfs.length === 0) continue;
    // Uma data que não se lê não deixa decidir qual é o mais recente: fica tudo.
    if (pdfs.some((f) => Number.isNaN(f.criado))) continue;
    const maisRecente = Math.max(...pdfs.map((f) => f.criado));
    for (const f of pdfs) {
      if (existe.has(pasta) && f.criado === maisRecente) continue;
      if (f.criado >= limite) continue;
      candidatos.push(f);
    }
  }

  // ── Porta 4: menções em qualquer tabela ─────────────────────────────────
  if (candidatos.length > 0) {
    const leituras = await Promise.all(
      TABELAS_COM_CONTEUDO.map((t) => lerTodasAsLinhas(sb, t, "*")),
    );
    if (leituras.some((l) => l.error || !l.data)) return falhou;
    const texto = leituras
      .map((l, i) =>
        JSON.stringify(
          TABELAS_COM_CONTEUDO[i] === "app_state"
            ? (l.data as { key?: string }[]).filter((r) => r.key !== CHAVE)
            : l.data,
        ),
      )
      .join("\n");
    candidatos = candidatos.filter((f) => {
      const pasta = f.caminho.split("/")[0];
      if (texto.includes(f.nome.replace(/\.pdf$/, ""))) return false;
      // Uma proposta que já não existe mas é mencionada (um resgate guardado,
      // por exemplo) guarda a pasta inteira.
      if (!existe.has(pasta) && texto.includes(pasta)) return false;
      return true;
    });
  }

  // ── Portas 2 e 3: o enviado e o aceite, pelo sha256 ──────────────────────
  const prontos: Ficheiro[] = [];
  for (const f of candidatos) {
    if (Date.now() > fim) return { ...falhou, candidatos: candidatos.length };
    const pasta = f.caminho.split("/")[0];
    const daPasta = selos.get(pasta) ?? [];
    const podeSer = daPasta.filter(
      (s) => s.bytes === null || f.bytes === null || s.bytes === f.bytes,
    );
    if (podeSer.length > 0) {
      const { data, error } = await sb.storage.from(BUCKET).download(f.caminho);
      if (error || !data) continue;
      const sha = createHash("sha256")
        .update(Buffer.from(await data.arrayBuffer()))
        .digest("hex");
      if (podeSer.some((s) => s.sha === sha)) continue;
    }
    prontos.push(f);
  }

  // ── Porta 6: a lista de espera ───────────────────────────────────────────
  const antes = (await getState<EmEspera>(CHAVE)) ?? {};
  const espera: EmEspera = {};
  for (const f of prontos) espera[f.caminho] = antes[f.caminho] ?? agora.toISOString();
  const gravou = await setState(CHAVE, espera);
  if (!gravou.gravado || !gravou.duradouro) {
    return { ...falhou, candidatos: prontos.length, emEspera: prontos.length };
  }

  let apagados = 0;
  for (const f of prontos) {
    if (apagados >= POR_NOITE || Date.now() > fim) break;
    const visto = espera[f.caminho];
    const desde = Date.parse(visto);
    if (Number.isNaN(desde) || agora.getTime() - desde < ESPERA_DIAS * DIA_MS) continue;
    const { error } = await sb.storage.from(BUCKET).remove([f.caminho]);
    if (error) continue;
    apagados++;
    delete espera[f.caminho];
    log.info("limpeza: PDF de proposta substituído saiu do armazenamento", {
      ficheiro: f.caminho,
      bytes: f.bytes,
      criado: new Date(f.criado).toISOString(),
      candidatoDesde: visto,
    });
  }
  if (apagados > 0) await setState(CHAVE, espera);
  return {
    candidatos: prontos.length,
    emEspera: Object.keys(espera).length,
    apagados,
    acabou: true,
  };
}
