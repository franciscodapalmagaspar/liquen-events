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
  if (r.bottom > 0 && r.top < window.innerHeight) return true;
  /*
   * NO PRIMEIRO ECRÃ DO DOCUMENTO, MESMO QUE O SCROLL AINDA SEJA O DA PÁGINA
   * ANTERIOR.
   *
   * Numa navegação, a página nova monta ANTES de o router a levar ao topo: o
   * `getBoundingClientRect` ainda mede com o scroll da página de onde se veio.
   * Medido a 25/10 no site publicado (telemóvel, de /servicos descida até ao
   * cartão de Casamentos para /servicos/casamentos): o texto logo abaixo da
   * fotografia contava como «acima do ecrã», escondia-se, e a metade de baixo
   * ficava branca e vazia durante a entrada — o clarão de que ela se queixou
   * («principalmente na parte de serviços e carrego para ver um serviço»).
   *
   * O que está no primeiro ecrã do DOCUMENTO entra com a página. Mostrar sem
   * animação uma coisa que, afinal, está fora do ecrã (voltar atrás para uma
   * página descida) não custa nada; escondê-la quando está à vista custa o
   * clarão.
   */
  const topoNoDocumento = r.top + window.scrollY;
  return topoNoDocumento + r.height > 0 && topoNoDocumento < window.innerHeight;
}
