import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { origensDeImagem } from "./src/lib/csp-imagens";

const nextConfig: NextConfig = {
  // O SELO DE DESENVOLVIMENTO DO NEXT TAPA A NAVEGAÇÃO DO TELEMÓVEL.
  // É um botão fixo no canto inferior esquerdo — exactamente onde vive a barra
  // de baixo do back office. Em `next dev` a 375 px fica por cima do primeiro
  // destino: um toque ali abre o painel do Next em vez de mudar de vista, e o
  // passeio de ergonomia táctil vê o mesmo que um dedo veria (`<nextjs-portal>
  // intercepts pointer events`). Só existe em desenvolvimento — em produção
  // nunca esteve lá —, portanto desligá-lo não muda nada do que é servido.
  devIndicators: false,
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O PACOTE AUTOSSUFICIENTE PASSA A SER PEDIDO, EM VEZ DE SER O NORMAL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O `standalone` empacota um servidor que corre sem o `node_modules`
   * original. Quem precisa dele é o `Dockerfile` — que copia
   * `.next/standalone` — para o site poder correr num contentor, num VPS, no
   * Cloud Run, onde for. **No Vercel nunca serviu para nada**: a plataforma faz
   * o seu próprio empacotamento.
   *
   * ── O QUE ELE CUSTOU, E PORQUE É QUE DEIXA DE ESTAR LIGADO POR OMISSÃO ────
   *
   * A subida do Next para o 16.3 (feita para fechar um aviso CRÍTICO) pôs todos
   * os deploys do Vercel a morrer no fim, depois de compilar e gerar as 106
   * páginas:
   *
   *     Running onBuildComplete from Vercel
   *     > Build error occurred
   *     Error: ENOENT: ... '/vercel/path0/.next/next-server.js.nft.json'
   *
   * Quem falha é o passo do PRÓPRIO Vercel, à procura de um manifesto de
   * tracing do `standalone` que o 16.3 já não escreve onde ele o espera. Aqui e
   * no CI a construção passa e o ficheiro é escrito — é a plataforma e a versão
   * que não se entendem.
   *
   * ── E PORQUE É QUE A CONDIÇÃO NÃO É `process.env.VERCEL` ──────────────────
   *
   * Foi a primeira coisa que tentei: `process.env.VERCEL ? undefined :
   * "standalone"`. Não mudou nada — e a explicação mais provável é que essa
   * variável **só existe se o projecto tiver as variáveis de sistema expostas**,
   * que é uma caixa nas definições da Vercel e não uma garantia. Uma correcção
   * que depende de uma caixa que ninguém se lembra de ter ligado não é uma
   * correcção.
   *
   * Por isso a condição inverte-se: o `standalone` **liga-se a pedido**, com
   * `BUILD_STANDALONE=1`, e quem o pede é o `Dockerfile`, onde a variável está
   * escrita ao lado da razão. O Vercel não pede, e deixa de o receber.
   *
   * Quem construir para um contentor à mão põe a mesma variável — está no
   * README, e o `Dockerfile` fá-lo sozinho.
   */
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // sharp is a NATIVE module used directly in the proposal-PDF route (image
  // cover-crop). Keep it external so it's loaded from node_modules at runtime
  // instead of being bundled — a bundled native binary can fail to load on
  // serverless and throw when the first image is processed.
  //
  // O `pdfjs-dist` é externo por outra razão, e é uma que só se descobre em
  // produção: para LER um PDF, o pdf.js carrega o seu descodificador — o
  // «worker» — com um `import()` calculado em tempo de execução, e cai para
  // uma cópia dentro do mesmo processo quando não há Web Workers, que é o caso
  // do Node. Um `import()` cujo destino não é uma constante não é seguido pelo
  // empacotador: o módulo do worker fica fora do pacote, e o motor que lê as
  // propostas antigas (`src/lib/proposta-de-pdf`) rebentaria na primeira
  // leitura, já implantado, com um ficheiro que não se encontra. Externo, é o
  // Node a resolvê-lo a partir de node_modules, que é onde ele está.
  serverExternalPackages: ["sharp", "pdfjs-dist"],
  images: {
    // O CARREGADOR GLOBAL DO next/image. Toda a imagem que não passe um
    // `loader={…}` próprio deixa de pedir ao optimizador on-demand e passa a
    // apontar para um WebP estático gerado no build — ver
    // src/lib/site-image-loader.ts, que explica o porquê e traz as medições.
    //
    // ISTO DESLIGA O `/_next/image`. Não é um efeito lateral subtil: com
    // `images.loader !== "default"` o servidor responde 404 ao endpoint antes
    // de validar seja o que for (node_modules/next/dist/server/next-server.js:
    // 198). Medido contra este build, com o servidor de produção a correr:
    //   antes -> /_next/image?url=%2Flogo-liquen.png&w=256&q=55  HTTP 200
    //   depois-> o MESMO pedido                                  HTTP 404
    // Portanto NENHUM caminho do código pode voltar a construir um URL
    // `/_next/image` à mão e esperar uma imagem. Já há um sítio assim:
    // src/lib/image-src.ts (`sizedImageSrc`), usado pelo HeroCanvas — está
    // documentado no relatório, degrada sem partir a página (a camada WebGL
    // fica sem textura), mas é dívida a pagar.
    //
    // O `loader={…}` passado como prop CONTINUA a ganhar a este carregador
    // global — `let loader = rest.loader || defaultLoader` em
    // node_modules/next/dist/shared/lib/get-img-props.js:175 —, por isso os
    // heróis (src/components/HeroImage.tsx, escada até 2048) e a galeria
    // (GalleryImage) mantêm os seus intactos. Verificado por medição: o srcset
    // dos heróis continua a apontar para /_img/<chave>-2048.webp.
    loader: "custom",
    loaderFile: "./src/lib/site-image-loader.ts",
    // WebP only — no AVIF. AVIF compresses a few % smaller but o seu encode
    // on-the-fly é várias vezes mais lento, e um encode a frio de vários
    // segundos por imagem é exactamente o que fazia o optimizador esgotar o
    // tempo sob rajada ("às vezes nem carregam"). Depois de encodadas, ambas
    // ficam em cache imutável durante um ano, por isso a diferença de tamanho
    // só custaria ao primeiro visitante — não compensa.
    //
    // NOTA: as 427 miniaturas da galeria já NÃO passam por aqui. São ficheiros
    // WebP estáticos gerados no build (scripts/pregen-gallery.mjs +
    // src/app/[lang]/galeria/gallery-image-loader.ts), precisamente para não
    // dependerem de encode on-demand nenhum. O que resta neste optimizador é a
    // foto do lightbox e as imagens de conteúdo das outras páginas.
    formats: ["image/webp"],
    // NOTA DE 2026-07 (carregador global): esta lista já NÃO tem efeito
    // nenhum sobre o que é servido. Medido: com `loader: "custom"` o
    // `/_next/image` responde 404, portanto o `validateParams` que devolvia o
    // HTTP 400 descrito abaixo nunca chega a correr, e o `findClosestQuality`
    // vive no carregador por omissão, que passou a ser substituído pelo nosso
    // (build/create-compiler-aliases.js:146). O que a lista ainda faz é o aviso
    // de DESENVOLVIMENTO em get-img-props.js:423.
    //
    // FICA COMO ESTÁ, na mesma. Duas razões: é o que volta a mandar no instante
    // em que alguém tirar o `loaderFile` (e nessa altura um valor em falta
    // apaga a imagem em produção, sem aviso); e o teste que a guarda
    // (galeria/next-image-config.test.ts) continua a ser a única coisa que
    // impede um `quality={N}` novo de entrar sem ninguém olhar. Tirá-la seria
    // poupar seis números e reabrir uma armadilha já paga.
    //
    // ESTA LISTA TEM DE CONTER TODOS OS `quality={…}` DO SÍTIO. O optimizador
    // rejeita com HTTP 400 (`"q" parameter (quality) of N is not allowed`)
    // qualquer valor que não esteja aqui — ver
    // node_modules/next/dist/server/image-optimizer.js:635-643. Só se avisa em
    // DESENVOLVIMENTO (um warnOnce na consola); em produção a imagem
    // simplesmente nunca carrega, sempre, sistematicamente. Faltavam dois
    // valores que o código usa mesmo: 55 (o logótipo do Navbar, em todas as
    // páginas do sítio) e 70 (a página de confirmação de orçamento).
    //
    // 82 saiu: nenhum `quality={82}` existe no código (os heróis são servidos
    // por ficheiros pré-gerados a 75, ver scripts/pregen-heroes.mjs), e um
    // valor a mais aqui é só mais uma família de chaves de cache que ninguém
    // pede. 65 fica para o caminho de recurso da galeria.
    //
    // Ao mexer nesta lista: `npx tsx`-nada, basta
    // `grep -rho 'quality={[0-9]*}' src/ | sort -u`.
    qualities: [50, 55, 65, 70, 72, 75],
    // Tecto em 1920 — o mesmo que estava em produção.
    //
    // Esteve aqui um 2048 com um comentário a dizer que "baixámos de 2560";
    // 2560 nunca esteve na configuração publicada, por isso na prática o 2048
    // SUBIA o tecto. Medido, fazia o lightbox pedir w=2048 a 250,0 KB por foto
    // (a largura mais cara de toda a matriz) em portáteis 2x, para uma
    // diferença que ninguém vê numa foto em object-contain.
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31_536_000,
    // Serve images inline instead of as attachment downloads
    contentDispositionType: "inline",
  },

  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,

  /**
   * O BANNER DOS EMAILS TEM DE CHEGAR AO SERVIDOR, NÃO À CDN.
   *
   * `public/` é servido como ficheiro estático — vai para a CDN e NÃO entra, por
   * omissão, no rastreio de ficheiros que acompanha as rotas de servidor. A
   * assinatura dos emails (`src/lib/email-assinatura.ts`) LÊ o banner do disco
   * para o mandar como anexo `cid:`, porque uma imagem remota num email parte-se
   * (ver a nota longa no `email-logo.ts`). Sem esta linha, o ficheiro existe no
   * repositório, existe no site, e não existe onde é preciso: o `readFileSync`
   * falha em produção, a assinatura sai sem banner e nada o denuncia.
   *
   * A chave é um glob de ROTA e o valor um caminho a partir da raiz do projecto.
   *
   * E é `/**`, não `/*`. O glob é avaliado com picomatch, onde um `*` NÃO
   * atravessa barras — medido nesta árvore, `/*` não apanha uma única rota
   * destas:
   *
   *     /*   → /api/orcamento  não · /api/inbox/reply  não
   *              /api/orcamento/[id]/proposta  não · .../fatura  não
   *     /**  → todas SIM
   *
   * Com `/*` o resultado seria o próprio defeito que este bloco existe para
   * evitar, e da pior maneira: silencioso. O `public/email/` não entrava no
   * pacote, o `readFileSync` falhava, e a assinatura saía sem banner sem
   * ninguém dar por isso — porque o ficheiro está no repositório e o site
   * mostra-o na mesma.
   */
  outputFileTracingIncludes: {
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O BINÁRIO DO `sharp` TEM DE VIAJAR COM A FUNÇÃO — não viajava
     * ══════════════════════════════════════════════════════════════════════
     *
     * Em produção, o back office deixou de conseguir listar os TEMAS. O que os
     * registos do Vercel diziam não era um erro de base de dados nenhum:
     *
     *   Failed to handle /api/temas
     *   Error: Could not load the "sharp" module using the linux-x64 runtime
     *   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object
     *   file: No such file or directory
     *
     * Ou seja: a função rebentava INTEIRA (`FUNCTION_INVOCATION_FAILED`) antes
     * de chegar ao código da rota — e é por isso que o ecrã não conseguia
     * dizer o que se passava, e que a lista aparecia vazia como se os temas
     * dela tivessem desaparecido. Não tinham.
     *
     * E a rota dos temas nem sequer usa `sharp`: o empacotador junta rotas em
     * pedaços partilhados, e basta que o pedaço onde ela caiu referencie o
     * módulo para o carregamento ser tentado.
     *
     * ── PORQUE É QUE FALTAVA ─────────────────────────────────────────────
     * O `sharp` está em `serverExternalPackages` (ver acima, com a razão): não
     * é empacotado, é carregado de `node_modules` em tempo de execução. Quem
     * decide então o que vai dentro da função é o rastreador de ficheiros, que
     * segue `import`/`require` — e o `.so` do libvips não é importado por
     * ninguém: é aberto por `dlopen` a partir do binário, já em execução. O
     * rastreador não tem como o ver, e deixava-o para trás.
     *
     * As duas linhas abaixo são os dois pacotes que compõem o `sharp` no
     * Linux x64 (o alvo do Vercel): o vínculo Node e a biblioteca nativa que
     * ele abre. Com `/**` porque o pedaço partilhado pode cair em qualquer
     * rota — foi precisamente o que aconteceu com `/api/temas`.
     */
    /**
     * ── PORQUE É QUE A CHAVE DEIXOU DE SER `"/**"` ────────────────────────
     *
     * Era `"/**"`, e a razão era boa: a avaria dos temas foi real e a resposta
     * segura era «vai para todas». O que ninguém reviu depois foi o preço.
     *
     * MEDIDO, e pela primeira vez, com a rede nova do `peso-das-rotas.mjs`:
     *
     *     135 de 135 rotas carregavam as bibliotecas de imagem;
     *      31 podiam usá-las.
     *
     * O `favicon.ico` levava 17,8 MB de `libvips` sem ter um único `require`
     * que lá chegasse. E a proposta que o casal abre era uma das 104 que
     * pagavam sem usar: 8,77 MB comprimidos para a plataforma ir buscar e
     * descomprimir antes de a função escrever o primeiro byte, contra 1,02 MB
     * sem elas. É 8,6× menos artefacto, e é a maior parcela isolada do ecrã
     * branco de que ela se queixou ao abrir a proposta do email.
     *
     * `"/api/**"` e não `"/api/*"`: MEDIDO com o próprio picomatch do Next, o
     * segundo não casa com `/api/temas/[id]/imagens`. É a mesma armadilha de
     * uma estrela que este ficheiro já documenta em cima.
     *
     * ── O QUE IMPEDE ISTO DE VOLTAR A PARTIR OS TEMAS ─────────────────────
     *
     * Não é a atenção de ninguém: é o `scripts/peso-das-rotas.mjs`, que corre
     * depois do build e é bloqueante no CI. Ele lê o rastreio que o build
     * escreve por rota e reprova se alguma rota trouxer o `sharp` SEM o
     * vínculo nativo e o `libvips` — que é, exactamente, a avaria dos temas.
     * A regra existia na cabeça de quem escreveu esta chave; agora existe no
     * CI.
     */
    /**
     * As imagens do rodapé dos emails FICAM na chave larga, e de propósito.
     *
     * Hoje todas as rotas que enviam email estão debaixo de `/api` — verifiquei
     * uma a uma. Mas são 19 KB, e o modo de falhar delas é o pior que há: o
     * `readFileSync` do `email-assinatura.ts` rebenta, a assinatura sai sem
     * banner, e ninguém dá por isso porque o ficheiro está no repositório e o
     * sítio mostra-o na mesma. Dezanove kilobytes não valem um risco desses.
     */
    "/**": ["public/email/**/*"],
    "/api/**": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * E O QUE NÃO VAI: OS OUTROS `sharp`, QUE NUNCA CORREM AQUI
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela sobre a proposta que chega ao casal: «quero mesmo tudo super
   * rápido».
   *
   * O `sharp` traz um pacote por plataforma, e o rastreador não sabe qual é a
   * que vai correr — pode levá-los todos. MEDIDO neste repositório:
   *
   *   @img/sharp-libvips-linuxmusl-x64   18 MB
   *   @img/sharp-wasm32                 8,7 MB
   *   @img/sharp-linuxmusl-x64          324 KB
   *   ────────────────────────────────────────
   *                                      27 MB
   *
   * Vinte e sete megabytes por FUNÇÃO. Um pacote maior é um arranque a frio
   * mais longo — é o ficheiro a ser descomprimido antes de a primeira linha
   * correr —, e o arranque a frio é exactamente o que o casal paga ao carregar
   * num link do email três dias depois do envio.
   *
   * ── PORQUE É QUE SE PODE MESMO DEITAR FORA ────────────────────────────────
   *
   * `linuxmusl` é para Alpine; `wasm32` é o recurso para quando não há binário
   * nativo nenhum. O alvo aqui é Linux x64 com glibc, e essa decisão não é
   * nova: as duas linhas de cima, no `outputFileTracingIncludes`, já nomeiam
   * `linux-x64` e só esse — foram escritas em resposta a uma avaria REAL em
   * produção (`Could not load the "sharp" module`), e desde então é o único
   * par que se garante. Isto é a outra metade da mesma decisão, dita em voz
   * alta em vez de ficar por dizer.
   *
   * ── E O CUIDADO QUE ISTO EXIGE ───────────────────────────────────────────
   *
   * As exclusões correm DEPOIS das inclusões. Uma exclusão escrita larga de
   * mais engolia o `sharp-linux-x64` que a linha de cima acabou de garantir, e
   * o resultado seria a mesma função a rebentar inteira antes de chegar ao
   * código da rota — a avaria que já custou a lista dos temas dela. Repare-se
   * que `sharp-linux-x64` e `sharp-linuxmusl-x64` são nomes diferentes e
   * nenhum é prefixo do outro: é isso que faz estes padrões não se tocarem, e
   * é isso que o `tracing-do-sharp.test.ts` verifica a cada corrida.
   */
  /**
   * ── TIREI DUAS DESTAS LINHAS E O CI DEVOLVEU-MAS, COM RAZÃO ─────────────
   *
   * A subida do `sharp` 0.35.3 → 0.35.4 pôs o `tracing-do-sharp.test.ts`
   * vermelho a dizer que as exclusões de Alpine «não apontam para nada». E era
   * verdade — NESTA MÁQUINA. O 0.35.4 passou a marcar as variantes com a
   * plataforma a que servem e o npm deixou de as instalar num Linux de glibc.
   * Concluí que eram linhas mortas e tirei-as.
   *
   * O passo «Peso das rotas» do CI apanhou-me na volta seguinte:
   *
   *     104 de 135 rotas carregam as bibliotecas de imagem
   *     75 rotas levam ~17,8 MB que não têm como usar
   *     api/proposta/[token]/pdf/route.js → sharp-linuxmusl-x64, …
   *
   * Nas máquinas que CONSTROEM, os pacotes de Alpine são instalados. O meu
   * `node_modules` não é a instalação que conta, e a lição fica escrita: uma
   * exclusão de plataforma julga-se pelo que o BUILD instala, não pelo que
   * está no disco de quem escreve o código.
   *
   * (O guarda foi corrigido ao mesmo tempo: passou a validar os nomes contra
   * as `optionalDependencies` do próprio `sharp`, que existem em qualquer
   * máquina, em vez de exigir que a pasta esteja instalada nesta.)
   *
   * ── E PORQUE É QUE SE PODE MESMO DEITAR FORA ────────────────────────────
   *
   * `linuxmusl` é para Alpine; `wasm32` é o recurso para quando não há binário
   * nativo nenhum. O alvo aqui é Linux x64 com glibc. E repare-se que
   * `sharp-linux-x64` e `sharp-linuxmusl-x64` são nomes diferentes e nenhum é
   * prefixo do outro no caminho: é isso que faz estes padrões não engolirem o
   * binário que corre mesmo, e é isso que o `tracing-do-sharp` verifica.
   */
  outputFileTracingExcludes: {
    "/**": [
      // ── TRÊS NOMES PARA O `wasm32`, E NENHUM DELES É DE MAIS ───────────
      //
      // O `sharp` 0.35.4 deixou de declarar o `@img/sharp-wasm32` e passou a
      // declarar os outros dois. Tirei o velho por isso — e o CI devolveu-mo
      // na volta seguinte, com as rotas todas a levá-lo outra vez:
      //
      //     api/proposta/[token]/pdf/route.js → sharp-wasm32
      //
      // Porque ele CONTINUA no `package-lock.json`, sobra da versão anterior
      // que o npm não limpou. E é o `package-lock.json` que decide o que uma
      // máquina de construção instala — não o que o `sharp` declara hoje, nem
      // o que está no disco de quem escreve o código.
      //
      // Os dois nomes NOVOS não entram aqui, e é de propósito: o
      // `sharp-webcontainers-wasm32` declara `cpu: ["wasm32"]` e o
      // `sharp-freebsd-wasm32` declara `os: ["freebsd"]`, portanto nenhum é
      // instalado num Linux x64. Excluí-los seria a linha morta ao contrário.
      //
      // Limpar a sobra do lockfile é outro trabalho; enquanto ela lá estiver,
      // tem de estar aqui.
      "./node_modules/@img/sharp-wasm32/**/*",
      "./node_modules/@img/sharp-linuxmusl-x64/**/*",
      "./node_modules/@img/sharp-libvips-linuxmusl-x64/**/*",
    ],
  },

  experimental: {
    /**
     * O 404 DO SÍTIO, COM ESTADO 404 (auditoria externa, S5/C3). Ver
     * src/app/global-not-found.tsx: o layout de raiz vive num segmento
     * dinâmico (`app/[lang]/layout.tsx`), que é exactamente o caso para o qual
     * a documentação do Next aponta este ficheiro.
     */
    globalNotFound: true,
    /**
     * ════════════════════════════════════════════════════════════════════
     * O CSS VIAJA COM O HTML — E É ISTO QUE TIRA O ECRÃ EM BRANCO
     * ════════════════════════════════════════════════════════════════════
     *
     * Palavras dela, sobre carregar no botão do email: «aquela tela está em
     * branco e só aparece passado um bocado — isso desconfia logo das
     * pessoas».
     *
     * A causa, MEDIDA e não suposta. O browser não pinta NADA enquanto uma
     * folha de estilos do `<head>` não chegar — é a regra dele, não uma
     * opção nossa. E a nossa era um segundo pedido, de 34 KB comprimidos,
     * que só começa depois de o HTML já estar a chegar.
     *
     * Provado num Chromium: atrasei a folha 600 ms e a cortina atrasou 609;
     * atrasei 1500 e atrasou 1478. Segue o CSS, segue a pintura.
     *
     * Com a rede travada a 4G fraco (1,2 Mbps, 300 ms de latência), o tempo
     * até a cortina aparecer, três voltas cada:
     *
     *                        ANTES        DEPOIS
     *     proposta          1434 ms       613 ms
     *     sítio (home)      2146 ms       950 ms
     *
     * ── O QUE CUSTA, PORQUE CUSTA MESMO ──────────────────────────────────
     *
     * O HTML da proposta passa de 11 KB (mais 34 KB num segundo pedido) para
     * 83 KB. São ~38 KB a mais no total, e a razão está nos documentos do
     * Next: com esta opção o CSS vai duas vezes — uma no `<style>` e outra na
     * carga do React. É uma limitação conhecida, não um erro nosso.
     *
     * Vale a pena à mesma, e a medição diz porquê: numa ligação lenta o que
     * manda é a ida e volta, não os bytes. Poupar um pedido inteiro paga os
     * 38 KB com folga — o número de cima já os inclui.
     *
     * Quem perde são os visitantes que voltam com a folha em cache. É uma
     * troca real, e foi feita de olhos abertos: um casal abre a proposta uma
     * vez, do email, no telemóvel, numa quinta. É esse que não pode ver
     * branco.
     *
     * ── E A POLÍTICA DE SEGURANÇA JÁ O PERMITE ───────────────────────────
     *
     * `style-src 'self' 'unsafe-inline'`, aqui em baixo. Verificado antes de
     * ligar isto: sem essa linha, os estilos seriam bloqueados e a página
     * saía sem desenho nenhum.
     */
    inlineCss: true,
    /* ── A BANDEIRA DAS TRANSIÇÕES DE VISTA SAIU, E NÃO FOI POR GOSTO ────
     *
     * Estava aqui `viewTransition: true`, e a subida do Next 16.2.11 → 16.3.4
     * parou o build:
     *
     *     next.config.ts: error TS2353: 'viewTransition' does not exist in
     *     type 'ExperimentalConfig'
     *
     * Fui ao guia que veio dentro da versão nova — `node_modules/next/dist/
     * docs/01-app/02-guides/view-transitions.md` — e a frase é esta: «View
     * transitions work in the App Router with no configuration».
     *
     * A chave não foi renomeada nem a funcionalidade removida: ela GRADUOU-SE,
     * e a bandeira deixou de existir porque já não é precisa. As transições
     * continuam a funcionar exactamente como funcionavam.
     */
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== "production";

    // Plausible (optional analytics) is the only third party the BROWSER talks
    // to. Derive its exact origin from the script src so a self-hosted instance
    // is covered too — mirrors Analytics.tsx. Empty when analytics is disabled,
    // so the CSP stays tight by default (no analytics env = no extra surface).
    let plausibleOrigin = "";
    if (process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN) {
      try {
        plausibleOrigin = new URL(
          process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.js",
        ).origin;
      } catch {
        plausibleOrigin = "https://plausible.io";
      }
    }
    const plausible = plausibleOrigin ? ` ${plausibleOrigin}` : "";

    // Google tag (gtag.js) for Google Ads conversion measurement + remarketing
    // (see GoogleTag.tsx / Consent Mode). These are the hosts the browser talks
    // to once the tag is active: the loader (googletagmanager.com), the pixel/
    // beacon endpoints (google-analytics + doubleclick + googleadservices), and
    // the conversion-linker iframe (td.doubleclick.net). Kept as tight as the
    // ad stack allows — no wildcards beyond the analytics beacon regions.
    const gaScript = " https://www.googletagmanager.com";
    const gaImg =
      " https://www.googletagmanager.com https://www.google.com https://www.google.pt https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com";
    const gaConnect =
      " https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.google.com https://pagead2.googlesyndication.com";
    const gaFrame = "https://td.doubleclick.net https://www.googletagmanager.com";

    // ── Meta (Instagram/Facebook) ────────────────────────────────────────
    // Só abre quando NEXT_PUBLIC_META_PIXEL_ID está definido: sem pixel
    // configurado a política fica exactamente como estava, sem hosts a mais.
    //
    // Três hosts, e só três:
    //   connect.facebook.net  o `fbevents.js` (script);
    //   www.facebook.com      o beacon `/tr` (imagem E fetch — o pixel usa os
    //                         dois consoante o browser, por isso vai a img-src
    //                         e a connect-src);
    //   graph.facebook.com    NÃO entra. A Conversions API é chamada pelo
    //                         SERVIDOR (src/lib/meta/capi.ts), portanto o
    //                         browser nunca lhe toca e pô-la aqui seria abrir
    //                         uma porta que ninguém usa.
    const temMeta = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
    const metaScript = temMeta ? " https://connect.facebook.net" : "";
    const metaImg = temMeta ? " https://www.facebook.com" : "";
    const metaConnect = temMeta ? " https://www.facebook.com" : "";

    /**
     * ══════════════════════════════════════════════════════════════════════
     * AS FOTOGRAFIAS DOS MOOD BOARDS DESAPARECERAM TODAS — ERA ESTA LINHA
     * ══════════════════════════════════════════════════════════════════════
     *
     * Todas as fotos do estúdio de propostas são `<img>` apontados a URLs
     * assinados do Storage do Supabase. O browser só as vai buscar se a
     * `img-src` NOMEAR essa origem — e quando não nomeia não há pedido
     * nenhum: nem código de estado, nem registo no servidor, nem sequer uma
     * entrada no painel de rede. Só a célula a dizer «Imagem guardada / Não
     * consegui mostrá-la neste ecrã». Em TODAS as células, porque o que
     * falha não é a fotografia: é a política.
     *
     * O QUE ESTAVA AQUI derivava a origem do ambiente e, quando não a
     * encontrava, escrevia `""` — uma política sintacticamente perfeita que
     * apaga o produto inteiro, em silêncio.
     *
     * E o momento em que isto é lido é o que fecha a armadilha: o
     * `headers()` corre UMA VEZ, no build, e o resultado vai inteiro para o
     * `.next/routes-manifest.json`, que é de onde a política é servida
     * depois. MEDIDO no build que estava nesta árvore:
     *
     *     img-src 'self' data: blob: https://www.googletagmanager.com …
     *
     * — sem uma única origem do Supabase. Um build sem `SUPABASE_URL` no
     * ambiente publica um sítio onde nenhuma fotografia de proposta aparece,
     * com o Storage, as assinaturas e o servidor todos impecáveis. O
     * `Dockerfile` deste repositório é esse caso: a etapa `builder` corre
     * `npm run build` sem receber variável nenhuma.
     *
     * A regra — e o curinga de recurso, que é o que impede o silêncio — vive
     * em `src/lib/csp-imagens.ts`, para o diagnóstico de fotografias
     * (`/api/admin/fotos-diagnostico`) responder sobre a MESMA política que é
     * servida, e não sobre uma cópia dela.
     */
    const imagens = origensDeImagem(process.env);
    const imgExtra = ` ${imagens.origens.join(" ")}`;
    if (imagens.usouCuringa) {
      // Dito ao build, uma vez, e com o nome da variável em falta: um build
      // que degrada em silêncio é como esta avaria chegou à produção.
      console.warn(
        "[csp] Sem SUPABASE_URL no ambiente do build: a img-src fica com " +
          `${imagens.origens.join(" ")} em vez da origem exacta do Storage. ` +
          "Define SUPABASE_URL no ambiente de BUILD (não só no de execução).",
      );
    }

    // Browser-side connections. Everything third-party runs SERVER-side with
    // non-public env (Supabase service key, Sentry DSN, Slack/Discord webhooks),
    // so the browser never opens those sockets — connect-src doesn't need them.
    // Web Push uses the ServiceWorker/PushManager (not fetch) and posts the
    // subscription same-origin. So production only needs 'self' plus Plausible's
    // event beacon (when enabled); dev keeps ws/https open for HMR.
    const connectSrc = isDev
      ? "connect-src 'self' https: wss: ws:"
      : `connect-src 'self'${plausible}${gaConnect}${metaConnect}`;

    // Content-Security-Policy.
    //
    // O `script-src 'unsafe-inline'` FICA, e não é por preguiça — é medido. A
    // tentação óbvia é passar a uma política com nonce emitido no proxy
    // (src/proxy.ts), como o guia do Next descreve em
    // node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
    // NESTE SÍTIO ISSO DEITA A CASA ABAIXO, e da pior maneira: em silêncio.
    //
    // A razão está escrita no próprio guia (secção "How nonces work in
    // Next.js"): o nonce é aplicado DURANTE A RENDERIZAÇÃO, a partir do
    // cabeçalho CSP do pedido. Ora quase todas as páginas deste sítio são
    // pré-renderizadas no build (`●` no mapa do `next build`: /, /galeria,
    // /servicos, /sobre, …) e servidas da cache de prerender — `curl -I`
    // devolve `x-nextjs-cache: HIT`. Não há pedido nenhum no momento em que o
    // HTML é gerado, portanto não há nonce nenhum para lá pôr.
    //
    // MEDIDO: com `script-src 'self' 'nonce-…' 'strict-dynamic'` no proxy e o
    // servidor de produção a correr, o Chromium a abrir /galeria dá
    //   • 43 <script> no HTML, 0 com nonce;
    //   • 42 violações de CSP na consola;
    //   • `'strict-dynamic'` faz o browser IGNORAR o `'self'`, por isso até os
    //     /_next/static/chunks/*.js são recusados → a hidratação nunca acontece;
    //   • e `history.scrollRestoration` fica em "auto" em vez de "manual",
    //     ou seja o restauro da posição da galeria morre — exactamente o
    //     sintoma silencioso de que a nota em galeria/page.tsx avisa.
    // A página continua a PARECER bem (o HTML estático desenha-se todo), e
    // nenhum teste de unidade dá erro. É por isso que existe o teste de
    // contrato em src/csp-nonce-contract.test.ts: ele prende a invariante
    // "se a política tiver nonce, o script da galeria tem de o receber".
    //
    // O que seria preciso para a mudança ser segura (nenhum destes passos cabe
    // neste ficheiro, e dois deles ficam fora da pasta que esta auditoria pode
    // tocar): (1) pôr todas as páginas em renderização dinâmica — o que troca
    // o HTML pronto no CDN por um render por visitante, o oposto de tudo o que
    // está optimizado neste repositório; (2) passar `nonce={…}` ao <script> de
    // galeria/page.tsx — MEDIDO: o React NÃO propaga o nonce para um
    // `dangerouslySetInnerHTML` escrito pela aplicação, só para os scripts do
    // próprio Next; (3) o mesmo em SpeculationRules.tsx e GoogleTag.tsx, que
    // sem nonce dão as 2 violações que sobram até nas rotas já dinâmicas.
    //
    // O resto da política — object-src, base-uri, frame-ancestors, form-action,
    // connect-src apertado — está fechado, e é aí que está o valor real.
    // 'unsafe-eval' é só de desenvolvimento (React refresh).
    //
    // `frame-ancestors`: quem pode mostrar este sítio dentro de um <iframe>.
    // Além do próprio, só o site do estúdio que o fez (palumen.com), que mostra
    // a Líquen a funcionar dentro de um portátil no caso de estudo — com
    // autorização da dona, a 21/10. Só as páginas públicas: o back office e a
    // API ficam com 'self' (regra `cspFechada`, mais abaixo). Os cookies de
    // sessão são `SameSite=Lax`, por isso num iframe de outro domínio nem há
    // sessão. O `X-Frame-Options: SAMEORIGIN` fica para browsers antigos; os
    // actuais ignoram-no quando há `frame-ancestors`.
    const politica = (ancestrais: string) =>
      [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${plausible}${gaScript}${metaScript}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob:${imgExtra}${gaImg}${metaImg}`,
        "font-src 'self' data:",
        // Os vídeos da entrada: cada take seguinte é descarregado inteiro e tocado
        // da memória (`blob:`), para a rede não o fazer parar a meio — pedido dela
        // a 16/10, num iPhone em 4G. Ver `EntradaEmVideo.tsx`. Sem esta linha, o
        // `default-src 'self'` recusava o `blob:` e o vídeo voltava a tocar da rede.
        "media-src 'self' blob:",
        connectSrc,
        "worker-src 'self'",
        "manifest-src 'self'",
        `frame-src 'self' ${gaFrame}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        `frame-ancestors ${ancestrais}`,
        "upgrade-insecure-requests",
        // report-to is the modern reporting directive (Reporting API v1); report-uri
        // is kept as the fallback for browsers that don't yet honour report-to. Both
        // point at the same collector endpoint.
        "report-to csp-endpoint",
        "report-uri /api/security/csp-report",
      ].join("; ");
    const csp = politica("'self' https://palumen.com https://www.palumen.com");
    const cspFechada = politica("'self'");

    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      // Named endpoint referenced by the CSP `report-to` directive above.
      {
        key: "Reporting-Endpoints",
        value: 'csp-endpoint="/api/security/csp-report"',
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        // Permissions-Policy.
        //
        // O `interest-cohort=()` que aqui estava sozinho JÁ NÃO PROTEGE NADA. O
        // FLoC foi retirado do Chrome em 2022; o nome continua a ser aceite pelo
        // analisador (por isso não dá erro nenhum na consola e parece que está a
        // funcionar), mas a funcionalidade que ele desligava deixou de existir.
        // Quem lhe sucedeu é a Topics API — `browsing-topics` —, e essa estava
        // aberta de par em par.
        //
        // MEDIDO neste build, com o servidor de produção a correr e o Chromium a
        // abrir /galeria (document.featurePolicy.allowsFeature):
        //   browsing-topics  -> true   (permitido!)
        //   interest-cohort  -> false  (mas é um nome morto)
        //   payment/usb/serial/hid/midi -> todos permitidos
        // Ou seja: a intenção de "não perfilar os visitantes por interesses",
        // escrita aqui em 2021, tinha deixado de ser cumprida — e este sítio
        // carrega mesmo a pilha de anúncios da Google (googletagmanager,
        // doubleclick, googleadservices), que é quem lê a Topics API.
        //
        // O QUE FICA DE FORA, DE PROPÓSITO: `join-ad-interest-group`,
        // `run-ad-auction` e `attribution-reporting`. São as APIs que sustentam
        // o REMARKETING e a MEDIÇÃO DE CONVERSÕES do Google Ads — isto é, uma
        // funcionalidade de negócio que a dona acrescentou de propósito (ver o
        // comentário do gtag mais acima). Desligá-las seria uma decisão
        // comercial, não uma correcção de segurança, por isso não é feita aqui.
        //
        // As restantes são capacidades que o sítio comprovadamente nunca usa
        // (não há `requestFullscreen`, nem Web USB/Serial/HID/MIDI/Bluetooth
        // em lado nenhum do código) — `(self)` em vez de `()` no fullscreen só
        // para não amarrar o lightbox da galeria. O `autoplay=(self)` é preciso
        // DE VERDADE desde 15/10: os vídeos da entrada (EntradaEmVideo) tocam
        // sozinhos, mudos, e são servidos pelo próprio sítio.
        key: "Permissions-Policy",
        value: [
          "accelerometer=()",
          "autoplay=(self)",
          // `bluetooth` NÃO entra: o Chromium ainda não a reconhece como
          // funcionalidade de Permissions-Policy e responde com
          // "Error with Permissions-Policy header: Unrecognized feature:
          // 'bluetooth'" na consola de TODAS as páginas (medido). Um aviso
          // permanente na consola é ruído que esconde os avisos verdadeiros, e
          // a Web Bluetooth já exige gesto do utilizador e contexto seguro.
          "browsing-topics=()",
          "camera=()",
          "display-capture=()",
          "fullscreen=(self)",
          "geolocation=()",
          "gyroscope=()",
          "hid=()",
          "idle-detection=()",
          "interest-cohort=()",
          "local-fonts=()",
          "magnetometer=()",
          "microphone=()",
          "midi=()",
          "payment=()",
          "screen-wake-lock=()",
          "serial=()",
          "usb=()",
          "xr-spatial-tracking=()",
        ].join(", "),
      },
      // Isolate the browsing context and block legacy cross-domain policy files.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-site" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      // O back office e a API não se mostram num iframe de fora. Esta regra vem
      // depois da geral, por isso a CSP daqui substitui a de cima.
      ...[
        "/admin",
        "/orcamento/admin",
        "/orcamento/admin/:path*",
        "/:lang/orcamento/admin",
        "/:lang/orcamento/admin/:path*",
        "/api/:path*",
      ].map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: cspFechada }],
      })),
      {
        source: "/imagens/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Os vídeos da entrada (public/videos/entrada/v6). A pasta tem versão:
        // um vídeo novo vai para `v7`, nunca por cima, portanto um ano é seguro.
        // Sem isto eram servidos com `max-age=0` e o browser revalidava-os em
        // cada visita — ~14 MB a pedir licença outra vez.
        source: "/videos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/logos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Imagens pré-geradas no build: as capas de página (scripts/pregen-
        // heroes.mjs) e as 2 135 miniaturas da galeria (scripts/pregen-
        // gallery.mjs).
        //
        // SEM ISTO SÃO 427 IDAS AO SERVIDOR POR VISITA REPETIDA. Ficheiros em
        // public/ são servidos com `Cache-Control: public, max-age=0`
        // (verificado com `curl -I` contra o build de produção), ou seja o
        // browser revalida CADA UM em cada visita. Com as miniaturas da galeria
        // a virem daqui, isso passaria a ser uma tempestade de pedidos
        // condicionais numa página com 427 fotos — e o que se ganhou em tirar o
        // optimizador do caminho perdia-se outra vez em latência.
        //
        // `immutable` por um ano é a mesma política que /imagens já tem, e pela
        // mesma razão: os nomes não têm hash, portanto substituir uma foto
        // implica um nome novo. Como estes ficheiros DERIVAM de /imagens (que
        // já é imutável), não se acrescenta risco nenhum.
        source: "/_img/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Root-level static assets fetched on effectively every visit/crawl but
        // NOT served through /_next/image (so they miss minimumCacheTTL) and NOT
        // under /imagens or /logos: the PWA manifest icons and the social OG
        // image. With output:standalone (self-hosted, no platform CDN backfill)
        // these otherwise revalidate on every request. Hashless filenames, but
        // they only change on a deploy, so a long immutable TTL is safe.
        source: "/:file(og-liquen.jpg|icon-192.png|icon-512.png|icon-maskable-512.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },

  async redirects() {
    // Legacy URLs from the previous (Wix) site that Google still has indexed →
    // the equivalent page on the rebuilt site, so old search results and
    // bookmarks land on real content instead of a 404, and Google transfers the
    // old pages' ranking onto the new URLs. permanent → 308 (Google treats it
    // like a 301). Both the decoded and %-encoded forms of the accented paths
    // are listed because the incoming pathname can arrive either way.
    const APEX = "https://liquen-events.com";
    return [
      { source: "/eventos", destination: `${APEX}/servicos`, permanent: true },
      { source: "/serviços", destination: `${APEX}/servicos`, permanent: true },
      { source: "/servi%C3%A7os", destination: `${APEX}/servicos`, permanent: true },
      { source: "/contactos", destination: `${APEX}/contacto`, permanent: true },
      { source: "/portfólio-de-eventos", destination: `${APEX}/galeria`, permanent: true },
      { source: "/portf%C3%B3lio-de-eventos", destination: `${APEX}/galeria`, permanent: true },
      // Safety net: once www.liquen-events.com's DNS points here, forward every
      // remaining www request to the same path on the canonical apex host (the
      // one the whole site treats as canonical, SITE.url). Vercel's own domain
      // redirect normally covers this too — this just guarantees it in code.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.liquen-events.com" }],
        destination: `${APEX}/:path*`,
        permanent: true,
      },
    ];
  },
};

// Bundle analyzer.
//
// ATENÇÃO: `npm run analyze` NÃO produz relatório nenhum neste projecto. O
// @next/bundle-analyzer é um plugin de webpack e o `next build` do Next 16 usa
// Turbopack; o próprio build avisa "The Next Bundle Analyzer is not compatible
// with Turbopack builds, no report will be generated" — mas sai com código 0, o
// que faz o comando parecer bem-sucedido.
//
// Para ver o peso dos chunks a sério, uma destas duas:
//   • `npx next experimental-analyze` — o analisador do Turbopack (verificado:
//     corre e serve o relatório em http://127.0.0.1:4000);
//   • `next build --webpack`, que reactiva este plugin (build mais lento e não
//     é o que a produção usa, por isso os números afastam-se um pouco).
//
// O wrapper fica: é inerte quando ANALYZE não está definido e volta a funcionar
// se algum dia se voltar ao webpack.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
