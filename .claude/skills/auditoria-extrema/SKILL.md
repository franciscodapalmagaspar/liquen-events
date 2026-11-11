---
name: auditoria-extrema
description: Usar quando o Francisco pede para auditar, rever a fundo, elevar o nível ou encontrar todos os problemas de um projeto (back office, site, app).
---

# Auditoria extrema

## 1. Mapear
- Se o graphify estiver disponível: `graphify update .` e lê `graphify-out/GRAPH_REPORT.md`.
- Usa as comunidades do grafo como lista de áreas a auditar e os god nodes como pontos de maior risco.
- Sem graphify: lista pastas, rotas, modelos de dados e componentes principais.
- Lê `CLAUDE.md` e `.claude/rules/`.

## 2. Auditar cada área
- **Bugs**: cálculos (dinheiro, datas), estados que se perdem, dados duplicados, erros não tratados.
- **Segurança**: rotas admin sem proteção, chaves expostas, RLS no Supabase, inputs sem validação.
- **Performance**: queries repetidas, imagens pesadas, renders desnecessários.
- **UX**: cliques a mais, mensagens de erro confusas, mobile.
- **Design**: consistência com as regras do projeto.
- **Código**: duplicação, ficheiros gigantes, código morto.

## 3. Entregar
`AUDITORIA.md` com:
- Resumo de 5 linhas: estado geral e os 3 problemas mais graves.
- Tabela por prioridade (Crítico / Alto / Médio / Baixo): área, problema, ficheiro, correção, esforço (S/M/L).
- Quick wins: o que se resolve em menos de 30 min.

Não corrigir nada durante a auditoria. No fim, pergunta por onde começar e corrige um tema por PR.
