import type { View } from "../nav";

/**
 * Os títulos das vistas do back office, e as vistas onde as acções de pedidos
 * da barra de topo querem dizer alguma coisa. Eram constantes escritas DENTRO
 * do `AdminClient` — refeitas a cada desenho, e a meio do corpo da função.
 * Passam a módulo, tal e qual (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */

/**
 * As vistas onde as acções DE PEDIDOS da barra de topo — "Atualizar" e
 * "+ Novo" — querem dizer alguma coisa.
 *
 * As duas são sobre pedidos e só sobre pedidos: o "Atualizar" volta a pedir
 * `/api/orcamento` e o "+ Novo" abre o formulário de pedido novo. Estavam a
 * aparecer em TODAS as vistas, e numa página de Temas isso é pior do que
 * redundante — são dois botões que parecem ser sobre o que está no ecrã e não
 * são. Ao lado do "Novo tema" da própria página, o "+ Novo" criava um pedido;
 * o "Atualizar" recarregava uma lista que ali nem se vê, e a equipa carregava
 * nele à espera de ver as fotos novas.
 *
 * Nas vistas que ficam de fora não há nada a substituir: cada uma trata do seu
 * próprio carregamento e actualiza-se sozinha ao gravar (os Temas, por
 * exemplo, actualizam o cartão no momento em que a foto entra).
 */
export const ACOES_DE_PEDIDOS: ReadonlySet<View> = new Set<View>([
  "overview",
  "pedidos",
  "kanban",
  "clientes",
  "calendario",
  "propostas",
  "estatisticas",
]);

export const VIEW_TITLES: Record<View, string> = {
  overview: "Visão Geral",
  pedidos: "Pedidos",
  kanban: "Organização de propostas",
  clientes: "Clientes",
  calendario: "Calendário",
  propostas: "Propostas",
  pagamentos: "Pagamentos",
  acompanhamento: "Acompanhamento",
  definicoes: "Definições",
  servicos: "Biblioteca de serviços",
  reciclagem: "Reciclagem",
  "fazer-proposta": "Fazer proposta",
  guioes: "Timelines",
  mesas: "Mapa de mesas",
  tarefas: "Tarefas",
  fornecedores: "Fornecedores",
  inventario: "Inventário",
  material: "Material",
  temas: "Temas",
  estatisticas: "Estatísticas",
  contratos: "Propostas Aceites",
  "modelos-email": "Modelos de email",
};

/**
 * O NOME CURTO PARA O TELEMÓVEL — só onde o comprido não cabe.
 *
 * Entre o título e os botões do cabeçalho sobram ~179 px a 375. Dos onze
 * destinos, dez cabem por inteiro; "Organização de propostas" precisa de 240
 * e saía cortado a meio de uma palavra, que é pior do que qualquer abreviação
 * escolhida por alguém.
 *
 * A primeira palavra e não uma sigla: é a palavra que ela acabou de ler no
 * botão da gaveta para chegar aqui, portanto reconhece-se sem esforço. No
 * computador continua o nome inteiro — não é o mesmo título encolhido, é o
 * nome que serve cada sítio.
 *
 * Só entram aqui os que MEDIDAMENTE não cabem. O passeio do telemóvel falha
 * se algum título for cortado, e é essa falha que manda acrescentar uma
 * linha a esta tabela.
 */
export const VIEW_TITLES_CURTOS: Partial<Record<View, string>> = {
  kanban: "Organização",
};

export const VIEW_SUB: Record<View, string> = {
  // Vazio de propósito: a própria Visão Geral já abre com data + saudação —
  // um eyebrow extra aqui era só mais texto.
  overview: "",
  pedidos: "Pedidos de orçamento recebidos",
  kanban: "Arrasta os pedidos entre fases",
  clientes: "Histórico por cliente",
  calendario: "Os teus eventos no tempo",
  propostas: "Todas as propostas enviadas",
  pagamentos: "O que cada cliente aceite já pagou, e o que falta",
  acompanhamento: "O que está à espera de resposta, por ordem de urgência",
  definicoes: "Os números com que o estúdio faz contas",
  servicos: "As palavras que vão nas propostas, escritas com tempo",
  reciclagem: "O que se apagou nos últimos 30 dias, e pode voltar",
  "fazer-proposta": "Escolhe o cliente e escreve a proposta",
  /* ── A DESCRIÇÃO DAS TIMELINES SAIU, COMO A DAS TAREFAS ────────────
     «A hierarquia do cabeçalho está invertida.» [APPLE] É a mesma regra dos
     documentos dela: título curto que identifica a vista, e mais nada. E
     «Timelines» já o diz — a frase que estava aqui explicava o que é uma
     timeline a quem já está dentro da secção das timelines. */
  guioes: "",
  // Como as Timelines: o título já diz o que é.
  mesas: "",
  /* ── A DESCRIÇÃO DAS TAREFAS SAIU ─────────────────────────────────
     «A hierarquia do cabeçalho está invertida: "Organização interna da
     equipa" acima do título, em cinzento pequeno.» [APPLE] A regra é
     título curto que identifica a vista, e mais nada — e "Tarefas" já o
     diz. Vazio como a Visão Geral, que é o outro sítio onde o título se
     basta a si próprio. */
  tarefas: "",
  fornecedores: "Parceiros e contactos",
  inventario: "Adereços e materiais de decoração",
  material: "O que vai nas carrinhas: ferramentas, consumíveis, escadotes",
  /* ── A DESCRIÇÃO DOS TEMAS SAIU, COMO A DAS TAREFAS E A DAS TIMELINES ──
     É a primeira linha da tabela da Parte 6 do `docs/APPLE-TEMAS.md`: «Fotos
     de inspiração por tema, prontas para as propostas» → «(fora — a secção
     chama-se Temas)». E o ponto 3 da auditoria diz porquê: a frase estava
     ACIMA do título, em cinzento pequeno, e ocupava a posição de maior
     destaque a explicar o que é um tema a quem já entrou nos temas. */
  temas: "",
  estatisticas: "Métricas e desempenho",
  contratos: "Aceitações de condições e estado de cada contrato",
  "modelos-email": "Emails reutilizáveis da equipa",
};
