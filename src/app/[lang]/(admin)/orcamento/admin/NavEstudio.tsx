"use client";

import { useEffect, useRef, useState } from "react";
import type { EstadoSeccao, Impedimento } from "@/lib/proposal-progress";
/* A escala de movimento da casa — ver `ui/movimento.ts` para o censo que a
   motivou. `ESTADO` são os 120 ms do degrau `micro` numa lista fechada de
   propriedades (nenhuma delas força *layout*); `PRESSAO` é o toque a 20 ms.
   As duas trazem `motion-safe:` — não há rede global no `globals.css`. */
import { ESTADO, MARCA, PRESSAO } from "./ui/movimento";
import { rolarAteVer } from "@/lib/motion/rolar";
import { useMarcaQueAnda } from "./ui/useMarcaQueAnda";

/**
 * ONDE ESTOU E O QUE FALTA — a coluna lateral do estúdio.
 *
 * ── Porquê ────────────────────────────────────────────────────────────────
 * A proposta tem seis secções e (medido na Fase 0) dois ecrãs e meio de
 * scroll mesmo vazia — cinco e meio quando está feita. A meio disso não há
 * forma de saber quanto falta nem o que já está feito, e é preciso percorrer
 * tudo para descobrir porque é que o botão de enviar não deixa.
 *
 * ── O que a marca de «preenchida» significa ───────────────────────────────
 * Conteúdo, não estrutura. A regra está em `proposal-progress.ts` e é a MESMA
 * que decide se o envio pode acontecer — para o aviso e o botão nunca poderem
 * discordar.
 *
 * ── DUAS FORMAS, UM SÓ COMPONENTE ─────────────────────────────────────────
 * Abaixo de `lg` isto é uma TIRA que se percorre na horizontal, por cima do
 * primeiro campo; a partir de `lg` é a coluna de sempre, ao lado do trabalho.
 * A troca é CSS puro — `overflow-x-auto` de um lado, `lg:flex-col` do outro —
 * e é a mesma receita já demonstrada no `MoodBoardIndice`.
 *
 * Não é uma segunda instância com `lg:hidden`, e a distinção não é de gosto: o
 * comentário de abertura do `useMedida.ts` conta o que acontece quando se
 * desenham os dois — duas árvores montadas, cada uma com o seu estado, as duas
 * a escrever na mesma chave, e ao rodar o telemóvel aparece a que ficou aberta.
 * Este componente tem estado («onde estou», e o observador que o alimenta), por
 * isso é exactamente o sítio onde esse defeito ia nascer. Uma árvore, uma
 * resposta.
 *
 * ── O QUE A TIRA MOSTRA, E O QUE DEIXA DE FORA ────────────────────────────
 * Um chip de ~150 px não é uma linha de 192 px com três andares. Fica:
 *   · o NOME da secção — é por ele que se salta;
 *   · a marca de preenchida (o ponto cheio), que é a resposta a «já fiz esta?»;
 *   · a secção onde se está (`aria-current` + fundo), e a tira traz esse chip
 *     para dentro da vista sozinha quando o scroll muda de secção;
 *   · um ponto âmbar quando há traduções em falta — a frase inteira só cabe na
 *     coluna, mas fica no `title` e no nome acessível, que é onde ela é
 *     precisa. Isto não tinha substituto nenhum a 375 px.
 * Sai o RESUMO («Ana e Rui», «2 grupos»): é contexto, não navegação, e duplica
 * a largura do chip.
 *
 * ── E PORQUE É QUE A LISTA DO QUE FALTA NÃO DESCE ABAIXO DE `lg` ──────────
 * Porque já tem quem a diga onde a pergunta se faz: o `PorqueNaoDaParaEnviar`
 * põe as faltas que TRAVAM ao lado do botão de enviar, e cada linha salta para
 * o campo. Repeti-la aqui era gastar altura permanente no ecrã mais apertado
 * para dizer duas vezes a mesma coisa — e a segunda vez, longe do botão.
 *
 * ── E PORQUE É QUE A TIRA NÃO É `sticky` ──────────────────────────────────
 * Porque a 375×667 o estúdio já paga o cabeçalho do back office, a navegação
 * de baixo e a barra de envio — três bandas presas. Uma quarta, de 48 px,
 * saía do que resta para escrever. A tira rola com a página, como a do
 * `MoodBoardIndice`: custa altura UMA vez, no topo do passo, e não a cada ecrã.
 */

interface Props {
  seccoes: EstadoSeccao[];
  faltas: Impedimento[];
  /**
   * Onde é que ela está a trabalhar, dito para fora.
   *
   * Esta coluna já sabe qual é a secção à vista — é para isso que o observador
   * existe — e o estúdio precisa da mesma resposta para poder dizer QUE SECÇÃO
   * custou o tempo que mede (ver `tempo-activo-servidor.ts`). Um segundo
   * observador lá em cima seria a mesma pergunta feita duas vezes, com duas
   * respostas a poderem discordar.
   *
   * Opcional: quem só quer a coluna não passa nada e nada muda.
   */
  onSeccaoActual?: (id: string | null) => void;
  /**
   * Quantas traduções faltam em cada secção — a chave é o `id` da secção.
   *
   * Opcional, e ausente é o caso normal: numa proposta portuguesa não há nada
   * por traduzir, e uma linha a dizer «0 traduções em falta» debaixo de cada
   * secção seria uma fila de zeros no índice de toda a gente. Quem passa isto é
   * o estúdio, e só com a proposta a sair em inglês.
   */
  porTraduzir?: Record<string, number>;
  /**
   * Saltar para uma secção que pode estar noutro passo (A2).
   *
   * Com cinco passos, metade das secções deste índice está escondida no passo
   * em que ela está — um salto para uma secção escondida não ia a lado
   * nenhum. Quem passa isto (o estúdio) muda primeiro de passo e depois leva a
   * vista lá; sem ele, o salto é o de sempre.
   */
  onIr?: (seccao: string) => void;
}

/** «1 tradução em falta» / «3 traduções em falta» — escrito uma vez só. */
function fraseDasTraducoes(n: number): string {
  return n === 1 ? "1 tradução em falta" : `${n} traduções em falta`;
}

export default function NavEstudio({ seccoes, faltas, onSeccaoActual, porTraduzir, onIr }: Props) {
  const [atual, setAtual] = useState<string | null>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  // ── Onde estou ────────────────────────────────────────────────────────
  // Um observador em vez de ouvir o scroll: dá a resposta sem correr código a
  // cada pixel de roda do rato, que numa página deste tamanho se sente.
  useEffect(() => {
    // Sem `IntersectionObserver` a coluna continua a funcionar — só não marca
    // onde se está. Saltar e ver o que falta, que é para o que ela serve, não
    // depende disto. (No jsdom dos testes não existe, e sem esta guarda o
    // estúdio inteiro deixava de montar.)
    if (typeof IntersectionObserver === "undefined") return;
    const alvos = seccoes
      .map((s) => document.getElementById(`seccao-${s.id}`))
      .filter((el): el is HTMLElement => !!el);
    if (alvos.length === 0) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        // A secção «actual» é a que está mais acima entre as visíveis. Sem
        // esta escolha, duas secções visíveis ao mesmo tempo faziam a marca
        // saltar para trás e para a frente enquanto se rola devagar.
        const visiveis = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visiveis[0]) {
          const id = visiveis[0].target.id.replace("seccao-", "");
          setAtual(id);
          onSeccaoActual?.(id);
        }
      },
      // A margem de topo tira da conta a barra do cabeçalho, para a secção
      // que está por baixo dela não contar como «onde estou».
      { rootMargin: "-80px 0px -55% 0px", threshold: 0 },
    );
    alvos.forEach((el) => observador.observe(el));
    return () => observador.disconnect();
  }, [seccoes, onSeccaoActual]);

  /**
   * ── A MARCA DO DESTINO ACTIVO ANDA, EM VEZ DE PISCAR NOUTRO SÍTIO ────────
   *
   * Este índice fazia o trabalho da barra lateral e trocava de sítio a corte
   * seco: o fundo acendia num chip e apagava-se noutro, ao mesmo tempo, e nada
   * dizia que se veio de uma secção e se foi para outra. Passa a haver o mesmo
   * filete que desliza, com a mesma constante (`MARCA`) — a mesma constante, e
   * não um segundo tempo escrito outra vez.
   *
   * `useMarcaQueAnda` é a medida da barra lateral extraída, com o eixo `x` a
   * mais. Aqui os dois eixos são precisos porque esta lista muda de eixo: abaixo
   * de 40rem é uma TIRA horizontal (os chips lado a lado, o `y` sempre 0), a
   * partir daí uma COLUNA (empilhados, o `x` sempre 0). Um `translate` com os
   * dois números serve as duas formas com um elemento só — nenhuma classe
   * precisa de perguntar em que largura está, o que é a mesma receita de «duas
   * formas, um só componente» que o resto do ficheiro segue.
   */
  const { marca, podeAndar } = useMarcaQueAnda(listaRef, '[aria-current="true"]', atual);

  // ── A tira segue a leitura ─────────────────────────────────────────────
  // Marcar o chip da secção actual não serve de nada se ele estiver fora da
  // tira: a 375 px cabem dois ou três, e à quinta secção a marca vive num sítio
  // que ninguém vê. Isto empurra a tira o mínimo para o trazer à vista.
  //
  // Mexe no `scrollLeft` da própria tira e em mais nada — nunca em
  // `scrollIntoView`, que arrastava a PÁGINA para cima a meio de ela escrever.
  // Na coluna (`lg`) não há o que rolar de lado e a guarda devolve-o logo; no
  // jsdom, onde não há disposição, dá o mesmo e sai sem tocar em nada.
  useEffect(() => {
    const ul = listaRef.current;
    if (!ul || ul.scrollWidth <= ul.clientWidth) return;
    // `data-seccao` e não `ul.children[i]`: o filete que anda vive dentro desta
    // mesma lista (tem de ser, para acompanhar o rolo lateral em vez de ficar
    // parado por cima dele), e a partir do momento em que a lista tem um filho
    // que não é um chip, contar por índice aponta para o vizinho.
    const chip = atual
      ? ul.querySelector<HTMLElement>(`[data-seccao="${CSS.escape(atual)}"]`)
      : null;
    if (!chip) return;
    const dele = chip.getBoundingClientRect();
    const dela = ul.getBoundingClientRect();
    if (dele.left < dela.left) ul.scrollLeft -= dela.left - dele.left;
    else if (dele.right > dela.right) ul.scrollLeft += dele.right - dela.right;
  }, [atual, seccoes]);

  function saltarPara(id: string) {
    if (onIr) {
      onIr(id);
      return;
    }
    const el = document.getElementById(`seccao-${id}`);
    if (!el) return;
    // `rolarAteVer` e não um comportamento suave escrito à mão: o rolo de uma
    // página inteira é, de toda a gramática de movimento da casa, o gesto que
    // pior cai a quem tem enjoo de movimento — e um `behavior` posto em
    // JavaScript passa por cima do `scroll-behavior` que o `globals.css` já
    // desliga para ela. (A varredura que guarda esta regra lê linhas e não
    // distingue comentários, de propósito: prefere um falso positivo num
    // comentário a um falso negativo numa chamada.)
    rolarAteVer(el, { block: "start" });
    // Levar o FOCO e não só a vista: quem navega por teclado ficava com o
    // foco no botão da coluna e o Tab seguinte voltava ao princípio da lista.
    const primeiro = el.querySelector<HTMLElement>("input, textarea, select, button");
    primeiro?.focus({ preventScroll: true });
  }

  const travam = faltas.filter((f) => f.trava);
  const conselhos = faltas.filter((f) => !f.trava);

  return (
    <nav
      aria-label="Secções da proposta"
      /* ── O ÍNDICE EXISTE EM TODAS AS LARGURAS ─────────────────────────
         Era `xl:block` (1280), depois `hidden … lg:block` (1024). Abaixo de
         1024 não existia de todo — e o que faltava a 375 px não era conforto:
         era saber em que secção se está e quais já foram preenchidas, numa
         página com cinco ecrãs e meio de rolo. Abaixo do corte a resposta
         deixou de ser «nada» e passou a ser a tira.

         ── E O CORTE DEIXOU DE SER O DA JANELA ──────────────────────────
         Era `lg:` — 1024 DE JANELA. MEDIDO num Chromium, no painel que abre a
         partir do cartão de um cliente: a janela tinha 1280 e a fila onde este
         índice vive tinha 498 px. Ele montava-se como coluna e levava 192 dos
         498 (38%), deixando 282 para a coluna onde ela escreve.

         Passa a `@min-[40rem]/estudio:` — a mesma pergunta, feita à zona. O
         contentor chama-se `estudio` e é declarado por fora da fila, no
         `ProposalStudio`: um elemento não pode consultar-se a si próprio.

         Sem `hidden`: a mesma árvore, desenhada de duas maneiras. A altura
         que a tira custa está paga em `mb-2` + `pb-1` e mais nada — não é
         `sticky`, pelas razões do cabeçalho do ficheiro.

         TECTO, só em `lg`: aí é `sticky`, e uma lista mais alta do que o ecrã
         ficava com o fim inalcançável, porque a coluna não acompanha o rolo
         da página. Na tira não há altura para limitar. */
      className="mb-2 @min-[40rem]/estudio:sticky @min-[40rem]/estudio:top-[var(--bo-colado-topo)] @min-[40rem]/estudio:mb-0 @min-[40rem]/estudio:max-h-[var(--bo-colado-altura)] @min-[40rem]/estudio:w-48 @min-[40rem]/estudio:shrink-0 @min-[40rem]/estudio:self-start @min-[40rem]/estudio:overflow-y-auto"
    >
      {/* A tira rola de lado; a coluna empilha. Uma classe de cada lado do
          corte, e o mesmo `<ul>` nos dois. */}
      <ul
        ref={listaRef}
        /* `relative` porque é ESTA lista o `offsetParent` do filete: as medidas
           que o `useMarcaQueAnda` devolve são relativas a ela, e na tira é ela
           que rola de lado — um filete pendurado no `<nav>` ficava parado
           enquanto os chips passavam por baixo. */
        className="relative flex gap-1.5 overflow-x-auto pb-1 @min-[40rem]/estudio:flex-col @min-[40rem]/estudio:gap-0.5 @min-[40rem]/estudio:overflow-visible @min-[40rem]/estudio:pb-0"
      >
        {/* O filete que anda. `aria-hidden` porque não diz nada que o
            `aria-current` de cada chip não diga melhor — é desenho, não
            informação. É um `<li>` e não um `<span>` porque o único filho que
            um `<ul>` aceita é um `<li>`; sai da fila do flex por ser
            `absolute`, portanto não ocupa lugar nenhum entre os chips.

            `MARCA` traz `motion-safe:` nas duas classes: quem pediu para não
            animar vê-o mudar de sítio de um fotograma para o outro, que é o
            que ela pediu. */}
        {marca && (
          <li
            aria-hidden="true"
            className={`pointer-events-none absolute left-0 top-0 w-[3px] rounded-full bg-sage-600 ${
              podeAndar ? MARCA : ""
            }`}
            style={{ translate: `${marca.x}px ${marca.y}px`, height: marca.altura }}
          />
        )}
        {seccoes.map((s) => {
          const aqui = atual === s.id;
          const porFazer = porTraduzir?.[s.id] ?? 0;
          const frase = fraseDasTraducoes(porFazer);
          return (
            <li key={s.id} data-seccao={s.id} className="shrink-0 @min-[40rem]/estudio:shrink">
              <button
                type="button"
                onClick={() => saltarPara(s.id)}
                aria-current={aqui ? "true" : undefined}
                /* `alvo-toque` porque na tira isto passa a ser tocado com o
                   dedo: 44×44 sob `(pointer: coarse)`, e no portátil fica
                   exactamente com a altura que sempre teve.

                   O fundo próprio existe só na tira: sem ele, chips separados
                   por 6 px não se leem como coisas distintas. Em `lg` volta a
                   ser transparente — a coluna é a de sempre, ao pixel. */
                className={`alvo-toque flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${ESTADO} ${PRESSAO} ${
                  aqui
                    ? "bg-sage-600/[0.08]"
                    : /* O fundo sob o rato tem de ser UM DEGRAU MAIS FUNDO do que o
                         fundo em repouso, e na tira não era: `bg-…-6` em repouso e
                         `hover:bg-…-6` — o mesmo token. Aproximar o rato de um
                         destino não pintava nada, e o item onde ela ESTÁ ficava a
                         competir com um realce que não existia. A escada de tinta
                         da casa é 3 / 6 / 10; o realce é o degrau seguinte. */
                      "bg-[var(--bo-tinta-6)] hover:bg-[var(--bo-tinta-10)] @min-[40rem]/estudio:bg-transparent @min-[40rem]/estudio:hover:bg-[var(--bo-tinta-6)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    s.preenchida ? "bg-sage-600" : "border border-foreground/25"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-xs ${aqui ? "font-medium text-[var(--bo-text)]" : "text-[var(--bo-text-muted)]"}`}
                  >
                    {s.titulo}
                  </span>
                  {/* O resumo é contexto, e contexto não cabe num chip: na tira
                      dobrava a largura de cada entrada para dizer o que a
                      secção já diz quando se lá chega. Fica na coluna. */}
                  <span className="hidden truncate text-[10px] text-foreground/40 @min-[40rem]/estudio:block">
                    {s.resumo}
                  </span>
                  {/* ── O QUE FALTA TRADUZIR, AQUI ─────────────────────────
                      Linha própria e não colada ao resumo: a coluna tem 192 px
                      e o resumo já é `truncate` — «2 grupos · 2 traduções em
                      falta» sairia «2 grupos · 2 tradu…», que é a metade que
                      não interessa. E cor própria, a mesma do que está por
                      rever: é uma falta, não uma descrição. */}
                  {porFazer > 0 && (
                    <span className="hidden truncate text-[10px] text-[var(--bo-aviso)] @min-[40rem]/estudio:block">
                      {frase}
                    </span>
                  )}
                </span>
                {/* ── A MESMA FALTA, DO TAMANHO QUE CABE NA TIRA ──────────────
                    Um ponto âmbar, porque a frase não entra num chip. Mas o
                    ponto NÃO é `aria-hidden`: leva a frase inteira como nome, e
                    é assim que quem ouve fica a saber o mesmo que quem vê a cor.

                    E é UMA frase, não duas. Uma cópia `sr-only` ao lado da linha
                    escrita fazia a mesma falta ser contada duas vezes a quem
                    ouve, em `lg`. Aqui cada largura tem exactamente um portador:
                    abaixo de `lg` o ponto, a partir de `lg` a linha — o outro
                    está `display:none`, que também o tira da árvore de
                    acessibilidade. É a solução do `MoodBoardIndice`, pela mesma
                    razão: a marca diz QUE falta sem a entrada crescer. */}
                {porFazer > 0 && (
                  <span
                    role="img"
                    aria-label={frase}
                    title={frase}
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bo-aviso-tom)] @min-[40rem]/estudio:hidden"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* O que falta. A cor separa o que TRAVA do que é conselho: laranja é
          aviso, e o verde da marca está reservado à acção principal.

          ── E SÓ A PARTIR DE `lg` ───────────────────────────────────────────
          Não por caber mal — por já existir noutro sítio, melhor colocado: o
          `PorqueNaoDaParaEnviar` põe o que TRAVA encostado ao botão de enviar,
          com o mesmo salto para o campo. Duplicá-la aqui gastava altura
          permanente no ecrã mais apertado da casa para dizer, mais longe do
          botão, o que já está dito ao lado dele. */}
      {faltas.length > 0 && (
        <div className="mt-4 hidden border-t border-[var(--bo-hairline-strong)] pt-3 @min-[40rem]/estudio:block">
          {/*
           * ── «TALVEZ QUEIRA» NÃO QUERIA DIZER NADA ──────────────────────
           *
           * Era o que se lia por cima da lista quando nada travava o envio, e
           * a frase debaixo dela era «Nenhum grupo de serviços». Juntas:
           * «Talvez queira: Nenhum grupo de serviços» — uma sugestão escrita
           * como se fosse um desejo dela, e a dizer o contrário do que ela quer.
           *
           * O rótulo passa a dizer o que a lista É: coisas por fazer que não
           * impedem o envio. E a lista deixou de mentir sobre os grupos — ver
           * `oQueTemODocumento`, em `proposal-progress.ts`.
           */}
          <p className="mb-1.5 text-[10px] tracking-[0.1em] uppercase text-foreground/40">
            {travam.length > 0 ? "Falta para enviar" : "Ainda por fazer"}
          </p>
          <ul className="flex flex-col gap-1">
            {[...travam, ...conselhos].map((f, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => saltarPara(f.seccao)}
                  className={`flex w-full items-start gap-1.5 text-left text-[11px] leading-snug text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
                >
                  <span
                    aria-hidden
                    className={`mt-1 h-1 w-1 shrink-0 rounded-full ${
                      f.trava ? "bg-[var(--bo-aviso-tom)]" : "bg-foreground/25"
                    }`}
                  />
                  <span className="underline-offset-2 hover:underline">{f.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
