import "../../admin.css";
import { Geist } from "next/font/google";
import { normalizeLocale } from "@/lib/i18n";
import { Cortina } from "@/components/Cortina";
import { MarcaDoBackOffice } from "./MarcaDoBackOffice";
import { guiaoDaMarca } from "./guiao-da-marca";
import { cookies } from "next/headers";
import {
  COOKIE_APARENCIA,
  aparenciaValida,
  atributoDaAparencia,
} from "./orcamento/admin/ui/aparencia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LETRA DO BACK OFFICE CARREGA-SE AQUI, E SÓ AQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela escolheu o Geist — a letra da Vercel — a olhar para um produto que a usa,
 * e disse o que queria dela: «este tipo de letra no back office todo». Vem do
 * `next/font/google`, ou seja, é servida desta casa como as outras três: sem
 * dependência nova, sem ida ao Google no browser dela, e sem terceiros a saber
 * que ela abriu o painel.
 *
 * ── PORQUE É QUE O `import` ESTÁ NESTE FICHEIRO E NÃO NA RAIZ ─────────────
 *
 * As outras três famílias são importadas no `layout.tsx` da raiz, que embrulha
 * o sítio inteiro — e o que lá é importado é pré-carregado em TODAS as páginas.
 * Uma letra que só o back office usa, carregada na raiz, seria um ficheiro a
 * mais em cada visita de um casal ao sítio público, no telemóvel, sem nunca
 * chegar a pintar um pixel.
 *
 * Importada aqui, o Next só a pré-carrega nas rotas que passam por este
 * layout. O sítio público não paga nada por uma decisão que é do painel.
 *
 * Variável, sem `weight`: um ficheiro só que já traz os pesos todos. Pinar
 * pesos discretos daria um ficheiro POR PESO — a lição está escrita por
 * extenso no `layout.tsx` da raiz.
 *
 * `display: "swap"` e `adjustFontFallback`, pelo mesmo motivo das outras: o
 * texto aparece já, na letra do sistema, e a troca quase não mexe na linha. Num
 * 4G de quinta, ver a lista de pedidos em Helvetica meio segundo antes é melhor
 * do que ver um rectângulo branco.
 */
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  fallback: [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BACK OFFICE NÃO É UMA PÁGINA DO SÍTIO — E AGORA A ESTRUTURA DI-LO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Achado D-01 de uma auditoria em produção: «durante o arranque vê-se o
 * cabeçalho de marketing — SOBRE / SERVIÇOS / GALERIA / CLIENTES / PT–EN /
 * CONTACTO / PEDIR ORÇAMENTO — sobreposto ao back office, com o logótipo
 * duplicado. Não é só um flash de estilos: fui ao DOM e o `<nav>` do site
 * público está MESMO montado dentro da página de administração.»
 *
 * Estava. O back office vivia dentro do grupo `(site)`, e o layout desse grupo
 * embrulha tudo no `CromadoDoSitio` — barra de navegação, rodapé, botão de
 * WhatsApp, CTA fixo, barra de progresso, transições de página, regras de
 * pré-carregamento, registo do service worker.
 *
 * ── O QUE ESCONDIA O MENU, E PORQUE É QUE ISSO NÃO CHEGAVA ────────────────
 *
 * Uma regra no `globals.css`:
 *
 *     body.admin-mode nav[data-public-nav] { display: none !important }
 *
 * E a classe `admin-mode` só entra num `useEffect`. Ou seja: o servidor
 * desenhava o menu, o browser pintava-o, e só depois de o React hidratar é que
 * ele desaparecia. É o segundo que ela via.
 *
 * Três linhas abaixo dessa regra, no mesmo ficheiro, está a lição já aprendida:
 * o `padding-top` do `<main>` vivia na mesma classe e valia 0,128 de CLS
 * medido — «o back office inteiro saltava para cima, em todas as entradas» —, e
 * a correcção foi tirá-lo do `admin-mode` e pô-lo no HTML do servidor. A casa
 * já sabia o padrão; ao menu é que não o tinha aplicado.
 *
 * ── PORQUÊ UM GRUPO E NÃO UM `if` ────────────────────────────────────────
 *
 * É a regra que o próprio `CromadoDoSitio` escreve: «a única forma de o
 * garantir pela ESTRUTURA — em vez de por um `if` repetido em oito
 * componentes, cada um com a sua hipótese de ficar esquecido — é o cromado
 * viver num ramo por onde essas páginas não passam.»
 *
 * `(admin)` está entre parênteses, portanto NÃO aparece no endereço: o back
 * office continua em `/orcamento/admin`. Verificado na documentação do Next
 * (`route-groups.md`): os grupos são só organização, e a única regra é não
 * haver duas rotas a dar no mesmo caminho — `/orcamento` fica no `(site)`,
 * `/orcamento/admin` fica aqui, e não colidem.
 *
 * Além do menu, saem daqui os 22 pedidos por carregamento a páginas de
 * marketing (achado P-01) — eram os `<Link>` dessa barra a pré-carregarem-se,
 * no telemóvel dela, num 4G de quinta — e os links do sítio público deixam de
 * entrar na ordem de tabulação do teclado dentro do back office.
 *
 * ── E O QUE O BACK OFFICE PERDIA AO SAIR, SE ISTO NÃO EXISTISSE ──────────
 *
 * O `layout.tsx` de `/orcamento` põe um `data-orcamento-mode` SERVIDO PELO
 * SERVIDOR, e o `globals.css` pendura nele três coisas. Duas deixam de fazer
 * falta aqui (esconder o rodapé e o botão de WhatsApp — que já não são
 * montados). A terceira faz: as cores da superfície e do texto.
 *
 * Sem o marcador abaixo, o primeiro desenho do back office usaria o creme do
 * sítio público até a classe `admin-mode` chegar no `useEffect` — ou seja,
 * trocava-se o piscar do menu por um piscar de cor. Seria o mesmo defeito com
 * outra roupa, e é precisamente o que este bloco veio tirar.
 *
 * `data-admin-mode` é o irmão do `data-orcamento-mode`: um atributo no HTML do
 * servidor, que o CSS lê com `body:has(...)` no primeiro pixel. A classe
 * `admin-mode` continua a existir e fica para o que depende mesmo de JS.
 */
/**
 * ── E O `<main>`, QUE VINHA DE CARONA NO CROMADO ───────────────────────────
 *
 * Isto era um `<div>`, e faltava-lhe uma coisa que ninguém tinha reparado que
 * o back office nunca teve por si: o marco `<main>`.
 *
 * Ele vinha do `CromadoDoSitio` — `<main id="conteudo" className="flex-1
 * pt-24">` —, e ao tirar o cromado daqui foi-se com ele. MEDIDO no browser,
 * depois da mudança e antes desta correcção:
 *
 *     document.querySelector("main")            →  null
 *     raiz do back office, topo no ecrã         →  −96 px
 *
 * Duas coisas de uma vez. Um leitor de ecrã deixou de ter para onde saltar; e
 * os 96 px de cima do back office ficaram FORA do ecrã, porque cada raiz do
 * back office trazia um `-mt-24` cujo único trabalho era cancelar o `pt-24`
 * daquele `<main>`. Cancelado o cancelamento, sobrou a subtracção.
 *
 * Foi a suite de telemóvel que apanhou isto — `main li button` deixou de
 * encontrar seja o que for — e é a razão de ela existir.
 *
 * Sem `pt-24`, como no `(privado)/layout.tsx` e no `s/layout.tsx`: aqui não há
 * barra de navegação por cima, e a página começa onde a página começa. Os
 * `-mt-24` das raízes saíram todos no mesmo movimento.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  /*
    ── A APARÊNCIA CHEGA NO HTML, E NÃO NUM `useEffect` ────────────────────

    É a mesma lição que este ficheiro já conta duas vezes, aplicada uma
    terceira. O menu do sítio piscava porque a classe `admin-mode` só entrava
    num `useEffect`; o `padding-top` custava 0,128 de CLS pela mesma razão. A
    cura foi a mesma das duas vezes: pôr no HTML do servidor o que tem de valer
    no primeiro pixel.

    Uma aparência lida do `localStorage` seria exactamente o mesmo defeito com
    outra roupa — e a pior versão dele, porque o que pisca é o ecrã inteiro a
    branco na cara de quem escolheu escuro. Vem de um cookie, que o servidor lê
    aqui, e o CSS encontra o atributo já pintado.

    No automático não há atributo nenhum: o `color-scheme: light dark` do
    `globals.css` deixa o sistema operativo decidir. Ver `ui/aparencia.ts`.
  */
  const aparencia = aparenciaValida((await cookies()).get(COOKIE_APARENCIA)?.value);

  return (
    <main
      id="conteudo"
      data-admin-mode
      data-aparencia={atributoDaAparencia(aparencia)}
      className={`flex-1 ${geist.variable}`}
    >
      {/* A classe `.bo` no <body> antes da primeira pintura (ver MarcaDoBackOffice). */}
      <script dangerouslySetInnerHTML={{ __html: guiaoDaMarca(atributoDaAparencia(aparencia)) }} />
      <MarcaDoBackOffice />
      {/*
        A MESMA CORTINA DA PROPOSTA, À ENTRADA DO BACK OFFICE.

        Palavras dela: «este que aparece quando carregamos no ver proposta,
        aquela parte inicial de animação — eu quero que faças isso quando nós
        entramos também no back office».

        É o mesmo componente e o mesmo lema, de propósito: o estúdio abre o
        dia com a mesma frase com que o casal abre a proposta.

        Com UMA diferença, e é a `chaveDeSessao`. Um casal abre a proposta uma
        vez; ela abre e recarrega isto dezenas de vezes por dia, e um segundo
        de cortina a cada recarga deixava de ser marca e passava a ser um
        imposto sobre o trabalho dela. Assim vê-se uma vez por separador — à
        ENTRADA, que é o que ela pediu — e não outra vez a cada F5.
      */}
      <Cortina locale={normalizeLocale(lang)} chaveDeSessao="cortina:back-office" />
      {children}
    </main>
  );
}
