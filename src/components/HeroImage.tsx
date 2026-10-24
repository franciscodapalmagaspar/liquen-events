"use client";

import SafeImage, { type SafeImageProps } from "@/components/SafeImage";
import { heroImageLoader } from "@/lib/hero-image-loader";

/**
 * Thin wrapper around next/image for the full-bleed page heroes. It injects the
 * `heroImageLoader`, which resolves each srcset candidate to a static,
 * build-time file under `/_img` (see scripts/pregen-heroes.mjs) instead of the
 * on-demand `/_next/image` optimizer — so the first visitor after a deploy sees
 * a sharp hero with no cold-encode blur.
 *
 * This is a Client Component only because a loader is a function prop, which
 * can't be passed to next/image from a Server Component (the hero pages). It
 * still SSRs; behaviour is otherwise identical to a plain <Image>.
 */
/**
 * ACRESCENTADO: o herói passou a ter rede.
 *
 * Era um `<Image>` cru, portanto um único erro deixava-o partido para o resto
 * da visita — na maior imagem de cada página. Medido com a derivada forçada a
 * falhar em todas as páginas: das 12 imagens que ainda partiam depois de o
 * resto do sítio passar a `SafeImage`, 10 eram heróis. Agora o herói cai no
 * ficheiro original (`/imagens/…`, versionado, existe sempre) tal como as
 * outras, e o `heroImageLoader` fica só para a PRIMEIRA tentativa — é ele que
 * dá a escada própria até 2048 px que os heróis precisam e as fotos comuns não.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * E AGORA COM AVIF — mas o pré-carregamento teve de ser escrito à mão
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO: na secretária o herói **é** o elemento de LCP (3388 ms), e são
 * 104,6 KB em WebP a 2048 px. A grelha da galeria tem 2785 ficheiros AVIF;
 * a pasta dos heróis tinha 192 WebP e zero. Ficaram de fora da conversão.
 *
 * ── PORQUE É QUE NÃO BASTOU PÔR UM `<picture>` ────────────────────────────
 *
 * O `priority` do `next/image` faz o Next emitir um `<link rel="preload">` — e
 * esse preload aponta para o `srcset` do `<img>`, que é WebP. Num browser com
 * AVIF, o `<picture>` escolheria o AVIF e o preload teria descarregado o WebP
 * **para nada**: dois downloads do elemento mais pesado da página, que é o
 * contrário exacto do que isto serve.
 *
 * Por isso o `priority` do Next é DESLIGADO e substituído por três coisas
 * escritas aqui:
 *   · `loading="eager"` + `fetchPriority="high"` no `<img>`, que é o que o
 *     `priority` fazia de útil;
 *   · um pré-carregamento nosso, com `type="image/avif"` e o `imageSrcSet` do
 *     AVIF, para o browser puxar a fonte que vai MESMO usar.
 *
 * ── E ONDE É QUE ELE ATERRA NO DOCUMENTO ──────────────────────────────────
 *
 * Isto esteve escrito como um `<link>` em JSX, com um comentário meu a dizer
 * que «o React 19 iça-o para o `<head>` sozinho». FUI MEDIR NO HTML CONSTRUÍDO
 * e é falso: o `</head>` fecha no byte 5456 e o `<link>` do herói saía no byte
 * 31 982 — dentro do corpo, depois da barra de navegação, do menu de telemóvel
 * e de três blocos de dados estruturados. O pedido do elemento de LCP saía a
 * 1/6 do documento mais tarde do que podia, e o comentário garantia o
 * contrário a quem viesse a seguir.
 *
 * `ReactDOM.preload` é a API que faz mesmo o que aquele comentário prometia: é
 * declarada durante o render e o React põe-na no `<head>`, deduplicada. O
 * `<link>` em JSX fica para quem o quiser voltar a tentar — mas então que meça
 * o byte, como aqui.
 *
 * ── A SALVAGUARDA ─────────────────────────────────────────────────────────
 *
 * A `<source>` AVIF só é emitida quando `heroAvifSrcSet` reconhece a origem —
 * ou seja, exactamente para os ficheiros que o pré-gerador produz. Isto
 * importa: o browser escolhe a fonte pelo `type`, não por ela existir. Um
 * `<source>` a apontar para um AVIF que não foi gerado dava um herói partido
 * e a rede de recuperação do `SafeImage` ficava do lado de lá a olhar, porque
 * ela vive no `<img>` e o `<img>` nem chegaria a ser escolhido.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O `<picture>` E O PRÉ-CARREGAMENTO MUDARAM-SE PARA O `SafeImage`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tudo o que está escrito acima continua a valer — só mudou de casa. O resto
 * do sítio passou a querer o mesmo AVIF (os fundos de secção e os portefólios
 * também têm gémeo em `/_img/`, e eram servidos em WebP), e escrever um
 * segundo `<picture>` ao lado deste era a família paralela que o sistema de
 * design manda não criar. Ficou UM mecanismo, no `SafeImage`, e este
 * componente voltou a ser o que o nome diz: o `SafeImage` com a escada dos
 * heróis até 2048 px.
 *
 * O que se manteve, para quem venha conferir:
 *   · a salvaguarda — só há `<source>` quando há AVIF garantido para a origem
 *     (agora em `siteImageAvifUrl`, que para um herói é o mesmo
 *     `heroAvifUrl`), e o `SafeImage` confere ainda, candidato a candidato,
 *     que o AVIF é o gémeo exacto do WebP que ESTE carregador serve;
 *   · o pré-carregamento escrito à mão, com `ReactDOM.preload`, tipo AVIF, e o
 *     do Next desligado — só quando há prioridade E AVIF;
 *   · o `<picture>` posicionado com `fill`, sem caixa sem ele.
 *
 * A lista AVIF deixou de ser escrita à mão com `heroAvifSrcSet` e passou a
 * sair da do próprio `<img>` (ver `fonteAvif` no `SafeImage`); para um herói a
 * `sizes="100vw"`, que são todos, o resultado é a mesma escada de sempre —
 * 640/1080/1536/2048 com esses descritores —, e o pré-carregamento leva a
 * mesma lista que a `<source>`.
 *
 * E uma correcção que vem de graça: este `<picture>` embrulhava o `SafeImage`
 * por fora, portanto a `<source>` ficava lá quando a rede passava ao ficheiro
 * original — o browser continuava a escolhê-la pelo `type` e cada re-tentativa
 * voltava a pedir o AVIF que tinha falhado. Agora a `<source>` sai na primeira
 * falha, com o resto da escada.
 */
export default function HeroImage(props: Omit<SafeImageProps, "initialLoader">) {
  // O `eslint-disable` do `jsx-a11y/alt-text` que aqui esteve deixou de ser
  // preciso: a regra só olha para `next/image`, e isto é o SafeImage.
  // O véu do desfoque é escuro nos heróis: é a primeira coisa que se vê ao
  // mudar de página, e um desfoque claro lia-se como um clarão branco (24/10).
  return <SafeImage initialLoader={heroImageLoader} veuEscuro {...props} />;
}
