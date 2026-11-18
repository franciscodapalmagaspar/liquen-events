/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE ESCREVEU NO PAINEL DE UM PEDIDO, ANTES DE CHEGAR AO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O buraco que isto tapa ────────────────────────────────────────────────
 *
 * No painel de um pedido, duas coisas gravam sozinhas: as notas internas e o
 * motivo de perda. Tudo o resto — preço, data, convidados, local, nome, email,
 * telefone, estado, responsável — só sai do telemóvel quando ela carrega em
 * «Guardar». Até lá vive no estado do React e em mais lado nenhum.
 *
 * O travão era um `beforeunload`. Num computador funciona. **Num iPhone é quase
 * decorativo**: o Safari descarta separadores em segundo plano para libertar
 * memória e não corre o `beforeunload` quando o faz. Atender o telefone, ver
 * uma mensagem, abrir o mapa — cada um desses gestos é uma oportunidade de o
 * separador morrer calado com o preço da proposta lá dentro. Numa quinta, com
 * 4G fraco, é o cenário normal e não o raro.
 *
 * O estúdio de propostas já não tem este problema: o rascunho dele vai para o
 * servidor E fica em cópia local. O próprio hook da casa o diz sem rodeios —
 * «no estúdio o trabalho fica no `localStorage` daquele computador, no painel
 * do pedido não fica em lado nenhum».
 *
 * ── Porque é que só o `localStorage`, e não o servidor ────────────────────
 *
 * Porque o que falha aqui é a rede. Uma cópia que precisa de rede para existir
 * não serve de rede de segurança para uma rede que caiu. O servidor já tem o
 * caminho normal — o botão «Guardar» — e esse passa a ser resistente por si
 * (tecto de tempo e repetição, como a gravação automática ao lado). Isto é a
 * outra metade: o que fazer quando nem isso chegou a acontecer.
 *
 * ── E porque é que não repõe sozinho ──────────────────────────────────────
 *
 * Repor sem perguntar é escrever por cima. Entre o separador ter morrido e ela
 * voltar a abrir o pedido pode ter passado um dia, e o valor no servidor pode
 * ter mudado — por ela, noutro sítio, ou pelo casal a responder. Um resgate
 * silencioso que desfaz uma alteração legítima é pior do que perder o
 * rascunho: perde-se a mesma coisa e ninguém fica a saber.
 *
 * Por isso este ficheiro sabe dizer O QUE está diferente, por nome. É essa
 * frase — «o preço e a data» — que transforma a pergunta numa decisão em vez de
 * uma aposta.
 */

/** Os campos que o painel edita e que NÃO gravam sozinhos. Tudo texto: é o que
 *  está escrito nas caixas, não o que o servidor faria dele. */
export interface CamposDoPedido {
  preco: string;
  notas: string;
  estado: string;
  responsavel: string;
  motivoDePerda: string;
  data: string;
  convidados: string;
  local: string;
  nome: string;
  email: string;
  telefone: string;
}

export interface RascunhoDoPedido {
  id: string;
  /** Quando foi escrito, em ISO. É isto que dá o «de há dez minutos». */
  em: string;
  campos: CamposDoPedido;
}

/** Como cada campo se chama numa frase dita a uma pessoa. */
const NOMES: Record<keyof CamposDoPedido, string> = {
  preco: "o preço",
  notas: "as notas",
  estado: "o estado",
  responsavel: "o responsável",
  motivoDePerda: "o motivo",
  data: "a data",
  convidados: "os convidados",
  local: "o local",
  nome: "o nome",
  email: "o email",
  telefone: "o telefone",
};

const CAMPOS = Object.keys(NOMES) as (keyof CamposDoPedido)[];

export const chaveDoRascunho = (id: string) => `liquen-pedido-${id}`;

/**
 * Guarda o que está escrito no ecrã.
 *
 * Nunca lança: um `localStorage` cheio, ou uma janela privada que o recusa, não
 * pode partir a edição que está a decorrer. Perder a rede de segurança é mau;
 * perder o trabalho por causa dela seria absurdo.
 */
export function guardarRascunho(id: string, campos: CamposDoPedido, em: string): void {
  try {
    const r: RascunhoDoPedido = { id, em, campos };
    localStorage.setItem(chaveDoRascunho(id), JSON.stringify(r));
  } catch {
    /* sem cópia local — o botão «Guardar» continua a ser o caminho normal */
  }
}

export function esquecerRascunho(id: string): void {
  try {
    localStorage.removeItem(chaveDoRascunho(id));
  } catch {
    /* nada a fazer */
  }
}

/**
 * Lê o que ficou guardado, e desconfia do que lá está.
 *
 * Um `localStorage` é escrito por versões antigas do programa e por outras abas.
 * Um rascunho a que falte um campo, ou cujo `id` não seja o deste pedido, é
 * deitado fora em silêncio — vale mais não oferecer resgate nenhum do que
 * oferecer um que reponha `undefined` por cima de um preço.
 */
export function lerRascunho(id: string): RascunhoDoPedido | null {
  try {
    const cru = localStorage.getItem(chaveDoRascunho(id));
    if (!cru) return null;
    const r = JSON.parse(cru) as Partial<RascunhoDoPedido>;
    if (!r || r.id !== id || typeof r.em !== "string" || !r.campos) return null;
    const campos = r.campos as Partial<CamposDoPedido>;
    for (const c of CAMPOS) if (typeof campos[c] !== "string") return null;
    return { id, em: r.em, campos: campos as CamposDoPedido };
  } catch {
    return null;
  }
}

/**
 * Os campos em que os dois lados não dizem o mesmo.
 *
 * ── PORQUE É QUE ISTO ACEITA `undefined` QUE O TIPO DIZ NÃO EXISTIR ────────
 *
 * Porque existia. `CamposDoPedido` promete onze `string`, e quem monta os dois
 * lados no `AdminClient` promete o mesmo ao TypeScript — mas o `estado` vinha
 * de um `Quote` que pode não ter `status`, e o tipo não impede um campo em
 * falta de atravessar um `as`. Um pedido gravado antes de o campo existir (a
 * máquina de estados di-lo por escrito: «há pedidos gravados antes de metade
 * destes campos existirem») fazia isto chamar `.trim()` sobre `undefined` —
 * DENTRO DE UM EFEITO, portanto o que se via não era um campo em branco: era o
 * back office inteiro substituído por «Ocorreu um erro inesperado».
 *
 * As duas pontas foram corrigidas na origem. Isto fica na mesma, e não é
 * cinto-e-suspensórios inútil: esta função é o único sítio por onde os dois
 * lados passam, e é barato ser o sítio onde um campo em falta é um campo vazio
 * em vez de um ecrã perdido.
 */
export function oQueMudou(
  rascunho: CamposDoPedido,
  doServidor: CamposDoPedido,
): (keyof CamposDoPedido)[] {
  // `trim` porque um espaço a mais no fim de um nome não é uma alteração que
  // valha a pena interromper alguém para perguntar.
  return CAMPOS.filter((c) => (rascunho[c] ?? "").trim() !== (doServidor[c] ?? "").trim());
}

/**
 * A frase que a barra de resgate mostra.
 *
 * Nomeia até dois campos e conta o resto. Nomear os onze seria uma parede de
 * texto, e dizer só «há alterações» obrigava a aceitar às cegas — que é
 * exactamente o que esta peça existe para evitar.
 */
export function fraseDoQueMudou(campos: (keyof CamposDoPedido)[]): string {
  const nomes = campos.map((c) => NOMES[c]);
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}`;
}

/**
 * Há quanto tempo, dito como uma pessoa diria.
 *
 * Sem segundos e sem «há 0 minutos»: se foi agora mesmo, foi agora mesmo. Um
 * rascunho de ontem diz o dia, porque «há 1400 minutos» não ajuda ninguém a
 * decidir.
 */
export function haQuantoTempo(em: string, agora: Date): string {
  const t = Date.parse(em);
  if (Number.isNaN(t)) return "";
  const minutos = Math.floor((agora.getTime() - t) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos === 1) return "há 1 minuto";
  if (minutos < 60) return `há ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  if (horas === 1) return "há 1 hora";
  if (horas < 24) return `há ${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/** O rascunho encontrado ao abrir um pedido, à espera de uma decisão dela. */
export interface RascunhoEncontrado {
  campos: CamposDoPedido;
  /** Já escrito — «há 12 minutos». Calculado ao ABRIR e não a cada desenho:
   *  no desenho, `new Date()` faz a frase mudar sozinha quando o painel
   *  redesenha por outra razão qualquer, e uma frase que se mexe sem motivo
   *  chama a atenção para o sítio errado. */
  quando: string;
  mudou: (keyof CamposDoPedido)[];
}
