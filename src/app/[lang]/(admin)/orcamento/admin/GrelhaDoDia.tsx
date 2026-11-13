"use client";

import { useEffect, useMemo, useRef } from "react";
import { horaDoMinuto, porExtenso, type AnaliseDoDia } from "@/lib/orcamento/guiao-do-dia";
import {
  colunasPorResponsavel,
  SEM_RESPONSAVEL,
  type ColunaDeResponsavel,
} from "@/lib/orcamento/guioes";
import { horasDaJanela, janelaDoHorario, MINUTOS_POR_HORA } from "@/lib/orcamento/horario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GRELHA DO DIA — AS HORAS A DESCER, UMA COLUNA POR QUEM FAZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O QUE ELA PEDIU, E PORQUE É QUE ISTO NÃO É UMA TERCEIRA RÉGUA ─────────
 *
 * «Uma coluna por pessoa ou equipa, e as horas a descer. Olhas para as 14:00 e
 * vês, lado a lado, o que cada um está a fazer nesse momento. É a pergunta do
 * dia do evento: quem está onde, e quem está livre para a próxima coisa.»
 *
 * As duas réguas que já existem misturam as pessoas na mesma pista, e por
 * construção: a vertical do `EventTimeline` responde a «isto cabe?» e é onde se
 * edita; a deitada do `ReguaDoDia` responde a «este dia está cheio?» e serve
 * para comparar vinte dias. Nenhuma responde a esta pergunta — com a Ana e o
 * Rui no mesmo carril, ler «quem está livre às 14:00» obriga a percorrer o dia
 * inteiro a ler nomes.
 *
 * ── E POR ISSO NÃO INVENTA VOCABULÁRIO NENHUM ────────────────────────────
 *
 * O `ReguaDoDia` já fixou a linguagem visual desta família, e a grelha usa-a à
 * letra — só rodada, porque aqui o tempo desce em vez de andar:
 *
 *   | Coisa                     | Como se desenha aqui                       |
 *   |---------------------------|--------------------------------------------|
 *   | momento com duração       | bloco CHEIO a acento, com a altura do tempo |
 *   | instante (sem duração)    | traço de 3 px + ponto redondo, sem enchimento |
 *   | choque de responsável     | perigo + losango + a palavra «Choque»       |
 *   | duas coisas ao mesmo tempo| carris lado a lado — a coluna reparte-se    |
 *   | «agora»                   | risca, e só no dia do evento                |
 *
 * ── O VAZIO É A ÚNICA COISA QUE NÃO SE DESENHA, E É DE PROPÓSITO ─────────
 *
 * Na fita deitada de 8 px de altura o vazio precisa de uma moldura tracejada
 * porque não há altura nenhuma onde ele se veja. Aqui o vazio É a distância
 * vertical: uma tarde por marcar são cento e oitenta píxeis de coluna branca, à
 * escala, ao lado das colunas de quem está a trabalhar. Desenhar-lhe uma
 * moldura por cima era repetir com tinta o que a geometria já diz.
 *
 * E há uma segunda razão, mais importante: os `vaziosDaRegua` são os vazios do
 * DIA, e o que esta grelha mostra é o tempo livre de cada PESSOA — que não é a
 * mesma coisa. Pintar os vazios do dia por cima das colunas todas dizia que a
 * Ana está livre às 14:00 porque ninguém tem nada marcado, quando a Ana pode
 * estar a montar desde as nove.
 */

/**
 * ── UM MINUTO, UM PÍXEL ────────────────────────────────────────────────────
 *
 * A régua vertical do `EventTimeline` usa 0,7 px por minuto porque tem um chão
 * de 44 px por bloco: ela edita ali com o polegar, e abaixo dos ~63 minutos a
 * proporção quebra-se de qualquer maneira. Aqui não há chão nenhum a defender —
 * a grelha lê-se, não se toca — e a proporção é a coisa toda: é ela que faz a
 * montagem de quatro horas parecer quatro vezes a cerimónia de uma.
 *
 * Um minuto vale um píxel, portanto **uma hora vale 60 px** — o número que faz
 * as linhas de hora caírem numa grelha de 4 e o que dá a um degrau de 15 min
 * (o mais pequeno da lista de durações) quinze píxeis, que ainda se vêem.
 *
 * O custo, medido: um dia de evento típico (09:00 → 02:00, 1020 min) mede
 * 1020 px. Não cabe num telemóvel — e por isso a grelha é uma caixa com rolo
 * próprio que se abre já no sítio certo (ver `useEffect` do «agora»).
 */
const PX_POR_MINUTO = 1;

/**
 * A coluna das horas. 48 px chegam para «02:00» a 11 px com folga dos dois
 * lados, e é o que se pode tirar aos 390 px do telemóvel sem os blocos deixarem
 * de caber. Fica PRESA à esquerda durante o rolo horizontal: era esta a coluna
 * que um rolo lateral fazia desaparecer, e sem ela a grelha deixa de ser uma
 * grelha e passa a ser uma mancha.
 */
const LARGURA_DAS_HORAS = 48;

/**
 * ── A DECISÃO DIFÍCIL: SEIS COLUNAS EM 390 PX ─────────────────────────────
 *
 * Não cabem, e não há truque que as faça caber com palavras lá dentro. As
 * saídas possíveis eram três, e duas são piores do que parecem:
 *
 *  1. **Encolher até caber.** Seis colunas em 342 px (390 menos as horas) dão
 *     57 px cada. A 11 px de letra são 4 caracteres por linha: «Mont…». Isso é
 *     cor sem palavra, que é precisamente a regra que esta casa não quebra.
 *  2. **Uma pessoa de cada vez**, com um selector em cima. Cabe à vontade — e
 *     deita fora a pergunta: ela pediu para ver «lado a lado o que cada um está
 *     a fazer nesse momento», e uma coluna de cada vez é a lista que já existe.
 *  3. **Rolo horizontal com a coluna das horas presa** — a que fica.
 *
 * O chão de 96 px é o que faz a 3 caber sem cair na 1: é a largura a que um
 * bloco ainda escreve «17:00 Cerimónia» em duas linhas legíveis. Abaixo disso a
 * grelha não encolhe mais — passa a rolar, com as horas sempre à vista e com
 * `scroll-snap` a fazer cada arrasto parar numa coluna INTEIRA, nunca a meio de
 * uma. Medido a 390 px: até três colunas não há rolo nenhum; a partir da quarta
 * há, e cada gesto traz a pessoa seguinte para o pé da anterior.
 *
 * É a saída que perde alguma coisa (com sete pessoas não se vê o dia todo de um
 * relance) e não perde a pergunta.
 */
const LARGURA_MINIMA_DA_COLUNA = 96;

/**
 * O chão visual de um bloco com duração: 16 px, uma linha de texto a 10/14.
 *
 * Não é um chão de TOQUE como os 44 px do `EventTimeline` — aqui os blocos
 * estão posicionados em absoluto, e um chão a sério punha-os por cima uns dos
 * outros e transformava a grelha numa mentira sobre o dia. 16 px é o mínimo
 * para caber uma linha escrita, que é a garantia de que nenhum bloco fica a ser
 * só uma cor.
 */
const ALTURA_MINIMA_DO_BLOCO = 16;

/**
 * Um instante não tem altura nenhuma — tem uma HORA. Estes 20 px são a caixa
 * onde o nome dele cabe, e não uma duração: por isso o bloco de um instante não
 * leva enchimento, leva o traço de 3 px na sua hora exacta e o ponto redondo,
 * que é o mesmo desenho que o `ReguaDoDia` lhe dá deitado. Um bloco cheio de
 * 20 px seria dizer que aquilo dura vinte minutos.
 */
const ALTURA_DO_INSTANTE = 20;

/** A partir daqui o bloco tem altura para uma segunda linha (o responsável e o tempo). */
const ALTURA_PARA_A_SEGUNDA_LINHA = 44;

/**
 * A caixa da grelha tem tecto e rolo próprio.
 *
 * Sem tecto, o rolo horizontal obrigava a caixa a ser também um contentor
 * vertical sem nada para rolar, e o cabeçalho com os nomes deixava de colar em
 * cima: a meio de um dia de dezassete horas ninguém sabia de quem era a coluna
 * que estava a ler. Com tecto, colam os dois — os nomes em cima e as horas à
 * esquerda —, que é o comportamento de qualquer vista de dia.
 */
const TECTO_DA_GRELHA = "min(72vh, 780px)";

/** Onde a caixa se abre quando há «agora»: um terço abaixo do topo. */
const FRACAO_DO_AGORA_NO_ECRA = 1 / 3;

export interface GrelhaDoDiaProps {
  dia: AnaliseDoDia;
  /** O minuto do «agora» na régua do dia. `null` fora do dia do evento. */
  agora?: number | null;
  /**
   * Muda quando o evento aberto muda. É o que faz a caixa voltar a abrir no
   * sítio certo em vez de ficar onde o dia anterior a tinha deixado.
   */
  chaveDoEvento?: string;
}

/**
 * A frase inteira de um bloco — o nome acessível, e o que o rato mostra.
 *
 * «Ana Silva · Montagem do arco · 14:00 às 15:30». Nunca um código, nunca
 * «Choque, 1»: quem ouve o ecrã tem de receber a mesma informação que quem o
 * vê, e quem lê o guião ao telefone tem de a poder dizer em voz alta.
 */
function fraseDoBloco(
  coluna: ColunaDeResponsavel,
  bloco: { inicio: number; fim: number; duracao: number; item: { time: string; title: string } },
  emChoque: boolean,
): string {
  const quem = coluna.chave === SEM_RESPONSAVEL ? "Sem responsável" : coluna.nome;
  const quando =
    bloco.duracao > 0
      ? `${bloco.item.time} às ${horaDoMinuto(bloco.fim)}, ${porExtenso(bloco.duracao)}`
      : `${bloco.item.time}, um instante sem duração marcada`;
  const aviso = emChoque ? " — Choque: a mesma pessoa em dois sítios ao mesmo tempo" : "";
  return `${quem} · ${bloco.item.title} · ${quando}${aviso}`;
}

function Losango() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[7px] shrink-0 rotate-45 bg-[var(--bo-perigo)]"
    />
  );
}

export function GrelhaDoDia({ dia, agora = null, chaveDoEvento }: GrelhaDoDiaProps) {
  const janela = useMemo(() => janelaDoHorario(dia), [dia]);
  const colunas = useMemo(() => colunasPorResponsavel(dia.blocos), [dia.blocos]);

  /** Os ids que entram num choque — sai do motor, a grelha não decide isto. */
  const emChoque = useMemo(() => {
    const ids = new Set<string>();
    for (const c of dia.choques) {
      ids.add(c.a.id);
      ids.add(c.b.id);
    }
    return ids;
  }, [dia.choques]);

  /**
   * Os momentos que não têm hora legível não cabem numa grelha de horas, e o
   * `colunasPorResponsavel` deixa-os de fora — como o `emCarris` sempre fez.
   * Ficarem de fora em SILÊNCIO é que não pode: a grelha passaria a mostrar
   * menos momentos do que o guião tem, sem uma palavra, e o número em cima
   * deixava de bater certo com o que se conta no ecrã.
   */
  const semHora = dia.blocos.filter((b) => !b.temHora);

  const rolo = useRef<HTMLDivElement | null>(null);
  const minutoDoAgora =
    agora !== null && janela && agora >= janela.inicio && agora <= janela.fim ? agora : null;

  /**
   * A caixa abre no sítio certo.
   *
   * Ela abre isto de pé, numa quinta, às 14:00, para saber quem está onde. Uma
   * caixa que abre nas 09:00 da montagem obriga-a a rolar seiscentos píxeis
   * antes de ver a resposta — com uma mão. Abre no «agora», a um terço do topo,
   * para se ver também o que já passou.
   *
   * Sem «agora» (que é a esmagadora maioria dos dias) abre no princípio do dia,
   * que é onde a leitura começa. Só ao montar e ao trocar de evento: uma caixa
   * que se reposiciona sozinha a meio de uma leitura é uma caixa que a tira do
   * sítio onde ela estava a olhar.
   */
  useEffect(() => {
    const caixa = rolo.current;
    if (!caixa || !janela) return;
    if (minutoDoAgora === null) {
      caixa.scrollTop = 0;
      return;
    }
    const y = (minutoDoAgora - janela.inicio) * PX_POR_MINUTO;
    caixa.scrollTop = Math.max(0, y - caixa.clientHeight * FRACAO_DO_AGORA_NO_ECRA);
    // O «agora» anda de trinta em trinta segundos e a caixa NÃO o persegue: só
    // ao abrir, e ao trocar de evento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDoEvento, janela?.inicio]);

  if (!janela || colunas.length === 0) {
    return (
      <p className="bo-text-muted rounded-[var(--bo-raio-conteudo)] border border-dashed border-[var(--bo-hairline-strong)] px-4 py-6 text-center text-sm">
        Esta timeline ainda não tem momentos com hora, por isso não há nada para pôr numa grelha de
        horas. Junta um modelo ou escreve o primeiro momento na régua.
      </p>
    );
  }

  const alturaTotal = (janela.fim - janela.inicio) * PX_POR_MINUTO;
  const horas = horasDaJanela(janela);

  /**
   * ── AS FAIXAS DA HORA SÃO O FUNDO DA COLUNA ──────────────────────────────
   *
   * As linhas continuam a ser fundo, e não cem elementos no documento. O que se
   * lhes junta é a ZEBRA: uma hora sim, uma hora não, a 3% de tinta.
   *
   * Ela mandou o horário da faculdade e disse «quero que o timeline seja mesmo
   * assim». O que faz aquela folha ler-se de longe não é a cor dos blocos — é
   * a hora ser uma FAIXA com chão e tecto, e não um risco solto. Com o risco
   * só, contar de que hora a que hora uma coisa vai obriga a seguir a linha
   * com o dedo até à coluna da esquerda; com a faixa, a resposta é a banda em
   * que o bloco assenta.
   *
   * Duas camadas, e a ordem importa: a zebra por baixo (senão come a linha), o
   * risco por cima. O período da zebra é de DUAS horas porque uma banda pintada
   * e a seguinte limpa é o que faz o par.
   */
  const alturaDaHora = MINUTOS_POR_HORA * PX_POR_MINUTO;
  const riscasDeHora = {
    backgroundImage: [
      `repeating-linear-gradient(to bottom, var(--bo-hairline) 0 1px, transparent 1px ${alturaDaHora}px)`,
      `repeating-linear-gradient(to bottom, var(--bo-tinta-3) 0 ${alturaDaHora}px, transparent ${alturaDaHora}px ${alturaDaHora * 2}px)`,
    ].join(", "),
  } as const;

  return (
    <div className="min-w-0">
      <p className="sr-only">
        Grelha do dia por responsável: {colunas.length}{" "}
        {colunas.length === 1 ? "coluna" : "colunas"}, das {horaDoMinuto(janela.inicio)} às{" "}
        {horaDoMinuto(janela.fim)}. Cada coluna é uma pessoa e as horas descem.
      </p>

      {/* ── A CAIXA ROLA, LOGO TEM DE SE PODER ROLAR COM O TECLADO ────────
          Um contentor com rolo e sem um único filho focável é um contentor que
          quem usa teclado não consegue mexer: as setas não lhe chegam porque o
          foco nunca lá entra. Nada aqui dentro é focável de propósito (a grelha
          lê-se, edita-se na régua), portanto o foco tem de parar na CAIXA —
          `tabIndex={0}` mais um nome, e o anel de foco do `globals.css` faz o
          resto. `group` e não `region` porque as regiões desta vista são as
          colunas: uma região a envolver regiões dava um índice com um degrau a
          mais e nenhuma informação nova. */}
      <div
        ref={rolo}
        role="group"
        aria-label="Grelha do dia, por responsável"
        tabIndex={0}
        className="relative overflow-auto rounded-[var(--bo-raio-conteudo)] border border-[var(--bo-hairline)]"
        style={{ maxHeight: TECTO_DA_GRELHA, scrollSnapType: "x proximity" }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${LARGURA_DAS_HORAS}px repeat(${colunas.length}, minmax(${LARGURA_MINIMA_DA_COLUNA}px, 1fr))`,
          }}
        >
          {/* ── O CANTO ──────────────────────────────────────────────────
              Preso aos dois lados: é o único sítio de onde não se sai nem a
              rolar para o lado nem a rolar para baixo. */}
          <div className="sticky start-0 top-0 z-30 border-b border-e border-[var(--bo-hairline)] bg-[var(--bo-surface)]" />

          {/* ── OS NOMES ─────────────────────────────────────────────────
              Presos em cima: a meio de um dia de dezassete horas, uma coluna
              sem nome é uma coluna de ninguém. */}
          {colunas.map((c) => {
            const temChoque = c.blocos.some((b) => emChoque.has(b.bloco.item.id));
            const aDecorrer =
              minutoDoAgora === null
                ? null
                : c.blocos.filter(
                    (b) =>
                      minutoDoAgora >= b.bloco.inicio &&
                      minutoDoAgora < b.bloco.fim + (b.bloco.duracao === 0 ? 1 : 0),
                  );
            return (
              <div
                key={c.chave}
                className="sticky top-0 z-20 border-b border-e border-[var(--bo-hairline)] bg-[var(--bo-surface)] px-2 py-1.5"
                style={{ scrollSnapAlign: "start" }}
              >
                <p
                  className={`truncate text-xs font-semibold ${
                    c.chave === SEM_RESPONSAVEL
                      ? "text-[var(--bo-text-muted)]"
                      : "text-[var(--bo-text)]"
                  }`}
                  title={c.nome}
                >
                  {c.nome}
                </p>
                <p className="bo-text-faint mt-0.5 flex items-center gap-1 truncate text-[10px] tabular-nums">
                  {temChoque && (
                    <span className="flex items-center gap-0.5 font-medium text-[var(--bo-perigo)]">
                      <Losango />
                      Choque
                    </span>
                  )}
                  {/* ── «QUEM ESTÁ LIVRE PARA A PRÓXIMA COISA» ──────────────
                      A segunda metade da pergunta dela, respondida com uma
                      palavra e não com a ausência de blocos — que é a coisa
                      mais fácil de ler ao contrário num ecrã pequeno. Só no
                      dia do evento: fora dele não há «agora» nenhum. */}
                  {aDecorrer !== null &&
                    (aDecorrer.length > 0 ? (
                      <span className="truncate">{aDecorrer[0].bloco.item.title}</span>
                    ) : (
                      <span className="text-[var(--bo-accent)]">Livre</span>
                    ))}
                  {aDecorrer === null && !temChoque && (
                    <span>
                      {c.blocos.length} {c.blocos.length === 1 ? "momento" : "momentos"}
                    </span>
                  )}
                </p>
              </div>
            );
          })}

          {/* ── A COLUNA DAS HORAS ───────────────────────────────────────── */}
          <div
            className="sticky start-0 z-10 border-e border-[var(--bo-hairline)] bg-[var(--bo-surface)]"
            style={{ height: alturaTotal }}
          >
            {/* ── CADA HORA É UMA FAIXA, COM PRINCÍPIO EM CIMA E FIM EM BAIXO
                Copiado à letra do horário que ela mandou, porque é o que lá
                faz o trabalho: «09:00» encostado ao cimo da banda e «10:00»
                encostado ao fundo e à direita. Lidos juntos, os dois números
                dizem o INTERVALO — que é a pergunta — em vez de marcarem um
                instante e deixarem a conta para quem lê.

                A última hora da janela não abre faixa nenhuma: seria uma banda
                de sessenta píxeis por baixo do fim do dia. O seu número é o
                «fim» da faixa anterior, e já lá está. */}
            {horas.slice(0, -1).map((m) => (
              <div
                key={m}
                aria-hidden="true"
                className="absolute start-0 flex w-full flex-col justify-between px-1.5 py-0.5 text-[10px] leading-none tabular-nums text-[var(--bo-text-faint)]"
                style={{ top: (m - janela.inicio) * PX_POR_MINUTO, height: alturaDaHora }}
              >
                <span className="text-start">{horaDoMinuto(m)}</span>
                <span className="text-end">{horaDoMinuto(m + MINUTOS_POR_HORA)}</span>
              </div>
            ))}
            {minutoDoAgora !== null && (
              <span
                className="absolute w-full pe-1.5 text-end text-[10px] font-semibold tabular-nums text-[var(--bo-perigo)]"
                style={{ top: (minutoDoAgora - janela.inicio) * PX_POR_MINUTO - 5 }}
              >
                {horaDoMinuto(minutoDoAgora)}
                <span className="sr-only"> — agora</span>
              </span>
            )}
          </div>

          {/* ── AS COLUNAS DAS PESSOAS ───────────────────────────────────── */}
          {colunas.map((c) => (
            <section
              key={c.chave}
              aria-label={`Coluna de ${c.nome}`}
              className="relative border-e border-[var(--bo-hairline)]"
              style={{ height: alturaTotal, ...riscasDeHora, scrollSnapAlign: "start" }}
            >
              <ul className="absolute inset-0">
                {c.blocos.map(({ bloco, carril }) => {
                  const instante = bloco.duracao === 0;
                  const choque = emChoque.has(bloco.item.id);
                  const altura = instante
                    ? ALTURA_DO_INSTANTE
                    : Math.max(ALTURA_MINIMA_DO_BLOCO, bloco.duracao * PX_POR_MINUTO);
                  const frase = fraseDoBloco(c, bloco, choque);
                  const largura = 100 / c.carris;
                  return (
                    <li
                      key={bloco.item.id}
                      title={frase}
                      className={`absolute overflow-hidden rounded-[var(--bo-raio-miudeza)] ps-1.5 pe-1 ${
                        choque
                          ? "border border-[var(--bo-perigo)]/40 bg-[var(--bo-perigo-lavagem)]"
                          : instante
                            ? "border border-dashed border-[var(--bo-hairline-strong)]"
                            : "bg-[var(--bo-accent-lavagem)]"
                      }`}
                      style={{
                        top: (bloco.inicio - janela.inicio) * PX_POR_MINUTO,
                        height: altura,
                        insetInlineStart: `calc(${carril * largura}% + 1px)`,
                        width: `calc(${largura}% - 3px)`,
                      }}
                    >
                      {/* ── O CARRIL: A FORMA QUE ACOMPANHA A COR ───────────
                          Cheio quando o momento ocupa tempo, a perigo quando é
                          um choque. É o mesmo carril de 3 px da esquerda que o
                          `EventTimeline` põe em cada bloco. */}
                      {!instante && (
                        <span
                          aria-hidden="true"
                          className={`absolute inset-y-0 start-0 w-[3px] ${
                            choque ? "bg-[var(--bo-perigo)]" : "bg-[var(--bo-accent)]"
                          }`}
                        />
                      )}
                      {/* ── O INSTANTE: TRAÇO E PONTO, COMO NA FITA ─────────
                          O traço fica na hora EXACTA (o topo da caixa) e a
                          caixa por baixo é só onde o nome cabe — nunca um
                          bloco cheio, que diria que aquilo dura vinte minutos. */}
                      {instante && (
                        <>
                          <span
                            aria-hidden="true"
                            className="absolute start-0 top-0 h-[3px] w-full bg-[var(--bo-accent)]"
                          />
                          <span
                            aria-hidden="true"
                            className="absolute start-0 top-0 size-[5px] rounded-full bg-[var(--bo-accent)]"
                          />
                        </>
                      )}

                      <span aria-hidden="true" className="block">
                        <span
                          className={`flex items-center gap-1 truncate text-[10px] leading-[14px] ${
                            instante ? "mt-[3px]" : ""
                          }`}
                        >
                          {/* Quando o espaço é pouco, o PROBLEMA é o que fica:
                              num bloco de 15 min só cabe uma linha, e essa
                              linha começa por «Choque». O título é o que
                              trunca — nunca o aviso. */}
                          {choque && (
                            <span className="flex shrink-0 items-center gap-0.5 font-semibold text-[var(--bo-perigo)]">
                              <Losango />
                              Choque
                            </span>
                          )}
                          <span className="shrink-0 tabular-nums text-[var(--bo-text-muted)]">
                            {bloco.item.time}
                          </span>
                          <span className="truncate text-[var(--bo-text)]">{bloco.item.title}</span>
                        </span>
                        {altura >= ALTURA_PARA_A_SEGUNDA_LINHA && (
                          <span className="bo-text-muted mt-0.5 block truncate text-[10px] leading-[14px] tabular-nums">
                            {instante
                              ? "sem duração"
                              : `${porExtenso(bloco.duracao)} · até às ${horaDoMinuto(bloco.fim)}`}
                          </span>
                        )}
                      </span>

                      {/* A frase inteira, uma vez, para quem ouve o ecrã. O que
                          está desenhado por cima é `aria-hidden` de propósito:
                          senão ouvia-se o título duas vezes e a hora três. */}
                      <span className="sr-only">{frase}</span>
                    </li>
                  );
                })}
              </ul>

              {/* ── O «AGORA» ─────────────────────────────────────────────
                  A mesma risca a perigo do `ReguaDoDia`, deitada em vez de em
                  pé, e só no dia do evento. A PALAVRA e a hora estão na coluna
                  das horas, ao lado, que é onde há espaço para as escrever uma
                  vez em vez de uma por coluna. */}
              {minutoDoAgora !== null && (
                <span
                  aria-hidden="true"
                  className="absolute start-0 h-px w-full bg-[var(--bo-perigo)]"
                  style={{ top: (minutoDoAgora - janela.inicio) * PX_POR_MINUTO }}
                />
              )}
            </section>
          ))}
        </div>
      </div>

      {/* ── A LEGENDA ───────────────────────────────────────────────────────
          Quatro formas e quatro palavras. Não substitui as palavras que cada
          bloco leva — acrescenta as que um bloco de quinze minutos não tem
          altura para escrever, e diz o que a POSIÇÃO significa, que é a única
          parte desta grelha que nenhum bloco pode dizer sozinho. */}
      <ul className="bo-text-faint mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        <li className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-2 rounded-[var(--bo-raio-miudeza)] border-s-[3px] border-[var(--bo-accent)] bg-[var(--bo-accent-lavagem)]"
          />
          Bloco cheio: tempo marcado
        </li>
        <li className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[5px] w-2 rounded-full bg-[var(--bo-accent)]"
          />
          Traço com ponto: instante, sem duração
        </li>
        <li className="flex items-center gap-1">
          <Losango />
          Choque: a mesma pessoa em dois sítios ao mesmo tempo
        </li>
        <li>Colunas lado a lado à mesma altura: coisas ao mesmo tempo</li>
      </ul>

      {semHora.length > 0 && (
        <p className="bo-text-muted mt-2 text-xs leading-relaxed">
          {semHora.length === 1
            ? `«${semHora[0].item.title}» não tem hora legível, por isso não aparece na grelha — só na régua.`
            : `${semHora.length} momentos não têm hora legível, por isso não aparecem na grelha — só na régua.`}
        </p>
      )}
    </div>
  );
}

export default GrelhaDoDia;
