"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModeloProposta, TipoModelo } from "@/lib/proposal-templates";
import { SAIDA, useSaidaDeUmSo } from "./ui/saida";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * MODELOS PARCIAIS — guardar e reutilizar UM grupo de serviços, ou UM mood
 * board, sem copiar a proposta inteira.
 *
 * ── Porque é que isto não é o mesmo que duplicar a proposta ───────────────
 * Duplicar serve quando a proposta nova é uma variação da anterior. Isto serve
 * para a outra metade do trabalho repetido: o bloco «Complementos dos Noivos»
 * é igual em todos os casamentos, e o mood board da cerimónia na igreja
 * também. Copiar a proposta toda para ir buscar um bloco obrigaria a apagar
 * tudo o resto — mais trabalho do que escrever de novo.
 *
 * ── É um menu e não um diálogo ───────────────────────────────────────────
 * Vive dentro da secção a que pertence, ao lado do «+ Adicionar». Um diálogo
 * a ecrã inteiro para escolher entre três blocos rouba o contexto de onde ela
 * está — e ela está a meio de uma lista, não a começar uma tarefa nova.
 */

interface Props {
  tipo: Extract<TipoModelo, "grupo" | "moodboard">;
  /** O que inserir quando ela escolhe um modelo. */
  onInserir?: (
    conteudo: NonNullable<ModeloProposta["grupo"] | ModeloProposta["moodboard"]>,
  ) => void;
  /** O bloco que está neste momento em edição, para o poder guardar. */
  paraGuardar?: NonNullable<ModeloProposta["grupo"] | ModeloProposta["moodboard"]>;
  /** Um nome de partida para a caixa do nome (o título do grupo/board). */
  nomeSugerido?: string;
  /**
   * Que controlos desenhar.
   *
   * ── PORQUE É QUE ISTO É UMA ESCOLHA E NÃO SÃO SEMPRE OS DOIS ────────────
   * Os dois botões têm âmbitos DIFERENTES. «De um modelo…» acrescenta um bloco
   * novo ao fim da secção — pertence à secção, e um por secção chega.
   * «Guardar como modelo» guarda UM bloco concreto, e por isso tem de viver ao
   * lado desse bloco.
   *
   * Enquanto foram um par indivisível ao fundo da secção, o `paraGuardar` era
   * escolhido por quem chamava — na prática, «o primeiro mood board com
   * título». Ela montava o terceiro mood board, carregava em «Guardar como
   * modelo», e guardava o primeiro. Sem aviso, e sem maneira nenhuma de
   * guardar o terceiro.
   */
  mostrar?: "ambos" | "inserir" | "guardar";
  toast?: (mensagem: string, tipo?: "success" | "error") => void;
  className?: string;
  /**
   * O «De um modelo…» desenhado como uma PORTA (Fase 3 do redesenho, 10/11):
   * sem mood boards, o passo abre com três portas do mesmo tamanho, e esta é
   * uma delas. A lista de modelos e o resto são os mesmos.
   */
  porta?: { titulo: string; texto: string; className: string };
}

const ROTULO = {
  grupo: { um: "grupo", inserir: "De um modelo…", guardar: "Guardar como modelo" },
  moodboard: { um: "mood board", inserir: "De um modelo…", guardar: "Guardar como modelo" },
} as const;

/**
 * O PAINEL QUE CAÍA PARA FORA DO ECRÃ.
 *
 * Medido a 375 px, no estúdio, com «De um modelo…» aberto: o invólucro destes
 * botões começa em x = 204, e um painel de 288 px (`w-72`) ancorado à ESQUERDA
 * dele acabava em x = 492 — 117 px para lá da margem. E como o `body` tem
 * `overflow-x: clip`, esses 117 px não são arrastáveis: ficam CORTADOS. O que
 * lá estava escrito era a lista de modelos guardados e, quando não há nenhum, a
 * frase que explica como se guarda o primeiro — lida pela metade.
 *
 * Ancorado à DIREITA, o painel cresce para dentro do ecrã — que é o que os
 * outros menus do back office já faziam (`ui/MenuDeAccoes`, `MoreMenu`). Só
 * isso não chegava: a 320 px o invólucro acaba em x = 205, e 288 px de painel
 * a crescer para a esquerda saíam 83 px pelo OUTRO lado. Daí o tecto de 60vw
 * enquanto o ecrã é de telemóvel — 192 px a 320 e 225 px a 375, ou seja nunca
 * menos do que os 192 px (`min-w-48`) que o menu de acções da casa já usa. A
 * partir de `sm` o tecto sai e o painel volta aos 288 px de sempre.
 *
 * Não é posicionamento a sério (isso pedia JavaScript a medir o gatilho); é a
 * garantia, em CSS, de que o que está escrito lá dentro se lê inteiro.
 */
/* ── E O MATERIAL DELE ─────────────────────────────────────────────────────
   Era `rounded-xl border … bg-[var(--bo-surface)]`. O `rounded-xl` media 8 px como todo o
   resto do conteúdo — o bloco dos raios do `globals.css` colapsa a escala do
   Tailwind de propósito — e o `bg-[var(--bo-surface)]` era branco opaco escrito à mão, nem
   sequer o token da superfície.

   A `.bo-material` vive fora de camadas e escapa a esse colapso: traz os 12 px,
   o fio e a superfície translúcida. O desfoque vem numa classe à parte, para se
   poder baixar num sítio só. A conta do contraste está no `globals.css`. */
const PAINEL_SUSPENSO =
  "absolute top-full right-0 z-30 mt-1 w-72 max-w-[60vw] sm:max-w-none " +
  "bo-material bo-material-desfoque shadow-[var(--bo-sombra-suspensa)]";

/**
 * ── UM PAINEL DE CADA VEZ, E UM ESTADO SÓ ─────────────────────────────────
 *
 * Eram dois booleanos (`aberto` e `aGuardar`) que se desligavam um ao outro à
 * mão em quatro sítios. Enquanto o fecho era seco isso não se via; a partir do
 * momento em que o painel demora 200 ms a sair, vê-se — abrir «Guardar como
 * modelo» com a lista aberta punha os DOIS painéis no mesmo canto, um a entrar
 * por cima do outro a sair.
 *
 * Com um estado só, a exclusão deixa de ser uma regra que alguém tem de se
 * lembrar de escrever: só há saída quando se vai para `null`, e trocar de
 * painel é uma troca, não uma sobreposição.
 */
type Painel = "lista" | "guardar";

export default function ModelosParciais({
  tipo,
  onInserir,
  paraGuardar,
  nomeSugerido,
  mostrar = "ambos",
  toast,
  className,
  porta,
}: Props) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [modelos, setModelos] = useState<ModeloProposta[]>([]);
  const [nome, setNome] = useState("");
  /** A leitura falhou — o menu tem de dizer isso e não «não tens nenhum». */
  const [naoDeuParaLer, setNaoDeuParaLer] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const abridorDaLista = useRef<HTMLButtonElement>(null);
  const abridorDoGuardar = useRef<HTMLButtonElement>(null);

  /**
   * ── O PAINEL FECHAVA A SECO ───────────────────────────────────────────────
   *
   * Entrava com a `.bo-entrada` (está no `PAINEL_SUSPENSO`) e desaparecia entre
   * dois fotogramas em todas as saídas: Escape, clique fora, inserir um modelo,
   * cancelar, gravar. A `.bo-saida` é a outra metade da mesma palavra, e o
   * gancho é o que segura o nó os 200 ms que ela dura.
   *
   * O que fica a sair é uma IMAGEM: `inert`, sem `pointer-events` (a classe
   * larga-os), e — no painel de guardar — com a caixa de escrever já fora do
   * alcance do teclado, para que a tecla seguinte não caia num campo que já não
   * conta.
   */
  const aSairAgora = useSaidaDeUmSo(painel !== null);
  /**
   * Qual dos dois é que está a sair — o estado já não o diz, porque é `null`.
   * É a única coisa que o atalho de `ui/saida.ts` não pode saber por nós: ele
   * devolve um booleano, e aqui há duas caixas a partilhar o mesmo canto.
   *
   * Nota: só se guarda quando se vai para `null`. Trocar DIRECTAMENTE de painel
   * (a lista aberta e carregar em «Guardar como modelo») não é uma saída — é
   * uma troca, e quem chega é o sinal. Sem isto, os dois ficavam no mesmo canto
   * 200 ms, um a entrar por cima do outro a sair.
   */
  const [painelAntes, setPainelAntes] = useState<Painel | null>(painel);
  const [oQueSai, setOQueSai] = useState<Painel | null>(null);
  if (painelAntes !== painel) {
    setPainelAntes(painel);
    if (painel === null) setOQueSai(painelAntes);
  }
  /** O que se desenha: o painel aberto, ou o que ficou a apagar-se. */
  const aDesenhar = painel ?? (aSairAgora ? oQueSai : null);

  /**
   * ── E O FOCO VOLTA A QUEM ABRIU, NO INSTANTE DO GESTO ─────────────────────
   *
   * O nó fica montado 200 ms a apagar-se e passa a `inert` no fotograma do
   * gesto. Quem estava lá dentro — a caixa de escrever do «Guardar como
   * modelo» tem `autoFocus`, e o modelo escolhido é um botão — ficava com o
   * foco numa caixa que já não conta: o browser larga-o e ele cai no `<body>`,
   * portanto o Tab seguinte recomeça no topo da página. Numa proposta com
   * dezenas de controlos é voltar a percorrê-los todos.
   *
   * Devolver o foco é uma TAREFA, não uma animação: acontece já, e não daqui a
   * 200 ms. É a mesma frase que o `MenuDeAccoes` e o `MoreMenu` já dizem.
   *
   * O clique FORA não passa por aqui, de propósito: aí o foco vai para onde a
   * pessoa carregou, que é exactamente onde ela quis ir.
   *
   * Qual dos dois abridores é dito por quem chama, e não lido do `painel`: assim
   * esta função não fecha sobre estado nenhum e é ESTÁVEL — o efeito do Escape
   * pode tê-la nas dependências sem se rearmar a cada tecla escrita na caixa do
   * nome.
   */
  const fecharEDevolverFoco = useCallback((qual: Painel | null) => {
    const abridor = qual === "lista" ? abridorDaLista.current : abridorDoGuardar.current;
    setPainel(null);
    abridor?.focus();
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/propostas/modelos");
      const j = await r.json().catch(() => null);
      // Sem olhar ao `r.ok`, o corpo de um 401 (sessão caída) ou de um 500 é
      // `{error: …}`, não traz `modelos`, e entrava aqui como lista vazia — o
      // menu passava a dizer-lhe que nunca tinha guardado nada. Os modelos
      // estavam lá; o que ela lia era o convite a montar tudo outra vez.
      if (!r.ok || !Array.isArray(j?.modelos)) {
        throw new Error(typeof j?.error === "string" ? j.error : "Não deu para ler os modelos.");
      }
      setNaoDeuParaLer(false);
      setModelos((j.modelos as ModeloProposta[]).filter((m) => m.tipo === tipo));
    } catch (e) {
      setNaoDeuParaLer(true);
      toast?.(e instanceof Error ? e.message : "Não deu para ler os modelos.", "error");
    }
  }, [tipo, toast]);

  // Fechar ao clicar fora e no Esc — as duas saídas que as pessoas tentam.
  useEffect(() => {
    if (painel === null) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setPainel(null);
    };
    const esc = (e: KeyboardEvent) => {
      // O Escape fecha por baixo dos pés de quem está lá dentro: sem devolver o
      // foco, ele fica preso na caixa que se apaga.
      if (e.key === "Escape") fecharEDevolverFoco(painel);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [painel, fecharEDevolverFoco]);

  async function guardar() {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      const r = await fetch("/api/propostas/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: limpo,
          tipo,
          ...(tipo === "grupo" ? { grupo: paraGuardar } : { moodboard: paraGuardar }),
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Não deu para guardar.");
      setModelos((j.modelos as ModeloProposta[]).filter((m) => m.tipo === tipo));
      fecharEDevolverFoco("guardar");
      setNome("");
      toast?.(`Modelo «${limpo}» guardado.`, "success");
    } catch (e) {
      toast?.(e instanceof Error ? e.message : "Não deu para guardar.", "error");
    }
  }

  // `alvo-toque` leva estes dois a 44 px no telemóvel sem lhes mudar o aspecto:
  // eram links de 16 px de altura, e num ecrã táctil isso é acertar numa linha
  // de texto. No computador continuam a ser o que eram.
  const botao =
    "alvo-toque py-2 text-xs text-[var(--bo-text-muted)] underline-offset-2 hover:text-[var(--bo-text)] hover:underline";

  const podeInserir = mostrar !== "guardar" && !!onInserir;
  const podeGuardar = mostrar !== "inserir" && !!paraGuardar;

  return (
    <div ref={caixa} className={`relative inline-flex items-center gap-3 ${className ?? ""}`}>
      {podeInserir && (
        <button
          ref={abridorDaLista}
          type="button"
          className={`${porta ? porta.className : botao} ${ESTADO} ${PRESSAO}`}
          aria-expanded={painel === "lista"}
          onClick={() => {
            const vai = painel !== "lista";
            setPainel(vai ? "lista" : null);
            if (vai) void carregar();
          }}
        >
          {porta ? (
            <>
              <span className="block text-sm font-medium text-[var(--bo-text)]">
                {porta.titulo}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-[var(--bo-text-muted)]">
                {porta.texto}
              </span>
            </>
          ) : (
            ROTULO[tipo].inserir
          )}
        </button>
      )}

      {podeGuardar && (
        <button
          ref={abridorDoGuardar}
          type="button"
          className={`${botao} ${ESTADO} ${PRESSAO}`}
          aria-expanded={painel === "guardar"}
          onClick={() => {
            setPainel((p) => (p === "guardar" ? null : "guardar"));
            setNome(nomeSugerido ?? "");
          }}
        >
          {ROTULO[tipo].guardar}
        </button>
      )}

      {aDesenhar === "lista" && (
        <div
          className={`${aSairAgora ? SAIDA : "bo-entrada"} ${PAINEL_SUSPENSO} p-[var(--bo-material-folga)]`}
          aria-hidden={aSairAgora || undefined}
          inert={aSairAgora}
        >
          {naoDeuParaLer ? (
            <p className="px-2.5 py-2 text-xs text-[var(--bo-perigo)]">
              Não deu para ler os modelos guardados. Volta a tentar — os que tinhas continuam lá.
            </p>
          ) : modelos.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-[var(--bo-text-muted)]">
              Ainda não guardaste nenhum {ROTULO[tipo].um}. Monta um e carrega em «Guardar como
              modelo».
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {modelos.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    /* A LINHA SOB O RATO É UMA PASTILHA CHEIA. Era
                       `hover:bg-[var(--bo-tinta-6)]` — seis por cento de preto,
                       que sobre um material translúcido não chega a ser um
                       estado. Branco sobre `--bo-accent` mede 6,55:1. O
                       `active:` repete-a porque o `hover:` do Tailwind vive
                       dentro de `@media (hover: hover)` e no dedo não existe. */
                    className={`w-full rounded-[var(--bo-material-raio-pastilha)] px-2.5 py-2 text-left text-xs text-[var(--bo-tinta-72)] hover:bg-[var(--bo-accent)] hover:text-white active:bg-[var(--bo-accent)] active:text-white ${ESTADO} ${PRESSAO}`}
                    onClick={() => {
                      const conteudo = tipo === "grupo" ? m.grupo : m.moodboard;
                      // Um modelo sem conteúdo não pode passar por inserção
                      // bem sucedida: ela carregava e não acontecia nada.
                      if (!conteudo) {
                        toast?.("Esse modelo está vazio.", "error");
                        return;
                      }
                      // Devolver o foco ANTES da inserção: se ela levar a
                      // outro sítio, é este abridor que fica memorizado — e o
                      // botão escolhido desaparece com o painel.
                      fecharEDevolverFoco("lista");
                      // Cópia funda: inserir o mesmo objecto duas vezes fazia
                      // as duas cópias partilharem os itens, e editar uma
                      // mudava a outra.
                      onInserir?.(JSON.parse(JSON.stringify(conteudo)));
                    }}
                  >
                    {m.nome}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aDesenhar === "guardar" && (
        <div
          className={`${aSairAgora ? SAIDA : "bo-entrada"} ${PAINEL_SUSPENSO} p-3`}
          aria-hidden={aSairAgora || undefined}
          inert={aSairAgora}
        >
          <label className="block text-[11px] text-[var(--bo-text-muted)]" htmlFor={`mp-${tipo}`}>
            Nome do modelo
          </label>
          <input
            id={`mp-${tipo}`}
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void guardar()}
            placeholder={tipo === "grupo" ? "Complementos dos noivos" : "Cerimónia na igreja"}
            className="bo-input mt-1 w-full px-2.5 py-1.5 text-xs"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className={`${botao} ${ESTADO} ${PRESSAO}`}
              onClick={() => fecharEDevolverFoco("guardar")}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={`rounded-full bg-sage-600 px-3 py-1.5 text-xs text-white disabled:opacity-40 ${ESTADO} ${PRESSAO}`}
              disabled={!nome.trim()}
              onClick={() => void guardar()}
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
