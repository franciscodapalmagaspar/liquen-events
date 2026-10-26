# A rapidez do site público — o que foi medido, e o que não vale a pena repetir

Ela, 24/10: «se não está no topo do telemóvel e no computador, temos que
colocar» e «quero que tanto no telemóvel como no computador cheguem os dois aos
100». Este documento guarda o que se mediu nesse dia, para a próxima pessoa não
voltar a gastar uma tarde nas mesmas experiências.

Ferramenta: Lighthouse 12.6.1, rapidez («performance»), telemóvel simulado
(CPU ÷4, 4G lento), mediana de 3 corridas. As corridas variam ±3 pontos.

## Onde ficou (site publicado, 24/10)

| Página | Telemóvel antes | Telemóvel depois | Computador antes | Computador depois |
|---|---|---|---|---|
| Página inicial | 48 | 81 | 86 | 89 |
| Serviços | — | 83 | — | 92 |
| Galeria | — | 88 | — | 95 |

SEO, acessibilidade e boas práticas: 100 em todas, antes e depois.

O que entrou:
- **#283:** o Google Tag no primeiro gesto (ou aos 6 s), e o Tailwind sem ler
  docs, testes e guiões;
- **#284:** o clarão branco ao mudar de página.

## O que separa o telemóvel dos 100 — medido, uma coisa de cada vez

Página inicial, servidor local (`next start`), a mesma máquina:

| Experiência | Nota | O que diz |
|---|---|---|
| Como está | 82 | ponto de partida |
| Sem a cortina de entrada | 82 | **a cortina não custa nada** |
| Sem o vídeo de entrada | 87 | **o vídeo custa ~5**: um vídeo a correr conta como «página que nunca acaba» (Speed Index 4,6 s → 1,9 s) |
| Folha de estilos à parte (`inlineCss: false`) | 86 | +4 na nota, mas **o ecrã fica em branco quase mais um segundo** (pintura aos 0,9 s → 1,8 s, 4G fraco, browser real). Recusado: é a queixa dela que o `inlineCss` resolveu |
| Folha de estilos perfeita por página (simulada, só as regras usadas, nas duas cópias) | 85 (vs 83 no mesmo ensaio) | separar o CSS por página vale **~2**, não compensa o risco |
| `AnimateIn`/`Reveal` sem medir a posição na hidratação | 82 | o cálculo só mudou de sítio; não ficou |

**Decisão dela (24/10):** «Fica o vídeo».

## Porque é que os 100 no telemóvel não estão ao alcance com este desenho

O JavaScript que o telemóvel descarrega na página inicial são ~570 KB
minificados. Mapeado com source maps:
- ~470 KB são a fundação: o React (react-dom ~200 KB) e o router do Next;
- o código do site são ~80 KB, sendo o maior o motor do vídeo (16 KB) e o
  menu (12 KB);
- há ainda um bloco de ~110 KB só para browsers antigos (`nomodule`), que os
  telemóveis actuais nem descarregam.

Reescrever o primeiro ecrã com menos código mexe nos ~80 KB, não nos ~470.

A «maior imagem» que a Google mede (LCP) é o logótipo, porque o Chrome não
conta fotografias de ecrã inteiro. O logótipo só se pinta depois de o telemóvel
ler a página (o HTML tem ~450 KB, dos quais ~300 KB são a folha de estilos duas
vezes, uma no `<style>` e outra na carga do React, por causa do `inlineCss`).

## Se alguém quiser voltar a isto

Os medidores ficaram no scratchpad da sessão, não no repositório:
- o perfil de CPU por ficheiro de origem;
- o mapa do JavaScript por ficheiro;
- a filmagem da passagem entre páginas.

O mais barato de refazer é o Lighthouse com `--blocked-url-patterns` para
isolar uma peça de cada vez, como acima.

## O deslize no iPhone (26/10)

Ela: «o site no telemóvel ao fazer scroll está a travar e tipo a voltar para
baixo». No iPhone (Safari e por dentro do Instagram/WhatsApp), em todas as
páginas: «encrava e salta para baixo», «pára no meio do gesto», «no topo, puxa
e volta».

Num Chromium a 390 px com o processador ÷4 não se reproduz (seis páginas, zero
recuos, CLS 0). As causas são as diferenças do WebKit do iPhone, e cada uma tem
a sua correcção, presa por `src/app/scroll-no-iphone.contrato.test.ts`:

| O que ela via | Causa | O que mudou |
|---|---|---|
| No topo, puxa e volta | o elástico lê-se no `html`; a regra só estava no `body` | `overscroll-behavior-y: none` também no `html` |
| Salta para baixo | o Safari não tem âncora de scroll, e os `.cv-panel` reservam uma altura estimada | no iOS (`@supports (-webkit-touch-callout: none)`) os painéis desenham-se todos desde o início |
| Pára no meio do gesto | a deriva da capa e a barra de progresso andam presas ao scroll | só com rato (`pointer: fine`); no toque a barra não existe |
| Encrava (quem chega do Instagram) | o aviso de cookies, à largura do ecrã, desfocava o que lhe passava por trás em cada fotograma | no toque, o mesmo verde a 95 %, sem desfoque |
| Encrava no primeiro deslize | os ~360 KB do Google começavam a correr no primeiro toque, que é o polegar a deslizar | o Google espera que a página sossegue (`GTAG_SOSSEGO_MS`) |

Não verificado num iPhone: não há WebKit aqui.
