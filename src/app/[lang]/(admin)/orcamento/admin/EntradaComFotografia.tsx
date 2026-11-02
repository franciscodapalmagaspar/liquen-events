"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "@/components/LocaleProvider";
import { ficheiroDaGaleria, srcsetDaGaleria } from "@/app/[lang]/(site)/galeria/gallery-srcset";
import {
  DESFOCADO_NEUTRO,
  FOTOGRAFIAS_DA_ENTRADA,
  type FotografiaDaEntrada,
} from "@/data/fotografias-da-entrada";
import { FUSO_DO_ESTUDIO } from "@/lib/fuso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA DE ENTRADA DO BACK OFFICE, COM UMA FOTOGRAFIA VERDADEIRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── ONDE ISTO ESTÁ PENDURADO ──────────────────────────────────────────────
 * No `AdminLogin.tsx`, e é o único sítio. Envolve a coluna inteira do cartão:
 *
 *     import { EntradaComFotografia, RodapeDaEntrada } from "./EntradaComFotografia";
 *     …
 *     <EntradaComFotografia>
 *       <div className="w-full max-w-sm flex flex-col items-center gap-8">
 *         … logótipo, cartão, campos, passkeys — tal e qual …
 *         <RodapeDaEntrada />
 *       </div>
 *     </EntradaComFotografia>
 *
 * O `min-h-screen`, a centragem e o gradiente do fundo vivem TODOS
 * aqui dentro — o `AdminLogin` não os repete. Quem lá mexer não precisa de
 * saber mais do que isto; o resto deste cabeçalho é o PORQUÊ das escolhas, que
 * é o que não se consegue reconstituir a olhar para o código.
 *
 * Para medir, `node scripts/medir-entrada-admin.mjs` aponta por omissão a
 * `/orcamento/admin`, que é esta página.
 *
 * ── PORQUÊ METADE DO ECRÃ, E NÃO O CARTÃO A FLUTUAR SOBRE A FOTO INTEIRA ──
 * As duas hipóteses foram desenhadas; esta ganha por causa dos números do véu.
 *
 * Para texto branco chegar aos 4,5:1 exigidos, o fundo por baixo dele tem de
 * ficar em L ≤ 0,183. Contra o pior pixel possível de uma fotografia (branco
 * puro: a renda do ramo, os pratos da mesa posta, o céu do jantar a preto e
 * branco) isso obriga a um véu de 57% de preto; para os 7:1 confortáveis, 70%.
 * Com o cartão a flutuar sobre a fotografia inteira, esses 57-70% teriam de
 * cobrir o ECRÃ TODO, porque o texto branco (a assinatura, a saudação) não
 * vive num sítio só. É exactamente a «mancha morta» de que ela falou: a
 * fotografia deixa de ser uma fotografia e passa a ser uma textura escura.
 *
 * Com o painel a metade, o véu forte fica confinado à faixa de baixo, onde a
 * saudação assenta (uma barra de legenda, que é uma convenção editorial e não
 * um estrago). O resto do painel leva 12% de tinta, só para dar coesão de cor.
 * E o formulário mantém o seu chão claro: os campos brancos, o texto escuro e
 * o botão nunca ficam por cima de fotografia nenhuma, portanto a legibilidade
 * do que se PREENCHE não é trocada por atmosfera.
 *
 * ── E NO TELEMÓVEL MANDA O FORMULÁRIO ─────────────────────────────────────
 * Aí a fotografia é uma faixa de 160 px no topo, e o `py` da coluna encolhe de
 * 48 para 32 px para pagar parte dela. MEDIDO com o `scripts/medir-entrada-
 * admin.mjs` em 390x844, contra o cartão como ele está hoje (email,
 * palavra-passe, recuperação e entrada por dispositivo): antes o botão
 * «Entrar» acabava aos 512 px de 844; depois acaba aos 655 px. Continua acima
 * da dobra com 189 px de folga, que é a condição que ela pôs. Na secretária
 * não se mexe: 540 px de 900, antes e depois.
 *
 * A frase do slogan é `hidden sm:block` por causa disto — numa faixa de 160 px
 * ela roubava a linha à saudação e empurrava o cartão para baixo sem
 * acrescentar nada que já não esteja no site.
 *
 * ── O QUE ISTO CUSTA À VELOCIDADE, medido ─────────────────────────────────
 * Mediana de 5 corridas por cenário (`--repeticoes=5`), servidor de produção
 * local, com a entrada de hoje (`/orcamento/admin`) como termo de comparação:
 *
 *              secretária 1440x900        telemóvel 390x844, 4G lento, CPU 4x
 *   antes      516 ms  (LCP = logótipo)   1444 ms  (LCP = logótipo)
 *   depois     600 ms  (LCP = fotografia) 1560 ms  (LCP = fotografia)
 *
 * A fotografia passa a SER o elemento de LCP — é o maior elemento do ecrã, não
 * podia deixar de ser. O que interessa é que ela não está no caminho crítico:
 * no telemóvel os 36 KB do AVIF acabam de chegar aos 1210 ms e a primeira
 * pintura só acontece aos 1560 ms. Ou seja, a fotografia espera 350 ms PELA
 * PÁGINA, e não o contrário; encolhê-la mais não move o número. Quem manda no
 * LCP do telemóvel é o caminho de render (CSS e JS com o CPU a 4x), que já
 * mandava antes desta mudança — repare-se que o «antes», sem fotografia
 * nenhuma, já estava nos 1444 ms.
 *
 * A meta de 1,2 s cumpre-se com folga na secretária. No perfil estrangulado
 * não se cumpre, nem antes nem depois, e não é a fotografia que o impede: isso
 * é trabalho no arranque global do site, fora desta frente. Fica dito com o
 * número ao lado em vez de arredondado para uma vitória.
 */

/**
 * As larguras que o painel oferece na secretária. Subconjunto da escada que
 * `scripts/pregen-gallery.mjs` já produz para TODA a fotografia de
 * `public/imagens/` — este componente não gera ficheiro nenhum, serve os que
 * já existem em `/_img/g/`. O painel é 50vw: num ecrã de 1440 são 720 CSS px,
 * ou seja 768 a DPR 1 e 1280 (o tecto) a DPR 2.
 */
export const ESCADA_PAINEL = [640, 768, 1024, 1280] as const;

/**
 * E as do telemóvel. A faixa é larga mas tem 160 px de alto: o tecto fica em
 * 768, a mesma regra (e a mesma razão) da grelha da galeria — acima de ~2x o
 * tamanho de exibição o olho não distingue e os bytes triplicam.
 */
export const ESCADA_FAIXA = [384, 640, 768] as const;

/** O ponto onde a faixa do topo dá lugar ao painel de metade do ecrã (`lg`). */
const CORTE_PAINEL = "(min-width: 1024px)";

/**
 * ── O VÉU, com a aritmética à vista ───────────────────────────────────────
 *
 * Tinta base sobre a fotografia inteira. 12% não serve para ler nada: serve
 * para as quatro fotografias (uma a preto e branco, uma nocturna, duas em
 * plano aproximado) partilharem a mesma temperatura ao lado do mesmo cartão.
 */
const TINTA_DE_COESAO = "rgba(20, 18, 16, 0.12)";

/**
 * E a faixa por baixo do texto. O patamar é 78% até 60% da altura da caixa do
 * texto, e só depois esvazia.
 *
 * PORQUÊ 78%. Sobre o pior pixel que uma fotografia pode ter (branco puro), a
 * composição de 78% de rgb(20,18,16) com 22% de branco dá rgb(72,71,70), que é
 * L = 0,064: contraste 9,2:1 com branco. Com os 12% de tinta base por cima
 * disso a alfa efectiva é 0,806 e o rácio sobe. A conta é o pior caso teórico
 * e serve de piso.
 *
 * Os números REAIS saem de `node scripts/medir-entrada-admin.mjs`, que fotografa
 * o painel já composto, esconde as letras e percorre os píxeis do fundo POR
 * BAIXO delas, ficando com o mais claro (o pior caso, não a média):
 *
 *   20_10_2025_0244 (ramo sobre renda)     12,42:1
 *   DaniGui_JantarFesta_39 (jantar p&b)    10,98:1
 *   hd-edited (jantar ao anoitecer)        10,88:1
 *   ines-goncalo-282 (mesa posta)          10,93:1
 *
 * O pior das quatro é 10,88:1 — mais do dobro dos 4,5:1 pedidos, e acima dos
 * 7:1 do nível AAA — e mesmo assim confinado a uma faixa com a altura do texto.
 * Acima dela a fotografia fica com os 12%, ou seja continua a ser uma
 * fotografia.
 */
const VEU_DO_TEXTO =
  "linear-gradient(to top," +
  " rgba(20, 18, 16, 0.82) 0%," +
  " rgba(20, 18, 16, 0.78) 60%," +
  " rgba(20, 18, 16, 0.42) 82%," +
  " rgba(20, 18, 16, 0) 100%)";

/** O chão da coluna do formulário: o mesmo que a página de entrada já tinha. */
const CHAO_DO_FORMULARIO = "linear-gradient(180deg, #ffffff 0%, #f4f5f3 100%)";

// ── O relógio ──────────────────────────────────────────────────────────────

/**
 * TUDO O QUE DEPENDE DA HORA É CONTADO EM LISBOA, e não no fuso da máquina.
 *
 * O servidor corre em UTC e o browser corre no fuso de quem abre a página. Se
 * cada um fizesse a sua conta, uma abertura às 00h30 de Lisboa em Agosto dava
 * «Boa noite» no cliente e «Boa tarde» no servidor: erro de hidratação, e o
 * texto a trocar debaixo dos olhos. Com o fuso escrito à mão, os dois lados
 * fazem a MESMA conta a partir do mesmo instante.
 */
const FUSO = FUSO_DO_ESTUDIO;

const HORA_EM_LISBOA = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO,
  hour: "2-digit",
  hourCycle: "h23",
});
const DIA_EM_LISBOA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type PeriodoDoDia = "bomDia" | "boaTarde" | "boaNoite";

/**
 * Manhã das 5h ao meio-dia, tarde do meio-dia às 20h, noite o resto — e o
 * «resto» inclui a MADRUGADA, que é a parte fácil de perder.
 *
 * A escada tem de ter o limite de baixo escrito nos dois degraus. Com um
 * `hora < 20` sozinho a seguir ao ramo da manhã, as horas de 0 a 4 caíam nele
 * (0 não é >= 5, mas é < 20) e quem abrisse o painel às 00h30 — que numa
 * empresa de eventos é uma hora de trabalho, não uma hipótese teórica — era
 * recebido com «Boa tarde». Estava assim, e o teste `a madrugada é noite, e não
 * manhã` existe para não voltar a estar.
 */
export function periodoDoDia(agora: Date = new Date()): PeriodoDoDia {
  const hora = Number(HORA_EM_LISBOA.format(agora));
  if (hora >= 5 && hora < 12) return "bomDia";
  if (hora >= 12 && hora < 20) return "boaTarde";
  return "boaNoite";
}

/**
 * A fotografia de hoje. RODA POR DIA, não sorteia a cada abertura, e a escolha
 * tem três razões:
 *
 *  1. `/_img/` é servido com `immutable` a um ano (ver next.config.ts). Com uma
 *     fotografia por dia, a segunda pessoa a entrar nessa manhã, e a mesma
 *     pessoa depois de sair, recebem-na da cache em vez de a ir buscar: o LCP
 *     da segunda visita deixa de ter rede pelo meio. Ao acaso, três em cada
 *     quatro entradas do dia pagavam um descarregamento novo.
 *  2. É determinístico, portanto o servidor e o browser desenham a MESMA
 *     fotografia. Sorteada no cliente, ou o HTML vinha sem fotografia nenhuma
 *     (e o LCP passava a depender do JavaScript), ou trocava depois da
 *     hidratação, à vista.
 *  3. E continua a não ser sempre a mesma, que era o pedido: quem abre isto
 *     todos os dias vê as quatro ao longo da semana.
 *
 * Fica uma fresta: se o HTML for desenhado no último milissegundo antes da
 * meia-noite de Lisboa e a hidratação cair já no dia seguinte, as duas contas
 * divergem. São ~300 ms de janela em 86 400 000 do dia, e o pior que acontece é
 * o browser trocar o `src` uma vez. Não vale um mecanismo para o evitar.
 */
export function fotografiaDoDia(agora: Date = new Date()): FotografiaDaEntrada | undefined {
  if (FOTOGRAFIAS_DA_ENTRADA.length === 0) return undefined;
  const dia = DIA_EM_LISBOA.format(agora); // "2026-08-12"
  const numeroDoDia = Math.floor(Date.parse(`${dia}T00:00:00Z`) / 86_400_000);
  return FOTOGRAFIAS_DA_ENTRADA[numeroDoDia % FOTOGRAFIAS_DA_ENTRADA.length];
}

/**
 * Acorda na próxima hora redonda, para uma página deixada aberta a noite toda
 * não continuar a dizer «Boa tarde». `Date.now() % 3600000` chega para a
 * encontrar porque o desvio de Lisboa para UTC é sempre de horas inteiras.
 */
function subscreverAoRelogio(aoMudar: () => void): () => void {
  let temporizador: ReturnType<typeof setTimeout>;
  const agendar = () => {
    const ateAProximaHora = 3_600_000 - (Date.now() % 3_600_000) + 1_000;
    temporizador = setTimeout(() => {
      aoMudar();
      agendar();
    }, ateAProximaHora);
  };
  agendar();
  return () => clearTimeout(temporizador);
}

/**
 * A saudação, sem erro de hidratação — de propósito, e não por sorte.
 *
 * Mesmo com a hora contada em Lisboa dos dois lados, sobra a fronteira: o HTML
 * desenhado às 11h59m59s e hidratado às 12h00m00s diria «Bom dia» de um lado e
 * «Boa tarde» do outro. `useSyncExternalStore` resolve isso pela raiz: o
 * `getServerSnapshot` devolve `null`, portanto o HTML do servidor sai SEM
 * saudação e a primeira renderização do cliente concorda com ele por
 * construção. Só depois de hidratar é que o React lê o instantâneo do cliente e
 * a saudação entra. É o mesmo mecanismo (e a mesma razão) do `temPasskeys` no
 * `AdminLogin`.
 *
 * O espaço fica reservado com um espaço duro, para a linha existir desde o
 * primeiro desenho e a entrada da saudação não empurrar nada (CLS).
 */
function useSaudacao(): PeriodoDoDia | null {
  return useSyncExternalStore(
    subscreverAoRelogio,
    () => periodoDoDia(),
    () => null,
  );
}

// ── Os componentes ─────────────────────────────────────────────────────────

/**
 * A assinatura do rodapé.
 *
 * Estava `text-white/25` — branco a 25% sobre um fundo BRANCO. Medido: 1,00:1
 * sobre o #ffffff do topo do gradiente e 1,02:1 sobre o #f4f5f3 do fundo. Não é
 * «pouco contraste», é contraste NENHUM: a frase não estava lá para ninguém,
 * visse bem ou mal.
 *
 * Passa para o mesmo valor do token `--bo-text-muted` do back office, que dá
 * 5,91:1 sobre o #ffffff e 5,72:1 sobre o #f4f5f3 — os dois extremos do
 * gradiente, porque a frase assenta em baixo mas a coluna é uma só. Ambos
 * acima dos 4,5:1, com margem para a letra ser pequena e espaçada como é.
 * (`EntradaComFotografia.test.tsx` refaz esta conta e falha se a cor mudar.)
 *
 * Escrito por extenso e não como `var(--bo-text-muted)`: a classe `admin-mode`
 * que define esses tokens só entra no `body` depois da hidratação, e uma
 * variável ainda por definir no primeiro desenho deixava a frase sem cor
 * nenhuma durante esse instante.
 */
export function RodapeDaEntrada() {
  return (
    <p className="text-[10px] tracking-[0.3em] uppercase text-[rgba(13,13,13,0.64)]">
      Líquen Events · Portugal
    </p>
  );
}

export function EntradaComFotografia({ children }: { children: ReactNode }) {
  const { t } = useTranslations();
  const saudacao = useSaudacao();
  const foto = fotografiaDoDia();

  return (
    <div
      /**
       * 62/38 e não 50/50.
       *
       * Com metade a metade, o cartão (max-w-sm, 384 px) flutuava sozinho no
       * meio de 720 px de branco: 168 px de vazio de cada lado, mais do que a
       * largura de meio cartão. Dar 62% à fotografia tira esse vazio ao branco
       * e devolve-o à única imagem que a equipa vê todos os dias — sem tocar no
       * cartão, que continua a ter a mesma medida de leitura.
       *
       * Fica nos 62% e não nos 65: a coluna do formulário tem de aguentar o
       * cartão de 384 px mais o respiro lateral (`px-4`) sem o apertar num
       * portátil de 1280 px, onde 38% são 486 px.
       */
      className="min-h-screen lg:grid lg:grid-cols-[62fr_38fr]"
    >
      {/* ── O painel da fotografia ─────────────────────────────────────── */}
      {foto && (
        <div
          data-painel-foto
          aria-hidden="true"
          className="relative isolate h-40 sm:h-52 lg:h-auto overflow-hidden bg-[var(--bo-seleccao)]"
        >
          <picture
            className="absolute inset-0 block"
            /**
             * O desfocado vive no `<picture>` e não no `<img>`: é o mesmo sítio
             * (e a mesma razão) do `GalleryImage` da galeria. São ~200 bytes
             * inline, portanto o painel nasce com a cor da fotografia em vez de
             * um rectângulo branco, sem um único pedido de rede.
             */
            style={{
              backgroundImage: `url(${foto.desfocado ?? DESFOCADO_NEUTRO})`,
              backgroundSize: "cover",
              backgroundPosition: foto.enquadramento,
            }}
          >
            <source
              media={CORTE_PAINEL}
              type="image/avif"
              srcSet={srcsetDaGaleria(foto.ficheiro, ESCADA_PAINEL, "avif")}
              sizes="62vw"
            />
            <source
              media={CORTE_PAINEL}
              type="image/webp"
              srcSet={srcsetDaGaleria(foto.ficheiro, ESCADA_PAINEL, "webp")}
              sizes="62vw"
            />
            <source
              type="image/avif"
              srcSet={srcsetDaGaleria(foto.ficheiro, ESCADA_FAIXA, "avif")}
              sizes="100vw"
            />
            <source
              type="image/webp"
              srcSet={srcsetDaGaleria(foto.ficheiro, ESCADA_FAIXA, "webp")}
              sizes="100vw"
            />
            {/*
             * Sem escada de re-tentativas, ao contrário da galeria: aqui é UMA
             * fotografia decorativa, o desfocado por baixo já cobre a falha, e
             * uma página de ENTRADA nunca pode passar a esperar por uma imagem.
             * `alt=""` porque é isso mesmo que ela é: quem usa leitor de ecrã
             * quer o formulário, não a descrição do fundo.
             */}
            <img
              src={ficheiroDaGaleria(foto.ficheiro, 1024, "webp")}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: foto.enquadramento }}
              // É o elemento de LCP na secretária: sai do HTML do servidor,
              // eager e com prioridade alta, para o preload scanner o começar a
              // descarregar antes de haver JavaScript nenhum.
              fetchPriority="high"
              loading="eager"
              decoding="async"
            />
          </picture>

          {/* A tinta de coesão, sobre a fotografia inteira. */}
          <div className="absolute inset-0" style={{ background: TINTA_DE_COESAO }} />

          {/* E a faixa do texto, com o véu colado ao texto e não ao painel:
              assim a conta do contraste é a mesma na faixa de 160 px do
              telemóvel e no painel de 900 px da secretária. */}
          <div
            className="absolute inset-x-0 bottom-0 px-5 pb-5 pt-10 sm:px-8 sm:pb-7 sm:pt-16 lg:px-10 lg:pb-10 lg:pt-24"
            style={{ background: VEU_DO_TEXTO }}
          >
            <p className="font-display text-xl leading-tight text-white sm:text-2xl lg:text-4xl">
              {saudacao ? t.common.entradaAdmin[saudacao] : " "}
            </p>
            <p className="mt-1 hidden text-sm leading-relaxed text-white/90 sm:block lg:mt-2 lg:text-base">
              {t.footer.sloganLine1} {t.footer.sloganLine2}
            </p>
            {/* ── ONDE FOI, E QUANDO ────────────────────────────────────────
                O que transforma isto num portefólio interno em vez de um fundo
                bonito. Fica DENTRO do véu, com o resto do texto, para não
                precisar de uma segunda conta de contraste: o `white/70` sobre
                a faixa medida a 10,88:1 dá 7,6:1, ainda acima do AAA.

                `hidden sm:block` pela mesma razão do mote: na faixa de 160 px
                do telemóvel esta linha roubava espaço ao formulário, que é
                quem manda ali. */}
            {foto.legenda && (
              <p className="mt-2 hidden text-[11px] tracking-[0.14em] uppercase text-white/70 sm:block lg:mt-3 lg:text-xs">
                {foto.legenda}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── A coluna do formulário ─────────────────────────────────────── */}
      <div
        className="flex items-center justify-center px-4 py-8 sm:py-12"
        style={{ background: CHAO_DO_FORMULARIO }}
      >
        {/*
         * A entrada do cartão: sobe 20 px e aparece, 520 ms. `fade-up` já vive
         * em globals.css e é o mesmo gesto que o site público usa, portanto não
         * se inventa aqui um segundo vocabulário de movimento.
         *
         * `motion-safe:` e não uma media query à mão: quem pediu menos
         * movimento não recebe animação nenhuma, e o cartão nasce no sítio (sem
         * `both` a segurá-lo invisível, porque a regra inteira desaparece).
         */}
        <div className="w-full max-w-sm motion-safe:animate-[fade-up_520ms_ease-out_both]">
          {children}
        </div>
      </div>
    </div>
  );
}

export default EntradaComFotografia;
