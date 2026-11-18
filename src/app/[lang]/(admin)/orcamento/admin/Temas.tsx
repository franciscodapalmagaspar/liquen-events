"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { servirUmaVez, type PedidoDaPaleta } from "./procura-em-tudo";
import { useMaisAoDescer } from "./useMaisAoDescer";
import type { ThemeSummary } from "@/lib/theme-types";
import FundirTemas, { type ThemeMergeOutcome } from "./FundirTemas";
import { temasParecidos } from "@/lib/temas-parecidos";
import { normalizedThemeName } from "@/lib/theme-types";
import { textoDaRecusa, tituloDaRecusa } from "@/lib/erro-do-servidor";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { useDepoisDeApagar } from "./ui/depois-de-apagar";
import { Button, Card, EmptyState, emGrupos, PerguntaDestrutiva, type AccaoDeItem } from "./ui";
import { esquecerBiblioteca } from "./theme-picker-cache";
import BibliotecaRevisao from "./BibliotecaRevisao";
import { capaDaFoto, comCapa } from "./capa-do-cartao";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { useSaidaDeUmSo } from "./ui/saida";
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
import ListaDeTemas from "./ListaDeTemas";
import { bibliotecaAlterada } from "./biblioteca-alterada";
import { type CargaDeFotos } from "@/lib/temas-arrasto";
import { fraseDeEliminar } from "@/lib/temas/textos-dos-temas";
import { Densidade, Ordem, contarFotosDaBiblioteca, ordenarTemas } from "@/lib/temas/ordem";
import { COLUNAS, lerDensidade, lerOrdem } from "./_temas/preferencias-da-biblioteca";
import {
  FolderIcon,
  ICONE_ABRIR,
  ICONE_ADICIONAR,
  ICONE_CAPA,
  ICONE_RENOMEAR,
} from "./_temas/icones";
import { FolderState, PedidoAPasta } from "./_temas/tipos-da-pasta";
import { ListaDaBiblioteca } from "./_temas/ListaDaBiblioteca";
import { NovoTema } from "./_temas/NovoTema";
import { BarraDaBiblioteca } from "./_temas/BarraDaBiblioteca";
import { plural } from "@/lib/plural";
import { AVISO_DE_LOTE_A_MEIO, PastaDoTema } from "./_temas/PastaDoTema";
import { useNoEcraAteSair } from "./_temas/useNoEcraAteSair";

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
          <PastaDoTema
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
