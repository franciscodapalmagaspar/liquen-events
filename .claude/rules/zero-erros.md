# Zero erros a chegar à Catarina

Pedido do Francisco (13/11): «é mesmo importante que tu uses e testes tudo e mais alguma coisa para testar erros […] para depois não ter que a Catarina andar a dizer que certas coisas não funcionam ou travam» · «temos que baixar a taxa de erro para os 0.000000000001%» · «investigar e usar tudo para ver».

Antes de dar QUALQUER trabalho por feito (além da skill `entrega-impecavel`):

- **Revisão independente.** Um agente revisor lê o diff à procura de erros reais (estados, índices, casos vazios, telemóvel, rede lenta/falhada, memória, regressões noutros sítios), sem receber as minhas conclusões. Corrijo o que for confirmado e peço **uma segunda passagem** às correções — as correções também trazem erros (13/11: a 1.ª revisão achou 8, a 2.ª achou mais 4 nas correções).
- **Um teste por cada erro encontrado**, para não voltar.
- **Browser a sério** (Playwright), não só testes: 390 / 768 / 1440 px, claro e escuro, consola sem erros, sem deslocação horizontal, o fluxo inteiro como ela o faz.
- **Telemóvel com toque a sério** (toque curto, toque longo, deslizar a página por cima) — o rato não prova o dedo.
- **Os casos feios**: sem dados, fotografia/ficheiro partido, rede que não responde, duplo clique, desfazer, texto enorme, recarregar a meio.
- **Custo**: o que gasta rede, memória ou Supabase/Vercel (ex.: não descarregar originais de vários MB quando há uma versão média).
- Dizer sempre o que **não** consegui verificar e porquê.
- Fasquia geral (pedido 2026-11-17: «quero tudo a 9 de 10»): cada área da Líquen (site público, back office, «Fazer proposta», proposta online e PDF, segurança, desempenho, acessibilidade, legal, custo, código) é avaliada por um júri independente de 0 a 10. Nenhuma fica abaixo de 9, e onde der chega-se ao 10: o objetivo é um patamar nunca antes visto numa empresa de eventos (pedido 2026-11-17). As notas e o que falta ficam em `docs/NOTAS-DA-LIQUEN.md`, atualizadas sempre que uma área muda.
