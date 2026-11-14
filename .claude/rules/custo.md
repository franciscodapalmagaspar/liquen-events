# Custo — nunca pagar mais do que os planos

Pedido do Francisco (13/11, palavras dele): «eu não quero pagar mais por nada»; «não quero pagar mais que 20 €»; «não quero pagar Supabase, não quero pagar Cloudflare»; «manter ou elevar o nível da Líquen sempre, mas sempre a trabalhar para o máximo possível de otimização de gasto de dinheiro».

- A conta de cada serviço fica DENTRO do que já se paga ou do gratuito, sempre:
  - Vercel: plano Pro, nunca acima de 20 € por mês no total.
  - Supabase: plano GRATUITO (1 GB de ficheiros, 500 MB de base de dados, 5 GB de saída) — muito abaixo.
  - Upstash: gratuito, muito abaixo (só nas portas de contas e envios).
  - Cloudflare R2: só os 10 GB / 1 M operações A / 10 M operações B gratuitos por mês — o código tem tectos próprios bem abaixo disso (nunca depender de a Cloudflare parar sozinha: ela cobra).
  - IA (Claude): só o que vier incluído no plano dele (Pro/Max/Ultra). Nada de chaves de API pagas sem limite: se houver chave, tem tecto de gasto definido na consola igual ao incluído, e o código funciona sem ela.
- Antes de propor um serviço, uma API ou uma funcionalidade que possa custar dinheiro, procura primeiro a forma de o fazer de graça com código, estrutura ou «manhas» (cache, build, navegador, tarefas da noite, ferramentas que já se pagam — como o Claude Code do plano dele). Só se não houver, explica o custo e pergunta.
- Todo o recurso pago por uso tem de ter, no código, um travão que impeça passar do gratuito — e um aviso antes de lá chegar.
- No PR, as 3 perguntas de custo da regra 7 continuam obrigatórias.
