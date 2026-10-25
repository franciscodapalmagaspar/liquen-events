import "server-only";
import { randomInt } from "node:crypto";
import { getState, setState } from "./app-state";
import { createProposalToken, validadeDeUmLinkNovo } from "./proposal-token";
import { SITE } from "./site";
import { getProposal } from "./proposals-store";
import { rateLimit } from "./rate-limit";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ENDEREÇO CURTO DA PROPOSTA — E A ALAVANCA PARA O CORTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O link que o casal recebe levava o token assinado inteiro atrás:
 *
 *     …/proposta/eyJ0eXAiOiJwcm9wb3NhbCIsInBpZCI6IjI0ZTY0MjVhLTdmYjktNDdhMi1i…
 *
 * Cinco linhas de caracteres aleatórios num email comercial. No HTML isso
 * arruma-se — o endereço vive no `href` e o que se lê é uma frase. No TEXTO
 * SIMPLES não há `href` nenhum onde o esconder: ou o endereço é curto, ou o
 * email de texto continua com cinco linhas de ruído. E é o email de texto que
 * os filtros de spam leem primeiro.
 *
 * ── O QUE MUDA NO MODELO DE ACESSO, DITO COM TODAS AS LETRAS ──────────────
 *
 * O token assinado é AUTO-SUFICIENTE: a assinatura prova quem é, e ninguém
 * precisa de perguntar nada a ninguém. O código curto não prova nada por si —
 * é uma CHAVE DE GAVETA, e a gaveta está do lado do servidor. Isso troca uma
 * verificação criptográfica por uma leitura, e a troca abre a porta a uma coisa
 * que o token nunca poderia dar: **o link passar a poder ser cortado.**
 *
 * Com o token, a única maneira de invalidar um link era rodar o segredo da
 * casa — o que punha toda a equipa fora do back office e matava, ao mesmo
 * tempo, os links de TODOS os casais. Na prática, não se fazia.
 *
 * ── O QUE AINDA NÃO ESTÁ FEITO, DITO AQUI PARA NÃO SE PENSAR QUE ESTÁ ─────
 *
 * A alavanca NÃO existe ainda, e não bastava escrevê-la aqui: enquanto o token
 * assinado continuar a abrir a mesma proposta, cortar o código curto não fecha
 * porta nenhuma — quem tem o email antigo entra à mesma. Cortar a sério é uma
 * decisão sobre as DUAS portas ao mesmo tempo, e essa fica para quando ela
 * quiser a alavanca. A gaveta já guarda o carimbo (`revogadaEm`) e a leitura já
 * o respeita; o que falta é quem o escreva, e o lado do token.
 *
 * O que este ficheiro entrega hoje é o endereço curto — que é o que estava a
 * pôr cinco linhas de ruído dentro de um email comercial.
 *
 * ── PORQUE É QUE O TOKEN CONTINUA A FUNCIONAR ─────────────────────────────
 *
 * Porque há links já enviados, em caixas de correio de gente a sério, e um
 * casal que abra o email de ontem tem de continuar a ver a proposta. Os dois
 * caminhos coexistem: o `propostaDoLink` tenta o token e, se não for um, tenta
 * a gaveta. Os links novos levam o código curto; os antigos morrem sozinhos
 * quando expirarem.
 *
 * ── O ALFABETO, E PORQUE É QUE NÃO É BASE64 ───────────────────────────────
 *
 * Um destes códigos vai ser lido em voz alta ao telefone («é liquen-events
 * ponto com barra proposta barra…») e escrito à mão por alguém a olhar para
 * um telemóvel. Base64 tem `I` e `l`, `O` e `0`, maiúsculas e minúsculas do
 * mesmo sinal — e um erro de leitura dá uma página de erro sem explicação.
 *
 * Este alfabeto é o de Crockford: 32 símbolos, sem `I`, `L`, `O` nem `U` (a
 * primeira letra confunde-se com o um, a última com o zero, e o `U` sai de
 * propósito para nenhum código soletrar uma palavra que ela não queira ler ao
 * telefone). Tudo minúsculas, porque um endereço em maiúsculas parece um grito.
 *
 * ── E O TAMANHO ───────────────────────────────────────────────────────────
 *
 * 16 símbolos deste alfabeto são 80 bits de acaso. Para efeito de comparação:
 * um `randomUUID` tem 122. Oitenta bits são mais do que suficientes para um
 * endereço que ninguém publica e que expira — e o que se ganha é um link com
 * 16 caracteres em vez de duzentos.
 */

/** O prefixo das gavetas, no armazenamento de estado partilhado. */
const PREFIXO = "ligacao-proposta:";

/**
 * O caminho ao contrário: da proposta para o seu código.
 *
 * Sem isto, cada pré-visualização do email no estúdio cunhava um código NOVO —
 * e uma proposta acabava com uma dúzia de endereços válidos, todos a apontar
 * para o mesmo sítio e nenhum possível de cortar sem cortar os outros. Uma
 * proposta, um endereço.
 */
const PREFIXO_INVERSO = "ligacao-de-proposta:";

/** Crockford base32, minúsculas: sem `i`, `l`, `o` nem `u`. */
const ALFABETO = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * Quantos símbolos tem um código NOVO: 8 × 5 bits = 40 bits.
 *
 * ── PORQUE É QUE PASSOU DE 16 A 8 (pedido dela, 25/10) ────────────────────
 *
 * «Gostava que aqui ficasse o nome dos noivos e não estas palavras todas
 * manhosas.» O endereço passa a `/proposta/ana-e-joao-k7m2q9xd`: os nomes à
 * frente (só para o olho — não abrem nada) e o código no fim, que continua a
 * ser a chave. Ela escolheu isto depois de lhe dizer que só os nomes deixavam
 * qualquer pessoa abrir a proposta de um casal adivinhando-os.
 *
 * Quarenta bits sozinhos adivinham-se com paciência; por isso os códigos de 8
 * têm um tecto de tentativas por IP (`TENTATIVAS_POR_MINUTO`) que os de 16 não
 * precisam. Com esse tecto, adivinhar fica fora do alcance de qualquer pessoa.
 */
export const COMPRIMENTO_DO_CODIGO = 8;

/** Os códigos emitidos antes de 25/10 têm 16 símbolos (80 bits) e continuam a abrir. */
export const COMPRIMENTO_ANTIGO = 16;

/**
 * Quantas leituras de códigos de 8 um IP pode fazer por minuto. A página, o PDF
 * e as fotografias de UMA visita fazem perto de 60; isto deixa folga para
 * várias visitas seguidas, e deixa um adivinhador a 5 tentativas por segundo.
 */
const TENTATIVAS_POR_MINUTO = 300;

/**
 * O que fica guardado por trás de um código.
 *
 * Guarda-se o `pedidoId` além do `propostaId` para se poder cortar de uma vez
 * todos os links de um pedido — que é o gesto real («este casal desistiu, corta
 * os links»), e não «corta este link em concreto», que ninguém sabe qual é.
 */
export interface LigacaoCurta {
  propostaId: string;
  pedidoId: string;
  criadaEm: string;
  /** ISO. Depois disto o código deixa de abrir, como o `exp` do token. */
  expiraEm: string;
  /** ISO, quando alguém a cortou. Não se apaga a linha: saber que um link
   *  FOI cortado (e quando) vale mais do que a linha desaparecer. */
  revogadaEm?: string;
}

/** A chave de um código, saneada para não sair do seu espaço de nomes. */
function chave(codigo: string): string {
  return `${PREFIXO}${String(codigo ?? "")
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .slice(0, 64)}`;
}

/**
 * Um código novo, sem viés.
 *
 * ── PORQUE É QUE ISTO NÃO É `randomBytes()[i] % 32` ───────────────────────
 *
 * Era, e estava CERTO: o resto de 256 por 32 é zero, portanto ler cada byte
 * módulo 32 é uniforme — não há aqui o enviesamento clássico de mapear 0-255
 * para um alfabeto que não divide 256.
 *
 * A análise de segurança do GitHub não faz essa conta: vê um `%` sobre uma
 * fonte criptográfica e levanta um alerta de severidade alta («creating biased
 * random numbers from a cryptographically secure source»). O achado era falso —
 * e um aviso alto que se explica de cada vez que aparece é um aviso que um dia
 * se ignora quando for verdadeiro. É a mesma razão por que o marcador das fotos
 * deixou de se chamar `token` (ver `ThemePicker.tsx`).
 *
 * O `randomInt` não tem resto nenhum para enviesar: pede um número dentro da
 * gama e rejeita internamente o que não cabe. Custa dezasseis chamadas por
 * código, o que é nada, e não precisa de defesa escrita.
 */
export function codigoNovo(): string {
  let saida = "";
  for (let i = 0; i < COMPRIMENTO_DO_CODIGO; i += 1) saida += ALFABETO[randomInt(ALFABETO.length)];
  return saida;
}

/** Isto tem a forma de um código curto? Serve para distinguir do token, que é
 *  muito mais comprido e traz pontos. */
export function pareceCodigoCurto(valor: unknown): boolean {
  const v = String(valor ?? "");
  return (
    (v.length === COMPRIMENTO_DO_CODIGO || v.length === COMPRIMENTO_ANTIGO) && /^[0-9a-z]+$/.test(v)
  );
}

/**
 * O código dentro de um segmento de endereço, ou `null`.
 *
 *   `ana-e-joao-k7m2q9xd`  → `k7m2q9xd`  (o formato novo: nomes + código)
 *   `njwwrj4m7tyz6x62`     → o próprio   (os 16 de antes, sem nomes)
 *
 * O código é o que vem depois do ÚLTIMO hífen; os nomes não contam para nada,
 * e por isso um link continua a abrir se os nomes da proposta mudarem depois.
 * Um token assinado tem pontos, maiúsculas e `_`, e nunca passa por aqui.
 */
export function codigoDoEndereco(segmento: unknown): string | null {
  const s = String(segmento ?? "");
  if (!/^[0-9a-z]+(?:-[0-9a-z]+)*$/.test(s)) return null;
  const codigo = s.slice(s.lastIndexOf("-") + 1);
  return pareceCodigoCurto(codigo) ? codigo : null;
}

/**
 * Os nomes para o endereço: «Ana & João» → `ana-e-joao`. Sem acentos (um
 * endereço com «ã» copiado para certos clientes de email parte-se), minúsculas,
 * e no máximo ~40 caracteres, cortados num hífen. Sem nomes, `proposta`.
 */
export function nomesNoEndereco(nomes: unknown): string {
  const base = String(nomes ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return "proposta";
  if (base.length <= 40) return base;
  const corte = base.slice(0, 41);
  const ultimo = corte.lastIndexOf("-");
  return (ultimo > 10 ? corte.slice(0, ultimo) : base.slice(0, 40)).replace(/-+$/g, "");
}

/** O IP de quem está a pedir, quando há pedido (fora de um pedido, `null`). */
async function ipDoPedido(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return (
      h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip")?.trim() ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Cria a gaveta e devolve o código. `null` quando não deu para guardar.
 *
 * NUNCA atira, e o `null` é significativo: quem chama tem de poder cair para o
 * token assinado. Um envio de proposta não pode falhar porque o armazenamento
 * de estado não respondeu — o casal fica com um link comprido, que é feio, e
 * não com nenhum, que é um negócio parado.
 */
export async function criarLigacaoCurta(
  propostaId: string,
  pedidoId: string,
  validaAte: Date,
): Promise<string | null> {
  // Com 8 símbolos, uma repetição é improvável mas possível: confirma-se que a
  // gaveta está livre antes de a usar (e tenta-se outra, até cinco vezes).
  let codigo = codigoNovo();
  for (let i = 0; i < 5; i += 1) {
    const ocupada = await getState<LigacaoCurta>(chave(codigo)).catch(() => null);
    if (!ocupada) break;
    codigo = codigoNovo();
  }
  const ligacao: LigacaoCurta = {
    propostaId: String(propostaId ?? "").trim(),
    pedidoId: String(pedidoId ?? "").trim(),
    criadaEm: new Date().toISOString(),
    expiraEm: validaAte.toISOString(),
  };
  if (!ligacao.propostaId) return null;
  try {
    const r = await setState(chave(codigo), ligacao);
    // `duradouro: false` quer dizer que ficou num sítio que não sobrevive —
    // e um link que desaparece com o processo é pior do que um link comprido.
    if (!r.gravado || r.duradouro === false) {
      log.warn("ligação curta: não ficou guardada de forma duradoura — usa-se o token", {
        proposta: ligacao.propostaId,
      });
      return null;
    }
    // O caminho ao contrário, para a próxima pré-visualização reaproveitar este
    // código em vez de cunhar outro. Falhar aqui não estraga o link que se
    // acabou de criar — só faz com que o próximo pedido cunhe um novo.
    const inverso = await setState(`${PREFIXO_INVERSO}${ligacao.propostaId}`, { codigo });
    if (!inverso.gravado) {
      log.warn("ligação curta: o caminho inverso não ficou guardado", {
        proposta: ligacao.propostaId,
      });
    }
    return codigo;
  } catch (e) {
    log.warn("ligação curta: não deu para guardar — usa-se o token", {
      proposta: ligacao.propostaId,
      erro: String(e),
    });
    return null;
  }
}

/**
 * O identificador da proposta por trás de um código, ou `null`.
 *
 * `null` em todos os casos em que o link não deve abrir — não existe, foi
 * cortado, ou já expirou — e de propósito SEM distinguir entre eles: a página
 * do casal mostra a mesma frase para um link inválido e para um que expirou, e
 * dizer qual é dos dois só ajudaria quem estivesse a adivinhar códigos.
 */
export async function lerLigacaoCurta(
  codigo: string,
): Promise<{ propostaId: string; criadaEm: string } | null> {
  if (!pareceCodigoCurto(codigo)) return null;
  // O tecto de tentativas, só para os códigos de 8 (ver `COMPRIMENTO_DO_CODIGO`).
  // Fora de um pedido (um teste, um aquecimento) não há IP, e não se conta.
  if (codigo.length === COMPRIMENTO_DO_CODIGO) {
    const ip = await ipDoPedido();
    if (ip && !(await rateLimit(`proposta-codigo:${ip}`, TENTATIVAS_POR_MINUTO, 60_000)).ok) {
      return null;
    }
  }
  try {
    const g = await getState<LigacaoCurta>(chave(codigo));
    if (!g?.propostaId) return null;
    if (g.revogadaEm) return null;
    if (g.expiraEm && Date.parse(g.expiraEm) < Date.now()) return null;
    // `criadaEm` sai daqui porque o corte de links precisa de saber a idade
    // deste endereço: morre o que foi emitido ANTES do corte, e esta é a única
    // fonte dessa data para a porta do código curto.
    return { propostaId: g.propostaId, criadaEm: g.criadaEm };
  } catch (e) {
    // Uma leitura que falha NÃO é um link inválido. Mas também não há como
    // abrir a proposta sem ela, portanto o desfecho é o mesmo — o que muda é
    // ficar registado que foi uma avaria e não um endereço errado.
    log.warn("ligação curta: leitura falhou", { erro: String(e) });
    return null;
  }
}

/**
 * O código que esta proposta já tem, se ainda servir.
 *
 * `null` quando não há nenhum, quando o que havia já expirou, ou quando foi
 * cortado. Nos três casos, quem chamar {@link enderecoDaProposta} cunha outro —
 * e é o que tem de acontecer: cortar um link cortou AQUELE endereço, não a
 * proposta. Um envio novo é um acto deliberado dela e merece um endereço que
 * funcione; o que ficou cortado continua cortado, para sempre.
 */
async function codigoJaEmitido(propostaId: string): Promise<string | null> {
  const id = String(propostaId ?? "").trim();
  if (!id) return null;
  try {
    const guardado = await getState<{ codigo?: string }>(`${PREFIXO_INVERSO}${id}`);
    const codigo = String(guardado?.codigo ?? "");
    if (!pareceCodigoCurto(codigo)) return null;
    const ligacao = await getState<LigacaoCurta>(chave(codigo));
    if (!ligacao?.propostaId || ligacao.revogadaEm) return null;
    if (ligacao.expiraEm && Date.parse(ligacao.expiraEm) < Date.now()) return null;
    return codigo;
  } catch {
    // Uma leitura que falha não é «não há código». Mas o desfecho é o mesmo, e
    // cunhar outro é melhor do que não haver endereço nenhum.
    return null;
  }
}

/**
 * O endereço da proposta para pôr num email — curto quando dá, o token quando
 * não dá.
 *
 * NUNCA atira e NUNCA devolve vazio. Um envio de proposta não pode falhar
 * porque o armazenamento de estado não respondeu: o casal fica com um link
 * comprido, que é feio, e não sem link, que é um negócio parado.
 */
/**
 * O ENDEREÇO DO PDF QUE CORRESPONDE A UM ENDEREÇO DE PROPOSTA.
 *
 * As duas portas abrem com a mesma chave: o `propostaDoLink` aceita tanto o
 * código curto de 16 caracteres como o token assinado, e é ele que serve a
 * página (`/proposta/<chave>`) e o ficheiro (`/api/proposta/<chave>/pdf`).
 * Portanto o endereço do PDF deriva-se do da proposta sem emitir nada — o que
 * importa, porque emitir outra ligação curta para o mesmo documento dava ao
 * casal dois códigos para a mesma coisa e duas validades para gerir.
 *
 * A troca é ancorada ao fim: `SITE.url` não tem `/proposta/` lá dentro hoje, e
 * um `replace` solto passaria a trocar o sítio errado no dia em que tivesse.
 */
export function enderecoDoPdfDaProposta(enderecoDaProposta: string): string {
  return `${enderecoDaProposta.replace(/\/proposta\/([^/]+)$/, "/api/proposta/$1")}/pdf`;
}

export async function enderecoDaProposta(propostaId: string, pedidoId: string): Promise<string> {
  const id = String(propostaId ?? "").trim();
  const curto = id
    ? ((await codigoJaEmitido(id)) ??
      (await criarLigacaoCurta(id, pedidoId, validadeDeUmLinkNovo())))
    : null;
  if (!curto) return `${SITE.url}/proposta/${createProposalToken(propostaId)}`;
  // Os de 16 (emitidos antes de 25/10) ficam exactamente como foram enviados:
  // o casal não pode ficar com dois endereços diferentes para a mesma proposta.
  if (curto.length !== COMPRIMENTO_DO_CODIGO) return `${SITE.url}/proposta/${curto}`;
  return `${SITE.url}/proposta/${nomesNoEndereco(await nomesDaProposta(id))}-${curto}`;
}

/** Os nomes da proposta (`clientNames`), ou vazio se a leitura falhar. */
async function nomesDaProposta(propostaId: string): Promise<string> {
  try {
    return (await getProposal(propostaId))?.doc?.clientNames ?? "";
  } catch {
    return "";
  }
}
