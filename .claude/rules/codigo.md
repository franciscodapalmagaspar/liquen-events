# Código de nível mundial

Pedido do Francisco (17/11): «quero ter uma estrutura de código e um código a nível mundial de topo mesmo, tanto no back-office como no site», ao ponto de um programador de topo olhar e dizer «isto está incrível». Vale para este projeto e para todos os futuros (sites, sistemas, software).

- Nenhum ficheiro novo passa das ~400 linhas, nem um componente das ~250. Quando um ficheiro que já existe cresce, parte-se pelo domínio (dados, regras, interface), em vez de se lhe acrescentar mais. O `ProposalStudio.tsx`, com 16 mil linhas, é o exemplo do que não pode voltar a acontecer. (17/11)
- Cada regra de negócio vive num sítio só, numa função pura com testes, e o ecrã, o PDF e as rotas leem-na de lá. Nada de lógica copiada entre ficheiros. (17/11)
- Os dados têm uma forma única e validada na fronteira (rota, base de dados, ficheiro): tipos fortes e nada de `any`. Os nomes dizem o que as coisas são no negócio. (17/11)
- Antes de estruturar algo novo (dados, pastas, estado, rotas), segue o que os melhores fazem e está documentado. Na dúvida, investiga primeiro. (17/11)
- Cada lição aprendida aqui (um erro, um padrão que funcionou) fica escrita em `docs/ESTRUTURA-DO-CODIGO.md`, para servir também aos projetos seguintes. (17/11)
- A fasquia é a das empresas de topo (Vercel, Linear, Stripe, Shopify): cada PR de estrutura passa, além da revisão de erros, por um «júri de arquitetura». É um agente independente que avalia o diff como um engenheiro principal dessas empresas avaliaria (nomes, fronteiras entre módulos, coesão, testes, legibilidade), e o PR só entra quando o júri disser que está a esse nível. (pedido 2026-11-17: «tem que ficar incrível de empresas de topo»)
- O júri de arquitetura dá uma nota de 0 a 10. Nenhum PR de estrutura entra com menos de 9; se der para chegar ao 10, vai-se ao 10. (pedido 2026-11-17: «tem que ficar pelos 9 de 10 e se der para chegar ao 10 vamos ao 10»)
