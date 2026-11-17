/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO TEMPO A CDN DA VERCEL GUARDA O QUE O LINK DO CASAL SERVE (17/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As páginas do PDF (`/api/proposta/<token>/pagina/<n>`) e as fotografias
 * derivadas (`/foto/<id>`) guardam-se na CDN da Vercel para não acordarem a
 * função a cada visita. O preço: a CDN não sabe que um link foi CORTADO
 * (`cortarLinksDoPedido`) nem que os dados de um cliente foram apagados — o
 * que lá está continua a servir-se a quem tiver o endereço até ao fim do
 * prazo.
 *
 * Apagar da CDN no momento de cortar precisa do `@vercel/functions`
 * (`dangerouslyDeleteByTag`, com `Vercel-Cache-Tag` nas respostas). O pacote
 * não está nas dependências e não se acrescentou neste trabalho. Por isso o
 * prazo é curto: UMA HORA. Depois de cortar um link ou apagar um cliente, o
 * que já estava na CDN ainda pode servir-se durante, no máximo, uma hora —
 * e só a quem já tinha o endereço completo, com o token.
 *
 * O browser não vê isto (continua com o seu `Cache-Control: private`). Para
 * fechar a janela de vez: acrescentar `@vercel/functions`, pôr
 * `Vercel-Cache-Tag: proposta-<id>` nas duas rotas e apagar por etiqueta em
 * `cortarLinksDoPedido` e no apagar de um cliente.
 */
export const CDN_DO_LINK_DO_CASAL = "max-age=3600";
