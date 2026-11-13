"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Supplier, CabecalhoDaFolha, Quote, TimelineItem } from "@/lib/orcamento/types";
import {
  agoraNaRegua,
  horaDoMinuto,
  oQueVemASeguir,
  porExtenso,
} from "@/lib/orcamento/guiao-do-dia";
import {
  GRAVIDADE_DO_SINAL,
  janelaComum,
  ordenarGuioes,
  sinalPrincipal,
  type GuiaoNaLista,
  type ResumoDeGuiao,
  type SinalDoGuiao,
  type TipoDeSinal,
} from "@/lib/orcamento/guioes";
import type { ModeloDeGuiao, MomentoDeModelo } from "@/lib/orcamento/guiao-modelos";
import { Button, EmCurso, EmptyState, Field, Segmented } from "./ui";
import { FalhaDaDescarga, useDescarga } from "./ui/descarregar";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { SkeletonList } from "./Skeleton";
import { useCachedList } from "./useCachedList";
import { useToast } from "./Toast";
import { printRunSheet } from "./export";
import { ReguaDoDia } from "./ReguaDoDia";
import { FolhaDaTimeline } from "./FolhaDaTimeline";
import EventTimeline, { GRAVAR_AO_ESCREVER_MS } from "./EventTimeline";
import { BotaoWhatsApp } from "./ui/BotaoWhatsApp";
import { timelineParaWhatsApp } from "@/lib/whatsapp";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { diaPorExtenso } from "@/lib/data-curta";
import {
  CartaoDoEvento,
  GrelhaDeEventos,
  filtrarPorProcura,
  useEventosArrumados,
} from "./ListaDeEventos";
import { useCamadaDeHistoria } from "./useCamadaDeHistoria";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GUIÕES DO DIA — A CASA PRÓPRIA DE UMA COISA QUE JÁ EXISTIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O QUE ESTA VISTA É, E O QUE ELA DELIBERADAMENTE NÃO É ────────────────
 *
 * O guião do dia já estava escrito e resolvido: o motor (`guiao-do-dia.ts`) sabe
 * onde cada momento começa e acaba, quem está em dois sítios ao mesmo tempo e
 * onde estão os vazios; o `EventTimeline` sabe desenhá-lo à escala, editá-lo com
 * o polegar e gravá-lo com protecção contra duas pessoas a escrever ao mesmo
 * tempo. O que faltava não era nenhuma dessas coisas.
 *
 * Faltava CHEGAR LÁ. O guião vivia dentro da zona de produção de UM evento, a
 * três aberturas de distância: escolher o pedido, abrir o pedido, descer até à
 * Produção. Ou seja, a pergunta de segunda-feira de manhã — «dos eventos que aí
 * vêm, quais é que já têm guião e quais é que têm um problema?» — não tinha
 * ecrã nenhum, porque não se responde a abrir vinte pedidos.
 *
 * Por isso esta vista **não reescreve o editor**: monta o `EventTimeline` que já
 * existe, com o `analisarODia` que já existe, e acrescenta só o que faltava —
 * a lista de todos, a régua deitada que os torna comparáveis, e os modelos.
 * Um segundo editor de guiões a viver ao lado do primeiro era o defeito que o
 * `CLAUDE.md` manda evitar por escrito.
 *
 * ── DE ONDE VÊM OS DADOS, E PORQUE SÃO DUAS FONTES ───────────────────────
 *
 *  · a LISTA vem de `/api/guioes`, porque o `timeline` é um dos campos que o
 *    resumo dos pedidos deixa cair de propósito (`CAMPOS_SO_DO_DETALHE`);
 *  · o PEDIDO ABERTO vem do `carregarPedido`, que é o `comPedidoInteiro` do
 *    AdminClient. Não é preguiça de não o pedir aqui: essa função sabe uma
 *    coisa que se aprendeu a doer — a rota do pedido responde 200 com uma
 *    versão CURTA quando a sessão caiu, e só o cabeçalho `x-pedido: completo`
 *    distingue as duas. Uma segunda leitura escrita aqui herdava o defeito.
 */

interface Props {
  /**
   * Vai buscar o pedido inteiro (com o guião, a checklist e os pagamentos que a
   * folha do dia imprime). O AdminClient guarda o que já leu, portanto voltar
   * ao mesmo evento não paga segunda viagem.
   */
  carregarPedido: (
    id: string,
  ) => Promise<{ ok: true; quote: Quote } | { ok: false; porque: string }>;
  /** O guião mudou — para a lista de pedidos do back office ficar em dia. */
  onQuoteAtualizado?: (quote: Quote) => void;
}

type Filtro = "todos" | "por-fazer" | "problemas";
/** Que eventos entram na lista: só os fechados, ou todos os que têm data. */
type Ambito = "fechados" | "todos";

/**
 * ── AS DUAS MANEIRAS DE OLHAR PARA O MESMO DIA ────────────────────────────
 *
 * A régua vertical (`EventTimeline`) e a grelha por responsável
 * (`GrelhaDoDia`) não são duas versões da mesma coisa com desenhos
 * diferentes: respondem a duas perguntas que se fazem em dias diferentes.
 *
 *  · **Régua** — «isto cabe?». Uma pista só, o dia inteiro por ordem, com os
 *    vazios e as sobreposições marcados entre os blocos. É a pergunta da
 *    VÉSPERA, e é o único sítio onde se EDITA e se GRAVA (com o 409 e o
 *    «voltar a aplicar» que já lá estão). A grelha não grava nada — se
 *    gravasse, eram duas gravações a discordar sobre o mesmo dia, que é
 *    exactamente o defeito que o `CLAUDE.md` manda evitar.
 *
 *  · **Por pessoa** — «quem está onde às 14:00, e quem está livre para a
 *    próxima coisa?». Uma coluna por responsável, as horas a descer. É a
 *    pergunta do DIA DO EVENTO, feita de pé, com as mãos ocupadas. A régua não
 *    lhe responde por construção: mistura toda a gente na mesma pista, e ler
 *    «quem está livre» obriga a percorrer o dia a ler nomes.
 *
 * ── E O COMUTADOR ENTRE AS DUAS SAIU ────────────────────────────────────
 *
 * «Aqui basta apenas editar», com a captura do comutador à frente. E ela tem
 * razão pela razão certa: a FOLHA passou a estar ao lado do editor, portanto
 * já não é preciso trocar de vista para ver como está a ficar. Um comutador
 * entre duas coisas em que uma delas deixou de ser precisa é ruído com aspecto
 * de escolha.
 *
 * O que fica dito, e não escondido: a `GrelhaDoDia` continua no código, com os
 * seus testes, e neste momento **não tem porta**. A pergunta a que ela responde
 * («quem está livre às 14:00?») continua a ser boa e continua sem ecrã — só
 * que se faz NO DIA, de pé, e não enquanto se escreve a timeline na véspera. O
 * sítio dela é provavelmente o cartão do dia de hoje, e isso decide-se com ela.
 */

/**
 * ── A LINGUAGEM DOS SINAIS: COR, FORMA E PALAVRA, SEMPRE AS TRÊS ──────────
 *
 * Regra da casa e do sistema de design: «nunca comuniques informação só por
 * cor». Já aqui houve um calendário que dizia o estado só com cor. Cada sinal
 * leva por isso um ÍCONE (a forma) e uma PALAVRA (o rótulo) além do tom — uma
 * pastilha vermelha e uma verde continuam a distinguir-se num ecrã em tons de
 * cinzento, e continuam a ler-se em voz alta.
 *
 * As cores são as três com significado desta casa e não mais nenhuma: perigo,
 * aviso e acento. Um guião pronto não ganha uma quarta cor — ganha o cinzento
 * do texto de apoio, porque «pronto» é a ausência de problema e não um estado
 * a celebrar.
 */
const TOM_DO_SINAL: Record<TipoDeSinal, { fundo: string; tinta: string }> = {
  choque: { fundo: "bg-[var(--bo-perigo-lavagem)]", tinta: "text-[var(--bo-perigo)]" },
  buraco: { fundo: "bg-[var(--bo-aviso-lavagem)]", tinta: "text-[var(--bo-aviso)]" },
  "sem-duracao": { fundo: "bg-[var(--bo-aviso-lavagem)]", tinta: "text-[var(--bo-aviso)]" },
  "sem-guiao": { fundo: "bg-[var(--bo-tinta-6)]", tinta: "text-[var(--bo-text-muted)]" },
  sobreposicao: { fundo: "bg-[var(--bo-tinta-6)]", tinta: "text-[var(--bo-text-muted)]" },
  pronto: { fundo: "bg-[var(--bo-accent-lavagem)]", tinta: "text-[var(--bo-accent)]" },
};

const ROTULO_DO_SINAL: Record<TipoDeSinal, string> = {
  choque: "Choque",
  buraco: "Vazio",
  "sem-duracao": "Sem duração",
  "sem-guiao": "Sem timeline",
  sobreposicao: "Em paralelo",
  pronto: "Pronto",
};

function IconeDoSinal({ tipo }: { tipo: TipoDeSinal }) {
  const comum = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  // Uma forma por significado — triângulo para o erro, ampulheta para o vazio,
  // círculo aberto para o que falta, dois traços para o paralelo, visto para o
  // que está feito.
  if (tipo === "choque") {
    return (
      <svg {...comum}>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  }
  if (tipo === "buraco") {
    return (
      <svg {...comum}>
        <path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22" />
        <path d="M7 2v4.2c0 .5.2 1 .6 1.4L12 12l4.4-4.4c.4-.4.6-.9.6-1.4V2" />
      </svg>
    );
  }
  if (tipo === "sem-duracao") {
    return (
      <svg {...comum}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5" />
      </svg>
    );
  }
  if (tipo === "sobreposicao") {
    return (
      <svg {...comum}>
        <path d="M4 8h13M7 16h13" />
      </svg>
    );
  }
  if (tipo === "pronto") {
    return (
      <svg {...comum}>
        <path d="m5 12 5 5L20 7" />
      </svg>
    );
  }
  return (
    <svg {...comum}>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    </svg>
  );
}

function Pastilha({ sinal }: { sinal: SinalDoGuiao }) {
  const tom = TOM_DO_SINAL[sinal.tipo];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--bo-raio-distintivo)] px-1.5 py-0.5 text-[11px] font-medium ${tom.fundo} ${tom.tinta}`}
      // A frase inteira é o nome acessível: quem ouve o ecrã recebe «Uma pessoa
      // em dois sítios ao mesmo tempo» e não «Choque, 1».
      title={sinal.frase}
    >
      <IconeDoSinal tipo={sinal.tipo} />
      <span>{ROTULO_DO_SINAL[sinal.tipo]}</span>
      {sinal.quantos > 1 && <span className="tabular-nums">{sinal.quantos}</span>}
      <span className="sr-only"> — {sinal.frase}</span>
    </span>
  );
}

/** «sábado, 12 de junho» — a data como se diz ao telefone. Uma fonte só para
 *  esta frase em todo o back office (`diaPorExtenso`), que não depende do fuso
 *  nem dos dados de língua da máquina. */
const dataPorExtenso = (data: string) => diaPorExtenso(data);

/**
 * «Hoje», «amanhã», «daqui a 12 dias», «há 3 dias».
 *
 * É a coluna que decide a ordem de leitura da lista, e por isso vale mais do
 * que a data: uma data obriga a fazer a conta de cabeça, e a conta de cabeça é
 * a que se erra na véspera de um evento.
 */
function quandoPorExtenso(faltamDias: number): string {
  if (faltamDias === 0) return "Hoje";
  if (faltamDias === 1) return "Amanhã";
  if (faltamDias === -1) return "Ontem";
  if (faltamDias > 0) return `Daqui a ${faltamDias} dias`;
  return `Há ${Math.abs(faltamDias)} dias`;
}

/** De quanto em quanto tempo o relógio do «agora» se actualiza. O mesmo pulso
 *  do `EventTimeline` — a frase que ele escreve é «daqui a 25 min». */
const PULSO_DO_RELOGIO_MS = 30_000;

export default function Guioes({ carregarPedido, onQuoteAtualizado }: Props) {
  const { toast } = useToast();
  const lista = useCachedList<{ guioes: ResumoDeGuiao[] }>("guioes", "/api/guioes");
  const modelos = useCachedList<{ modelos: ModeloDeGuiao[] }>(
    "guiao-modelos",
    "/api/guioes/modelos",
  );

  const [filtro, setFiltro] = useState<Filtro>("todos");
  /**
   * A escolha vive AQUI e não dentro do painel do evento: trocar de evento
   * mantém a maneira de olhar. No dia do evento ela põe a grelha e passa a
   * manhã a saltar entre dois casamentos — voltar à régua a cada troca era
   * cobrar-lhe um toque por cada vez.
   */
  /**
   * ── A GRELHA É A VISTA, E A RÉGUA É ONDE SE ESCREVE ──────────────────────
   *
   * Abria na régua. Passa a abrir na grelha, porque foi isso que ela pediu com
   * o horário da faculdade à frente: «quero que o timeline seja mesmo assim».
   *
   * A régua não sai nem podia sair — é o único sítio onde os momentos se
   * escrevem, e continua a um toque. O que muda é qual das duas responde
   * primeiro: quem abre uma timeline vem ver o dia, e só depois mexer nele.
   */

  /**
   * ── DESCARREGAR O HORÁRIO EM PDF ────────────────────────────────────────
   *
   * O ficheiro vem do `/api/guioes/<id>/pdf`, desenhado no servidor — é lá que
   * a fonte que escreve nomes portugueses já está carregada (ver o cabeçalho
   * da rota).
   *
   * Passa pelo `descarregar` da casa (`ui/descarregar.ts`): a rota manda o
   * `Content-Length`, e a barra do `EmCurso` diz quanto já chegou — e no fim
   * diz «PDF pronto» (14/10, «a animação a descarregar… melhores mesmo
   * muito»). A recusa da rota (uma timeline sem horas) continua a ser uma
   * frase onde ela carregou.
   */
  const pdf = useDescarga();
  const aDescarregar = pdf.aCorrer;
  const [falhaAoDescarregar, setFalhaAoDescarregar] = useState<string | null>(null);

  async function descarregarPdf(id: string) {
    setFalhaAoDescarregar(null);
    try {
      await pdf.correr(`/api/guioes/${encodeURIComponent(id)}/pdf`, "horario.pdf");
    } catch (e) {
      setFalhaAoDescarregar(
        e instanceof FalhaDaDescarga && e.daRota
          ? e.message
          : e instanceof FalhaDaDescarga
            ? "Não foi possível preparar o PDF. Tenta daqui a bocado."
            : "Erro de ligação. Tenta novamente.",
      );
    }
  }
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [pedido, setPedido] = useState<Quote | null>(null);
  const [aAbrir, setAAbrir] = useState<string | null>(null);
  const [falhaAoAbrir, setFalhaAoAbrir] = useState<string | null>(null);

  const [agora, setAgora] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), PULSO_DO_RELOGIO_MS);
    return () => clearInterval(t);
  }, []);

  const guioes = useMemo(() => ordenarGuioes(lista.data?.guioes ?? [], agora), [lista.data, agora]);

  /**
   * O âmbito é o primeiro corte, e o filtro é o segundo.
   *
   * Por omissão «fechados», que é o que ela pediu primeiro: um guião do dia é
   * a folha por que a equipa se rege, e fazê-la para um pedido que ainda está
   * a ser pensado é planear um dia que pode não acontecer. Mas é uma OMISSÃO e
   * não uma parede — daí o comutador.
   */
  const [ambito, setAmbito] = useState<Ambito>("fechados");
  const noAmbito = useMemo(
    () => (ambito === "todos" ? guioes : guioes.filter((g) => g.aceite)),
    [guioes, ambito],
  );
  const contagensDoAmbito = useMemo(
    () => ({ fechados: guioes.filter((g) => g.aceite).length, todos: guioes.length }),
    [guioes],
  );

  const contagens = useMemo(() => {
    let porFazer = 0;
    let problemas = 0;
    /* Contam o que está DENTRO DO ÂMBITO, e não a lista toda. Com «Fechados»
       escolhido, um «Todos · 15» ao lado de uma lista de um era o ecrã a
       discordar de si próprio — que é o defeito que esta vista existe para não
       ter. */
    for (const g of noAmbito) {
      const principal = sinalPrincipal(g.sinais);
      if (GRAVIDADE_DO_SINAL[principal.tipo] === "erro") problemas += 1;
      else if (GRAVIDADE_DO_SINAL[principal.tipo] === "por-fazer") porFazer += 1;
    }
    return { todos: noAmbito.length, porFazer, problemas };
  }, [noAmbito]);

  const visiveis = useMemo(() => {
    if (filtro === "todos") return noAmbito;
    return noAmbito.filter((g) => {
      const gravidade = GRAVIDADE_DO_SINAL[sinalPrincipal(g.sinais).tipo];
      return filtro === "problemas" ? gravidade === "erro" : gravidade === "por-fazer";
    });
  }, [noAmbito, filtro]);

  const oDeHoje = useMemo(() => guioes.find((g) => g.hoje) ?? null, [guioes]);
  const aberto = useMemo(() => guioes.find((g) => g.id === abertoId) ?? null, [guioes, abertoId]);

  /**
   * A lista em cartões, com o desenho do mapa de mesas (14/10: «aquilo que
   * fizeste em termos de design no mapa de mesas faz a mesma coisa para o
   * timelines»): o próximo evento à cabeça, os meses como títulos e uma
   * procura. O desenho e as contas vivem em `ListaDeEventos.tsx`, para os dois
   * ecrãs não discordarem sobre o que é a lista dos eventos.
   */
  const [procura, setProcura] = useState("");
  const procuraAdiada = useDeferredValue(procura);
  const procurados = useMemo(
    () => filtrarPorProcura(visiveis, procuraAdiada),
    [visiveis, procuraAdiada],
  );
  const { proximo, porMes } = useEventosArrumados(procurados);

  /**
   * Abrir um guião é ir buscar o pedido inteiro.
   *
   * O `pedido` só se substitui quando a resposta é do evento que ela quis abrir
   * (`abertaRef`): dois toques seguidos em dois eventos põem duas leituras no
   * ar, e sem esta guarda a primeira a chegar — que pode ser a do evento que já
   * não está aberto — desenhava o guião ERRADO por baixo do nome certo. Num
   * ecrã que grava ao toque, isso escreve o guião de um casamento no outro.
   */
  const abertaRef = useRef<string | null>(null);
  async function abrir(id: string) {
    setAbertoId(id);
    abertaRef.current = id;
    setFalhaAoAbrir(null);
    if (pedido?.id === id) return;
    setPedido(null);
    setAAbrir(id);
    const r = await carregarPedido(id);
    if (abertaRef.current !== id) return;
    setAAbrir(null);
    if (r.ok) {
      setPedido(r.quote);
      /* As contagens da folha vêm com o pedido. Sem esta linha, ela escrevia
         «24» no staff, mudava de evento e voltava — e encontrava o campo
         vazio com o número gravado no servidor. Um campo que esquece o que
         mostrou é pior do que um campo que nunca o aceitou. */
      setCabecalho(r.quote.folhaDaTimeline ?? {});
    } else setFalhaAoAbrir(r.porque);
  }

  /** O último evento aberto: o cartão dele fica marcado ao voltar à lista. */
  const [ultimoAberto, setUltimoAberto] = useState<string | null>(null);
  function fechar() {
    const id = abertaRef.current;
    setAbertoId(null);
    abertaRef.current = null;
    setFalhaAoAbrir(null);
    if (!id) return;
    setUltimoAberto(id);
    // Volta ao cartão de onde saiu — numa lista de trinta eventos, voltar ao
    // topo era perder o sítio.
    requestAnimationFrame(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>("[data-evento]")).find(
        (e) => e.dataset.evento === id,
      );
      el?.scrollIntoView?.({ block: "center" });
      el?.focus({ preventScroll: true });
    });
  }
  /* A lista e o guião aberto trocam de lugar, como no mapa de mesas: o gesto de
     voltar do telemóvel (e o do browser) volta à lista. */
  useCamadaDeHistoria(!!abertoId, fechar);

  /**
   * O guião mudou no ecrã do evento — a lista tem de mudar com ele.
   *
   * Sem isto, apagar um choque dentro do editor deixava a pastilha vermelha na
   * linha ao lado até alguém recarregar a página: dois sítios a dizer coisas
   * diferentes sobre o mesmo dia, que é o defeito que esta vista existe para
   * não ter. O `setData` do `useCachedList` escreve na cache, portanto sair da
   * vista e voltar não ressuscita o estado antigo.
   */
  /**
   * O título da folha, igual ao do PDF: «CASAMENTO CAROLINA 04.09.26».
   *
   * A data no formato curto que ela escreve à mão — dd.mm.aa, e não «sábado, 4
   * de setembro». Numa folha que anda pelo bolso de dez fornecedores a data é
   * uma etiqueta, não uma frase.
   */
  /**
   * ── O CABEÇALHO DA FOLHA: ADULTOS, CRIANÇAS E STAFF ─────────────────────
   *
   * «E também para escrever staff e crianças etc que está no timeline.»
   *
   * As três contagens do topo da folha dela. Escrevem-se aqui, ao lado da
   * pré-visualização, porque é aqui que se vêem — e porque não pertencem ao
   * cronograma (não são um momento do dia) nem aos custos (não são dinheiro).
   *
   * Texto livre e não números: a folha dela diz «6 crianças (1 c/ 1 ano)», e
   * aquele parêntesis é a informação que faz a diferença no dia. Ver
   * `CabecalhoDaFolha`.
   *
   * Grava com um atraso: ela escreve «24» a duas teclas, e uma gravação por
   * tecla eram duas viagens para um valor que ainda estava a meio.
   */
  /**
   * ── OS FORNECEDORES DA FOLHA ────────────────────────────────────────────
   *
   * «E os fornecedores que escrevemos em baixo no timeline, onde escrevemos?»
   *
   * Escrevem-se no painel de CUSTOS do evento (`EventCosts`), que é onde eles
   * já viviam antes de esta folha existir — cada um com o que custa e em que
   * pé está, que é informação de que a folha não precisa mas o evento sim.
   * Aqui só se LÊEM.
   *
   * O contacto não vem do evento: vem do DIRECTÓRIO, pelo `supplierId`. O
   * evento guarda quem trabalha nele; o directório guarda o telefone de cada
   * um. Guardá-lo nos dois era tê-lo desactualizado num deles — e é a mesma
   * junção que a rota do PDF faz, para a folha do ecrã e a do ficheiro não
   * poderem discordar.
   */
  const directorio = useCachedList<Supplier[]>("fornecedores", "/api/fornecedores");
  const fornecedoresDaFolha = useMemo(() => {
    const doEvento = pedido?.eventSuppliers ?? [];
    if (doEvento.length === 0) return [];
    const porId = new Map((directorio.data ?? []).map((f) => [f.id, f]));
    return doEvento.map((f) => {
      const ficha = f.supplierId ? porId.get(f.supplierId) : undefined;
      return {
        categoria: f.category || "Fornecedor",
        nome: f.name,
        contacto: [ficha?.phone, ficha?.email].filter(Boolean).join(" · "),
      };
    });
  }, [pedido, directorio.data]);

  const [cabecalho, setCabecalho] = useState<CabecalhoDaFolha>({});
  const cabecalhoPorGravar = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (cabecalhoPorGravar.current) clearTimeout(cabecalhoPorGravar.current);
    },
    [],
  );

  function mudarCabecalho(campo: keyof CabecalhoDaFolha, valor: string) {
    const seguinte = { ...cabecalho, [campo]: valor };
    setCabecalho(seguinte);
    setPedido((prev) => (prev ? { ...prev, folhaDaTimeline: seguinte } : prev));
    if (cabecalhoPorGravar.current) clearTimeout(cabecalhoPorGravar.current);
    const id = pedido?.id;
    if (!id) return;
    cabecalhoPorGravar.current = setTimeout(() => {
      void fetch(`/api/orcamento/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folhaDaTimeline: seguinte }),
      }).then((res) => {
        /* Uma gravação recusada não pode passar em silêncio: ela escreveu o
           número, viu-o no ecrã, e voltaria amanhã sem ele. */
        if (!res.ok) toast("Não foi possível guardar as contagens da folha.", "error");
      });
      /* O mesmo número dos campos da timeline, e importado de lá para não
         poderem discordar — ver a nota no `EventTimeline.tsx`. */
    }, GRAVAR_AO_ESCREVER_MS);
  }

  function tituloDaFolha(g: { evento: string; cliente: string; data: string }): string {
    const [ano, mes, dia] = g.data.split("-");
    const curta = ano && mes && dia ? `${dia}.${mes}.${ano.slice(2)}` : "";
    return [g.evento, g.cliente, curta].filter(Boolean).join(" ") || "Timeline";
  }

  function guiaoMudou(id: string, momentos: TimelineItem[]) {
    lista.setData((prev) => ({
      guioes: (prev?.guioes ?? []).map((g) => (g.id === id ? { ...g, momentos } : g)),
    }));
    setPedido((prev) => (prev && prev.id === id ? { ...prev, timeline: momentos } : prev));
    const inteiro = pedido && pedido.id === id ? { ...pedido, timeline: momentos } : null;
    if (inteiro) onQuoteAtualizado?.(inteiro);
  }

  async function guardarModelo(nome: string, momentos: MomentoDeModelo[]) {
    const origem = aberto ? `${aberto.cliente} · ${dataPorExtenso(aberto.data)}` : undefined;
    const oQue = `guardar o modelo «${nome}»`;
    let res: Response;
    try {
      res = await fetch("/api/guioes/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, momentos, origem }),
      });
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return;
    }
    const corpo = (await res.json().catch(() => null)) as {
      modelos?: ModeloDeGuiao[];
      escrita?: { duradouro?: boolean };
    } | null;
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return;
    }
    if (corpo?.modelos) modelos.setData({ modelos: corpo.modelos });
    // A escrita pode ter acontecido num sítio que não dura (ver `app-state.ts`:
    // sem base de dados, em produção, o ficheiro é o disco da função). Dizer
    // «Guardado» sobre isso é a avaria que custou uma proposta inteira.
    if (corpo?.escrita && corpo.escrita.duradouro === false) {
      toast(
        `«${nome}» ficou guardado só nesta máquina — sem base de dados configurada, não sobrevive a uma actualização.`,
        "error",
      );
      return;
    }
    toast(`Modelo «${nome}» guardado.`);
  }

  const relogio = agoraNaRegua(agora);

  return (
    <div className="flex flex-col gap-[var(--bo-gap-vista)]">
      {/* ══════════════════════════════════════════════════════════════════
          O DIA QUE ESTÁ A ACONTECER
          ══════════════════════════════════════════════════════════════════
          Só existe no dia do evento — e ainda na madrugada seguinte, porque o
          encerramento das 02:00 é o último momento do guião (ver `estaNoDia`).
          Nos outros dias não há painel nenhum: um «agora» a apontar para uma
          hora de um dia que não é o do evento parece informação e é ruído. */}
      {oDeHoje && (
        <PainelDeHoje guiao={oDeHoje} relogio={relogio} aoAbrir={() => abrir(oDeHoje.id)} />
      )}

      <div className="flex flex-col gap-4">
        {/* ── A LISTA ──────────────────────────────────────────────────────
            No telemóvel a lista e o guião aberto trocam de lugar: dois painéis
            de largura inteira empilhados obrigavam a rolar a lista toda para
            chegar ao guião que se acabou de abrir. No computador vivem lado a
            lado, que é onde há largura para os dois. */}
        <div hidden={!!abertoId}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Segmented<Filtro>
              ariaLabel="Filtrar as timelines"
              size="sm"
              value={filtro}
              onChange={setFiltro}
              options={[
                { value: "todos", label: `Todos · ${contagens.todos}` },
                { value: "por-fazer", label: `Por fazer · ${contagens.porFazer}` },
                { value: "problemas", label: `Com problema · ${contagens.problemas}` },
              ]}
            />
            {/* ── QUEM ENTRA NA LISTA, E QUEM ESCOLHE ─────────────────────
                Duas coisas dela, com dias de diferença, e as duas valem:

                 1. «Quero que dê para fazer timelines APENAS das propostas que
                    já foram aceites» — a lista tinha quinze eventos e treze
                    diziam «Sem timeline», porque a maior parte ainda eram
                    propostas por responder;
                 2. «Aqui quero que dê TAMBÉM para escolher aqueles que quero
                    fazer um timeline» — com a lista a mostrar um evento só,
                    que é o que sobrou do corte da primeira.

                Não se contradizem: a primeira é sobre o que se vê por
                omissão, a segunda é sobre poder ver o resto. O corte saiu do
                servidor (que só sabia fazer a primeira, e ao fazê-la tirava a
                segunda) e passou a ser esta escolha.

                «Fechados» e não «aceites», porque é a palavra que ela usa para
                um evento que vai mesmo acontecer. */}
            <Segmented<Ambito>
              ariaLabel="Que eventos mostrar"
              size="sm"
              value={ambito}
              onChange={setAmbito}
              options={[
                /* «Todos os eventos» e não «Todos»: o comutador do lado tem
                   um «Todos» seu (o do estado da timeline), e dois «Todos»
                   lado a lado a querer dizer coisas diferentes é o ecrã a
                   pedir que se adivinhe qual é qual. */
                { value: "fechados", label: `Fechados · ${contagensDoAmbito.fechados}` },
                { value: "todos", label: `Todos os eventos · ${contagensDoAmbito.todos}` },
              ]}
            />
            {guioes.length > 0 && (
              <input
                type="search"
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                placeholder="Procurar por nome ou local…"
                aria-label="Procurar eventos"
                className="bo-input h-10 min-w-0 flex-1 basis-56 rounded-full px-4 text-sm"
              />
            )}
          </div>

          {lista.loading && !lista.data ? (
            <SkeletonList rows={5} />
          ) : lista.error ? (
            <AvisoDeFalha
              titulo="Não foi possível ler as timelines"
              mensagem={lista.errorMessage}
              falha={lista.falha}
              aoTentarDeNovo={lista.refresh}
            />
          ) : guioes.length === 0 ? (
            <EmptyState
              icon={<IconeDeGuiao />}
              title="Ainda não há eventos com data"
              description="Uma timeline pertence a um evento marcado. Assim que um pedido tiver data, aparece aqui à espera de timeline."
            />
          ) : noAmbito.length === 0 ? (
            /* ── NINGUÉM MUDOU O FILTRO ─────────────────────────────────────
               Achado n.º 21 da auditoria: a vista abre em «Fechados», e sem
               nenhum evento fechado dizia «Nenhuma timeline por fazer — Mudou o
               filtro, não os dados» a quem tinha acabado de chegar. A omissão
               fica (é dela, ver `ambito`); a frase passa a dizer o que se passa
               e o botão leva aos outros eventos, que estão lá. */
            <EmptyState
              icon={<IconeDeGuiao />}
              title="Ainda nenhum evento fechado"
              description={`Os eventos entram aqui quando a proposta é aceite. Há ${contagensDoAmbito.todos} ${contagensDoAmbito.todos === 1 ? "evento" : "eventos"} com data noutros estados.`}
              action={{ label: "Ver todos os eventos", onClick: () => setAmbito("todos") }}
            />
          ) : visiveis.length > 0 && procurados.length === 0 ? (
            <EmptyState
              icon={<IconeDeGuiao />}
              title="Nenhum evento com esse nome"
              description="Procura pelo nome do cliente, pelo tipo de evento ou pelo local."
              action={{ label: "Limpar a procura", onClick: () => setProcura("") }}
            />
          ) : visiveis.length === 0 ? (
            <EmptyState
              icon={<IconeDeGuiao />}
              title={
                filtro === "problemas"
                  ? "Nenhuma timeline com pessoas em dois sítios ao mesmo tempo"
                  : "Nenhuma timeline por fazer"
              }
              description="Mudou o filtro, não os dados: há timelines, só que nenhuma delas cai neste caso."
              action={{ label: "Ver todos", onClick: () => setFiltro("todos") }}
            />
          ) : (
            /* ── A LISTA PASSA A TER CABEÇALHOS DE MÊS ──────────────────────
               O documento do Calendário dela apanha isto noutro sítio e a
               queixa é a mesma aqui: «26 Set → 3 Out → 29 Mai 27. Sete meses de
               intervalo sem qualquer separador. O leitor tem de descobrir
               sozinho que não há nada entre outubro e maio.»

               A lista das timelines tem exactamente essa forma — «Daqui a 23
               dias» seguido de «Daqui a 261 dias» — e o salto de sete meses
               fica escondido atrás de dois números que ninguém subtrai.

               Com os meses escritos, o buraco passa a ser evidente em vez de
               suspeito. E é a informação mais valiosa desta lista: sete meses
               livres é uma decisão comercial, não um detalhe de apresentação.

               Colados ao topo (`sticky`) porque a coluna rola: sem isso, a
               meio de Julho já não se sabe em que mês se está — que é o mesmo
               defeito com outro nome. */
            <GrelhaDeEventos
              proximo={proximo}
              porMes={porMes}
              cartao={(g, destaque) => (
                <CartaoDoEvento
                  g={g}
                  destaque={destaque}
                  aAbrir={aAbrir === g.id}
                  activo={g.id === ultimoAberto}
                  onAbrir={() => void abrir(g.id)}
                  nome={nomeDoCartao(g)}
                  estado={<MomentosDoDia guiao={g} />}
                  rodape={
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {g.sinais.map((s) => (
                        <Pastilha key={s.tipo} sinal={s} />
                      ))}
                    </span>
                  }
                />
              )}
            />
          )}
        </div>

        {/* ── O GUIÃO ABERTO ─────────────────────────────────────────────
            `min-w-0`, e não é decoração: este painel é um item de uma grelha,
            e um item de grelha nasce com `min-width: auto` — ou seja, recusa-se
            a ficar mais estreito do que o seu conteúdo mínimo. A grelha do dia
            por responsável tem largura mínima própria (48 px de horas mais
            96 px por pessoa), portanto a 390 px com quatro pessoas o painel
            esticava para 432 px e arrastava a PÁGINA INTEIRA para um rolo
            horizontal — que é a coisa que o sistema de design proíbe à letra.
            Medido, e só se vê num browser: o rolo tem de ficar dentro da caixa
            da grelha, e para isso o painel tem de poder encolher.

            O `lg:grid-cols-[minmax(0,…)]` acima já resolvia isto no computador;
            abaixo dos 1024 px a grelha é de uma coluna só e a coluna implícita
            é `auto`, portanto não resolvia nada — que é exactamente a largura
            onde ela trabalha. */}
        <div className="min-w-0" hidden={!abertoId}>
          {!aberto ? null : (
            <div className="bo-card p-[var(--bo-p-cartao)]">
              {/* A volta à lista, sempre à cabeça: a timeline ocupa a vista
                  inteira, como o mapa de mesas (14/10, «ocupa o ecrã»). */}
              <button
                type="button"
                onClick={fechar}
                aria-label="Voltar aos eventos"
                className={`alvo-toque -ml-2 mb-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-[var(--bo-accent)] hover:bg-[var(--bo-tinta-3)] ${ESTADO} ${PRESSAO}`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 5l-7 7 7 7" />
                </svg>
                Eventos
              </button>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                {/* ── A HIERARQUIA ESTAVA INVERTIDA, COMO NOS OUTROS ECRÃS ──
                    «Daqui a 359 dias» estava ACIMA do nome do casal, em
                    cinzento pequeno, na posição de maior destaque do cartão.
                    É a mesma inversão que os três documentos dela apanham nas
                    Tarefas, no Calendário e nos Temas: [APPLE] o título
                    identifica a vista, e o resto é estado.

                    O nome sobe para primeiro. O «daqui a tantos dias» desce
                    para junto da data, que é o sítio onde ele quer dizer
                    alguma coisa — «sábado, 4 de setembro · daqui a 359 dias» é
                    uma frase; sozinho por cima de um nome é um número solto.

                    E fica em `role="status"`: muda com o relógio, sem a página
                    recarregar. */}
                <div className="min-w-0">
                  <h2 className="text-title3 font-semibold text-[var(--bo-text)]">
                    {aberto.cliente || "Sem nome"}
                  </h2>
                  <p className="bo-text-muted mt-0.5 text-sm">
                    {dataPorExtenso(aberto.data)}
                    <span role="status">
                      {" "}
                      · {quandoPorExtenso(aberto.faltamDias).toLowerCase()}
                    </span>
                    {aberto.local ? ` · ${aberto.local}` : ""}
                  </p>
                </div>
                {/* ── ESTA FILA DEIXOU DE PODER SER `shrink-0` ──────────────
                    Tinha dois comandos e cabia; passou a ter três, e a 390 px
                    os três medem 506 px. Com `shrink-0` a fila recusava-se a
                    encolher, o `flex-wrap` nunca chegava a disparar (não há o
                    que quebrar quando a caixa não aperta), e o cabeçalho
                    arrastava a página inteira 116 px para o lado. Medido no
                    browser — no computador não se vê, porque lá sobra largura.

                    `min-w-0` em vez de `shrink-0`: a fila encolhe, o
                    `flex-wrap` faz o seu trabalho e os comandos passam para a
                    linha de baixo. */}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {/* ── O COMUTADOR SAIU: «AQUI BASTA APENAS EDITAR» ─────────────
                      Havia aqui duas vistas — «Horário» (a grelha por
                      pessoa) e «Editar». Deixou de fazer sentido no momento
                      em que a FOLHA passou a estar ao lado do editor: já não
                      é preciso trocar de modo para ver como está a ficar,
                      porque está sempre à vista. Um comutador entre duas
                      coisas em que uma delas deixou de ser precisa é ruído
                      com aspecto de escolha.

                      ── E A GRELHA POR PESSOA FICOU SEM PORTA ─────────────
                      Está dito e não escondido: o `GrelhaDoDia` continua no
                      código, com os seus testes, e neste momento não há por
                      onde lá chegar. Ela responde a uma pergunta que esta
                      vista não responde — «são três e meia, quem está
                      livre?» — e essa pergunta faz-se NO DIA do evento, não
                      enquanto se escreve a timeline. O sítio dela é
                      provavelmente o cartão do dia de hoje, e isso é uma
                      decisão a tomar com ela. */}
                  {/* Imprimir vive AQUI e não na linha da lista, e a razão é
                      técnica: o `printRunSheet` abre uma janela, e uma janela
                      aberta depois de um `await` é bloqueada pelo browser. Na
                      lista o pedido inteiro ainda não chegou; aqui já está em
                      mão, portanto a janela abre no mesmo gesto do toque. */}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!pedido}
                    onClick={() => pedido && printRunSheet(pedido)}
                  >
                    Imprimir folha do dia…
                  </Button>
                  {/* ── E DESCARREGAR, QUE NÃO É A MESMA COISA QUE IMPRIMIR ──
                      «Quero que haja uma opção no timeline que seja fazer
                      download. E que fique como a foto que mandei num PDF.»

                      O «Imprimir» abre uma janela e deixa o resto com ela — o
                      destino, a margem, e o cabeçalho que o browser mete com a
                      data e o endereço do back office. Um ficheiro para mandar
                      à equipa não pode levar o endereço do back office impresso
                      no fundo.

                      ── E PORQUE É QUE NÃO É UMA ÂNCORA COM `download` ──────

                      Porque uma âncora não sabe ler uma recusa. A rota responde
                      409 a uma timeline sem uma única hora escrita — que é o
                      estado em que ela abre um evento novo — e com uma âncora
                      isso levava-a a uma página de JSON em cru, fora do back
                      office, com o botão «voltar» como única saída. Assim a
                      recusa é uma frase no sítio onde ela carregou. */}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!pedido || aDescarregar}
                    loading={aDescarregar}
                    onClick={() => void descarregarPdf(aberto.id)}
                  >
                    {aDescarregar ? "A preparar…" : "Descarregar PDF"}
                  </Button>
                  {/* ── E PELO WHATSAPP, QUE É POR ONDE ELA MANDA ──────────
                      «Quero que haja uma opção para partilhar logo pelo
                      WhatsApp e apareça logo os contactos do WhatsApp.»

                      O PDF é o que se imprime e se leva para a quinta; a
                      mensagem é o que chega ao telemóvel do fornecedor na
                      véspera. São os dois, e não um em vez do outro — por isso
                      o botão fica ao lado do outro e não no lugar dele.

                      O texto agrupa-se pelas MESMAS duas regras da folha e do
                      ficheiro (`timelineParaWhatsApp` chama o `blocosDaFolha`):
                      uma terceira versão do mesmo dia a andar por aí seria a
                      que fica no telemóvel de quem está longe do papel. */}
                  <BotaoWhatsApp
                    texto={timelineParaWhatsApp({
                      titulo: tituloDaFolha(aberto),
                      adultos: cabecalho.adultos,
                      criancas: cabecalho.criancas,
                      staff: cabecalho.staff,
                      momentos: pedido?.timeline ?? [],
                    })}
                  />
                </div>
              </div>

              {/* A recusa do PDF fica onde ela carregou, e não numa página de
                  JSON fora do back office. Uma linha, `role="status"`, e some
                  assim que ela tenta outra vez. */}
              {pdf.mostrar && (
                <EmCurso
                  className="mb-3"
                  titulo="A descarregar o horário em PDF…"
                  pronto="PDF pronto"
                  estimadoMs={3_000}
                  {...pdf.barra}
                />
              )}
              {falhaAoDescarregar && (
                <p
                  role="status"
                  className="mb-3 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--bo-perigo)]"
                >
                  <span aria-hidden="true">⚠</span>
                  <span>{falhaAoDescarregar}</span>
                </p>
              )}

              {falhaAoAbrir ? (
                <AvisoDeFalha
                  titulo="Não foi possível abrir esta timeline"
                  mensagem={falhaAoAbrir}
                  aoTentarDeNovo={() => void abrir(aberto.id)}
                />
              ) : !pedido || aAbrir === aberto.id ? (
                <div className="flex flex-col gap-3" aria-busy="true">
                  <div className="bo-skeleton h-2.5 w-40" aria-hidden />
                  <div className="bo-skeleton h-11 w-full" aria-hidden />
                  <div className="bo-skeleton h-16 w-full" aria-hidden />
                  <span className="sr-only">A abrir a timeline…</span>
                </div>
              ) : (
                <>
                  {/* O painel de edição fica MONTADO, escondido, e não
                      desmontado: ele guarda no seu estado o aviso do 409 com o
                      gesto por reaplicar, e desmontá-lo ao trocar de vista
                      deitava fora a única saída que ela tem para não perder o
                      que escreveu. `hidden` tira-o do ecrã e da árvore de
                      acessibilidade sem lhe tocar no estado. */}
                  {/* ── A EDIÇÃO E A FOLHA, LADO A LADO ─────────────────────
                      «Quero que dê para ir vendo ao lado como está a ficar à
                      medida que vamos preenchendo o timeline, para não termos
                      que estar sempre a fazer download para ver como está.»

                      É a queixa certa: a folha só existia depois de um
                      download. Escrever doze momentos e descarregar doze vezes
                      para ver se as colunas ficam bem é trabalho que o ecrã
                      devia fazer sozinho.

                      Duas colunas só a partir do `lg`. Abaixo disso a folha
                      vai para BAIXO do editor e não desaparece: numa coluna
                      estreita ela deixaria de se ler, mas continua a ser o que
                      ela quer conferir depois de escrever. */}
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:items-start">
                    <EventTimeline
                      key={pedido.id}
                      quote={pedido}
                      onChange={(momentos) => guiaoMudou(pedido.id, momentos)}
                      modelos={modelos.data?.modelos}
                      aoGuardarComoModelo={(nome, momentos) => void guardarModelo(nome, momentos)}
                    />
                    {/* Colada ao topo: ela escreve no fundo do editor (a linha
                        de acrescentar) e confere no topo da folha. Sem o
                        `sticky`, escrever o décimo momento levava a folha para
                        fora do ecrã. */}
                    <aside className="lg:sticky lg:top-4">
                      <p className="bo-eyebrow mb-2 text-[var(--bo-text-muted)]">Como vai ficar</p>
                      {/* ── AS TRÊS CONTAGENS DO TOPO DA FOLHA ────────────
                          «E também para escrever staff e crianças etc que está
                          no timeline.» Escrevem-se aqui porque é aqui que se
                          vêem — a folha por baixo mostra-as no instante.

                          Os adultos nascem do `guests` do pedido (é o que a
                          caixa sugere quando está vazia) e podem ser
                          reescritos: o número do pedido é de quando o pedido
                          foi feito, o da folha é o de véspera, depois das
                          confirmações. É o segundo que manda no dia. */}
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {(
                          [
                            ["adultos", "Adultos"],
                            ["criancas", "Crianças"],
                            ["staff", "Staff"],
                          ] as const
                        ).map(([campo, rotulo]) => (
                          <Field
                            key={campo}
                            as="input"
                            label={rotulo}
                            value={cabecalho[campo] ?? ""}
                            onChange={(e) => mudarCabecalho(campo, e.target.value)}
                            placeholder={
                              campo === "adultos" && pedido.guests ? String(pedido.guests) : "—"
                            }
                            className="px-2 py-1.5 text-xs"
                          />
                        ))}
                      </div>
                      <FolhaDaTimeline
                        titulo={tituloDaFolha(aberto)}
                        adultos={cabecalho.adultos || (pedido.guests ? String(pedido.guests) : "")}
                        criancas={cabecalho.criancas ?? ""}
                        staff={cabecalho.staff ?? ""}
                        momentos={aberto.momentos}
                        fornecedores={fornecedoresDaFolha}
                      />
                    </aside>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * O nome que se ouve num cartão: quando, o dia, quem, e os avisos por extenso
 * — o que distingue este evento dos outros vinte para quem ouve o ecrã.
 */
function nomeDoCartao(guiao: GuiaoNaLista): string {
  return `${quandoPorExtenso(guiao.faltamDias)}, ${dataPorExtenso(guiao.data)} — ${
    guiao.cliente || "sem nome"
  }. ${guiao.sinais.map((s) => s.frase).join(". ")}`;
}

/** «12 momentos · 09:00–02:00» — ou nada, quando a pastilha já diz «Sem timeline». */
function MomentosDoDia({ guiao }: { guiao: GuiaoNaLista }) {
  const n = guiao.momentos.length;
  if (n === 0) return null;
  const horas =
    guiao.dia.inicio !== null && guiao.dia.fim !== null
      ? ` · ${horaDoMinuto(guiao.dia.inicio)}–${horaDoMinuto(guiao.dia.fim)}`
      : "";
  return (
    <span className="min-w-0 truncate text-xs tabular-nums text-[var(--bo-text-muted)]">
      {n} {n === 1 ? "momento" : "momentos"}
      {horas}
    </span>
  );
}

/**
 * ── O PAINEL DE HOJE ──────────────────────────────────────────────────────
 *
 * A pergunta que ela faz de pé, numa quinta, com as mãos ocupadas — e que tem
 * de ter resposta SEM tocar em nada. Por isso vive no topo da vista, antes da
 * lista e antes de qualquer filtro: no dia do evento, entrar nesta vista é já
 * ter a resposta no ecrã.
 *
 * O que está a decorrer vem pequeno, como contexto; o que vem a SEGUIR vem
 * grande, porque é essa a pergunta. É a mesma hierarquia do `EventTimeline`, de
 * propósito: o mesmo dia visto de dois sítios não pode ler-se de duas maneiras.
 */
function PainelDeHoje({
  guiao,
  relogio,
  aoAbrir,
}: {
  guiao: GuiaoNaLista;
  relogio: number;
  aoAbrir: () => void;
}) {
  const seguinte = useMemo(
    () => oQueVemASeguir(guiao.dia.blocos, relogio),
    [guiao.dia.blocos, relogio],
  );
  const janela = useMemo(() => janelaComum([guiao]), [guiao]);
  const emChoque = useMemo(() => {
    const ids = new Set<string>();
    for (const c of guiao.dia.choques) {
      ids.add(c.a.id);
      ids.add(c.b.id);
    }
    return ids;
  }, [guiao.dia.choques]);

  return (
    <section
      aria-label="O evento de hoje"
      className="rounded-[var(--bo-raio-cartao)] border border-[var(--bo-accent)]/25 bg-[var(--bo-accent-lavagem)]/40 p-[var(--bo-p-cartao)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {/* O `.bo-eyebrow` do `globals.css` está FORA de camadas, portanto ganha
            a qualquer `text-*` do Tailwind escrito aqui — pedir-lhe acento era
            escrever uma classe morta. A cor desta secção vive na moldura e na
            lavagem à volta, que é onde ela se vê. */}
        <p className="bo-eyebrow">Hoje · {guiao.cliente || "Sem nome"}</p>
        <span className="text-xs tabular-nums text-[var(--bo-text-muted)]">
          {horaDoMinuto(relogio)}
        </span>
      </div>

      {guiao.momentos.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--bo-text)]">
          O evento é hoje e ainda não tem guião. Abre-o e junta um modelo — leva um toque.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <ReguaDoDia
              dia={guiao.dia}
              janela={janela}
              emChoque={emChoque}
              agora={relogio}
              tamanho="painel"
              rotulo={`Régua do dia de hoje, das ${
                guiao.dia.inicio !== null ? horaDoMinuto(guiao.dia.inicio) : "?"
              } às ${guiao.dia.fim !== null ? horaDoMinuto(guiao.dia.fim) : "?"}.`}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              {seguinte.agora.length > 0 ? (
                <p className="text-sm leading-snug text-[var(--bo-text)]">
                  <span className="bo-text-muted">Agora · </span>
                  {seguinte.agora.map((b) => b.item.title).join(" · ")}
                </p>
              ) : (
                <p className="bo-text-muted text-sm">
                  {seguinte.terminado
                    ? "A timeline chegou ao fim."
                    : "Não há nada marcado neste momento."}
                </p>
              )}
              {seguinte.aSeguir && (
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-2xl font-semibold leading-none tabular-nums text-[var(--bo-text)]">
                    {seguinte.aSeguir.item.time}
                  </span>
                  <span className="text-sm text-[var(--bo-text)]">
                    {seguinte.aSeguir.item.title}
                  </span>
                  <span className="bo-text-muted text-xs tabular-nums">
                    daqui a {porExtenso(seguinte.faltam)}
                  </span>
                </p>
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={aoAbrir}>
              Abrir o guião
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function IconeDeGuiao() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
