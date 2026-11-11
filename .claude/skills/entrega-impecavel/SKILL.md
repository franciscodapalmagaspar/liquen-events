---
name: entrega-impecavel
description: Usar antes de dar por terminada qualquer tarefa de código ou site (antes de dizer 'feito' ou abrir PR) — verifica tudo sozinho com testes, screenshots e consola para nada chegar partido ao Francisco.
---

# Entrega impecável

Regra de ouro: o Francisco nunca deve ser o primeiro a encontrar um erro. Nada é "feito" sem prova.

## 1. Código
- Corre lint, typecheck (`tsc --noEmit` ou `astro check`) e testes do projeto. Corrige o que falhar.
- Corre o build. Um build partido nunca vai para PR.
- Se mudaste lógica (cálculos, datas, dinheiro, auth), escreve ou atualiza um teste que o prove.

## 2. Visual (sempre que mexeste em UI)
- Arranca o servidor de dev e usa Playwright para abrir as páginas alteradas.
- Screenshots em 3 tamanhos: telemóvel (390px), tablet (768px), desktop (1440px).
- Olha para os screenshots e procura: texto cortado, sobreposições, scroll horizontal, contraste fraco, imagens esticadas, espaçamentos inconsistentes.
- Testa o modo escuro se existir, e todas as línguas do site.
- Lê a consola do browser: zero erros e zero warnings novos.

## 3. Fluxo real
- Percorre o fluxo como um utilizador: clica, preenche formulários com dados realistas em português, submete, recarrega, volta atrás.
- Testa o caso feio: campo vazio, texto muito longo, ligação lenta, duplo clique.

## 4. Relatório final (curto)
- Build ✅ · Testes ✅ (N) · Consola limpa ✅
- Mobile / Desktop: screenshots no PR (antes/depois se for visual)
- O que mudou: 1–3 linhas
- O que não consegui verificar: se houver, com o motivo

Se algo falhar e não conseguires corrigir, diz claramente o que falha — nunca escondas nem digas "deve funcionar".
