/**
 * ════════════════════════════════════════════════════════════════════════════
 * ERROS QUE CHEGAM DO BROWSER DE UM VISITANTE MAS NÃO SÃO DO SITE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `ErrosDoSite` já deixava de fora os erros cujo ficheiro não é deste
 * domínio. Faltavam três famílias que passam esse filtro, todas vistas nos
 * registos de produção de 10–17/11:
 *
 *  1. **Scripts que a aplicação anfitriã injecta na página.** O browser do
 *     Instagram (iOS) injecta um `setupIosCallbackHandler` que lê
 *     `window.webkit.messageHandlers`; o Chrome do iPad (`CriOS`) injecta
 *     funções com nomes de uma letra («qh@ ph@ Pr@ …», mensagem «ra»). O
 *     browser dá-lhes o ENDEREÇO DA PÁGINA como ficheiro, por isso passavam por
 *     erros nossos. O sinal que os denuncia: molduras do rasto SEM endereço
 *     (código avaliado sem `sourceURL`), uma só com o endereço da página (o ponto
 *     de entrada), e nenhuma a apontar para `/_next/`.
 *     Os nossos scripts inline (a `Cortina`, a entrada em vídeo) têm sempre
 *     endereço em cada moldura, e por isso continuam a contar.
 *  2. **«ResizeObserver loop …».** O próprio padrão diz que é um aviso sem
 *     consequências: o browser adia a notificação para o fotograma seguinte.
 *  3. **A ponte das aplicações iOS** (`window.webkit.messageHandlers`), mesmo
 *     quando o rasto vem vazio.
 *
 * É uma função pura para correr dos dois lados: no browser (não se gasta o
 * beacon) e na rota (as páginas antigas, ainda em cache, continuam a mandar).
 */

const MENSAGENS_DE_FORA = [/ResizeObserver loop/i, /webkit\.messageHandlers/];

const RASTOS_DE_FORA = [/setupIosCallbackHandler/, /webkit\.messageHandlers/];

/**
 * Uma moldura do rasto sem endereço, no formato do WebKit (todos os browsers
 * do iOS): «qh@», «anonymous@», «@». As funções nativas do WebKit escrevem
 * «forEach@[native code]» e por isso não contam; e o V8 fica de fora de
 * propósito — escreve «at Array.forEach (<anonymous>)» também no nosso código.
 */
function molduraSemEndereco(linha: string): boolean {
  return /^[\w$.<>]*@$/.test(linha.trim());
}

function molduraComEndereco(linha: string): boolean {
  return /(https?|blob|file):\/\//.test(linha);
}

export function eRuidoDeFora(mensagem: unknown, rasto: unknown): boolean {
  const m = typeof mensagem === "string" ? mensagem : "";
  const r = typeof rasto === "string" ? rasto : "";
  if (MENSAGENS_DE_FORA.some((re) => re.test(m))) return true;
  if (RASTOS_DE_FORA.some((re) => re.test(r))) return true;
  if (r && !r.includes("/_next/")) {
    const linhas = r.split("\n");
    const semEndereco = linhas.filter(molduraSemEndereco).length;
    const comEndereco = linhas.filter(molduraComEndereco).length;
    // Injectado: várias molduras sem endereço, e só o ponto de entrada (uma
    // moldura) com o endereço da página.
    if (semEndereco >= 2 && comEndereco <= 1) return true;
  }
  return false;
}
