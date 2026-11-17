/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FALTA NO DOCUMENTO, EM PALAVRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Há duas maneiras de uma proposta seguir para o cliente incompleta, e a
 * Catarina tem de ver as DUAS antes de a enviar:
 *
 *  1. a foto não chegou — o servidor não a conseguiu ir buscar (`missingImages`);
 *  2. o conteúdo chegou e NÃO COUBE — a sétima foto de um mood board, a
 *     terceira linha do "Local", uma descrição comprida de mais (`truncations`).
 *
 * O caso 2 era completamente mudo: as fotos eram carregadas, descarregadas com
 * sucesso, e simplesmente nunca desenhadas. Vem agora do gerador já com o sítio
 * e a quantidade; aqui só se escreve a frase.
 *
 * Saiu do `ProposalStudio.tsx` a 17/11 (regra do código: o estúdio não cresce),
 * com a pergunta antes do envio, que é quem mais o usa.
 */

/** Uma perda por composição, tal como o gerador a relata (o tipo vive em
 *  `proposal-doc-pdf`, que é `server-only` e por isso não se importa aqui). */
export interface Corte {
  where: string;
  dropped: number;
  unit: "fotos" | "linhas";
}

/** Aceita só o que tem forma de corte — o resto é ignorado em vez de rebentar
 *  a mensagem (uma resposta estranha nunca pode tapar o aviso). */
export function normalizaCortes(raw: unknown): Corte[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is Corte =>
      !!c &&
      typeof c === "object" &&
      typeof (c as Corte).where === "string" &&
      typeof (c as Corte).dropped === "number" &&
      (c as Corte).dropped > 0 &&
      ((c as Corte).unit === "fotos" || (c as Corte).unit === "linhas"),
  );
}

/** Lê o cabeçalho `X-Conteudo-Cortado` da pré-visualização (JSON em base64 —
 *  o corpo da resposta é o PDF e os nomes dos campos trazem acentos). */
export function cortesDoCabecalho(header: string | null): Corte[] {
  if (!header) return [];
  try {
    const bytes = Uint8Array.from(atob(header), (ch) => ch.charCodeAt(0));
    return normalizaCortes(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return [];
  }
}

/** "Mood board «Cerimónia»: 3 fotos não entram no PDF". */
export function fraseDeCorte(c: Corte): string {
  if (c.unit === "fotos") {
    return `${c.where}: ${c.dropped === 1 ? "1 foto não entra" : `${c.dropped} fotos não entram`} no PDF`;
  }
  return `${c.where}: ${c.dropped === 1 ? "1 linha cortada" : `${c.dropped} linhas cortadas`}`;
}

/**
 * A frase única do aviso, ou `null` quando o documento vai completo.
 *
 * As duas perdas aparecem JUNTAS porque, para quem vai carregar em "Enviar", o
 * problema é o mesmo — o documento vai incompleto — mas ficam DISTINTAS na
 * frase, porque a correcção não é a mesma: uma foto que não chegou tenta-se de
 * novo, um mood board com fotos a mais tem de perder fotos.
 */
export function avisoDeConteudoIncompleto(emFalta: number, cortes: Corte[]): string | null {
  const partes: string[] = [];
  if (emFalta > 0) {
    // "buscá-la OU desenhá-la": a contagem cobre as duas avarias — a foto que
    // não se conseguiu ir buscar ao armazenamento e a que se foi buscar e não
    // se conseguiu imprimir (um WebP antigo da biblioteca, bytes corrompidos).
    // Para quem envia é a mesma perda e a mesma correcção: recarregar a foto.
    partes.push(
      emFalta === 1
        ? "1 foto não entrou (não foi possível ir buscá-la ou desenhá-la)"
        : `${emFalta} fotos não entraram (não foi possível ir buscá-las ou desenhá-las)`,
    );
  }
  for (const c of cortes) partes.push(fraseDeCorte(c));
  return partes.length ? partes.join("; ") : null;
}
