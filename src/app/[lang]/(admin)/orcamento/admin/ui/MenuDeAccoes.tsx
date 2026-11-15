"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as TeclaDoReact,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";
import { fecharSoAoTocarFora } from "./fechar-por-fora";
import { SAIDA, useSaidaDeUmSo } from "./saida";

/**
 * AS ACÇÕES DE UM ITEM — reveladas ao passar o rato no computador, sempre
 * visíveis onde não há rato.
 *
 * ── A regra, numa frase ─────────────────────────────────────────────────────
 * **Num ecrã táctil, "aparece no hover" quer dizer "não existe".** Não é um
 * inconveniente: a função fica invisível e ninguém a descobre. Este componente
 * é o sítio onde essa regra passa a ser aplicada uma vez, em vez de ser
 * relembrada em cada ecrã — e esquecida num.
 *
 * A decisão usa o PONTEIRO, não a largura (ver `adaptativo.ts`): um portátil
 * com ecrã táctil é largo e tem dedo, e um monitor grande ligado a um telemóvel
 * é estreito e tem rato. Esconder por largura acertava nos dois casos comuns e
 * falhava nos dois interessantes.
 *
 * ── E A DECISÃO É EM CSS, NÃO EM JAVASCRIPT ─────────────────────────────────
 * Isto lia `usePodeEsconderNoHover()`, que responde à mesma pergunta — e que
 * continua a ser a ferramenta certa para diferenças ESTRUTURAIS. Aqui era a
 * errada: o hook devolve `false` no servidor (tem de devolver, senão há
 * desencontro de hidratação), portanto o primeiro desenho no computador
 * mostrava as acções todas e o segundo escondia-as. MEDIDO: um piscar em cada
 * linha, em cada carregamento — numa tabela de trinta linhas, trinta.
 *
 * As variantes `com-rato:` / `sem-rato:` (globals.css) fazem o mesmo teste,
 * mas a media query já é verdadeira quando o primeiro píxel é pintado. Zero
 * JavaScript, zero piscar, e o mesmo desenho do lado do servidor.
 */

/** Quanto o painel se afasta da borda da janela — o mesmo 8 do `MenuDeContexto`. */
const MARGEM_DA_JANELA = 8;

/** O glifo do «⋯», o mesmo nos dois tamanhos. */
const RETICENCIAS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);

/**
 * ── ESCONDIDO EM REPOUSO, SÓ COM RATO, E DE VOLTA COM O FOCO NA LINHA ─────
 *
 * Eram três maneiras de reaparecer: o rato sobre o `group` (a linha, o
 * cartão), e o foco de teclado no PRÓPRIO botão. Faltava a do meio: o foco de
 * teclado noutra coisa da mesma linha. No cartão de tema: o Tab pousa
 * primeiro no botão do cartão (que abre o tema) e o «⋯» continuava a zero de
 * opacidade — quem anda de teclado não tinha como saber que havia um menu ali
 * até o Tab seguinte cair num botão que não se via. O `docs/APPLE-TEMAS.md`
 * (Parte 3) di-lo à letra: «`⋯` só aparece no hover OU QUANDO O CARTÃO TEM
 * FOCO DE TECLADO — senão é inacessível por teclado».
 *
 * `group-focus-within` e não `group-has-[:focus-visible]`: um clique de rato
 * num controlo da linha também revela o «⋯», e isso não é defeito — é o mesmo
 * que o rato por cima já fazia. Todos os `group` que hoje embrulham um
 * `MenuDeAccoes` são do tamanho de UMA linha ou de UM cartão (Tarefas,
 * Fornecedores, TabelaOuCartoes, Temas), portanto o foco numa não acende as
 * outras.
 */
const ESCONDIDO_COM_RATO =
  "opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:group-focus-within:opacity-100 com-rato:focus-visible:opacity-100";

export interface AccaoDeItem {
  id: string;
  rotulo: string;
  onAccao: () => void;
  icone?: ReactNode;
  /** Acções que apagam ou são irreversíveis. Ficam a vermelho e SEPARADAS das
   *  outras — no telemóvel, "apagar" ao lado de "duplicar" é um engano à
   *  espera de acontecer. */
  destrutiva?: boolean;
  desativada?: boolean;
  /**
   * Um filete ANTES deste item — o começo de um grupo.
   *
   * «Agrupa com separadores» (Parte 9.7 do `docs/DESIGN-SYSTEM.md`): o menu
   * do tema tem três grupos («Abrir · Adicionar… · Renomear… · Definir
   * capa… | Favorito · Arquivar · Juntar… | Eliminar…»), e o filete que já existia só sabia
   * separar a primeira destrutiva. Este é declarado por quem escreve a lista,
   * porque só ela sabe onde acaba um grupo.
   *
   * Desenha-se com `role="separator"` — é estrutura que o leitor de ecrã
   * anuncia, e não enfeite. Ignorado no primeiro item desenhado (um filete
   * no topo não separa nada). Num item que é também a primeira destrutiva
   * desenha-se UM filete, este. Quem não usa o campo fica com o desenho de
   * sempre, sem `role="separator"` nenhum.
   */
  separadorAntes?: boolean;
}

/**
 * O filete entre dois grupos de um menu — o mesmo traço nos dois menus (o do
 * «⋯» e o do botão direito), com a folga da pastilha para as três fronteiras
 * verticais (moldura, filete, pastilha) lerem como uma coluna só.
 *
 * `semantico` diz se é um separador A SÉRIO (`separadorAntes`) ou o filete
 * antigo antes da primeira destrutiva, que continua decorativo para não mudar
 * o que os outros ecrãs dizem a quem ouve.
 */
export function SeparadorDoMenu({ semantico }: { semantico: boolean }) {
  return (
    <div
      {...(semantico ? { role: "separator" } : { "aria-hidden": "true" })}
      className="mx-2.5 my-1 border-t border-[var(--bo-hairline)]"
    />
  );
}

/**
 * Junta grupos de acções numa lista, com o `separadorAntes` no primeiro item
 * de cada grupo a seguir ao primeiro.
 *
 * Os grupos podem vir vazios ou com itens escondidos («oculta itens
 * indisponíveis», Parte 9.8): o filete vai sempre no primeiro item QUE FICOU,
 * e um grupo vazio não deixa dois filetes seguidos. Escrever o campo à mão em
 * cada item obrigava cada lista a saber qual dos seus itens sobreviveu.
 */
export function emGrupos(...grupos: readonly (readonly AccaoDeItem[])[]): AccaoDeItem[] {
  const lista: AccaoDeItem[] = [];
  for (const grupo of grupos) {
    grupo.forEach((a, i) =>
      lista.push(i === 0 && lista.length > 0 ? { ...a, separadorAntes: true } : a),
    );
  }
  return lista;
}

/** O filete que vai antes do item `i` de uma lista desenhada, se algum. */
export function separadorAntesDe(
  itens: readonly AccaoDeItem[],
  i: number,
): "semantico" | "decorativo" | null {
  if (i === 0) return null;
  const a = itens[i];
  if (a.separadorAntes) return "semantico";
  const primeiraDestrutiva = a.destrutiva && !itens.slice(0, i).some((x) => x.destrutiva);
  return primeiraDestrutiva ? "decorativo" : null;
}

/**
 * ── AS SETAS DENTRO DE UM MENU ─────────────────────────────────────────────
 *
 * ↓ e ↑ andam pelos itens (e dão a volta), Home e End vão às pontas. Os
 * filetes não contam (não são `menuitem`) e os itens desactivados também não.
 * É o teclado que o padrão de menu do APG pede, e é o mesmo nos dois menus.
 *
 * `stopPropagation` de propósito: por cima de um menu há ecrãs com as suas
 * próprias setas (a lista das Tarefas anda de linha em linha com elas). Uma
 * seta dentro do menu é do menu; deixá-la subir punha a lista a saltar por
 * baixo dele.
 */
export function teclasDoMenu(e: TeclaDoReact<HTMLElement>): void {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const itens = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  );
  if (itens.length === 0) return;
  e.preventDefault();
  e.stopPropagation();
  const agora = itens.indexOf(document.activeElement as HTMLButtonElement);
  const proximo =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? itens.length - 1
        : e.key === "ArrowDown"
          ? (agora + 1) % itens.length
          : agora <= 0
            ? itens.length - 1
            : agora - 1;
  itens[proximo].focus();
}

export interface MenuDeAccoesProps {
  accoes: readonly AccaoDeItem[];
  /** O que este menu governa, para o rótulo acessível ("Acções de Terracotta").
   *  Sem isto, dez menus na mesma página chamam-se todos "Acções". */
  sobre: string;
  /** Quantas acções aparecem soltas (em vez de dentro do menu) quando há
   *  espaço. As restantes ficam no "…". */
  soltasNoEcraGrande?: number;
  /**
   * O tamanho do «⋯».
   *
   *  · `normal` — 44 px, o de sempre: a linha de uma tabela, um cartão de
   *    lista. O alvo e o desenho são a mesma caixa.
   *  · `pequeno` — 28 px VISÍVEIS dentro de 40 px de ALVO. É o «⋯» que pousa
   *    em cima de uma fotografia: «botão glass, 28px» e «o `⋯` sobre a imagem
   *    tem 28 px visuais e 40 px de alvo» (`docs/APPLE-TEMAS.md`, Partes 3 e
   *    7). Um círculo de 44 tapava um quarto da largura de um cartão
   *    compacto; o de 28 deixa ver a fotografia, e o alvo não encolhe com
   *    ele. No dedo, o `.alvo-toque` leva o alvo aos 44 da casa e a pastilha
   *    continua nos 28.
   *
   * Só o gatilho muda: as acções soltas (`soltasNoEcraGrande`) são botões
   * de linha e ficam nos 44.
   */
  tamanho?: "normal" | "pequeno";
  /**
   * O material da pastilha visível em `pequeno` — no cartão de tema, o vidro
   * claro. Vai DENTRO do botão, e não à volta dele, para esconder-e-mostrar
   * com o mesmo `opacity` do glifo: um véu escuro parado com um glifo
   * invisível lá dentro era o defeito que a caixa de fora obrigava a evitar
   * à mão. Sem `pequeno` não é usado.
   */
  pastilha?: string;
  /**
   * O «⋯» à vista sempre, também com rato.
   *
   * O esconder-no-hover é para o «⋯» de uma LINHA ou de um CARTÃO, que tem um
   * `group` à volta para o fazer voltar. No cabeçalho de uma pasta não há
   * linha nenhuma: o «⋯» é o sítio das acções do tema, e escondido seria um
   * botão que só aparece a quem já sabe que lá está.
   */
  sempreVisivel?: boolean;
  className?: string;
}

/**
 * ── E O MENU TAMBÉM SAI ─────────────────────────────────────────────────────
 *
 * O menu entrava com a `.bo-entrada` e fechava A SECO: o `{aberto && …}`
 * passava a falso e o painel desaparecia entre dois fotogramas. Meio gesto —
 * e é a metade que se vê mais vezes, porque um menu abre-se uma vez e fecha-se
 * sempre (Escape, clique fora, escolher uma acção: três saídas, todas seco).
 *
 * A palavra já existia (`.bo-saida`, 200 ms, `--ease-in`, quatro píxeis — a
 * distância de um item de menu) e o gancho que segura o nó montado durante os
 * 200 ms também. Aqui só se liga uma à outra, pelo atalho de quem tem UM nó só
 * (`useSaidaDeUmSo`, em `ui/saida.ts` — o contrato está escrito lá).
 */
export function MenuDeAccoes({
  accoes,
  sobre,
  soltasNoEcraGrande = 0,
  tamanho = "normal",
  pastilha,
  sempreVisivel = false,
  className,
}: MenuDeAccoesProps) {
  const pequeno = tamanho === "pequeno";
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const abridorRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  /**
   * ── E SE NÃO COUBER POR BAIXO, ABRE PARA CIMA ────────────────────────────
   *
   * O painel pende do «⋯» (`top-full`). Num cartão da segunda fila de uma
   * grelha a 1440 × 900, o menu do tema (nove itens, ~430 px) passava o fundo
   * da janela e ficava por baixo da barra de navegação — visto na captura da
   * Fase 2. Mede-se ao abrir, antes de pintar, e só se vira quando por baixo
   * não cabe E por cima cabe; escreve-se no nó (é posicionar um elemento
   * medido, como no `MenuDeContexto`) e a origem da entrada vira com ele.
   */
  useLayoutEffect(() => {
    const el = painelRef.current;
    if (!aberto || !el) return;
    // Reaberto a meio da saída é o mesmo nó: mede-se sempre a partir de baixo.
    for (const p of ["top", "bottom", "marginTop", "marginBottom", "transformOrigin"] as const) {
      el.style[p] = "";
    }
    const r = el.getBoundingClientRect();
    const abridor = abridorRef.current?.getBoundingClientRect();
    if (!abridor || r.height === 0) return;
    /**
     * ── E A CAIXA QUE O CORTA ─────────────────────────────────────────────
     *
     * Virar para cima só olhava para a JANELA. Numa tabela (as Propostas, com
     * oito acções por linha) o menu de uma linha perto do fundo virava-se, e a
     * moldura da tabela — que recorta o que lhe sai de dentro — cortava-o por
     * cima: via-se só o «Apagar». O limite é o mais apertado dos dois: a
     * janela, ou a primeira caixa à volta que recorta.
     */
    let corte: DOMRect | null = null;
    for (let a = caixaRef.current?.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(hidden|auto|scroll|clip)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
        corte = a.getBoundingClientRect();
        break;
      }
    }
    const fundo = Math.min(window.innerHeight, corte?.bottom ?? Infinity) - MARGEM_DA_JANELA;
    const topo = Math.max(0, corte?.top ?? 0) + MARGEM_DA_JANELA;
    const naoCabeEmBaixo = r.bottom > fundo;
    const cabeEmCima = abridor.top - r.height - 4 >= topo;
    if (naoCabeEmBaixo && cabeEmCima) {
      el.style.top = "auto";
      el.style.bottom = "100%";
      el.style.marginTop = "0";
      el.style.marginBottom = "0.25rem";
      el.style.transformOrigin = "bottom right";
    }
  }, [aberto]);
  /* O foco NÃO entra sozinho no menu ao abrir, e as setas no próprio «⋯»
     não o abrem: há ecrãs (as Tarefas) em que ↓/↑ num botão de uma linha
     anda de linha em linha, e o Tab a seguir ao «⋯» já cai no primeiro item.
     As setas são de quem já está DENTRO do menu — ver `teclasDoMenu`. */

  // Reabrir a meio da saída traz o menu de volta: o `aberto` é que manda, e
  // não a marca — a regra vem de dentro do gancho.
  const aSairAgora = useSaidaDeUmSo(aberto);

  /**
   * ── O FOCO VOLTA A QUEM ABRIU ─────────────────────────────────────────────
   *
   * As duas saídas do menu apagam o elemento que tem o foco: o item escolhido
   * desaparece com o menu, e o Escape fecha-o por baixo dos pés. Sem devolver
   * o foco ele cai no `<body>` — e o Tab seguinte recomeça no princípio da
   * página. Numa tabela de trinta linhas isso é voltar a percorrê-las todas
   * para chegar à linha onde se estava.
   *
   * O clique FORA não conta: aí o foco vai para onde se carregou, que é
   * exactamente onde a pessoa quis ir.
   */
  const fecharEDevolverFoco = () => {
    setAberto(false);
    abridorRef.current?.focus();
  };

  // Fechar ao clicar fora e ao Escape. `pointerdown` e não `click`: com `click`
  // o menu fechava só depois de a acção de baixo já ter disparado. E o toque
  // que fecha SÓ fecha: o clique que vem a seguir é engolido — clicar noutra
  // tarefa para fechar o menu abria-a (revisão de 14/11; `fechar-por-fora.ts`).
  useEffect(() => {
    if (!aberto) return;
    const largarFora = fecharSoAoTocarFora(
      (alvo) => !caixaRef.current || caixaRef.current.contains(alvo),
      () => setAberto(false),
    );
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        abridorRef.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      largarFora();
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  /* ── A COLUNA SÓ EXISTE SE HOUVER ÍCONES ─────────────────────────────────
     A fila alinhada é o que impede um menu misto de ficar com os rótulos em
     duas colunas. Num menu em que NENHUMA acção tem ícone ela não alinha nada:
     é uma goteira de 26 px à esquerda de tudo. Por isso pergunta-se ao menu, e
     não ao item. */
  const temIcones = accoes.some((a) => a.icone);

  const soltas = accoes.slice(0, soltasNoEcraGrande);
  const noMenu = accoes.slice(soltas.length);

  return (
    <div ref={caixaRef} className={cn("relative flex items-center gap-1", className)}>
      {soltas.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={a.desativada}
          onClick={a.onAccao}
          aria-label={a.rotulo}
          title={a.rotulo}
          className={cn(
            // O `transition-opacity` que aqui estava não tinha `motion-safe:`.
            // O `ESTADO` traz a opacidade na lista, portanto o esconder-no-rato
            // continua a esbater-se — agora nos 120 ms da escala.
            `alvo-toque flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-30 ${ESTADO} ${PRESSAO}`,
            a.destrutiva
              ? "text-[var(--bo-perigo)] active:bg-[var(--bo-perigo)]/[0.12]"
              : "text-[var(--bo-text-muted)] hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-10)]",
            // O coração deste componente: só se esconde onde há mesmo rato.
            // E volta com o foco DENTRO da linha, não só sobre si — ver a nota
            // `ESCONDIDO_COM_RATO`.
            ESCONDIDO_COM_RATO,
          )}
        >
          {a.icone ?? a.rotulo.slice(0, 1)}
        </button>
      ))}

      {noMenu.length > 0 && (
        <>
          <button
            ref={abridorRef}
            type="button"
            aria-label={`Acções de ${sobre}`}
            aria-haspopup="menu"
            aria-expanded={aberto}
            onClick={() => setAberto((v) => !v)}
            className={cn(
              `alvo-toque flex items-center justify-center ${ESTADO} ${PRESSAO}`,
              pequeno
                ? /* O alvo de 40 é transparente e redondo (o anel de foco
                     segue-o); quem se vê é a pastilha lá dentro. Sem a lavagem
                     do `active:` — um quadrado cinzento de 40 px por cima de
                     uma fotografia era um segundo desenho por trás do primeiro.
                     A pressão continua a ser o `PRESSAO`. */
                  "h-10 w-10 rounded-full"
                : "h-11 w-11 rounded-lg text-[var(--bo-text-muted)] hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-10)]",
              // Aberto fica sempre visível: escondê-lo por baixo do seu próprio
              // menu deixava o menu a flutuar sem nada que o segurasse.
              aberto || sempreVisivel ? "opacity-100" : ESCONDIDO_COM_RATO,
            )}
          >
            {pequeno ? (
              <span
                aria-hidden="true"
                className={cn("flex h-7 w-7 items-center justify-center rounded-full", pastilha)}
              >
                {RETICENCIAS}
              </span>
            ) : (
              RETICENCIAS
            )}
          </button>

          {(aberto || aSairAgora) && (
            <div
              ref={painelRef}
              onKeyDown={teclasDoMenu}
              /* A SAIR, ISTO JÁ NÃO É UM MENU. O nó fica montado 200 ms para
                 ter o que animar, mas para quem ouve o ecrã e para quem anda de
                 Tab a escolha acabou no instante do gesto: sem `role`, sem
                 nome, e fora do fio do teclado. O `pointer-events` vem dentro
                 da própria `.bo-saida` (ver `globals.css`), no MESMO commit —
                 nunca num `setTimeout`, que é a janela que ele existe para
                 fechar. */
              role={aSairAgora ? undefined : "menu"}
              aria-label={aSairAgora ? undefined : `Acções de ${sobre}`}
              aria-hidden={aSairAgora || undefined}
              inert={aSairAgora}
              className={cn(
                "absolute right-0 top-full z-30 mt-1 min-w-48 overflow-hidden",
                /* ── O MATERIAL ─────────────────────────────────────────────
                   Era `rounded-xl border … bg-[var(--bo-surface)] py-1`. O
                   `rounded-xl` media 8 px (o bloco dos raios do `globals.css`
                   colapsa a escala do Tailwind para o conteúdo), e o `py-1`
                   dava folga em cima e em baixo mas nenhuma aos lados — que é
                   a razão de o realce de uma linha só poder ser uma faixa.
                   A `.bo-material` traz o raio de 12 px, o fio e a superfície
                   translúcida; o desfoque vem à parte, para se poder baixar
                   num sítio só. */
                "bo-material bo-material-desfoque p-[var(--bo-material-folga)]",
                "shadow-[var(--bo-sombra-suspensa)]",
                /* ── CRESCE A PARTIR DO «⋯» ────────────────────────────────
                   «Menu a abrir: 325 ms, `--ease-quick`, `transform-origin`
                   no botão» (Parte 5 do `docs/APPLE-TEMAS.md`; Parte 9.7 do
                   sistema de design). A `.bo-entrada-menu` só reescreve a
                   duração, a curva e a escala da `.bo-entrada` com os tokens
                   da casa — ver o `globals.css`. O painel pende do canto de
                   cima à direita do «⋯» (`right-0 top-full`), e é desse canto
                   que cresce. */
                "origin-top-right",
                aSairAgora ? SAIDA : "bo-entrada bo-entrada-menu",
              )}
            >
              {noMenu.map((a, i) => {
                // Uma linha a separar antes da primeira destrutiva: é o que
                // impede o toque distraído em "Eliminar" quando se queria
                // "Duplicar", que fica logo por cima. E uma no começo de cada
                // grupo que a lista declare (`separadorAntes`).
                const filete = separadorAntesDe(noMenu, i);
                return (
                  <Fragment key={a.id}>
                    {/* ── O FILETE SAIU DE DENTRO DO ITEM ───────────────────
                        Era um `border-t` na própria linha destrutiva. Com o
                        realce a passar a pastilha isso deixa de funcionar: o
                        filete ficava a fazer parte da caixa que se pinta de
                        vermelho ao passar o rato, e desaparecia debaixo dela.
                        Passa a ser um elemento seu, entre as duas linhas, com
                        a folga da pastilha — para as três fronteiras verticais
                        (moldura, filete, pastilha) lerem como uma coluna só. */}
                    {filete && <SeparadorDoMenu semantico={filete === "semantico"} />}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={a.desativada}
                      onClick={() => {
                        // Devolver o foco ANTES da acção: se ela abrir um
                        // diálogo, é este botão que a armadilha de foco memoriza
                        // para devolver no fim (ver `useFocusTrap`).
                        fecharEDevolverFoco();
                        a.onAccao();
                      }}
                      className={cn(
                        // `whitespace-nowrap`: um rótulo de menu não se parte
                        // («Adicionar fotografias…» partia-se nos 192 px do
                        // `min-w-48`) — é o menu que alarga. `justify-start`:
                        // no dedo, o `.alvo-toque` centra o conteúdo, e os
                        // itens apareciam centrados (visto a 390 na Fase 2).
                        `alvo-toque flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-2.5 py-2.5 text-left text-sm disabled:opacity-30 ${ESTADO} ${PRESSAO}`,
                        "rounded-[var(--bo-material-raio-pastilha)]",
                        /* ── A LINHA SOB O RATO É UMA PASTILHA CHEIA ────────
                           Era uma lavagem de 6% de preto (e de 7% de vermelho).
                           Sobre um material translúcido, seis por cento não
                           chega a ser um estado: lê-se como sujidade do fundo.

                           Preenchimento e texto invertido, que é o gesto das
                           capturas. Medido: branco sobre `--bo-accent` dá
                           6,55:1 e branco sobre o vermelho da casa 7,53:1 — as
                           duas passam AA com folga.

                           O `active:` repete a pastilha de propósito: o `hover:`
                           do Tailwind vive dentro de `@media (hover: hover)` e
                           no dedo não existe. Sem esta segunda metade, tocar
                           num item do telemóvel não pintava nada e só ficava o
                           afundar. */
                        a.destrutiva
                          ? "text-[var(--bo-perigo)] hover:bg-[var(--bo-perigo)] hover:text-white active:bg-[var(--bo-perigo)] active:text-white"
                          : "text-[var(--bo-tinta-72)] hover:bg-[var(--bo-accent)] hover:text-white active:bg-[var(--bo-accent)] active:text-white",
                      )}
                    >
                      {/* A COLUNA DOS ÍCONES, COM LARGURA MESMO QUANDO ESTÁ
                          VAZIA. Sem ela, um menu com três acções com ícone e
                          duas sem ficava com os rótulos em duas colunas — que
                          é o que se vê na captura e que aqui não acontecia por
                          acaso, mas por não haver coluna nenhuma. */}
                      {temIcones && (
                        <span
                          aria-hidden="true"
                          className="flex w-[var(--bo-material-coluna)] shrink-0 items-center justify-center"
                        >
                          {a.icone}
                        </span>
                      )}
                      {a.rotulo}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
