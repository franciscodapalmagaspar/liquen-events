import { NextRequest, NextResponse } from "next/server";
import { lqipsECoresDeCaminhos } from "@/lib/biblioteca-fotos-store";
import { isAuthed } from "@/lib/admin-auth";
import { listThemes, createTheme } from "@/lib/themes-store";
import {
  listThemeFiles,
  signThemePaths,
  signThemeThumbs,
  signThemeAvif,
  themeFolder,
  isThemePath,
} from "@/lib/theme-storage";
import { jsonWithEtag } from "@/lib/api-cache";
import { isUniqueViolation } from "@/lib/invoices-store";
import {
  isMissingTable,
  isPersistenceUnavailable,
  isCredencialRecusada,
  isSessaoExpirada,
  isBaseInacessivel,
  isTempoEsgotado,
  isLeituraNegada,
  descricaoTecnica,
} from "@/lib/repository";
import { isDatabaseConfigured, papelDaChaveSupabase } from "@/lib/supabase";
import {
  MAX_THEME_NAME,
  MAX_THEME_NOTES,
  normalizedThemeName,
  themeNameTakenError,
  type ThemeSummary,
} from "@/lib/theme-types";
import { lerRegra } from "@/lib/biblioteca-types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Esta lista faz UMA listagem do Storage POR TEMA mais três assinaturas em
 * bloco — com trinta temas são trinta e três idas à rede. Sem esta linha a
 * plataforma dá o mínimo (10 s) e mata a função a meio: do lado dela não
 * aparece um erro que se perceba, aparece a lista vazia com «Não foi possível
 * carregar os temas» — porque um 504 do intermediário não traz corpo JSON
 * nenhum para a mensagem sair de lá. Ver `src/app/api/limites-de-tempo.test.ts`.
 */
export const maxDuration = 30;

/** Quantas fotos, além da capa, o cartão de um tema mostra empilhadas. Três
 *  chegam para dar uma ideia do conjunto sem transformar o cartão numa grelha. */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA AVARIA SEM NOME É UMA AVARIA QUE NINGUÉM RESOLVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «diz que não é possível carregar os temas». Nenhum tema no
 * ecrã, e uma frase que não diz o que falhou nem o que fazer.
 *
 * A medição que obrigou a isto: das NOVE maneiras de partir esta leitura que se
 * conseguem provocar contra um Supabase de mentira, duas tinham frase própria
 * (tabela em falta, chaves ausentes), SEIS saíam todas como `500 "Erro
 * interno"` — chave recusada, sessão expirada, projecto em pausa, base
 * inacessível, consulta fora de tempo, leitura negada — e a nona, a pior, saía
 * como `200 []`: a chave `anon` com RLS ligado devolve zero linhas sem erro
 * nenhum, e o ecrã fica exactamente igual a uma biblioteca vazia.
 *
 * Cada uma passa a ter a sua frase e o seu passo seguinte. É o mesmo padrão que
 * o commit 8201842 abriu para as outras rotas — o erro nomeado no corpo, com
 * contexto no registo —, aqui com um `titulo` a acompanhar para que o cartão do
 * ecrã deixe de anunciar "Falta um passo de instalação" a quem tem é o projecto
 * em pausa.
 */
interface Avaria {
  /** O cabeçalho do cartão. Diz a CLASSE do problema numa linha. */
  titulo: string;
  /** O que falhou e o que fazer a seguir, na língua de quem está a olhar. */
  mensagem: string;
  /** 503 quando alguém pode resolver isto; 500 quando é mesmo uma avaria. */
  estado: 503 | 500;
}

/**
 * A biblioteca só precisa de uma tabela — quando ela falta, dizer o que fazer
 * vale mais do que um 500 mudo. É recuperável (503), não uma avaria.
 */
const NAO_INSTALADO: Avaria = {
  titulo: "Falta um passo de instalação",
  mensagem:
    "A Biblioteca de Temas ainda não está criada na base de dados. No Supabase → SQL Editor, " +
    "cola e corre o ficheiro db/schema.sql (pode repetir-se sem risco) e tenta de novo.",
  estado: 503,
};

/** A base de dados não está sequer ligada — outra instalação incompleta, com
 *  outra resolução (as chaves do Supabase), por isso outra frase. */
const SEM_BASE_DE_DADOS: Avaria = {
  titulo: "Falta um passo de instalação",
  mensagem:
    "A base de dados não está ligada nesta instalação, por isso os temas não podem ser guardados. " +
    "Faltam as chaves do Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
  estado: 503,
};

/** A chave existe e foi recusada. Um passo, não um mistério. */
const CHAVE_RECUSADA: Avaria = {
  titulo: "A base de dados recusou a chave",
  mensagem:
    "O Supabase recusou a chave desta instalação, por isso os temas não podem ser lidos — " +
    "quase sempre é uma chave rodada no painel e não actualizada aqui. No Supabase → Project " +
    "Settings → API, copia a chave service_role e volta a colá-la no Vercel → Settings → " +
    "Environment Variables (SUPABASE_SERVICE_ROLE_KEY). Os temas não se perderam: estão na base " +
    "de dados à espera.",
  estado: 503,
};

/** O mesmo lugar, outra causa: a sessão do PostgREST caducou. */
const SESSAO_EXPIRADA: Avaria = {
  titulo: "A ligação à base de dados caducou",
  mensagem:
    "A sessão com que falamos com o Supabase expirou (JWT). Recarrega a página; se continuar, " +
    "vai ao Supabase → Project Settings → API e volta a copiar a chave service_role para o " +
    "Vercel. Os temas estão guardados e não foram tocados.",
  estado: 503,
};

/**
 * O caso mais provável num projecto pequeno: o Supabase adormece por falta de
 * uso e passa a responder uma página HTML em vez de dados.
 */
const BASE_INACESSIVEL: Avaria = {
  titulo: "A base de dados não respondeu",
  mensagem:
    "Não foi possível falar com o Supabase — o projecto pode estar em pausa (acontece a um " +
    "projecto sem uso durante uns dias) ou fora de serviço. Abre o painel do Supabase: se " +
    "disser «Paused», carrega em «Restore project» e espera um minuto. Nada se perdeu — os " +
    "temas voltam assim que a base de dados voltar.",
  estado: 503,
};

/** A base respondeu, mas tarde demais. Transitório e repetível. */
const TEMPO_ESGOTADO: Avaria = {
  titulo: "A base de dados demorou demasiado",
  mensagem:
    "A consulta aos temas passou do tempo permitido pela base de dados. Volta a tentar dentro " +
    "de um minuto. Se continuar, vê no painel do Supabase → Reports se o projecto está " +
    "sobrecarregado. Os temas estão lá — o que falhou foi a leitura, não os dados.",
  estado: 503,
};

/** A base leu e recusou: políticas ou permissões. */
const LEITURA_NEGADA: Avaria = {
  titulo: "A base de dados recusou a leitura",
  mensagem:
    "O Supabase recusou ler a tabela dos temas (permission denied). A aplicação tem de falar " +
    "com a chave service_role, que ignora as políticas de segurança: confirma no Vercel → " +
    "Settings → Environment Variables que SUPABASE_SERVICE_ROLE_KEY é a chave service_role e " +
    "não a anon. Os temas continuam guardados.",
  estado: 503,
};

/**
 * A chave é a `anon` e o RLS está ligado: a leitura não dá erro, dá VAZIO.
 * Sem esta frase, o trabalho dela aparece como uma biblioteca que nunca existiu.
 */
const CHAVE_SEM_PERMISSAO: Avaria = {
  titulo: "A chave usada não vê os dados",
  mensagem:
    "A lista veio vazia, mas a chave configurada é a chave pública (anon) — e com as políticas " +
    "de segurança ligadas essa chave lê ZERO linhas sem dar erro. Os temas estão na base de " +
    "dados; é a chave que não os vê. No Supabase → Project Settings → API copia a chave " +
    "service_role (a secreta) e substitui SUPABASE_SERVICE_ROLE_KEY no Vercel → Settings → " +
    "Environment Variables.",
  estado: 503,
};

/**
 * Diz o que aconteceu, quando se sabe dizer. `null` quando não se reconhece a
 * causa — e aí quem chama tem de mostrar o erro TÉCNICO em vez de "Erro
 * interno", porque uma frase que não se pode citar não serve para pedir ajuda.
 */
function avariaConhecida(err: unknown): Avaria | null {
  if (isMissingTable(err)) return NAO_INSTALADO;
  if (isPersistenceUnavailable(err)) return SEM_BASE_DE_DADOS;
  if (isSessaoExpirada(err)) return SESSAO_EXPIRADA;
  if (isCredencialRecusada(err)) return CHAVE_RECUSADA;
  if (isLeituraNegada(err)) return LEITURA_NEGADA;
  if (isTempoEsgotado(err)) return TEMPO_ESGOTADO;
  if (isBaseInacessivel(err)) return BASE_INACESSIVEL;
  return null;
}

/**
 * A avaria que não se reconheceu, dita à mesma. O erro técnico vai no corpo de
 * propósito: é um ecrã de trabalho, só ela lá chega (a rota é de admin), e uma
 * linha que ela possa copiar para uma mensagem vale mais do que a palavra
 * "interno". O erro inteiro continua a ir para os registos.
 */
function avariaDesconhecida(err: unknown): Avaria {
  return {
    titulo: "Falha inesperada ao ler os temas",
    mensagem:
      "Os temas não puderam ser lidos e a causa não é uma das conhecidas. Volta a tentar; se " +
      "continuar, envia esta linha a quem trata da aplicação — " +
      `${descricaoTecnica(err)}. Nada foi apagado: isto é uma leitura.`,
    estado: 500,
  };
}

/** A resposta de uma avaria, com o cabeçalho que o ecrã mostra. */
function respostaDeAvaria(a: Avaria): NextResponse {
  return NextResponse.json({ error: a.mensagem, titulo: a.titulo }, { status: a.estado });
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O STORAGE NUNCA PODE LEVAR A LISTA CONSIGO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um tema sem capa é um problema pequeno; nenhum tema no ecrã é o trabalho dela
 * desaparecido. As funções do Storage já devolvem vazio em vez de lançarem —
 * mas "não lançar" não chega: uma listagem que DEMORE mata a função inteira, e
 * o que sai é um 504 sem corpo, que no ecrã se lê como «não foi possível
 * carregar os temas».
 *
 * A medição que fixa o número: contra uma porta fechada, o cliente do Supabase
 * tenta três vezes com espera pelo meio e só desiste ao fim de 8 s. Com trinta
 * temas — trinta e três idas ao Storage — bastam duas ou três assim para a
 * função morrer. Oito segundos é, portanto, o tempo ao fim do qual as fotos
 * deixam de valer a espera: a lista sai com os nomes todos e as capas em falta,
 * que é a versão da verdade que ainda serve para trabalhar.
 */
const ORCAMENTO_DO_STORAGE_MS = 8000;

/** Quantas fotografias da ordem manual concorrem à capa por omissão — ver
 *  «SEM CAPA ESCOLHIDA, A CAPA É A PRIMEIRA DA GRELHA», no GET. */
const CANDIDATAS_DA_ORDEM = 3;

async function comOrcamento<T>(
  trabalho: Promise<T>,
  ms: number,
  reserva: T,
  oQue: string,
): Promise<T> {
  // A promessa original não pode ficar a rejeitar sozinha depois de a corrida
  // acabar — seria um "unhandled rejection" a derrubar o processo por causa de
  // uma capa.
  const seguro = trabalho.catch((err) => {
    log.error(`temas GET: ${oQue} falhou`, err);
    return reserva;
  });
  if (ms <= 0) return reserva;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const relogio = new Promise<T>((resolve) => {
    temporizador = setTimeout(() => {
      log.warn("temas GET: o Storage passou do orçamento — a lista sai sem fotos", { oQue, ms });
      resolve(reserva);
    }, ms);
  });
  try {
    return await Promise.race([seguro, relogio]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

/** O que uma pasta que não se conseguiu ler devolve. Ver `listThemeFiles`. */
const PASTA_ILEGIVEL = { names: [] as string[], ok: false, truncated: false };

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** O ficheiro que um URL assinado aponta, sem a assinatura (que muda a cada
 *  pedido). Serve só para comparar respostas — ver o validador no GET. */
function semAssinatura(url: string | undefined): string {
  return url ? url.split("?")[0] : "";
}

/**
 * Biblioteca de Temas — lista de temas do estúdio, cada um com o nº de fotos e
 * uma capa para o cartão. Só admin.
 *
 * O CUSTO é o que manda aqui: uma ida ao Storage por TEMA, nunca por foto.
 * Cada tema custa uma listagem de UMA página (sem assinaturas), e as capas de
 * todos os temas são assinadas de uma só vez no fim, num único pedido — o
 * bucket é o mesmo, as pastas é que diferem. Desenhar cartões nunca pode
 * significar ler pastas inteiras: com milhares de fotos por tema, a contagem
 * do cartão é assumidamente um MÍNIMO (`truncated`, que a UI mostra como
 * "500+"); o número exato vive no ecrã do tema, que pagina.
 *
 * A capa é a ESCOLHIDA (`coverPath`) e, se não houver — ou se a escolhida já
 * tiver sido apagada e não puder ser assinada —, a primeira da grelha: a
 * primeira da ordem manual, quando o tema foi arrumado à mão, e a foto mais
 * recente quando não foi.
 *
 * Uma pasta ilegível não derruba a lista nem se disfarça de "0 fotos": esse
 * tema aparece com `imageCount: null` (o cartão mostra "Fotos indisponíveis")
 * e os outros continuam certos.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const themes = await listThemes();

    /**
     * A lista veio VAZIA e sem erro. Antes de a mostrar como "ainda não há
     * temas", há que excluir as duas maneiras de ela vir vazia por avaria —
     * ambas silenciosas, ambas medidas contra um Supabase de mentira:
     *
     *   · sem chaves em produção, o repositório cai para o ficheiro local
     *     (efémero, e nunca lá esteve nada): 200 com lista vazia;
     *   · com a chave `anon` e RLS ligado, o Postgres devolve zero linhas sem
     *     recusar nada: 200 com lista vazia.
     *
     * Uma biblioteca vazia a sério continua a ser vazia — só se fala quando há
     * um motivo concreto para desconfiar.
     */
    if (themes.length === 0) {
      if (!isDatabaseConfigured() && process.env.NODE_ENV === "production") {
        return respostaDeAvaria(SEM_BASE_DE_DADOS);
      }
      if (isDatabaseConfigured() && papelDaChaveSupabase() === "anon") {
        return respostaDeAvaria(CHAVE_SEM_PERMISSAO);
      }
    }

    // A partir daqui é tudo ACESSÓRIO: as fotos. O que estiver dentro do
    // orçamento entra; o que não estiver deixa o tema sem capa — nunca fora da
    // lista. Ver `comOrcamento`.
    const limite = Date.now() + ORCAMENTO_DO_STORAGE_MS;
    const listings = await comOrcamento(
      Promise.all(themes.map((t) => listThemeFiles(t.id))),
      ORCAMENTO_DO_STORAGE_MS,
      themes.map(() => PASTA_ILEGIVEL),
      "listagem das pastas",
    );

    // Duas hipóteses por tema — a escolhida e a mais recente —, ambas na mesma
    // assinatura em bloco: se a escolhida já não existir, a segunda responde
    // sem custar outra ida ao Storage.
    const chosen = themes.map((t) =>
      t.coverPath && isThemePath(t.coverPath) && t.coverPath.startsWith(`${themeFolder(t.id)}/`)
        ? t.coverPath
        : "",
    );
    const newest = listings.map(({ names }, i) =>
      names[0] ? `${themeFolder(themes[i].id)}/${names[0]}` : "",
    );
    /**
     * ════════════════════════════════════════════════════════════════════
     * SEM CAPA ESCOLHIDA, A CAPA É A PRIMEIRA DA GRELHA
     * ════════════════════════════════════════════════════════════════════
     *
     * «Por defeito a primeira» (T1). Era sempre a mais RECENTE — e num tema
     * arrumado à mão (`photoOrder`) a primeira da grelha é outra: o cartão
     * mostrava uma fotografia e, ao abrir a pasta, trocava para a primeira
     * da ordem (é essa que a pasta dá ao cartão, ver `capa-do-cartao.ts`).
     *
     * A ordem já vem na linha do tema, que esta rota leu lá em cima — não
     * custa ida nenhuma. As candidatas entram na MESMA assinatura em bloco, e
     * a escolhida é a primeira cujo original se deixou assinar, que é a
     * regra da pasta (`listThemeImagePage` deixa cair o que não assina).
     * Só as primeiras `CANDIDATAS_DA_ORDEM`: uma ordem pode ter centenas de
     * caminhos, e uma capa não precisa delas; se as três primeiras tiverem
     * desaparecido todas, fica a mais recente, como antes.
     */
    const daOrdem = themes.map((t) =>
      (t.photoOrder ?? [])
        .filter((p) => isThemePath(p) && p.startsWith(`${themeFolder(t.id)}/`))
        .slice(0, CANDIDATAS_DA_ORDEM),
    );
    /**
     * ════════════════════════════════════════════════════════════════════
     * UMA FOTOGRAFIA POR CARTÃO — e o que isso poupa
     * ════════════════════════════════════════════════════════════════════
     *
     * Aqui assinavam-se mais TRÊS fotos por tema, para o cartão desenhar uma
     * tira do conjunto ao lado da capa. A ideia era boa e o desenho não: numa
     * grelha compacta a tira tinha 41 px de largura e cada foto ~41 × 33 —
     * pequena de mais para se ler como uma fotografia, e o que se via era
     * textura no canto do cartão. Falhava no seu próprio objectivo.
     *
     * Decisão dela na Fase 2: uma imagem por cartão. O conjunto passa a ser
     * dito pelo número («9 fotos»), que ocupa uma linha de texto em vez de um
     * quarto da fotografia, e visto ao abrir o tema, que é onde se escolhe.
     *
     * MEDIDO, numa biblioteca de 25 temas: 75 pedidos de imagem a menos e
     * ~520 KB que deixam de atravessar a rede dela (micro AVIF a ~6,9 KB), sem
     * contar as 75 assinaturas e os 75 borrões que deixam de ir na resposta.
     * A tira era a metade mais cara do cartão e a que menos dizia.
     */
    /**
     * ════════════════════════════════════════════════════════════════════
     * O CARTÃO NÃO PODE SERVIR ORIGINAIS. Servia.
     * ════════════════════════════════════════════════════════════════════
     *
     * Isto assinava só `theme-assets` — o bucket dos ORIGINAIS, 2200 px e
     * ~576 KB por fotografia. Para uma capa desenhada com 128 px e três tiras
     * de 43 px. Por cartão: 4 × 576 KB = 2,3 MB. Seis cartões: **~13,8 MB**
     * para desenhar uma lista de temas.
     *
     * Em píxeis: a capa recebia 17× os que pinta, as tiras 51×.
     *
     * Agora assina os TRÊS buckets, em paralelo e em bloco (uma chamada por
     * bucket, como já era), e escolhe por ordem de adequação:
     *
     *   capa  → miniatura 400 px  →  original
     *   tiras → micro 96 px  →  miniatura 400 px  →  original
     *
     * O original continua a ser assinado porque é o único que existe SEMPRE:
     * as fotos anteriores às derivadas não têm miniatura nenhuma, e um cartão
     * vazio seria pior do que um cartão pesado. É plano B, não caminho.
     */
    const todos = [...new Set([...chosen, ...daOrdem.flat(), ...newest].filter(Boolean))];
    const vazio = () => new Map<string, string>();
    /* ── E OS BORRÕES, NO MESMO FÔLEGO ────────────────────────────────────
       «Placeholder blur por foto — acaba o ecrã de cartões cinzentos.»

       São poucas centenas de bytes por fotografia, e viajam nesta resposta:
       estão pintados no primeiro fotograma, antes de qualquer ida ao Storage.
       Vão na MESMA espera das assinaturas, e não a seguir — encadeá-los somava
       a latência de uma consulta à de três assinaturas, e o orçamento de tempo
       desta rota é o mesmo.

       Os `lqip` lêem-se por PASTA e a chave é o caminho REAL, sem o prefixo
       `tema:` que só existe dentro de um documento. Aqui os caminhos já são os
       reais — vêm da listagem da pasta.

       ── E A COR, NA MESMA LEITURA ────────────────────────────────────────
       «Nunca um cartão vazio» (T1 do `docs/PROPOSTAS-E-TEMAS-APPLE.md`): o
       cartão pinta o lugar da capa com a cor dominante dela enquanto a
       fotografia não chega — e quando não chega de todo. A cor vive na mesma
       linha do borrão, e por isso vem na mesma consulta
       (`lqipsECoresDeCaminhos`), dentro do mesmo orçamento: estourado o
       tempo, o cartão fica sem cor e cai no esqueleto cinzento, nunca num
       erro. */
    const [urls, thumbs, avifs, { lqips, cores }] = await comOrcamento(
      Promise.all([
        signThemePaths(todos),
        signThemeThumbs(todos),
        // A oferta em AVIF, quando existe. O Supabase só assina o que lá está,
        // e é isso que a torna segura: um `<source>` que dá 404 não faz o
        // navegador recuar para o `<img>`. Ver `signThemeAvif`.
        signThemeAvif(todos),
        lqipsECoresDeCaminhos(todos),
      ]),
      limite - Date.now(),
      [vazio(), vazio(), vazio(), { lqips: vazio(), cores: vazio(), formas: new Map() }],
      "assinatura das capas",
    );
    /** O melhor que existe para a capa do cartão (~128 px). */
    const paraCapa = (p: string) => thumbs.get(p) ?? urls.get(p);

    const summaries: ThemeSummary[] = themes.map((t, i) => {
      const { names, ok, truncated } = listings[i];
      // O caminho da capa, antes de se escolher que TAMANHO servir: é preciso
      // para poder mandar também o original como plano B.
      const capa = paraCapa(chosen[i])
        ? chosen[i]
        : (daOrdem[i].find((p) => urls.has(p)) ?? newest[i]);
      const coverUrl = paraCapa(capa);
      const coverFallbackUrl = capa ? urls.get(capa) : undefined;
      const coverLqip = capa ? lqips.get(capa) : undefined;
      const coverCor = capa ? cores.get(capa) : undefined;
      // Só se oferece o AVIF do tamanho que se está a servir: um AVIF de 400 px
      // proposto ao lado de uma micro de 96 seria mandar buscar dezassete vezes
      // os pixéis, com um cabeçalho a dizer que era uma poupança.
      const coverAvif = capa && thumbs.get(capa) ? avifs.get(capa) : undefined;
      return {
        ...t,
        imageCount: ok ? names.length : null,
        ...(ok && truncated ? { truncated: true } : {}),
        coverUrl,
        ...(coverFallbackUrl ? { coverFallbackUrl } : {}),
        ...(coverLqip ? { coverLqip } : {}),
        ...(coverCor ? { coverCor } : {}),
        ...(coverAvif ? { coverAvif } : {}),
      };
    });
    /**
     * A lista de temas é lida em quase todos os ecrãs e muda muito pouco —
     * exactamente o caso em que uma resposta condicional (ETag → 304) vale a
     * pena, como já acontece em /api/propostas e nas outras
     * listas do back office.
     *
     * Só que aqui o corpo NÃO se repete: cada capa e cada tira vêm num URL
     * assinado que leva a hora da assinatura, por isso dois pedidos seguidos
     * com os mesmos temas dão corpos diferentes. Um ETag tirado do corpo nunca
     * daria 304 nenhum.
     *
     * O que identifica a lista é o que está POR BAIXO das assinaturas: que
     * temas há, com que nome e notas, quantas fotos têm, e QUE ficheiros são a
     * capa e as tiras. É essa a forma que se carimba — os URLs entram nela sem
     * a parte assinada. Acrescentar uma foto, mudar a capa, renomear ou apagar
     * um tema muda o carimbo; voltar a assinar as mesmas fotos não muda.
     */
    const validador = summaries.map((s) => ({
      ...s,
      coverUrl: semAssinatura(s.coverUrl),
      coverFallbackUrl: semAssinatura(s.coverFallbackUrl),
    }));
    return jsonWithEtag(request, summaries, validador);
  } catch (err) {
    const conhecida = avariaConhecida(err);
    // Uma avaria conhecida também vai para os registos: saber que a base esteve
    // em pausa às 14h07 é o que permite saber que não foi outra coisa.
    log.error("temas GET falhou", err, { causa: conhecida?.titulo ?? "desconhecida" });
    return respostaDeAvaria(conhecida ?? avariaDesconhecida(err));
  }
}

/** Cria um tema (só metadados; as fotos entram depois pela rota /imagens). */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  let name = "";
  try {
    const body = await request.json().catch(() => null);
    name = str(body?.name, MAX_THEME_NAME);
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    // Comparação como a equipa lê os nomes — sem acentos nem maiúsculas — para
    // que "Itália" e "Italia" não possam coexistir como temas distintos.
    const existing = await listThemes();
    if (existing.some((t) => normalizedThemeName(t.name) === normalizedThemeName(name))) {
      return NextResponse.json({ error: themeNameTakenError(name) }, { status: 409 });
    }

    // Um tema pode nascer como PERGUNTA GUARDADA: a equipa filtra a biblioteca
    // por etiquetas, gosta do resultado, e dá-lhe um nome. Uma regra que não
    // seja utilizável é recusada em vez de gravada como null — um tema-filtro
    // sem regra mostraria a biblioteca inteira, e ninguém perceberia porquê.
    const regra = lerRegra(body?.filterRule);
    if (body?.filterRule !== undefined && !regra) {
      return NextResponse.json({ error: "Filtro inválido." }, { status: 400 });
    }

    const theme = await createTheme({
      name,
      notes: str(body?.notes, MAX_THEME_NOTES) || undefined,
      ...(regra ? { kind: "filtro" as const, filterRule: regra } : {}),
    });
    return NextResponse.json({ ...theme, imageCount: 0 } satisfies ThemeSummary);
  } catch (err) {
    // Backstop de corrida: entre a verificação acima e o insert, uma criação
    // concorrente pode ter registado o mesmo nome — o índice único
    // (db/schema.sql: proposal_themes_name_uk) fá-lo falhar aqui. É um
    // duplicado (409), não um 500.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: themeNameTakenError(name) }, { status: 409 });
    }
    const conhecida = avariaConhecida(err);
    log.error("temas POST falhou", err, { causa: conhecida?.titulo ?? "desconhecida" });
    if (conhecida) return respostaDeAvaria(conhecida);
    // A criação é uma ESCRITA: aqui a frase não pode prometer que nada mudou.
    return NextResponse.json(
      {
        error:
          "O tema não pôde ser criado e a causa não é uma das conhecidas. Confirma na lista se " +
          `ele chegou a ficar criado antes de voltar a tentar — ${descricaoTecnica(err)}.`,
        titulo: "Falha inesperada ao criar o tema",
      },
      { status: 500 },
    );
  }
}
