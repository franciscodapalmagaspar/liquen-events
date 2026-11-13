"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Guest, Quote } from "@/lib/orcamento/types";
import {
  acrescentarLugares,
  apagarElemento,
  apagarMesa,
  chaveDoLugar,
  contas,
  desfazer,
  duplicarMesa,
  ELEMENTOS,
  gestoDaDiferenca,
  gruposPartidos,
  historicoDepoisDaJuncao,
  historicoVazio,
  lerChave,
  lerMapa,
  levantar,
  livresDaMesa,
  maisProximaComLugar,
  mudarElemento,
  mudarMesa,
  nomeDoLugar,
  nomearLugar,
  novaMesa,
  novoElemento,
  porSentar,
  numerosDosLugares,
  quemEstaNaMesa,
  reconciliar,
  refazer,
  registar,
  ROTULO_DA_FORMA,
  sentar,
  sentarAutomaticamente,
  sentarGrupo,
  sentarResto,
  TECTOS,
  type FormaDaMesa,
  type Historico,
  type MapaDeMesas,
  type Pessoa,
  type TipoDeElemento,
} from "@/lib/orcamento/mapa-de-mesas";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { Button, Field, FolhaOuDialogo, Glass, Segmented, useAdaptativo } from "../ui";
import { useAnular } from "../ui/anular";
import { EmCurso } from "../ui/EmCurso";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { MoreMenu, type MoreMenuItem } from "../MoreMenu";
import { useToast } from "../Toast";
import Sala, { type Margens, type Seleccao } from "./Sala";
import { IconePartilhar, usePartilharMapa } from "./PartilharMapa";
import {
  ICONE_DO_ELEMENTO,
  IconeAnular,
  IconeFechar,
  IconeMais,
  IconeMesaComprida,
  IconeMesaQuadrada,
  IconeMesaRedonda,
  IconePessoas,
  IconeRefazer,
  IconeVarinha,
  IconeVoltar,
} from "./icones";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EDITOR DO MAPA DE MESAS DE UM EVENTO — O ECRÃ DE TRABALHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As regras estão em `lib/orcamento/mapa-de-mesas.ts`; aqui vivem o estado, a
 * gravação e os painéis. Cada gesto é uma função pura sobre o mapa
 * (`mexer(gesto)`), e é isso que torna quatro coisas simples:
 *
 *   · GRAVAR — o mapa grava-se 600 ms depois do último gesto, com a `base`
 *     (o que o servidor tinha), como as listas da gaveta;
 *   · A COLISÃO — se outra pessoa gravou entretanto (409), os gestos que
 *     ainda não chegaram ao servidor aplicam-se POR CIMA do mapa dela, em vez
 *     de o apagar ou de deitar fora o trabalho de quem está aqui;
 *   · ANULAR E REFAZER — o mapa de antes de cada gesto guarda-se numa pilha
 *     (50 passos, `registar`/`desfazer`/`refazer`), com ⌘Z e ⇧⌘Z;
 *   · O AVISO «ANULAR» — os gestos grandes (apagar, sentar toda a gente)
 *     dizem-no num aviso de 10 s, como no resto da casa.
 *
 * ── O ECRÃ INTEIRO (pedido dela, 14/10) ───────────────────────────────────
 * «que dê para trabalhar num espaço mais amplo, onde dá para ver tudo». A sala
 * passou de uma caixa entalada entre duas colunas para o ecrã inteiro, por cima
 * do back office, e o resto FLUTUA sobre ela: a barra de cima (a única de
 * vidro — `LIQUID-GLASS.md`, uma camada por ecrã), a lista de espera à
 * esquerda e o painel da peça à direita, opacos. O «Encaixar» da sala sabe o
 * que os painéis tapam (`margens`) e mostra a sala inteira no espaço que
 * sobra. No telemóvel e no tablet, os dois painéis são folhas.
 */

type Gesto = (m: MapaDeMesas) => MapaDeMesas;
type Vista = "visual" | "lista";

const GRAVAR_DEPOIS_MS = 600;
/** Escrever o nome de uma mesa é UM passo de anular, e não um por letra. */
const JUNTAR_MS = 1500;
/** Onde começam os painéis: a barra de cima e a sua folga. */
const TOPO_PX = 84;
const LARGURA_DA_LISTA_PX = 300;
const LARGURA_DO_PAINEL_PX = 320;
const LIMIAR_DO_ARRASTO_PX = 3;

function novoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export interface ResumoDoEvento {
  evento?: string;
  /** A data já dita por extenso. */
  quando?: string;
  local?: string;
}

interface Props {
  pedido: Quote;
  onPedido: (q: Quote) => void;
  /** O que se escreve debaixo do nome, na barra de cima. */
  resumo?: ResumoDoEvento;
  /** «← Eventos», o Escape e o gesto de voltar. */
  onSair: () => void;
}

/** Os grupos por sentar, pela ordem da lista. */
function agrupar(
  pessoas: Pessoa[],
): { convidadoId: string; grupo: string; faltam: number; de: number; rsvp: Pessoa["rsvp"] }[] {
  const por = new Map<
    string,
    { convidadoId: string; grupo: string; faltam: number; de: number; rsvp: Pessoa["rsvp"] }
  >();
  for (const p of pessoas) {
    const g = por.get(p.convidadoId) ?? {
      convidadoId: p.convidadoId,
      grupo: p.grupo,
      faltam: 0,
      de: p.de,
      rsvp: p.rsvp,
    };
    g.faltam += 1;
    por.set(p.convidadoId, g);
  }
  return [...por.values()];
}

/** Um campo de texto, o editor de texto rico, ou um select: as teclas são dele. */
function aEscrever(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName.toUpperCase());
}

/** O anel do «Sentados»: quanto da sala já tem lugar. */
function Anel({ feito, total }: { feito: number; total: number }) {
  const r = 9;
  const volta = 2 * Math.PI * r;
  const parte = total > 0 ? Math.min(1, feito / total) : 0;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--bo-tinta-10)" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="var(--bo-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${volta * parte} ${volta}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

export default function EditorDoMapa({ pedido, onPedido, resumo, onSair }: Props) {
  const { toast } = useToast();
  const anular = useAnular();
  const { desktop } = useAdaptativo();
  /** Telemóvel e tablet: os painéis são folhas, e a barra de cima encolhe. */
  const compacto = !desktop;

  const [lista, setLista] = useState<Guest[]>(pedido.guestList ?? []);
  const listaGravada = useRef<Guest[]>(pedido.guestList ?? []);
  const [mapa, setMapa] = useState<MapaDeMesas>(() =>
    reconciliar(lerMapa(pedido.mapaDeMesas), pedido.guestList),
  );
  const mapaRef = useRef(mapa);
  const gravado = useRef<MapaDeMesas | undefined>(pedido.mapaDeMesas);
  const pendentes = useRef<Gesto[]>([]);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [estado, setEstado] = useState<"gravado" | "a-gravar" | "por-gravar">("gravado");

  const [historico, setHistorico] = useState<Historico>(historicoVazio);
  const historicoRef = useRef(historico);
  const ultimaJunta = useRef<{ chave: string; quando: number } | null>(null);

  const [vista, setVista] = useState<Vista>("visual");
  const [seleccao, setSeleccao] = useState<Seleccao>(null);
  const [aSentar, setASentar] = useState<string | null>(null);
  const [naoCoube, setNaoCoube] = useState<{
    convidadoId: string;
    mesaId: string;
    ficaram: number;
  } | null>(null);
  /** Telemóvel: a folha da lista de espera. Computador: a lista recolhida. */
  const [esperaAberta, setEsperaAberta] = useState(false);
  const [listaRecolhida, setListaRecolhida] = useState(false);
  /** Telemóvel: a folha da peça escolhida. */
  const [pecaAberta, setPecaAberta] = useState(false);
  const [realce, setRealce] = useState<string | null>(null);
  const partilhar = usePartilharMapa({ pedido, antes: () => guardarAgora() });

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  // ── GRAVAR ────────────────────────────────────────────────────────────────
  /** A gravação que está a decorrer — uma de cada vez. */
  const emCurso = useRef<Promise<void> | null>(null);

  function gravar(): Promise<void> {
    if (emCurso.current) return emCurso.current;
    const p = gravarJa().finally(() => {
      emCurso.current = null;
    });
    emCurso.current = p;
    return p;
  }

  async function gravarJa(): Promise<void> {
    temporizador.current = null;
    const aEnviar = mapaRef.current;
    const quantos = pendentes.current.length;
    if (quantos === 0) return;
    setEstado("a-gravar");
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapaDeMesas: aEnviar, base: { mapaDeMesas: gravado.current } }),
      });
    } catch {
      setEstado("por-gravar");
      toast(porqueRebentou("guardar o mapa de mesas").mensagem, "error");
      return;
    }
    const corpo = (await res.json().catch(() => null)) as
      | (Quote & { current?: Partial<Quote> })
      | null;
    if (res.status === 409) {
      // Outra pessoa gravou: os gestos daqui vão por cima do mapa dela. Os
      // gestos são DIFERENÇAS (ver `gestoDaDiferenca`), por isso só levam o que
      // se fez aqui; e o histórico de anular passa a incluir o que ela fez.
      const doServidor = lerMapa(corpo?.current?.mapaDeMesas);
      mudarHistorico(
        historicoDepoisDaJuncao(historicoRef.current, lerMapa(gravado.current), doServidor),
      );
      gravado.current = corpo?.current?.mapaDeMesas;
      const junto = reconciliar(
        pendentes.current.reduce((m, g) => g(m), doServidor),
        lista,
      );
      mapaRef.current = junto;
      setMapa(junto);
      toast(
        "O mapa foi mudado noutro sítio entretanto. Juntei o que fizeste ao que lá estava.",
        "info",
      );
      return gravarJa();
    }
    if (!res.ok) {
      setEstado("por-gravar");
      toast(porqueFalhou("guardar o mapa de mesas", res, corpo).mensagem, "error");
      return;
    }
    pendentes.current = pendentes.current.slice(quantos);
    gravado.current = corpo?.mapaDeMesas ?? aEnviar;
    if (corpo?.id) onPedido(corpo);
    if (pendentes.current.length > 0) agendar();
    else setEstado("gravado");
  }

  /**
   * Grava JÁ o que está por gravar (antes de pedir o PDF: um mapa mandado à
   * quinta sem a última mesa que ela pôs era pior do que não o mandar).
   * `true` quando não ficou nada por gravar.
   */
  async function guardarAgora(): Promise<boolean> {
    for (let volta = 0; volta < 3; volta++) {
      if (emCurso.current) await emCurso.current;
      if (pendentes.current.length === 0) return true;
      if (temporizador.current) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
      }
      await gravar();
    }
    return pendentes.current.length === 0;
  }

  function agendar() {
    if (temporizador.current) clearTimeout(temporizador.current);
    setEstado("por-gravar");
    temporizador.current = setTimeout(() => void gravar(), GRAVAR_DEPOIS_MS);
  }

  function mudarHistorico(h: Historico) {
    historicoRef.current = h;
    setHistorico(h);
  }

  /**
   * Aplica um gesto, mostra-o já, e grava daqui a pouco. Devolve o mapa novo.
   * `juntar`: gestos seguidos com a mesma chave (as letras de um nome) contam
   * como UM passo de anular.
   */
  function mexer(gesto: Gesto, opcoes: { registar?: boolean; juntar?: string } = {}): MapaDeMesas {
    const antes = mapaRef.current;
    const novo = gesto(antes);
    if (novo === antes) return novo;
    if (opcoes.registar !== false) {
      const agora = Date.now();
      const ultima = ultimaJunta.current;
      const mesmoPasso =
        !!opcoes.juntar && ultima?.chave === opcoes.juntar && agora - ultima.quando < JUNTAR_MS;
      if (!mesmoPasso) mudarHistorico(registar(historicoRef.current, antes));
      ultimaJunta.current = opcoes.juntar ? { chave: opcoes.juntar, quando: agora } : null;
    }
    mapaRef.current = novo;
    setMapa(novo);
    pendentes.current.push(gesto);
    agendar();
    return novo;
  }

  /** Um gesto grande, com «Anular» que repõe o mapa de antes. */
  function mexerComAnular(mensagem: string, gesto: Gesto) {
    const antes = mapaRef.current;
    const depois = mexer(gesto);
    // Desfaz SÓ este gesto: o que se fez depois dele (aqui, ou por outra
    // pessoa numa junção) não volta atrás com ele.
    anular(mensagem, () => {
      mexer(gestoDaDiferenca(depois, antes));
    });
  }

  function desfazerUm() {
    const r = desfazer(historicoRef.current, mapaRef.current);
    if (!r) return;
    mudarHistorico(r.historico);
    ultimaJunta.current = null;
    mexer(gestoDaDiferenca(mapaRef.current, r.mapa), { registar: false });
  }

  function refazerUm() {
    const r = refazer(historicoRef.current, mapaRef.current);
    if (!r) return;
    mudarHistorico(r.historico);
    ultimaJunta.current = null;
    mexer(gestoDaDiferenca(mapaRef.current, r.mapa), { registar: false });
  }

  // ── A LISTA DE CONVIDADOS (só acrescentar daqui) ────────────────────────
  async function acrescentarConvidado(nome: string, quantos: number) {
    const novo: Guest = {
      id: novoId(),
      name: nome.trim().slice(0, 200),
      party: Math.max(1, Math.min(1000, Math.floor(quantos) || 1)),
      rsvp: "pendente",
    };
    const seguinte = [...lista, novo];
    setLista(seguinte);
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestList: seguinte, base: { guestList: listaGravada.current } }),
      });
    } catch {
      setLista(listaGravada.current);
      toast(porqueRebentou("acrescentar o convidado").mensagem, "error");
      return;
    }
    const corpo = (await res.json().catch(() => null)) as
      | (Quote & { current?: Partial<Quote> })
      | null;
    if (res.status === 409) {
      const doServidor = corpo?.current?.guestList ?? [];
      listaGravada.current = doServidor;
      setLista(doServidor);
      toast(
        "A lista de convidados foi alterada noutro sítio. Está aqui a versão guardada — acrescenta outra vez.",
        "error",
      );
      return;
    }
    if (!res.ok) {
      setLista(listaGravada.current);
      toast(porqueFalhou("acrescentar o convidado", res, corpo).mensagem, "error");
      return;
    }
    const gravada = corpo?.guestList ?? seguinte;
    listaGravada.current = gravada;
    setLista(gravada);
    if (corpo?.id) onPedido(corpo);
  }

  // ── O QUE SE MOSTRA ───────────────────────────────────────────────────────
  const numeros = useMemo(() => contas(mapa, lista), [mapa, lista]);
  const espera = useMemo(() => agrupar(porSentar(mapa, lista)), [mapa, lista]);
  const porSentarN = espera.reduce((s, g) => s + g.faltam, 0);
  const partidos = useMemo(() => gruposPartidos(mapa), [mapa]);
  /** O número único de cada lugar (o mesmo do PDF) — ver `numerosDosLugares`. */
  const numerosDaSala = useMemo(() => numerosDosLugares(mapa), [mapa]);
  const mesaEscolhida =
    seleccao?.tipo === "mesa" ? (mapa.mesas.find((m) => m.id === seleccao.id) ?? null) : null;
  const elementoEscolhido =
    seleccao?.tipo === "elemento"
      ? (mapa.elementos.find((e) => e.id === seleccao.id) ?? null)
      : null;
  const nomeDoGrupo = (id: string) => lista.find((g) => g.id === id)?.name ?? "Convidado";

  // ── GESTOS ────────────────────────────────────────────────────────────────
  function acrescentarMesa(forma: FormaDaMesa) {
    const id = novoId();
    const novo = mexer((m) => novaMesa(m, forma, id).mapa);
    if (novo.mesas.some((m) => m.id === id)) setSeleccao({ tipo: "mesa", id });
    else toast(`O mapa já tem ${TECTOS.mesas} mesas — é o máximo.`, "error");
  }

  function acrescentarElemento(tipo: TipoDeElemento) {
    const id = novoId();
    const novo = mexer((m) => novoElemento(m, tipo, id).mapa);
    if (novo.elementos.some((e) => e.id === id)) setSeleccao({ tipo: "elemento", id });
    else toast(`O mapa já tem ${TECTOS.elementos} elementos — é o máximo.`, "error");
  }

  function duplicar(mesaId: string) {
    const id = novoId();
    const novo = mexer((m) => duplicarMesa(m, mesaId, id).mapa);
    if (novo.mesas.some((m) => m.id === id)) setSeleccao({ tipo: "mesa", id });
    else toast(`O mapa já tem ${TECTOS.mesas} mesas — é o máximo.`, "error");
  }

  function sentarGrupoEm(convidadoId: string, mesaId: string, lugar?: number) {
    const r = sentarGrupo(mapaRef.current, lista, convidadoId, mesaId, lugar);
    mexer(() => r.mapa);
    setASentar(null);
    setNaoCoube(r.ficaram > 0 ? { convidadoId, mesaId, ficaram: r.ficaram } : null);
  }

  function tocarLugar(chave: string) {
    const { mesaId, lugar } = lerChave(chave);
    if (aSentar) {
      sentarGrupoEm(aSentar, mesaId, lugar);
      return;
    }
    setSeleccao({ tipo: "mesa", id: mesaId });
  }

  function apagar(s: NonNullable<Seleccao>) {
    if (s.tipo === "mesa") {
      const m = mapaRef.current.mesas.find((x) => x.id === s.id);
      if (!m) return;
      setSeleccao(null);
      setPecaAberta(false);
      mexerComAnular(`${m.nome} apagada. Quem lá estava voltou à lista de espera.`, (x) =>
        apagarMesa(x, s.id),
      );
    } else {
      const e = mapaRef.current.elementos.find((x) => x.id === s.id);
      if (!e) return;
      setSeleccao(null);
      setPecaAberta(false);
      mexerComAnular(`«${e.nome}» apagado.`, (x) => apagarElemento(x, s.id));
    }
  }

  function mudarLugares(mesaId: string, lugares: number) {
    const m = mapaRef.current.mesas.find((x) => x.id === mesaId);
    if (!m) return;
    const saem = quemEstaNaMesa(mapaRef.current, m).filter(
      (l) => l.lugar >= lugares && l.ocupante,
    ).length;
    if (saem > 0) {
      mexerComAnular(
        saem === 1
          ? "1 pessoa voltou à lista de espera — a mesa ficou com menos lugares."
          : `${saem} pessoas voltaram à lista de espera — a mesa ficou com menos lugares.`,
        (x) => mudarMesa(x, mesaId, { lugares }),
      );
    } else mexer((x) => mudarMesa(x, mesaId, { lugares }));
  }

  function rodar(mesaId: string) {
    const m = mapaRef.current.mesas.find((x) => x.id === mesaId);
    if (m) mexer((x) => mudarMesa(x, mesaId, { rodada: !m.rodada }));
  }

  function editarNome(mesaId: string) {
    setSeleccao({ tipo: "mesa", id: mesaId });
    if (compacto) setPecaAberta(true);
    // Depois de o painel aparecer.
    requestAnimationFrame(() => {
      const campo = document.querySelector<HTMLInputElement>("[data-nome-da-peca] input");
      campo?.focus();
      campo?.select();
    });
  }

  function sentarTodos() {
    const r = sentarAutomaticamente(mapaRef.current, lista);
    if (r.sentados === 0) {
      toast(
        espera.length === 0
          ? "Já está toda a gente sentada."
          : "Não há lugares livres. Acrescenta mesas ou lugares.",
        "info",
      );
      return;
    }
    mexerComAnular(
      r.sentados === 1
        ? "Sentei 1 pessoa."
        : `Sentei ${r.sentados} pessoas, sem partir grupos sempre que deu.`,
      () => r.mapa,
    );
  }

  // ── AS TECLAS DO ECRÃ DE TRABALHO ────────────────────────────────────────
  const teclas = useRef<(e: KeyboardEvent) => void>(() => {});
  // A cada desenho, o ouvinte passa a ver o estado deste desenho.
  useEffect(() => {
    teclas.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || aEscrever(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const tecla = e.key.toLowerCase();
      if (mod && tecla === "z") {
        e.preventDefault();
        if (e.shiftKey) refazerUm();
        else desfazerUm();
      } else if (mod && tecla === "y") {
        e.preventDefault();
        refazerUm();
      } else if (mod && tecla === "d" && mesaEscolhida) {
        e.preventDefault();
        duplicar(mesaEscolhida.id);
      } else if (e.key === "Escape") {
        // Um menu ou uma folha abertos fecham-se a si; o Escape não é para cá.
        if (document.querySelector('[role="menu"], [role="dialog"]')) return;
        if (aSentar) setASentar(null);
        else if (seleccao) setSeleccao(null);
        else onSair();
      }
    };
  });
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => teclas.current(e);
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, []);

  // ── ARRASTAR UM CONVIDADO DA LISTA PARA UMA CADEIRA ──────────────────────
  /**
   * O §12.4 do sistema de design: só depois de 3 px é arrasto (antes é um
   * toque, que escolhe o grupo como sempre); a cadeira por baixo acende-se; o
   * que não cai num alvo volta para a lista. O alvo descobre-se pelo mesmo
   * `data-alvo` que a sala usa para largar uma pessoa de uma cadeira noutra.
   */
  const [arrasto, setArrasto] = useState<{
    convidadoId: string;
    nome: string;
    x: number;
    y: number;
    lugar: string | null;
    mesa: string | null;
  } | null>(null);
  const arrastou = useRef(false);

  function comecarArrasto(e: React.PointerEvent, convidadoId: string, nome: string) {
    if (e.button !== 0 || compacto) return;
    const inicio = { x: e.clientX, y: e.clientY };
    arrastou.current = false;
    let corrente: typeof arrasto = null;
    function mover(ev: PointerEvent) {
      if (
        !arrastou.current &&
        Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < LIMIAR_DO_ARRASTO_PX
      )
        return;
      arrastou.current = true;
      const sob = document.elementFromPoint?.(ev.clientX, ev.clientY) ?? null;
      const lugar = sob?.closest?.("[data-alvo^='lugar|']")?.getAttribute("data-alvo") ?? null;
      const mesa = sob?.closest?.("[data-alvo^='mesa|']")?.getAttribute("data-alvo") ?? null;
      corrente = {
        convidadoId,
        nome,
        x: ev.clientX,
        y: ev.clientY,
        lugar: lugar ? lugar.split("|")[1] : null,
        mesa: mesa ? mesa.split("|")[1] : null,
      };
      setArrasto(corrente);
    }
    function largar() {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", largar);
      window.removeEventListener("pointercancel", largar);
      setArrasto(null);
      if (!arrastou.current || !corrente) return;
      if (corrente.lugar) {
        const { mesaId, lugar } = lerChave(corrente.lugar);
        sentarGrupoEm(convidadoId, mesaId, lugar);
      } else if (corrente.mesa) {
        sentarGrupoEm(convidadoId, corrente.mesa);
      }
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", largar);
    window.addEventListener("pointercancel", largar);
  }

  // ── PEÇAS DO ECRÃ ─────────────────────────────────────────────────────────
  const adicionar: MoreMenuItem[] = [
    {
      label: "Mesa redonda",
      hint: "8 lugares à volta",
      icon: <IconeMesaRedonda />,
      onClick: () => acrescentarMesa("redonda"),
    },
    {
      label: "Mesa comprida",
      hint: "10 lugares, dos dois lados",
      icon: <IconeMesaComprida />,
      onClick: () => acrescentarMesa("comprida"),
    },
    {
      label: "Mesa quadrada",
      hint: "8 lugares, pelos quatro lados",
      icon: <IconeMesaQuadrada />,
      onClick: () => acrescentarMesa("quadrada"),
    },
    // Escritos um a um, e não com um `.map`: o compilador do React lê um
    // `onClick` criado dentro de um `.map` em desenho como podendo correr já.
    {
      label: ELEMENTOS.noivos.nome,
      hint: "Elemento da sala",
      icon: <ICONE_DO_ELEMENTO.noivos />,
      onClick: () => acrescentarElemento("noivos"),
    },
    {
      label: ELEMENTOS.pista.nome,
      hint: "Elemento da sala",
      icon: <ICONE_DO_ELEMENTO.pista />,
      onClick: () => acrescentarElemento("pista"),
    },
    {
      label: ELEMENTOS.palco.nome,
      hint: "Elemento da sala",
      icon: <ICONE_DO_ELEMENTO.palco />,
      onClick: () => acrescentarElemento("palco"),
    },
    {
      label: ELEMENTOS.buffet.nome,
      hint: "Elemento da sala",
      icon: <ICONE_DO_ELEMENTO.buffet />,
      onClick: () => acrescentarElemento("buffet"),
    },
    {
      label: ELEMENTOS.bar.nome,
      hint: "Elemento da sala",
      icon: <ICONE_DO_ELEMENTO.bar />,
      onClick: () => acrescentarElemento("bar"),
    },
    {
      label: ELEMENTOS.outro.nome,
      hint: "Elemento da sala",
      icon: <ICONE_DO_ELEMENTO.outro />,
      onClick: () => acrescentarElemento("outro"),
    },
  ];

  const podeAnular = historico.passado.length > 0;
  const podeRefazer = historico.futuro.length > 0;
  const estadoDaGravacao =
    estado === "a-gravar" ? "A guardar…" : estado === "por-gravar" ? "Por guardar" : "Guardado";

  const botaoRedondo = `alvo-toque flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--bo-text)] hover:bg-[var(--bo-tinta-6)] disabled:opacity-35 ${ESTADO} ${PRESSAO}`;

  const listaDeEspera = (
    <div className="flex flex-col gap-3">
      {aSentar && (
        <p
          role="status"
          className="rounded-lg bg-[var(--bo-accent-lavagem)] px-3 py-2 text-xs text-[var(--bo-text)]"
        >
          Toca num lugar livre para sentar <strong>{nomeDoGrupo(aSentar)}</strong>.{" "}
          <button
            type="button"
            className={`underline ${ESTADO} ${PRESSAO}`}
            onClick={() => setASentar(null)}
          >
            Cancelar
          </button>
        </p>
      )}
      {espera.length === 0 ? (
        <p className="text-xs text-[var(--bo-text-muted)]">
          {lista.length === 0
            ? "Este evento ainda não tem convidados. Acrescenta-os aqui em baixo."
            : "Toda a gente está sentada."}
        </p>
      ) : (
        <>
          {!compacto && (
            <p className="text-[11px] leading-snug text-[var(--bo-text-muted)]">
              Arrasta um nome para uma cadeira, ou toca nele e depois num lugar livre.
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {espera.map((g) => {
              const escolhido = aSentar === g.convidadoId;
              return (
                <li key={g.convidadoId} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={escolhido}
                    onPointerDown={(e) => comecarArrasto(e, g.convidadoId, g.grupo)}
                    onPointerEnter={() => setRealce(g.convidadoId)}
                    onPointerLeave={() => setRealce((r) => (r === g.convidadoId ? null : r))}
                    onClick={() => {
                      if (arrastou.current) {
                        arrastou.current = false;
                        return;
                      }
                      setASentar(escolhido ? null : g.convidadoId);
                      if (!escolhido && compacto) setEsperaAberta(false);
                    }}
                    className={`alvo-toque flex min-w-0 flex-1 touch-none items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm ${ESTADO} ${PRESSAO} ${
                      escolhido
                        ? "border-[var(--bo-accent)] bg-[var(--bo-accent-lavagem)]"
                        : "cursor-grab border-[var(--bo-hairline)] bg-[var(--bo-surface)] hover:bg-[var(--bo-tinta-6)]"
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      {g.grupo}
                      {g.rsvp === "pendente" && (
                        <span className="ml-1.5 text-[11px] text-[var(--bo-text-muted)]">
                          · por confirmar
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--bo-tinta-6)] px-2 py-0.5 tabular-nums text-xs text-[var(--bo-text-muted)]">
                      {g.faltam < g.de ? `${g.faltam} de ${g.de}` : g.de}
                    </span>
                  </button>
                  {vista === "lista" && mapa.mesas.length > 0 && (
                    <select
                      aria-label={`Sentar ${nomeDoGrupo(g.convidadoId)} em…`}
                      className="h-9 min-w-0 rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] px-2 text-xs"
                      value=""
                      onChange={(e) =>
                        e.target.value && sentarGrupoEm(g.convidadoId, e.target.value)
                      }
                    >
                      <option value="">Sentar em…</option>
                      {mapa.mesas.map((m) => (
                        <option
                          key={m.id}
                          value={m.id}
                          disabled={livresDaMesa(mapa, m).length === 0}
                        >
                          {m.nome} · {livresDaMesa(mapa, m).length} livres
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <NovoConvidado onAcrescentar={acrescentarConvidado} />
    </div>
  );

  const painelDaPeca = (
    <>
      {mesaEscolhida && (
        <div className="flex flex-col gap-4 p-4">
          <div data-nome-da-peca>
            <Field
              as="input"
              label="Nome da mesa"
              value={mesaEscolhida.nome}
              onChange={(e) =>
                mexer((m) => mudarMesa(m, mesaEscolhida.id, { nome: e.target.value }), {
                  juntar: `nome-${mesaEscolhida.id}`,
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--bo-text-muted)]">Forma</span>
            <Segmented<FormaDaMesa>
              size="sm"
              ariaLabel="Forma da mesa"
              value={mesaEscolhida.forma}
              onChange={(forma) => mexer((m) => mudarMesa(m, mesaEscolhida.id, { forma }))}
              options={(["redonda", "comprida", "quadrada"] as const).map((f) => ({
                value: f,
                label: ROTULO_DA_FORMA[f],
              }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--bo-text-muted)]">Lugares</span>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Menos um lugar"
              disabled={mesaEscolhida.lugares <= 1}
              onClick={() => mudarLugares(mesaEscolhida.id, mesaEscolhida.lugares - 1)}
            >
              −
            </Button>
            <span className="min-w-8 text-center tabular-nums" aria-live="polite">
              {mesaEscolhida.lugares}
            </span>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Mais um lugar"
              disabled={mesaEscolhida.lugares >= TECTOS.lugaresPorMesa}
              onClick={() => mudarLugares(mesaEscolhida.id, mesaEscolhida.lugares + 1)}
            >
              +
            </Button>
            {mesaEscolhida.forma !== "redonda" && (
              <Button size="sm" variant="ghost" onClick={() => rodar(mesaEscolhida.id)}>
                Rodar
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--bo-text-muted)]">Quem está sentado</span>
            <ol className="flex flex-col gap-1.5">
              {quemEstaNaMesa(mapa, mesaEscolhida).map(({ lugar, chave, ocupante }) => {
                // O número único do lugar — o mesmo da cadeira no PDF.
                const numero = numerosDaSala.get(chave) ?? lugar + 1;
                const grupo = ocupante
                  ? lista.find((g) => g.id === ocupante.convidadoId)
                  : undefined;
                return (
                  <li key={chave} className="flex items-center gap-2 text-sm">
                    <span className="w-7 shrink-0 text-right text-xs tabular-nums text-[var(--bo-text-muted)]">
                      {numero}
                    </span>
                    {ocupante ? (
                      <>
                        {grupo && grupo.party > 1 ? (
                          <input
                            aria-label={`Nome da pessoa no lugar ${numero}`}
                            className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] px-2 text-sm"
                            placeholder={nomeDoLugar({ ...ocupante, nome: undefined }, lista)}
                            defaultValue={ocupante.nome ?? ""}
                            onBlur={(e) => mexer((m) => nomearLugar(m, chave, e.target.value))}
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate">
                            {nomeDoLugar(ocupante, lista)}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => mexer((m) => levantar(m, chave))}
                        >
                          Levantar
                        </Button>
                      </>
                    ) : (
                      <span className="flex-1 text-xs text-[var(--bo-text-muted)]">livre</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => duplicar(mesaEscolhida.id)}>
              Duplicar mesa
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => apagar({ tipo: "mesa", id: mesaEscolhida.id })}
            >
              Apagar mesa
            </Button>
          </div>
        </div>
      )}
      {elementoEscolhido && (
        <div className="flex flex-col gap-4 p-4">
          <div data-nome-da-peca>
            <Field
              as="input"
              label="Nome"
              value={elementoEscolhido.nome}
              onChange={(e) =>
                mexer((m) => mudarElemento(m, elementoEscolhido.id, { nome: e.target.value }), {
                  juntar: `nome-${elementoEscolhido.id}`,
                })
              }
            />
          </div>
          {(["largura", "altura"] as const).map((lado) => (
            <div key={lado} className="flex items-center gap-2">
              <span className="w-16 text-xs text-[var(--bo-text-muted)]">
                {lado === "largura" ? "Largura" : "Altura"}
              </span>
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Menos ${lado}`}
                onClick={() =>
                  mexer((m) =>
                    mudarElemento(m, elementoEscolhido.id, {
                      [lado]: elementoEscolhido[lado] - 50,
                    }),
                  )
                }
              >
                −
              </Button>
              <span className="min-w-14 text-center text-sm tabular-nums">
                {elementoEscolhido[lado]} cm
              </span>
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Mais ${lado}`}
                onClick={() =>
                  mexer((m) =>
                    mudarElemento(m, elementoEscolhido.id, {
                      [lado]: elementoEscolhido[lado] + 50,
                    }),
                  )
                }
              >
                +
              </Button>
            </div>
          ))}
          <Button
            variant="danger"
            size="sm"
            onClick={() => apagar({ tipo: "elemento", id: elementoEscolhido.id })}
          >
            Apagar
          </Button>
        </div>
      )}
    </>
  );

  const listaVisivel = !compacto && !listaRecolhida;
  const painelVisivel = !compacto && !!(mesaEscolhida || elementoEscolhido);
  const margens: Margens = compacto
    ? { topo: 72, esquerda: 0, direita: 0, fundo: 72 }
    : {
        topo: TOPO_PX,
        esquerda: listaVisivel ? LARGURA_DA_LISTA_PX + 24 : 0,
        direita: painelVisivel ? LARGURA_DO_PAINEL_PX + 24 : 0,
        fundo: 0,
      };

  // No telemóvel a folha da peça só abre com o «Editar» de baixo: abri-la
  // sozinha ao acrescentar a pista ou o buffet tapava a sala que se queria ver.
  const folhaDaPeca = compacto && pecaAberta && !!(mesaEscolhida || elementoEscolhido);

  return (
    <div
      className="fixed inset-0 z-40 overflow-hidden bg-[var(--bo-chao)]"
      role="region"
      aria-label={`Mapa de mesas de ${pedido.name}`}
    >
      {/* ── A SALA, POR BAIXO DE TUDO ───────────────────────────────────── */}
      {vista === "visual" ? (
        <>
          {mapa.mesas.length === 0 && mapa.elementos.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[1] mx-auto flex max-w-sm -translate-y-1/2 flex-col items-center gap-2 px-6 text-center">
              <IconeMesaRedonda tamanho={40} />
              <p className="text-base font-medium text-[var(--bo-text)]">A sala está vazia</p>
              <p className="text-sm text-[var(--bo-text-muted)]">
                Em «Adicionar» há mesas redondas, compridas e quadradas, e os noivos, a pista, o
                palco, o buffet e o bar. Arrasta cada peça para o sítio dela.
              </p>
            </div>
          )}
          <Sala
            cheio
            margens={margens}
            mapa={mapa}
            lista={lista}
            seleccao={seleccao}
            aSentar={aSentar !== null}
            realce={realce}
            lugarAceso={arrasto?.lugar ?? null}
            mesaAcesa={arrasto && !arrasto.lugar ? arrasto.mesa : null}
            onSeleccionar={setSeleccao}
            onMoverMesa={(id, x, y) => mexer((m) => mudarMesa(m, id, { x, y }))}
            onMoverElemento={(id, x, y) => mexer((m) => mudarElemento(m, id, { x, y }))}
            onApagar={apagar}
            onTocarLugar={tocarLugar}
            onLevarPessoa={(de, para) => {
              const oc = mapaRef.current.lugares[de];
              if (oc) mexer((m) => sentar(m, para, oc));
            }}
            onMudarLugares={mudarLugares}
            onDuplicar={duplicar}
            onRodar={rodar}
            onEditarNome={editarNome}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-24"
          style={{
            paddingTop: margens.topo,
            paddingLeft: compacto ? undefined : margens.esquerda + 12,
            paddingRight: compacto ? undefined : margens.direita + 12,
          }}
        >
          <VistaEmLista
            mapa={mapa}
            lista={lista}
            onMudar={(chave, destino) => {
              const oc = mapaRef.current.lugares[chave];
              if (!oc) return;
              if (destino === "") mexer((m) => levantar(m, chave));
              else {
                const mesa = mapaRef.current.mesas.find((x) => x.id === destino);
                const livre = mesa ? livresDaMesa(mapaRef.current, mesa)[0] : undefined;
                if (mesa && livre !== undefined)
                  mexer((m) => sentar(m, chaveDoLugar(mesa.id, livre), oc));
              }
            }}
            onEscolherMesa={(id) => setSeleccao({ tipo: "mesa", id })}
          />
        </div>
      )}

      {/* ── A BARRA DE CIMA: o único vidro do ecrã ─────────────────────── */}
      <Glass
        superficie="barra"
        className="absolute inset-x-3 top-3 z-20 flex items-center gap-1.5 rounded-[var(--bo-raio-painel)] border border-[var(--bo-hairline)] bg-[var(--bo-surface)]/78 p-1.5 shadow-[var(--bo-sombra-suspensa)] sm:gap-2"
      >
        <button
          type="button"
          onClick={onSair}
          aria-label="Voltar aos eventos"
          className={`alvo-toque flex h-10 shrink-0 items-center gap-1 rounded-full pl-2 pr-3 text-sm text-[var(--bo-text)] hover:bg-[var(--bo-tinta-6)] ${ESTADO} ${PRESSAO}`}
        >
          <IconeVoltar />
          <span className="hidden sm:inline">Eventos</span>
        </button>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-medium text-[var(--bo-text)]">{pedido.name}</p>
          <p className="truncate text-xs text-[var(--bo-tinta-72)]">
            {[resumo?.evento, resumo?.quando, resumo?.local].filter(Boolean).join(" · ") ||
              "Mapa de mesas"}
            <span className="sr-only"> · </span>
            <span role="status" className="ml-2 text-[var(--bo-tinta-72)]">
              {estadoDaGravacao}
            </span>
          </p>
        </div>

        <div
          role="group"
          aria-label="Sentados"
          className="flex shrink-0 items-center gap-2 rounded-full px-2 py-1"
          title={`${numeros.lugares} lugares · ${numeros.livres} livres`}
        >
          <Anel feito={numeros.sentados} total={numeros.total} />
          <span className="hidden text-xs text-[var(--bo-tinta-72)] lg:inline">Sentados</span>
          <span className="text-sm font-medium tabular-nums text-[var(--bo-text)]">
            {numeros.sentados}/{numeros.total}
          </span>
        </div>

        <span
          aria-hidden="true"
          className="mx-0.5 hidden h-6 w-px bg-[var(--bo-hairline)] sm:block"
        />

        <MoreMenu
          label="Adicionar"
          icone={<IconeMais />}
          variante="secondary"
          items={adicionar}
          opaco
        />

        {!compacto && (
          <Button
            size="sm"
            variant="primary"
            onClick={sentarTodos}
            disabled={mapa.mesas.length === 0}
            iconLeft={<IconeVarinha />}
          >
            Sentar todos
          </Button>
        )}

        <button
          type="button"
          className={botaoRedondo}
          onClick={desfazerUm}
          disabled={!podeAnular}
          aria-label="Anular o último passo"
          title="Anular (⌘Z)"
        >
          <IconeAnular />
        </button>
        {!compacto && (
          <button
            type="button"
            className={botaoRedondo}
            onClick={refazerUm}
            disabled={!podeRefazer}
            aria-label="Refazer"
            title="Refazer (⇧⌘Z)"
          >
            <IconeRefazer />
          </button>
        )}

        {!compacto && (
          <MoreMenu
            label="Partilhar"
            icone={<IconePartilhar />}
            variante="secondary"
            items={partilhar.itens}
            opaco
          />
        )}

        {!compacto ? (
          <Segmented<Vista>
            size="sm"
            ariaLabel="Ver o mapa"
            value={vista}
            onChange={setVista}
            options={[
              { value: "visual", label: "Visual" },
              { value: "lista", label: "Lista" },
            ]}
          />
        ) : (
          <MoreMenu
            label="Mais"
            opaco
            items={[
              {
                label: "Sentar todos",
                hint: "Os grupos confirmados, sem os partir",
                onClick: sentarTodos,
              },
              { label: "Refazer", onClick: refazerUm },
              {
                label: vista === "visual" ? "Ver em lista" : "Ver o desenho",
                onClick: () => setVista(vista === "visual" ? "lista" : "visual"),
              },
              ...partilhar.itens,
            ]}
          />
        )}
      </Glass>
      {partilhar.folha}

      {/* ── O PDF DO MAPA A CHEGAR ─────────────────────────────────────────
          «Descarregar», «WhatsApp» e «Imprimir» pedem o mesmo PDF, e até aqui
          nenhum dizia nada enquanto ele vinha (o `aTrabalhar` existia e
          ninguém o lia). Logo por baixo da barra de cima, e OPACO: a barra é
          a única camada de vidro deste ecrã. */}
      {partilhar.descarga.mostrar && (
        <div
          className="absolute left-1/2 z-30 w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-xl bg-[var(--bo-elevado)] shadow-[var(--bo-sombra-suspensa)]"
          style={{ top: margens.topo }}
        >
          <EmCurso
            titulo="A preparar o PDF do mapa…"
            pronto="PDF do mapa pronto"
            estimadoMs={3000}
            {...partilhar.descarga.barra}
          />
        </div>
      )}

      {/* ── O GRUPO QUE NÃO COUBE, E OS GRUPOS PARTIDOS ──────────────────── */}
      {(naoCoube || partidos.length > 0) && (
        <div
          className="absolute left-1/2 z-20 w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2"
          style={{ top: margens.topo }}
        >
          {naoCoube ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-elevado)] px-3 py-2 text-sm shadow-[var(--bo-sombra-suspensa)]"
            >
              <span className="min-w-0 flex-1">
                {naoCoube.ficaram === 1 ? "Ficou 1 pessoa" : `Ficaram ${naoCoube.ficaram} pessoas`}{" "}
                de <strong>{nomeDoGrupo(naoCoube.convidadoId)}</strong> sem lugar nesta mesa.
              </span>
              {(() => {
                const mesa = mapa.mesas.find((m) => m.id === naoCoube.mesaId);
                const cabem = mesa ? TECTOS.lugaresPorMesa - mesa.lugares : 0;
                return mesa && cabem > 0 ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const r = acrescentarLugares(mapaRef.current, mesa.id, naoCoube.ficaram);
                      mexer(() => r.mapa);
                      sentarGrupoEm(naoCoube.convidadoId, mesa.id);
                    }}
                  >
                    Acrescentar {Math.min(cabem, naoCoube.ficaram)}{" "}
                    {Math.min(cabem, naoCoube.ficaram) === 1 ? "lugar" : "lugares"} à {mesa.nome}
                  </Button>
                ) : null;
              })()}
              {maisProximaComLugar(mapa, naoCoube.mesaId) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const r = sentarResto(
                      mapaRef.current,
                      lista,
                      naoCoube.convidadoId,
                      naoCoube.mesaId,
                    );
                    mexer(() => r.mapa);
                    setNaoCoube(r.ficaram > 0 ? { ...naoCoube, ficaram: r.ficaram } : null);
                  }}
                >
                  Sentar o resto na mesa mais próxima
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setNaoCoube(null)}>
                Deixar assim
              </Button>
            </div>
          ) : (
            <p className="mx-auto w-fit rounded-full border border-[var(--bo-hairline)] bg-[var(--bo-elevado)] px-3 py-1.5 text-xs text-[var(--bo-aviso)] shadow-[var(--bo-sombra-erguida)]">
              {partidos.length === 1 ? "1 grupo está" : `${partidos.length} grupos estão`} em mais
              do que uma mesa: {partidos.map(nomeDoGrupo).join(", ")}.
            </p>
          )}
        </div>
      )}

      {/* ── A LISTA DE ESPERA, À ESQUERDA ───────────────────────────────── */}
      {!compacto &&
        (listaVisivel ? (
          <section
            aria-labelledby="titulo-espera"
            className="absolute bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-[var(--bo-raio-painel)] border border-[var(--bo-hairline)] bg-[var(--bo-elevado)] shadow-[var(--bo-sombra-suspensa)]"
            style={{ top: TOPO_PX, width: LARGURA_DA_LISTA_PX }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--bo-hairline)] px-4 py-3">
              <h2 id="titulo-espera" className="text-sm font-medium text-[var(--bo-text)]">
                Por sentar{" "}
                <span className="tabular-nums text-[var(--bo-text-muted)]">· {porSentarN}</span>
              </h2>
              <button
                type="button"
                className={`${botaoRedondo} h-8 w-8`}
                onClick={() => setListaRecolhida(true)}
                aria-label="Recolher a lista de espera"
                title="Recolher"
              >
                <IconeFechar />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {listaDeEspera}
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setListaRecolhida(false)}
            className={`alvo-toque absolute left-3 z-10 flex items-center gap-2 rounded-full border border-[var(--bo-hairline)] bg-[var(--bo-elevado)] px-4 py-2 text-sm shadow-[var(--bo-sombra-suspensa)] hover:bg-[var(--bo-surface-hover)] ${ESTADO} ${PRESSAO}`}
            style={{ top: TOPO_PX }}
          >
            <IconePessoas />
            Por sentar{" "}
            <span className="tabular-nums text-[var(--bo-text-muted)]">· {porSentarN}</span>
          </button>
        ))}

      {/* ── O PAINEL DA PEÇA ESCOLHIDA, À DIREITA ───────────────────────── */}
      {painelVisivel && (
        <aside
          aria-label={mesaEscolhida?.nome ?? elementoEscolhido?.nome ?? "Peça"}
          className="absolute right-3 z-10 flex max-h-[calc(100%-6rem)] flex-col overflow-hidden rounded-[var(--bo-raio-painel)] border border-[var(--bo-hairline)] bg-[var(--bo-elevado)] shadow-[var(--bo-sombra-suspensa)]"
          style={{ top: TOPO_PX, width: LARGURA_DO_PAINEL_PX }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--bo-hairline)] px-4 py-3">
            <h2 className="truncate text-sm font-medium text-[var(--bo-text)]">
              {mesaEscolhida?.nome ?? elementoEscolhido?.nome}
            </h2>
            <button
              type="button"
              className={`${botaoRedondo} h-8 w-8`}
              onClick={() => setSeleccao(null)}
              aria-label="Fechar o painel"
              title="Fechar (Esc)"
            >
              <IconeFechar />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{painelDaPeca}</div>
        </aside>
      )}

      {/* ── NO TELEMÓVEL: a pastilha da lista de espera, em baixo ───────── */}
      {compacto && (
        <div className="absolute bottom-4 left-3 z-10 flex gap-2">
          <button
            type="button"
            onClick={() => setEsperaAberta(true)}
            className={`alvo-toque flex items-center gap-2 rounded-full border border-[var(--bo-hairline)] bg-[var(--bo-elevado)] px-4 py-2.5 text-sm shadow-[var(--bo-sombra-suspensa)] ${ESTADO} ${PRESSAO}`}
          >
            <IconePessoas />
            Lista de espera · {porSentarN}
          </button>
          {(mesaEscolhida || elementoEscolhido) && (
            <button
              type="button"
              onClick={() => setPecaAberta(true)}
              className={`alvo-toque flex items-center gap-2 rounded-full border border-[var(--bo-hairline)] bg-[var(--bo-elevado)] px-4 py-2.5 text-sm shadow-[var(--bo-sombra-suspensa)] ${ESTADO} ${PRESSAO}`}
            >
              Editar {mesaEscolhida?.nome ?? elementoEscolhido?.nome}
            </button>
          )}
        </div>
      )}

      {/* ── O NOME QUE VAI NO DEDO, A CAMINHO DE UMA CADEIRA ────────────── */}
      {arrasto && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[130%] rounded-full bg-[var(--bo-accent)] px-3 py-1.5 text-sm font-medium text-[var(--bo-sobre-acento)] shadow-[var(--bo-sombra-suspensa)]"
          style={{ left: arrasto.x, top: arrasto.y }}
        >
          {arrasto.nome}
        </div>
      )}

      <FolhaOuDialogo
        aberto={compacto && esperaAberta}
        onFechar={() => setEsperaAberta(false)}
        titulo="Lista de espera"
        descricao="Toca num convidado e depois num lugar livre."
      >
        {listaDeEspera}
      </FolhaOuDialogo>

      <FolhaOuDialogo
        aberto={folhaDaPeca}
        onFechar={() => setPecaAberta(false)}
        titulo={mesaEscolhida?.nome ?? elementoEscolhido?.nome ?? ""}
      >
        {painelDaPeca}
      </FolhaOuDialogo>
    </div>
  );
}

/**
 * A vista «Lista»: cada mesa com quem lá está, e um «Mudar para…» em cada
 * pessoa. É a alternativa inteira ao arrasto — para o teclado, para o leitor
 * de ecrã, e para quem prefere ler a ver.
 */
function VistaEmLista({
  mapa,
  lista,
  onMudar,
  onEscolherMesa,
}: {
  mapa: MapaDeMesas;
  lista: readonly Guest[];
  onMudar: (chave: string, destino: string) => void;
  onEscolherMesa: (id: string) => void;
}) {
  if (mapa.mesas.length === 0) {
    return <p className="text-sm text-[var(--bo-text-muted)]">Ainda não há mesas.</p>;
  }
  // O número único de cada lugar — o mesmo do PDF (o pedido dela de 15/10).
  const numeros = numerosDosLugares(mapa);
  return (
    <div className="grid min-w-0 gap-3 @container sm:grid-cols-2 lg:grid-cols-3">
      {mapa.mesas.map((mesa) => {
        const sentados = quemEstaNaMesa(mapa, mesa).filter((l) => l.ocupante);
        return (
          <section key={mesa.id} className="bo-card p-3" aria-label={mesa.nome}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <button
                type="button"
                className={`text-base font-medium underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                onClick={() => onEscolherMesa(mesa.id)}
              >
                {mesa.nome}
              </button>
              <span className="text-xs tabular-nums text-[var(--bo-text-muted)]">
                {sentados.length}/{mesa.lugares} · {ROTULO_DA_FORMA[mesa.forma]}
              </span>
            </div>
            {sentados.length === 0 ? (
              <p className="text-xs text-[var(--bo-text-muted)]">Ninguém sentado.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {sentados.map(({ chave, ocupante }) => {
                  const nome = nomeDoLugar(ocupante!, lista);
                  return (
                    <li key={chave} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-7 shrink-0 text-right text-xs tabular-nums text-[var(--bo-text-muted)]"
                        aria-label={`Lugar ${numeros.get(chave)}`}
                      >
                        {numeros.get(chave)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{nome}</span>
                      <select
                        aria-label={`Mudar ${nome} para…`}
                        className="h-9 min-w-0 max-w-[10rem] rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] px-2 text-xs"
                        value={mesa.id}
                        onChange={(e) => onMudar(chave, e.target.value)}
                      >
                        <option value={mesa.id}>{mesa.nome}</option>
                        {mapa.mesas
                          .filter((m) => m.id !== mesa.id)
                          .map((m) => (
                            <option
                              key={m.id}
                              value={m.id}
                              disabled={livresDaMesa(mapa, m).length === 0}
                            >
                              {m.nome} · {livresDaMesa(mapa, m).length} livres
                            </option>
                          ))}
                        <option value="">Lista de espera</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Um convidado novo, daqui mesmo. O nome em cima, a toda a largura — na
 * captura dela, ao lado do «Pessoas», o campo cortava «Nome (pessoa ou fa».
 */
function NovoConvidado({
  onAcrescentar,
}: {
  onAcrescentar: (nome: string, quantos: number) => void;
}) {
  const [nome, setNome] = useState("");
  const [quantos, setQuantos] = useState("1");
  function acrescentar() {
    if (!nome.trim()) return;
    onAcrescentar(nome, Number(quantos) || 1);
    setNome("");
    setQuantos("1");
  }
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--bo-hairline)] pt-3">
      <Field
        as="input"
        label="Novo convidado"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && acrescentar()}
        placeholder="Nome (pessoa ou família)"
      />
      <div className="flex items-end gap-2">
        <Field
          as="input"
          type="number"
          min={1}
          max={1000}
          label="Pessoas"
          value={quantos}
          onChange={(e) => setQuantos(e.target.value)}
          containerClassName="w-24"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={acrescentar}
          disabled={!nome.trim()}
          className="flex-1"
        >
          Acrescentar
        </Button>
      </div>
    </div>
  );
}
