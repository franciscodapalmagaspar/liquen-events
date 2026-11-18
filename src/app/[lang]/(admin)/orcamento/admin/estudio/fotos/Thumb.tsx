"use client";

import { CelulaSemFotografia } from "./CelulaSemFotografia";
import { EsqueletoPorCima } from "./EsqueletoPorCima";
import { MarcasDaCelula } from "./MarcasDaCelula";
import type { PropriedadesDaCelula } from "./propriedades-da-celula";
import { useCelulaDaFoto } from "./useCelulaDaFoto";

export type { PropriedadesDaCelula } from "./propriedades-da-celula";

export function Thumb({
  url,
  planoB,
  onRemove,
  className = "",
  aspeto,
  onMedida,
  foraDoPdf = false,
  pendente = false,
  semRemover = false,
  onde = "estúdio",
  estadoDosUrls = "pronto",
  aoTentarDeNovo,
  aoMorrer,
  priority = false,
  // `refDoc` e não `ref`: o React trata `ref` como prop especial, e uma string
  // ali dentro é o padrão antigo das string refs, que ele recusa.
  refDoc,
  posicao,
}: PropriedadesDaCelula) {
  const {
    src,
    pesada,
    semRemedio,
    recusadaPeloSitio,
    semUrlEFalhou,
    ultimoAlvo,
    desenhaImagem,
    aCarregar,
    medir,
    largarAVez,
    setPintada,
    aoFalhar,
    tentarDeNovo,
  } = useCelulaDaFoto({
    url,
    planoB,
    pendente,
    onde,
    refDoc,
    estadoDosUrls,
    aoMorrer,
    onMedida,
  });

  return (
    <div
      // `aria-busy` e não só a opacidade: quem não vê a célula esbatida tem de
      // saber na mesma que esta foto ainda está a entrar (a pastilha «X a
      // caminho» diz o total, isto diz QUAL).
      //
      // SÓ o `pendente`, e é deliberado: aqui `aria-busy` quer dizer «esta foto
      // ainda não está na proposta», que é um estado do NEGÓCIO. Juntar-lhe «os
      // bytes ainda vêm a caminho» dava o mesmo sinal a duas coisas com
      // consequências opostas — uma impede o envio, a outra passa sozinha — e
      // os testes que lêem este atributo para contar fotos por confirmar
      // passariam a contar fotos que já lá estão. Quem diz que a fotografia vem
      // a caminho é o esqueleto, que é visível e não precisa de ser lido.
      aria-busy={pendente || undefined}
      // A PEGA DOS TESTES. Uma célula de foto identificava-se pelo seu «×» —
      // e o × saiu daqui para a barra de acções, que é visível ao toque. Um
      // atributo próprio diz o que a célula É, em vez de a fazer depender de
      // que botões calha ter naquele sítio.
      data-foto=""
      // `self-start` com o aspecto: dentro de uma grelha, sem isto a célula
      // esticava-se à altura da linha e o `aspect-ratio` era ignorado — que é
      // exactamente o contrário do que se quer aqui.
      style={aspeto ? { aspectRatio: String(aspeto) } : undefined}
      className={`group relative overflow-hidden rounded-lg border bg-[var(--bo-tinta-6)] motion-safe:transition-opacity motion-safe:duration-500 ${
        foraDoPdf ? "border-[var(--bo-perigo)]/60 opacity-60" : "border-[var(--bo-hairline-strong)]"
      } ${pendente ? "opacity-45" : ""} ${aspeto ? "self-start" : ""} ${className}`}
    >
      {desenhaImagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          // A forma desta fotografia sai desta imagem, que já cá está e já foi
          // descodificada — ver `onMedida`.
          ref={medir}
          onLoad={(e) => {
            largarAVez();
            setPintada(true);
            medir(e.currentTarget);
          }}
          // As PESADAS são geridas pela fila; pô-las também em `lazy` fazia uma
          // célula fora do ecrã ficar com a vez sem chegar a pedir nada. As
          // leves (a miniatura, ~20 KB) continuam em `lazy`, que é o que impede
          // as fotos dos boards lá de baixo de disputarem o canal com as que
          // estão à vista. E a primeira dobra não espera por nenhum dos dois.
          loading={pesada || priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="h-full w-full object-cover"
          style={posicao ? { objectPosition: posicao } : undefined}
          draggable={false}
          onError={(e) => {
            largarAVez();
            aoFalhar();
            void e;
          }}
        />
      ) : (
        <CelulaSemFotografia
          semRemedio={semRemedio}
          recusadaPeloSitio={recusadaPeloSitio}
          semUrlEFalhou={semUrlEFalhou}
          ultimoAlvo={ultimoAlvo}
          estadoDosUrls={estadoDosUrls}
          aoTentarDeNovo={aoTentarDeNovo}
          tentarDeNovo={tentarDeNovo}
        />
      )}
      {/* ── ENQUANTO A FOTOGRAFIA VEM ─────────────────────────────────────
          Por CIMA e em posição absoluta, e não no fluxo: pôr o esqueleto no
          lugar da imagem obrigava a célula a mudar de conteúdo no instante em
          que a foto chega, e o `src` está posto muito antes de os bytes
          chegarem — a caixa ficava cinzenta e calada durante os 34 s medidos.
          Assim há sempre alguma coisa a dizer «isto está a acontecer». */}
      <EsqueletoPorCima aCarregar={aCarregar} comPega />
      <MarcasDaCelula
        pendente={pendente}
        foraDoPdf={foraDoPdf}
        semRemover={semRemover}
        onRemove={onRemove}
      />
    </div>
  );
}
