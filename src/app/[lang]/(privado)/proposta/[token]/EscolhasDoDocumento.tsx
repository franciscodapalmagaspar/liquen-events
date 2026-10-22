import type { ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import {
  descricaoNaLingua,
  escolhasParaOCasal,
  escolhasParaOEcra,
  notaNaLingua,
  rotuloNaLingua,
  tituloNaLingua,
} from "@/lib/proposta-escolhas";
import Escolhas from "./Escolhas";
import { textosDaPagina } from "./textos-da-pagina";

/**
 * ── À VOSSA ESCOLHA ─────────────────────────────────────────────────────────
 * «Onde eu tiver dado alternativas ao casal (duas paletas para a cerimónia,
 * dois estilos de corredor), eles escolhem ali.»
 *
 * Saiu do `Documento.tsx` (22/10) quando a página passou a mostrar o PDF tal
 * e qual (`PaginasDoPdf.tsx`): as escolhas são a única coisa que o casal FAZ
 * nesta página, e o PDF não as tem (ver `NUNCA_NO_PDF`). Ficam por baixo das
 * páginas, exactamente como estavam.
 *
 * Recebe o documento ORIGINAL (não o projectado pela língua): a tradução das
 * alternativas faz-se aqui, com os ajudantes do `proposta-escolhas` — as
 * caixas inglesas vivem dentro de duas listas encaixadas, onde o `docNaLingua`
 * não chega.
 */
export default function EscolhasDoDocumento({
  doc,
  idioma,
  fotos,
  token,
  escolhido = {},
}: {
  doc: ProposalDoc;
  idioma: IdiomaDaProposta;
  /** As fotografias já assinadas no servidor — basta as das alternativas. */
  fotos: FotoDaProposta[];
  token: string;
  /** O que o casal já escolheu — vem do PEDIDO, ver `proposta-escolhas.ts`. */
  escolhido?: Record<string, string>;
}) {
  const escolhas = escolhasParaOCasal(doc.escolhas);
  if (escolhas.length === 0) return null;
  const p = textosDaPagina(idioma);

  const emLingua = {
    titulo: Object.fromEntries(escolhas.map((e) => [e.id, tituloNaLingua(e, idioma)])),
    nota: Object.fromEntries(escolhas.map((e) => [e.id, notaNaLingua(e, idioma)])),
    rotulo: Object.fromEntries(
      escolhas.flatMap((e) => e.opcoes.map((o) => [o.id, rotuloNaLingua(o, idioma)])),
    ),
    descricao: Object.fromEntries(
      escolhas.flatMap((e) => e.opcoes.map((o) => [o.id, descricaoNaLingua(o, idioma)])),
    ),
  };

  /**
   * As fotografias das opções, pelo id opaco `e{i}o{j}`.
   *
   * Os índices são os do documento ORIGINAL (é assim que o inventário os
   * escreve), e por isso constrói-se a partir de `doc.escolhas` e não da lista
   * já filtrada — uma escolha por acabar no meio da lista deslocava todos os
   * ids seguintes e cada opção ficava com a fotografia da vizinha.
   */
  const porId = new Map(fotos.map((f) => [f.id, f]));
  const fotosDasEscolhas: Record<string, FotoDaProposta> = {};
  (doc.escolhas ?? []).forEach((e, i) => {
    const posicao = escolhas.findIndex((x) => x.id === e.id);
    if (posicao < 0) return;
    e.opcoes.forEach((o, j) => {
      const foto = porId.get(`e${i}o${j}`);
      const jVisivel = escolhas[posicao].opcoes.findIndex((x) => x.id === o.id);
      if (foto && jVisivel >= 0) fotosDasEscolhas[`e${posicao}o${jVisivel}`] = foto;
    });
  });

  return (
    <section className="mt-16 sm:mt-24">
      <header id="escolhas" className="scroll-mt-6">
        <h2
          className="text-foreground/90 text-balance"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 4.2vw, 40px)" }}
        >
          {p.escolhas}
        </h2>
      </header>
      <p className="mt-4 max-w-2xl text-foreground/70 text-sm leading-relaxed">{p.escolhasIntro}</p>
      <Escolhas
        escolhas={escolhasParaOEcra(escolhas)}
        escolhido={escolhido}
        fotos={fotosDasEscolhas}
        token={token}
        textos={p}
        emLingua={emLingua}
      />
    </section>
  );
}
