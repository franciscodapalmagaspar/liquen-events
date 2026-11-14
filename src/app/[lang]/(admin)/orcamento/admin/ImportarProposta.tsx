"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { VatMode } from "@/lib/proposal-doc";
import { eur } from "@/lib/money";
import { porqueFalhou } from "@/lib/erro-do-servidor";
import type { CampoImportado, PropostaImportada } from "@/lib/importar-proposta/mapear";
import type { Confianca } from "@/lib/importar-proposta/heuristicas";
import {
  corpoDoPedido,
  correccoesIniciais,
  montarDocumento,
  oQueFalta,
  type Correccoes,
} from "@/lib/importar-proposta/montar";
import {
  emagrecerParaEnvio,
  FicheiroIlegivel,
  MAX_BYTES_DA_IMPORTACAO,
} from "@/lib/importar-proposta/zip";
import {
  fotosDoFicheiro,
  MAX_BYTES_DO_FICHEIRO,
  MAX_FOTOS_POR_IMPORTACAO,
  alternarFoto,
  escolhaPorOmissao,
  fotosASubir,
  quantasNovas,
  type FotoDoFicheiro,
  type FotosLidas,
} from "@/lib/importar-proposta/no-navegador";
import { useToast } from "./Toast";
import { Button, EmCurso, Field, FolhaOuDialogo, Segmented } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { prepareImageWithThumb } from "./image-prep";
import { ArmazenamentoNoTravao, enviarFotoDaProposta } from "./enviar-foto-da-proposta";
import { fingerprintBlob } from "@/lib/theme-fingerprint";
import {
  classificarGuardadas,
  continuaGuardada,
  guardadasComDecisoes,
  type Decisao,
  type Duvida,
  type FotoAPerguntar,
} from "@/lib/importar-proposta/parecidas";
import {
  BYTES_POR_FOTO_NOVA,
  fotosQueCabem,
  type EspacoNoArmazenamento,
} from "@/lib/ocupacao-do-armazenamento-regras";
import { impressaoDoFicheiro, perguntarGuardadas } from "./fotos-ja-guardadas";
import { LADO_DA_CAPA, LADO_DA_FOTO_DE_PROPOSTA } from "@/lib/derivadas-medidas";
import ParecidasParaConfirmar from "./ParecidasParaConfirmar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «IMPORTAR PROPOSTA ANTIGA (WORD/POWERPOINT)»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (13/11): «a minha mãe tem propostas feitas em word ou power point
 * antes de ter o back office […] o sistema integrava […] e ficava com o cliente
 * no sistema».
 *
 * Três passos, e nada fica guardado antes do último:
 *
 *  1. ESCOLHER o ficheiro. O navegador tira-lhe as fotografias e manda ao
 *     servidor só o texto (`emagrecerParaEnvio` — o porquê está lá).
 *  2. REVER o que se leu: o cliente, a data, o local, os serviços, o
 *     orçamento, as fotografias. O que não se leu com certeza vem marcado, e
 *     os avisos dizem porquê. Os campos do pedido corrigem-se aqui; o resto
 *     corrige-se no «Fazer proposta», que é onde já se corrige tudo.
 *  3. CRIAR — pelos caminhos de sempre, por esta ordem: o pedido
 *     (`/api/orcamento/manual`), as fotografias escolhidas (reduzidas no
 *     navegador pelo `image-prep` e carregadas pelo `assets`, como no
 *     estúdio), e o rascunho (`proposta-rascunho`). Depois abre o «Fazer
 *     proposta». Não se envia NADA ao cliente.
 *
 * O ficheiro original nunca é guardado.
 */

/**
 * Quanto ocupa uma fotografia no armazenamento depois de reduzida — a foto
 * (1800 px, q0,82), a média (1200 px, WebP) e a miniatura (400 px, WebP).
 * Medido a 13/11 — ver `ocupacao-do-armazenamento-regras.ts`.
 */
const MB_POR_FOTO = BYTES_POR_FOTO_NOVA / 1_000_000;
/** Duas vias, como o estúdio (`UPLOAD_CONCURRENCY`). */
const VIAS = 2;

/**
 * ── «X JÁ EXISTEM — NÃO OCUPAM ESPAÇO» (13/11) ─────────────────────────────
 *
 * O resumo de cada fotografia do ficheiro (SHA-256 do original, como a
 * Biblioteca — `fingerprintBlob`, ~40 ms por foto) é calculado AQUI, antes de
 * preparar e subir, e perguntado ao servidor. As que já estão guardadas voltam
 * com o caminho (`tema:<…>` na Biblioteca) e entram na proposta assim: não se
 * preparam, não sobem um byte, não ocupam espaço e não contam para o tecto.
 *
 * Melhor esforço: sem contexto seguro (`crypto.subtle`) ou com a rota em baixo
 * volta um mapa vazio, e tudo sobe como antes — o servidor ainda apanha, ao
 * receber, a que já existir (`fotos-resumo.ts`).
 */
async function resumosDasFotos(fotos: readonly FotoDoFicheiro[]): Promise<{
  resumos: Map<string, string>;
  impressoes: Map<string, string>;
}> {
  const resumos = new Map<string, string>();
  const impressoes = new Map<string, string>();
  for (const f of fotos) {
    const r = await fingerprintBlob(f.ficheiro);
    if (r) resumos.set(f.caminho, r);
    // E pelo que mostra (13/11): a mesma foto noutro ficheiro — o PowerPoint
    // recomprime-as. Só serve para perguntar (`fotos-parecidas.ts`).
    const i = await impressaoDoFicheiro(f.ficheiro);
    if (i) impressoes.set(f.caminho, i);
  }
  return { resumos, impressoes };
}

function aPerguntar(
  caminhos: readonly string[],
  resumos: ReadonlyMap<string, string>,
  impressoes: ReadonlyMap<string, string>,
  /** caminho → o lado de que a foto precisa (ver `FotoAPerguntar.lado`). */
  lados: ReadonlyMap<string, number> = new Map(),
): FotoAPerguntar[] {
  return caminhos.map((caminho) => ({
    caminho,
    resumo: resumos.get(caminho) ?? null,
    impressao: impressoes.get(caminho) ?? null,
    lado: lados.get(caminho) ?? null,
  }));
}

/**
 * O lado de que cada foto precisa: o dela (pelo cabeçalho), até ao que se
 * guardaria — a capa a 2 200, um mood board a 1 800 (`image-prep.ts`). Uma
 * guardada mais pequena do que isto não a substitui.
 */
function ladosPedidos(
  fotos: readonly FotoDoFicheiro[],
  destinos: readonly { caminho: string; destino: "capa" | "moodboard" }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of fotos) {
    if (!f.largura || !f.altura) continue;
    const capa = destinos.find((d) => d.caminho === f.caminho)?.destino === "capa";
    out.set(
      f.caminho,
      Math.min(Math.max(f.largura, f.altura), capa ? LADO_DA_CAPA : LADO_DA_FOTO_DE_PROPOSTA),
    );
  }
  return out;
}

type Passo = "escolher" | "a-ler" | "rever" | "a-criar";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (q: Quote) => void;
}

const ROTULO_DA_CONFIANCA: Record<Confianca, string | null> = {
  alta: null,
  media: "Confirma",
  baixa: "Palpite — confirma",
  nada: "Não encontrado",
};

function Marca({ c }: { c: Confianca }) {
  const t = ROTULO_DA_CONFIANCA[c];
  if (!t) return null;
  return (
    <span
      className={`ml-2 text-caption font-medium ${
        c === "nada" ? "text-[var(--bo-text-muted)]" : "text-[var(--bo-aviso)]"
      }`}
    >
      {t}
    </span>
  );
}

function Rotulo({ texto, c }: { texto: string; c: Confianca }) {
  return (
    <>
      {texto}
      <Marca c={c} />
    </>
  );
}

function Titulo({ children, c }: { children: React.ReactNode; c?: Confianca }) {
  return (
    <h3 className="bo-eyebrow mb-2">
      {children}
      {c ? <Marca c={c} /> : null}
    </h3>
  );
}

const DE_FORA: Record<FotosLidas["deFora"][number]["motivo"], string> = {
  pequena: "logótipos ou ícones",
  formato: "desenhos num formato que o PDF não imprime",
  ilegivel: "ilegíveis",
};

export default function ImportarProposta({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const idFicheiro = useId();
  const [passo, setPasso] = useState<Passo>("escolher");
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [proposta, setProposta] = useState<PropostaImportada | null>(null);
  const [c, setC] = useState<Correccoes | null>(null);
  const [fotos, setFotos] = useState<FotoDoFicheiro[]>([]);
  const [deFora, setDeFora] = useState<FotosLidas["deFora"]>([]);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  /** caminho no ficheiro → resumo do original (`fingerprintBlob`). */
  const [resumos, setResumos] = useState<Map<string, string>>(new Map());
  /** caminho no ficheiro → impressão visual (`impressao-visual.ts`). */
  const [impressoes, setImpressoes] = useState<Map<string, string>>(new Map());
  /** caminho no ficheiro → onde a fotografia JÁ está guardada (`tema:<…>`). */
  const [existentes, setExistentes] = useState<Map<string, string>>(new Map());
  /** As parecidas da zona cinzenta, e o que ela respondeu a cada uma. */
  const [duvidas, setDuvidas] = useState<Map<string, Duvida>>(new Map());
  const [decisoes, setDecisoes] = useState<Map<string, Decisao>>(new Map());
  const [espaco, setEspaco] = useState<EspacoNoArmazenamento | null>(null);
  const guardadas = useMemo(
    () => guardadasComDecisoes(existentes, duvidas, decisoes),
    [existentes, duvidas, decisoes],
  );
  const jaGuardadas = useMemo(() => new Set(guardadas.keys()), [guardadas]);
  /** Quantas novas cabem: o tecto, ou menos se o espaço até ao travão não chegar. */
  const tecto = fotosQueCabem(espaco, MAX_FOTOS_POR_IMPORTACAO);
  const [progresso, setProgresso] = useState<{ titulo: string; feito?: number; total?: number }>({
    titulo: "",
  });
  const [tentouCriar, setTentouCriar] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * ── O QUE JÁ FICOU FEITO, PARA UM SEGUNDO CLIQUE NÃO O REPETIR ───────────
   *
   * Se o pedido já foi criado e uma etapa seguinte falha (a rede cai a
   * guardar o rascunho), o ecrã dizia «Não foi possível criar o pedido» — e
   * o clique seguinte criava um SEGUNDO pedido e voltava a carregar as
   * fotografias para o armazenamento. Agora guarda-se o pedido e as
   * fotografias já carregadas, e o clique seguinte continua daí.
   */
  const feito = useRef<{ quote: Quote; carregadas: Map<string, string> } | null>(null);
  const [pedidoCriado, setPedidoCriado] = useState<Quote | null>(null);

  // As miniaturas são URLs do próprio navegador — libertam-se ao sair.
  const urls = useMemo(
    () => new Map(fotos.map((f) => [f.caminho, URL.createObjectURL(f.ficheiro)])),
    [fotos],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  function recomecar() {
    feito.current = null;
    setPedidoCriado(null);
    setPasso("escolher");
    setErro(null);
    setNome("");
    setProposta(null);
    setC(null);
    setFotos([]);
    setDeFora([]);
    setResumos(new Map());
    setImpressoes(new Map());
    setExistentes(new Map());
    setDuvidas(new Map());
    setDecisoes(new Map());
    setEspaco(null);
    setEscolhidas(new Set());
    setTentouCriar(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function fechar() {
    if (passo === "a-criar") return;
    // O pedido já existe (o rascunho é que ficou por guardar): fechar leva-o
    // na mesma para a lista, para não ficar um pedido que ninguém vê.
    const criado = feito.current?.quote;
    recomecar();
    if (criado) onCreated(criado);
    onClose();
  }

  async function ler(ficheiro: File) {
    setErro(null);
    if (ficheiro.size > MAX_BYTES_DO_FICHEIRO) {
      setErro(
        "Este ficheiro tem mais de 300 MB. Guarda uma cópia com as imagens comprimidas e importa essa.",
      );
      return;
    }
    setPasso("a-ler");
    setNome(ficheiro.name);
    try {
      const bytes = new Uint8Array(await ficheiro.arrayBuffer());
      let magro: Uint8Array;
      try {
        magro = emagrecerParaEnvio(bytes);
      } catch (e) {
        // O servidor é que diz o que é (um PDF, um .doc antigo…): manda-se o
        // início do ficheiro, que é onde estão os «bytes mágicos».
        if (!(e instanceof FicheiroIlegivel)) throw e;
        magro = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
      }
      if (magro.length > MAX_BYTES_DA_IMPORTACAO) {
        throw new Error("O texto deste ficheiro é grande demais para importar.");
      }
      const form = new FormData();
      form.append("ficheiro", new File([magro as BlobPart], ficheiro.name));
      const res = await fetch("/api/orcamento/importar", { method: "POST", body: form });
      const dados = await res.json().catch(() => null);
      if (!res.ok || !dados?.proposta) {
        throw new Error(dados?.error || "Não foi possível ler este ficheiro.");
      }
      const p = dados.proposta as PropostaImportada;
      const lidas = await fotosDoFicheiro(
        bytes,
        p.fotos.map((f) => f.caminho),
      );
      // Antes de escolher: quais destas já estão guardadas (não gastam tecto).
      const { resumos: r, impressoes: im } = await resumosDasFotos(lidas.fotos);
      const lados = ladosPedidos(lidas.fotos, p.fotos);
      const pergunta = aPerguntar(
        lidas.fotos.map((f) => f.caminho),
        r,
        im,
        lados,
      );
      const { resposta, espaco: e } = await perguntarGuardadas(pergunta);
      const { existentes: ja, duvidas: d } = classificarGuardadas(pergunta, resposta);
      setProposta(p);
      setC(correccoesIniciais(p));
      setFotos(lidas.fotos);
      setDeFora(lidas.deFora);
      setResumos(r);
      setImpressoes(im);
      setExistentes(ja);
      setDuvidas(d);
      setEspaco(e);
      setEscolhidas(
        new Set(
          escolhaPorOmissao(
            p.fotos,
            new Set(lidas.fotos.map((f) => f.caminho)),
            new Set(ja.keys()),
            fotosQueCabem(e, MAX_FOTOS_POR_IMPORTACAO),
          ),
        ),
      );
      setPasso("rever");
    } catch (e) {
      setPasso("escolher");
      setErro(porqueFalhou(e, "Não foi possível ler este ficheiro. Verifica a ligação."));
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const falta = c ? oQueFalta(c) : [];
  const set = <K extends keyof Correccoes>(k: K, v: Correccoes[K]) =>
    setC((x) => (x ? { ...x, [k]: v } : x));

  function alternar(caminho: string) {
    const n = alternarFoto(escolhidas, caminho, jaGuardadas, tecto);
    if (n) setEscolhidas(n);
    else {
      toast(
        `No máximo ${tecto} fotografias novas nesta importação — tira uma para pôr outra.`,
        "info",
      );
    }
  }

  async function criar() {
    if (!proposta || !c) return;
    setTentouCriar(true);
    if (falta.length) return;
    setPasso("a-criar");
    try {
      // 1. O pedido, pelo caminho de sempre — só se ainda não foi criado.
      if (!feito.current) {
        setProgresso({ titulo: "A criar o pedido" });
        const res = await fetch("/api/orcamento/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpoDoPedido(proposta, c, nome)),
        });
        const dados = await res.json().catch(() => null);
        if (!res.ok || !dados?.quote) {
          throw new Error(dados?.error || "Não foi possível criar o pedido.");
        }
        feito.current = { quote: dados.quote as Quote, carregadas: new Map() };
        setPedidoCriado(dados.quote as Quote);
      }
      const { quote, carregadas } = feito.current;

      // 2. As fotografias escolhidas, reduzidas no navegador e carregadas como
      // no estúdio. Uma que falhe não deita fora as outras.
      // As que já subiram numa tentativa anterior não sobem outra vez.
      // As que já estão guardadas entram pelo caminho que já têm — zero bytes.
      for (const f of fotos) {
        const ref = guardadas.get(f.caminho);
        if (ref && escolhidas.has(f.caminho)) carregadas.set(f.caminho, ref);
      }
      const aSubir = fotosASubir(fotos, escolhidas, jaGuardadas, tecto);
      const porSubir = aSubir.filter((f) => !carregadas.has(f.caminho));
      /** As que têm de ficar na pasta do pedido (as novas e as que morreram). */
      const deviamSubir: FotoDoFicheiro[] = [...aSubir];
      let total = aSubir.length;
      let feitas = aSubir.length - porSubir.length;
      let porque = "";
      setProgresso({ titulo: "A carregar as fotografias", feito: feitas, total });
      let falhasAgora = 0;
      // As que subiram NESTA importação. `carregadas` não serve para isto: já
      // traz as que estavam guardadas, e a paragem nunca disparava.
      let subiramAgora = 0;
      // O armazenamento chegou ao travão (507): pára tudo, e diz-se quantas
      // ficaram de fora.
      let noTravao = false;
      const subir = async (lista: readonly FotoDoFicheiro[]) => {
        let proxima = 0;
        const via = async () => {
          for (;;) {
            const i = proxima++;
            if (i >= lista.length) return;
            // Três falhas sem nenhuma a passar é o armazenamento que não está
            // lá (não uma foto má): parar, em vez de tentar as outras.
            if (falhasAgora >= 3 && subiramAgora === 0) return;
            if (noTravao) return;
            const f = lista[i];
            try {
              // A capa guarda-se como capa (2 200 px — a capa web grande pede-os).
              const capa = proposta.fotos.find((x) => x.caminho === f.caminho)?.destino === "capa";
              const preparada = await prepareImageWithThumb(
                f.ficheiro,
                capa ? "cover" : "board",
                "proposta",
              );
              const im = await enviarFotoDaProposta(quote.id, {
                ...preparada,
                resumo: resumos.get(f.caminho) ?? null,
                importacao: true,
              });
              carregadas.set(f.caminho, im.path);
              subiramAgora++;
            } catch (e) {
              falhasAgora++;
              if (e instanceof ArmazenamentoNoTravao) noTravao = true;
              if (!porque && e instanceof Error) porque = e.message;
            } finally {
              feitas++;
              setProgresso({ titulo: "A carregar as fotografias", feito: feitas, total });
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(VIAS, lista.length) }, via));
      };
      await subir(porSubir);

      // 2b. As da Biblioteca outra vez, mesmo antes de gravar: entre ler o
      // ficheiro e chegar aqui podem ter passado minutos, e a foto pode ter
      // sido apagada ou movida. Um `tema:` morto no rascunho é uma célula
      // vazia; a que já não está sobe como nova. Não se conseguir confirmar
      // conta como morta — guardar uma cópia é melhor do que perder a foto.
      const daBiblioteca = fotos.filter(
        (f) => escolhidas.has(f.caminho) && carregadas.get(f.caminho)?.startsWith("tema:"),
      );
      if (daBiblioteca.length > 0) {
        // Pelo resumo E pela impressão: uma escolhida por ser parecida
        // continua viva se a mesma guardada voltar (`continuaGuardada`).
        const pergunta = aPerguntar(
          daBiblioteca.map((f) => f.caminho),
          resumos,
          impressoes,
          ladosPedidos(daBiblioteca, proposta.fotos),
        );
        const { resposta } = await perguntarGuardadas(pergunta);
        const mortas: FotoDoFicheiro[] = [];
        for (const [i, f] of daBiblioteca.entries()) {
          const ref = carregadas.get(f.caminho) ?? "";
          if (!continuaGuardada(ref, pergunta[i], resposta)) {
            carregadas.delete(f.caminho);
            mortas.push(f);
          }
        }
        if (mortas.length > 0) {
          total += mortas.length;
          deviamSubir.push(...mortas);
          setProgresso({ titulo: "A carregar as fotografias", feito: feitas, total });
          await subir(mortas);
        }
      }

      // 3. O rascunho do estúdio — o que o «Fazer proposta» abre.
      setProgresso({ titulo: "A guardar o rascunho da proposta" });
      const doc = montarDocumento(proposta, c, carregadas, nome);
      const r = await fetch(`/api/orcamento/${quote.id}/proposta-rascunho`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, baseUpdatedAt: null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(typeof d?.erro === "string" ? d.erro : "");
      }
      const subiram = deviamSubir.filter((f) => carregadas.has(f.caminho)).length;
      if (noTravao) {
        const n = deviamSubir.length - subiram;
        toast(
          `O armazenamento chegou ao travão (90% do plano): ${
            n === 1 ? "uma fotografia ficou" : `${n} fotografias ficaram`
          } de fora. As outras estão na proposta.`,
          "error",
        );
      } else if (subiram === 0 && deviamSubir.length > 0) {
        toast(
          `O pedido e a proposta foram criados, mas nenhuma fotografia carregou${porque ? ` (${porque})` : ""}. Podes juntá-las no Fazer proposta.`,
          "error",
        );
      } else if (subiram < deviamSubir.length) {
        const n = deviamSubir.length - subiram;
        toast(
          n === 1
            ? "Uma fotografia não carregou. As outras estão na proposta."
            : `${n} fotografias não carregaram. As outras estão na proposta.`,
          "error",
        );
      } else {
        toast("Proposta importada. Revê tudo antes de gerar o PDF.", "success");
      }
      recomecar();
      onCreated(quote);
      onClose();
    } catch (e) {
      setPasso("rever");
      if (feito.current) {
        // A verdade: o pedido EXISTE; o que falta é o rascunho.
        const porque = e instanceof Error && e.message ? ` (${e.message})` : "";
        toast(
          `O pedido foi criado; falta guardar o rascunho da proposta${porque}. Carrega em «Continuar a importação» — não cria outro pedido.`,
          "error",
        );
      } else {
        toast(porqueFalhou(e, "Não foi possível criar o pedido. Verifica a ligação."), "error");
      }
    }
  }

  const deForaPorMotivo = deFora.reduce<Record<string, number>>((acc, d) => {
    acc[d.motivo] = (acc[d.motivo] ?? 0) + 1;
    return acc;
  }, {});
  const acimaDoLimite = Math.max(0, fotos.length - jaGuardadas.size - tecto);
  const novasEscolhidas = quantasNovas(escolhidas, jaGuardadas);
  const jaEscolhidas = escolhidas.size - novasEscolhidas;
  const conf = (k: CampoImportado): Confianca => proposta?.confianca[k] ?? "nada";

  return (
    <FolhaOuDialogo
      aberto={open}
      onFechar={fechar}
      sobretitulo="Proposta antiga"
      titulo="Importar de Word ou PowerPoint"
      descricao={
        passo === "rever"
          ? `Lido de «${nome}». Nada está guardado ainda.`
          : "O sistema lê o documento e prepara o pedido e a proposta. Nada é enviado ao cliente."
      }
      largura="lg"
      nivel={86}
      bloqueado={passo === "a-criar"}
      accoesQuebram
      accoes={
        passo === "rever" ? (
          <>
            {!pedidoCriado && (
              <Button variant="ghost" onClick={recomecar} className="sm:ml-auto">
                Outro ficheiro
              </Button>
            )}
            {/* No telemóvel o botão toma a linha toda: o nome é comprido, e
                cortado a meio não se lê. */}
            <Button
              variant="primary"
              onClick={criar}
              iconRight={<span aria-hidden="true">→</span>}
              className="basis-full sm:basis-auto"
            >
              {pedidoCriado ? "Continuar a importação" : "Criar o pedido e abrir no Fazer proposta"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={fechar} disabled={passo === "a-criar"}>
            Cancelar
          </Button>
        )
      }
    >
      {passo === "escolher" && (
        <div className="flex flex-col gap-4">
          <label
            htmlFor={idFicheiro}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--bo-hairline-strong)] bg-[var(--bo-surface-sunken)] px-4 py-10 text-center hover:border-[var(--bo-accent)] ${ESTADO}`}
          >
            <span className="text-callout font-semibold text-[var(--bo-text)]">
              Escolher o ficheiro da proposta
            </span>
            <span className="text-footnote text-[var(--bo-text-muted)]">
              Word (.docx) ou PowerPoint (.pptx)
            </span>
            <input
              ref={inputRef}
              id={idFicheiro}
              type="file"
              accept=".docx,.pptx,.dotx,.potx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void ler(f);
              }}
            />
          </label>
          {erro && (
            <p
              role="alert"
              className="rounded-xl border border-[var(--bo-perigo)]/25 bg-[var(--bo-perigo-lavagem)]/50 px-4 py-3 text-footnote text-[var(--bo-perigo)]"
            >
              {erro}
            </p>
          )}
          <ul className="flex list-disc flex-col gap-1 pl-5 text-footnote text-[var(--bo-text-muted)]">
            <li>
              O ficheiro não fica guardado: só o pedido, as fotografias que escolheres e o rascunho.
            </li>
            <li>
              As fotografias são reduzidas antes de subir, e sobem no máximo{" "}
              {MAX_FOTOS_POR_IMPORTACAO} novas (menos, se o armazenamento estiver perto do travão).
              As que já estão guardadas — o mesmo ficheiro, ou a mesma fotografia noutro ficheiro —
              não sobem nem ocupam espaço.
            </li>
            <li>
              Os Word e PowerPoint antigos (.doc, .ppt) têm de ser guardados primeiro como .docx ou
              .pptx.
            </li>
          </ul>
        </div>
      )}

      {passo === "a-ler" && <EmCurso titulo={`A ler «${nome}»`} estimadoMs={2500} />}

      {passo === "a-criar" && (
        <EmCurso
          titulo={progresso.titulo}
          feito={progresso.feito}
          total={progresso.total}
          nota="Não feches esta janela."
        />
      )}

      {passo === "rever" && proposta && c && (
        <div className="flex min-w-0 flex-col gap-7">
          {pedidoCriado && (
            <p
              role="status"
              className="rounded-xl border border-[var(--bo-aviso-tom)]/25 bg-[var(--bo-aviso-tom)]/[0.06] px-4 py-3 text-footnote text-[var(--bo-text)]"
            >
              <span className="font-semibold text-[var(--bo-aviso)]">
                O pedido de «{pedidoCriado.name}» já foi criado.
              </span>{" "}
              Falta guardar o rascunho da proposta. «Continuar a importação» acaba o que falta, sem
              criar outro pedido nem voltar a carregar as fotografias que já subiram. Os campos do
              pedido já não mudam aqui — muda-os no próprio pedido.
            </p>
          )}
          {proposta.avisos.length > 0 && (
            <div className="rounded-xl border border-[var(--bo-aviso-tom)]/25 bg-[var(--bo-aviso-tom)]/[0.06] px-4 py-3">
              <p className="text-footnote font-semibold text-[var(--bo-aviso)]">A confirmar</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                {proposta.avisos.map((a) => (
                  <li key={a} className="text-footnote text-[var(--bo-text)]">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="@container">
            <Titulo>O pedido</Titulo>
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 @min-[26rem]:grid-cols-2">
              <Field
                variant="underline"
                containerClassName="@min-[26rem]:col-span-2"
                label={<Rotulo texto="Nome do cliente" c={conf("clientNames")} />}
                required
                value={c.clientNames}
                onChange={(e) => set("clientNames", e.target.value)}
                error={
                  tentouCriar && !c.clientNames.trim() ? "Escreve o nome do cliente." : undefined
                }
                placeholder="Ana & João"
              />
              <Field
                variant="underline"
                label={<Rotulo texto="E-mail" c={conf("email")} />}
                type="email"
                value={c.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="email@exemplo.com"
              />
              <Field
                variant="underline"
                label={<Rotulo texto="Data do evento" c={conf("eventDate")} />}
                type="date"
                value={c.dataIso}
                onChange={(e) => set("dataIso", e.target.value)}
              />
              <Field
                variant="underline"
                label={<Rotulo texto="Local" c={conf("location")} />}
                value={c.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Espaço / cidade"
              />
              <Field
                variant="underline"
                label={<Rotulo texto="Tipo de evento" c={conf("eventType")} />}
                value={c.eventType}
                onChange={(e) => set("eventType", e.target.value)}
                placeholder="Casamento"
              />
              <Field
                variant="underline"
                label={<Rotulo texto="Nº de convidados" c={conf("guests")} />}
                type="number"
                min={0}
                value={c.guests}
                onChange={(e) => set("guests", e.target.value)}
              />
            </div>
          </section>

          <section>
            <Titulo c={conf("servicos")}>Serviços</Titulo>
            {proposta.serviceGroups.length === 0 ? (
              <p className="text-footnote text-[var(--bo-text-muted)]">
                Nenhum — escreves os Serviços no Fazer proposta.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {proposta.serviceGroups.map((g) => (
                  <li key={`${g.letter}${g.title}`} className="min-w-0">
                    <p className="text-callout font-semibold text-[var(--bo-text)]">
                      {g.letter} {g.title}
                    </p>
                    <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
                      {g.items.map((i, k) => (
                        <li key={k} className="break-words text-footnote text-[var(--bo-tinta-72)]">
                          <span className="font-medium text-[var(--bo-text)]">{i.label}</span>
                          {i.desc ? ` — ${i.desc}` : ""}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="@container">
            <Titulo c={conf("total")}>Orçamento</Titulo>
            {proposta.budgetItems.length > 0 && (
              <ul className="mb-4 flex flex-col divide-y divide-[var(--bo-hairline)] rounded-xl border border-[var(--bo-hairline)]">
                {proposta.budgetItems.map((item, k) => (
                  <li
                    key={k}
                    className="flex items-baseline justify-between gap-3 px-3 py-2 text-footnote"
                  >
                    <span className="min-w-0 break-words text-[var(--bo-text)]">{item}</span>
                    {proposta.budgetAmounts[k] !== null && (
                      <span className="shrink-0 tabular-nums text-[var(--bo-tinta-72)]">
                        {eur(proposta.budgetAmounts[k] as number)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-1 items-end gap-x-4 gap-y-4 @min-[26rem]:grid-cols-2">
              <Field
                variant="underline"
                label="Valor total"
                inputMode="decimal"
                value={c.total}
                onChange={(e) => set("total", e.target.value)}
                placeholder={proposta.somaDasLinhas ? eur(proposta.somaDasLinhas) : "Sem total"}
                hint={
                  !proposta.totalAmount && proposta.somaDasLinhas > 0 && !c.total ? (
                    <button
                      type="button"
                      onClick={() =>
                        set("total", proposta.somaDasLinhas.toFixed(2).replace(".", ","))
                      }
                      className={`font-semibold text-[var(--bo-accent)] underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                    >
                      Usar a soma das linhas ({eur(proposta.somaDasLinhas)})
                    </button>
                  ) : undefined
                }
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-footnote font-semibold text-[var(--bo-text-muted)]">
                  IVA
                  <Marca c={c.total.trim() ? (c.totalVatMode ? conf("iva") : "nada") : "alta"} />
                </span>
                <Segmented<VatMode | "">
                  ariaLabel="O total inclui IVA?"
                  size="sm"
                  value={c.totalVatMode ?? ""}
                  onChange={(v) => set("totalVatMode", v === "" ? null : v)}
                  options={[
                    { value: "acrescer", label: "Acresce IVA" },
                    { value: "incluido", label: "IVA incluído" },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* A grelha mede a CAIXA (`@container`), não a janela — ver
              `Cortes.contrato.test.ts`. */}
          <section className="@container">
            <Titulo>Fotografias</Titulo>
            {fotos.length === 0 ? (
              <p className="text-footnote text-[var(--bo-text-muted)]">
                Não há fotografias neste documento.
              </p>
            ) : (
              <>
                <p className="mb-3 text-footnote text-[var(--bo-text-muted)]">
                  {escolhidas.size} de {fotos.length} escolhidas
                  {jaEscolhidas > 0 &&
                    ` · ${jaEscolhidas === 1 ? "1 já existe" : `${jaEscolhidas} já existem`} — não ocupam espaço`}
                  {novasEscolhidas > 0
                    ? ` · ${novasEscolhidas === 1 ? "a nova ocupa" : `as ${novasEscolhidas} novas ocupam`} cerca de ${Math.max(1, Math.round(novasEscolhidas * MB_POR_FOTO))} MB no armazenamento`
                    : " · nada novo no armazenamento"}
                  . Toca numa fotografia para a tirar ou voltar a pôr.
                </p>
                {espaco?.conhecido && (
                  <p className="-mt-2 mb-3 text-footnote text-[var(--bo-text-muted)]">
                    Sobram {Math.round(espaco.sobra / 1_000_000)} MB no armazenamento até ao travão
                    (90% do plano) — cabem cerca de {fotosQueCabem(espaco, Infinity)} fotografias
                    novas.
                  </p>
                )}
                <ParecidasParaConfirmar
                  duvidas={duvidas}
                  decisoes={decisoes}
                  urls={urls}
                  onDecidir={(caminho, d) => setDecisoes((m) => new Map(m).set(caminho, d))}
                />
                {novasEscolhidas >= tecto && fotos.length - jaGuardadas.size > tecto && (
                  <p role="status" className="-mt-2 mb-3 text-footnote text-[var(--bo-aviso)]">
                    Máximo {tecto} novas — tira uma para pôr outra.
                  </p>
                )}
                <ul className="grid grid-cols-3 gap-2 @min-[30rem]:grid-cols-4 @min-[44rem]:grid-cols-6">
                  {fotos.map((f) => {
                    const on = escolhidas.has(f.caminho);
                    const ondeVai = proposta.fotos.find((x) => x.caminho === f.caminho);
                    return (
                      <li key={f.caminho} className="min-w-0">
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => alternar(f.caminho)}
                          className={`group relative block aspect-square w-full overflow-hidden rounded-lg border ${
                            on
                              ? "border-[var(--bo-accent)]"
                              : "border-[var(--bo-hairline)] opacity-50"
                          } ${ESTADO} ${PRESSAO}`}
                          title={ondeVai?.destino === "capa" ? "Capa" : ondeVai?.seccao}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- URL do próprio navegador */}
                          <img
                            src={urls.get(f.caminho)}
                            alt={
                              ondeVai?.destino === "capa"
                                ? "Fotografia da capa"
                                : `Fotografia de «${ondeVai?.seccao ?? ""}»`
                            }
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-[var(--bo-surface)]/90 px-1.5 py-0.5 text-left text-caption2 text-[var(--bo-text)]">
                            {on
                              ? ondeVai?.destino === "capa"
                                ? "Capa"
                                : ondeVai?.seccao
                              : "Fica de fora"}
                            {on && jaGuardadas.has(f.caminho) && " · já guardada"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {(acimaDoLimite > 0 || deFora.length > 0) && (
              <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-footnote text-[var(--bo-text-muted)]">
                {acimaDoLimite > 0 && (
                  <li>
                    O documento tem {fotos.length} fotografias; ficaram ligadas a capa e as
                    primeiras de cada secção, até {tecto} novas, que é o máximo nesta importação
                    (para não passar do travão do armazenamento). As outras juntam-se depois no
                    Fazer proposta, se quiseres.
                  </li>
                )}
                {Object.entries(deForaPorMotivo).map(([motivo, n]) => (
                  <li key={motivo}>
                    {n === 1 ? "Ficou de fora uma imagem" : `Ficaram de fora ${n} imagens`}:{" "}
                    {DE_FORA[motivo as keyof typeof DE_FORA]}.
                  </li>
                ))}
              </ul>
            )}
          </section>

          {proposta.notasInternas && (
            <p className="text-footnote text-[var(--bo-text-muted)]">
              O texto corrido que não coube em nenhum campo vai para as notas internas da proposta
              (nunca saem no PDF).
            </p>
          )}

          {tentouCriar && falta.length > 0 && (
            <p role="alert" className="text-footnote font-semibold text-[var(--bo-perigo)]">
              Falta {falta.join(" e ")}.
            </p>
          )}
        </div>
      )}
    </FolhaOuDialogo>
  );
}
