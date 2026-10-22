import Image from "next/image";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA ABRE JÁ — MESMO ANTES DE ESTAR PRONTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre os dois botões do email: «demora imenso tempo a
 * carregar (…) a pessoa carrega e vai logo».
 *
 * O que o casal via ao carregar em «Ver a proposta online» era um separador
 * EM BRANCO. A página é `force-dynamic` e não tinha nem ecrã de espera nem
 * entrega por partes, portanto o browser não recebia um único byte enquanto o
 * servidor acordava a função, lia o link curto, lia a proposta, assinava as
 * fotografias, lia as escolhas e desenhava o HTML todo. Segundos de nada, no
 * telemóvel, no instante em que se decide gastar vinte mil euros.
 *
 * Não é a página a ser pesada: é a página a não mostrar nada enquanto pensa. É
 * a regra dela — «nunca um estado de espera sem nome» — a ser violada no ecrã
 * que mais importa.
 *
 * Com este ficheiro, o Next serve isto IMEDIATAMENTE e vai buscar o resto por
 * baixo. O casal carrega e vê logo o logótipo do estúdio e a forma da proposta
 * a chegar.
 *
 * ── PORQUE É QUE AQUI NÃO HÁ UMA FRASE ────────────────────────────────────
 *
 * Porque este ficheiro não pode saber a língua. Está escrito nos documentos do
 * Next, à letra: «Loading UI components do not accept any parameters». O
 * `[lang]` da rota não chega aqui, e não há como o ir buscar sem inventar uma
 * leitura frágil do endereço.
 *
 * Escrever «A abrir a proposta…» punha português à frente de um casal inglês
 * — e há propostas em inglês, com o documento gravado nessa língua (ver
 * `idiomaDaProposta`). Entre uma frase que pode estar na língua errada e uma
 * FORMA que se lê em qualquer língua, escolhe-se a forma: o logótipo do
 * estúdio, o sítio do nome deles, e os retângulos das fotografias a aparecer.
 * Quem carregou no botão sabe o que pediu; o que faltava era ver que estava a
 * acontecer.
 *
 * Para quem ouve o ecrã em vez de o ver, o `aria-busy` diz «isto está a
 * carregar» — e diz-lo na língua do leitor de ecrã, que é mais do que qualquer
 * frase que eu aqui escrevesse conseguiria.
 *
 * ── E PORQUE É QUE A FORMA É ESTA ─────────────────────────────────────────
 *
 * É a do `Shell` da página verdadeira, com as mesmas medidas: fundo, respiro,
 * logótipo do mesmo tamanho e no mesmo sítio. Quando o conteúdo chega, o
 * logótipo não salta — troca-se o que está por baixo dele e mais nada. Um
 * ecrã de espera com outra moldura faz a página piscar duas vezes: uma a
 * entrar, outra a assentar.
 */
export default function ADescarregarAProposta() {
  return (
    <section
      aria-busy="true"
      className="min-h-[80vh] bg-surface flex flex-col items-center px-5 py-10 sm:py-20"
    >
      {/* O mesmo logótipo, no mesmo tamanho e no mesmo sítio da página real —
          é ele que diz de quem é isto enquanto o resto não chega. */}
      <Image
        src="/logo-liquen.png"
        alt="Líquen Events"
        width={150}
        height={90}
        className="object-contain h-16 w-auto mb-6 opacity-90"
        priority
      />

      {/* ── A FORMA DA PROPOSTA ──────────────────────────────────────────
          Decorativa e escondida de quem ouve: o `aria-busy` lá em cima já
          disse o que interessa, e uma lista de retângulos anunciada um a um
          seria ruído. O `motion-safe` desliga o pulsar para quem pediu menos
          movimento — e o que pulsa é a opacidade, que corre no compositor. */}
      <div
        aria-hidden
        /**
         * O pulsar SAIU, e é uma correcção e não uma perda.
         *
         * Este esqueleto vive por baixo da cortina, que é opaca e cobre o ecrã
         * inteiro durante todo o tempo em que ele existe. Ou seja: era uma
         * animação infinita de opacidade, num contentor da largura toda com
         * seis caixas, a correr a cada fotograma — para NINGUÉM. E a competir
         * pela mesma linha principal que a animação que se vê.
         *
         * Quem nomeia a espera é o `aria-busy` lá em cima e, para os olhos, a
         * cortina. Não faz falta um segundo movimento por baixo de uma coisa
         * opaca.
         *
         * Desde 22/10 a proposta já não tem cortina («Sai só na proposta»), e
         * este esqueleto passa a ver-se. Fica quieto na mesma: a espera dura
         * pouco (a página e a primeira folha chegam juntas), e uma forma
         * parada no sítio da página real não pisca quando ela chega.
         */
        className="w-full max-w-5xl flex flex-col items-center"
      >
        {/* O sítio do nome do casal. */}
        <div className="h-9 sm:h-12 w-64 sm:w-96 rounded-md bg-foreground/[0.06]" />
        {/* A linha da data, mais curta e mais leve. */}
        <div className="mt-4 h-4 w-40 rounded bg-foreground/[0.04]" />

        {/* As fotografias: uma grande e duas ao lado, que é como a capa da
            proposta abre. Proporção 3/2, a mesma das folhas. */}
        <div className="mt-10 w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 aspect-[3/2] rounded-lg bg-foreground/[0.05]" />
          <div className="flex flex-col gap-3">
            <div className="aspect-[3/2] rounded-lg bg-foreground/[0.05]" />
            <div className="aspect-[3/2] rounded-lg bg-foreground/[0.05] hidden sm:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
