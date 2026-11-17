"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { servirUmaVez, type PedidoDaPaleta } from "./procura-em-tudo";
import { useMaisAoDescer } from "./useMaisAoDescer";
import type { ThemeCopyMode, ThemeImage, ThemeSummary } from "@/lib/theme-types";
import PhotoLightbox from "./PhotoLightbox";
import ThemeCopyDialog, { type ThemeCopyOutcome } from "./ThemeCopyDialog";
import FundirTemas, { type ThemeMergeOutcome } from "./FundirTemas";
import { temasParecidos } from "@/lib/temas-parecidos";
import { downloadMany, downloadName } from "./photo-download";
import { guardarBlob, useDescarga } from "./ui/descarregar";
import { THEME_PAGE_SIZE, normalizedThemeName } from "@/lib/theme-types";
import { textoDaRecusa, tituloDaRecusa } from "@/lib/erro-do-servidor";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { useDepoisDeApagar, useDepoisDeApagarVarios } from "./ui/depois-de-apagar";
import { Button, Card, EmptyState, emGrupos, PerguntaDestrutiva, type AccaoDeItem } from "./ui";
import { esquecerBiblioteca } from "./theme-picker-cache";
import BibliotecaRevisao from "./BibliotecaRevisao";
import { capaDaFoto, comCapa, type CapaDoCartao } from "./capa-do-cartao";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { useSaidaDeUmSo } from "./ui/saida";
import { paginaDaResposta, usarAdiantada } from "./prefetch-de-tema";
import { NomesPorArrumar } from "./NomesPorArrumar";
import { MenuDeContexto, type PedidoDeMenu } from "./MenuDeContexto";
import {
  AMBITOS,
  ambitosDisponiveis,
  filtrarPorAmbito,
  type Ambito,
  type DadosDeUso,
} from "@/lib/temas-filtros";
import { porqueFalhou, porqueRebentou, type Falha } from "@/lib/porque-falhou";
import { porqueNaoLeu, porqueNaoLeuDoErro, type LeituraFalhada } from "@/lib/porque-nao-leu";
import ListaDeTemas from "./ListaDeTemas";
import { fotoPelaTecla } from "@/lib/temas-grelha";
import { bibliotecaAlterada } from "./biblioteca-alterada";
import { escreverCarga, fotosQueViajam, type CargaDeFotos } from "@/lib/temas-arrasto";
import { vestirOArrasto } from "./_temas/arrasto";
import { ABOVE_FOLD, Photo, objectUrl, revokeUrl } from "./_temas/FotoDaGrelha";
import { AccaoEmBloco, mergePage } from "@/lib/temas/listas-de-fotos";
import { fraseDeEliminar, photoCountLabel } from "@/lib/temas/textos-dos-temas";
import { Densidade, Ordem, contarFotosDaBiblioteca, ordenarTemas } from "@/lib/temas/ordem";
import { COLUNAS, lerDensidade, lerOrdem } from "./_temas/preferencias-da-biblioteca";
import {
  FolderIcon,
  ICONE_ABRIR,
  ICONE_ADICIONAR,
  ICONE_CAPA,
  ICONE_RENOMEAR,
} from "./_temas/icones";
import { GrelhaDaPasta } from "./_temas/GrelhaDaPasta";
import { BarraDaSeleccaoDaPasta } from "./_temas/BarraDaSeleccaoDaPasta";
import { AvisosDaPasta } from "./_temas/AvisosDaPasta";
import { CabecalhoDaPasta } from "./_temas/CabecalhoDaPasta";
import {
  Ahead,
  Failure,
  FolderState,
  PedidoAPasta,
  Pending,
  Skipped,
  ThumbJob,
} from "./_temas/tipos-da-pasta";
import { teclaDeMenu } from "./ui/tecla-de-menu";
import { ListaDaBiblioteca } from "./_temas/ListaDaBiblioteca";
import { NovoTema } from "./_temas/NovoTema";
import { BarraDaBiblioteca } from "./_temas/BarraDaBiblioteca";
import { plural } from "@/lib/plural";
import { useArrumacaoDaPasta } from "./_temas/useArrumacaoDaPasta";
import { useMoverEApagarFotos } from "./_temas/useMoverEApagarFotos";
import { PREFETCH_DELAY_MS } from "./_temas/tectos-da-pasta";
import { useSeleccaoDaPasta } from "./_temas/useSeleccaoDaPasta";
import { useRepeticaoDoEnvio } from "./_temas/useRepeticaoDoEnvio";
import { useMiniaturasDaPasta } from "./_temas/useMiniaturasDaPasta";
import { useEnvioDeFotos } from "./_temas/useEnvioDeFotos";

/**
 * Biblioteca de Temas — o sítio onde o estúdio guarda, uma vez, as fotos de
 * inspiração que usa em quase todos os casamentos ("Itália", "Terracotta",
 * "Branco & Verde"…).
 *
 * Depois, ao montar uma proposta, o estúdio abre "Da biblioteca" no mood board,
 * escolhe o tema e as fotos entram na proposta — sem ir ao Pinterest nem
 * procurar pastas no computador.
 *
 * Ecrã em dois níveis: a lista de temas (cartões com capa + nº de fotos) e,
 * ao abrir um, a pasta desse tema com carregamento e remoção de fotos.
 *
 * ESTE ECRÃ É DIMENSIONADO PARA MILHARES DE FOTOS. As três regras que o mantêm
 * utilizável com 8 temas e 4000 fotos:
 *
 *  1. A grelha mostra MINIATURAS (~400 px, ~40 KB), nunca os originais de
 *     3000 px — e nunca mais do que uma página de cada vez.
 *  2. Só se pede ao servidor a página que está à vista: assinar URLs é o passo
 *     caro, e assinar 4000 para mostrar 60 era o que fazia um tema demorar.
 *  3. Nada acontece em silêncio: há sempre uma contagem verdadeira à vista
 *     ("47 de 312"), e o que falha fica no ecrã com forma de voltar a tentar.
 */

/** "1 foto" / "7 fotos" — o plural aparece em meia dúzia de frases. */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SAI NÃO MUDA DE CONTEÚDO A MEIO DA SAÍDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três caixas desta vista fechavam A SECO porque quem as desmontava era ESTE
 * ficheiro: a folha de fundir temas, a de copiar fotos e o visualizador. As
 * três já sabem sair (as duas primeiras pelo `FolhaOuDialogo`, a terceira pela
 * `.bo-saida`); o que faltava era alguém segurá-las montadas os 200 ms — e esse
 * alguém é quem tem o estado, ou seja aqui.
 *
 * O `useSaidaDeUmSo` dá o «ainda está a sair». O que ele não resolve é este
 * outro problema, que só aparece quando o pai desmonta: **os dados de que a
 * caixa vive desaparecem no mesmo instante em que ela fecha.** O `aFundir` cai
 * para `null`, a seleção de fotos esvazia-se quando as fotos mudam de tema, o
 * `zoomAt` deixa de ser um índice. Sem isto, o que ficava a apagar-se durante
 * 200 ms era uma folha a dizer «0 fotos selecionadas» — ou um erro, porque a
 * caixa precisa de um tema que já não existe.
 *
 * Então guarda-se o último valor que esteve ABERTO e é esse que se desenha
 * enquanto sai. Devolve `null` quando não há nada para desenhar — fechado E sem
 * saída a correr —, que é o que apaga a caixa da árvore no fim.
 *
 * ── EM ESTADO, AJUSTADO NO DESENHO, E NÃO NUMA REFERÊNCIA ─────────────────
 *
 * A primeira versão disto era um `useRef` escrito durante o desenho. É o mesmo
 * defeito que a `react-hooks/refs` recusa, e recusa com razão: um valor lido no
 * desenho a partir de uma referência é um valor que o React não sabe que
 * existe — não re-desenha por causa dele, e no modo estrito (dois desenhos por
 * commit) a referência já foi escrita uma vez quando a segunda leitura
 * acontece. Ajustar ESTADO durante o desenho é o padrão que o React documenta
 * para reagir a uma prop, e re-desenha sem pintar nada pelo meio.
 *
 * ── E POR ISSO O `valor` TEM DE SER ESTÁVEL ENTRE DESENHOS ────────────────
 *
 * A comparação é por identidade. Um objecto literal montado na chamada
 * (`{origem: aFundir, temas: themes}`) é novo a cada desenho, e isto passava a
 * chamar `setUltimo` para sempre — um ciclo. Quem chama passa portanto valores
 * que já são estáveis: um item de estado, um array de estado, ou um `useMemo`.
 * São duas chamadas quando são dois valores, e não uma com um objecto à volta.
 */
function useNoEcraAteSair<T>(aberto: boolean, aSair: boolean, valor: T | null): T | null {
  const [ultimo, setUltimo] = useState<T | null>(null);
  if (aberto && valor !== ultimo) setUltimo(valor);
  if (aberto) return valor;
  return aSair ? ultimo : null;
}

export default function Temas({
  pedidoDaPaleta,
}: {
  /** A paleta (⌘K) escolheu um tema: abre a pasta dele. */
  pedidoDaPaleta?: PedidoDaPaleta;
}) {
  const { toast } = useToast();
  const anular = useAnular();
  // Eliminar um tema deixa-o 30 dias na Reciclagem (R3b), com «Anular».
  const depoisDeApagar = useDepoisDeApagar();
  // Sair da Biblioteca esquece o que o SELETOR de temas tinha guardado.
  //
  // Este ecrã é o único sítio onde a biblioteca muda — carregar, apagar,
  // reordenar, gerar miniaturas. Em vez de pendurar uma invalidação em cada um
  // desses nove sítios (e no décimo que alguém acrescenta daqui a um mês sem
  // saber que isto existe), esquece-se UMA vez, à saída. Não há como falhar:
  // se ela mexeu em alguma coisa, mexeu aqui, e passou por esta linha.
  //
  // A cache tem revalidação própria e portanto isto não é o que a mantém
  // correcta — é o que faz o que ela acabou de carregar aparecer JÁ na
  // proposta seguinte, em vez de daqui a meio minuto.
  useEffect(() => esquecerBiblioteca, []);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  /**
   * «Novo tema» leva o foco ao campo do nome (auditoria de 14/11, n.º 15): o
   * formulário abria e o cursor ficava no botão, e o primeiro gesto era sempre
   * ir buscar o campo com o rato.
   */
  const caixaDoNovoTema = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (adding) caixaDoNovoTema.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [adding]);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  /** O tema à espera de resposta à pergunta de o eliminar. */
  const [aEliminar, setAEliminar] = useState<ThemeSummary | null>(null);
  const [search, setSearch] = useState("");
  // Guardada entre sessões: quem trabalha com a biblioteca todos os dias escolhe
  // uma vez e não quer voltar a escolher. Começa em "compacto" porque com seis
  // temas é o que os põe todos no ecrã sem scroll — que é o pedido de origem.
  const [densidade, setDensidade] = useState<Densidade>("compacto");
  const [ordem, setOrdem] = useState<Ordem>("alfabetica");
  /**
   * ── O ÂMBITO DA VISTA ──────────────────────────────────────────────────
   *
   * «Todos · Por usar · Usados este ano · Favoritos · Arquivados», da Parte 1,
   * ponto 12 do `docs/APPLE-TEMAS.md`. Substitui o interruptor «Arquivados»
   * que aqui estava: o arquivo continua a ser uma VISTA e não um filtro que se
   * soma (era essa a regra, e não muda), e passa a ser um dos cinco âmbitos em
   * vez de um botão sozinho ao lado deles. As contas estão em
   * `lib/temas-filtros.ts`.
   *
   * Não se guarda entre sessões, ao contrário da ordem e da densidade: essas
   * são preferências de leitura («como é que eu gosto de ver isto»), e um
   * âmbito é onde se está agora. Reabrir a Biblioteca dentro de «Arquivados»
   * era abri-la vazia.
   */
  const [ambito, setAmbito] = useState<Ambito>("todos");
  /**
   * ── EM QUANTAS PROPOSTAS É QUE CADA TEMA JÁ SAIU ───────────────────────
   *
   * O cartão dizia quantas FOTOS tem e quando foi mexido. Nenhuma das duas
   * responde à pergunta que se faz a olhar para 25 temas: qual é que eu uso
   * mesmo? Um tema com 80 fotos que nunca saiu de casa e um com 12 que foi a
   * metade dos casamentos do ano parecem iguais na grelha, e são o oposto um
   * do outro.
   *
   * Chega DEPOIS dos cartões, num pedido próprio: a contagem lê os documentos
   * das propostas todos, e a rota da lista é a que desenha o primeiro ecrã da
   * Biblioteca — a Fase 1 foi passada a tirar-lhe trabalho de cima. Ver
   * `temas-uso.ts`. Enquanto não chega (ou se nunca chegar) o cartão fica
   * exactamente como estava.
   */
  const [usos, setUsos] = useState<Record<string, number> | null>(null);
  /**
   * ── O TEMA QUE ESTÁ A SER JUNTO A OUTRO ────────────────────────────────
   *
   * Palavras dela: «"Clássico Intemporal" aparece duas vezes com nomes quase
   * iguais — não tenho como os juntar».
   *
   * Vive na LISTA e não dentro de uma pasta, porque é aqui que os duplicados
   * se vêem: dois cartões lado a lado com o mesmo nome mal escrito de duas
   * maneiras. Dentro de uma pasta não há com que comparar.
   */
  const [aFundir, setAFundir] = useState<ThemeSummary | null>(null);
  const [revendo, setRevendo] = useState(false);
  /**
   * ── O MENU ABERTO NO PONTEIRO ──────────────────────────────────────────
   *
   * Um só, e ao nível do ecrã: dois menus de contexto abertos ao mesmo tempo
   * não é um estado que exista. Abre-se com o botão direito num cartão, com o
   * botão direito no vazio da grelha, e com o «⋯» da barra de topo — sempre
   * com uma lista de `AccaoDeItem`, que é a mesma peça de dados que o «⋯» de
   * cada cartão já usa. Ver `MenuDeContexto.tsx`.
   */
  const [menu, setMenu] = useState<PedidoDeMenu | null>(null);
  const fecharMenu = useCallback(() => setMenu(null), []);
  /**
   * ── O ARRASTO DE FOTOGRAFIAS ENTRE TEMAS, VISTO DE CIMA ────────────────
   *
   * Fase 08. O gesto começa DENTRO da pasta (é lá que estão as fotografias) e
   * acaba na coluna da esquerda (é lá que estão os temas) — dois sítios que
   * não se conhecem. O que os liga é este par de estados, e vive aqui porque
   * é aqui que a lista de temas e a pasta se encontram.
   *
   *  · `aArrastar` é o que acende o sinal de aceitação na coluna. Não se lê do
   *    `dataTransfer`: durante o `dragover` o browser deixa ver os TIPOS mas
   *    não os dados, e a coluna precisa de saber que há um lote a andar mesmo
   *    antes de o ponteiro lhe tocar;
   *  · `pedidoDeMover` é a largada. Quem age é a PASTA — é ela que tem a
   *    grelha, a selecção e o «Anular» —, por isso o que atravessa é o pedido
   *    e não o resultado. O `n` distingue dois arrastos seguidos para o mesmo
   *    tema, que de outra forma seriam o mesmo objecto e não disparavam nada.
   */
  const [aArrastar, setAArrastar] = useState(false);
  const pedidosDeMover = useRef(0);
  const [pedidoDeMover, setPedidoDeMover] = useState<{
    destino: ThemeSummary;
    carga: CargaDeFotos;
    n: number;
  } | null>(null);
  const largarNoTema = useCallback((destino: ThemeSummary, carga: CargaDeFotos) => {
    pedidosDeMover.current += 1;
    setPedidoDeMover({ destino, carga, n: pedidosDeMover.current });
  }, []);
  /**
   * ── AS DUAS PORTAS NOVAS TAMBÉM PERGUNTAM ──────────────────────────────
   *
   * Trocar de tema na coluna DESMONTA a pasta (ela tem `key={open.id}`), o que
   * é a mesma coisa que sair dela: um lote a subir fica pelo caminho. O
   * «← Temas» já perguntava; estas duas nasceram sem perguntar, e é o género
   * de perda que só se descobre quando faltam fotos.
   */
  const [aSubirFotos, setASubirFotos] = useState(false);
  const podeTrocarDeTema = useCallback(
    () => !aSubirFotos || window.confirm(AVISO_DE_LOTE_A_MEIO),
    [aSubirFotos],
  );
  /* A paleta escolheu um tema (BO 4): abre-se a pasta dele pela mesma porta do
     cartão — com a mesma pergunta se houver um lote a subir noutra pasta. Se a
     lista ainda não chegou, a pasta abre quando ela chegar (o `open` lê-se do
     `openId` contra a lista). */
  useEffect(() => {
    servirUmaVez(pedidoDaPaleta, (p) => {
      if (p.id && podeTrocarDeTema()) setOpenId(p.id);
    });
  }, [pedidoDaPaleta, podeTrocarDeTema]);
  // Lidas depois do primeiro desenho, e não durante: o servidor não tem
  // `localStorage`, e ler ali daria um HTML diferente do que o browser desenha.
  useEffect(() => {
    const d = lerDensidade();
    if (d) setDensidade(d);
    const o = lerOrdem();
    if (o) setOrdem(o);
  }, []);

  /** Fixar/desafixar e arquivar/desarquivar. Guarda-se PRIMEIRO no ecrã e
   *  desfaz-se se o servidor recusar: é uma preferência de arrumação, e esperar
   *  por uma ida à rede para ver uma estrela acender não serve ninguém.
   *
   *  E QUANDO SE DESFAZ, A FRASE DIZ QUE SE DESFEZ. Arquivar tira o cartão da
   *  lista à vista; falhar volta a pô-lo lá. Com «Não foi possível guardar.» o
   *  que ela via era um tema que tinha arrumado a reaparecer sozinho — e a
   *  conclusão natural é que o ecrã se enganou, não que a gravação não ficou. */
  const gravarMarca = useCallback(
    async (t: ThemeSummary, campo: "favorito" | "arquivado", novo: boolean): Promise<boolean> => {
      const oQue =
        campo === "arquivado"
          ? `${novo ? "arquivar" : "desarquivar"} o tema "${t.name}"`
          : `${novo ? "fixar" : "desafixar"} o tema "${t.name}"`;
      const desfez =
        campo === "arquivado"
          ? novo
            ? `"${t.name}" voltou à lista.`
            : `"${t.name}" continua arquivado.`
          : novo
            ? `"${t.name}" voltou a ficar sem estrela.`
            : `"${t.name}" continua fixado.`;
      setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, [campo]: novo } : x)));
      const reverter = (falha: Falha) => {
        setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, [campo]: !novo } : x)));
        toast(`${falha.mensagem} ${desfez}`, "error");
      };
      let res: Response;
      try {
        res = await fetch(`/api/temas/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [campo]: novo }),
        });
      } catch {
        reverter(porqueRebentou(oQue));
        return false;
      }
      if (!res.ok) {
        reverter(porqueFalhou(oQue, res, await res.json().catch(() => null)));
        return false;
      }
      return true;
    },
    [toast],
  );

  /** O gesto, com «Anular» — que é o mesmo PATCH com o valor de antes. */
  const alternarMarca = useCallback(
    async (t: ThemeSummary, campo: "favorito" | "arquivado") => {
      const novo = !t[campo];
      if (!(await gravarMarca(t, campo, novo))) return;
      const feito =
        campo === "arquivado"
          ? novo
            ? `"${t.name}" arquivado`
            : `"${t.name}" de volta à lista`
          : novo
            ? `"${t.name}" fixado`
            : `"${t.name}" deixou de estar fixado`;
      anular(feito, () => gravarMarca({ ...t, [campo]: novo }, campo, !novo));
    },
    [gravarMarca, anular],
  );

  /**
   * Renomear um tema a partir da LISTA.
   *
   * O renomear que já existia vive dentro da pasta de um tema, e é lá que ele
   * pertence. Isto é a outra porta: a revisão em lote dos nomes por arrumar,
   * que precisa de mudar um nome sem entrar em cada pasta.
   *
   * Ao contrário do `alternarMarca`, aqui NÃO se grava primeiro no ecrã: um
   * nome é o índice por onde ela procura, e mostrar um nome que o servidor
   * recusou é pior do que esperar meio segundo por ele.
   */
  const gravarNome = useCallback(
    async (t: ThemeSummary, nome: string): Promise<boolean> => {
      const oQue = `mudar "${t.name}" para "${nome}"`;
      let res: Response;
      try {
        res = await fetch(`/api/temas/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nome }),
        });
      } catch {
        toast(porqueRebentou(oQue).mensagem, "error");
        return false;
      }
      if (!res.ok) {
        // 409 é o nome já existir noutro tema — e aí a frase tem de o dizer,
        // porque «não foi possível» mandava-a tentar outra vez para sempre.
        // Fica aqui à mão em vez de vir do `porqueFalhou`: o 409 genérico dele
        // fala de duas pessoas a mexerem ao mesmo tempo, e não é isso que se
        // passa — o outro nome pode estar lá desde o ano passado.
        toast(
          res.status === 409
            ? `Já há um tema chamado "${nome}".`
            : porqueFalhou(oQue, res, await res.json().catch(() => null)).mensagem,
          "error",
        );
        return false;
      }
      setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, name: nome } : x)));
      return true;
    },
    [toast],
  );

  /** O renomear da lista, com «Anular»: volta ao nome de antes. Se entretanto
   *  outro tema ficou com esse nome, o 409 di-lo e não aparece «Anulado.». */
  const renomearDaLista = useCallback(
    async (t: ThemeSummary, nome: string): Promise<boolean> => {
      if (!(await gravarNome(t, nome))) return false;
      anular(`"${t.name}" passou a "${nome}"`, () => gravarNome({ ...t, name: nome }, t.name));
      return true;
    },
    [gravarNome, anular],
  );

  /**
   * ── OS PEDIDOS QUE SÓ A PASTA SABE SERVIR ──────────────────────────────
   *
   * «Adicionar fotografias…», «Renomear…» e «Definir capa…» estão no menu do
   * tema (no cartão e no cabeçalho da pasta), mas quem os sabe fazer é a
   * PASTA: é lá que estão o seletor de ficheiros, o campo do nome e a grelha
   * onde se escolhe a capa. O menu abre a pasta (perguntando, como as outras
   * portas, se houver um lote a subir noutra) e deixa um pedido — um objecto
   * novo a cada vez, que é o que distingue dois pedidos iguais seguidos. A
   * pasta serve-o e avisa (`pedidoServido`), e o pedido sai daqui, para não
   * ser servido outra vez quando a pasta voltar a montar.
   */
  const [pedidoAPasta, setPedidoAPasta] = useState<PedidoAPasta | null>(null);
  const pedirAPasta = useCallback(
    (t: ThemeSummary, accao: PedidoAPasta["accao"]) => {
      if (t.id !== openId && !podeTrocarDeTema()) return;
      setOpenId(t.id);
      setPedidoAPasta({ temaId: t.id, accao });
    },
    [openId, podeTrocarDeTema],
  );
  const pedidoServido = useCallback(
    (servido: PedidoAPasta) => setPedidoAPasta((p) => (p === servido ? null : p)),
    [],
  );

  /**
   * As acções de um tema, como DADOS — a forma é de quem as desenha.
   *
   * A MESMA lista no «⋯» do cartão, no botão direito e no «⋯» do cabeçalho da
   * pasta: nenhum dos três pode ganhar uma acção que os outros não tenham.
   *
   * ── PELA ORDEM DO DOCUMENTO ─────────────────────────────────────────────
   * Parte 3 do `docs/APPLE-TEMAS.md`: «Abrir · Pré-visualizar — separador —
   * Adicionar fotografias… · Renomear… · Definir capa… — separador —
   * Favorito · Arquivar — separador — Eliminar tema… (vermelho)».
   *
   * «Juntar a outro tema…» não está no documento e fica, no grupo de
   * arrumação, antes do destrutivo: é o ÚNICO caminho geral para fundir dois
   * temas (o aviso de nomes parecidos só cobre pares parecidos).
   *
   * ── OITO ITENS EM TRÊS GRUPOS, DECISÃO DELA ──────────────────────────────
   * Com «Juntar…» o menu chegava a nove itens em quatro grupos, acima do que a
   * Apple aconselha (cinco a oito, no máximo três grupos), e no telemóvel,
   * aberto para cima, escondia o «Abrir» debaixo do cabeçalho. Perguntado, ela
   * respondeu «podes» a encurtar: sai «Pré-visualizar» (dentro da pasta a
   * barra de espaço continua a abrir a fotografia em grande) e o «Abrir» junta-
   * se ao grupo do que se faz ao tema. Ficam: Abrir · Adicionar fotografias… ·
   * Renomear… · Definir capa… | Favorito · Arquivar · Juntar a outro tema… |
   * Eliminar tema…
   *
   * Itens que não servem escondem-se em vez de se esbaterem (Parte 9.8):
   * «Definir capa…» numa pasta vazia, e «Abrir» dentro da própria pasta
   * (`naPasta`). Os filetes vão no primeiro item que ficou de cada grupo
   * (`emGrupos`).
   */
  const accoesDoTema = useCallback(
    (t: ThemeSummary, { naPasta = false }: { naPasta?: boolean } = {}): AccaoDeItem[] => {
      const temFotos = t.imageCount !== 0;
      return emGrupos(
        [
          /* ── «ABRIR» É O PRIMEIRO ITEM, E EXISTE MESMO SENDO ÓBVIO ──────
             «Incluir só os comandos mais prováveis» e «tudo o que está no
             menu de contexto existe também na interface principal». [APPLE]
             Num menu aberto com o botão direito EM CIMA do cartão, não haver
             «Abrir» obrigava a fechar o menu para fazer o gesto mais
             provável de todos. Dentro da pasta não faz sentido. */
          ...(naPasta
            ? []
            : [
                {
                  id: "abrir",
                  rotulo: "Abrir",
                  icone: ICONE_ABRIR,
                  onAccao: () => {
                    if (podeTrocarDeTema()) setOpenId(t.id);
                  },
                },
              ]),
          {
            id: "adicionar",
            rotulo: "Adicionar fotografias…",
            icone: ICONE_ADICIONAR,
            onAccao: () => pedirAPasta(t, "adicionar"),
          },
          {
            id: "renomear",
            rotulo: "Renomear…",
            icone: ICONE_RENOMEAR,
            onAccao: () => pedirAPasta(t, "renomear"),
          },
          ...(temFotos
            ? [
                {
                  id: "capa",
                  rotulo: "Definir capa…",
                  icone: ICONE_CAPA,
                  onAccao: () => pedirAPasta(t, "capa"),
                },
              ]
            : []),
        ],
        [
          /* Um item comutável, com rótulo que diz o que FAZ (Parte 9.7). A
             palavra é a do âmbito «Favoritos» da barra de filtros. */
          {
            id: "favorito",
            rotulo: t.favorito ? "Tirar dos favoritos" : "Favorito",
            icone: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill={t.favorito ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path
                  d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8Z"
                  strokeLinejoin="round"
                />
              </svg>
            ),
            onAccao: () => alternarMarca(t, "favorito"),
          },
          {
            id: "arquivar",
            rotulo: t.arquivado ? "Repor na lista" : "Arquivar",
            icone: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                {t.arquivado ? (
                  <path d="M12 19V7m0 0-4 4m4-4 4 4M4 4h16" strokeLinecap="round" />
                ) : (
                  <>
                    <path d="M4 8h16v11H4z" strokeLinejoin="round" />
                    <path d="M3 4h18v4H3zM10 12h4" strokeLinecap="round" />
                  </>
                )}
              </svg>
            ),
            onAccao: () => alternarMarca(t, "arquivado"),
          },
          {
            id: "fundir",
            rotulo: "Juntar a outro tema…",
            icone: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {/* Dois caminhos que se encontram num só — o desenho do que a
                    acção faz, e não uma pasta com uma seta (que é o que já
                    significa arquivar, aqui mesmo por cima). */}
                <path d="M4 4c0 6 4 8 8 8s8 2 8 8" />
                <path d="M20 4c0 6-4 8-8 8" />
                <path d="m17 17 3 3-3 3" />
              </svg>
            ),
            onAccao: () => setAFundir(t),
          },
        ],
        [
          /* ── A DESTRUTIVA FICA NO FIM, A VERMELHO E COM O CUSTO ───────────
             Ponto 20 da auditoria e T3 do `PROPOSTAS-E-TEMAS-APPLE.md`:
             «Eliminar tema» só no menu «…». O `MenuDeAccoes` (e o menu do
             botão direito) põem-na a vermelho, depois de um filete, e a
             pergunta que se segue diz o nome do tema e o que se perde — a
             `perguntaDeEliminar`. */
          {
            id: "eliminar",
            rotulo: "Eliminar tema…",
            destrutiva: true,
            icone: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M10 11v6M14 11v6" />
                <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
            ),
            onAccao: () => setAEliminar(t),
          },
        ],
      );
    },
    [alternarMarca, pedirAPasta, podeTrocarDeTema],
  );
  // Filtrar fora da tecla: com poucos temas é imperceptível, e mantém o campo
  // instantâneo quando a lista cresce (é o mesmo padrão do Inventário).
  const deferredSearch = useDeferredValue(search);
  /**
   * A lista não veio — e porquê. Fica no ecrã, com o passo a dar: um toast que
   * desaparece não serve para uma instrução.
   *
   * ── PORQUE É QUE ISTO DEIXOU DE SER SÓ O 503 ──────────────────────────────
   * Era: 503 com corpo → cartão no ecrã; TUDO o resto → um toast que dizia «Não
   * foi possível carregar os temas.» e ia-se embora. Contadas as maneiras de
   * esta leitura falhar, nove: duas caíam no cartão e as outras SETE naquele
   * toast — a chave recusada, o projecto em pausa, a consulta fora de tempo,
   * uma sessão caducada. Nenhuma delas se resolve olhando para o ecrã, e o ecrã
   * era a única coisa que ela tinha.
   *
   * Agora qualquer recusa fica no cartão, com o título e a frase que a rota
   * manda (ver `respostaDeAvaria` em src/app/api/temas/route.ts). Os textos de
   * reserva aqui em baixo são só para o que nem sequer chega em JSON — um 504
   * do intermediário, uma página de erro —, e mesmo esses dizem o estado HTTP,
   * que é o que se cita a pedir ajuda.
   */
  const [blocked, setBlocked] = useState<{ titulo: string; texto: string } | null>(null);

  // Um pedido só, à entrada. Não acompanha o que ela faz na Biblioteca de
  // propósito: o que muda este número é gravar uma PROPOSTA, e isso acontece
  // noutro ecrã.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/temas/uso", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (vivo && data?.usos) setUsos(data.usos as Record<string, number>);
      } catch {
        /* fica sem número, que é como estava antes de isto existir */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/temas", { cache: "no-store" });
        if (res.ok) {
          setThemes(await res.json());
          setBlocked(null);
        } else {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
            titulo?: string;
          } | null;
          setBlocked({
            titulo: data?.titulo || tituloDaRecusa(res.status),
            texto: data?.error || textoDaRecusa(res.status),
          });
        }
      } catch {
        setBlocked({
          titulo: "Sem ligação ao servidor",
          texto:
            "O pedido dos temas não chegou a sair deste computador. Verifica a ligação à " +
            "internet e recarrega a página. Nada se perdeu — os temas estão no servidor.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function create() {
    // O Enter no campo do nome não passa pelo botão (que já está desativado
    // enquanto grava): sem esta guarda, dois Enter seguidos criavam dois temas.
    if (saving) return;
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const oQue = `criar o tema "${name}"`;
    try {
      let res: Response;
      try {
        res = await fetch("/api/temas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, notes: newNotes.trim() }),
        });
      } catch {
        toast(porqueRebentou(oQue).mensagem, "error");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // O 503 da criação é o mesmo impedimento de instalação da leitura, e
        // vai para o mesmo cartão — com o título que a rota mandar. O resto
        // continua num toast: numa ESCRITA que ela acabou de pedir, a queixa
        // pertence ao lado do botão em que carregou.
        if (res.status === 503 && data?.error) {
          setBlocked({ titulo: data.titulo || tituloDaRecusa(res.status), texto: data.error });
        } else toast(porqueFalhou(oQue, res, data).mensagem, "error");
        return;
      }
      setBlocked(null);
      const created: ThemeSummary = data;
      setThemes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "pt")));
      bibliotecaAlterada();
      setNewName("");
      setNewNotes("");
      setAdding(false);
      setSearch("");
      setOpenId(created.id);
      toast(`Tema "${created.name}" criado. Agora carrega as fotos.`, "success");
    } finally {
      setSaving(false);
    }
  }

  /** Repõe UM tema depois de um DELETE falhado. Repor a lista inteira (o
   *  "snapshot" de antes do pedido) fazia desaparecer os temas criados no
   *  entretanto — e ressuscitava os que tivessem sido eliminados. */
  function restoreTheme(t: ThemeSummary) {
    setThemes((prev) =>
      prev.some((x) => x.id === t.id)
        ? prev
        : [...prev, t].sort((a, b) => a.name.localeCompare(b.name, "pt")),
    );
  }

  async function removeTheme(t: ThemeSummary) {
    setThemes((prev) => prev.filter((x) => x.id !== t.id));
    if (openId === t.id) setOpenId(null);
    // O cartão sai da lista já e volta se o servidor recusar — e é isso que a
    // frase tem de dizer. Um tema que ela acabou de eliminar a reaparecer com
    // um aviso que só fala de ligações é indistinguível de um ecrã avariado.
    const oQue = `eliminar o tema "${t.name}"`;
    const reverter = (falha: Falha) => {
      restoreTheme(t);
      toast(`${falha.mensagem} "${t.name}" voltou à lista.`, "error");
    };
    let res: Response;
    try {
      res = await fetch(`/api/temas/${t.id}`, { method: "DELETE" });
    } catch {
      reverter(porqueRebentou(oQue));
      return;
    }
    const corpo = await res.json().catch(() => null);
    if (res.ok) {
      bibliotecaAlterada();
      depoisDeApagar(corpo, `Tema «${t.name}» eliminado.`, () => {
        restoreTheme(t);
        bibliotecaAlterada();
      });
      return;
    }
    reverter(porqueFalhou(oQue, res, corpo));
  }

  /** Mantém o cartão do tema a par do que a pasta diz. A pasta é a fonte de
   *  verdade: a contagem passa a ser a que o servidor devolveu (e `truncated`
   *  com ela), e um `imageCount` que estava a `null` fica finalmente conhecido.
   *  `capa` a `undefined` quer dizer "não se sabe" — o cartão fica como está;
   *  a `null` quer dizer "a pasta está vazia". Os campos da capa mudam todos
   *  juntos — ver `comCapa`. */
  const syncCard = useCallback((id: string, s: FolderState) => {
    setThemes((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const contado = { ...t, imageCount: s.total, truncated: s.truncated };
        return s.capa === undefined ? contado : comCapa(contado, capaDaFoto(s.capa));
      }),
    );
  }, []);

  /**
   * ── DEPOIS DE JUNTAR DOIS TEMAS ────────────────────────────────────────
   *
   * A lista corrige-se sem recarregar: o destino ganha as fotos que chegaram,
   * a origem fica com as que sobraram, e — se ficou vazia — sai da vista, que
   * é o que o servidor já lhe fez.
   *
   * O relatório é um toast por assunto, e não uma frase com tudo lá dentro:
   * «foram X» é a confirmação, «Y já lá estavam» é uma explicação de porque é
   * que o tema não desapareceu, e «sem miniatura» é uma instrução. Três coisas
   * diferentes numa linha só lêem-se como nenhuma.
   */
  const aplicarFusao = useCallback(
    (r: ThemeMergeOutcome) => {
      setAFundir(null);
      setThemes((prev) =>
        prev.map((t) => {
          if (t.id === r.destId && t.imageCount !== null) {
            return { ...t, imageCount: t.imageCount + r.moved };
          }
          if (t.id === r.sourceId) {
            return {
              ...t,
              imageCount: r.leftBehind,
              truncated: false,
              ...(r.archived ? { arquivado: true } : {}),
            };
          }
          return t;
        }),
      );
      bibliotecaAlterada();
      if (r.stopped) {
        toast(
          `Parou a meio — ${plural(r.moved, "foto passou", "fotos passaram")} para "${r.destName}". Podes continuar quando quiseres.`,
          "info",
        );
        return;
      }
      if (r.moved === 0 && r.existing === 0 && r.failed === 0) {
        toast(`"${r.sourceName}" não tinha fotos. Nada mudou.`, "info");
      } else {
        toast(
          r.archived
            ? `"${r.sourceName}" passou para "${r.destName}" e foi arquivado.`
            : `${plural(r.moved, "foto passou", "fotos passaram")} para "${r.destName}".`,
          "success",
        );
      }
      // A razão de o tema não ter desaparecido. Sem isto, ela vê-o na lista com
      // três fotos e conclui que a fusão falhou.
      if (!r.archived && r.leftBehind > 0) {
        toast(
          r.failed > 0
            ? `${plural(r.failed, "foto não saiu", "fotos não saíram")} de "${r.sourceName}". Tenta juntar outra vez.`
            : `${plural(r.leftBehind, "foto já estava", "fotos já estavam")} em "${r.destName}" e ficou em "${r.sourceName}". Podes apagá-lo quando quiseres.`,
          "info",
        );
      }
      if (r.thumbsMissing > 0) {
        toast(
          `${plural(r.thumbsMissing, "foto chegou", "fotos chegaram")} a "${r.destName}" sem miniatura. Abre esse tema e usa "Gerar miniaturas em falta".`,
          "info",
        );
      }
    },
    [toast],
  );

  const open = themes.find((t) => t.id === openId) ?? null;

  /* ── ANTES DO `if (open)` LÁ EM BAIXO, E NÃO DEPOIS ────────────────────
     Aquilo é um `return` condicional (a vista de UM tema), e um gancho depois
     dele só corre em metade dos desenhos — a ordem dos ganchos parte-se no
     fotograma em que se abre ou fecha um tema. Fica aqui, com os outros.

     A folha de fundir temas fica montada os 200 ms da saída, com os dados
     congelados no instante em que fechou. Ver `useNoEcraAteSair`. */
  const aSairDaFusao = useSaidaDeUmSo(aFundir !== null);
  // Duas chamadas e não um objecto com os dois lá dentro: ver a nota do
  // `useNoEcraAteSair` — um literal novo a cada desenho seria um ciclo.
  const origemDaFusao = useNoEcraAteSair(aFundir !== null, aSairDaFusao, aFundir);
  const temasDaFusao = useNoEcraAteSair(aFundir !== null, aSairDaFusao, themes);

  /**
   * ── AS ACÇÕES DA BIBLIOTECA INTEIRA ────────────────────────────────────
   *
   * As que não são sobre UM tema. Hoje é uma — «Rever etiquetas…», que era um
   * link de texto entre os botões da barra —, e as reticências dizem que abre
   * outra vista em vez de fazer já. [APPLE]
   *
   * Vive aqui em cima, ao lado do `accoesDoTema`, para as duas listas de menu
   * deste ecrã se lerem juntas: quem acrescentar o «Exportar biblioteca…» do
   * documento vê logo onde ele pertence.
   */
  const accoesDaBiblioteca: AccaoDeItem[] = useMemo(
    () => [
      {
        id: "rever-etiquetas",
        rotulo: "Rever etiquetas…",
        icone: (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7h10M4 12h10M4 17h6" />
            <path d="m16 15 2 2 4-4" />
          </svg>
        ),
        onAccao: () => setRevendo(true),
      },
    ],
    [],
  );

  /**
   * ── OS PARES QUE ELA NÃO TEM DE ENCONTRAR A OLHO ───────────────────────
   *
   * Sobre a lista TODA e não sobre a filtrada: um par onde só uma das metades
   * corresponde à procura continua a ser um par, e escondê-lo por causa do
   * filtro era transformar o aviso numa coisa que aparece e desaparece
   * consoante o que está escrito no campo. Ver `temas-parecidos.ts`.
   */
  const parecidos = useMemo(() => temasParecidos(themes), [themes]);

  /** O que se sabe sobre o uso dos temas. O ano ainda não vem do servidor —
   *  ver a nota do `ambitosNoEcra`. */
  const dadosDeUso: DadosDeUso = useMemo(() => ({ usos, usosEsteAno: null }), [usos]);

  /**
   * ── OS ÂMBITOS QUE SE MOSTRAM, E O QUE FALTA A UM DELES ────────────────
   *
   * Quatro dos cinco respondem-se com o que este ecrã já tem em mãos. O quinto
   * — «Usados este ano» — precisa de saber QUANDO é que um tema saiu, e o
   * `/api/temas/uso` só devolve QUANTAS vezes (ver `lib/temas-uso.ts`: conta
   * propostas, sem data). Enquanto o servidor não mandar a contagem do ano, o
   * âmbito não aparece — a alternativa era oferecê-lo e devolver a lista toda
   * ou nenhuma, e um filtro que mente ensina a não usar os outros quatro.
   * A conta já está escrita e testada em `lib/temas-filtros.ts`; falta-lhe o
   * número.
   */
  const ambitosNoEcra = useMemo(() => ambitosDisponiveis(themes, dadosDeUso), [themes, dadosDeUso]);
  /** O âmbito escolhido pode deixar de existir por baixo dos pés — desarquivar
   *  o último tema arquivado esvazia «Arquivados». Aí volta-se a «Todos», em
   *  vez de ficar um filtro activo que já não está na barra. */
  const ambitoActivo: Ambito = ambitosNoEcra.some((a) => a.valor === ambito) ? ambito : "todos";

  const visible = useMemo(() => {
    const needle = normalizedThemeName(deferredSearch);
    // O arquivo é uma VISTA, não um filtro que se soma: ou se está a ver o que
    // se usa, ou se está a ver o que se pôs de lado. Misturar os dois era
    // devolver ao ecrã exactamente o que arquivar veio tirar de lá.
    const base = filtrarPorAmbito(themes, ambitoActivo, dadosDeUso);
    const filtrados = needle
      ? // Procurar por nome E por nota: a nota ("tons quentes, para espaços de
        // pedra") é muitas vezes como a Catarina se lembra do tema.
        base.filter((t) => normalizedThemeName(`${t.name} ${t.notes ?? ""}`).includes(needle))
      : base;
    return ordenarTemas(filtrados, ordem, usos);
  }, [themes, deferredSearch, ordem, ambitoActivo, dadosDeUso, usos]);
  /** Os cartões que se DESENHAM: os primeiros, e mais ao descer — ver
   *  `useMaisAoDescer`. A procura, os filtros e as contagens continuam a usar
   *  o `visible` inteiro. */
  const {
    aDesenhar: cartoesADesenhar,
    sentinela: sentinelaDosCartoes,
    temMais: haMaisCartoes,
  } = useMaisAoDescer(visible, `${deferredSearch}\u0000${ordem}\u0000${ambitoActivo}`);

  /**
   * ── OS RESUMOS QUE FALTAM, SÓ PARA O QUE SE DESENHA (9/11) ─────────────
   * Com mais de 150 temas, o `GET /api/temas` só resume os primeiros (a
   * contagem, a capa, o borrão); os outros chegam com `resumoPendente`. Aqui
   * pedem-se à `/api/temas/resumos`, 60 de cada vez, só os dos cartões que
   * estão a ser desenhados — a lista inteira nunca se resume de uma vez. Um
   * pedido que falha volta a poder ser feito no desenho seguinte.
   */
  const resumosPedidos = useRef(new Set<string>());
  useEffect(() => {
    const faltam = cartoesADesenhar
      .filter((t) => t.resumoPendente && !resumosPedidos.current.has(t.id))
      .map((t) => t.id);
    for (let i = 0; i < faltam.length; i += 60) {
      const lote = faltam.slice(i, i + 60);
      lote.forEach((id) => resumosPedidos.current.add(id));
      void (async () => {
        try {
          const res = await fetch("/api/temas/resumos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: lote }),
          });
          if (!res.ok) throw new Error(String(res.status));
          const resumos: ThemeSummary[] = await res.json();
          const porId = new Map(resumos.map((r) => [r.id, r]));
          setThemes((prev) =>
            prev.map((t) => {
              const r = porId.get(t.id);
              // O nome, a nota e o favorito podem ter mudado entretanto no
              // ecrã: do resumo só entram a contagem e a capa.
              return r && t.resumoPendente
                ? {
                    ...t,
                    resumoPendente: undefined,
                    imageCount: r.imageCount,
                    truncated: r.truncated,
                    coverUrl: r.coverUrl,
                    coverFallbackUrl: r.coverFallbackUrl,
                    coverLqip: r.coverLqip,
                    coverCor: r.coverCor,
                    coverAvif: r.coverAvif,
                  }
                : t;
            }),
          );
        } catch {
          lote.forEach((id) => resumosPedidos.current.delete(id));
        }
      })();
    }
  }, [cartoesADesenhar]);

  /**
   * ── O TAMANHO DA BIBLIOTECA É O ESTADO DA VISTA ────────────────────────
   *
   * Era «204 fotos em 18 temas», uma legenda solta por baixo do campo de
   * procura que descrevia sempre a biblioteca inteira. O
   * `docs/APPLE-TEMAS.md` (ponto 4) manda que passe a estado da vista e que
   * MUDE ao filtrar: «28 temas · 567 fotografias» → «4 temas · 61
   * fotografias». É o âmbito visível dito em números — que é a informação que
   * falta a quem acabou de carregar num filtro e quer saber o que sobrou.
   *
   * E continua a dizer quando alguma pasta não se deixou ler, em vez de a
   * somar como zero: um total calado que encolhe é a maneira mais fácil de
   * alguém concluir que faltam fotos e as voltar a carregar.
   */
  const estadoDaVista = useMemo(() => {
    // A ler, a lista ainda está vazia — e «0 temas · 0 fotografias» é uma
    // afirmação, dita antes de haver resposta. Quem a lê pensa que perdeu tudo.
    if (loading) return "A contar…";
    const { fotos, temas, ilegiveis, porContar } = contarFotosDaBiblioteca(visible);
    // Com milhares de temas as contagens chegam aos bocados: até lá, o total
    // de fotografias é um mínimo, e diz-se («1 240+»), em vez de um número
    // que parece final e vai crescendo à frente dela.
    const base = `${plural(temas, "tema", "temas")} · ${
      porContar > 0 ? `${fotos}+ fotografias` : plural(fotos, "fotografia", "fotografias")
    }`;
    return ilegiveis > 0
      ? `${base} · ${plural(ilegiveis, "pasta não se deixou ler", "pastas não se deixaram ler")}`
      : base;
  }, [visible, loading]);

  // A revisão em lote trabalha sobre a biblioteca TODA, não sobre um tema — é
  // um ecrã irmão da lista, não um separador dentro dela.
  if (revendo) return <BibliotecaRevisao onBack={() => setRevendo(false)} />;

  /**
   * ── A PERGUNTA DE ELIMINAR UM TEMA ────────────────────────────────────
   *
   * Escrita uma vez e posta nos DOIS ramos do desenho: eliminar chega-se tanto
   * da lista como de dentro da pasta aberta, e esse ramo devolve outro
   * componente. Sem isto, a pergunta pedida lá dentro não tinha onde aparecer.
   *
   * ── COM OS NÚMEROS, E NÃO COM UMA PROMESSA GERAL ──────────────────────
   * T3 do `docs/PROPOSTAS-E-TEMAS-APPLE.md`: «uma confirmação que diz
   * quantas fotos e propostas são afectadas». Dizia «as propostas já feitas
   * com estas fotos não são afectadas» — verdade, mas sem número nenhum. Passa
   * a dizer quantas fotografias desaparecem e em quantas propostas o tema
   * está, e porque é que essas não mudam. As frases vêm do `fraseDeEliminar`;
   * só a última, a irreversível, vai a vermelho.
   */
  const frasesDeEliminar = aEliminar
    ? fraseDeEliminar(aEliminar, usos ? (usos[aEliminar.id] ?? 0) : null)
    : null;
  const perguntaDeEliminar = (
    <PerguntaDestrutiva
      aberto={!!aEliminar}
      onFechar={() => setAEliminar(null)}
      titulo={`Eliminar o tema «${aEliminar?.name ?? ""}»?`}
      aviso={
        frasesDeEliminar && (
          <>
            <span className="block text-[var(--bo-text)]">{frasesDeEliminar.fotos}</span>
            {frasesDeEliminar.propostas && (
              <span className="mt-1 block text-[var(--bo-tinta-72)]">
                {frasesDeEliminar.propostas}
              </span>
            )}
            <span className="mt-3 block">Fica 30 dias na Reciclagem, de onde pode voltar.</span>
          </>
        )
      }
      rotuloConfirmar="Eliminar o tema"
      onConfirmar={() => {
        const t = aEliminar;
        setAEliminar(null);
        if (t) void removeTheme(t);
      }}
    />
  );

  if (open) {
    return (
      /* ══════════════════════════════════════════════════════════════════
         O SPLIT VIEW — FASE 06
         ══════════════════════════════════════════════════════════════════

         Ponto 16 da auditoria: «o detalhe é uma página nova com "← Temas" —
         navegação de telemóvel aplicada a um ecrã de desktop». A correcção é
         «lista de temas à esquerda, fotografias à direita; trocar de tema não
         recarrega a página». [APPLE, Split views]

         ── E NÃO RECARREGA MESMO ────────────────────────────────────────
         Nunca houve navegação de página aqui — o `openId` é estado, e a URL
         não muda. O que havia era uma TROCA de ecrã: a grelha de cartões
         desaparecia inteira para a pasta aparecer, e voltar a ela era o único
         caminho para o tema do lado. Agora os dois estão ao mesmo tempo no
         ecrã e trocar de tema é carregar numa linha da esquerda.

         ── PORQUE É QUE O CORTE É O `lg` E NÃO OS 1200 px DO DOCUMENTO ──
         Porque esta casa tem três larguras e só três (`ui/adaptativo.ts`, e o
         `Cortes.contrato.test.ts` que as prende): 640, 1024 e 1440. 1200 não
         é nenhuma delas, e acrescentar uma quarta só para este ecrã é o
         começo dos dois sistemas de cortes que aquele contrato existe para
         evitar. `lg` (1024) é, por definição desta casa, «a partir daqui é
         desktop» — e é também onde a navegação do back office deixa de ser
         gaveta, ou seja onde há mesmo largura em fluxo para uma coluna.

         MEDIDO a 1024: sobram 688 px de conteúdo; a coluna leva 256 e o
         intervalo 16, e ficam 416 px para a zona de largar — 382 úteis, duas
         colunas de 185 px. Acima do piso de 111 px, e acima dos 180 px de
         célula que a fase 07 fixa.

         Abaixo de `lg` a coluna não existe (é `hidden` no `ListaDeTemas`) e a
         pasta ocupa a vista toda, exactamente como ocupava — com o «← Temas»
         no lugar. É a regra da Parte 1 do sistema de design: «a vista compacta
         é adiada o máximo possível».

         ── SEM `--cena` ────────────────────────────────────────────────
         A escada desta vista tem quatro blocos (0,1,2,3) e o tecto são
         quatro (`vistas-que-se-compoem.test.ts`). Este ramo nunca teve
         degrau nenhum e continua a não ter: entrar num tema é uma troca de
         conteúdo, não a apresentação de uma vista nova. */
      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-4">
        <ListaDeTemas
          /* A coluna mostra o ÂMBITO à vista — é a mesma lista que a grelha de
             cartões mostrava —, mais o tema aberto quando um filtro o deixou
             de fora. Sem essa ressalva, arquivar o tema em que se está a
             trabalhar apagava-o da coluna e ficava uma lista sem linha activa
             ao lado das fotografias dele. */
          temas={visible.some((t) => t.id === open.id) ? visible : [open, ...visible]}
          activoId={open.id}
          aoEscolher={(id) => {
            if (id !== open.id && podeTrocarDeTema()) setOpenId(id);
          }}
          aoVoltar={() => {
            if (podeTrocarDeTema()) setOpenId(null);
          }}
          aoLargarFotos={largarNoTema}
          aArrastar={aArrastar}
        />
        <div className="min-w-0">
          <ThemeFolder
            key={open.id}
            theme={open}
            usos={usos}
            // A pasta precisa da lista toda para poder oferecer "Copiar para…" — e
            // o cartão do destino tem de somar as fotos que lá chegaram, senão a
            // contagem só se corrige no próximo carregamento da página.
            themes={themes}
            onCopiedTo={(destId, added) =>
              setThemes((prev) =>
                prev.map((t) =>
                  t.id === destId && t.imageCount !== null
                    ? { ...t, imageCount: t.imageCount + added }
                    : t,
                ),
              )
            }
            onBack={() => setOpenId(null)}
            onFolderState={(s) => syncCard(open.id, s)}
            onRename={(name) =>
              setThemes((prev) =>
                prev
                  .map((t) => (t.id === open.id ? { ...t, name } : t))
                  .sort((a, b) => a.name.localeCompare(b.name, "pt")),
              )
            }
            onCover={(coverPath, capa) =>
              setThemes((prev) =>
                prev.map((t) => (t.id === open.id ? { ...comCapa(t, capa), coverPath } : t)),
              )
            }
            accoes={accoesDoTema(open, { naPasta: true })}
            aoArrastar={setAArrastar}
            aoSubir={setASubirFotos}
            pedidoDeMover={pedidoDeMover}
            pedidoAPasta={pedidoAPasta}
            aoServirPedido={pedidoServido}
          />
        </div>
        {perguntaDeEliminar}
      </div>
    );
  }

  // O campo de procura só aparece quando há lista que chegue para justificar
  // um controlo a mais — com três temas, procurar é mais trabalho do que ler.
  // A ler, o campo já lá está (desligado): aparecia só depois de a lista
  // chegar, e a contagem ao lado era empurrada para a linha de baixo a 390 px
  // — MEDIDO como um salto da página. Uma biblioteca com quatro temas ou menos
  // perde-o depois; a dela tem dezenas.
  const searchable = loading || themes.length > 4;

  return (
    <div>
      {/* Segurada montada os 200 ms da saída. O `onClose` continua a correr no
          instante do gesto — o `setAFundir(null)` fecha, o `FolhaOuDialogo`
          devolve o foco e larga o trinco do scroll já —, e o que fica é uma
          imagem a apagar-se com os dados que tinha quando fechou. */}
      {origemDaFusao && temasDaFusao && (
        <FundirTemas
          aberto={aFundir !== null}
          sourceTheme={origemDaFusao}
          themes={temasDaFusao}
          onClose={() => setAFundir(null)}
          onDone={aplicarFusao}
        />
      )}
      {blocked && (
        <Card
          padding="sm"
          className="mb-6 border-[var(--bo-aviso)]/30 bg-[var(--bo-aviso-lavagem)]/60"
        >
          {/* O título vem da causa: dizer "Falta um passo de instalação" a quem
              tem é o projecto em pausa manda-a correr o schema por nada. */}
          <p className="bo-eyebrow mb-1.5 text-[var(--bo-aviso)]">{blocked.titulo}</p>
          <p className="text-sm leading-relaxed text-[var(--bo-tinta-72)]">{blocked.texto}</p>
        </Card>
      )}

      <BarraDaBiblioteca
        themes={themes}
        loading={loading}
        adding={adding}
        setAdding={setAdding}
        search={search}
        setSearch={setSearch}
        densidade={densidade}
        setDensidade={setDensidade}
        ordem={ordem}
        setOrdem={setOrdem}
        usos={usos}
        menu={menu}
        setMenu={setMenu}
        accoesDaBiblioteca={accoesDaBiblioteca}
        estadoDaVista={estadoDaVista}
        searchable={searchable}
      />

      {/* ══════════════════════════════════════════════════════════════════
          OS ÂMBITOS — «"por usar" É METADADO SEM FILTRO»
          ══════════════════════════════════════════════════════════════════

          Ponto 12 da auditoria do `docs/APPLE-TEMAS.md`: a informação mais
          accionável da grelha — que temas nunca saíram numa proposta — estava
          escrita em cada cartão e não havia forma de filtrar por ela. «É o
          padrão da app Fotografias e é o que transforma esta página de
          catálogo em ferramenta.»

          ── A FILA PENSADA A 375 ─────────────────────────────────────────
          Cinco âmbitos com contagem não cabem numa linha de 375 px, e uma
          barra que não quebra não encolhe — foi o que já custou a esta vista
          a navegação inteira no telemóvel (ver a nota do `end` da barra).
          Por isso é `flex-wrap`: parte-se em duas ou três linhas e nenhum
          rótulo sai do ecrã. Os chips são os da casa, à letra os mesmos que o
          interruptor «Arquivados» usava antes de ser um deles.

          ── E NÃO ANIMA ──────────────────────────────────────────────────
          «Nunca animes a mudança de filtro» (Parte 5) — é uma interação de
          alta frequência. O conteúdo troca em silêncio: a grelha não leva
          `key` nova nem entrada, só passa a ter outros filhos.

          Só aparece com dois âmbitos ou mais: com um só, seria um controlo a
          explicar uma funcionalidade que ainda não tem o que mostrar. */}
      {ambitosNoEcra.length > 1 && (
        <div
          role="group"
          aria-label="Filtrar os temas"
          style={{ "--cena": 1 } as React.CSSProperties}
          className="bo-cena mb-5 flex flex-wrap items-center gap-1.5"
        >
          {ambitosNoEcra.map((a) => (
            <button
              key={a.valor}
              type="button"
              aria-pressed={ambitoActivo === a.valor}
              onClick={() => setAmbito(a.valor)}
              className={`alvo-toque rounded-lg border px-3 py-2 text-[10px] uppercase tracking-[0.12em] ${ESTADO} ${PRESSAO} ${
                ambitoActivo === a.valor
                  ? "border-foreground/20 bg-[var(--bo-tinta-6)] text-[var(--bo-tinta-72)]"
                  : "border-[var(--bo-hairline-strong)] text-foreground/40 hover:text-[var(--bo-text-muted)]"
              }`}
            >
              {a.rotulo}
              {/* A contagem é do ÂMBITO e não da procura — ver
                  `contarPorAmbito`. `tabular-nums` para os números não
                  dançarem de largura quando sobem de 9 para 10. */}
              <span className="ml-1.5 tabular-nums opacity-70">{a.contagem}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── OS NOMES POR ARRUMAR ──────────────────────────────────────────
          A `SugestaoDeNome` abaixo só aparece enquanto se ESCREVE um nome — e
          um tema baptizado há seis meses nunca mais passa por esse campo. Era
          por isso que o «Seatings Plans» continuava lá com o corrector a saber,
          desde sempre, que devia ser «Seating Plans».

          Aparece só quando há alguma coisa a arrumar; com a biblioteca em ordem
          não se vê nada. */}
      {/* Segundo degrau numa caixa à volta: a `NomesPorArrumar` devolve `null`
          quando não há nada a arrumar, e o `empty:hidden` faz esta caixa
          desaparecer com ela em vez de ficar um degrau a animar o vazio. */}
      <div style={{ "--cena": 2 } as React.CSSProperties} className="bo-cena empty:hidden">
        <NomesPorArrumar themes={themes} onRenomear={renomearDaLista} />
      </div>

      <NovoTema
        adding={adding}
        caixaDoNovoTema={caixaDoNovoTema}
        newName={newName}
        setNewName={setNewName}
        newNotes={newNotes}
        setNewNotes={setNewNotes}
        saving={saving}
        create={create}
      />

      {loading ? (
        // Os esqueletos da espera NÃO levam degrau: um esqueleto é a espera, e
        // não a apresentação do que chegou.
        <div className={`grid ${COLUNAS[densidade]}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bo-skeleton aspect-[4/3] rounded-tile" aria-hidden />
          ))}
          <p className="sr-only">A carregar temas…</p>
        </div>
      ) : blocked && themes.length === 0 ? null : themes.length === 0 ? (
        /* A lista vazia POR AVARIA não é uma lista vazia, e é por isso que o
           ramo de cima corta aqui. O cartão do topo já diz que a leitura
           falhou; deixar correr esta cascata punha por baixo dele «Ainda não há
           temas» — ou, com o filtro de arquivados, «Todos os temas estão
           arquivados» —, que é exactamente o susto que se está a corrigir: o
           ecrã a afirmar sobre os dados dela uma coisa que não sabe. */
        /* E com o formulário aberto o estado vazio sai: era um segundo
           cartão a dizer «ainda não há temas» por baixo do sítio onde ela
           está, nesse instante, a criar o primeiro (auditoria de 14/11). */
        adding ? null : (
          <Card padding="none">
            <EmptyState
              icon={FolderIcon}
              title="Ainda não há temas"
              description="Cria um tema por estilo que usas nos casamentos — Itália, Terracotta, Branco & Verde — e carrega lá as fotos de inspiração. Depois é só escolher na proposta."
              // Com o formulário já aberto, este botão seria um segundo "Criar
              // tema" no mesmo ecrã — a apontar para o campo que está mesmo ali.
              action={{ label: "Criar tema", onClick: () => setAdding(true) }}
            />
          </Card>
        )
      ) : visible.length === 0 ? (
        <Card padding="sm">
          {/* ── FILTRO SEM RESULTADOS ≠ BIBLIOTECA VAZIA ─────────────────
              Ponto 14 da auditoria, e são três frases diferentes porque são
              três situações diferentes: não há nada escrito e o âmbito está em
              «Todos» (então está tudo arquivado), há procura escrita (e a
              frase cita o que se procurou), ou o âmbito é que não tem nada.
              As duas últimas têm saída — «Limpar filtros» —, porque uma
              mensagem sem saída obriga a adivinhar qual dos dois controlos é
              que está a esconder os temas. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="bo-text-muted text-sm">
              {search.trim()
                ? `Nenhum tema corresponde a “${search.trim()}”.`
                : ambitoActivo !== "todos"
                  ? `Nenhum tema em “${AMBITOS.find((a) => a.valor === ambitoActivo)?.rotulo}”.`
                  : "Todos os temas estão arquivados. Abre “Arquivados” para os repor."}
            </p>
            {(search.trim() || ambitoActivo !== "todos") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setAmbito("todos");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </Card>
      ) : (
        /* Terceiro degrau na GRELHA e não em cada cartão: vinte e cinco temas a
           entrar um a um seria a lentidão que o tecto do sexto degrau existe
           para evitar. A grelha chega inteira. */
        <ListaDaBiblioteca
          setAdding={setAdding}
          setOpenId={setOpenId}
          densidade={densidade}
          usos={usos}
          setAFundir={setAFundir}
          setMenu={setMenu}
          accoesDoTema={accoesDoTema}
          accoesDaBiblioteca={accoesDaBiblioteca}
          parecidos={parecidos}
          cartoesADesenhar={cartoesADesenhar}
          sentinelaDosCartoes={sentinelaDosCartoes}
          haMaisCartoes={haMaisCartoes}
        />
      )}
      {/* O menu do botão direito, um só para o ecrã inteiro. Fica no fim
          para se desenhar por cima de tudo o resto sem depender de quem tem
          `z-index` — e é `fixed`, portanto não é a grelha que o recorta. */}
      <MenuDeContexto pedido={menu} onFechar={fecharMenu} />
      {perguntaDeEliminar}
    </div>
  );
}

/**
 * ── SAIR DA PASTA COM UM LOTE A MEIO ──────────────────────────────────────
 *
 * A pergunta vive aqui, e não dentro do `leave()`, porque desde o split view
 * há TRÊS portas para fora desta pasta e não uma: o «← Temas» (que é o
 * `leave`), o «Todos os temas» da coluna e cada linha dessa coluna — trocar de
 * tema desmonta a pasta tal como sair dela.
 *
 * Duas dessas três estão do lado do `Temas`, que não sabe se há fotos a subir;
 * por isso a pasta di-lo (`aoSubir`) e a pergunta é a mesma frase nos três
 * sítios. Sem isto, arrastar fotos para um tema e carregar na linha do lado
 * abandonava o lote em silêncio.
 */
const AVISO_DE_LOTE_A_MEIO =
  "Ainda há fotos a subir. Se sair agora, as que faltam não são carregadas. Sair mesmo assim?";

/** A pasta de UM tema: renomear, carregar fotos, remover fotos, eliminar. */
function ThemeFolder({
  theme,
  themes,
  onBack,
  onFolderState,
  onRename,
  onCover,
  onCopiedTo,
  accoes,
  aoArrastar,
  aoSubir,
  pedidoDeMover,
  pedidoAPasta,
  aoServirPedido,
  usos,
}: {
  theme: ThemeSummary;
  /** Todos os temas — para o "Copiar para…" saber para onde pode levar. */
  themes: ThemeSummary[];
  onBack: () => void;
  onFolderState: (state: FolderState) => void;
  onRename: (name: string) => void;
  /** A capa mudou. Vai com os campos TODOS da fotografia nova — ver
   *  `capa-do-cartao.ts`, e o defeito que ele fecha. */
  onCover: (coverPath: string, capa: CapaDoCartao) => void;
  /** Chegaram `added` fotos ao tema `destId` — o cartão dele tem de somar.
   *  Um número NEGATIVO subtrai, que é o que o «Anular» de um arrasto pede. */
  onCopiedTo: (destId: string, added: number) => void;
  /** As acções do tema, para o «⋯» do cabeçalho — a mesma lista do cartão
   *  (`accoesDoTema`, sem «Abrir»). */
  accoes: readonly AccaoDeItem[];
  /** Começou (ou acabou) um arrasto de fotografias. Quem precisa de saber é a
   *  coluna da esquerda, que é irmã desta pasta e não a conhece. */
  aoArrastar?: (aArrastar: boolean) => void;
  /** Há um lote a subir? Quem precisa de saber é o `Temas`: as outras duas
   *  portas para fora desta pasta são dele. Ver `AVISO_DE_LOTE_A_MEIO`. */
  aoSubir?: (aSubir: boolean) => void;
  /** Um lote largado num tema da coluna. Ver a nota no `Temas`. */
  pedidoDeMover?: { destino: ThemeSummary; carga: CargaDeFotos; n: number } | null;
  /** «Adicionar fotografias…», «Renomear…» ou «Definir capa…», pedidos no
   *  menu do tema. Ver `pedirAPasta` no `Temas`. */
  pedidoAPasta?: PedidoAPasta | null;
  /** O pedido foi servido — o `Temas` esquece-o. */
  aoServirPedido?: (servido: PedidoAPasta) => void;
  /** Quantas propostas usam cada tema — a mesma contagem dos cartões. */
  usos?: Record<string, number> | null;
}) {
  const { toast } = useToast();
  const anular = useAnular();
  // Remover fotos deixa-as 30 dias na Reciclagem (R3b), com «Anular».
  const depoisDeApagarVarios = useDepoisDeApagarVarios();
  /** As fotos JÁ CARREGADAS, mais recentes primeiro. É sempre um PREFIXO da
   *  lista do servidor — ver `nextOffset` abaixo. */
  const [images, setImages] = useState<ThemeImage[]>([]);
  /** Total na pasta segundo o servidor; `null` = ainda não se sabe. */
  const [total, setTotal] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  /** A última página veio cheia → é provável que haja mais. */
  const [pageFull, setPageFull] = useState(false);
  /**
   * PORQUE é que a pasta não se deixou ler. A pasta ilegível já não era
   * confundida com uma pasta vazia — isso estava feito —, mas a razão era
   * sempre a mesma: «é uma falha temporária, recarrega a página daqui a
   * pouco». Com a sessão caída (o caso comum: este ecrã fica aberto horas)
   * isso é falso e o conselho não leva a lado nenhum — recarregar devolve o
   * mesmo 401. Com um 404 também: a pasta não volta por esperar.
   */
  const [falhaDaPasta, setFalhaDaPasta] = useState<LeituraFalhada | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Lotes a decorrer — não um booleano: com dois lotes ao mesmo tempo, o
   *  primeiro a acabar desligava o indicador do outro. */
  const [uploadingCount, setUploadingCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<Failure[]>([]);
  /** As fotos deste arrasto que já estavam no tema. Ao lado do `failed` e com
   *  a mesma forma, mas NEUTRA: não é uma avaria, é o que ela pediu. */
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  /** O tema tem fotos anteriores a esta funcionalidade — dito uma vez, sem
   *  drama, porque explica a única repetida que pode escapar. */
  const [legacyPhotos, setLegacyPhotos] = useState(false);
  /** A pasta não pôde ser lida toda na última verificação. As repetidas que se
   *  encontraram são reais, mas pode ter escapado alguma — e prometer o
   *  contrário seria anunciar uma verificação que não aconteceu. */
  const [partialCheck, setPartialCheck] = useState(false);
  /** A fase de impressão digital, antes de qualquer preparação ou upload. */
  const [verifying, setVerifying] = useState<{ done: number; total: number } | null>(null);
  /** O diálogo "Copiar para…" está aberto. */
  const [copyOpen, setCopyOpen] = useState(false);
  /** E em que modo abre: «Mover para…» do menu da fotografia abre em
   *  «mover», a barra da selecção em «copiar». Sem isto a folha abria sempre
   *  em «copiar» e o menu que dizia «Mover» copiava — ver `modoInicial` no
   *  `ThemeCopyDialog`. Só muda no instante de abrir, por isso não salta a
   *  meio da saída da folha. */
  const [copyMode, setCopyMode] = useState<ThemeCopyMode>("copiar");
  /** O que aconteceu à última cópia/mudança — fica no ecrã enquanto houver
   *  fotos por levar (um número em que ela tem de agir não pode desaparecer). */
  const [copyReport, setCopyReport] = useState<ThemeCopyOutcome | null>(null);
  /** As fotos deste lote que ainda não voltaram do servidor, já à vista com a
   *  imagem que está no disco dela — ver `Pending`. */
  const [pending, setPending] = useState<Pending[]>([]);
  /** `caminho → URL de objeto` das fotos carregadas NESTA sessão: a grelha
   *  mostra a cópia local em vez de ir buscar ao Storage o que já cá está. */
  const [localSrc, setLocalSrc] = useState<Map<string, string>>(new Map());
  /** A página seguinte, já pedida e guardada — ver `prefetch`. */
  const [ahead, setAhead] = useState<Ahead | null>(null);
  /** A geração de miniaturas em falta, quando está a decorrer ou acabou. */
  const [thumbJob, setThumbJob] = useState<ThumbJob | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Índice da foto que está a ser arrastada (null = arrasto parado). */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /** Onde ela cairia se a largasse agora — é o que desenha o espaço aberto. */
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  /**
   * As fotografias à espera de resposta à pergunta de as remover.
   *
   * Um estado só para os dois caminhos — a foto solta e o lote seleccionado —,
   * com o `emBloco` a dizer qual deles age. Dois estados separados seriam duas
   * janelas a poderem abrir ao mesmo tempo.
   */
  const [aRemover, setARemover] = useState<{ alvos: ThemeImage[]; emBloco: boolean } | null>(null);
  /** A ação em bloco que está a decorrer (transferir ou remover), com a
   *  contagem verdadeira. `null` = nada a acontecer. */
  const [emBloco, setEmBloco] = useState<AccaoEmBloco | null>(null);
  const [coverPath, setCoverPath] = useState<string | undefined>(theme.coverPath);
  /** Quantas arrumações da grelha já foram mandadas — ver `persistOrder`. */
  const ordemMandada = useRef(0);
  const [name, setName] = useState(theme.name);
  const [renaming, setRenaming] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * ── O MODO «ESCOLHER A CAPA» ───────────────────────────────────────────
   *
   * «Definir capa…» no menu do tema abre a pasta neste modo: uma faixa com a
   * instrução e «Cancelar» por cima da grelha, e o clique numa fotografia faz
   * dela a capa (o mesmo `setAsCover` do «Definir como capa» da foto) em vez
   * de a seleccionar. O Esc cancela. É a versão de um gesto só do que já se
   * fazia em três (seleccionar, procurar o botão, carregar).
   */
  const [escolherCapa, setEscolherCapa] = useState(false);
  /** O último pedido do menu do tema já servido — ver `pedidoAPasta`. */
  const pedidoAPastaServido = useRef<PedidoAPasta | null>(null);
  useEffect(() => {
    const p = pedidoAPasta;
    if (!p || p.temaId !== theme.id || p === pedidoAPastaServido.current) return;
    pedidoAPastaServido.current = p;
    aoServirPedido?.(p);
    // O seletor de ficheiros só abre com um gesto recente da pessoa — e o
    // clique no item do menu foi há uns milissegundos, no mesmo gesto.
    if (p.accao === "adicionar") inputRef.current?.click();
    else if (p.accao === "renomear") comecarARenomear();
    else comecarAEscolherCapa();
    // As duas acções são funções do corpo (fecham sobre o estado actual).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoAPasta, theme.id, aoServirPedido]);
  function comecarARenomear() {
    setName(theme.name);
    setRenaming(true);
  }
  function comecarAEscolherCapa() {
    setEscolherCapa(true);
  }
  /** Um PATCH de cada vez: confirmar o nome com o Enter dispara também o onBlur. */
  const renamingBusy = useRef(false);
  /** Passa a falso ao sair da pasta — um lote que só termine depois disso não
   *  pode voltar a escrever no estado deste ecrã. */
  const alive = useRef(true);
  /** Profundidade do arrasto: entrar numa foto dispara `dragleave` no
   *  contentor, e a moldura piscava a cada célula por baixo do ponteiro. */
  const dragDepth = useRef(0);
  /** O que a grelha faz à profundidade do arrasto — ver `GrelhaDaPasta`. */
  const arrasto = {
    entrar: () => {
      dragDepth.current += 1;
    },
    sair: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      return dragDepth.current;
    },
    zerar: () => {
      dragDepth.current = 0;
    },
  };
  /**
   * ── O QUE O ARRASTO ENTRE TEMAS PRECISA DE GUARDAR ────────────────────
   *
   * `aMover` é a espera: enquanto ela dura, a barra da selecção mostra a
   * contagem verdadeira em vez de um botão parado (é o mesmo `EmCurso` que a
   * transferência e a remoção já usam).
   *
   * `anuncio` é a região `role="status"` que a Parte 4 exige — «operações de
   * arrasto anunciadas em role="status"». Não é o toast: o toast é para quem
   * VÊ, e um leitor de ecrã não lê um aviso que aparece no canto e se vai
   * embora ao fim de quatro segundos.
   *
   * `recarga` obriga a pasta a reler a primeira página. Serve o «Anular»: as
   * fotografias voltam do tema de destino com CAMINHOS NOVOS no Storage (uma
   * cópia seguida de um apagar, não um renomear) e com URLs assinados novos.
   * Repô-las de memória com o `reinsertAt` desenhava uma grelha de imagens
   * partidas — o que se repõe é o pedido, não o objecto.
   */
  /**
   * ── O REGRESSO DE UM DROP FALHADO ─────────────────────────────────────
   *
   * «Falha no drop: REGRESSO ANIMADO à origem com `--ease-reposition`.»
   * [APPLE], Parte 4 e Parte 5 (475 ms).
   *
   * Metade disto é do browser e não se lhe toca: a imagem de arrasto a voar de
   * volta ao sítio é comportamento nativo do HTML5 drag-and-drop, e a única
   * forma de a substituir era trocar tudo isto por `pointer events` — o que
   * custaria o largar de FICHEIROS e de PASTAS do computador, que é o gesto
   * de origem desta grelha e o único que o HTML5 sabe fazer.
   *
   * A outra metade é nossa, e é a que faltava: a célula de onde a fotografia
   * saiu está a 40% enquanto o arrasto anda, e voltava a 100% num corte de
   * 150 ms — o degrau de um estado a mudar. Não é um estado: é um objecto que
   * voltou para o lugar, e por isso volta com a curva e a duração de
   * reposicionar. Guarda-se o `path` e não o índice, porque a grelha pode
   * ter-se arrumado pelo meio.
   *
   * `dropEffect === "none"` é o sinal que a norma dá para «isto não foi
   * largado em lado nenhum» — Esc a meio, ou largado fora de um destino.
   */
  const [aRegressar, setARegressar] = useState<string | null>(null);
  const [aMover, setAMover] = useState<{ feito: number; total: number } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [recarga, setRecarga] = useState(0);
  /** Âncora do Shift+clique (índice na grelha à vista). */
  const anchor = useRef<number | null>(null);

  /** Todos os URLs de objeto criados nesta pasta. Sair da pasta liberta-os
   *  todos de uma vez — é a única forma de garantir que nenhum fica pendurado,
   *  seja qual for o caminho por onde o lote acabou. */
  const objectUrls = useRef<Set<string>>(new Set());
  /** Pedido para parar a geração de miniaturas (o botão "Parar"). */
  const stopThumbs = useRef(false);

  useEffect(() => {
    alive.current = true;
    const urls = objectUrls.current;
    return () => {
      alive.current = false;
      for (const url of urls) revokeUrl(url);
      urls.clear();
    };
  }, []);

  /** Um URL de objeto para esta foto, já registado para ser libertado à saída. */
  const trackUrl = useCallback((file: File): string | undefined => {
    const url = objectUrl(file);
    if (url) objectUrls.current.add(url);
    return url;
  }, []);

  // `onFolderState` é recriada a cada render do pai; guardá-la numa ref deixa
  // o efeito de notificação depender só do que a pasta sabe.
  const notify = useRef(onFolderState);
  useEffect(() => {
    notify.current = onFolderState;
  });

  useEffect(() => {
    let active = true;
    (async () => {
      // Guardados para o `catch`: é lá que se escreve a frase, e sem estes
      // chegava lá um "falhou" que não diz nem o estado nem o que o servidor
      // explicou.
      let resposta: { status: number } | null = null;
      let corpo: unknown = null;
      try {
        // O rato já pousou neste cartão? Então a listagem pode já estar cá —
        // ver `adiantarTema`. `null` quer dizer «não havia, ou já não vale», e
        // aí paga-se a ida normal, exactamente como antes disto existir.
        //
        // Numa RECARGA não se usa: o que se está a pedir é justamente a
        // verdade nova do servidor (as fotografias que o «Anular» acabou de
        // mandar de volta), e uma página adiantada é, por definição, a de
        // antes.
        const adiantada = recarga === 0 ? await usarAdiantada(theme.id) : null;
        const pagina =
          adiantada ??
          (await (async () => {
            const res = await fetch(
              `/api/temas/${theme.id}/imagens?offset=0&limit=${THEME_PAGE_SIZE}`,
              { cache: "no-store" },
            );
            if (!res.ok) {
              resposta = res;
              corpo = await res.json().catch(() => null);
              throw new Error(String(res.status));
            }
            return paginaDaResposta(await res.json());
          })());
        if (!active) return;
        const page = pagina.images;
        setImages(page);
        setFalhaDaPasta(null);
        // `total: null` é uma pasta que NÃO pôde ser lida — ver
        // `paginaDaResposta`. Aceitá-la como zero faria a grelha dizer "arrasta
        // aqui as fotos" a um tema que pode ter 3000, e ela a carregá-las outra
        // vez.
        setTotal(pagina.total);
        setTruncated(pagina.truncated);
        setPageFull(page.length >= THEME_PAGE_SIZE);
      } catch (e) {
        // Sem lista não se avisa o pai: o cartão guarda a contagem que veio do
        // servidor (que pode ser "Fotos indisponíveis") em vez de dizer "0".
        if (!active) return;
        // A MESMA falha, dita de duas maneiras. O aviso passageiro flutua por
        // cima de qualquer ecrã e por isso nomeia a coisa; o painel que FICA na
        // grelha já tem o nome no título, e repeti-lo lá era dizer duas vezes o
        // que se está a ver.
        const frase = (oQue: string) =>
          resposta ? porqueNaoLeu(oQue, resposta, corpo) : porqueNaoLeuDoErro(oQue, e);
        setFalhaDaPasta(frase(""));
        toast(frase("as fotos deste tema").mensagem, "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [theme.id, toast, recarga]);

  /**
   * O offset da página seguinte é, sempre, quantas fotos já temos.
   *
   * Parece frágil e é o contrário: `images` é mantido como um PREFIXO exato da
   * lista do servidor (mais recentes primeiro). Uma foto nova entra à cabeça
   * das duas listas; uma foto removida sai das duas. Logo, o que o servidor
   * tem a seguir ao que já mostramos está exatamente em `offset =
   * images.length` — mesmo que subam 40 fotos entre uma página e a seguinte,
   * que é o caso em que uma contagem de páginas fixa saltava fotos. O
   * `mergePage` por `path` é a rede por baixo disto.
   */
  const nextOffset = images.length;
  const remaining = total === null ? null : Math.max(0, total - images.length);
  const hasMore = pageFull || (remaining !== null && remaining > 0);

  /** UM único sítio a avisar o pai (contagem + capa do cartão). Avisar também
   *  dentro do upload e da remoção punha o cartão a par de uma lista já
   *  ultrapassada — a contagem ficava a divergir da grelha. */
  const cover = coverPath ? images.find((i) => i.path === coverPath) : images[0];
  useEffect(() => {
    if (loading || total === null) return;
    notify.current({
      total,
      truncated,
      // Uma capa escolhida que ainda não foi carregada (está numa página
      // adiante) não se sabe resolver: melhor não mexer no cartão do que
      // trocar-lhe a capa pela foto mais recente.
      capa: coverPath && !cover ? undefined : (cover ?? null),
    });
  }, [loading, total, truncated, coverPath, cover]);

  // Enquanto sobem fotos, fechar o separador perde o que falta. O browser
  // mostra o seu próprio aviso — é o único que ele deixa aparecer aqui.
  useEffect(() => {
    if (uploadingCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadingCount]);

  const { upload } = useEnvioDeFotos({
    theme,
    toast,
    setImages,
    setTotal,
    setUploadingCount,
    setProgress,
    setFailed,
    setSkipped,
    setLegacyPhotos,
    setPartialCheck,
    setVerifying,
    setPending,
    setLocalSrc,
    alive,
    trackUrl,
  });

  const { runThumbJob } = useMiniaturasDaPasta({
    theme,
    toast,
    setImages,
    images,
    total,
    thumbJob,
    setThumbJob,
    alive,
    stopThumbs,
  });

  const { pick, retryFailed, addSkippedAnyway, handleDrop } = useRepeticaoDoEnvio({
    toast,
    failed,
    setFailed,
    skipped,
    setSkipped,
    alive,
    upload,
  });

  /** Junta ao ecrã uma página que já veio do servidor (pedida agora ou de
   *  antemão). Um só sítio a mexer nestes quatro estados. */
  const absorb = useCallback(
    (page: ThemeImage[], pageTotal: number | null, pageTruncated: boolean, full: boolean) => {
      setImages((prev) => mergePage(prev, page));
      if (pageTotal !== null) setTotal(pageTotal);
      setTruncated(pageTruncated);
      setPageFull(full);
    },
    [],
  );

  async function loadMore() {
    if (loadingMore) return;
    // A página seguinte já cá está: entra sem esperar por nada. É este o
    // caminho normal — o pedido foi feito 1,5 s depois de a pasta abrir.
    if (ahead && ahead.offset === images.length) {
      const next = ahead;
      setAhead(null);
      absorb(next.images, next.total, next.truncated, next.full);
      return;
    }
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/temas/${theme.id}/imagens?offset=${nextOffset}&limit=${THEME_PAGE_SIZE}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("falhou");
      const data = await res.json();
      if (!alive.current) return;
      const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
      absorb(
        page,
        typeof data?.total === "number" ? data.total : null,
        Boolean(data?.truncated),
        page.length >= THEME_PAGE_SIZE,
      );
    } catch {
      toast("Não foi possível carregar mais fotos.", "error");
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }

  /**
   * A PÁGINA SEGUINTE, ANTES DE ELA A PEDIR.
   *
   * Só depois de a primeira estar no ecrã (`PREFETCH_DELAY_MS`), e só UMA: o
   * objetivo é que o "Mostrar mais" seja instantâneo, não descarregar o tema
   * todo às escondidas — um tema tem 4000 fotos e assinar URLs custa ao
   * servidor. A página guardada trava-se a um `offset`: se entretanto entrar
   * ou sair uma foto, deixa de encaixar e é deitada fora (o efeito volta a
   * correr e pede a certa).
   */
  // Uma página guardada só serve no sítio para onde foi pedida: se entretanto
  // entrou (ou saiu) uma foto, ela deixa de encaixar e volta a pedir-se a
  // certa. Isto lê-se, não se apaga — deitar fora o estado dentro do efeito
  // seria uma renderização a mais para dizer o que já se sabe daqui.
  const aheadFits = ahead !== null && ahead.offset === images.length;
  useEffect(() => {
    if (loading || loadingMore || !hasMore || aheadFits) return;
    let cancelled = false;
    const offset = images.length;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const res = await fetch(
            `/api/temas/${theme.id}/imagens?offset=${offset}&limit=${THEME_PAGE_SIZE}`,
            { cache: "no-store" },
          );
          if (!res.ok) return;
          const data = await res.json();
          if (cancelled || !alive.current) return;
          const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
          if (page.length === 0) return;
          setAhead({
            offset,
            images: page,
            total: typeof data?.total === "number" ? data.total : null,
            truncated: Boolean(data?.truncated),
            full: page.length >= THEME_PAGE_SIZE,
          });
        } catch {
          // Falhar a adivinhar não é um erro que se mostre: o botão "Mostrar
          // mais" continua a fazer o pedido à mão, com a sua própria mensagem.
        }
      })();
    }, PREFETCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [theme.id, loading, loadingMore, hasMore, aheadFits, images.length]);

  const { clearSelection, toggleAt, estenderPeloTeclado } = useSeleccaoDaPasta({
    images,
    setSelected,
    anchor,
  });

  const { removeImages, moverParaTema, applyCopyOutcome } = useMoverEApagarFotos({
    theme,
    onCopiedTo,
    toast,
    anular,
    depoisDeApagarVarios,
    images,
    setImages,
    setTotal,
    setCopyOpen,
    setCopyReport,
    setSelected,
    setCoverPath,
    alive,
    setAMover,
    setAnuncio,
    setRecarga,
    anchor,
  });

  const {
    setAsCover,
    moveTo,
    pedirParaRemoverUma,
    rename,
    pedirParaRemoverAsSeleccionadas,
    removeSelected,
  } = useArrumacaoDaPasta({
    theme,
    onRename,
    onCover,
    toast,
    anular,
    setImages,
    images,
    selected,
    setBulkBusy,
    setARemover,
    setEmBloco,
    coverPath,
    setCoverPath,
    ordemMandada,
    name,
    setName,
    setRenaming,
    renamingBusy,
    alive,
    clearSelection,
    removeImages,
  });

  // O `aoSubir` é um `setState` do pai, portanto estável entre desenhos.
  useEffect(() => {
    aoSubir?.(uploadingCount > 0);
    return () => aoSubir?.(false);
  }, [uploadingCount, aoSubir]);

  /** Sair com um lote a meio abandona o que falta — é preciso dizê-lo. */
  function leave() {
    if (uploadingCount > 0 && !window.confirm(AVISO_DE_LOTE_A_MEIO)) return;
    onBack();
  }

  // Uma leitura bem sucedida põe SEMPRE um número em `total` (nem que seja o
  // tamanho da página que veio), por isso `null` aqui só pode querer dizer uma
  // coisa: a pasta não pôde ser lida. Escrever "0 fotos" nesse caso leria-se
  // como "as minhas fotos desapareceram".
  const unreadable = !loading && total === null;
  const countLine = unreadable
    ? photoCountLabel(null)
    : images.length < (total ?? 0)
      ? `${images.length} de ${photoCountLabel(total, truncated)}`
      : photoCountLabel(total ?? 0, truncated);
  const selectedCount = selected.size;
  /** Há para onde levar fotos? Sem outro tema, "Copiar para…" seria um botão
   *  que só sabe abrir um diálogo vazio. */
  const otherThemes = useMemo(() => themes.filter((t) => t.id !== theme.id), [themes, theme.id]);
  // Ver uma foto em grande. `null` = fechado. Guarda-se também o elemento que
  // estava focado, para o foco voltar ao mosaico de onde se abriu.
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  /** O menu do botão direito desta pasta — um só, como na lista de temas. */
  const [menuDaFoto, setMenuDaFoto] = useState<PedidoDeMenu | null>(null);
  const fecharMenuDaFoto = useCallback(() => setMenuDaFoto(null), []);
  const zoomOpener = useRef<HTMLElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  /**
   * ── DE ONDE É QUE A LUPA CRESCE ────────────────────────────────────────
   *
   * «Entrada com `--ease-quick` a partir da POSIÇÃO DA MINIATURA (FLIP), não
   * do centro do ecrã.» (Parte 3 do `docs/APPLE-TEMAS.md`.) Para isso é
   * preciso o rectângulo da célula no instante do gesto — e depois disso a
   * célula pode estar tapada, ou fora do ecrã, ou já não existir.
   *
   * As células registam-se aqui pelo índice. Um `Map` e não um array: as
   * células desmontam-se por baixo (o `content-visibility` da
   * `.celula-saltavel` não desmonta, mas a remoção de uma foto sim) e um
   * array com buracos é um array que engana quem o percorre.
   */
  const celulas = useRef(new Map<number, HTMLElement>());

  /* ════════════════════════════════════════════════════════════════════════
     A GRELHA PELO TECLADO — fase 11 (`docs/APPLE-TEMAS.md`, Parte 7)
     ════════════════════════════════════════════════════════════════════════

     O desenho do Calendário (`diaPelaTecla`): a grelha é UM sítio no fio do
     Tab, e lá dentro as setas andam. Sessenta fotos eram sessenta paragens do
     Tab — mais sessenta «⋯» — antes de se chegar ao que vem depois.

     As colunas MEDEM-SE: o `GRELHA_DE_FOTOS` é `auto-fill`, e o número muda
     com a largura da caixa (2 no telemóvel, 4 a 6 no computador). O browser
     já fez a conta — o `grid-template-columns` calculado traz uma largura por
     coluna —, e é essa conta que se lê. Sem `ResizeObserver` (jsdom) fica o 2
     da base, que é o que a classe diz antes de qualquer `@container`. */
  const grelha = useRef<HTMLDivElement | null>(null);
  const [colunas, setColunas] = useState(2);
  const [fotoComFoco, setFotoComFoco] = useState(0);
  const semFotos = images.length === 0;
  useEffect(() => {
    const el = grelha.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      // `none` é o que o jsdom (e uma caixa sem `display: grid`) responde: não
      // é uma coluna, é a ausência de grelha — fica o que estava.
      const v = getComputedStyle(el).gridTemplateColumns;
      if (!v || v === "none") return;
      const n = v.split(" ").filter(Boolean).length;
      if (n > 0) setColunas(n);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
    // A grelha só existe depois de carregar e com fotos: é quando ela aparece
    // (e não a cada foto) que há uma caixa nova a medir.
  }, [loading, semFotos]);
  const [origemDaLupa, setOrigemDaLupa] = useState<DOMRect | null>(null);
  const openZoom = useCallback((i: number) => {
    zoomOpener.current = document.activeElement as HTMLElement | null;
    const celula = celulas.current.get(i);
    setOrigemDaLupa(celula?.getBoundingClientRect() ?? null);
    setZoomAt(i);
  }, []);
  const closeZoom = useCallback(() => {
    setZoomAt(null);
    // O foco volta de onde veio; sem isto ficava no <body> e o teclado perdia-se.
    zoomOpener.current?.focus?.();
  }, []);

  /** Transfere uma foto (a do visualizador ou a de um mosaico). */
  // Uma foto é um original de vários MB: passa pelo `useDescarga`, que conta
  // os bytes à medida que chegam (o visualizador mostra-os no botão).
  const umaFoto = useDescarga();
  const downloadImage = useCallback(
    async (im: ThemeImage, i: number) => {
      try {
        const { blob } = await umaFoto.obter(im.url);
        // O nome é o NOSSO (tema + número), não o do armazenamento.
        guardarBlob(blob, downloadName(im, theme.name, i));
      } catch {
        toast("Não foi possível transferir a foto.", "error");
      }
    },
    [theme.name, toast, umaFoto],
  );

  /** Transfere as fotos selecionadas, uma de cada vez (ver photo-download.ts). */
  const downloadSelected = useCallback(async () => {
    const chosen = images.map((im, i) => ({ im, i })).filter(({ im }) => selected.has(im.path));
    if (chosen.length === 0) return;
    setDownloading(true);
    // O `downloadMany` já contava — e o `() => {}` que estava aqui deitava a
    // conta fora. Quarenta fotos são um a dois minutos: sem isto, o que ela vê
    // é um botão parado.
    setEmBloco({ tipo: "transferir", feito: 0, total: chosen.length });
    const res = await downloadMany(
      chosen.map(({ im, i }) => ({ url: im.url, filename: downloadName(im, theme.name, i) })),
      (p) => {
        if (alive.current) setEmBloco({ tipo: "transferir", feito: p.done, total: p.total });
      },
    );
    if (alive.current) setEmBloco(null);
    setDownloading(false);
    if (res.failed > 0) {
      toast(
        res.failed === res.total
          ? "Não foi possível transferir as fotos."
          : `${res.total - res.failed} de ${res.total} transferidas.`,
        "error",
      );
    } else {
      toast(plural(res.done, "foto transferida", "fotos transferidas"), "success");
    }
  }, [images, selected, theme.name, toast]);
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  /**
   * Há fotos a ser mostradas a partir do ORIGINAL — é o que acontece a tudo o
   * que foi carregado antes de as miniaturas existirem. Não é uma suposição: é
   * lido das fotos que estão à vista (as que subiram agora contam-se como
   * feitas, porque a miniatura foi com elas).
   */
  const missingThumbs = images.some((im) => !im.thumbUrl && !localSrc.has(im.path));
  const thumbPct =
    thumbJob && thumbJob.total && thumbJob.total > 0
      ? Math.min(100, Math.round((thumbJob.cursor / thumbJob.total) * 100))
      : 0;

  /* ── AS DUAS CAIXAS DESTA VISTA FICAM MONTADAS A SAIR ────────────────────
     A folha de copiar fotos e o visualizador. Os dois fechavam a seco porque
     era este componente que os desmontava; agora o fecho continua a acontecer
     no instante do gesto e o que se segura, 200 ms, é só a imagem.

     Os dados vão CONGELADOS (ver `useNoEcraAteSair`), e aqui isso não é zelo:
     o `applyCopyOutcome` fecha a folha e, na mesma volta, tira da grelha as
     fotos que foram movidas. Sem congelar, a folha passava os 200 ms da saída
     a dizer «0 fotos selecionadas» — a última coisa que se lia dela era uma
     contagem errada. */
  /* Memorizada porque tem de ser ESTÁVEL entre desenhos — ver a nota do
     `useNoEcraAteSair`. E pela ordem da GRELHA, não pela ordem por que ela
     clicou: é assim que a lista do relatório se lê como a grelha se vê. */
  const seleccionadas = useMemo(
    () => images.filter((im) => selected.has(im.path)).map((im) => im.path),
    [images, selected],
  );
  const aSairDaCopia = useSaidaDeUmSo(copyOpen);
  const copiaNoEcra = useNoEcraAteSair(copyOpen, aSairDaCopia, seleccionadas);

  /**
   * ── ⌘A SELECIONA TUDO, ESC LIMPA ───────────────────────────────────────
   *
   * Os dois atalhos que faltavam à selecção desta pasta (ponto 15 da auditoria
   * e a `SelectionBar` da Parte 3 do `docs/APPLE-TEMAS.md`: «Esc limpa a
   * seleção»). Com 312 fotos numa pasta, escolher todas era 312 cliques.
   *
   * ── O QUE ESTE OUVINTE NÃO PODE ROUBAR ────────────────────────────────
   *
   *  · o ⌘A DENTRO DE UM CAMPO — renomear o tema é um `<input>`, e lá o ⌘A
   *    selecciona o texto. Roubá-lo seria tirar um atalho para dar outro;
   *  · o Esc de quem tem uma janela aberta por cima — a pergunta de remover, o
   *    «Copiar para…», a lupa e o próprio menu de contexto fecham-se com Esc, e
   *    quem carrega está a fechar ESSA e não a desfazer a selecção que fez
   *    antes de a abrir. Por isso os quatro travam aqui;
   *  · o ⌘A com a pasta vazia — sem fotos não há nada a seleccionar, e
   *    `preventDefault` sem fazer nada seria só um atalho estragado.
   *
   * `Escape` sem selecção não faz nada e NÃO trava o evento: o teclado do
   * back office tem outros donos por cima deste ecrã.
   */
  useEffect(() => {
    const janelaAberta = copyOpen || aRemover !== null || zoomAt !== null || renaming;
    const noTeclado = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const aEscrever =
        !!alvo &&
        (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      // No modo «escolher a capa» o Esc cancela o modo — e só isso: a
      // selecção que houvesse fica como estava.
      if (e.key === "Escape" && escolherCapa && !janelaAberta) {
        setEscolherCapa(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        if (aEscrever || janelaAberta || escolherCapa || images.length === 0) return;
        e.preventDefault();
        setSelected(new Set(images.map((im) => im.path)));
        // A âncora fica na última: um Shift+clique a seguir a um ⌘A encurta a
        // selecção a partir do fim, que é o que um gestor de ficheiros faz.
        anchor.current = images.length - 1;
        return;
      }
      if (e.key === "Escape" && !janelaAberta) {
        // Actualizador funcional: assim o ouvinte não precisa de conhecer a
        // selecção actual e não se volta a registar a cada foto escolhida.
        setSelected((prev) => (prev.size > 0 ? new Set() : prev));
        anchor.current = null;
      }
    };
    document.addEventListener("keydown", noTeclado);
    return () => document.removeEventListener("keydown", noTeclado);
  }, [images, copyOpen, aRemover, zoomAt, renaming, escolherCapa]);

  /**
   * ── A LARGADA CHEGA DA COLUNA DA ESQUERDA ──────────────────────────────
   *
   * O `dragstart` é aqui, o `drop` é lá, e o `pedidoDeMover` é o que os liga
   * (ver a nota no `Temas`). O efeito dispara pelo CONTADOR e não pelo
   * objecto: dois arrastos seguidos para o mesmo tema com as mesmas fotos são
   * dois pedidos, e um `useEffect` que comparasse o destino não via o segundo.
   *
   * O `spring loading` pode ter aberto OUTRO tema antes da largada, e nesse
   * caso esta pasta já não é a origem do lote — por isso o pedido só é servido
   * quando a carga saiu mesmo daqui.
   */
  const pedidoServido = useRef(0);
  useEffect(() => {
    if (!pedidoDeMover || pedidoDeMover.n === pedidoServido.current) return;
    pedidoServido.current = pedidoDeMover.n;
    if (pedidoDeMover.carga.origem !== theme.id) return;
    void moverParaTema(pedidoDeMover.destino, pedidoDeMover.carga.paths);
    // `moverParaTema` fecha sobre o estado actual da grelha de propósito — é
    // uma função do corpo, como o `moveTo` e o `setAsCover`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDeMover, theme.id]);

  /**
   * ── O MENU DE UMA FOTOGRAFIA ───────────────────────────────────────────
   *
   * «Menu de contexto no tema e NA FOTOGRAFIA» (ponto 8 da auditoria). As
   * quatro acções são as que já estão desenhadas em cima da célula — é a regra
   * da Apple que o documento cita: «tudo o que está no menu de contexto existe
   * também na interface principal». Aqui ganham nome escrito, que é o que os
   * três círculos sem rótulo do ponto 18 nunca tiveram.
   *
   * Os botões da célula FICAM (ao contrário dos chips do cartão de tema, que
   * saíram): cada um é o único caminho de DEDO para o que faz — o arrasto de
   * reordenar é HTML5 e não pega no telemóvel — e um menu de contexto sem
   * botão direito não existe. A razão está escrita por extenso na célula.
   */
  const accoesDaFoto = useCallback(
    (im: ThemeImage, i: number): AccaoDeItem[] =>
      emGrupos(
        /* ── PELA ORDEM DO DOCUMENTO ──────────────────────────────────────
           Parte 3 do `docs/APPLE-TEMAS.md`: «Pré-visualizar · Abrir tamanho
           real — separador — Mover para… · Duplicar para… · Definir como
           capa — separador — Remover do tema». O «Remover do tema…» guarda
           as reticências porque continua a perguntar antes de remover.

           «Pôr no início» voltou ao menu a 14/10, quando o ↑ da célula
           saiu com os outros dois círculos: é o caminho de dedo para isso
           (com teclado também há o Alt+Home). */
        [
          { id: "ver", rotulo: "Pré-visualizar", onAccao: () => openZoom(i) },
          {
            id: "original",
            rotulo: "Abrir tamanho real",
            // O original, num separador novo — o que o browser faz com ele é
            // dele (ver, guardar, imprimir). `noopener`: a página aberta não
            // fica com a mão nesta.
            onAccao: () => void window.open(im.url, "_blank", "noopener"),
          },
        ],
        [
          /* ── A ALTERNATIVA POR MENU É OBRIGATÓRIA ─────────────────────
             «Alternativa por menu obrigatória — "Mover para…" faz o mesmo sem
             arrastar.» [APPLE], Parte 4. Abre a folha que já existe
             (`ThemeCopyDialog`) no modo certo, e leva a foto do menu se ela
             não estiver na selecção. «Duplicar para…» é a mesma folha em
             «Copiar». Só com outros temas para onde levar. */
          ...(otherThemes.length > 0
            ? [
                {
                  id: "mover",
                  rotulo: "Mover para…",
                  onAccao: () => {
                    setSelected((prev) => (prev.has(im.path) ? prev : new Set([im.path])));
                    setCopyMode("mover");
                    setCopyOpen(true);
                  },
                },
                {
                  id: "duplicar",
                  rotulo: "Duplicar para…",
                  onAccao: () => {
                    setSelected((prev) => (prev.has(im.path) ? prev : new Set([im.path])));
                    setCopyMode("copiar");
                    setCopyOpen(true);
                  },
                },
              ]
            : []),
          ...(im.path === coverPath
            ? []
            : [{ id: "capa", rotulo: "Definir como capa", onAccao: () => void setAsCover(im) }]),
          /* Era o ↑ da célula, que saiu com os outros dois círculos (14/10):
             passa a ser uma linha do menu, para continuar a haver um caminho
             de dedo — o arrasto de reordenar é HTML5 e não pega no
             telemóvel. Na primeira foto não aparece: já está no início. */
          ...(i > 0
            ? [{ id: "inicio", rotulo: "Pôr no início", onAccao: () => moveTo(i, 0) }]
            : []),
        ],
        [
          {
            id: "remover",
            rotulo: "Remover do tema…",
            destrutiva: true,
            onAccao: () => pedirParaRemoverUma(im),
          },
        ],
      ),
    // `setAsCover` e `pedirParaRemoverUma` são funções do corpo do componente
    // e mudam a cada desenho de propósito (fecham sobre o estado actual da
    // grelha). O que importa fixar é a foto e a capa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coverPath, openZoom, otherThemes.length],
  );

  /* AS FOTOS QUE ELA ACABOU DE LARGAR, já à vista, ainda a caminho do
     servidor. Não são selecionáveis nem removíveis (ainda não existem lá), e o
     leitor de ecrã segue a barra de progresso — não 300 células a
     anunciarem-se. Ocupam as primeiras casas da grelha, e é por isso que a
     conta das linhas (e das setas) começa nelas. */
  const pendentes = pending.map((p) => (
    <div
      key={p.id}
      aria-hidden
      title={`${p.name} — a carregar`}
      className="relative aspect-[4/3] min-h-[104px] overflow-hidden rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-6)]"
    >
      {p.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.src}
          alt=""
          decoding="async"
          className="h-full w-full object-cover opacity-60"
        />
      ) : (
        <div className="bo-skeleton h-full w-full" />
      )}
      <span className="absolute inset-x-1 bottom-1 rounded-md bg-black/55 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-[0.06em] text-white">
        A carregar
      </span>
    </div>
  ));

  /** Uma célula da grelha: a foto `i` de `images`. */
  /** A foto que está no fio do Tab — uma só; as outras chegam-se pelas setas. */
  const focoNaGrelha = Math.max(0, Math.min(fotoComFoco, images.length - 1));
  const focarFoto = (k: number) => {
    setFotoComFoco(k);
    celulas.current.get(k)?.querySelector<HTMLElement>('[role="checkbox"]')?.focus();
  };

  const celulaDaFoto = (im: ThemeImage, i: number) => {
    const isSelected = selected.has(im.path);
    const isCover = im.path === coverPath;
    return (
      <div
        key={im.path}
        role="gridcell"
        aria-selected={isSelected}
        aria-rowindex={Math.floor((pending.length + i) / colunas) + 1}
        aria-colindex={((pending.length + i) % colunas) + 1}
        ref={(no) => {
          if (no) celulas.current.set(i, no);
          else celulas.current.delete(i);
        }}
        draggable
        onDragStart={(e) => {
          setDragFrom(i);
          e.dataTransfer.effectAllowed = "move";
          // Alguns navegadores só iniciam o arrasto com dados lá
          // dentro; o valor não é usado por ninguém.
          e.dataTransfer.setData("text/plain", String(i));
          /* ── E O MESMO GESTO SERVE OS DOIS DESTINOS ─────────
               «Dentro do mesmo tema REORDENA; para outro tema
               MOVE.» [APPLE] É um arrasto só, com duas cargas: o
               índice em `text/plain`, que é o que as células
               vizinhas lêem para reordenar, e o lote de caminhos no
               tipo próprio, que é o que a coluna da esquerda lê
               para mover. Quem decide é o destino onde ele acaba.

               E o lote é a SELECÇÃO quando se pega numa foto que
               está nela — ver `fotosQueViajam`. */
          const lote = fotosQueViajam(
            im.path,
            selected,
            images.map((x) => x.path),
          );
          escreverCarga(e.dataTransfer, { origem: theme.id, paths: lote });
          vestirOArrasto(e, lote.length);
          aoArrastar?.(true);
        }}
        onDragEnd={(e) => {
          // Ver a nota do `aRegressar`: `none` é a norma a dizer
          // que isto não foi largado em destino nenhum.
          const falhou = e.dataTransfer?.dropEffect === "none";
          setDragFrom(null);
          setDragOver(null);
          aoArrastar?.(false);
          setARegressar(falhou ? im.path : null);
        }}
        // O regresso acaba quando acaba — sem temporizador a
        // repetir o número que já está no token. Deixá-lo aceso
        // punha esta célula (e só ela) a responder ao rato em
        // 475 ms para sempre.
        onTransitionEnd={() => setARegressar((p) => (p === im.path ? null : p))}
        onDragOver={(e) => {
          if (dragFrom === null) return;
          // Sem isto o browser recusa a largada.
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOver !== i) setDragOver(i);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragFrom !== null) moveTo(dragFrom, i);
          setDragFrom(null);
          setDragOver(null);
        }}
        // `celula-saltavel`: fora do ecrã, o browser não desenha
        // nem descodifica esta célula. A altura não depende disso
        // (é `aspect-[4/3]` numa coluna de largura fixa), por
        // isso a barra de deslocamento não mexe. Ver globals.css.
        /* O botão direito abre as mesmas quatro acções que os
             botões da célula — ver `accoesDaFoto`. O menu é `fixed`,
             portanto o `overflow-hidden` desta célula (que a recorta
             aos cantos redondos) não o corta. */
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuDaFoto({
            x: e.clientX,
            y: e.clientY,
            sobre: `foto ${i + 1} de ${images.length}`,
            accoes: accoesDaFoto(im, i),
          });
        }}
        className={`celula-saltavel group relative aspect-[4/3] min-h-[104px] overflow-hidden rounded-lg border bg-[var(--bo-tinta-6)] ${ESTADO} ${
          isSelected
            ? "border-sage-600 ring-2 ring-sage-600/40"
            : "border-[var(--bo-hairline-strong)]"
        } ${dragFrom === i ? "opacity-40" : ""} ${
          dragOver === i && dragFrom !== null && dragFrom !== i ? "ring-2 ring-sage-600" : ""
        } ${
          // Os tokens do documento, lidos do `:root` — nem o
          // número nem a curva se escrevem aqui.
          aRegressar === im.path
            ? "motion-safe:[transition-duration:var(--transition-duration-reposition)] motion-safe:[transition-timing-function:var(--ease-reposition)]"
            : ""
        }`}
      >
        {/* A célula já tem `aspect-[4/3]`, por isso adiar a foto
              não salta nada. E o que se mostra é a MINIATURA: com o
              original, uma página de 60 fotos puxava ~150 MB. As da
              primeira dobra não esperam pela vez de ninguém. */}
        <Photo image={im} alt="" priority={i < ABOVE_FOLD} localSrc={localSrc.get(im.path)} />
        {/* A célula inteira é o alvo da seleção — um alvo pequeno
              numa grelha de 60 fotos seria um exercício de pontaria. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          tabIndex={i === focoNaGrelha ? 0 : -1}
          onFocus={() => setFotoComFoco(i)}
          aria-label={
            escolherCapa
              ? `Usar a foto ${i + 1} de ${images.length} como capa`
              : `Selecionar foto ${i + 1} de ${images.length}`
          }
          onClick={(e) => {
            // No modo «escolher a capa», o clique escolhe-a.
            if (escolherCapa) {
              setEscolherCapa(false);
              void setAsCover(im);
              return;
            }
            // `ctrlKey` ao lado do `metaKey` porque o back office
            // também se abre em Windows e em Linux, onde o gesto
            // de somar à selecção é o Ctrl.
            toggleAt(i, { shift: e.shiftKey, somar: e.metaKey || e.ctrlKey });
          }}
          // ── `ESPAÇO` PRÉ-VISUALIZA ──────────────────────────
          // «É o gesto que qualquer utilizador de Mac tenta
          // primeiro» (ponto 23), e o critério 5 do documento.
          // Anunciado, para não ser um segredo: um atalho que só
          // quem leu o documento conhece não existe.
          aria-keyshortcuts="Space"
          onKeyDown={(e) => {
            /* ── O `ESPAÇO` É DO QUICK LOOK, O `ENTER` ALTERNA ──────
                 Fase 11 (`docs/APPLE-TEMAS.md`, Parte 7): a célula é
                 um `role="gridcell"` com `aria-selected`, e numa
                 grelha o `Espaço` não é de ninguém — fica para o
                 Quick Look, como o documento manda duas vezes. Marcar
                 e desmarcar é o `Enter`, que num `<button>` dispara o
                 `click`. A caixa de seleção cá dentro continua (é o
                 alvo do dedo e do rato, a célula inteira), e o
                 `aria-checked` dela diz o mesmo que o `aria-selected`
                 da célula. */
            if (e.key === " " || e.key === "Spacebar") {
              e.preventDefault();
              openZoom(i);
              return;
            }
            // Shift+F10 e a tecla de menu: o botão direito do
            // teclado, ancorado ao canto de baixo da célula.
            if (teclaDeMenu(e)) {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setMenuDaFoto({
                x: r.left,
                y: r.bottom,
                sobre: `foto ${i + 1} de ${images.length}`,
                accoes: accoesDaFoto(im, i),
              });
              return;
            }
            // SEM o Alt, as setas andam entre as fotos (`fotoPelaTecla`),
            // e o `Shift` leva a selecção com elas. As fotos a carregar
            // ocupam as primeiras casas: entram na conta das linhas, mas
            // o foco não pára nelas.
            if (!e.altKey) {
              const P = pending.length;
              const v = fotoPelaTecla(
                P + i,
                e.key,
                colunas,
                P + images.length,
                e.metaKey || e.ctrlKey,
              );
              if (v === null) return;
              e.preventDefault();
              const para = Math.max(P, v) - P;
              if (para === i) return;
              if (e.shiftKey && e.key.startsWith("Arrow")) estenderPeloTeclado(i, para);
              focarFoto(para);
              return;
            }
            // Alt + setas move a foto.
            const to =
              e.key === "ArrowLeft" || e.key === "ArrowUp"
                ? i - 1
                : e.key === "ArrowRight" || e.key === "ArrowDown"
                  ? i + 1
                  : e.key === "Home"
                    ? 0
                    : null;
            if (to === null) return;
            e.preventDefault();
            const destino = Math.max(0, Math.min(images.length - 1, to));
            // O foco vai com a foto (a célula é a mesma, pela `key`), e o
            // fio do Tab também.
            setFotoComFoco(destino);
            moveTo(i, destino);
          }}
          className={`absolute inset-0 h-full w-full ${ESTADO} ${PRESSAO}`}
        >
          {/* O círculo da selecção, à maneira da app Fotografias:
                um anel branco fino sobre um véu escuro leve (sem
                sombra: esta casa não põe sombras em conteúdo — ver
                `sombras-do-back-office.test.ts`), e cheio com o
                visto quando está escolhida (14/10, «tipo apple»). */}
          <span
            aria-hidden
            className={`absolute left-2 top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-white ${ESTADO} ${
              isSelected
                ? "bg-sage-600 text-white opacity-100"
                : "bg-black/25 text-transparent opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:group-focus-within:opacity-100"
            }`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </button>
        {isCover && (
          <span className="bo-vidro-claro pointer-events-none absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white">
            Capa
          </span>
        )}
        {/* ── UM SÓ «⋯», EM VIDRO CLARO ───────────────────────────
              Eram três círculos escuros (↑, ⤢, ×) por cima de cada
              fotografia. O documento dela manda um só, e ela
              escolheu-o (14/10, «tipo apple»): «um botão discreto ⋯
              no canto superior direito, em vidro claro, que abre o
              mesmo menu do botão direito» (APPLE-TEMAS, ponto 9 e
              critério 3). As acções passam a ter nome escrito.

              O desenho é o do «⋯» do cartão de tema — 28 px à vista,
              `.bo-vidro-claro`, glifo branco, sem desfoque (um por
              foto eram centenas) — e o alvo cresce para os 44 no
              dedo sem o disco crescer (`.alvo-invisivel`). O painel
              é o `MenuDeContexto`, que é `fixed`: o do
              `MenuDeAccoes` é `absolute` e esta célula é
              `overflow-hidden`, portanto sairia cortado.

              Continua tudo a um caminho de dedo: Pré-visualizar,
              Pôr no início, Remover… estão no menu. Com rato, só
              aparece por cima da foto ou com o foco lá dentro. */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuDaFoto?.de === im.path}
          aria-label={`Acções da foto ${i + 1} de ${images.length}`}
          tabIndex={i === focoNaGrelha ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setMenuDaFoto({
              x: r.left,
              y: r.bottom + 4,
              de: im.path,
              sobre: `foto ${i + 1} de ${images.length}`,
              accoes: accoesDaFoto(im, i),
            });
          }}
          className={`bo-vidro-claro alvo-invisivel absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:group-focus-within:opacity-100 com-rato:focus-visible:opacity-100 ${
            menuDaFoto?.de === im.path ? "com-rato:opacity-100" : ""
          } ${ESTADO} ${PRESSAO}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </div>
    );
  };

  const aSairDaLupa = useSaidaDeUmSo(zoomAt !== null);
  const indiceDaLupa = useNoEcraAteSair(zoomAt !== null, aSairDaLupa, zoomAt);

  return (
    <div>
      <CabecalhoDaPasta
        theme={theme}
        accoes={accoes}
        usos={usos}
        loading={loading}
        uploadingCount={uploadingCount}
        name={name}
        setName={setName}
        renaming={renaming}
        setRenaming={setRenaming}
        inputRef={inputRef}
        rename={rename}
        leave={leave}
        countLine={countLine}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      <AvisosDaPasta
        theme={theme}
        progress={progress}
        failed={failed}
        setFailed={setFailed}
        skipped={skipped}
        setSkipped={setSkipped}
        legacyPhotos={legacyPhotos}
        partialCheck={partialCheck}
        verifying={verifying}
        setCopyOpen={setCopyOpen}
        setCopyMode={setCopyMode}
        copyReport={copyReport}
        setCopyReport={setCopyReport}
        thumbJob={thumbJob}
        pararMiniaturas={() => {
          stopThumbs.current = true;
        }}
        trackUrl={trackUrl}
        runThumbJob={runThumbJob}
        retryFailed={retryFailed}
        addSkippedAnyway={addSkippedAnyway}
        unreadable={unreadable}
        selectedCount={selectedCount}
        pct={pct}
        missingThumbs={missingThumbs}
        thumbPct={thumbPct}
      />

      <BarraDaSeleccaoDaPasta
        images={images}
        setCopyOpen={setCopyOpen}
        setCopyMode={setCopyMode}
        selected={selected}
        bulkBusy={bulkBusy}
        emBloco={emBloco}
        aMover={aMover}
        anuncio={anuncio}
        clearSelection={clearSelection}
        pedirParaRemoverAsSeleccionadas={pedirParaRemoverAsSeleccionadas}
        setAsCover={setAsCover}
        selectedCount={selectedCount}
        otherThemes={otherThemes}
        downloading={downloading}
        downloadSelected={downloadSelected}
      />

      {copiaNoEcra && (
        <ThemeCopyDialog
          aberto={copyOpen}
          modoInicial={copyMode}
          sourceTheme={theme}
          themes={themes}
          // Congelada no instante do fecho, para a contagem não mudar a meio
          // da saída — o `applyCopyOutcome` tira da grelha, na mesma volta, as
          // fotos que foram movidas.
          paths={copiaNoEcra}
          onClose={() => setCopyOpen(false)}
          onDone={applyCopyOutcome}
        />
      )}

      <MenuDeContexto pedido={menuDaFoto} onFechar={fecharMenuDaFoto} />

      {indiceDaLupa !== null && images[indiceDaLupa] && (
        <PhotoLightbox
          aberto={zoomAt !== null}
          images={images}
          index={indiceDaLupa}
          onIndexChange={setZoomAt}
          onClose={closeZoom}
          onDownload={downloadImage}
          downloading={downloading || umaFoto.aCorrer}
          transferencia={umaFoto.mostrar ? umaFoto.barra : null}
          // De onde a lupa cresce. `null` quando a célula já não está no ecrã
          // — aí abre como abria, do centro.
          origem={origemDaLupa}
        />
      )}

      {/* A faixa do modo «escolher a capa». Opaca, como a grelha por baixo
          dela — vidro só no que flutua (`docs/LIQUID-GLASS.md`, Parte 5), e
          esta vista já tem a sua camada na barra da selecção. */}
      {escolherCapa && (
        <div
          data-escolher-capa
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--bo-raio-conteudo)] bg-[var(--bo-accent-lavagem)] px-3 py-2"
        >
          <p role="status" className="text-sm text-[var(--bo-text)]">
            Escolhe a fotografia da capa.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setEscolherCapa(false)}>
            Cancelar
          </Button>
        </div>
      )}

      <GrelhaDaPasta
        theme={theme}
        images={images}
        truncated={truncated}
        falhaDaPasta={falhaDaPasta}
        loading={loading}
        loadingMore={loadingMore}
        pending={pending}
        setDrag={setDrag}
        drag={drag}
        arrasto={arrasto}
        remaining={remaining}
        hasMore={hasMore}
        handleDrop={handleDrop}
        loadMore={loadMore}
        unreadable={unreadable}
        grelha={grelha}
        colunas={colunas}
        pendentes={pendentes}
        celulaDaFoto={celulaDaFoto}
      />

      {/* ── A PERGUNTA É A DA CASA ────────────────────────────────────────
          Uma janela para os dois caminhos — a foto solta e o lote. Folha
          inferior no telemóvel, ao pé do polegar; o verbo no botão. */}
      <PerguntaDestrutiva
        aberto={!!aRemover}
        onFechar={() => setARemover(null)}
        titulo={
          !aRemover
            ? ""
            : aRemover.alvos.length === 1
              ? "Remover esta fotografia do tema?"
              : `Remover ${plural(aRemover.alvos.length, "fotografia", "fotografias")} de «${theme.name}»?`
        }
        aviso="As propostas já feitas com estas fotos não são afectadas. Ficam 30 dias na Reciclagem, de onde podem voltar."
        rotuloConfirmar={
          aRemover && aRemover.alvos.length > 1 ? "Remover as fotografias" : "Remover a fotografia"
        }
        // Fecha primeiro e só depois age: a grelha é optimista, e no lote a
        // barra de progresso toma o lugar da selecção — uma caixa por cima
        // taparia precisamente o que diz que ainda há pedidos a caminho.
        onConfirmar={() => {
          const pedido = aRemover;
          setARemover(null);
          if (!pedido) return;
          if (pedido.emBloco) void removeSelected(pedido.alvos);
          else void removeImages(pedido.alvos);
        }}
      />
    </div>
  );
}
