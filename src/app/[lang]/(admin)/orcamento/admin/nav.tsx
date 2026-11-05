import type { ReactNode } from "react";

/**
 * Back-office navigation model — the mutually-exclusive top-level views (their
 * ids double as deep-link anchors) and the sidebar / bottom-bar entries with
 * their inline icons. Extracted from AdminClient so the container isn't padded
 * with ~180 lines of SVG.
 */
export type View =
  | "overview"
  | "pedidos"
  | "kanban"
  | "clientes"
  | "calendario"
  | "propostas"
  | "pagamentos"
  | "acompanhamento"
  | "fazer-proposta"
  | "guioes"
  | "mesas"
  | "tarefas"
  | "fornecedores"
  | "inventario"
  | "material"
  | "temas"
  | "estatisticas"
  | "contratos"
  | "modelos-email"
  | "definicoes"
  | "servicos"
  | "reciclagem";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS VISTAS COMO VALOR, PARA SE PODEREM VALIDAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O tipo acima desaparece na compilação, e quem precisa de decidir se
 * `"pedidos"` é uma vista precisa de o saber em TEMPO DE EXECUÇÃO: o endereço
 * (`?v=…`) e o cookie são ambos escritos pelo browser e podem vir com o que lá
 * puserem.
 *
 * Até agora essa pergunta respondia-se com `NAV.some((n) => n.id === x)` — e a
 * resposta estava errada por construção. O comentário do `NAV` aqui em baixo
 * di-lo com todas as letras: **várias vistas existem no tipo e desenham-se, mas
 * ficam de fora do `NAV` de propósito**, para não encher o menu. Validar contra
 * o menu é validar contra a lista errada: um endereço para uma dessas vistas
 * era recusado e ia parar à Visão Geral, sem uma palavra.
 *
 * ── PORQUÊ UM `Record` E NÃO UM ARRAY ─────────────────────────────────────
 *
 * Porque `Record<View, true>` OBRIGA a que estejam cá todas: acrescentar uma
 * vista ao tipo sem a acrescentar aqui não compila. Um array escrito à mão
 * aceitava ficar incompleto em silêncio, que é exactamente a avaria que este
 * bloco veio corrigir noutro sítio.
 */
const TODAS: Record<View, true> = {
  overview: true,
  pedidos: true,
  kanban: true,
  clientes: true,
  calendario: true,
  propostas: true,
  pagamentos: true,
  acompanhamento: true,
  "fazer-proposta": true,
  guioes: true,
  mesas: true,
  tarefas: true,
  fornecedores: true,
  inventario: true,
  material: true,
  temas: true,
  estatisticas: true,
  contratos: true,
  "modelos-email": true,
  definicoes: true,
  servicos: true,
  reciclagem: true,
};

/** As vistas todas, por ordem de declaração do tipo. */
export const VIEWS = Object.keys(TODAS) as View[];

/**
 * `"pedidos"` → `"pedidos"`. Um lixo qualquer → `undefined`.
 *
 * É a única porta por onde um texto de fora — endereço ou cookie — se torna uma
 * `View`. Devolver `undefined` e não lançar é deliberado: quem chama decide o
 * que fazer sem nada (abrir na Visão Geral, ler o cookie a seguir), e um
 * endereço estragado não pode ser um erro que a impeça de entrar.
 */
export function vistaValida(valor: string | null | undefined): View | undefined {
  /**
   * `Object.hasOwn` e NÃO `valor in TODAS`, e a diferença não é estilo.
   *
   * `in` percorre a cadeia de protótipos: `"toString" in TODAS` é `true`, e
   * `"constructor"`, e `"valueOf"`. Escrito com `in`, um endereço
   * `?v=toString` era dado por vista válida, entrava no estado e ia parar ao
   * cookie — que o servidor lia no arranque seguinte.
   *
   * Não é teoria: a primeira versão desta função usava `in` e foi um teste
   * desta lista que a apanhou.
   */
  return valor && Object.hasOwn(TODAS, valor) ? (valor as View) : undefined;
}

/**
 * Sidebar split for the calm, ChatGPT-like rail. Only the owner's DAILY CORE
 * stays visible at all times (`CORE_NAV`); everything else is tucked into a
 * collapsible "Mais" group at the bottom (`MORE_NAV`), collapsed by default, so
 * a newcomer sees a short, legible list instead of 15 destinations at once.
 *
 * `NAV` stays the single source of truth for ids / labels / icons and for every
 * other consumer (command palette, mobile bar); these arrays only decide what
 * the rail shows up-front vs. behind the disclosure.
 *
 * Note: several `View` ids exist in the type and still render if reached by a
 * direct link, but are intentionally left out of `NAV` so they don't clutter
 * the menu — the owner asked to hide them. Nothing about them was deleted:
 * add an id back to `NAV` (and to one of the arrays above) to surface it again.
 *
 * Escondidos a pedido dela, por ordem em que o pediu:
 *   · `clientes`, `fornecedores`, `inventario`, `modelos-email`
 *   · `kanban` (Organização de propostas), `servicos` (Biblioteca de
 *     serviços) e `acompanhamento` — "não quero estas opções".
 *
 * Os ecrãs continuam todos escritos e a funcionar. Se algum dia voltarem, é
 * uma linha em cada sítio — não é preciso reescrever nada.
 */
export const CORE_NAV: View[] = [
  "overview",
  "pedidos",
  "fazer-proposta",
  "propostas",
  // Ao lado das propostas, como ela pediu (5/11): é o passo a seguir — a
  // proposta foi aceite, e agora é receber o sinal e o saldo.
  "pagamentos",
  "calendario",
  "tarefas",
];

/**
 * ── PORQUE É QUE OS «GUIÕES DO DIA» ENTRAM AQUI E NÃO NA BARRA DE BAIXO ───
 *
 * A `BARRA_INFERIOR` tem quatro lugares e os quatro estão tomados por uma razão
 * escrita e medida (ver o bloco a seguir): são o dia de trabalho comercial —
 * ver o que há, ler o que entrou, escrever a proposta, ver as que saíram. Um
 * quinto botão dava cinco alvos de 75 px numa barra de 390 onde 44 é o mínimo,
 * e tirar um dos quatro para pôr este era trocar a tarefa que dá o dinheiro por
 * uma que só serve nas semanas em que há evento.
 *
 * Os guiões são um destino de SEMANA e não de hora: prepara-se um guião uma vez
 * por evento, e consulta-se no próprio dia. É exactamente a definição que o
 * comentário da barra dá aos destinos que ficam na gaveta. No computador não há
 * diferença nenhuma — a barra mostra os doze.
 *
 * FICA EM PRIMEIRO no «Mais», e não no fim: é o único destino desta lista que se
 * usa com um evento em cima, de pé, numa quinta. Os outros cinco são de
 * escritório.
 */
export const MORE_NAV: View[] = [
  "guioes",
  // O mapa de mesas é o par dos guiões: os dois são o evento visto por dentro,
  // e os dois saem em papel para a equipa no dia.
  "mesas",
  "contratos",
  "material",
  "temas",
  "estatisticas",
  "definicoes",
];

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BARRA DE BAIXO DO TELEMÓVEL — e a regra que a mantém honesta
 * ════════════════════════════════════════════════════════════════════════════
 *
 * **A barra de baixo leva os quatro destinos do dia. A gaveta leva O RESTO.**
 * Nenhum destino aparece nos dois sítios.
 *
 * PORQUE PRECISOU DE SER ESCRITO. Havia duas navegações a competir no mesmo
 * ecrã de 375 px: a gaveta (que abre no hambúrguer, ao canto) e a barra de
 * baixo — e a barra repetia três destinos que a gaveta já tinha, com um quarto
 * botão "Mais" que abria... a mesma gaveta. Dois botões para a mesma coisa, em
 * cantos opostos, e três destinos escritos duas vezes. Quem chega a este back
 * office pela primeira vez não sabe qual dos dois é "a" navegação, porque não
 * há resposta: são a mesma.
 *
 * PORQUE ESTES QUATRO. São o dia de trabalho, por esta ordem: ver o que há
 * (Visão Geral), ler o que entrou (Pedidos), escrever a proposta (Fazer
 * proposta), ver as que já saíram (Propostas). O "Fazer proposta" estava a
 * DOIS toques — abrir a gaveta, escolher — e é a tarefa que dá o dinheiro.
 *
 * O QUE ISTO CUSTA, dito com todas as letras: chegar ao Calendário, às Tarefas
 * ou aos Temas passa a ser sempre pelo hambúrguer, que fica no canto superior
 * esquerdo — o pior canto para um polegar. Continua a ser UM toque, e são
 * destinos de semana, não de hora. A alternativa (um quinto botão "Mais" na
 * barra) dava cinco alvos de 75 px numa barra onde 44 é o mínimo, e voltava a
 * pôr dois abridores para a mesma gaveta.
 *
 * NO COMPUTADOR não há barra de baixo nenhuma: a coluna da esquerda mostra
 * tudo, e esta lista não se aplica. É a mesma navegação com duas formas — não
 * a mesma forma esticada.
 */
export const BARRA_INFERIOR: View[] = ["overview", "pedidos", "fazer-proposta", "propostas"];

/**
 * ── O RÓTULO CURTO DA BARRA, E PORQUE É QUE ELE EXISTE ────────────────────
 *
 * Ela mandou a barra do Instagram e a do WhatsApp e disse «o menu no telemóvel
 * não está assim». Fui pôr as três lado a lado.
 *
 * O material já era o mesmo — cápsula a flutuar, desfoque, fio de luz no bordo,
 * pastilha levantada no destino activo. A diferença estava noutro sítio, e é
 * geométrica: nas duas referências o rótulo é UMA LINHA (ou não existe de
 * todo, no Instagram). Aqui «Visão Geral» e «Fazer proposta» partiam em duas,
 * e uma barra com rótulos de duas linhas não se lê como uma barra — lê-se como
 * uma lista apertada.
 *
 * Numa cápsula de 390 px repartida por quatro células sobram ~90 px por
 * rótulo. Estes cabem lá numa linha; os outros já cabiam.
 *
 * Só no telemóvel: no computador a barra é O MENU, tem largura, e o nome
 * inteiro é o que ela lê o dia todo.
 */
export const ROTULO_CURTO: Partial<Record<View, string>> = {
  overview: "Visão",
  "fazer-proposta": "Proposta",
  contratos: "Aceites",
  estatisticas: "Números",
};

export const NAV: { id: View; label: string; icon: ReactNode }[] = [
  {
    id: "overview",
    label: "Visão Geral",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    id: "pedidos",
    label: "Pedidos",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "calendario",
    label: "Calendário",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "fazer-proposta",
    label: "Fazer proposta",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6" />
        <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 14v6M14 17h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "propostas",
    label: "Propostas",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "pagamentos",
    label: "Pagamentos",
    // A carteira da Lucide (§8.1), no traço das outras entradas desta lista.
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </svg>
    ),
  },
  {
    id: "guioes",
    label: "Timelines",
    /* Uma régua do dia: a espinha do tempo à esquerda e dois blocos de
       comprimentos diferentes — que é a ideia inteira desta vista (a duração é
       o comprimento). Não é um relógio nem um calendário de propósito: esses
       dois ícones já estão tomados pelas Tarefas e pelo Calendário, e três
       destinos com a mesma metáfora não se distinguem no canto do olho. */
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M4 4v16" strokeLinecap="round" />
        <rect x="8" y="5" width="12" height="4" rx="1" />
        <rect x="8" y="15" width="7" height="4" rx="1" />
        <path d="M4 7h4M4 17h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "mesas",
    label: "Mapa de mesas",
    /* Uma mesa redonda vista de cima, com quatro cadeiras: é a peça que o ecrã
       arruma. Não se confunde com nenhum dos outros destinos. */
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="3.5" r="1.6" />
        <circle cx="12" cy="20.5" r="1.6" />
        <circle cx="3.5" cy="12" r="1.6" />
        <circle cx="20.5" cy="12" r="1.6" />
      </svg>
    ),
  },
  {
    id: "definicoes",
    label: "Definições",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: "tarefas",
    label: "Tarefas",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "material",
    label: "Material",
    // Caixa de ferramentas: a pega e o corpo. É o que vai na carrinha.
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" strokeLinecap="round" />
        <path d="M3 13h18" />
      </svg>
    ),
  },
  {
    id: "temas",
    label: "Temas",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path
          d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
          strokeLinejoin="round"
        />
        <circle cx="9.5" cy="12" r="1.2" />
        <path d="m6 17 3.5-3 3 2.5L16 13l3 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "estatisticas",
    label: "Estatísticas",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M3 3v18h18" strokeLinecap="round" />
        <path d="M7 14l3-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "contratos",
    label: "Propostas Aceites",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m9 14 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];
