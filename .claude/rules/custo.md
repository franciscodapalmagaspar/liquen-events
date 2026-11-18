# Custo — nunca pagar mais do que os planos

Pedido do Francisco (13/11, palavras dele): «eu não quero pagar mais por nada»; «não quero pagar mais que 20 €»; «não quero pagar Supabase, não quero pagar Cloudflare»; «manter ou elevar o nível da Líquen sempre, mas sempre a trabalhar para o máximo possível de otimização de gasto de dinheiro».

- A conta de cada serviço fica DENTRO do que já se paga ou do gratuito, sempre:
  - Vercel: plano Pro, nunca acima de 20 € por mês no total.
  - Supabase: plano GRATUITO (1 GB de ficheiros, 500 MB de base de dados, 5 GB de saída) — muito abaixo.
  - Upstash: gratuito, muito abaixo (só nas portas de contas e envios).
  - IA (Claude): só o que vier incluído no plano dele (Pro/Max/Ultra). Nada de chaves de API pagas sem limite: se houver chave, tem tecto de gasto definido na consola igual ao incluído, e o código funciona sem ela.
- Antes de propor um serviço, uma API ou uma funcionalidade que possa custar dinheiro, procura primeiro a forma de o fazer de graça com código, estrutura ou «manhas» (cache, build, navegador, tarefas da noite, ferramentas que já se pagam — como o Claude Code do plano dele). Só se não houver, explica o custo e pergunta.
- Todo o recurso pago por uso tem de ter, no código, um travão que impeça passar do gratuito — e um aviso antes de lá chegar.
- No PR, as 3 perguntas de custo da regra 7 continuam obrigatórias.
- NUNCA propor um serviço que peça cartão ou meio de pagamento, mesmo com plano gratuito (ex.: Cloudflare R2). Só serviços que já se pagam ou que são grátis sem cartão. (correção 2026-11-16: «eu não quero estar a pagar nada»)
- Gastar o mínimo é das prioridades mais urgentes, desde o primeiro dia e em tudo (site, back office, estúdio; o mesmo na Palumen): cada coisa nova nasce otimizada para a Vercel, a base de dados e o armazenamento, com código e «manhas» — sem ele ter de o pedir — e sempre para melhorar a qualidade, nunca para a piorar. (pedido 2026-11-16, repetido: «não quero estar constantemente a dizer»)
- Só se paga a Vercel, e mais nada. E mesmo na Vercel o objetivo é o custo mínimo possível: o crédito incluído no Pro não é para gastar, é folga. Antes de usar um recurso pago por uso (mesmo «incluído», como o Blob), esgota primeiro as manhas grátis — juntar duplicados, apagar caches que se refazem, comprimir sem perder qualidade, fazer no build ou no navegador. (correção 2026-11-17: «É o Vercel, nada mais» · «mesmo no Vercel é custo mínimo maior possível»)
- Cada proposta já chega com o custo estudado e reduzido ao mínimo, dito em números, sem ele ter de perguntar «isto não vai gastar?». (correção 2026-11-17: «eu não preciso estar sempre a repetir»)
- Limite do plano do Claude: quando o uso semanal chegar aos 55%, parar o trabalho dos agentes (cada um fecha o passo verificado, faz push e pára) e avisar. Se não se conseguir ler a percentagem e o aviso de limite já estiver ligado, parar por segurança e perguntar-lhe a percentagem. (pedido 2026-11-18: «quando o limite semanal estiver nos 55% para»)
