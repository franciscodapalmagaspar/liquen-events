"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ESTADO, PRESSAO } from "./ui/movimento";
import type { AccaoDeItem } from "./ui";
import { SeparadorDoMenu, separadorAntesDe, teclasDoMenu } from "./ui/MenuDeAccoes";
import { SAIDA, useSaidaDeUmSo } from "./ui/saida";
import { fecharSoAoTocarFora } from "./ui/fechar-por-fora";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BOTÃO DIREITO — AS MESMAS ACÇÕES, NO SÍTIO ONDE SE CARREGOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido do `docs/APPLE-TEMAS.md`, ponto 8: «Não há menu de contexto. Numa
 * coleção, o botão direito é obrigatório.» E o ponto 9 fecha o contrato: o
 * «⋯» do cartão «abre o MESMO menu do botão direito».
 *
 * ── PORQUE É QUE ISTO NÃO É UM SEGUNDO MENU ────────────────────────────────
 *
 * Porque a lista de acções é a mesma peça de dados — `AccaoDeItem`, do
 * `ui/MenuDeAccoes.tsx` — e quem a escreve escreve-a uma vez. Este ficheiro
 * não inventa acções nenhumas: recebe a lista que o «⋯» já recebe e desenha-a
 * ancorada ao ponteiro em vez de ancorada a um botão. É a única diferença
 * entre os dois, e é a razão de existirem dois.
 *
 * O MATERIAL é o mesmo, à letra: `.bo-material` com o desfoque, a folga da
 * moldura, a sombra do que flutua e a pastilha cheia por baixo do rato. Duas
 * famílias de material no mesmo ecrã é o defeito que a Parte −1 do
 * `docs/DESIGN-SYSTEM.md` manda evitar acima de tudo — aqui há uma só, e este
 * componente é um consumidor dela.
 *
 * ── E NÃO MOSTRA ATALHOS DE TECLADO ────────────────────────────────────────
 *
 * «Nunca mostrar atalhos de teclado num menu de contexto.» [APPLE] O item diz
 * o que faz, e mais nada.
 */

/** Onde o menu foi pedido, em coordenadas da JANELA (o painel é `fixed`). */
export interface PedidoDeMenu {
  x: number;
  y: number;
  /** Quem pediu este menu, quando isso importa a alguém de fora.
   *
   *  Serve o `aria-expanded` de um botão que o abre: o «⋯» da barra de topo
   *  precisa de saber se o menu aberto é o DELE, e o `sobre` não chega para
   *  isso — o menu do vazio da grelha fala da mesma biblioteca e teria o
   *  mesmo nome. */
  de?: string;
  /** O que este menu governa, para o rótulo acessível. */
  sobre: string;
  accoes: readonly AccaoDeItem[];
}

/**
 * Quanto é que o painel se afasta da borda da janela quando não cabe.
 *
 * Oito, e não zero: colado ao pixel da borda o menu lê-se como estando cortado,
 * e num telemóvel de 375 px é onde ele vai parar quase sempre — o dedo carrega
 * perto do bordo do cartão, e o cartão vai de bordo a bordo.
 */
const MARGEM = 8;

export function MenuDeContexto({
  pedido,
  onFechar,
}: {
  pedido: PedidoDeMenu | null;
  onFechar: () => void;
}) {
  const painelRef = useRef<HTMLDivElement>(null);

  /**
   * ── E O MENU SAI, COMO O DO «⋯» ───────────────────────────────────────────
   *
   * Fechava a seco: o `pedido` passava a `null` e o painel desaparecia entre
   * dois fotogramas. Passa a ter a saída da casa (`.bo-saida`, 200 ms, e
   * nenhuma para quem pediu menos movimento — vem do `useSaidaDeUmSo`).
   *
   * O que se desenha a sair é o ÚLTIMO pedido, guardado em estado e ajustado
   * DURANTE o desenho (o padrão do React para reagir a uma prop — o mesmo do
   * `useNoEcraAteSair` dos Temas): quando a saída começa o `pedido` já é
   * `null`, e sem isto não havia nada para desenhar.
   */
  const aSair = useSaidaDeUmSo(!!pedido);
  const [ultimo, setUltimo] = useState<PedidoDeMenu | null>(pedido);
  if (pedido && pedido !== ultimo) setUltimo(pedido);
  const desenhado = pedido ?? (aSair ? ultimo : null);

  /**
   * ── O FOCO VOLTA A QUEM ABRIU ─────────────────────────────────────────────
   *
   * A mesma regra do «⋯»: o foco entra no menu ao abrir, e sem o devolver ele
   * caía no `<body>` ao fechar — o Tab seguinte recomeçava no princípio da
   * página, longe do cartão onde se estava. Guarda-se quem tinha o foco no
   * instante em que o menu foi pedido (o cartão do Shift+F10, a célula do
   * botão direito) e devolve-se-lhe no Escape e ao escolher um item.
   *
   * O clique FORA não devolve: aí o foco vai para onde se carregou. Rolar ou
   * mudar o tamanho da janela só devolve se o foco estava DENTRO do menu — e
   * sem rolar a página até à origem, que era desfazer a rolagem que fechou o
   * menu.
   */
  const origem = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!pedido) return;
    const activo = document.activeElement as HTMLElement | null;
    // Um segundo pedido com o menu aberto não troca a origem pelo próprio menu.
    if (!activo || activo === document.body || painelRef.current?.contains(activo)) return;
    origem.current = activo;
  }, [pedido]);
  const devolverFoco = (semRolar = false) => {
    const o = origem.current;
    origem.current = null;
    if (o?.isConnected) o.focus(semRolar ? { preventScroll: true } : undefined);
  };

  /**
   * ── A POSIÇÃO CORRIGE-SE ANTES DE O ECRÃ PINTAR ───────────────────────────
   *
   * O painel nasce no ponteiro (é o `style` do JSX) e aqui mede-se para o
   * encostar para dentro quando não cabe — a 375 px de largura é o caso
   * normal, porque o cartão vai de bordo a bordo e o dedo carrega perto da
   * borda.
   *
   * `useLayoutEffect` e não `useEffect`: a correcção acontece no MESMO
   * fotograma, senão via-se o menu a saltar. E escreve-se no `style` do nó em
   * vez de passar por estado — o que se está a fazer é posicionar um elemento
   * medido, que é trabalho de DOM e não um segundo desenho do React.
   */
  useLayoutEffect(() => {
    const el = painelRef.current;
    if (!pedido || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const maxX = Math.max(MARGEM, window.innerWidth - width - MARGEM);
    const maxY = Math.max(MARGEM, window.innerHeight - height - MARGEM);
    const x = Math.min(Math.max(MARGEM, pedido.x), maxX);
    const y = Math.min(Math.max(MARGEM, pedido.y), maxY);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    // ── E CRESCE A PARTIR DO PONTEIRO ─────────────────────────────────────
    // «`transform-origin` no canto de origem» (Parte 9.7). A origem é o
    // sítio onde se carregou, medido a partir do canto do painel DEPOIS de
    // encostado — se o menu teve de fugir da borda, cresce na direcção do
    // ponteiro e não de um canto que ficou longe dele.
    el.style.transformOrigin = `${pedido.x - x}px ${pedido.y - y}px`;
  }, [pedido]);

  /**
   * ── AS SAÍDAS ─────────────────────────────────────────────────────────────
   *
   * `Escape`, carregar fora, e QUALQUER rolagem ou mudança de tamanho da
   * janela. As duas últimas são o que distingue um menu ancorado ao ponteiro
   * de um ancorado a um botão: o botão anda com a página, o ponteiro não —
   * sem isto, rolar a grelha deixava o menu parado no ar sobre outro tema.
   *
   * `pointerdown` e não `click`, como no menu do «⋯»: com `click` o menu só
   * fechava depois de a acção de baixo já ter disparado. E o toque que fecha
   * SÓ fecha — o `click` que vem a seguir é engolido (`fecharSoAoTocarFora`):
   * um toque noutro dia, com o menu aberto, abria «Novo no calendário»
   * (revisão de 14/11).
   */
  useEffect(() => {
    if (!pedido) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Parar aqui: com selecção activa, o `Escape` da grelha limpa-a — e
        // fechar um menu não é limpar uma selecção.
        e.stopPropagation();
        devolverFoco();
        onFechar();
      }
    };
    const mexeu = () => {
      const dentro = !!painelRef.current?.contains(document.activeElement);
      if (dentro) devolverFoco(true);
      else origem.current = null;
      onFechar();
    };
    // Carregar fora: o foco vai para onde se carregou, e a origem esquece-se.
    const largarFora = fecharSoAoTocarFora(
      (alvo) => !painelRef.current || painelRef.current.contains(alvo),
      () => {
        origem.current = null;
        onFechar();
      },
    );
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("scroll", mexeu, true);
    window.addEventListener("resize", mexeu);
    return () => {
      largarFora();
      document.removeEventListener("keydown", tecla, true);
      window.removeEventListener("scroll", mexeu, true);
      window.removeEventListener("resize", mexeu);
    };
  }, [pedido, onFechar]);

  // O foco entra no menu quando ele abre: um menu de contexto que não se
  // percorre com o teclado é um menu que metade das acções não tem.
  useEffect(() => {
    if (!pedido) return;
    painelRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, [pedido]);

  if (!desenhado) return null;

  const itens = desenhado.accoes;

  return (
    <div
      ref={painelRef}
      /* A SAIR, ISTO JÁ NÃO É UM MENU — a mesma regra do «⋯»: sem `role`, sem
         nome, fora do fio do teclado. O `pointer-events` vem dentro da
         `.bo-saida`. */
      role={aSair ? undefined : "menu"}
      aria-label={aSair ? undefined : `Acções de ${desenhado.sobre}`}
      aria-hidden={aSair || undefined}
      inert={aSair}
      onKeyDown={teclasDoMenu}
      // O sítio onde se carregou. O `useLayoutEffect` acima encosta-o para
      // dentro se não couber, antes de isto chegar ao ecrã.
      style={{ left: desenhado.x, top: desenhado.y }}
      className={
        "bo-material bo-material-desfoque fixed z-50 min-w-48 overflow-hidden " +
        "p-[var(--bo-material-folga)] shadow-[var(--bo-sombra-suspensa)] " +
        (aSair ? SAIDA : "bo-entrada bo-entrada-menu")
      }
    >
      {itens.map((a, i) => {
        // A mesma regra do menu do «⋯»: um filete antes da primeira acção
        // destrutiva, que fica no FIM da lista — é o que impede o toque
        // distraído em «Eliminar» quando se queria o item de cima —, e um no
        // começo de cada grupo que a lista declare (`separadorAntes`).
        const filete = separadorAntesDe(itens, i);
        return (
          <Fragment key={a.id}>
            {filete && <SeparadorDoMenu semantico={filete === "semantico"} />}
            <button
              type="button"
              role="menuitem"
              disabled={a.desativada}
              onClick={() => {
                // Devolver o foco ANTES da acção, como no «⋯»: se ela abrir
                // um diálogo, é a origem que a armadilha de foco memoriza
                // para devolver no fim.
                devolverFoco();
                onFechar();
                a.onAccao();
              }}
              className={
                `alvo-toque flex w-full items-center justify-start gap-2.5 rounded-[var(--bo-material-raio-pastilha)] ` +
                // Um rótulo de menu não se parte, e não se centra no dedo —
                // ver o do «⋯».
                `whitespace-nowrap px-2.5 py-2.5 text-left text-sm disabled:opacity-30 ${ESTADO} ${PRESSAO} ` +
                (a.destrutiva
                  ? "text-[var(--bo-perigo)] hover:bg-[var(--bo-perigo)] hover:text-white active:bg-[var(--bo-perigo)] active:text-white"
                  : "text-[var(--bo-tinta-72)] hover:bg-[var(--bo-accent)] hover:text-white active:bg-[var(--bo-accent)] active:text-white")
              }
            >
              {/* A coluna dos ícones tem largura mesmo quando o item não traz
                  nenhum — senão um menu misto fica com os rótulos em duas
                  colunas. Mesma regra, mesmo token que o menu do «⋯». */}
              <span
                aria-hidden="true"
                className="flex w-[var(--bo-material-coluna)] shrink-0 items-center justify-center"
              >
                {a.icone}
              </span>
              {a.rotulo}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
