# Componentes `'use client'` do site público (Fase 0, 30/10/2026)

Contados no código, no ramo `melhoria/nivel-estudio` acabado de sair do `main` (`10ab60f`).

## Os números
- **258** ficheiros têm `'use client'` no repositório.
  - 188 são do back office (`(admin)`), 5 da proposta privada, e 1 hook é só usado por esses dois.
  - Não se tocam.
- **3** não são importados por ninguém (código morto): `TestimonialsCarousel.tsx`, `motion/TiltCard.tsx`, `motion/PhotoWall.tsx`.
- Ficam **61** no site público.
  - **28** vão em TODAS as páginas: 7 pelo layout da raiz, 21 pelo cromado do sítio.
  - 9 são da página inicial.
  - 13 são de outras páginas.
  - 10 são partilhados.

## Podiam ser Server Components (8)
| Ficheiro | Porquê |
|---|---|
| `components/motion/SmoothScroll.tsx` | `INERCIA_NA_RODA = false`: o efeito sai logo e o contexto vale sempre `null`. Vai em todas as páginas e não faz nada. |
| `components/motion/HeroWebGL.tsx` | `heavyEffectsWelcome()` devolve sempre `false` e o componente devolve sempre `null`. Está em seis páginas. |
| `(site)/contacto/FAQ.tsx` | Só tem um `useState` para abrir e fechar. Passa a `<details>`/`<summary>` nativos. |
| `(site)/NotFoundView.tsx` e `s/NaoEncontradoSocial.tsx` | Só lêem as traduções do contexto. |
| `lib/site-image-loader.ts`, `galeria/prioridade-a-vista.ts`, `lib/motion/rolar.ts` | Funções sem hooks: a directiva está a mais. |

## Podiam partir-se numa casca servidor com uma ilha pequena (4)
| Ficheiro | O que fica no cliente |
|---|---|
| `components/Navbar.tsx` (896 linhas, em todas as páginas) | Só o estado do scroll e do menu. As listas de links e o logótipo podem vir do servidor. |
| `components/Analytics.tsx` (em todas) | Só o `PlausibleTracker`. |
| `components/RotatingPhotoGrid.tsx` (/clientes) | Só o baralhar ao montar. |
| `components/meta/BarraFixa.tsx` (/s) | Só as duas âncoras com medição. |

## Têm de continuar no cliente (49)
Usam estado, eventos ou APIs do browser:
- consentimento, Google Tag, Plausible, Web Vitals, origem do lead;
- menu de idioma, WhatsApp, CTA fixo, barra de leitura, linha de carregamento, anel de foco, transição de página, service worker, mola, erros;
- `SafeImage`, `HeroImage` (fronteira do loader), `EntradaEmVideo` (1922 linhas), `AnimateIn`, `Parallax`, `Reveal`, `ClientMarquee`, `SetaDeDescer`;
- galeria (2754 linhas), formulários de orçamento e dos anúncios, `CampoTelefone`, `ClientLogoGrid`, `TitleReveal`, `MetaPixel`, `TempoNaGaleria`;
- os dois ficheiros de erro, que o Next exige.

## Bibliotecas pesadas no público
- **`ogl`**: só no `HeroCanvas`, com `dynamic()`. O portão está sempre fechado, por isso nunca é descarregada.
- **`libphonenumber-js`** (~150 KB) e **`country-flag-icons`**: só por `import()` quando se toca no telefone.
- **`web-vitals`**: por `import()`.
- **`pdfjs-dist`** e **`@dnd-kit`**: só no privado e no back office.
