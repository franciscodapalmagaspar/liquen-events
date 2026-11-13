"use client";

import { useEffect, useRef, useState } from "react";
import {
  MINIMO_DE_OPCOES,
  escolhaPronta,
  novoIdDeEscolha,
  type Escolha,
  type OpcaoDeEscolha,
} from "@/lib/proposta-escolhas";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESCREVER AS ALTERNATIVAS — O LADO DELA DA FASE 3
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Onde eu tiver dado alternativas ao casal (duas paletas para a cerimónia,
 * dois estilos de corredor), eles escolhem ali.»
 *
 * ── PORQUE É QUE ISTO VIVE DENTRO DOS MOOD BOARDS ─────────────────────────
 *
 * Porque é onde o trabalho está. As alternativas que ela dá são visuais — duas
 * paletas, dois estilos de corredor — e as fotografias que as explicam já
 * estão nas páginas de inspiração desta proposta. Uma secção própria na
 * navegação obrigava a um visto verde ou a um «por preencher» permanente numa
 * coisa que é OPCIONAL: a maior parte das propostas não leva alternativas
 * nenhumas, e um alarme aceso em todas para servir algumas é um alarme que se
 * aprende a ignorar.
 *
 * ── A FOTOGRAFIA VEM DAS QUE JÁ ESTÃO AQUI ────────────────────────────────
 *
 * Não há aqui carregamento de ficheiros. A opção escolhe-se entre as
 * fotografias que JÁ estão nos mood boards desta proposta — que é como o
 * trabalho acontece («esta paleta é aquela foto do board da cerimónia»), e
 * poupa uma segunda escada de carregamento, de marcadores provisórios e de
 * falhas silenciosas para manter.
 *
 * ── O QUE SAI PARA O CASAL, E O QUE FICA POR ACABAR ───────────────────────
 *
 * Uma escolha com uma opção só não sai (ver `escolhaPronta`) — e o ecrã DI-LO,
 * em vez de a deixar num limbo em que ela jura ter escrito a alternativa e o
 * casal jura não a ter visto.
 */

/**
 * ── AS DUAS COISAS QUE APAGAM AQUI, E PORQUE É QUE LEVAM TRATAMENTO DIFERENTE ─
 *
 * A regra da casa é uma só: pergunta-se o que é RARO E CARO, oferece-se anular
 * o que é FREQUENTE E BARATO de refazer. As duas acções deste ecrã caem cada
 * uma de seu lado da linha, e por isso não levam o mesmo.
 *
 *  · APAGAR A ALTERNATIVA leva PERGUNTA. A maior parte das propostas não tem
 *    alternativa nenhuma (é o que diz o cabeçalho, e é por isso que a secção é
 *    opcional): quem apaga uma está a apagar a única coisa deste documento que
 *    faz o casal responder, com o título, a nota, as duas ou mais opções e as
 *    fotografias que as explicam — tudo escolhido à mão de entre os mood
 *    boards. É um gesto de uma vez por proposta, e refazê-lo é voltar a
 *    escolher fotografias uma a uma. A pergunta NOMEIA a alternativa, CONTA as
 *    opções e as que já têm fotografia, e diz o que o casal perde.
 *
 *  · APAGAR A OPÇÃO leva ANULAR. Acrescentar e tirar opções é o gesto normal de
 *    escrever uma alternativa — carrega-se em «+ Opção», escreve-se, tira-se a
 *    que sobrou. Uma pergunta a cada uma seria uma caixa a interromper o acto
 *    de escrever, e uma caixa que se responde vinte vezes é uma caixa que se
 *    despacha sem ler. Faz-se, e fica um «Anular» ao lado durante dez segundos.
 *
 * E nenhuma das duas atrasa o que não é destrutivo: uma alternativa ainda em
 * branco (nem título, nem nota, nem opção escrita, nem fotografia) sai sem
 * pergunta nenhuma. Perguntar por nada é ensinar a responder sem ler.
 */

/** Quantos segundos o «Anular» fica de pé — os mesmos do estúdio. */
const SEGUNDOS_PARA_ANULAR = 10;

/** Uma fotografia já usada nesta proposta, para se poder escolher. */
export interface FotoDisponivel {
  /** O caminho, tal como está gravado no documento. */
  caminho: string;
  /** O endereço assinado para a miniatura, quando já foi resolvido. */
  url?: string;
  /** De que board veio — é assim que ela lhe chama. */
  onde: string;
}

const CAIXA =
  "w-full rounded-md border border-[var(--bo-hairline)] bg-[var(--bo-surface)] px-2.5 py-1.5 text-sm text-[var(--bo-text)] placeholder:text-foreground/30 focus:border-sage-600 focus:outline-none";
const BOTAO_MAGRO =
  "alvo-toque rounded-md border border-[var(--bo-hairline)] px-2.5 py-1.5 text-[11px] " +
  `text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-6)] ${ESTADO} ${PRESSAO}`;

export default function EditorDeEscolhas({
  escolhas,
  fotos,
  bilingue,
  onChange,
}: {
  escolhas: Escolha[] | undefined;
  /** As fotografias já nos mood boards desta proposta. */
  fotos: FotoDisponivel[];
  /** O interruptor «Proposta bilingue» do estúdio: mostra as caixas inglesas. */
  bilingue: boolean;
  onChange: (escolhas: Escolha[]) => void;
}) {
  const lista = escolhas ?? [];
  /** Que opção está com o selector de fotografia aberto (`e.id:o.id`). */
  const [aEscolherFoto, setAEscolherFoto] = useState<string | null>(null);
  /**
   * A alternativa que está à espera de resposta — só o `id`, e não a frase.
   *
   * Pelo `id` e não pelo índice porque a lista pode encolher por baixo da
   * pergunta (o pai é que manda nela), e uma pergunta presa a uma posição
   * apagava a alternativa errada.
   *
   * E só o `id` porque a FRASE se compõe no desenho (`perguntaSobre`): guardada
   * aqui, ficava congelada no instante do clique, e bastava escrever no título
   * por baixo dela para a pergunta passar a falar de uma alternativa que já não
   * existe com aquele nome. Uma pergunta que conta tem de contar o que está lá.
   */
  const [aApagar, setAApagar] = useState<string | null>(null);
  /** A lista tal como estava antes de se apagar uma opção, à espera do «Anular». */
  const [anulavel, setAnulavel] = useState<{
    escolhas: Escolha[];
    frase: string;
    segundos: number;
  } | null>(null);

  // A contagem decrescente do «Anular». Um `setTimeout` por segundo, como no
  // estúdio: um intervalo a correr para sempre por causa de uma oferta que já
  // caducou é trabalho que ninguém pediu.
  useEffect(() => {
    if (!anulavel) return;
    if (anulavel.segundos <= 0) {
      setAnulavel(null);
      return;
    }
    const t = setTimeout(
      () => setAnulavel((a) => (a ? { ...a, segundos: a.segundos - 1 } : null)),
      1000,
    );
    return () => clearTimeout(t);
  }, [anulavel]);

  // ── O FOCO DO TECLADO, DEPOIS DA PERGUNTA (auditoria 6, n.º 22) ──────────
  //
  // A pergunta aparecia sem receber o foco, e ao «Apagar» o cartão inteiro
  // saía do DOM com o botão que o tinha: o foco caía no `<body>`, e quem usa o
  // teclado ou um leitor de ecrã voltava ao início da página. Agora a pergunta
  // recebe o foco no «Cancelar» (o lado que não perde nada); cancelar devolve-o
  // ao «×» de onde veio; e apagar leva-o à alternativa seguinte (ou à
  // anterior, ou ao «+ Alternativa» quando não sobra nenhuma).
  const raiz = useRef<HTMLDivElement>(null);
  const cancelarApagar = useRef<HTMLButtonElement>(null);
  /** Para onde vai o foco quando a lista nova chegar do pai. */
  const focoDepois = useRef<{ alvo: "titulo" | "apagar"; id: string } | "acrescentar" | null>(null);
  useEffect(() => {
    if (aApagar) cancelarApagar.current?.focus();
  }, [aApagar]);
  useEffect(() => {
    const pedido = focoDepois.current;
    if (!pedido || !raiz.current) return;
    // Procura pelo atributo e compara à mão, em vez de montar um seletor com o
    // id lá dentro: nada de escapar o que vem do documento.
    const procurar = (atributo: string, valor?: string) =>
      [...raiz.current!.querySelectorAll<HTMLElement>(`[${atributo}]`)].find(
        (el) => valor === undefined || el.getAttribute(atributo) === valor,
      );
    const el =
      pedido === "acrescentar"
        ? procurar("data-acrescentar-escolha")
        : procurar(
            pedido.alvo === "titulo" ? "data-titulo-da-escolha" : "data-apagar-escolha",
            pedido.id,
          );
    if (!el) return;
    focoDepois.current = null;
    el.focus();
  });

  /** Apaga a alternativa confirmada, e diz para onde vai o foco a seguir. */
  function apagarEscolhaConfirmada(id: string) {
    const i = lista.findIndex((e) => e.id === id);
    const vizinha = lista[i + 1] ?? lista[i - 1];
    focoDepois.current = vizinha ? { alvo: "titulo", id: vizinha.id } : "acrescentar";
    onChange(lista.filter((e) => e.id !== id));
    setAApagar(null);
  }

  const mudarEscolha = (i: number, p: Partial<Escolha>) =>
    onChange(lista.map((e, k) => (k === i ? { ...e, ...p } : e)));

  const mudarOpcao = (i: number, j: number, p: Partial<OpcaoDeEscolha>) =>
    mudarEscolha(i, { opcoes: lista[i].opcoes.map((o, k) => (k === j ? { ...o, ...p } : o)) });

  /** Como se lhe chama numa frase — o que ela escreveu, ou a posição. */
  const nomeDaEscolha = (e: Escolha, i: number) => e.titulo.trim() || `alternativa ${i + 1}`;
  const nomeDaOpcao = (o: OpcaoDeEscolha, j: number) => o.rotulo.trim() || `opção ${j + 1}`;

  /** Há aqui trabalho a perder? Em branco não há, e então não se pergunta. */
  const temTrabalho = (e: Escolha) =>
    e.titulo.trim() !== "" ||
    (e.tituloEn ?? "").trim() !== "" ||
    (e.nota ?? "").trim() !== "" ||
    (e.notaEn ?? "").trim() !== "" ||
    e.opcoes.some((o) => o.rotulo.trim() !== "" || (o.descricao ?? "").trim() !== "" || !!o.imagem);

  /**
   * A pergunta que nomeia e conta o que se perde.
   *
   * Nada de «Tens a certeza?» — isso não acrescenta informação nenhuma e
   * responde-se sem ler. O que aqui está é o nome que ela deu, quantas opções
   * vão com ele, quantas dessas já têm fotografia escolhida à mão, e o que o
   * casal deixa de ver.
   */
  const perguntaSobre = (e: Escolha, i: number) => {
    const comFoto = e.opcoes.filter((o) => !!o.imagem).length;
    const opcoes = `${e.opcoes.length} ${e.opcoes.length === 1 ? "opção" : "opções"}`;
    const fotos = comFoto > 0 ? `, ${comFoto} com fotografia` : "";
    return `Apagar «${nomeDaEscolha(e, i)}»? Leva com ela ${opcoes}${fotos}, e o casal fica sem esta escolha para responder.`;
  };

  /** Apagar a alternativa: levanta a pergunta — ou sai já, se não houver nada. */
  function pedirParaApagarEscolha(i: number) {
    const e = lista[i];
    if (!e) return;
    if (!temTrabalho(e)) {
      // Em branco não é uma perda: sai já, sem atrasar nada.
      onChange(lista.filter((_, k) => k !== i));
      return;
    }
    setAApagar(e.id);
  }

  /**
   * Apagar a opção: faz-se, e fica o «Anular».
   *
   * A fotografia da lista INTEIRA é o que se guarda, e não a opção sozinha:
   * repor uma opção por índice, numa lista que o pai pode ter mexido entretanto,
   * é repô-la no sítio errado. Voltar ao que estava é sempre exacto.
   */
  function apagarOpcao(i: number, j: number) {
    const e = lista[i];
    const o = e?.opcoes[j];
    if (!e || !o) return;
    const ficam = e.opcoes.length - 1;
    setAnulavel({
      escolhas: lista,
      frase: `Opção «${nomeDaOpcao(o, j)}» apagada de «${nomeDaEscolha(e, i)}» — ficam ${ficam}.`,
      segundos: SEGUNDOS_PARA_ANULAR,
    });
    mudarEscolha(i, { opcoes: e.opcoes.filter((_, k) => k !== j) });
  }

  const acrescentarEscolha = () =>
    onChange([
      ...lista,
      {
        id: novoIdDeEscolha(),
        titulo: "",
        // Nasce com DUAS opções vazias, e não com uma: duas é o mínimo para
        // isto ser uma escolha, e deixá-la descobrir isso a meio era pô-la a
        // carregar num botão que não sabia que tinha de carregar.
        opcoes: [
          { id: novoIdDeEscolha(), rotulo: "" },
          { id: novoIdDeEscolha(), rotulo: "" },
        ],
      },
    ]);

  return (
    /*
     * ── ISTO NÃO É UM RODAPÉ ────────────────────────────────────────────
     *
     * Palavras dela: «"À escolha do casal" é a funcionalidade mais interessante
     * do ecrã e está no fim, em cinzento, quase invisível».
     *
     * Estava desenhado como uma nota de pé de secção: um título de onze píxeis
     * em maiúsculas cinzentas, do tamanho e da cor de um rótulo de campo, atrás
     * de uma linha fina. Um leitor que percorra a secção com o polegar passa-lhe
     * ao lado — e o que ali está é a única coisa desta proposta que faz o casal
     * responder.
     *
     * Ganha um cartão seu, com a cor da casa e o nome escrito na serifada do
     * documento. Continua a dizer «opcional», porque é, e continua a viver
     * dentro dos mood boards, pela razão escrita no cabeçalho: é lá que estão
     * as fotografias que explicam as alternativas.
     */
    <div
      ref={raiz}
      className="mt-8 rounded-xl border border-[var(--color-moss)]/25 bg-[color-mix(in_srgb,var(--color-moss)_5%,transparent)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h4
          className="text-[var(--bo-text)] text-[17px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          À escolha do casal <span className="text-foreground/40 text-[12px]">(opcional)</span>
        </h4>
        <button
          type="button"
          className={BOTAO_MAGRO}
          onClick={acrescentarEscolha}
          data-acrescentar-escolha
        >
          + Alternativa
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--bo-text-muted)]">
        Duas paletas para a cerimónia, dois estilos de corredor:{" "}
        <strong className="font-medium text-[var(--bo-tinta-72)]">
          deixa o casal decidir sem ser preciso outra reunião
        </strong>
        . Aparecem na página deles — não no PDF — e a resposta volta para a ficha do evento.
      </p>

      {/* ── O «ANULAR» DE UMA OPÇÃO APAGADA ────────────────────────────────
          Aqui em cima, e não ao lado do botão que a apagou: a linha de onde ela
          saiu deixou de existir, e uma oferta pendurada num sítio que já mudou
          de forma é uma oferta que salta de posição enquanto se procura. Este é
          o mesmo canto para todas as alternativas desta secção.

          SEM `aria-live`, como a barra irmã do estúdio (ver `limpo`, em
          `ProposalStudio.tsx`): a contagem muda de segundo a segundo, e uma
          região viva com um número lá dentro põe o leitor de ecrã a repetir a
          mesma frase dez vezes seguidas. Isso não é anunciar — é tapar o que
          quer que ela estivesse a ouvir a seguir. */}
      {anulavel && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2">
          <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-[var(--bo-tinta-72)]">
            {anulavel.frase} Pode anular durante {anulavel.segundos}s.
          </span>
          <button
            type="button"
            className={`alvo-toque shrink-0 text-[12px] font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
            onClick={() => {
              onChange(anulavel.escolhas);
              setAnulavel(null);
            }}
          >
            Anular
          </button>
        </div>
      )}

      {lista.length === 0 ? null : (
        <ul className="mt-5 flex flex-col gap-5">
          {lista.map((escolha, i) => {
            const pronta = escolhaPronta(escolha);
            return (
              <li
                key={escolha.id}
                className="rounded-lg border border-[var(--bo-hairline)] p-3.5 sm:p-4"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 flex flex-col gap-2">
                    <input
                      className={CAIXA}
                      value={escolha.titulo}
                      placeholder="Paleta da cerimónia"
                      aria-label={`Título da alternativa ${i + 1}`}
                      data-campo={`escolhas:${i}:titulo`}
                      data-titulo-da-escolha={escolha.id}
                      onChange={(ev) => mudarEscolha(i, { titulo: ev.target.value })}
                    />
                    {bilingue && (
                      <input
                        className={`${CAIXA} bg-sage-600/[0.04]`}
                        value={escolha.tituloEn ?? ""}
                        placeholder="Ceremony palette"
                        aria-label={`Título da alternativa ${i + 1} (inglês)`}
                        data-campo={`escolhas:${i}:titulo:en`}
                        onChange={(ev) => mudarEscolha(i, { tituloEn: ev.target.value })}
                      />
                    )}
                    <input
                      className={CAIXA}
                      value={escolha.nota ?? ""}
                      placeholder="Uma linha por baixo do título (opcional)"
                      aria-label={`Nota da alternativa ${i + 1}`}
                      data-campo={`escolhas:${i}:nota`}
                      onChange={(ev) => mudarEscolha(i, { nota: ev.target.value })}
                    />
                    {bilingue && (
                      <input
                        className={`${CAIXA} bg-sage-600/[0.04]`}
                        value={escolha.notaEn ?? ""}
                        placeholder="Note in English (optional)"
                        aria-label={`Nota da alternativa ${i + 1} (inglês)`}
                        data-campo={`escolhas:${i}:nota:en`}
                        onChange={(ev) => mudarEscolha(i, { notaEn: ev.target.value })}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Apagar a alternativa ${i + 1}`}
                    title="Apagar esta alternativa"
                    data-apagar-escolha={escolha.id}
                    // À VISTA no telemóvel — é a regra desta casa desde o «×»
                    // das fotos: um botão que apaga não pode ser invisível e
                    // continuar a apanhar o dedo.
                    className={`alvo-toque shrink-0 rounded-md px-2 py-1.5 text-[13px] text-[var(--bo-text-muted)] hover:bg-[var(--bo-perigo)]/10 hover:text-[var(--bo-perigo)] pointer-coarse:h-8 pointer-coarse:w-8 ${ESTADO} ${PRESSAO}`}
                    onClick={() => pedirParaApagarEscolha(i)}
                  >
                    ×
                  </button>
                </div>

                {/* ── A PERGUNTA, NO SÍTIO ONDE O DEDO CARREGOU ─────────────
                    Dentro do cartão da alternativa e não no topo da secção: com
                    quatro alternativas escritas, uma pergunta que aparecesse lá
                    em cima aparecia fora do ecrã — e um «×» que não faz nada
                    visível carrega-se outra vez.

                    `alertdialog` + `assertive` porque INTERROMPE mesmo: está à
                    espera de resposta, e ficar calada era deixar quem ouve o
                    ecrã convencido de que o botão não fez nada. */}
                {aApagar === escolha.id && (
                  <div
                    role="alertdialog"
                    aria-live="assertive"
                    aria-label="Confirmar apagar a alternativa"
                    className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--bo-aviso-tom)]/45 bg-[var(--bo-aviso-tom)]/[0.08] px-3 py-2.5"
                  >
                    <span className="min-w-[12rem] flex-1 text-[12px] leading-relaxed text-[var(--bo-text)]">
                      {perguntaSobre(escolha, i)}
                    </span>
                    {/* Cancelar é o primeiro e não escreve NADA: nem apaga, nem
                        toca no documento. Fecha a pergunta e mais nada. */}
                    <button
                      ref={cancelarApagar}
                      type="button"
                      className={BOTAO_MAGRO}
                      onClick={() => {
                        focoDepois.current = { alvo: "apagar", id: escolha.id };
                        setAApagar(null);
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={`${BOTAO_MAGRO} border-[var(--bo-perigo)]/35 text-[var(--bo-perigo)] hover:bg-[var(--bo-perigo)]/10`}
                      onClick={() => apagarEscolhaConfirmada(escolha.id)}
                    >
                      Apagar a alternativa
                    </button>
                  </div>
                )}

                <ul className="mt-3 flex flex-col gap-2.5">
                  {escolha.opcoes.map((opcao, j) => {
                    const chave = `${escolha.id}:${opcao.id}`;
                    const foto = fotos.find((f) => f.caminho === opcao.imagem);
                    return (
                      <li key={opcao.id} className="flex items-start gap-2">
                        {/* A miniatura, quando há. É o que faz a lista de
                            opções ser legível de relance no meio de quatro. */}
                        {opcao.imagem && (
                          <span className="mt-0.5 block h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--bo-tinta-6)]">
                            {foto?.url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={foto.url}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            )}
                          </span>
                        )}
                        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                          <input
                            className={CAIXA}
                            value={opcao.rotulo}
                            placeholder={j === 0 ? "Verde-oliva e branco" : "Terracota e creme"}
                            aria-label={`Opção ${j + 1} de ${escolha.titulo || `alternativa ${i + 1}`}`}
                            data-campo={`escolhas:${i}:opcoes:${j}:rotulo`}
                            onChange={(ev) => mudarOpcao(i, j, { rotulo: ev.target.value })}
                          />
                          {bilingue && (
                            <input
                              className={`${CAIXA} bg-sage-600/[0.04]`}
                              value={opcao.rotuloEn ?? ""}
                              placeholder="Olive and white"
                              aria-label={`Opção ${j + 1} (inglês)`}
                              data-campo={`escolhas:${i}:opcoes:${j}:rotulo:en`}
                              onChange={(ev) => mudarOpcao(i, j, { rotuloEn: ev.target.value })}
                            />
                          )}
                          <input
                            className={CAIXA}
                            value={opcao.descricao ?? ""}
                            placeholder="Uma linha a explicar (opcional)"
                            aria-label={`Descrição da opção ${j + 1}`}
                            data-campo={`escolhas:${i}:opcoes:${j}:descricao`}
                            onChange={(ev) => mudarOpcao(i, j, { descricao: ev.target.value })}
                          />
                          {bilingue && (
                            <input
                              className={`${CAIXA} bg-sage-600/[0.04]`}
                              value={opcao.descricaoEn ?? ""}
                              placeholder="One line in English (optional)"
                              aria-label={`Descrição da opção ${j + 1} (inglês)`}
                              data-campo={`escolhas:${i}:opcoes:${j}:descricao:en`}
                              onChange={(ev) => mudarOpcao(i, j, { descricaoEn: ev.target.value })}
                            />
                          )}

                          {/* A fotografia: escolhe-se entre as que já estão
                              nesta proposta. Ver o cabeçalho. */}
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className={BOTAO_MAGRO}
                              onClick={() =>
                                setAEscolherFoto(aEscolherFoto === chave ? null : chave)
                              }
                            >
                              {opcao.imagem ? "Trocar a fotografia" : "Pôr uma fotografia"}
                            </button>
                            {opcao.imagem && (
                              <button
                                type="button"
                                className={BOTAO_MAGRO}
                                onClick={() => mudarOpcao(i, j, { imagem: undefined })}
                              >
                                Tirar
                              </button>
                            )}
                            {escolha.opcoes.length > MINIMO_DE_OPCOES && (
                              <button
                                type="button"
                                className={BOTAO_MAGRO}
                                // Sem pergunta, de propósito: ver o cabeçalho.
                                // Apaga já e deixa o «Anular» lá em cima.
                                onClick={() => apagarOpcao(i, j)}
                              >
                                Apagar a opção
                              </button>
                            )}
                          </div>

                          {aEscolherFoto === chave && (
                            <div className="rounded-md border border-[var(--bo-hairline)] p-2">
                              {fotos.length === 0 ? (
                                <p className="text-[12px] text-foreground/45">
                                  Ainda não há fotografias nos mood boards desta proposta.
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {fotos.map((f, n) => (
                                    <button
                                      key={f.caminho}
                                      type="button"
                                      title={f.onde}
                                      // Numerada: num board com seis fotografias
                                      // «a fotografia de Cerimónia» são seis
                                      // botões com o mesmo nome, e quem ouve o
                                      // ecrã não tem como os distinguir.
                                      aria-label={`Usar a fotografia ${n + 1} de ${f.onde}`}
                                      onClick={() => {
                                        mudarOpcao(i, j, { imagem: f.caminho });
                                        setAEscolherFoto(null);
                                      }}
                                      className={`h-14 w-14 overflow-hidden rounded-md border ${ESTADO} ${PRESSAO} ${
                                        opcao.imagem === f.caminho
                                          ? "border-sage-600"
                                          : "border-[var(--bo-hairline)] hover:border-sage-600/60"
                                      }`}
                                    >
                                      {f.url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={f.url}
                                          alt=""
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <span className="block h-full w-full bg-[var(--bo-tinta-6)]" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className={BOTAO_MAGRO}
                    onClick={() =>
                      mudarEscolha(i, {
                        opcoes: [...escolha.opcoes, { id: novoIdDeEscolha(), rotulo: "" }],
                      })
                    }
                  >
                    + Opção
                  </button>
                  {/* O aviso é sobre o que o CASAL vai ver, e não sobre o que
                      está escrito aqui: é a única pergunta que interessa. */}
                  {!pronta && (
                    <span className="text-[11px] text-[var(--bo-perigo)]">
                      Ainda não aparece ao casal — falta o título ou a segunda opção.
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
