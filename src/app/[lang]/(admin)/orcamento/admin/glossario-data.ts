/**
 * Conteúdo da Ajuda do back-office — separado do componente para ser fácil de
 * manter e traduzir. É *puro* e *client-safe*: só dados, sem imports do data
 * layer (nada de `*-store.ts`), por isso pode ser importado por componentes
 * "use client" sem arrastar segredos ou lógica de servidor.
 *
 * Regra de ouro: os nomes aqui têm de coincidir com o que aparece nos ecrãs.
 * Rótulos verificados no código:
 *   · Estados do pedido — STATUS_OPTIONS em AdminClient.tsx:
 *       Novo · Aguardar resposta · A preparar proposta · Proposta enviada ·
 *       Ganho · Perdido
 *   · Fases do Dossier — STAGE_LABELS em src/lib/orcamento/dossier.ts
 *   · "Cronograma" (a folha de operações do dia), "Mood boards",
 *     filtro "VIP" — todos presentes na UI de admin.
 */

/** Uma etapa do percurso de um trabalho, do primeiro contacto ao dia do evento. */
export interface LifecycleStep {
  step: string;
  desc: string;
}

/** Uma entrada do glossário: a palavra tal como aparece no ecrã + o que significa. */
export interface GlossaryEntry {
  term: string;
  def: string;
}

/**
 * O percurso que cada trabalho faz. Uma frase simples e concreta por etapa —
 * para que os nomes do menu se sintam como um só processo, e não como
 * separadores soltos.
 */
export const LIFECYCLE: LifecycleStep[] = [
  {
    step: "Pedido",
    desc: "Alguém pede um orçamento e nasce um pedido: quem é, que evento quer, para quando e para quantas pessoas.",
  },
  {
    step: "Proposta",
    desc: "Respondemos a esse pedido com uma proposta — um documento com os serviços sugeridos e o preço — e enviamo-la ao cliente.",
  },
  {
    step: "Contrato",
    desc: "Quando o cliente aceita as condições por escrito, fica feito o contrato e a data do evento é reservada para ele.",
  },
  {
    step: "Pagamento (sinal + saldo)",
    desc: "Cobramos em duas partes: primeiro o sinal, que garante a reserva, e mais perto do evento o saldo, que é o resto do valor. Aqui regista-se o que foi recebido e quando; as faturas são emitidas noutro programa.",
  },
  {
    step: "Evento",
    desc: "No dia do evento acontece tudo o que preparámos e, no fim, fica o registo no histórico do cliente.",
  },
];

/**
 * Vocabulário do dia a dia, em linguagem simples. A ordem segue o percurso
 * acima (do pedido ao evento) e só depois os termos transversais, para que
 * quem lê de cima a baixo aprenda pela mesma ordem por que vai encontrar as
 * palavras na app.
 */
export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Pedido",
    def: "Um contacto de alguém que quer um orçamento. Cada pedido tem um estado que mostra em que ponto está: Novo, Aguardar resposta, A preparar proposta, Proposta enviada, Ganho ou Perdido.",
  },
  {
    term: "Novo",
    def: "O estado de um pedido acabado de chegar, que ainda ninguém tratou. É o ponto de partida de todos os pedidos.",
  },
  {
    term: "Aguardar resposta",
    def: "O estado de um pedido a quem já respondemos e que está agora do lado do cliente. Um pedido entra aqui sozinho assim que lhe enviamos uma mensagem — antes disso fica em Novo. Chamou-se “Em revisão” até Agosto de 2026, mas esse nome descrevia o nosso trabalho e não o que falta acontecer.",
  },
  {
    term: "A preparar proposta",
    def: "O estado de um pedido cuja proposta já começou no editor de propostas e ainda não seguiu. Um pedido entra aqui sozinho quando se grava o primeiro rascunho, e passa a Proposta enviada quando a proposta segue. Continua na lista de Fazer proposta até seguir, porque o cliente ainda está à espera de nós.",
  },
  {
    term: "Organização de propostas",
    def: "O quadro que mostra todos os pedidos organizados por fase, em colunas (do primeiro contacto ao evento concluído). Serve para ver, num relance, em que ponto está cada trabalho. Também lhe chamamos “quadro”. Chamou-se “Pipeline” até Agosto de 2026.",
  },
  {
    term: "Proposta",
    def: "O documento que enviamos ao cliente com os serviços sugeridos e o preço. É a nossa resposta a um pedido; monta-se no editor de propostas.",
  },
  {
    term: "Proposta enviada",
    def: "O estado de um pedido a quem já mandámos a proposta e de quem esperamos resposta. É o rótulo que aparece no ecrã (internamente também aparece como “cotado”).",
  },
  {
    term: "Mood board",
    def: "Um painel de imagens de referência que juntamos à proposta para mostrar o ambiente e o estilo do evento. Usa-se sobretudo nas propostas de decoração.",
  },
  {
    term: "Temas",
    def: "A nossa biblioteca de fotos de inspiração, arrumada por estilo — Itália, Terracotta, Branco & Verde. As fotos carregam-se uma vez em “Temas” (no menu, dentro de “Mais”) e depois entram nos mood boards e nas capas da proposta com dois cliques. Escolher fotos de um tema faz uma cópia para essa proposta: mudar ou apagar o tema mais tarde não mexe nas propostas já enviadas.",
  },
  {
    term: "Contrato",
    def: "O acordo em que o cliente aceita as condições por escrito. Quando está aceite, o evento fica confirmado e a data reservada. No menu, o ecrã que os lista chama-se “Propostas Aceites”.",
  },
  {
    term: "Ganho",
    def: "O estado de um pedido que o cliente aceitou — o negócio foi fechado. É o desfecho que queremos para cada pedido.",
  },
  {
    term: "Perdido",
    def: "O estado de um pedido que não avançou (o cliente desistiu ou escolheu outro). Fica registado para sabermos o que aconteceu, mesmo que não tenha dado evento.",
  },
  {
    term: "Sinal",
    def: "A primeira parte do pagamento (habitualmente 30%), paga no início para reservar a data. Sem sinal, a data não fica garantida.",
  },
  {
    term: "Saldo",
    def: "O resto do pagamento (habitualmente 70%), pago mais perto do evento. Sinal + saldo = valor total.",
  },
  {
    term: "IVA",
    def: "O imposto que acresce ao valor dos serviços e é entregue ao Estado (em Portugal, normalmente 23%). Um preço «sem IVA» ainda não o inclui e vai subir quando o IVA for somado; um preço «com IVA» já é o valor final que o cliente paga.",
  },
  {
    term: "Pagamento registado",
    def: "Uma linha do registo de pagamentos de um evento: quanto entrou, de que tipo (sinal, saldo ou avulso), em que dia e por que meio. É daqui que saem o «Recebido» e o «A receber» de todos os quadros. As faturas em si são emitidas noutro programa e não vivem aqui.",
  },
  {
    term: "Convidados",
    def: "As pessoas que vão ao evento. O número de convidados influencia o espaço, a comida e o preço; a lista de convidados serve para acompanhar quem confirma que vem.",
  },
  {
    term: "Dossier",
    def: "A vista completa de um evento (o “Dossier do evento”), com tudo num só sítio: contacto, proposta, contrato, pagamentos e produção. É o “processo” do evento e onde as contas ficam certas.",
  },
  {
    term: "Cronograma",
    def: "A folha de operações do evento, pronta a imprimir: o alinhamento de horas e tarefas para a equipa seguir no próprio dia.",
  },
  {
    term: "Seguimento",
    def: "Um lembrete para voltar a falar com o cliente numa certa data — por exemplo, para não deixar uma proposta sem resposta. Se a data já passou, aparece “em atraso”. Marca-se no pedido, e a lista de pedidos ordena-se por ele com “Seguimentos primeiro”.",
  },
  {
    term: "Arquivar",
    def: "Guardar um pedido de lado para deixar de o ver na lista principal, sem o apagar. Fica escondido mas continua tudo lá — podes voltar a mostrá-lo com “Restaurar” quando quiseres.",
  },
  {
    term: "Apagar",
    def: "Eliminar um pedido em definitivo. Ao contrário de arquivar, esta ação não pode ser anulada, por isso pedimos sempre confirmação antes.",
  },
  {
    term: "VIP",
    def: "Marca um cliente especial — por exemplo, quem já gastou muito connosco ou voltou várias vezes. Ajuda a dar-lhe atenção prioritária e a filtrar a lista de clientes.",
  },
];
