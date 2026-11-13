/**
 * ════════════════════════════════════════════════════════════════════════════
 * LER UM .docx OU UM .pptx — QUE SÃO FICHEIROS ZIP
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (13/11): a mãe tem propostas feitas em Word e PowerPoint antes do
 * back office, e o sistema deve lê-las e passá-las para o «Fazer proposta».
 *
 * Um .docx e um .pptx são arquivos ZIP com XML lá dentro. Ler o directório
 * central de um ZIP são umas dezenas de linhas, e uma biblioteca para isso era
 * uma dependência nova a correr sobre ficheiros que vêm de fora. Isto lê SÓ o
 * que é preciso: a lista das entradas e onde estão os bytes de cada uma.
 *
 * ── PURO, E SEM `node:zlib` ─────────────────────────────────────────────────
 *
 * Este módulo não descomprime nada: devolve os bytes COMPRIMIDOS de cada
 * entrada e o método. Quem descomprime é quem chama — o servidor com o
 * `inflateRawSync` (`zip-node.ts`), o navegador com o `DecompressionStream`
 * (`no-navegador.ts`). É isso que deixa o mesmo leitor correr dos dois lados:
 * o navegador tira as fotografias do ficheiro sem as mandar ao servidor (ver
 * `emagrecerParaEnvio`, mais abaixo, e o porquê lá).
 *
 * ── O QUE SE RECUSA ─────────────────────────────────────────────────────────
 *
 * Um ficheiro que vem de fora não é de confiança. Recusa-se, com uma frase que
 * ela entende: ZIP64 (um documento de proposta nunca precisa), entradas
 * cifradas, mais de {@link MAX_ENTRADAS} entradas, posições que saem do
 * ficheiro, e tamanhos declarados absurdos. O tecto do que se DESCOMPRIME é de
 * quem descomprime — aqui só se lê o que o ficheiro diz.
 */

/** Uma proposta em PowerPoint com 80 diapositivos tem ~400 entradas. */
export const MAX_ENTRADAS = 4000;

/**
 * O tecto do que vai ao servidor (`/api/orcamento/importar`): o alojamento
 * recusa corpos acima de ~4,5 MB, e o TEXTO de uma proposta são KB.
 */
export const MAX_BYTES_DA_IMPORTACAO = 4 * 1024 * 1024;

/** Uma entrada do directório central. */
export interface EntradaZip {
  /** O caminho dentro do arquivo, com `/` (ex.: `word/document.xml`). */
  nome: string;
  /** 0 = guardado tal e qual; 8 = deflate. Outro qualquer não se lê. */
  metodo: number;
  crc32: number;
  tamanhoComprimido: number;
  tamanhoReal: number;
  /** Onde começam os bytes comprimidos, já depois do cabeçalho local. */
  inicioDosDados: number;
}

/** Erro com uma frase para mostrar a ela, em português. */
export class FicheiroIlegivel extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "FicheiroIlegivel";
  }
}

const SIG_FIM = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

function u16(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8);
}
function u32(b: Uint8Array, i: number): number {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

const NAO_E_ZIP =
  "Este ficheiro não parece um documento do Word (.docx) nem do PowerPoint (.pptx).";

/** Começa como um ZIP? (`PK\x03\x04`) — a verificação pelos «bytes mágicos». */
export function pareceZip(b: Uint8Array): boolean {
  return b.length >= 4 && u32(b, 0) === SIG_LOCAL;
}

/**
 * Lê o directório central. Lança {@link FicheiroIlegivel} quando o arquivo não
 * se lê ou não é de confiança.
 */
export function lerDirectorio(b: Uint8Array): EntradaZip[] {
  if (!pareceZip(b) || b.length < 22) throw new FicheiroIlegivel(NAO_E_ZIP);

  // O registo do fim está nos últimos 22 bytes, mais um comentário de até 64 KB.
  let fim = -1;
  const limite = Math.max(0, b.length - 22 - 0xffff);
  for (let i = b.length - 22; i >= limite; i--) {
    if (u32(b, i) === SIG_FIM) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new FicheiroIlegivel("O ficheiro está incompleto ou danificado.");

  const total = u16(b, fim + 10);
  const tamanhoDoCentral = u32(b, fim + 12);
  const inicioDoCentral = u32(b, fim + 16);
  if (total === 0xffff || tamanhoDoCentral === 0xffffffff || inicioDoCentral === 0xffffffff) {
    throw new FicheiroIlegivel("Este ficheiro é grande demais para ser importado.");
  }
  if (u16(b, fim + 4) !== 0 || u16(b, fim + 6) !== 0) {
    throw new FicheiroIlegivel("O ficheiro está dividido em partes e não se consegue ler.");
  }
  if (total > MAX_ENTRADAS) {
    throw new FicheiroIlegivel("Este ficheiro tem partes a mais para ser uma proposta.");
  }
  if (inicioDoCentral + tamanhoDoCentral > fim) {
    throw new FicheiroIlegivel("O ficheiro está incompleto ou danificado.");
  }

  const entradas: EntradaZip[] = [];
  let p = inicioDoCentral;
  for (let n = 0; n < total; n++) {
    if (p + 46 > fim || u32(b, p) !== SIG_CENTRAL) {
      throw new FicheiroIlegivel("O ficheiro está incompleto ou danificado.");
    }
    const flags = u16(b, p + 8);
    const metodo = u16(b, p + 10);
    const crc32 = u32(b, p + 16);
    const tamanhoComprimido = u32(b, p + 20);
    const tamanhoReal = u32(b, p + 24);
    const nLen = u16(b, p + 28);
    const eLen = u16(b, p + 30);
    const cLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    if (p + 46 + nLen > fim)
      throw new FicheiroIlegivel("O ficheiro está incompleto ou danificado.");
    const nome = new TextDecoder("utf-8", { fatal: false })
      .decode(b.subarray(p + 46, p + 46 + nLen))
      .replace(/\\/g, "/");
    p += 46 + nLen + eLen + cLen;

    if (flags & 0x1) {
      throw new FicheiroIlegivel(
        "O documento está protegido com palavra-passe. Abre-o, tira a palavra-passe e volta a tentar.",
      );
    }
    if (tamanhoComprimido === 0xffffffff || tamanhoReal === 0xffffffff) {
      throw new FicheiroIlegivel("Este ficheiro é grande demais para ser importado.");
    }
    if (local + 30 > b.length || u32(b, local) !== SIG_LOCAL) {
      throw new FicheiroIlegivel("O ficheiro está incompleto ou danificado.");
    }
    const inicioDosDados = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    if (inicioDosDados + tamanhoComprimido > b.length) {
      throw new FicheiroIlegivel("O ficheiro está incompleto ou danificado.");
    }
    if (nome.endsWith("/")) continue; // pasta
    entradas.push({ nome, metodo, crc32, tamanhoComprimido, tamanhoReal, inicioDosDados });
  }
  return entradas;
}

/** Os bytes comprimidos de uma entrada (sem cópia). */
export function bytesComprimidos(b: Uint8Array, e: EntradaZip): Uint8Array {
  return b.subarray(e.inicioDosDados, e.inicioDosDados + e.tamanhoComprimido);
}

/** Uma entrada para escrever: os bytes já no método indicado. */
export interface EntradaCrua {
  nome: string;
  metodo: number;
  crc32: number;
  tamanhoReal: number;
  dados: Uint8Array;
}

/**
 * Escreve um ZIP com entradas já comprimidas — sem recomprimir nada.
 *
 * Serve para {@link emagrecerParaEnvio} (copiar as entradas de texto tal e
 * qual) e para os testes fabricarem documentos.
 */
export function escreverZip(entradas: readonly EntradaCrua[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  for (const e of entradas) {
    const nome = enc.encode(e.nome);
    const loc = new Uint8Array(30 + nome.length);
    const v = new DataView(loc.buffer);
    v.setUint32(0, SIG_LOCAL, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // nomes em UTF-8
    v.setUint16(8, e.metodo, true);
    v.setUint32(14, e.crc32 >>> 0, true);
    v.setUint32(18, e.dados.length, true);
    v.setUint32(22, e.tamanhoReal, true);
    v.setUint16(26, nome.length, true);
    loc.set(nome, 30);

    const cen = new Uint8Array(46 + nome.length);
    const c = new DataView(cen.buffer);
    c.setUint32(0, SIG_CENTRAL, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, e.metodo, true);
    c.setUint32(16, e.crc32 >>> 0, true);
    c.setUint32(20, e.dados.length, true);
    c.setUint32(24, e.tamanhoReal, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, pos, true);
    cen.set(nome, 46);

    partes.push(loc, e.dados);
    central.push(cen);
    pos += loc.length + e.dados.length;
  }
  const tamanhoCentral = central.reduce((s, x) => s + x.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, SIG_FIM, true);
  f.setUint16(8, entradas.length, true);
  f.setUint16(10, entradas.length, true);
  f.setUint32(12, tamanhoCentral, true);
  f.setUint32(16, pos, true);

  const out = new Uint8Array(pos + tamanhoCentral + 22);
  let o = 0;
  for (const x of [...partes, ...central, fim]) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}

/** As entradas que o leitor do servidor precisa: o XML e as relações. */
export function eDeTexto(nome: string): boolean {
  return /\.(xml|rels)$/i.test(nome);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FICHEIRO QUE VAI AO SERVIDOR LEVA SÓ O TEXTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um PowerPoint de proposta com fotografias tem 20–80 MB. O alojamento recusa
 * corpos acima de ~4,5 MB por pedido (a mesma razão do `image-prep.ts`): mandar
 * o ficheiro inteiro falhava em quase todas as propostas verdadeiras.
 *
 * O servidor só precisa do XML (o texto, a ordem e QUE fotografia está em que
 * diapositivo). As fotografias ficam no navegador, que já as tem, e só sobem
 * — reduzidas, pelo caminho de sempre — as que ela escolher, no fim.
 *
 * Copia os bytes comprimidos tal e qual: não recomprime, e é instantâneo.
 */
export function emagrecerParaEnvio(b: Uint8Array): Uint8Array {
  const entradas = lerDirectorio(b).filter((e) => eDeTexto(e.nome));
  return escreverZip(
    entradas.map((e) => ({
      nome: e.nome,
      metodo: e.metodo,
      crc32: e.crc32,
      tamanhoReal: e.tamanhoReal,
      dados: bytesComprimidos(b, e),
    })),
  );
}
