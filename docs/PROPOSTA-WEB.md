# A proposta online — a página web própria (23/10)

O pedido dela, com o protótipo aprovado (`Proposta-Online-Liquen.zip`: `index.html`, `img/`, `LEIA-ME_CLAUDE_CODE.md`, `prep_imagens.py`):

> Quero substituir a página pública da proposta (/proposta/[id]) — que hoje mostra as páginas do PDF como imagens numa coluna estreita — por uma página web própria, a ecrã inteiro, gerada a partir dos MESMOS dados do editor (evento, mood boards, serviços, orçamento, condições). O PDF continua igual e fica acessível por um botão "Ver a proposta em PDF".

O protótipo **não** está no repositório: as fotografias dele são de uma cliente real. Fica guardado localmente em `referencia/` (que nunca entra nos commits).

## Parte −1 — as decisões dela e onde a execução se afasta do texto

### O que ela respondeu (31/10): o movimento de estúdio também aqui

Depois do pedido «nível estúdio» no site, ela perguntou se o mesmo dava para a proposta e para o back office. Posta a escolha à frente:
- **Proposta online — «Sim, com o movimento»**:
  - os títulos dos capítulos entram linha a linha, como os do site (`RevealText`, o mesmo componente);
  - o scroll suave só com rato ou trackpad (o Lenis do site, nunca no toque);
  - a rapidez e a acessibilidade medidas com a mesma régua do site (rede travada a sério, axe).

  Muda o que o casal vê, por isso **nada se junta sem ela ver no link de teste**.
- **Back office — «rapidez e acessibilidade»**: sem movimento novo e sem mudar o desenho.

As medições usam propostas e pedidos TESTE num servidor local, como os testes já fazem: nada em produção, nenhum email.

### O que ela respondeu (23/10)

- **«Qual vale?»** — a página web nova. O «só o PDF», que ela tinha pedido minutos antes, ficou de lado; o email e o WhatsApp continuam com o link.
- **«Quero avançar»** — «Fala connosco»: leva ao fecho, onde há «Responder por WhatsApp» (o número da casa, com a mensagem escrita) e «Responder por email». Nunca aceita nada sozinho — a regra de `nada-de-aceitar-por-botao.test.ts` continua.
- **Os links que já seguiram** — «Sim, todos»: abrem a página nova. Muda a apresentação; o documento guardado e o PDF enviado não mudam.

Isto **desfaz a decisão de 22/10** («a proposta online não tem nada a ver com a PDF», que pôs a página a mostrar as páginas do PDF). A resposta, agora, é a página ter o **conteúdo do PDF**: `a-pagina-e-o-pdf.test.ts` prende a decisão nova.

### Como está feito

| Peça | Onde | Nota |
|---|---|---|
| O conteúdo de cada secção | `montar.ts` → `conteudoDoEditorial` (`conteudo-web.ts`) | O MESMO motor do PDF, sem desenhar: textos na língua, valores de `totaisDaProposta`, e as fotografias que o álbum escolhe (com as escolhas e os enquadramentos dela). Um teste prende as fotografias às do PDF. |
| O modelo da página | `src/lib/proposta-web/modelo.ts` | Junta o conteúdo, os endereços assinados (`fotosDaProposta`) e os fundos. Nenhum caminho do armazenamento sai (há teste). |
| O mosaico | `src/lib/proposta-web/mosaico.ts` | Ver abaixo. |
| A página | `proposta/[token]/PropostaWeb.tsx` | As secções e as classes do protótipo. |
| O que mexe | `proposta/[token]/PropostaWebViva.tsx` | A barra depois da capa, as entradas, a lupa, o «Copiar», as fotografias que falham. |
| O CSS | `proposta/[token]/proposta-web.css` | O do protótipo, tal e qual, com os desvios abaixo. |
| Os fundos desfocados | `api/proposta/[token]/fundo/[id]` | O arrastado do PDF (`preparar`, ~14°), a partir da derivada de 1200 px. |
| Os textos da moldura | `src/lib/proposta-web/textos-web.ts` | PT e EN. Os do documento vêm do motor, nunca daqui. |

### Onde a execução se afasta do texto

1. **As classes têm o prefixo `pw-`** e o `:root` passou a `.pw`. O site já tem um `.dark` global, e um `.nav` ou `.btn` apanhariam a página um dia. O reset ficou em `:where(...)`, sem peso nenhum, para as escolhas do casal (em Tailwind) não mudarem.
2. **As letras vêm do `next/font`** (Bodoni Moda e Jost), servidas desta casa: o protótipo pedia-as ao Google em cada visita, e a página do casal não faz pedidos a terceiros (`zero-rastreio.test.ts`).
3. **O `srcset` é 400 / 1200 / original**, e não 800 / 1400 / 2000: são as derivadas que já existem e já estão assinadas. Não há redimensionamento a pedido nesta casa (`images.loader: "custom"`). Uma rota nova para isso seria `sharp` a cada visita.
4. **O mosaico** segue a regra do LEIA-ME (linhas completas, uma célula de texto por capítulo), mas somar células não chega: uma alta ao lado de uma larga deixa buracos. Por isso:
   - simula-se a grelha (`grid-auto-flow: dense`) para encontrar os buracos;
   - **o telemóvel tem a sua própria disposição** (`formaMovel`, classes `pw-m-*`), porque não há formas que sirvam as 4 colunas e as 2 ao mesmo tempo;
   - há uma forma «grande» (2×2), usada só para fechar a última linha quando nada mais a fecha.

   No telemóvel as linhas fecham sempre. No computador fecham em cerca de 97 % dos casos medidos; nos outros fica a última linha curta, nunca um buraco no meio.
5. **O logótipo** é `public/logo-liquen-proposta.png`: o mesmo branco do site, recortado (o original tem 3 747 px e margens transparentes, e saía minúsculo). A 23/10 ela pediu-o «muito maior»: na capa passou de 44 px a 84–140 px, e logo a seguir «demasiado grande, um pouco mais pequeno»: ficou em 66–104 px (cresce com o ecrã), 32 px na barra e 36 px no rodapé; o ficheiro foi refeito a 950×480 para não ficar desfocado.
10. **A paleta num ecrã largo:** as três fotografias tinham a altura delas, e num ecrã de ~2000 px a coluna chegava a dois ecrãs, com a paleta sozinha num mar escuro ao lado («está imenso espaço sem nada», 23/10). A grelha passa a ter a altura de um ecrã (no máximo 900 px) e o texto fica ao centro.
6. **Os fundos** são uma fotografia da proposta diferente da que está na moldura, sempre que haja outra. O brilho segue o `prep_imagens.py`: 0,42 na proposta, 0,62 nos capítulos, 0,38 no investimento e 0,32 no fecho.
7. **As cores da paleta** saem das miniaturas das fotografias das mesas (as mesmas que o PDF usa), e ficam guardadas em memória por proposta. Se falharem, a paleta aparece sem amostras.
8. **A rede:** se a página não se deixar montar (o armazenamento em baixo, por exemplo), fica o visor das páginas do PDF de antes. O casal nunca fica sem proposta.
9. **A introdução** («Pensámos cada pormenor…») é um texto da casa e não um campo. A 10/10 ela tirou o campo de intenção («não quero o campo, ponto final»), e não volta sem o «sim» dela. **Confirmado por ela (23/10):** «sim, a frase fica». E sobre a página, ao lado do protótipo: «está ótimo».

## Verificação

- Testes:
  - `mosaico.test.ts`: sem buracos a 4 e a 2 colunas; o telemóvel sempre completo;
  - `modelo.test.ts`: nenhum caminho sai; os nomes; as condições; o «Quero avançar»;
  - `fotos-do-pdf.test.ts`: as fotografias da página são as do PDF;
  - `a-pagina-e-o-pdf.test.ts` e `auth-guard-audit.test.ts` (a rota nova do fundo).
- No browser, com `next dev`, uma proposta TESTE enviada só por WhatsApp (nenhum email), a 1440 e a 390:
  - 0 imagens partidas;
  - 0 px de largura a mais;
  - a barra só depois da capa;
  - a lupa abre, anda com as setas e fecha com Esc;
  - o «Copiado» aparece;
  - nenhum erro na consola.

11. **«Quero avançar» saiu** (23/10, «retira o quero avançar e coloca o logo da liquen a meio»): na barra fica o logótipo ao meio, com as âncoras dos dois lados. O fecho continua com «Responder por WhatsApp» e por email. A mensagem do WhatsApp passa a ser a dela: «Olá Catarina! Vi a proposta e gostámos muito daquilo que nos apresentou!».
12. **Texto comido** (23/10): a célula de texto do mosaico tinha a altura de uma fotografia, e um título comprido subia por baixo da fotografia de cima. As linhas do mosaico passam a crescer com o texto; no telemóvel o título tem menos espaço entre letras. E a página pede ao Safari do iPhone que não aumente o texto sozinho (`text-size-adjust`). Verificado com uma proposta TESTE de títulos e notas compridos, a 320, 390, 768, 1024, 1440 e 2000 px: nenhum texto cortado nem tapado (antes eram 11).

## A rapidez (23/10)

Palavras dela: «quero que melhores mesmo muito a resposta e a rapidez e fluidez da proposta online e de quando carregamos no email para ver e ela demora tempo até aparecer».

O que custava, a cada visita, numa função acabada de acordar:

| O quê | Antes | Agora |
|---|---|---|
| O conteúdo (medidas das fotografias, álbum, textos) | refeito a cada visita; as fotografias que a biblioteca não conhecia eram descarregadas e passadas pelo `sharp` | calculado **uma vez** por proposta e língua, guardado em memória e no `app_state` (`proposta-web/guardado.ts`) |
| As cores da paleta | doze miniaturas descarregadas e analisadas por instância | calculadas uma vez e guardadas da mesma maneira |
| Quando se calcula | na primeira visita do casal | **logo no envio**, depois da resposta (`after`, no `proposta-doc`); os links que já seguiram calculam na primeira visita e ficam |
| A ordem | a página web só começava depois das escolhas do casal | começa ao mesmo tempo que elas |
| Os fundos arrastados | descarregados da derivada de 1200 px; ficavam no browser um dia | partem da miniatura (o desfoque é feito a 480 px de qualquer maneira); ficam no browser um ano (o endereço muda com a fotografia) |

A chave do que se guarda é o próprio documento: um documento diferente é outra chave. Ficar igual ao PDF que seguiu é o objectivo — esse PDF também ficou guardado no envio.

**Não verificado:** o tempo em produção, com uma proposta verdadeira — não se abrem propostas de clientes. Mede-se aqui com uma proposta TESTE.
