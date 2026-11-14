import "server-only";
import { bytesDaFotoNoPdf } from "@/lib/proposal-doc-render";
import { paletaESugestoesDasFotos } from "@/lib/pdf-editorial/paleta-das-fotos";
import { chaveDoGuardado, guardadoOuCalculado } from "@/lib/proposta-web/guardado";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PALETA DO PDF, PEDIDA PELAS REFERÊNCIAS — UMA CONTA SÓ PARA OS TRÊS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Defeito de 13/11 (PR #440): a mesma proposta dava TRÊS paletas — o PDF
 * `#E5B56B #AFA385 …`, a proposta online `#E4C07B #B3A387 …`, e a sugestão do
 * «Fazer proposta» outras, por outra ordem. A regra era a mesma
 * (`lib/paleta-cores.ts`), mas cada um lia OUTROS bytes: o PDF a versão
 * editorial (1 800 px), a online a versão média, o estúdio a fotografia
 * descodificada e reduzida pelo navegador.
 *
 * Agora a proposta online e o estúdio pedem a paleta AQUI, pelas referências
 * que o motor do PDF escolheu (`web.ambiente.daPaleta`, pela ordem do PDF), e
 * esta lê os MESMOS bytes que o PDF desenha (`bytesDaFotoNoPdf`) e passa-os
 * pela MESMA função (`paletaESugestoesDasFotos`). Um teste prende os três.
 *
 * ── O custo ─────────────────────────────────────────────────────────────────
 * Calcula-se uma vez por CONJUNTO de fotografias e guarda-se (`app_state`,
 * ~300 bytes: doze códigos de cor), pela impressão das referências: a mesma
 * página noutra proposta, ou reaberta, já não descarrega nem passa no `sharp`.
 * Os bytes são os que o PDF já guardou (`fotos-editoriais-guardadas`) — nada
 * novo no armazenamento de ficheiros.
 */

export interface PaletaDoPdf {
  /** As cores do PDF, pela ordem do PDF. */
  cores: string[];
  /** As sugestões do estúdio: as da paleta primeiro, e outras das fotografias. */
  sugestoes: string[];
}

/** No máximo, quantas referências entram numa paleta (a página mostra seis). */
export const MAXIMO_DE_REFS_DA_PALETA = 12;

/**
 * Uma referência que se pode pedir de fora (a rota do estúdio): um caminho do
 * armazenamento ou um endereço (que `fetchProposalImageBytes` guarda contra
 * SSRF) — nunca um `data:` de vários MB num pedido.
 */
export function refDaPaletaAceite(ref: unknown): ref is string {
  return (
    typeof ref === "string" &&
    ref.length > 0 &&
    ref.length <= 1024 &&
    !ref.startsWith("data:") &&
    ref.includes("/")
  );
}

/** A paleta do PDF para estas fotografias, guardada. Vazia se nenhuma se ler. */
export function paletaDoPdfPelasRefs(refs: readonly string[]): Promise<PaletaDoPdf> {
  const lista = refs.slice(0, MAXIMO_DE_REFS_DA_PALETA);
  if (!lista.length) return Promise.resolve({ cores: [], sugestoes: [] });
  return guardadoOuCalculado(
    chaveDoGuardado("paleta-do-pdf", "refs", ...lista),
    async () => {
      // Seis, no normal (a página mostra seis): em paralelo, como o PDF.
      // Sem `Promise.all` a rebentar: uma que falhe fica de fora, como no PDF.
      const bytes = await Promise.all(lista.map((ref) => bytesDaFotoNoPdf(ref).catch(() => null)));
      const validos = bytes.filter((b): b is Buffer => !!b && b.length > 0);
      return validos.length ? paletaESugestoesDasFotos(validos) : { cores: [], sugestoes: [] };
    },
    // Uma paleta vazia (o armazenamento falhou) não fica: a próxima tenta outra vez.
    (p) => Array.isArray(p?.cores) && p.cores.length > 0,
  );
}
