import "server-only";
import { inflateRawSync } from "node:zlib";
import { bytesComprimidos, FicheiroIlegivel, lerDirectorio, eDeTexto } from "./zip";

/**
 * O lado do SERVIDOR do leitor de ZIP: descomprime as entradas de texto, com
 * tectos.
 *
 * ── A BOMBA DE ZIP ──────────────────────────────────────────────────────────
 *
 * Um ficheiro de 40 KB pode descomprimir para 4 GB. O tamanho que o arquivo
 * DECLARA não chega como guarda (é o próprio ficheiro a dizê-lo): o
 * `maxOutputLength` do `inflateRawSync` é que corta, a meio, o que passar do
 * tecto — sem nunca alocar mais do que isso.
 */

/** Um `document.xml` de 120 páginas ronda os 3 MB. */
export const MAX_XML_POR_ENTRADA = 16 * 1024 * 1024;
/** A soma de tudo o que se descomprime num ficheiro. */
export const MAX_XML_TOTAL = 48 * 1024 * 1024;

const GRANDE_DEMAIS = "Este ficheiro tem texto a mais para ser uma proposta (ou está danificado).";

/** Lê as entradas de texto (`.xml`, `.rels`) de um ZIP, já como texto. */
export function lerTextosDoZip(bytes: Uint8Array): Map<string, string> {
  const entradas = lerDirectorio(bytes).filter((e) => eDeTexto(e.nome));
  const textos = new Map<string, string>();
  let total = 0;
  const dec = new TextDecoder("utf-8", { fatal: false });
  for (const e of entradas) {
    if (e.tamanhoReal > MAX_XML_POR_ENTRADA) throw new FicheiroIlegivel(GRANDE_DEMAIS);
    const cru = bytesComprimidos(bytes, e);
    let dados: Uint8Array;
    if (e.metodo === 0) {
      dados = cru;
    } else if (e.metodo === 8) {
      try {
        dados = inflateRawSync(cru, {
          maxOutputLength: Math.min(MAX_XML_POR_ENTRADA, MAX_XML_TOTAL - total) + 1,
        });
      } catch (err) {
        if (err instanceof RangeError || /maxOutputLength|buffer/i.test(String(err))) {
          throw new FicheiroIlegivel(GRANDE_DEMAIS);
        }
        throw new FicheiroIlegivel("O ficheiro está incompleto ou danificado.");
      }
    } else {
      continue; // método que não se lê — a entrada fica de fora
    }
    if (dados.length > MAX_XML_POR_ENTRADA) throw new FicheiroIlegivel(GRANDE_DEMAIS);
    total += dados.length;
    if (total > MAX_XML_TOTAL) throw new FicheiroIlegivel(GRANDE_DEMAIS);
    textos.set(e.nome, dec.decode(dados));
  }
  return textos;
}
