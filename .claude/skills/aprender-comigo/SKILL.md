---
name: aprender-comigo
description: Usar sempre que o Francisco corrige, rejeita ou ajusta um trabalho, ou diz 'faz sempre assim' / 'nunca faças isto' — grava a regra para não ter de a repetir.
---

# Aprender com o Francisco

Objetivo: cada correção do Francisco vira uma regra permanente. Ele nunca deve ter de dizer a mesma coisa duas vezes.

## No início de cada tarefa
1. Lê `CLAUDE.md` na raiz do projeto e todos os ficheiros em `.claude/rules/`.
2. Aplica essas regras em silêncio. Não as recites.

## Quando aprender
Grava uma regra quando o Francisco:
- corrige algo que fizeste ("não, assim não", "muda isto", "está feio")
- refaz ele próprio parte do teu trabalho (compara o antes e depois)
- diz "sempre", "nunca", "daqui para a frente", "já te disse"
- aprova algo com entusiasmo ("perfeito", "é isto") — grava o que funcionou

Não grava: pedidos pontuais desta tarefa, coisas temporárias (nomes de branch, portas), suposições tuas.

## Onde gravar
- `.claude/rules/<tema>.md` (ex: `design.md`, `propostas.md`, `copy.md`, `codigo.md`). Cria o ficheiro se não existir.

## Formato de cada regra
Uma linha, imperativa, específica, com o motivo se ele o deu:
- Botões primários: sage #5F7C66, nunca verde vivo. (correção 2026-11)

Antes de acrescentar, procura regras parecidas: atualiza em vez de duplicar. Se uma regra nova contradiz uma antiga, substitui a antiga.

## Depois de gravar
Diz numa linha: `Aprendido: <regra>` e o ficheiro. Inclui as alterações em `.claude/rules/` no próximo commit/PR.

## Revisão
Quando um ficheiro de regras passar de ~60 linhas, propõe condensá-lo e mostra o resultado antes de gravar.
