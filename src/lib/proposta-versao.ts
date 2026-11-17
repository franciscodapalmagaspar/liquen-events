import { createHash } from "node:crypto";
import { NUNCA_NO_PDF } from "./proposta-de-pdf/tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VERSÃO DE UMA PROPOSTA — o que muda, e o que só parece mudar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, no pedido da página do casal: «Se eu ajustar o preço ou os
 * serviços, o casal vê a versão atual sem eu reenviar nada. Com uma
 * salvaguarda: se a proposta já foi aceite, o que foi aceite fica congelado e
 * imutável — alterações posteriores geram uma nova versão, que tem de ser
 * aceite de novo.»
 *
 * Para cumprir as duas metades é preciso saber responder a uma pergunta:
 * **este documento é o mesmo que o casal viu da última vez?** Este ficheiro é
 * a resposta — um selo de CONTEÚDO, e mais nada.
 *
 * ── PORQUE É QUE O SELO QUE JÁ EXISTIA NÃO SERVE ──────────────────────────
 *
 * A proposta já grava um `pdfSha256`: a impressão digital dos BYTES do PDF que
 * seguiu para o casal, e que existe para prova («o arco não estava incluído» →
 * `sha256sum` contra o valor guardado no contrato). É excelente para isso e é
 * inútil para esta pergunta.
 *
 * MEDIDO (pdf-lib, dois `PDFDocument.create()` iguais com uma página em
 * branco, gravados com um segundo de intervalo):
 *
 *     A: a4ed4451b135fb6cd65d47195cba2dd8ded635e9141c250330931a473fb7cd9e
 *     B: 85bd5a80bf98636f11966f91d5f456fca25ecc5d93a7759695663e7bf36e1ce1
 *
 * Dois PDFs de conteúdo idêntico, dois selos diferentes — a biblioteca carimba
 * a data de criação lá dentro. Usar o `pdfSha256` como identidade de versão
 * punha a página a dizer «esta proposta foi revista» **de cada vez que ela
 * carregasse em gravar**, mesmo sem tocar numa vírgula. Um aviso que aparece
 * sempre é um aviso que ninguém lê.
 *
 * O selo daqui é sobre o CONTEÚDO: a mesma proposta gravada dez vezes dá dez
 * vezes o mesmo selo.
 *
 * ── O QUE ENTRA NO SELO ───────────────────────────────────────────────────
 *
 * Só o que o casal vê. Uma nota interna que ela escreve para si própria não é
 * uma alteração à proposta, e obrigar a um novo aceite por causa dela seria
 * absurdo — pior, ensinaria a ignorar o aviso.
 *
 * A lista do que fica de fora não é escrita aqui à mão: parte do
 * `NUNCA_NO_PDF`, que já existe e já é testado. Com UMA correcção, e ela é a
 * razão de este comentário existir: o `NUNCA_NO_PDF` responde «o gerador de
 * PDF não desenha isto», e a partir da Fase 1 há uma SEGUNDA superfície — a
 * página do casal. O `headerTitle` está no `NUNCA_NO_PDF` e **é desenhado na
 * página** (`Documento.tsx`: `doc.headerTitle || t.tituloApresentacao`).
 * Excluí-lo do selo deixava o título da proposta mudar por baixo de um aceite
 * sem que nada o dissesse. Fica dentro. O teste que acompanha este ficheiro
 * lê o `Documento.tsx` e recusa qualquer campo excluído que lá apareça — as
 * duas listas não podem voltar a divergir em silêncio.
 */

/**
 * Os campos do documento que NÃO contam para a versão: o casal não os vê, nem
 * no PDF nem na página, portanto mexer neles não é mexer na proposta.
 *
 * Os preços por linha (`budgetAmounts`), o que cada linha custa à casa
 * (`budgetCosts`) e a escala (`budgetScales`) ficam de fora com uma condição
 * que se cumpre: o TOTAL é selado à parte, aqui em baixo. Remexer valores
 * entre linhas sem mudar o total não muda nada do que o casal leu; mudar o
 * total muda o selo.
 */
/**
 * Os campos que o gerador de PDF não desenha E A PÁGINA DESENHA.
 *
 * São a excepção que este ficheiro existe para não deixar cair: excluí-los do
 * selo deixava mudar, por baixo de um aceite, coisa que o casal tinha à frente
 * dos olhos. O teste que acompanha este ficheiro lê o `Documento.tsx` e recusa
 * qualquer campo excluído que lá apareça — as duas listas não podem voltar a
 * divergir em silêncio.
 */
const VISTO_NA_PAGINA = new Set([
  "headerTitle",
  // As alternativas do casal só existem na página, e é lá que se escolhe:
  // trocar uma opção depois do aceite é mudar o que foi aceite.
  "escolhas",
]);

export const NUNCA_VISTO_PELO_CASAL: readonly string[] = Object.freeze(
  Object.keys(NUNCA_NO_PDF).filter((campo) => !VISTO_NA_PAGINA.has(campo)),
);

/** O conteúdo de uma proposta que conta para a versão. */
export interface ConteudoSelavel {
  doc?: unknown;
  lineItems?: unknown;
  notes?: string;
  subtotal?: number;
  vat?: number;
  total?: number;
  currency?: string;
  /** A língua em que o documento foi apresentado: mudá-la é outro documento. */
  idioma?: string;
}

/**
 * Uma forma canónica de um valor: chaves de objecto por ordem alfabética,
 * `undefined` fora, ordem das listas intacta (num documento a ordem é
 * conteúdo — é a ordem das páginas).
 *
 * Sem isto o selo dependia da ordem por que as chaves foram escritas, que é
 * uma coisa que muda sozinha — uma linha movida no editor, uma propriedade
 * acrescentada por um `spread`, uma ida e volta pelo `jsonb` do Postgres.
 */
export function canonizar(valor: unknown): unknown {
  if (valor === null || typeof valor !== "object") {
    // `undefined` não sobrevive a um JSON e não deve: um campo ausente e um
    // campo a `undefined` são o mesmo documento.
    return valor === undefined ? null : valor;
  }
  if (Array.isArray(valor)) return valor.map(canonizar);
  const objecto = valor as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  for (const chave of Object.keys(objecto).sort()) {
    if (objecto[chave] === undefined) continue;
    saida[chave] = canonizar(objecto[chave]);
  }
  return saida;
}

/** O documento sem os campos que o casal nunca vê. */
function docVisivel(doc: unknown): unknown {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return doc ?? null;
  const entrada = doc as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  for (const chave of Object.keys(entrada)) {
    if (NUNCA_VISTO_PELO_CASAL.includes(chave)) continue;
    saida[chave] = entrada[chave];
  }
  // O artigo do Moloni de um valor adicional (5/11) vive DENTRO do adicional,
  // que o casal vê — mas o artigo não o vê. Tira-se antes de selar. Num
  // documento sem artigos nada muda, e os selos já guardados continuam a bater.
  if (Array.isArray(saida.budgetExtras)) saida.budgetExtras = semArtigoNosAdicionais(saida.budgetExtras);
  return saida;
}

/**
 * O selo desta versão: `sha256` do conteúdo visível, em hexadecimal.
 *
 * Determinístico por construção — a mesma proposta dá sempre o mesmo selo,
 * nesta máquina e na próxima, hoje e daqui a um ano.
 */
export function seloDoConteudo(p: ConteudoSelavel): string {
  const conteudo = canonizar({
    doc: docVisivel(p.doc),
    lineItems: p.lineItems ?? [],
    notes: p.notes ?? "",
    subtotal: p.subtotal ?? 0,
    vat: p.vat ?? 0,
    total: p.total ?? 0,
    currency: p.currency || "EUR",
    // Uma proposta sem língua gravada é portuguesa — a mesma regra do
    // `idiomaDaProposta`, escrita aqui para o selo não mudar no dia em que uma
    // proposta antiga passar a ter a coluna preenchida com o que já era.
    idioma: p.idioma === "en" ? "en" : "pt",
  });
  return createHash("sha256").update(JSON.stringify(conteudo)).digest("hex");
}

/**
 * O estado da versão que o casal está a ver.
 *
 * - `por-aceitar` — ainda não há aceite nenhum. A página mostra o documento
 *   VIVO: o que ela mudar no estúdio aparece ali sem reenviar nada.
 * - `em-vigor` — há um aceite, e o documento de agora é exactamente o que foi
 *   aceite. Nada a dizer ao casal.
 * - `revista` — há um aceite E o documento mudou desde então. O casal continua
 *   a ver o que aceitou (congelado, imutável); a versão nova precisa de um
 *   aceite novo. A Fase 4 é que lhe dá o botão; até lá o que existe é o
 *   congelamento e o aviso.
 */
export type EstadoDaVersao = "por-aceitar" | "em-vigor" | "revista";

export function estadoDaVersao(seloActual: string, seloAceite?: string): EstadoDaVersao {
  if (!seloAceite) return "por-aceitar";
  return seloAceite === seloActual ? "em-vigor" : "revista";
}

/**
 * O NÚMERO da versão, que é o que se pode dizer em voz alta ao telefone
 * («estou a olhar para a versão 2»). Sobe só quando o selo muda: gravar a
 * mesma proposta cinco vezes não a leva à versão 6.
 */
export function proximaVersao(
  anterior: { versaoSelo?: string; versaoNumero?: number } | undefined,
  seloNovo: string,
): { versaoSelo: string; versaoNumero: number; mudou: boolean } {
  const numeroAnterior = Number.isFinite(anterior?.versaoNumero)
    ? Number(anterior?.versaoNumero)
    : 0;
  if (anterior?.versaoSelo === seloNovo && numeroAnterior > 0) {
    return { versaoSelo: seloNovo, versaoNumero: numeroAnterior, mudou: false };
  }
  return { versaoSelo: seloNovo, versaoNumero: Math.max(numeroAnterior, 0) + 1, mudou: true };
}

/** Os valores adicionais sem o `artigo` do Moloni (que é só da faturação). */
export function semArtigoNosAdicionais(extras: unknown[]): unknown[] {
  return extras.map((e) => {
    if (!e || typeof e !== "object" || !("artigo" in e)) return e;
    const { artigo: _artigo, ...resto } = e as Record<string, unknown>;
    void _artigo;
    return resto;
  });
}
