/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA API DO BROWSER QUE «DEVIA» DEVOLVER UMA PROMESSA, E NÃO DEVOLVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Achado nos registos de produção (14/11): três páginas de `/servicos/…`
 * rebentaram com «Cannot read properties of undefined (reading 'catch')».
 * O rasto apontava para a coluna exacta do `.catch` em
 * `navigator.serviceWorker.register("/sw.js").catch(…)`. O aparelho era um
 * Chrome 106 em Linux — um robô que troca o `register` por uma função vazia
 * para não instalar service workers. Pelo padrão da Web devolve sempre uma
 * promessa; neste aparelho devolveu `undefined`, e o `.catch` sobre `undefined`
 * é um erro que a pessoa não pediu e que nos enchia o registo.
 *
 * Não é só o robô. Há browsers a sério onde a mesma família de APIs não
 * devolve promessa: o `video.play()` antes do Chrome 50 / Safari 10, o
 * `requestFullscreen()` no Safari antes do 16.4, e as extensões que embrulham
 * a `navigator.clipboard`. Todas se chamam aqui da mesma forma:
 *
 *     semRecusa(() => navigator.serviceWorker.register("/sw.js"));
 *
 * ── O QUE NUNCA FAZ ───────────────────────────────────────────────────────
 *
 * NÃO LANÇA: nem se a função não existir (`TypeError` síncrono), nem se
 * devolver `undefined`, nem se a promessa for recusada. O `aoRecusar` recebe
 * as duas falhas — a síncrona e a assíncrona — porque, para quem chama,
 * «o browser disse que não» é a mesma coisa.
 */
export function semRecusa(chamar: () => unknown, aoRecusar?: (erro: unknown) => void): void {
  const recusar = (erro: unknown) => {
    try {
      aoRecusar?.(erro);
    } catch {
      /* quem trata a recusa não pode ser o segundo erro */
    }
  };
  let resultado: unknown;
  try {
    resultado = chamar();
  } catch (e) {
    recusar(e);
    return;
  }
  if (eThenable(resultado)) {
    try {
      resultado.then(undefined, recusar);
    } catch (e) {
      recusar(e);
    }
  }
}

function eThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null &&
    (typeof v === "object" || typeof v === "function") &&
    typeof (v as { then?: unknown }).then === "function"
  );
}
