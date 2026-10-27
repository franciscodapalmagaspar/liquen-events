import "server-only";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import type {
  ConteudoWeb,
  FotoWeb,
  InvestimentoWeb,
  PecaWeb,
} from "@/lib/pdf-editorial/conteudo-web";
import { conteudoWebDoDocumento } from "@/lib/proposal-doc-render";
import { paletaDasFotos } from "@/lib/pdf-editorial/paleta-das-fotos";
import { fotosDaProposta, inventarioDeFotos, type FotoDaProposta } from "@/lib/proposta-fotos";
import { SITE } from "@/lib/site";
import { log } from "@/lib/logger";
import { mosaicoDoCapitulo, type FormaDaCelula } from "./mosaico";
import { textosWeb, type TextosWeb } from "./textos-web";
import { chaveDoGuardado, guardadoOuCalculado } from "./guardado";
import { capaWebEmAvif, type CapaWeb } from "./capa-web";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA ONLINE, PRONTA A DESENHAR (o protótipo dela de 23/10)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Junta três coisas, e nenhuma é nova:
 *   · o CONTEÚDO, do motor do PDF (`conteudoDoEditorial`) — textos, valores e
 *     as fotografias que o álbum escolhe para cada sítio;
 *   · os ENDEREÇOS das fotografias, assinados como sempre (`fotosDaProposta`),
 *     com a escada 400 / 1200 / original para o `srcset`;
 *   · os FUNDOS desfocados, pela rota `fundo/[id]`, com o arrastado do PDF.
 *
 * O caminho no armazenamento nunca sai daqui: a página só recebe endereços
 * assinados ou as rotas do link do casal, pelo `id` opaco do inventário.
 */

export interface ImagemWeb {
  /** A de 1200 px (ou a rota que a fabrica); o original, quando é a única. */
  src: string;
  srcSet?: string;
  avif?: string;
  /**
   * Só a capa: a AVIF grande, para o ecrã largo (ver `capa-web.ts`). No
   * telemóvel a capa fica com a `avif` de 1200 — a escolha dela, «Mais rápida».
   */
  avifGrande?: string;
  /** O ficheiro grande — é o que a lupa abre. */
  grande: string;
  lqip?: string;
  /** `object-position` do enquadramento dela. */
  posicao?: string;
  /** Largura ÷ altura. */
  aspecto: number;
}

export interface CelulaWeb {
  /** No computador (4 colunas) e no telemóvel (2) — ver `mosaico.ts`. */
  forma: FormaDaCelula;
  formaMovel: FormaDaCelula;
  imagem?: ImagemWeb;
  /** A célula de texto: o tema que abre o capítulo. */
  texto?: { sobre: string; titulo: string; nota: string };
}

export interface CapituloPronto {
  id: string;
  numero: string;
  nome: string;
  linha: string;
  nota: string;
  foto: ImagemWeb | null;
  fundo: string | null;
  fotoAEsquerda: boolean;
  mosaico: CelulaWeb[];
}

export interface PropostaWeb {
  idioma: IdiomaDaProposta;
  t: TextosWeb;
  casamento: boolean;
  lema: string;
  capa: {
    sobre: string;
    /** Num casamento, os dois nomes (o «&» desenha-se em itálico). */
    nomes: { um: string; outro?: string };
    partes: string[];
    fundo: ImagemWeb | null;
  };
  saudacao: string;
  proposta: {
    sobre: string;
    titulo: string;
    factos: { rotulo: string; valor: string }[];
    nota: string;
    foto: ImagemWeb | null;
    fundo: string | null;
  };
  servicos: {
    titulo: string;
    itens: { numero: string; nome: string; descricao: string; foto: ImagemWeb | null }[];
  } | null;
  paleta: {
    titulo: string;
    subtitulo: string;
    cores: string[];
    fotos: ImagemWeb[];
  } | null;
  capitulos: CapituloPronto[];
  /** A citação entra depois deste número de capítulos (a meio). */
  citacaoDepoisDe: number;
  citacao: { frase: string; assinatura: string; foto: ImagemWeb } | null;
  investimento: (Omit<InvestimentoWeb, "foto"> & { fundo: string | null }) | null;
  condicoes: {
    foto: ImagemWeb | null;
    blocos: { titulo: string; itens: { texto: string; forte?: string }[] }[];
  };
  fecho: {
    obrigado: string;
    foto: ImagemWeb | null;
    fundo: string | null;
    email: string;
    telefone: string;
    telefoneDisplay: string;
    whatsapp: string;
    mailto: string;
    validade: string;
  };
  /** As redes do rodapé (pedido dela, 25/10). O LinkedIn só existe se houver endereço. */
  redes: { instagram: string; linkedin?: string };
  pdf: string;
}

/** Os nomes da capa: «A & B» num casamento, com o «&» à parte. */
function nomesDaCapa(nomes: string, casamento: boolean) {
  const limpo = nomes.trim();
  if (!casamento) return { um: limpo };
  const partes = limpo.split(/\s+(?:&|e|and)\s+/i);
  return partes.length === 2 ? { um: partes[0], outro: partes[1] } : { um: limpo };
}

/** «Ana & Rui» → «Ana e Rui»; um nome só → o primeiro nome. */
function aQuemSeFala(nomes: string, casamento: boolean, idioma: IdiomaDaProposta) {
  const n = nomesDaCapa(nomes, casamento);
  const primeiro = (s: string) => s.trim().split(/\s+/)[0] ?? "";
  if (n.outro) return `${primeiro(n.um)} ${idioma === "en" ? "and" : "e"} ${primeiro(n.outro)}`;
  return casamento ? n.um : primeiro(n.um);
}

/** A capa com as suas AVIF (`capa-web.ts`), quando existem. */
function comACapaWeb(img: ImagemWeb | null, capa: CapaWeb | undefined): ImagemWeb | null {
  if (!img || !capa) return img;
  return {
    ...img,
    ...(capa.avif ? { avif: capa.avif } : {}),
    ...(capa.grande ? { avifGrande: capa.grande } : {}),
  };
}

/** Pontos de condições → blocos, um por título (o protótipo: um `<details>` cada). */
function blocosDasCondicoes(seccoes: { titulo: string; pecas: PecaWeb[] }[]) {
  const blocos: { titulo: string; itens: { texto: string; forte?: string }[] }[] = [];
  for (const s of seccoes) {
    let actual: (typeof blocos)[number] | null = null;
    for (const p of s.pecas) {
      if (p.tipo === "h3") {
        actual = { titulo: p.texto, itens: [] };
        blocos.push(actual);
        continue;
      }
      if (!actual) {
        actual = { titulo: s.titulo, itens: [] };
        blocos.push(actual);
      }
      actual.itens.push({ texto: p.texto, ...(p.forte ? { forte: p.forte } : {}) });
    }
  }
  return blocos.filter((b) => b.itens.length);
}

/**
 * As cores da paleta: das mesas, pelas miniaturas (leves). Calculadas uma vez
 * por proposta e guardadas (`guardado.ts`) — doze descargas e o `sharp` não
 * podem repetir-se a cada visita.
 */
function coresDaPaleta(
  proposalId: string,
  refs: readonly string[],
  porRef: ReadonlyMap<string, FotoDaProposta>,
): Promise<string[]> {
  const doze = refs.slice(0, 12);
  return guardadoOuCalculado(
    chaveDoGuardado("cores", proposalId, ...doze),
    async () => {
      const bytes = await Promise.all(
        doze.map(async (ref) => {
          const f = porRef.get(ref);
          const url = f?.miniatura ?? f?.media ?? f?.original;
          if (!url) return null;
          try {
            if (url.startsWith("data:")) return Buffer.from(url.split(",")[1] ?? "", "base64");
            const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
            return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
          } catch {
            return null;
          }
        }),
      );
      const validos: Buffer[] = [];
      for (const b of bytes) if (b && b.length > 0) validos.push(b);
      return validos.length ? paletaDasFotos(validos) : [];
    },
    (cores) => cores.length > 0,
  ).catch((e) => {
    log.warn("proposta online: a paleta não se deixou calcular", { erro: e });
    return [] as string[];
  });
}

/**
 * O conteúdo do documento (o motor do PDF, sem desenhar), calculado uma vez
 * por proposta e língua e guardado — é a parte cara de abrir a página.
 */
export function conteudoGuardado(
  proposta: { id: string; doc: ProposalDoc },
  idioma: IdiomaDaProposta,
): Promise<ConteudoWeb> {
  return guardadoOuCalculado(
    chaveDoGuardado("conteudo", proposta.id, idioma, JSON.stringify(proposta.doc)),
    () => conteudoWebDoDocumento(proposta.doc, idioma),
  );
}

/**
 * Deixa a página pronta logo no envio: o conteúdo, as cores e o retrato da
 * página inteira ficam guardados, e o primeiro clique do casal no email já não
 * espera por eles. Lê a proposta
 * tal como ficou gravada — a chave tem de ser a mesma que a página vai pedir.
 */
export async function aquecerPropostaWeb(proposalId: string): Promise<void> {
  const { getProposal } = await import("@/lib/proposals-store");
  const { idiomaDaProposta } = await import("@/lib/proposta-idioma");
  const { retratoDaPropostaWeb } = await import("./retrato");
  const p = await getProposal(proposalId);
  if (!p?.doc) return;
  // O retrato (`retrato.ts`): a página inteira fica pronta, e o primeiro
  // clique do casal é uma leitura. O código do link não entra nele.
  await retratoDaPropostaWeb({ id: p.id, doc: p.doc }, "aquecer", idiomaDaProposta(p));
}

export async function propostaWeb(
  proposta: { id: string; doc: ProposalDoc; sentAt?: string; createdAt?: string },
  token: string,
  idioma: IdiomaDaProposta,
): Promise<PropostaWeb> {
  const t = textosWeb(idioma);
  const [conteudo, assinadas] = await Promise.all([
    conteudoGuardado(proposta, idioma),
    fotosDaProposta(proposta.doc),
  ]);
  // A capa em AVIF (27/10): fabricada aqui uma vez por fotografia, porque
  // isto só corre quando a página é montada — no envio, ou sem retrato.
  const refDaCapa = conteudo.capa.fundo?.ref;
  let capa: CapaWeb | undefined;
  if (refDaCapa) {
    const i = inventarioDeFotos(proposta.doc).findIndex((e) => e.ref === refDaCapa);
    capa = await capaWebEmAvif(refDaCapa, i >= 0 ? assinadas[i]?.mediaAvif : undefined);
  }
  return montarPropostaWeb(conteudo, proposta, token, idioma, t, assinadas, capa);
}

/** A parte sem idas à rede — testável. */
export async function montarPropostaWeb(
  c: ConteudoWeb,
  proposta: { id: string; doc: ProposalDoc },
  token: string,
  idioma: IdiomaDaProposta,
  t: TextosWeb,
  assinadas: readonly FotoDaProposta[],
  capaWeb?: CapaWeb,
): Promise<PropostaWeb> {
  const base = `/api/proposta/${encodeURIComponent(token)}`;
  // O inventário e as assinadas estão pela mesma ordem.
  const inventario = inventarioDeFotos(proposta.doc);
  const porRef = new Map<string, FotoDaProposta>();
  inventario.forEach((e, i) => {
    const f = assinadas[i];
    if (f && !porRef.has(e.ref)) porRef.set(e.ref, f);
  });

  const imagem = (f: FotoWeb | null | undefined): ImagemWeb | null => {
    if (!f) return null;
    const a = porRef.get(f.ref);
    if (!a) return null;
    const rota = `${base}/foto/${encodeURIComponent(a.id)}?v=${encodeURIComponent(a.marca)}`;
    const media = a.media ?? (a.miniatura || !a.original?.startsWith("data:") ? rota : undefined);
    const grande = a.original ?? media ?? rota;
    const src = media ?? grande;
    const passos = [
      a.miniatura ? `${a.miniatura} 400w` : "",
      media ? `${media} 1200w` : "",
      a.original && !a.original.startsWith("data:") ? `${a.original} ${a.largura ?? 2000}w` : "",
    ].filter(Boolean);
    return {
      src,
      ...(passos.length > 1 ? { srcSet: passos.join(", ") } : {}),
      ...(a.mediaAvif ? { avif: a.mediaAvif } : {}),
      grande,
      ...(a.lqip ? { lqip: a.lqip } : {}),
      ...(f.foco ? { posicao: `${f.foco.x * 100}% ${f.foco.y * 100}%` } : {}),
      aspecto: f.aspecto,
    };
  };
  const fundo = (f: FotoWeb | null | undefined, brilho: number, angulo = -14) => {
    const a = f ? porRef.get(f.ref) : undefined;
    return a
      ? `${base}/fundo/${encodeURIComponent(a.id)}?b=${brilho}&a=${angulo}&v=${encodeURIComponent(a.marca)}`
      : null;
  };
  const outraQue = (evitar: FotoWeb | null, ...candidatas: (FotoWeb | null | undefined)[]) =>
    candidatas.find((f) => f && f.ref !== evitar?.ref) ?? evitar;

  // ── Capa e saudação ──
  const nomes = nomesDaCapa(c.capa.nomes, c.casamento);
  const capa = {
    sobre: t.capa(c.organizacao),
    nomes,
    partes: c.capa.partes,
    fundo: comACapaWeb(imagem(c.capa.fundo), capaWeb),
  };
  const saudacao = t.ola(aQuemSeFala(c.capa.nomes, c.casamento, idioma));

  // ── A proposta, sobre o fundo de OUTRA fotografia ──
  const todasDosCapitulos = c.capitulos.flatMap((k) => k.temas.flatMap((x) => x.fotos));
  const fundoDaProposta = outraQue(c.proposta.foto, c.capa.fundo, ...todasDosCapitulos);

  // ── Serviços ──
  const servicos = c.servicos?.itens.length
    ? {
        titulo: c.servicos.titulo,
        itens: c.servicos.itens.map((s, i) => ({
          numero: String(i + 1).padStart(2, "0"),
          nome: s.nome,
          descricao: s.descricao,
          foto: imagem(s.foto),
        })),
      }
    : null;

  // ── Paleta: as cinco cores e três fotografias (o painel alto + duas) ──
  const paleta = c.ambiente
    ? {
        titulo: c.ambiente.titulo,
        subtitulo: c.ambiente.subtitulo,
        cores: (await coresDaPaleta(proposta.id, c.ambiente.daPaleta, porRef)).slice(0, 5),
        fotos: [c.ambiente.painel, c.ambiente.fila[0], c.ambiente.fila[1]]
          .map(imagem)
          .filter((i): i is ImagemWeb => i !== null),
      }
    : null;

  // ── Capítulos: o ecrã de abertura e o mosaico ──
  const capitulos: CapituloPronto[] = c.capitulos.map((k, ci) => {
    const fotos = k.temas.flatMap((x) => x.fotos);
    const celulas = fotos.length ? mosaicoDoCapitulo(fotos.map((f) => f.aspecto)) : [];
    const abre = k.temas.find((x) => x.titulo) ?? k.temas[0];
    return {
      id: `cap${ci + 1}`,
      numero: String(k.numero).padStart(2, "0"),
      nome: k.nome,
      linha: k.linha,
      nota: k.nota,
      foto: imagem(k.fotos[0]),
      fundo: fundo(k.fotos[1] ?? k.fotos[0] ?? fotos[0], 0.62, [-14, -24, -8][ci % 3]),
      // O lado alterna: par → fotografia à esquerda (o protótipo).
      fotoAEsquerda: (ci + 1) % 2 === 0,
      mosaico: celulas.map((cel) =>
        cel.tipo === "texto"
          ? {
              forma: cel.forma,
              formaMovel: cel.formaMovel,
              texto: {
                sobre: (abre?.subtitulo || k.nome).toLocaleLowerCase(
                  idioma === "en" ? "en" : "pt-PT",
                ),
                titulo: abre?.titulo || k.nome,
                nota: abre?.nota ?? "",
              },
            }
          : {
              forma: cel.forma,
              formaMovel: cel.formaMovel,
              imagem: imagem(fotos[cel.indice!]) ?? undefined,
            },
      ),
    };
  });

  // ── Investimento ──
  const investimento = c.investimento
    ? (() => {
        const { foto, ...resto } = c.investimento;
        return { ...resto, fundo: fundo(foto ?? c.capa.fundo, 0.38, -10) };
      })()
    : null;

  // ── Condições ──
  const blocos = blocosDasCondicoes([...(c.cronograma ? [c.cronograma] : []), ...c.condicoes]);

  // ── Fecho ──
  const primeiro = aQuemSeFala(c.capa.nomes, c.casamento, idioma);
  const mensagem = t.mensagemWhatsApp(primeiro);
  const fecho = {
    obrigado: t.obrigado(primeiro),
    foto: imagem(c.fecho.fundo),
    fundo: fundo(outraQue(c.fecho.fundo, c.fotoDasCondicoes, c.capa.fundo), 0.32),
    email: SITE.email,
    telefone: SITE.phone,
    telefoneDisplay: SITE.phoneDisplay,
    whatsapp: `https://wa.me/${SITE.phone.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`,
    mailto: `mailto:${SITE.email}?subject=${encodeURIComponent(t.assuntoEmail(primeiro))}`,
    validade: c.fecho.validade,
  };

  return {
    idioma,
    t,
    casamento: c.casamento,
    redes: { instagram: SITE.instagram, linkedin: SITE.linkedin || undefined },
    lema: c.lema,
    capa,
    saudacao,
    proposta: {
      sobre: c.proposta.sobretitulo,
      titulo: c.proposta.titulo,
      factos: c.proposta.factos,
      nota: c.proposta.nota,
      foto: imagem(c.proposta.foto),
      fundo: fundo(fundoDaProposta, 0.42),
    },
    servicos,
    paleta,
    capitulos,
    citacaoDepoisDe: Math.ceil(capitulos.length / 2),
    citacao:
      c.citacao && imagem(c.citacao.foto)
        ? {
            frase: c.citacao.frase,
            assinatura: c.citacao.assinatura,
            foto: imagem(c.citacao.foto)!,
          }
        : null,
    investimento,
    condicoes: { foto: imagem(c.fotoDasCondicoes), blocos },
    fecho,
    pdf: `${base}/pdf`,
  };
}
