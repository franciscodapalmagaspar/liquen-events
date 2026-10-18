/**
 * Está já à vista quando a página arranca?
 *
 * O `AnimateIn` e o `Reveal` escondem o elemento num efeito de layout e só o
 * mostram quando o observador o vê. Para o que está mais abaixo isso é invisível
 * — mas para o que já está no primeiro ecrã não é: o HTML do servidor chega
 * pintado, a hidratação esconde-o e ele volta a entrar. Medido a 18/10 (telemóvel,
 * CPU ÷4): o título de Serviços, Clientes, Sobre e Galeria via-se, desaparecia, e
 * só ficava à vista aos 1,5–1,9 s; o do Contacto, que não usa nenhum dos dois,
 * aos 0,5 s. Pedido dela: «quero o site super fluido».
 *
 * Por isso, o que já está à vista ao montar não se esconde: entra com a página
 * (o `.route-fade` numa navegação, ou já pintado no primeiro carregamento). O que
 * está abaixo continua a aparecer ao rolar, como sempre.
 *
 * Um elemento sem caixa (altura 0 — o jsdom, ou ainda sem layout) conta como
 * fora do ecrã, que é o comportamento de antes.
 */
export function jaEstaAVista(el: Element): boolean {
  if (typeof window === "undefined") return false;
  const r = el.getBoundingClientRect();
  if (r.height <= 0 && r.width <= 0) return false;
  return r.bottom > 0 && r.top < window.innerHeight;
}
