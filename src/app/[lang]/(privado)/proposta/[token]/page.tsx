import type { Metadata } from "next";
import Image from "next/image";
import { readProposalToken } from "@/lib/proposal-token";
import { propostaDoLink } from "@/lib/proposta-do-link";
import { pareceCodigoCurto } from "@/lib/proposta-link-curto";
import { SITE } from "@/lib/site";
import { getDictionary, htmlLang, normalizeLocale, type Locale } from "@/lib/i18n";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import { fotosDaProposta } from "@/lib/proposta-fotos";
import { getQuote } from "@/lib/quotes-store";
import { chaveDasPaginas, versaoDaChave } from "@/lib/paginas-da-proposta";
import { paginasDoPlano } from "@/lib/pdf-editorial/plano";
import { log } from "@/lib/logger";
import PaginasDoPdf from "./PaginasDoPdf";
import EscolhasDoDocumento from "./EscolhasDoDocumento";
import PropostaWeb from "./PropostaWeb";
import { Bodoni_Moda, Jost } from "next/font/google";
import "./proposta-web.css";

/**
 * As letras do protótipo (Bodoni Moda itálico e Jost), servidas por esta casa
 * pelo `next/font` — nada de pedidos ao Google em cada visita
 * (`zero-rastreio.test.ts`). Só esta página as carrega.
 */
const LETRA_BODONI = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400"],
  variable: "--pw-bodoni",
  display: "swap",
});
const LETRA_JOST = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--pw-jost",
  display: "swap",
});
import { textosDaPagina } from "./textos-da-pagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RENDERIZADA A CADA VISITA — NUNCA GUARDADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `[token]` não tem `generateStaticParams` e nada nesta página usa uma API de
 * pedido: o idioma vem do SEGMENTO da rota, de propósito, para o sítio
 * institucional poder ser pré-renderizado (ver o cabeçalho de src/proxy.ts).
 * Para o Next isto é, portanto, uma rota estática — renderiza à primeira visita
 * e guarda o HTML no Full Route Cache, sem revalidação, até ao próximo deploy.
 *
 * Só que tudo o que esta página mostra é ESTADO que muda por baixo dela. Com o
 * HTML congelado: o casal aceita, volta ao link (reenviam-no, reabrem-no do
 * email) e encontra outra vez o formulário de aceitar como se nada tivesse
 * acontecido; a proposta que o estúdio retirou continua a ser oferecida até um
 * 409 no clique; e o `expired` fica preso ao dia da primeira visita, portanto o
 * aviso de validade nunca chega a aparecer.
 *
 * `force-dynamic` também punha `Cache-Control: private, no-store` na
 * resposta. Numa página cujo URL é a própria credencial, o `private` não é
 * acessório: é o que impede um cache partilhado (CDN, proxy da empresa) de
 * guardar a proposta de um cliente e servi-la a quem pedir o mesmo caminho.
 * Desde 22/10 o cabeçalho é `private, no-cache` (ver `next.config.ts`): fica a
 * protecção, e o `no-store` que tirava a proposta da cache de «voltar atrás»
 * do browser sai.
 */
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LÍNGUA DESTA PÁGINA É A DA PROPOSTA, NÃO A DO VISITANTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O segmento `[lang]` desta rota vem do COOKIE de quem visita (ver o cabeçalho
 * de src/proxy.ts): um casal inglês que carregue no botão do email a partir de
 * um computador onde alguém leu o site em português caía numa página portuguesa
 * para responder a uma proposta inglesa. E ao contrário: quem tem o site em
 * inglês recebia a moldura inglesa por cima de um documento português.
 *
 * O documento é que manda. A proposta já sabe em que língua foi feita
 * (`proposals.idioma`), e é essa que esta página usa em tudo: o dicionário, o
 * título do separador e o atributo `lang` do bloco.
 *
 * ── PORQUE É QUE NÃO SE REDIRECCIONA PARA O OUTRO SEGMENTO ────────────────
 *
 * Seria o mais limpo (arrumava também o `<html lang>` do layout) e NÃO PODE
 * SER: o português canónico é o caminho SEM prefixo, e o proxy reescreve-o para
 * `/{lang}/…` segundo o cookie. Um visitante com o cookie em inglês a abrir uma
 * proposta portuguesa entrava num ciclo — a página mandava-o para o caminho
 * bare, o proxy devolvia-o a `/en/…`, sem fim. O `lang` no elemento é o que
 * resolve a parte que interessa a quem lê com um leitor de ecrã.
 */
function tituloDoSeparador(locale: Locale): string {
  return locale === "en" ? "Your proposal | Líquen Events" : "A sua proposta | Líquen Events";
}

// Private, per-client link — never index it. O título segue a língua da
// PROPOSTA: é o que aparece no separador e no histórico, e é a primeira coisa
// que o casal lê do produto.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}): Promise<Metadata> {
  const { lang, token } = await params;
  // Sem proposta (token forjado, proposta apagada) não há língua a seguir senão
  // a de quem está a olhar. Uma leitura que falhe também não pode deitar abaixo
  // o título da página: cai-se no visitante, como sempre foi.
  let locale = normalizeLocale(lang);
  try {
    // A MESMA proposta que a página resolve (o link segue o pedido, não a
    // linha — ver `proposta-do-link.ts`). Duas escadas diferentes davam um
    // separador português por cima de uma revisão inglesa.
    const proposal = (await propostaDoLink(token))?.proposta ?? null;
    if (proposal) locale = idiomaDaProposta(proposal);
  } catch {
    /* fica a língua do visitante */
  }
  return {
    /**
     * `absolute` — o título já vem com a marca lá dentro (ver
     * `tituloDoSeparador`), e entregá-lo como texto simples fazia o layout de
     * raiz aplicar-lhe por cima o seu `template: "%s | Líquen Events"`.
     *
     * MEDIDO no separador do browser, em `/proposta/<token>`:
     *   <title>A sua proposta | Líquen Events | Líquen Events</title>
     * e, em inglês, «Your proposal | Líquen Events | Líquen Events».
     *
     * É o mesmo defeito que `casamentos/titulos.test.ts` documenta e prende
     * para as 34 páginas de campanha — só que ali custa caracteres na SERP e
     * aqui custa noutro sítio: esta página não se indexa (`noindex`), mas é a
     * PRIMEIRA coisa que o casal lê do produto pago. O título é o que fica no
     * separador, no histórico e no marcador de quem guarda a proposta para
     * voltar a ela, e a marca escrita duas vezes lê-se como descuido logo à
     * entrada do documento que pede uma assinatura.
     */
    title: { absolute: tituloDoSeparador(locale) },
    robots: { index: false, follow: false },
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * ESTA ROTA NUNCA TEM IMAGEM DE PARTILHA. NUNCA.
     * ═══════════════════════════════════════════════════════════════════════
     *
     * E não bastava «não pôr nenhuma»: as etiquetas de partilha do layout de
     * raiz são HERDADAS por quem não as declara. MEDIDO no `layout.tsx`
     * (linhas 159 e 177): ele define `openGraph.images` e
     * `twitter.images` com o `SITE.ogImage`, portanto este link privado
     * estava a sair com uma imagem de partilha e com o título «A sua proposta»
     * a acompanhá-la.
     *
     * O que isso custa: o casal reencaminha o link por WhatsApp, iMessage ou
     * Slack, e o serviço de mensagens vai buscar a etiqueta e GUARDA-A num
     * servidor que não é dela. O `noindex` não alcança essa cache — ele fala
     * com motores de busca, e um pré-visualizador de mensagens não é um. Uma
     * imagem de partilha bonita é, precisamente, a coisa que se espalha.
     *
     * Declarar os dois blocos com `images: []` é o que os SUBSTITUI. Um bloco
     * declarado por uma página substitui o do layout por inteiro — é essa a
     * regra de resolução do Next, e é por isso que isto não é um adorno.
     *
     * Se um dia se quiser cá pôr a fotografia da capa da proposta: não.
     */
    openGraph: {
      title: tituloDoSeparador(locale),
      images: [],
    },
    twitter: {
      card: "summary",
      title: tituloDoSeparador(locale),
      images: [],
    },
  };
}

/**
 * O DINHEIRO SEGUE A LÍNGUA DA PROPOSTA.
 *
 * Decisão dela, 20-08-2026: «se é em pt o dinheiro tem que estar em português,
 * mas se é em eng o dinheiro tem que estar em inglês».
 *
 * ── O que aqui estava escrito, e a parte que era falsa ────────────────────
 *
 * Vivia aqui a decisão contrária — pt-PT nas duas línguas — com três razões.
 * Duas continuam de pé e valem: metade dos montantes de uma proposta é TEXTO
 * LIVRE escrito por ela à portuguesa, e a factura que se segue é um documento
 * fiscal português. A terceira dizia que «o PDF já escreve assim em qualquer
 * idioma» — e **é falsa**: o gerador passa cada montante por
 * `montanteNaLingua` (`proposal-doc-pdf.ts:858`). Uma proposta inglesa saía do
 * PDF com «€24,600.00» e desta página com «24.600,00 €». Era a página a
 * discordar do PDF, e não o contrário.
 *
 * ── Como se converte, e porque não é um `Intl` com outra localização ──────
 *
 * Pelo MESMO caminho do PDF: escreve-se à portuguesa com o `eurDocumento` e
 * converte-se no fim com o `montanteNaLingua`. A diferença não é de estilo. Um
 * formatador à parte punha os NOSSOS números em inglês e os DELA — o texto
 * livre — em português na mesma folha, e entre as duas formas a vírgula e o
 * ponto TROCAM DE PAPEL: «24.600» lido à inglesa são vinte e quatro euros e
 * sessenta. A conversão partilhada trata os dois da mesma maneira, que é o que
 * torna a folha coerente.
 *
 * As DATAS já eram localizadas pelo `t.dateLocale` e continuam.
 */
import { eurDocumento, montanteNaLingua } from "@/lib/money";
import { FUSO_DO_ESTUDIO, hojeNoEstudio } from "@/lib/fuso";

function Shell({ children, lang }: { children: React.ReactNode; lang: string }) {
  return (
    <section
      /* A língua do CONTEÚDO, que pode não ser a do `<html>` (esse vem do
         segmento da rota, e o segmento vem do cookie do visitante). Sem isto,
         um leitor de ecrã lê a proposta inglesa com pronúncia portuguesa —
         que é, ao pé da letra, incompreensível. */
      lang={lang}
      /*
       * PADDING VERTICAL, MEDIDO E ENCOLHIDO.
       *
       * A 375×667: com `py-16` (64 px) mais o logótipo (64 px + 40 px de
       * margem), a saudação só começava aos 291 px — quase metade do ecrã,
       * ANTES da barra de navegação do site (que já mostra o mesmo logótipo
       * lá em cima). `py-10` poupa 24 px em cima e 24 px em baixo sem tocar no
       * logótipo em si (tamanho, cor, posição centrada mantêm-se).
       */
      className="min-h-[80vh] bg-surface flex flex-col items-center px-5 py-10 sm:py-20"
    >
      <Image
        src="/logo-liquen.png"
        alt="Líquen Events"
        width={150}
        height={90}
        className="object-contain h-16 w-auto mb-6 opacity-90"
      />
      {children}
    </section>
  );
}

function Message({ title, body, lang }: { title: string; body: string; lang: string }) {
  return (
    <Shell lang={lang}>
      <div className="max-w-md text-center">
        <h1
          className="text-foreground/85 font-bold mb-4"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 4vw, 40px)" }}
        >
          {title}
        </h1>
        <p className="text-foreground/72 text-sm leading-relaxed">{body}</p>
        {/* O ÚNICO caminho que sobra nesta página, e por isso tem de se poder
            carregar nele com um polegar. Medido num telemóvel: 252×16 px. O
            texto é minúsculo (`text-xs` em maiúsculas) e está sozinho — não é
            uma ligação no meio de uma frase, é O botão desta página, e quem
            aqui chega já teve uma contrariedade.
            `alvo-toque` é a classe da casa (globals.css): 44 px SÓ em ecrãs de
            toque, portanto o portátil fica exactamente como estava. */}
        <a
          href={`mailto:${SITE.email}`}
          className="alvo-toque inline-flex items-center mt-8 text-moss text-xs tracking-[0.2em] uppercase hover:underline"
        >
          {SITE.email}
        </a>
      </div>
    </Shell>
  );
}

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang, token } = await params;
  /**
   * A língua de QUEM VISITA, e serve para uma coisa só: as duas páginas de
   * erro. Um token forjado ou uma proposta apagada não têm proposta nenhuma de
   * onde tirar língua, e o que está no ecrã é uma explicação para quem está a
   * olhar.
   */
  const doVisitante = normalizeLocale(lang);

  /**
   * ── A VERSÃO ATUAL, PELO LINK QUE O CASAL JÁ TEM ─────────────────────────
   *
   * Palavras dela: «Se eu ajustar o preço ou os serviços, o casal vê a versão
   * atual sem eu reenviar nada.» O token guarda o identificador de UMA
   * proposta e uma revisão é uma proposta NOVA — portanto este link mostrava a
   * versão 1 para sempre. Quem resolve isso (e as guardas que impedem o salto
   * de virar um buraco) está em `proposta-do-link.ts`, num sítio só, porque o
   * PDF e as fotografias têm de resolver exactamente a mesma.
   */
  const doLink = await propostaDoLink(token);
  const proposal = doLink?.proposta;
  if (!proposal) {
    /**
     * ── DUAS MANEIRAS DE NÃO HAVER PROPOSTA, E DUAS FRASES ─────────────────
     *
     * O endereço que chega aqui é uma de duas coisas: o token assinado dos
     * links já enviados, ou o código curto dos novos. A verificação estava
     * feita ANTES, e só sabia ler tokens — um código curto legítimo apanhava
     * «link inválido» sem sequer se ir ver se a proposta existia.
     *
     * Agora quem resolve as duas portas é o `propostaDoLink`, e o que sobra
     * aqui é só escolher a frase: um endereço com forma reconhecível que não
     * abre nada é uma proposta que já não está lá; um endereço sem forma
     * nenhuma é um link partido pelo caminho.
     */
    const t = getDictionary(doVisitante).proposta;
    const formaConhecida = pareceCodigoCurto(token) || readProposalToken(token) !== null;
    return formaConhecida ? (
      <Message title={t.notFoundTitle} body={t.notFoundBody} lang={htmlLang(doVisitante)} />
    ) : (
      <Message title={t.linkInvalidTitle} body={t.linkInvalidBody} lang={htmlLang(doVisitante)} />
    );
  }

  /**
   * DAQUI PARA BAIXO manda a proposta. Tudo o que se lê nesta página descreve
   * um documento que já foi apresentado ao casal numa língua: o total, a
   * validade, o botão do PDF e o formulário de resposta. Mostrá-los na língua
   * do visitante era pôr a moldura numa língua e o documento noutra — e é
   * exactamente o que acontecia a um casal inglês que abrisse o link a partir
   * de um computador com o site em português.
   *
   * Uma proposta sem língua gravada é portuguesa: ver `idiomaDaProposta`.
   */
  const locale = idiomaDaProposta(proposal);
  const t = getDictionary(locale).proposta;
  /** O dinheiro na língua da proposta — ver o cabeçalho do ficheiro. */
  const eur = (valor: number, moeda?: string) =>
    montanteNaLingua(eurDocumento(valor, moeda), locale);

  /**
   * ── «OLÁ, .» ────────────────────────────────────────────────────────────
   *
   * O título era `{t.greeting}, {proposal.clientName.split(" ")[0]}.` e não
   * tinha guarda nenhuma. Com o nome do cliente vazio — uma linha antiga em
   * que `client_name` ficou a `null` (o `fromRow` traduz isso para `""`) — o
   * casal abria o link do email e a primeira coisa que lia, em Playfair a 52
   * px, era:
   *
   *     Olá, .
   *
   * E com o campo em falta de todo, o `.split` de `undefined` atirava: o casal
   * apanhava a página de «Ocorreu um erro inesperado» em vez da proposta.
   *
   * Sem nome, cumprimenta-se na mesma — «Olá.» — que é uma frase inteira e não
   * denuncia nada. Com nome, é exactamente o que sempre saiu.
   */
  const primeiroNome =
    String(proposal.clientName ?? "")
      .trim()
      .split(/\s+/)[0] ?? "";

  /**
   * ── E CUMPRIMENTAM-SE OS DOIS, NÃO UM ────────────────────────────────────
   *
   * Palavras dela: «em vez de dizer Olá x diga o nome dos dois noivos».
   *
   * Isto dizia `Olá, {primeira palavra do nome do cliente}` — e o nome do
   * cliente é o de QUEM PEDIU o orçamento. Numa proposta de casamento há duas
   * pessoas, e cumprimentar só uma delas, em Playfair a 52 px, na primeira
   * linha que o casal lê, é dizer-lhes que o documento é para um deles.
   *
   * `doc.clientNames` é o campo que ela própria escreve no estúdio e que o
   * documento já mostra como «NOIVOS» mais abaixo — «Lola e João», na forma que
   * ela escolheu. Usar esse texto é usar a autoria dela em vez de inventar uma
   * junção a partir de dois campos.
   *
   * A cascata mantém as guardas que já existiam, e pela mesma razão: sem os
   * dois nomes cai-se no primeiro nome de quem pediu, e sem nome nenhum
   * cumprimenta-se na mesma — «Olá.» — que é uma frase inteira e não denuncia
   * que falta ali um campo.
   */
  const nomesDoCasal = String(proposal.doc?.clientNames ?? "").trim();
  const aQuemSeFala = nomesDoCasal || primeiroNome;
  const saudacao = aQuemSeFala ? `${t.greeting}, ${aQuemSeFala}.` : `${t.greeting}.`;

  /**
   * AS FOTOGRAFIAS, ASSINADAS AQUI E NÃO POR UM PEDIDO DO NAVEGADOR.
   *
   * A página é `force-dynamic`, portanto isto corre a cada visita e o HTML sai
   * já com os endereços lá dentro: a primeira fotografia começa a descarregar
   * no primeiro fotograma, sem uma ida ao servidor pelo meio. A alternativa —
   * pintar a página e só depois pedir os URLs — é uma cascata de dois saltos
   * antes de o primeiro pixel de fotografia sequer ser pedido, num telemóvel,
   * numa página cuja razão de ser são as fotografias.
   *
   * A rota `/api/proposta/[token]/fotos` existe para DEPOIS (as assinaturas da
   * Biblioteca valem 6 horas) e usa esta mesma função. Uma função, duas portas.
   *
   * Melhor esforço declarado: um Storage em baixo devolve uma lista sem
   * endereços e a página desenha o documento na mesma, sem a galeria — o casal
   * continua a ler a proposta e a poder abrir o PDF.
   */
  /**
   * ── AS DUAS LEITURAS QUE FALTAM NÃO DEPENDEM UMA DA OUTRA ──────────────────
   *
   * «Tem que ser ultra rápido abrir a proposta, tanto online como a do PDF.»
   *
   * Daqui para baixo faltavam duas idas ao servidor: as fotografias (assinar os
   * endereços do Storage) e o PEDIDO (o que o casal já escolheu). Estavam em
   * fila — a segunda só partia quando a primeira voltasse —, e nenhuma delas
   * precisa do resultado da outra: as duas só precisam da proposta, que já foi
   * lida acima.
   *
   * Em fila, a página espera a soma. Juntas, espera a maior das duas. Num
   * telemóvel em 4G, onde o que custa é a ida e a volta e não o trabalho do
   * outro lado, é uma volta inteira que desaparece de todas as aberturas.
   *
   * O `.catch` fica preso à promessa no instante em que ela nasce, e não no
   * `await`: uma promessa que rebenta antes de alguém a esperar é uma rejeição
   * sem dono, e essas derrubam o processo em vez de desenharem a página sem as
   * marcas — que é o pior caso honesto e está escrito aqui em baixo.
   */
  const pedidoDasEscolhas =
    (proposal.doc?.escolhas ?? []).length > 0 && (proposal.quoteId ?? "").trim()
      ? getQuote(proposal.quoteId!.trim()).catch((e) => {
          log.warn("proposta: não deu para ler as escolhas do casal", { erro: e });
          return null;
        })
      : Promise.resolve(null);

  /**
   * ── SÓ AS FOTOGRAFIAS DAS ALTERNATIVAS ─────────────────────────────────────
   * Desde 22/10 a página mostra o PDF tal e qual (`PaginasDoPdf.tsx`): as
   * fotografias dos mood boards e da capa vêm DENTRO do PDF. A única coisa
   * desenhada em HTML são as escolhas, e só essas precisam de endereços
   * assinados. Assinar as outras dezenas era trabalho a atrasar a abertura —
   * «quero que tornes extremamente rápido» — para fotografias que já não se
   * desenham aqui.
   */
  const fotos =
    proposal.doc && (proposal.doc.escolhas ?? []).length > 0
      ? await fotosDaProposta({ coverImages: [], moodBoards: [], escolhas: proposal.doc.escolhas })
      : [];

  /**
   * O QUE O CASAL JÁ ESCOLHEU — lido do PEDIDO, e não da proposta.
   *
   * A razão está em `proposta-escolhas.ts`: uma revisão de preço cria uma
   * proposta NOVA, e a paleta que eles escolheram na semana passada não pode
   * desaparecer por causa disso. É por isso que a resposta vive no pedido, e
   * é por isso que se vai lá buscar.
   *
   * Melhor esforço declarado: uma leitura falhada (base em baixo) desenha as
   * alternativas SEM marca nenhuma. É o pior caso honesto — as alternativas
   * continuam a poder ser escolhidas e a escolha volta a seguir; o que não
   * acontece é a página inventar que não escolheram.
   */
  const escolhido: Record<string, string> = {};
  const pedidoDoCasal = await pedidoDasEscolhas;
  for (const r of pedidoDoCasal?.escolhasDoCasal ?? []) escolhido[r.escolhaId] = r.opcaoId;

  const cur = proposal.currency || "EUR";
  // Mirror the API's expiry rule (through the WHOLE of the last valid day, i.e.
  // 23:59:59) so the client sees an "expired" notice up front instead of only
  // discovering it on a 410 after clicking Accept.
  //
  // Comparam-se DIAS, e o «hoje» é o de Portugal (A8-014): o `Date.parse` de
  // «…T23:59:59» lia-se no fuso do servidor (UTC), e a proposta dava-se por
  // caducada uma hora antes de acabar o último dia, no Verão.
  const expired = proposal.validUntil
    ? /^\d{4}-\d{2}-\d{2}/.test(proposal.validUntil) &&
      proposal.validUntil.slice(0, 10) < hojeNoEstudio()
    : false;
  /** O dia em que o CONTEÚDO mudou pela última vez, na língua do documento. */
  // No fuso do estúdio (A8-001): sem ele saía no dia de Greenwich, e uma
  // revisão às 00:30 de 14 de agosto lia-se «Atualizada a 13 de agosto», ao
  // lado de «Emitida a» que já tinha o fuso certo.
  const atualizadaLabel = doLink?.versaoEm
    ? new Date(doLink.versaoEm).toLocaleDateString(t.dateLocale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: FUSO_DO_ESTUDIO,
      })
    : null;
  /**
   * O dia em que a proposta foi EMITIDA — discreto, e diferente do de cima.
   *
   * «Atualizada a» responde «isto ainda é o que eu vi?»; esta responde «de
   * quando é esta proposta?», que é a pergunta de quem a reencontra num email
   * de há três meses. Numa proposta que nunca foi revista são o mesmo dia, e
   * por isso só se escrevem as duas quando são mesmo duas (ver o ecrã).
   *
   * A data de ENVIO quando existe, e a de criação quando não: é o dia em que a
   * proposta passou a existir para o casal, não o dia em que ela a começou a
   * escrever.
   */
  const emitidaLabel = (() => {
    const iso = proposal.sentAt || proposal.createdAt;
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(+d)
      ? null
      : d.toLocaleDateString(t.dateLocale, {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: FUSO_DO_ESTUDIO,
        });
  })();

  const validLabel = proposal.validUntil
    ? new Date(proposal.validUntil + "T12:00:00").toLocaleDateString(t.dateLocale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  /**
   * ══════════════════════════════════════════════════════════════════════
   * A PROPOSTA ONLINE É UMA PÁGINA WEB PRÓPRIA (23/10)
   * ══════════════════════════════════════════════════════════════════════
   *
   * Pedido dela, com o protótipo aprovado («Proposta-Online-Liquen»): a
   * página deixa de mostrar as páginas do PDF como imagens numa coluna
   * estreita e passa a ser uma página web a ecrã inteiro, «gerada a partir
   * dos MESMOS dados do editor». Desfaz a decisão de 22/10 («a online não
   * tem nada a ver com a PDF»): a resposta, agora, é a página nova ter o
   * conteúdo DO PDF — os textos, os valores e as fotografias vêm do mesmo
   * motor (`conteudoDoEditorial`), e o PDF fica num botão. Ver
   * `docs/PROPOSTA-WEB.md`.
   *
   * Vale para todos os links, também os que já seguiram (escolha dela): muda
   * só a apresentação; o documento guardado e o PDF não mudam.
   *
   * Se a página não se deixar montar (o armazenamento em baixo, por
   * exemplo), fica o visor das páginas do PDF de antes — o casal nunca fica
   * sem proposta.
   */
  if (proposal.doc) {
    // Carregado só aqui: o modelo puxa o motor do PDF e o `sharp`, que não
    // podem abrir no arranque da página (`sharp-fora-do-arranque.test.ts`).
    const { propostaWeb } = await import("@/lib/proposta-web/modelo");
    const dados = await propostaWeb(
      {
        id: proposal.id,
        doc: proposal.doc,
        sentAt: proposal.sentAt,
        createdAt: proposal.createdAt,
      },
      token,
      locale,
    ).catch((e) => {
      log.error("proposta online: a página web não se deixou montar", e, {
        proposalId: proposal.id,
      });
      return null;
    });
    if (dados) {
      const datas = [
        validLabel ? `${t.validoAte} ${validLabel}` : "",
        emitidaLabel ? `${t.emitidaEm} ${emitidaLabel}` : "",
        !!doLink?.versao && doLink.versao > 1 ? `${t.versaoNumero} ${doLink.versao}` : "",
        !!doLink?.versao && doLink.versao > 1 && atualizadaLabel && atualizadaLabel !== emitidaLabel
          ? `${t.atualizadaEm} ${atualizadaLabel}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return (
        <PropostaWeb
          dados={dados}
          lang={htmlLang(locale)}
          fontes={`${LETRA_BODONI.variable} ${LETRA_JOST.variable}`}
          escolhas={
            (proposal.doc.escolhas ?? []).length > 0 ? (
              <EscolhasDoDocumento
                doc={proposal.doc}
                idioma={locale}
                fotos={fotos}
                token={token}
                escolhido={escolhido}
              />
            ) : undefined
          }
          avisos={
            <>
              {doLink?.estado === "revista" && (
                <p role="note" className="pw-aviso">
                  {t.revistaDepoisDeAceite}
                </p>
              )}
              {expired && (
                <p role="note" className="pw-aviso">
                  {t.respostaExpirada}
                </p>
              )}
            </>
          }
          datas={datas}
        />
      );
    }
  }

  return (
    <Shell lang={htmlLang(locale)}>
      {/* A MEDIDA DA PÁGINA.

          `max-w-2xl` (672 px) é a medida de leitura de uma folha de texto, e
          era o que esta página era. Com o documento vivo lá dentro deixou de
          chegar: a galeria de inspiração precisa de largura para as
          fotografias serem grandes, que é a razão de tudo isto existir. A
          página passa a `max-w-5xl` (1024 px) QUANDO há documento, e o
          `Documento` prende a prosa a `max-w-2xl` por dentro — cada coisa com
          a largura que lhe serve, em vez de uma só para as duas. Sem
          documento, a página fica exactamente como estava. */}
      <div className={`w-full ${proposal.doc ? "max-w-5xl" : "max-w-2xl"}`}>
        {/*
         * ── O QUE ESTAVA AQUI E SAIU ────────────────────────────────────
         *
         * «PROPOSTA PARA O SEU EVENTO», em maiúsculas espaçadas, por cima do
         * nome do casal. Não acrescentava nada: eles abriram um link que lhes
         * foi mandado a dizer que a proposta estava pronta, e a primeira coisa
         * que liam era alguém a informá-los de que aquilo era uma proposta.
         *
         * O espaço fica para a frase de intenção estética, escrita à mão
         * proposta a proposta.
         */}
        <header className="text-center mb-10">
          <h1
            className="text-foreground/90 font-bold"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 5vw, 52px)" }}
          >
            {saudacao}
          </h1>
          {/*
           * ══════════════════════════════════════════════════════════════
           * A ABERTURA É O NOME DELES, E MAIS NADA
           * ══════════════════════════════════════════════════════════════
           *
           * Duas frases já viveram aqui, e as duas saíram.
           *
           * A primeira era da casa: «Preparámos esta proposta com todo o
           * cuidado… Vejam com calma.» Palavras dela na altura: «quero retirar
           * isto de "veja com calma". quero que apareça apenas o nome do noivo
           * e da noiva». Era verdadeira e era de toda a gente — e é isso que
           * estava mal debaixo de dois nomes próprios.
           *
           * A segunda foi a que a substituiu: uma «frase de intenção» escrita
           * por ela, proposta a proposta, sobre o que tinha imaginado para
           * aquele casamento. Também saiu, e por decisão dela: mandou a
           * fotografia do parágrafo e escreveu «nao quero estes textos na
           * proposta». Perguntei-lhe se era aquele texto ou o campo; respondeu
           * «não quero o campo, ponto final».
           *
           * Fica o nome deles. O `h1` acima é a abertura inteira.
           *
           * A frase da casa continua a existir no EMAIL
           * (`proposta-doc/route.ts`), onde um corpo só com dois nomes não se
           * lê como uma mensagem. */}
        </header>

        {/* ══════════════════════════════════════════════════════════════
            A PROPOSTA ONLINE É O PRÓPRIO PDF (22/10)
            ══════════════════════════════════════════════════════════════

            Palavras dela: «a proposta online não tem nada a ver com a
            proposta PDF que nós fazemos agora… quero que esteja ao mesmo
            nível». Escolheu que a página mostre o PDF tal e qual, e que abra
            «extremamente rápido». Aqui ficava o `Documento` — um segundo
            desenho da proposta em HTML, que deixou de acompanhar o PDF
            editorial. As páginas passam a ser as do PDF que segue em anexo
            no email (ver `PaginasDoPdf.tsx`), e por baixo ficam as escolhas,
            que são a única coisa que o casal FAZ nesta página.

            Sem documento — as propostas anteriores à coluna e as de linhas do
            back office — desenha-se o quadro de sempre, sem uma diferença. */}
        {proposal.doc ? (
          <>
            <PaginasDoPdf
              base={`/api/proposta/${encodeURIComponent(token)}`}
              v={versaoDaChave(chaveDasPaginas(proposal.id, proposal.doc, locale))}
              previstas={paginasDoPlano(proposal.doc)}
              textos={textosDaPagina(locale)}
            />
            <EscolhasDoDocumento
              doc={proposal.doc}
              idioma={locale}
              fotos={fotos}
              token={token}
              escolhido={escolhido}
            />
          </>
        ) : (
          <>
            {/* Line items */}
            <div className="border border-foreground/10 rounded-lg overflow-hidden bg-surface-raised/30">
              {/* O CABEÇALHO SÓ APARECE SE HOUVER LINHAS PARA PÔR POR BAIXO.

              Uma proposta feita no estúdio grava sempre `lineItems: []` (ver
              api/orcamento/[id]/proposta-doc/route.ts) — o detalhe dos serviços
              vive no documento em PDF que segue em anexo, não em linhas. Sem
              esta condição, o noivo que abre a página para decidir gastar
              milhares de euros via o cabeçalho "Descrição / Quantidade / Valor",
              NADA por baixo, e logo a seguir o total a pagar. É a página mais
              cara do produto para dar má impressão, e dava-a a toda a gente que
              recebe uma proposta do estúdio. */}
              {proposal.lineItems.length > 0 && (
                <div className="hidden sm:flex items-center gap-3 px-5 py-3 border-b border-foreground/8 text-foreground/70 text-[10px] tracking-[0.2em] uppercase">
                  <span className="flex-1">{t.tableDescricao}</span>
                  <span className="w-12 text-center">{t.tableQt}</span>
                  <span className="w-28 text-right">{t.tableValor}</span>
                </div>
              )}
              {proposal.lineItems.map((it, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-5 py-3.5 border-b border-foreground/6 last:border-0"
                >
                  <span className="flex-1 text-foreground/75 text-sm">{it.description}</span>
                  <span className="w-12 text-center text-foreground/72 text-sm tabular-nums">
                    {it.qty}
                  </span>
                  <span className="w-28 text-right text-foreground/75 text-sm tabular-nums">
                    {eur(it.qty * it.unitPrice, cur)}
                  </span>
                </div>
              ))}

              {/* Totals */}
              <div className="px-5 py-4 bg-foreground/[0.03] flex flex-col gap-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/72">{t.subtotal}</span>
                  <span className="text-foreground/72 tabular-nums">
                    {eur(proposal.subtotal, cur)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/72">
                    {t.iva} ({Math.round(proposal.vatRate * 100)}%)
                  </span>
                  <span className="text-foreground/72 tabular-nums">{eur(proposal.vat, cur)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-foreground/10">
                  <span className="text-foreground/70 text-sm font-medium">{t.total}</span>
                  <span
                    className="text-moss font-bold tabular-nums"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(20px, 3vw, 28px)",
                    }}
                  >
                    {eur(proposal.total, cur)}
                  </span>
                </div>
              </div>
            </div>

            {proposal.notes && (
              <div className="mt-5 border-l-2 border-moss/40 pl-5 py-1">
                <p className="text-foreground/72 text-sm leading-relaxed whitespace-pre-wrap">
                  {proposal.notes}
                </p>
              </div>
            )}
          </>
        )}

        {/* O DOCUMENTO COMPLETO, na página onde se decide.

            O PDF seguia só em anexo no email: quem arquivasse a mensagem, ou
            abrisse o link no telemóvel, ficava a decidir milhares de euros a
            olhar para um total e um IVA. O botão só aparece quando há mesmo
            documento guardado (`proposal.doc`) — as propostas anteriores à
            coluna `proposals.doc`, e as de linhas criadas no back office, não
            têm nenhum e a página fica exatamente como estava. */}
        {proposal.doc && (
          <p className="mt-6 text-center">
            {/* O ÚNICO botão da proposta em si — «decidir milhares de euros» e
                depois não conseguir acertar no link do PDF no telemóvel. Media
                num iPhone SE: 326×42 px, 2 px abaixo do mínimo de toque por
                causa do `inline-block` (que nem sequer deixa o `min-height`
                do `.alvo-toque` ter efeito — um alvo inline não tem caixa
                para crescer). `alvo-toque` + `inline-flex items-center
                justify-center` é o mesmo par que já funciona no CTA de email
                da página de erro (`Message`, aqui em cima) — só cresce em
                ecrãs de toque, o portátil fica exactamente como estava. */}
            <a
              href={`/api/proposta/${encodeURIComponent(token)}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="alvo-toque inline-flex items-center justify-center rounded-md border border-moss/40 px-6 py-3 text-moss text-xs tracking-[0.2em] uppercase hover:bg-moss/8 transition-colors"
            >
              {t.verPdf}
            </a>
          </p>
        )}

        {validLabel && (
          <p className="text-foreground/70 text-xs mt-5 text-center">
            {t.validoAte} {validLabel}.
          </p>
        )}

        {/* ── QUE VERSÃO É ESTA, E DE QUE DIA ──────────────────────────────
            O link mostra sempre a versão ATUAL (ver `proposta-do-link.ts`), o
            que resolve o problema de fundo e cria outro: o casal volta ao
            link meses depois e não tem como saber se está a olhar para o
            mesmo papel que leu. Esta linha responde a isso.

            É sobre o DOCUMENTO e nunca sobre quem o lê. Não se regista que a
            proposta foi aberta, nem quando, nem por quem — a regra dela, à
            letra. O que aqui está é a data em que ELA mexeu, que já estava
            gravada do lado do estúdio.

            Só aparece a partir da versão 2: dizer «Versão 1» a quem abre uma
            proposta pela primeira vez é ruído. */}
        {(emitidaLabel || (!!doLink?.versao && doLink.versao > 1)) && (
          <p className="text-foreground/70 text-[11px] mt-2 text-center">
            {[
              emitidaLabel ? `${t.emitidaEm} ${emitidaLabel}` : "",
              /* Só a partir da versão 2: dizer «Versão 1» a quem abre uma
                 proposta pela primeira vez é ruído. */
              !!doLink?.versao && doLink.versao > 1 ? `${t.versaoNumero} ${doLink.versao}` : "",
              /* E a data da revisão só quando é OUTRO dia: numa proposta
                 revista no próprio dia em que saiu, «emitida a 3 · atualizada
                 a 3» é a mesma data escrita duas vezes. */
              !!doLink?.versao &&
              doLink.versao > 1 &&
              atualizadaLabel &&
              atualizadaLabel !== emitidaLabel
                ? `${t.atualizadaEm} ${atualizadaLabel}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {/* ── A VERSÃO MUDOU DEPOIS DO «SIM» (A6-005) ────────────────────────
            O estado era calculado (`proposta-do-link.ts`) e ninguém o desenhava.
            Depois de um aceite o link mostra a versão ACEITE, congelada; se
            entretanto houve uma revisão, o casal não tinha maneira de o saber.
            Diz-se uma vez, sem alarme: o que ele vê é o que aceitou, e nada
            muda sem uma conversa. */}
        {doLink?.estado === "revista" && (
          <p
            role="note"
            className="mx-auto mt-4 max-w-md rounded-md border border-moss/30 bg-moss/5 px-4 py-3 text-center text-xs leading-relaxed text-foreground/80"
          >
            {t.revistaDepoisDeAceite}
          </p>
        )}

        {/**
         * ═══════════════════════════════════════════════════════════════════
         * A RESPOSTA É POR EMAIL OU POR TELEFONE — NÃO POR BOTÃO
         * ═══════════════════════════════════════════════════════════════════
         *
         * Havia aqui um formulário: «Aceitar proposta», «Recusar proposta»,
         * uma caixa de termos e um campo de nome, e o clique gravava a decisão
         * do casal no sistema.
         *
         * A dona da casa mandou tirá-lo, e a razão é do negócio: um casamento
         * não se fecha num botão. Fecha-se numa conversa — e uma proposta
         * «recusada» com um toque distraído no telemóvel é um negócio perdido
         * sem ninguém ter falado com ninguém. Passa a dizer-se, com todas as
         * letras, como se responde: escrever ou ligar.
         *
         * O PDF e a validade FICAM: esta página continua a ser onde o casal vê
         * a proposta inteira quando já arquivou o email.
         *
         * A rota que gravava a resposta (`POST /api/proposta`) foi APAGADA, e
         * não apenas escondida — enquanto existisse, uma ligação antiga numa
         * caixa de correio continuava a poder gravar uma decisão que ninguém
         * quis. Ver o teste `nada-de-aceitar-por-botao.test.tsx`.
         */}
        <div className="mt-10 border-t border-foreground/10 pt-8 text-center">
          <p className="text-foreground/85 text-sm leading-relaxed">
            {expired ? t.respostaExpirada : t.respostaComo}
          </p>
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a
              href={`mailto:${SITE.email}`}
              className="alvo-toque text-moss text-sm tracking-wide hover:underline"
            >
              {SITE.email}
            </a>
            <a
              href={`tel:${SITE.phone}`}
              className="alvo-toque text-moss text-sm tracking-wide hover:underline"
            >
              {SITE.phoneDisplay}
            </a>
          </p>
        </div>

        <p className="text-foreground/70 text-[11px] text-center mt-10 leading-relaxed">
          {t.footerNote}{" "}
          {/* Medido a 375 px: 140×14 px — um alvo de e-mail com 14 px de
              altura, mais pequeno do que a polpa de um dedo consegue acertar
              de propósito. `alvo-toque` só cresce em ecrãs de toque. */}
          <a
            href={`mailto:${SITE.email}`}
            className="alvo-toque inline-flex items-center justify-center text-moss hover:underline"
          >
            {SITE.email}
          </a>
        </p>
      </div>
    </Shell>
  );
}
