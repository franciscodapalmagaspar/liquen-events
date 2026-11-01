# O back office — rapidez e acessibilidade (31/10/2026)

O pedido dela de 31/10 foi aplicar ao back office a régua do «nível estúdio», só na rapidez e na acessibilidade, sem movimento novo e sem mudar o desenho (ver `docs/PADRAO-PALUMEN.md`, Parte −1).

**Como se mediu.**
- Um servidor de produção local (`next start`) com a palavra-passe de desenvolvimento que já está no repositório (a mesma do `scripts/bench-back-office.mjs`).
- Só os dados locais desta máquina. Nada em produção, nenhum email.

## Acessibilidade — o axe nas 21 vistas, a 390 e a 1440 px
Regras WCAG 2.0, 2.1 e 2.2, A e AA.

| Vista | Resultado |
|---|---|
| As outras 19 vistas (Visão geral, Pedidos, Clientes, Calendário, Propostas, Acompanhamento, Fazer proposta, Guiões, Mesas, Tarefas, Fornecedores, Inventário, Material, Temas, Estatísticas, Contratos, Definições, Serviços, Reciclagem) | limpas nas duas larguras |
| Kanban | `scrollable-region-focusable` (sério): com as colunas vazias, a faixa que rola de lado não tinha por onde o teclado entrar. **Corrigido**: a faixa tem nome («Colunas do quadro») e lugar na ordem do teclado. Limpa depois. |
| Modelos de email | Limpa. O axe pendurava-se na pré-visualização: um `iframe` sem permissão para scripts, de propósito. Analisou-se a vista sem esse frame. |

## Rapidez
- **O JavaScript.** O `scripts/peso-das-rotas.mjs` dá ao painel 486 kB, com tecto de 520 kB.
  - O `bench-back-office.mjs` conta 612 kB no arranque, porque inclui a pré-carga de todas as vistas.
  - A pré-carga é de propósito (`lazy.tsx`): é o que torna a mudança de vista imediata. Não se mexeu.
- **O salto ao abrir (CLS).** O medidor deu 0,067 no computador, e aqui mediu-se 0,213 no telemóvel. A causa é o aviso «O trabalho não está a ser guardado» (`AvisoDeArmazenamento`), com 214 px, que entra por cima da vista aos ~0,9 s.
  - Só aparece quando não há Supabase ligado, que é o caso desta máquina.
  - Com a resposta de produção (`avisar: false`) o CLS é **0** em seis vistas (Visão geral, Pedidos, Propostas, Calendário, Tarefas, Temas), a 390 e a 1440 px, com o CPU ÷4.
  - Não é um defeito do painel dela.
- **O medidor está desactualizado.** A secção «mudança de vista» do `bench-back-office.mjs` procura uma vista «Faturas» que já não existe, e todas as vistas esgotam o tempo (20 s). Fica para um PR à parte: não se mede uma coisa com uma régua partida.

**Não verificado:** o painel em produção, com os dados verdadeiros e o Supabase. Não se abre o back office de produção.
