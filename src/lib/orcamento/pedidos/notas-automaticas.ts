/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O PAINEL DO PEDIDO GRAVA SOZINHO — E O QUE CONTINUA A PEDIR UM CLIQUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que acontecia: escreviam-se três mil caracteres nas notas internas, tocava
 * o telefone, fechava-se o separador, e não tinha sido enviado nada. Tudo o que
 * este painel edita vivia em estado do React até alguém carregar em «Guardar».
 *
 * A divisão não é «campos pequenos gravam-se, campos grandes não». É esta:
 *
 *  · **O que se ESCREVE grava-se sozinho** — as notas internas e o motivo de
 *    perda. É prosa, é dela, e o pior que uma gravação a meio produz é uma
 *    frase por acabar, que a gravação seguinte completa. Ficar por gravar é que
 *    é o estrago.
 *
 *  · **O que é uma DECISÃO, ou um FACTO que outros ecrãs lêem, continua a
 *    exigir um clique** — o estado, o preço, a data, os convidados, o local, o
 *    responsável. Três razões, e nenhuma delas é preguiça:
 *      1. metade de um número é um número errado: «8» a caminho de «80»
 *         gravado sozinho põe oitenta convidados a oito, e a data, o local e o
 *         preço aparecem no calendário, nas contas e na proposta;
 *      2. mudar o estado muda a coluna do quadro e o que conta como ganho —
 *         é uma coisa que se faz, não uma coisa que se rascunha;
 *      3. a rota trata a PRESENÇA de `status` no PATCH como «escolhido à mão»
 *         e desliga as transições automáticas por causa disso. Mandá-lo em cada
 *         gravação automática desligava-as em silêncio, para sempre.
 *
 * O motivo de perda é o caso de fronteira: é prosa, mas escrito no MESMO gesto
 * em que se marca o pedido como perdido é parte dessa decisão. Por isso grava-se
 * sozinho só quando não há uma mudança de estado à espera de confirmação.
 *
 * (Saiu do `AdminClient.tsx` na fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`.)
 */
export interface NotasAutomaticas {
  id: string;
  adminNotes: string;
  /** `null` quando o motivo de perda viaja com a decisão do estado e não sozinho. */
  lostReason: string | null;
}

/**
 * Comparação por CAMPOS e não por identidade: o `selected` é substituído por
 * tudo o que grava neste painel (etiquetas, seguimento, pagamentos, a própria
 * revalidação da lista), e comparar objectos fazia cada uma dessas substituições
 * parecer uma alteração dela — uma gravação por cada redesenho.
 */
export function mesmasNotas(a: NotasAutomaticas, b: NotasAutomaticas): boolean {
  return a.id === b.id && a.adminNotes === b.adminNotes && a.lostReason === b.lostReason;
}
