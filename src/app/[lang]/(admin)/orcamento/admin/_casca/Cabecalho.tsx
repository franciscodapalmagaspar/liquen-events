"use client";

import { type Dispatch, type RefObject, type SetStateAction } from "react";
import SafeImage from "@/components/SafeImage";
import { type Quote } from "@/lib/orcamento/types";
import { type View } from "../nav";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { VIEW_SUB, VIEW_TITLES, VIEW_TITLES_CURTOS } from "./titulos-das-vistas";
import { AccoesDoCabecalho } from "./AccoesDoCabecalho";

/**
 * O CABEÇALHO DO BACK OFFICE — o título da vista, a marca ao centro e as
 * acções da barra de topo (ajuda, «Guardar tudo», procurar, «Novo»).
 *
 * Saiu tal e qual do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`).
 * As razões de cada medida estão escritas junto de cada classe, como estavam.
 */
export interface CabecalhoProps {
  selected: Quote | null;
  view: View;
  setNavOpen: Dispatch<SetStateAction<boolean>>;
  desceu: boolean;
  cabecalhoRef: RefObject<HTMLElement | null>;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setNewQuoteOpen: Dispatch<SetStateAction<boolean>>;
  setAjudaOpen: Dispatch<SetStateAction<boolean>>;
  mostrarAccoesDePedidos: boolean;
  pedirNovaTarefa: () => void;
}

export function Cabecalho({
  selected,
  view,
  setNavOpen,
  desceu,
  cabecalhoRef,
  setPaletteOpen,
  setNewQuoteOpen,
  setAjudaOpen,
  mostrarAccoesDePedidos,
  pedirNovaTarefa,
}: CabecalhoProps) {
  return (
    <>
      {/* Top bar */}
      {/* A ESCADA DE PLANOS do back office, escrita uma vez para não voltar
          a colidir:
            10  detalhes dentro de um cartão (cabeçalhos de painel)
            20  barras `sticky` DENTRO do conteúdo (a do total do estúdio)
            30  o cabeçalho da vista e a barra de navegação de baixo
            40  a gaveta de navegação e o seu fundo escuro
            50+ diálogos e o Toast

          Este cabeçalho estava a `z-20` — o MESMO plano da barra do total
          do estúdio. Com o mesmo `z-index` quem manda é a ordem no DOM, e a
          barra do estúdio vem depois: passava por cima do cabeçalho. Com o
          fundo a 95% via-se o texto de uma a atravessar a outra, e era isso
          que fazia "Escolhe o cliente e escreve a proposta" aparecer por
          cima do título.

          O fundo passa a OPACO pela mesma razão: 5% de transparência num
          ecrã com texto escuro por baixo chega para o tornar ilegível, e
          aqui não há nada a ganhar com o efeito. */}
      {/* O CABEÇALHO ENCOLHE ASSIM QUE ELA COMEÇA A DESCER.
          Media 102 px num ecrã de 667. Com os 56 da barra de baixo, eram
          158 px de moldura — quase um quarto do telemóvel — ocupados para
          sempre por uma coisa que só se lê uma vez: o nome da vista.
          A partir daqui fica a faixa com os botões, que é o que serve para
          alguma coisa a meio de uma lista. No computador não encolhe nada:
          lá o espaço não é o problema. */}
      {/* ── O FIO DO CABEÇALHO SÓ APARECE QUANDO HÁ COISA POR CIMA ──────
          Da análise do site que ela mandou: lá o cabeçalho começa sem
          moldura e ganha-a ao rolar. A razão é boa e aqui é ainda melhor,
          porque o chão do painel passou a branco: no topo, um cabeçalho
          branco com um risco por baixo desenha uma linha a separar o nada.
          O fio passa a dizer uma coisa — «há conteúdo escondido acima» — em
          vez de estar sempre lá.

          O `border-b` FICA sempre; o que muda é a cor. Ligar e desligar a
          moldura mudava a altura do cabeçalho em 1 px a cada rolagem, e um
          salto de um pixel numa lista é pior do que um risco a mais.

          O gatilho é o `desceu` que já existe para o cabeçalho encolher —
          com a histerese dele (desce aos 24, volta aos 8), que evita o
          tremor de quem pára o dedo em cima do limiar. Nenhum ouvinte
          novo. */}
      <header
        ref={cabecalhoRef}
        /* O «Fazer proposta» no telemóvel esconde-o ao descer — ver
           `ui/barras-que-encolhem.ts` e o bloco no `admin.css`. */
        data-barra-do-topo=""
        /* ── E O CABEÇALHO DIZ A SUA ALTURA A QUEM COLA POR BAIXO DELE ──
           Ele é `sticky top-0` com 81 px. Um `<h2 sticky top-0>` dentro de
           uma lista pede o MESMO zero — e a lista é a que perde: o
           cabeçalho de grupo desliza para debaixo desta barra e some, com o
           primeiro item da secção tapado por ela.

           A casa já apanhou este defeito uma vez, no carregamento de
           material, e a lição está escrita lá por extenso: «um número
           escrito à mão que descreve a altura de outra coisa fica errado no
           dia em que essa outra coisa muda, e não se queixa». Custou dois
           passeios de telemóvel e cento e vinte segundos a tentar tocar num
           botão tapado.

           Por isso não se escreve 81 em lado nenhum: o cabeçalho MEDE-SE e
           publica `--bo-cabecalho`, e quem cola por baixo pede essa
           variável. Muda a barra, muda o encosto, sem ninguém ir procurar. */
        /* O FIO DO CABEÇALHO: 150 ms, e ainda não é o degrau da casa.
           Devia ser o `ESTADO` (120 ms) como o resto. Não é, porque o
           `fio-do-cabecalho.test.ts` prende aqui a classe
           `motion-safe:transition-colors` letra por letra, e mudá-la é
           mexer nesse teste. Os 150 são o valor de omissão do Tailwind
           escrito à mão — dívida assumida, não descuido.

           O que MUDOU foi a guarda da duração. O `duration-150` estava sem
           `motion-safe:`, e isso não era cosmético: o Tailwind compila a
           duração no topo, fora da media query, enquanto o
           `motion-safe:transition-colors` fica lá dentro. Com
           `prefers-reduced-motion: reduce`, o `transition-property` caía no
           valor inicial — `all` — e ficava `all 150ms ease`. Ou seja, quem
           pedia MENOS movimento recebia MAIS, e com a curva errada. Medido
           num Chromium, não deduzido. */
        className={`bo-material-faixa bo-material-desfoque sticky top-0 z-30 border-b pt-safe relative motion-safe:transition-colors motion-safe:duration-150 ${
          desceu ? "border-[var(--bo-hairline)]" : "border-transparent"
        }`}
      >
        {/*
          ── A MARCA, AO MEIO DA BARRA ─────────────────────────────────

          Pedido dela, a olhar para o vazio entre o título e os botões:
          «quero o logo da liquen aqui ao meio».

          ── PORQUE É QUE ISTO É ABSOLUTO E NÃO UM TERCEIRO BLOCO ──────

          Porque «ao meio» tem de ser ao meio da BARRA, e não a meio do que
          sobra entre os dois lados. Num `flex`, um terceiro filho fica
          centrado no espaço restante — e esse espaço muda de tamanho a cada
          vista: «Visão Geral» e «Propostas Aceites» não medem o mesmo, e o
          bloco da direita cresce quando aparece o «Novo pedido». A marca
          andava de um lado para o outro ao mudar de separador, que é
          exactamente o tipo de movimento que ninguém pede e toda a gente vê.

          Absoluta e centrada na barra, fica no mesmo sítio sempre.

          ── E PORQUE É QUE NÃO SE PODE CLICAR ─────────────────────────

          `pointer-events-none` porque esta camada atravessa a barra de um
          lado ao outro: sem ele, tapava o «Pesquisar» e o «Novo» com um
          rectângulo invisível. É decoração — a marca diz de quem é o
          painel, não leva a lado nenhum —, portanto vai `aria-hidden` e não
          entra na ordem de tabulação nem é lida em voz alta. Quem quer ir à
          Visão Geral tem o destino na barra de baixo.

          ── E SÓ NO COMPUTADOR ────────────────────────────────────────

          Abaixo de `lg` não há vazio nenhum ao meio: o título e os quatro
          botões ocupam a barra toda, e a marca ficaria por cima deles.
        */}
        <div
          aria-hidden
          /*
            ── ONDE A MARCA FICA, E AS DUAS VOLTAS QUE ISTO DEU ────────

            1. Estava ao meio da BARRA. Ela disse «coloca mais para o lado
               esquerdo o logo».
            2. Movi-a para o meio do VAZIO entre o título e os comandos —
               129 px à esquerda, a 1440. **Fui longe demais.** Ela mandou
               uma captura com um círculo vermelho à direita da marca:
               «eu quero o logo onde marquei».

            MEDIDO nessa captura (2020 px de barra):

                o título acaba ......... 355
                os comandos começam .... 1370
                o meio do vazio ........ 862
                a marca estava em ...... 820
                **o círculo dela** ..... 965  →  47,8 % da largura

            Ou seja: ela quer a marca POUCO à esquerda do meio da barra, e
            não no meio do espaço livre. As duas coisas que ela disse não
            se contradizem — «mais para a esquerda» era um empurrão, e eu
            li-o como uma mudança de âncora.

            Com `justify-center`, uma margem à direita de `m` põe o centro
            em `(1 − m)/2` da largura. Para 47,8 % → m = 4,5 %. A 1440 isso
            é o meio nos 688, 32 px à esquerda do meio da barra.

            Percentagem e não píxeis, para o ecrã de 1024 e o de 1920
            fazerem a mesma conta.
          */
          className="pointer-events-none absolute inset-0 hidden items-center justify-center pe-[4.5%] lg:flex"
        >
          <SafeImage
            /*
              ── O FICHEIRO É OUTRO, E A RAZÃO ESTÁ MEDIDA ──────────────

              Ela mandou a barra e escreveu «coloca isto maior e mais ao
              meio». Antes de mexer no tamanho fui medir o PNG, pixel a
              pixel, num browser:

                  tela do ficheiro ........ 3747 × 2238
                  desenho lá dentro ....... 2146 × 1084
                  margens vazias .......... 866 à esquerda, 735 à direita,
                                            478 em cima, 676 em baixo

              O desenho ocupa **57% da largura e 48% da altura** do
              ficheiro. O resto é transparência.

              Isso explica as duas queixas de uma vez, e nenhuma delas era
              o número que eu ia mexer:

              · «MAIOR» — o `h-16` aplicava-se à TELA, não ao desenho. A
                marca que ela via tinha 64 × 48% ≈ 31 px de altura, menos de
                metade do que o número dizia. Não era pequena por estar
                mal dimensionada: era pequena por metade da caixa ser vazio.

              · «MAIS AO MEIO» — o desenho não está centrado no seu próprio
                ficheiro. Está 65 px à direita e 99 px acima do centro da
                tela (1,7% e 4,5%). Centrar a TELA na barra, que é o que o
                `justify-center` faz, deixava o desenho ao lado do meio —
                sempre, e sem nada no CSS que o explicasse.

              O `logo-liquen-marca.png` é o mesmo desenho recortado às
              margens (2146 × 1084 → 900 × 455, com a transparência
              intacta). Centrar isto é centrar a marca, e a altura que se
              pede é a altura que se vê.

              O `logo-liquen.png` original fica onde estava — barra pública,
              rodapé, dados estruturados —, porque recortá-lo mudava o sítio
              todo e isso não é o que ela pediu.
            */
            src="/logo-liquen-marca.png"
            alt=""
            width={900}
            height={455}
            /*
              ── A ALTURA, AGORA QUE ELA É A ALTURA DO DESENHO ──────────

              A marca desta casa é EMPILHADA — o símbolo por cima, a palavra
              por baixo —, e num logótipo assim a palavra leva menos de um
              quinto da altura. Por isso a altura é o número que decide se
              «LÍQUEN EVENTS» se lê ou é uma mancha.

              O que estava: `h-16` sobre a tela do ficheiro velho, ou seja
              **31 px de desenho** (a conta está lá em cima). Foi isso que
              ela viu quando escreveu «coloca isto maior», já depois de eu
              ter subido o número duas vezes — e as duas vezes o número
              subiu, e o desenho quase não.

              O que fica: `h-14` sobre o ficheiro recortado, ou seja **56 px
              de desenho**. Quase o dobro, com o número a descer — que é a
              prova de que o problema nunca esteve aqui.

              E é o tecto desta faixa, não um gosto: a barra mede ~84 px
              (com o `lg:py-5`), e 56 deixam 14 px de folga em cima e em
              baixo. Passar disto obriga a BARRA a crescer, e a barra é a
              moldura do painel inteiro — cresceria em todos os ecrãs, todos
              os dias, para a marca ficar maior num sítio.
            */
            className="h-14 w-auto object-contain"
          />
        </div>
        <div
          className={`mx-auto flex w-full max-w-[1600px] items-center gap-3 sm:gap-4 px-4 sm:px-6 lg:px-10 lg:py-5  ${
            desceu ? "py-1.5" : "py-2.5"
          }`}
        >
          {/* O SUPLENTE, e só suplente.
              O abridor da gaveta vive na barra de baixo, ao alcance do
              polegar. Só que essa barra desaparece enquanto uma proposta
              está aberta em detalhe — e uma navegação que às vezes não
              está lá não pode ser a única.
              Por isso este aparece exactamente quando a outra sai, e nunca
              ao mesmo tempo: continua a haver UM abridor de cada vez, que
              é a regra que esta arrumação existe para cumprir. */}
          {selected && (
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Abrir menu"
              className={`-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--bo-text-muted)] hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
              </svg>
            </button>
          )}
          {/* ── O CABEÇALHO ACOMPANHA A TROCA DE VISTA ───────────────
              O corpo da vista entra com a `.view-in` desde sempre, e o
              título e o subtítulo trocavam no sítio, secos. Lia-se como se
              só metade do ecrã tivesse mudado.

              `.bo-entrada` (240 ms, quatro píxeis, `cubic-bezier(0, 0,
              0.2, 1)`): quatro e não oito, porque é a distância que a casa
              reserva a um rótulo — o cromado não sai do sítio, muda o nome
              que ele traz.

              Aqui o `key` PODE remontar, ao contrário dos passos do
              estúdio e dos separadores do painel: isto é texto e mais
              nada, não há estado nenhum para perder. É o que faz a
              animação voltar a correr a cada troca. */}
          <div key={view} className="bo-entrada min-w-0">
            {/* O SUBTÍTULO NÃO VAI PARA O TELEMÓVEL.
                "Pedidos de orçamento recebidos" por cima de "Pedidos" diz,
                com 9 px e um espaçamento de 0.35em, o que o título já diz —
                e custava 25 px de altura fixa. No computador, onde há
                espaço de sobra numa faixa que já existe, continua a dar
                contexto. */}
            {VIEW_SUB[view] && (
              <p className="hidden lg:block text-foreground/35 text-[9px] tracking-[0.35em] uppercase mb-1.5 font-medium">
                {VIEW_SUB[view]}
              </p>
            )}
            {/* `truncate`: o título partia em duas linhas ("Visão / Geral")
                porque no telemóvel sobram-lhe ~110 px entre o menu e os
                quatro botões. Duas linhas de título é o dobro da altura
                para a mesma palavra. Uma linha, e o que não couber corta —
                o nome da vista está sempre também na barra de baixo ou na
                gaveta de onde se veio. */}
            <h1
              className="text-[var(--bo-text)] font-medium leading-none truncate"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "var(--bo-tracking-display)",
                // A meio de uma lista o título é o que menos falta faz —
                // por isso é ele que encolhe primeiro.
                fontSize: desceu ? "clamp(16px, 2.6vw, 30px)" : "clamp(19px, 2.6vw, 30px)",
              }}
            >
              {/* Um só `<h1>`, com o texto a mudar por CSS. Dois `<h1>`
                  irmãos dariam dois títulos de nível 1 na mesma página, e
                  um leitor de ecrã anunciava ambos. */}
              {VIEW_TITLES_CURTOS[view] ? (
                <>
                  <span className="lg:hidden">{VIEW_TITLES_CURTOS[view]}</span>
                  <span className="hidden lg:inline">{VIEW_TITLES[view]}</span>
                </>
              ) : (
                VIEW_TITLES[view]
              )}
            </h1>
          </div>
          <AccoesDoCabecalho
            view={view}
            setPaletteOpen={setPaletteOpen}
            setNewQuoteOpen={setNewQuoteOpen}
            setAjudaOpen={setAjudaOpen}
            mostrarAccoesDePedidos={mostrarAccoesDePedidos}
            pedirNovaTarefa={pedirNovaTarefa}
          />
        </div>
      </header>
    </>
  );
}
