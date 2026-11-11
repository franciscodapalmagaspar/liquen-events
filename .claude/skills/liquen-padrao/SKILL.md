---
name: liquen-padrao
description: Usar em qualquer trabalho para a Líquen Events ou Líquen Flowers — back office, site, landing pages, anúncios, propostas, legendas de Instagram, materiais para noivos.
---

# Padrão Líquen

Líquen Events (desde 2018): decoração, organização e produção de casamentos e eventos. Marca irmã: Líquen Flowers (2022), arte floral. Utilizadora principal do back office: Catarina (CEO, perfil "Administração"). Objetivo: chegar a todo o mercado de eventos em Portugal.

As regras em `.claude/rules/` ganham a esta skill se houver conflito.

## Marca e estética
- Cor da marca: sage green `#5F7C66`. Nunca verdes vivos/saturados.
- Clean, minimalista, premium, muito espaço em branco. Referências: Apple, SpaceX, Pixelmatters, Aernova (site); Laus Events e With M Events (fotografia).
- Animações fluidas e subtis, ao nível da Pixelmatters.

## Back office (liquen-events.com/orcamento/admin)
Secções: Visão Geral, Pedidos, Fazer proposta, Propostas, Calendário, Tarefas; em "Mais": Propostas Aceites, Material, Temas, Estatísticas, Definições.
- Design: Apple Human Interface Guidelines (Foundations + Patterns) e Liquid Glass.
- Pensado para a Catarina: rápido, sem jargão técnico, poucos cliques.
- Propostas: envio por email com PDF anexado. NÃO implementar tracking de abertura/leitura.
- Valores monetários: calcular sempre a partir das linhas base, nunca somar em cima de um total já guardado. Testar abrir → guardar → reabrir sem alterar o total.
- Antes de mexer num módulo, se o graphify estiver disponível, corre `graphify explain "<Módulo>"`.
- Funcionalidades novas: propor primeiro (ideias + impacto), salvo se o Francisco disser para implementar.

## Copy e redes sociais
- Legendas Instagram: curtas, poéticas, 2–3 linhas, sem emojis, nomes dos noivos e ano no fim. Hashtags no primeiro comentário.
- Português europeu. Tom elegante e caloroso, nunca comercial agressivo.
- Anúncios (Google/Meta): foco em pedido de orçamento; landing pages limpas com um único CTA.

## Materiais para noivos
- Menus, seating plans, mood cards: tipografia elegante, bilingue quando preciso, PDF pronto a imprimir (frente e verso quando aplicável).

## Checklist final
1. Respeita a cor e a estética da marca?
2. A Catarina usa isto sem ajuda?
3. Funciona bem em telemóvel?
4. Português europeu sem erros?
