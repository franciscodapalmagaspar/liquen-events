@AGENTS.md

# O sistema de design manda

Todo o trabalho de interface no back office segue `docs/DESIGN-SYSTEM.md`. Lê o
ficheiro inteiro antes de tocar em qualquer componente. Nenhum valor de cor,
espaço, raio, duração ou curva pode existir fora dos tokens definidos nesse
ficheiro.

A **Parte −1** desse documento lista as quatro adaptações a esta casa que não
são opcionais — o gestor de pacotes, o prefixo dos tokens de duração no
Tailwind v4, a separação do CSS do back office, e a regra de convergir a família
de material que já existe em vez de criar uma segunda ao lado.

# E o ecrã «Fazer proposta» tem um documento só dele

`docs/FAZER-PROPOSTA.md` reconstrói o ecrã onde ela passa mais tempo. Lê-o antes
de tocar em `/orcamento/admin/propostas/nova` ou `/propostas/[id]/editar`.

A **Parte −1** regista a única alteração ao documento, e é dela: o ponto 3 manda
a barra de destinos do fundo desaparecer em favor de uma coluna à esquerda, e ela
respondeu **«Fica a barra de baixo»** quando lhe pus a escolha à frente. A fase
01 desse documento não se faz; tudo o resto vale.

# E as melhorias desse ecrã também

`docs/FAZER-PROPOSTA-MELHORIAS.md` é o documento dela com sete melhorias ao
«Fazer proposta» (passos, pré-visualização real, fotografias, bloqueio do envio,
rapidez, duplicados). A **Parte −1** tem a tabela do que está feito e os sítios
onde a execução se afastou do texto. A regra que manda no envio continua a ser
uma só, em `proposal-progress.ts` (`oQueFaltaParaEnviar`): a Conferência copia
a marca de «trava» de lá, e a rota do envio recusa os mesmos erros.
Os cinco passos do estúdio (A2) são um formulário só, sempre montado: o que
vive em cada passo e o estado de cada um estão em `passos-do-estudio.ts`, que
lê as mesmas duas listas — não contes o estado de um passo noutro sítio.

# E o ecrã de entrada tem outro

`docs/LOGIN.md` reconstrói `/orcamento/admin/login`. Tem no topo uma tabela com
o que já está feito e o que falta — lê-a antes de refazer seja o que for.

# E o guião do dia também

`docs/GUIAO-DO-DIA.md` explica a vista «Guiões do dia» (`?v=guioes`), o motor
que ela reutiliza (`lib/orcamento/guiao-do-dia.ts`, que já cá estava) e os
modelos de guião. Lê-o antes de tocar no `Guioes.tsx`, no `ReguaDoDia.tsx` ou no
`EventTimeline.tsx`.

A decisão que o abre é a que interessa a quem vier a seguir: **a vista de topo
MONTA o `EventTimeline` que já existe** em vez de ter um editor próprio. Um
segundo editor de guiões ao lado do primeiro é o defeito que a Parte −1 do
sistema de design manda evitar — e, aqui, seriam dois ecrãs a discordar sobre o
mesmo dia num papel que se entrega à equipa na manhã do evento.

# E o vidro tem o seu

`docs/LIQUID-GLASS.md` é o documento dela sobre o material — porque é que um
`backdrop-filter: blur()` não é Liquid Glass, o que é preciso acrescentar-lhe, e
a tabela de valores por superfície. O motor está em `src/lib/liquid-glass.ts` e a
ponte para React em `ui/Glass.tsx`.

A **Parte −1** regista as quatro decisões em que a execução se afastou do
documento — a primeira superfície não é a que ele nomeia (a barra do portal do
cliente não existe), o `cluster()` ficou de fora até haver o que fundir, as
curvas `linear()` já cá estavam, e o `position` do `.lg` vive no JS e não no CSS.

E as duas regras da Parte 5 que nenhum ficheiro consegue fazer cumprir sozinho,
portanto ficam aqui: **uma camada de vidro por ecrã** — vidro sobre vidro
transforma o fundo em papa cinzenta —, e **vidro só no que flutua**; listas,
tabelas e formulários ficam opacos. Antes de pôr um `<Glass>` num ecrã, conta os
que já lá estão.

# E há três ecrãs com documento próprio à espera

`docs/APPLE-TAREFAS.md`, `docs/APPLE-CALENDARIO.md` e `docs/APPLE-TEMAS.md` são
os três documentos dela para reconstruir esses ecrãs segundo o sistema da Apple.
Cada um abre com uma tabela **auditada no código** — não de memória — do que já
está feito e do que falta, no formato do `docs/LOGIN.md`. Lê a tabela antes de
refazer seja o que for.

Ela escolheu a ordem: **«prefiro as tarefas primeiro»**. Em resumo, hoje —
e cada tabela é que manda, isto é só o mapa:

  · **Tarefas**: onze de onze. A 11 era percorrer a Parte 6 num browser, e está feita;
  · **Calendário**: as quatro vistas existem (dia, semana, mês, ano). Falta a
    09 (arrastar); a 11 (acessibilidade) ficou feita com o achado n.º 24 da
    auditoria; a 01, a 05 e a 10 estão parciais;
  · **Temas**: a 06, a 07, a 08 e a 09 ficaram feitas; a 01, a 02, a 03, a 05
    e a 10 estão parciais, e a 04 e a 11 por fazer.

Repara que a 11 do Calendário e a dos Temas são a mesma peça: passar a grelha de
`role="button"` a `role="grid"` com `gridcell`. A do Calendário está feita
(`Calendario.tsx`, com o `diaPelaTecla`); a dos Temas segue o mesmo desenho e
ficou por fazer — a grelha de fotografias tem arrasto, selecção múltipla e um
número de colunas que muda com a largura, e não tinha erro no axe. (A das
Tarefas NÃO era essa: a lista é `<ul>/<li>`, e a 11 foi percorrer a Parte 6 inteira.
Este mapa dizia o contrário e estava errado: a tabela de cada documento é que manda.)

Estes três andaram perdidos: chegaram pelo chat e nunca ficaram guardados. O do
Liquid Glass fez o mesmo caminho e só se recuperou por sorte. **Um documento que
ela manda guarda-se em `docs/` no mesmo dia** — é isso que impede o próximo de
se perder.

# E as propostas e os temas, todos juntos, também têm o seu

`docs/PROPOSTAS-E-TEMAS-APPLE.md` é o plano dela em seis fases (bases, Temas,
estúdio, PDF, fotografias, proposta web). A **Parte −1** regista o que ela
respondeu quando o comparei com o código: **fica a barra de baixo**, **o
logótipo fica ao centro**, **fica o Geist**, e **usam-se os tokens que já
existem** — nenhuma segunda família, contraste ≥ 4,5:1. Lê-a antes de seguir
o §6 à letra: quase todos os valores de lá já existem cá com outro nome, e
alguns dos nomes de lá (`--text-*`, `--accent`, `--ease-sheet`) já querem dizer
outra coisa nesta casa.

# E o PDF da proposta tem o seu

`docs/PDF-EDITORIAL.md` é o documento dela para o redesenho do PDF (o desenho
escuro do exemplo «Mafalda & João»). O código novo está em
`src/lib/pdf-editorial/`, e **ela aprovou-o**: é o do envio, do link do casal e
do estúdio. O gerador antigo (`proposal-doc-pdf.ts`) fica sem uso nas rotas até
um PR à parte o apagar. O estúdio conta e mostra as páginas pelo `plano.ts`
(um teste prende-o ao PDF) — não voltes a contar páginas noutro sítio. Lê a
**Parte −1** antes de seguir o texto à letra: lá está a tabela do que já está
feito, e os sítios onde a execução se afastou do texto (uma só cor de
destaque, nenhum fundo desfocado, capa só com a fotografia de fundo, logótipo no
rodapé). A
referência que conta é o exemplo NOVO, de 26 páginas.

# E o design NOVO do PDF, de 23/10

`docs/PDF-DESIGN-NOVO.md` é o documento dela que SUBSTITUI o desenho do
`docs/PDF-EDITORIAL.md`: fotográfico, com fundos «arrastados» nas páginas de
texto, Jost + Bodoni Moda, sem dourado. O que o PDF-EDITORIAL decidiu sobre
dados e lógica (capítulos, casamento/não casamento, escolha das fotos e das
disposições, paleta das mesas) continua a valer; onde os dois se contradizem
no desenho, ganha o novo. O modelo (`Modelo-Proposta-Liquen.pdf`) está em
`referencia/`, fora do git. Mexe no PDF: nada se junta sem a aprovação dela.

# E o plano do site e da galeria, também

`docs/PLANO-SITE-E-GALERIA.md` junta quatro análises de 11/10 (galeria, site
público, segurança, áreas novas) num plano com códigos (GAL-, DES-, TXT-, PED-,
NAV-, IA-, CON-, POS-, NEG-, SEG-) e um roteiro. **É uma lista para ela escolher,
não uma ordem de trabalho**: antes de fazer um ponto, confirma que ela o escolheu.
A Parte −1 diz o que ficou por verificar; a Parte 10 deixa de fora os pormenores
de segurança enquanto o repositório estiver público.

# E o mapa de mesas tem o seu

`docs/MAPA-DE-MESAS.md` regista o pedido dela (14/10), as decisões que tomou e a
tabela do que está feito. As regras vivem num sítio só,
`src/lib/orcamento/mapa-de-mesas.ts`, e o ecrã e o PDF lêem as mesmas funções:
não se desenha uma cadeira noutro sítio.
