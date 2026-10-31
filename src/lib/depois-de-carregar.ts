/**
 * Corre `fn` depois de a página ter carregado (o evento `load`) e num instante
 * em que o browser esteja livre — nunca a disputar a rede e o processador com
 * a fotografia da capa, que é o LCP. Devolve o que cancela.
 */
export function depoisDeCarregar(fn: () => void): () => void {
  let id = 0;
  let parado = false;
  const livre = () => {
    if (parado) return;
    if (typeof requestIdleCallback === "function") {
      id = requestIdleCallback(() => !parado && fn(), { timeout: 2000 });
    } else {
      id = window.setTimeout(() => !parado && fn(), 200);
    }
  };
  if (document.readyState === "complete") livre();
  else window.addEventListener("load", livre, { once: true });
  return () => {
    parado = true;
    window.removeEventListener("load", livre);
    if (typeof cancelIdleCallback === "function") cancelIdleCallback(id);
    clearTimeout(id);
  };
}
