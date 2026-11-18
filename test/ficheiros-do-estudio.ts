import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * OS FICHEIROS QUE DESENHAM O ESTÚDIO, para os testes que leem o código-fonte.
 *
 * O `ProposalStudio.tsx` está a ser partido em peças (`admin/estudio/`, fases 2
 * a 4 de `docs/ESTRUTURA-DO-CODIGO.md`). Um teste que varre o TEXTO do estúdio
 * à procura de uma regra (uma classe proibida, uma pergunta à janela) tem de
 * varrer também as peças — senão a regra deixava de valer exactamente no código
 * que saiu, sem nenhum teste ficar vermelho.
 *
 * Devolve os caminhos relativos à pasta `admin/`, com o `ProposalStudio.tsx`
 * primeiro e as peças por ordem alfabética, sem testes.
 */
const ADMIN = path.resolve(__dirname, "../src/app/[lang]/(admin)/orcamento/admin");

function pecas(dir: string): string[] {
  const saida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...pecas(p));
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) saida.push(p);
  }
  return saida;
}

export function ficheirosDoEstudio(): string[] {
  const doEstudio = pecas(path.join(ADMIN, "estudio"))
    .map((p) => path.relative(ADMIN, p).split(path.sep).join("/"))
    .sort();
  return ["ProposalStudio.tsx", ...doEstudio];
}

/**
 * O texto do estúdio inteiro — o componente e as peças, juntos —, para os
 * testes que perguntam «isto existe algures no estúdio?». Em que ficheiro
 * vive é um pormenor da arrumação, e não a regra que o teste prende.
 */
export function fonteDoEstudio(): string {
  return ficheirosDoEstudio()
    .map((f) => readFileSync(path.join(ADMIN, f), "utf8"))
    .join("\n");
}
