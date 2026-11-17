# Líquen Events: o texto legal do formulário, do rodapé e dos e-mails

**Para:** a sessão do Claude que trabalha no repositório `liquen-events`
**Pedido de:** Francisco, 17/11/2026
**Objetivo:** pôr no site da Líquen o que o site da Palumen já tem:
- a nota de proteção de dados por baixo do formulário;
- o Livro de Reclamações e a resolução de litígios no rodapé de todas as páginas;
- o mesmo rodapé nos e-mails;
- o filtro anti-spam do formulário.

Tudo em registo formal e com textos verdadeiros. Nada entra no `main` sem a aprovação da dona.

---

## 1. Por baixo do formulário: a nota de proteção de dados

Vai logo por baixo do botão «Enviar», em letra pequena e cor suave, com ligação para a Política de Privacidade. Não leva caixa de «aceito»: a base legal é o pedido do próprio titular, por isso não se pede consentimento.

**PT**
> A Líquen Events trata estes dados apenas para responder ao pedido e preparar a proposta, a pedido do titular (artigo 6.º, n.º 1, alínea b), do RGPD). Os pedidos que não resultem em evento são eliminados ao fim de 12 meses. Os prestadores envolvidos, os direitos do titular e a forma de os exercer constam da [Política de privacidade](/privacidade).

**EN**
> Líquen Events processes this data solely to respond to the request and prepare the proposal, at the request of the data subject (Article 6(1)(b) GDPR). Requests that do not lead to an event are deleted after 12 months. The service providers involved, the rights of the data subject and how to exercise them are set out in the [Privacy policy](/en/privacidade).

**Atenção:**
- Os 12 meses têm de bater certo com o que a Política de Privacidade da Líquen diz. Se lá estiver outro prazo, usa-se o de lá, ou corrigem-se os dois. A dona confirma.
- Se o formulário tiver uma caixa de consentimento para marketing (newsletter), ela fica à parte, nunca pré-marcada.
- Nunca se escreve «não partilhamos os seus dados»: com consentimento, há envios cifrados para a Google e a Meta.

---

## 2. No rodapé de TODAS as páginas (404 e proposta online incluídas)

**Livro de Reclamações** (DL 156/2005, art. 5.º-B):
- usa o ícone oficial, que já está em `public/logos/livro-de-reclamacoes.png`, na versão que contrasta com o fundo;
- liga a https://www.livroreclamacoes.pt/inicio e abre noutro separador;
- `aria-label`: «Livro de Reclamações Eletrónico (abre noutro separador)» / EN «Complaints Book (opens in a new tab)».

**Resolução de litígios** (Lei 144/2015, art. 18.º):
- PT: «Em caso de litígio de consumo, o consumidor pode recorrer ao CNIACC — Centro Nacional de Informação e Arbitragem de Conflitos de Consumo ([cniacc.pt](https://www.cniacc.pt/)). Mais informação no [Portal do Consumidor](https://www.consumidor.gov.pt/).»
- EN: «In the event of a consumer dispute, the consumer may refer it to CNIACC, the National Centre for Information and Arbitration of Consumer Disputes ([cniacc.pt](https://www.cniacc.pt/)). Further information on the [Consumer Portal](https://www.consumidor.gov.pt/).»

A plataforma europeia ODR já não se põe: o Reg. (UE) 2024/3228 extinguiu-a a 20/07/2025.

**Ligações legais** no rodapé: Privacidade · Cookies · Termos.

---

## 3. Nos e-mails automáticos

O texto completo está no documento anterior, `Liquen-rodape-legal-emails.md`: proteção de dados, CNIACC, Livro de Reclamações e «Recebeu este e-mail porque…», em PT e EN, HTML e texto simples. Faz-se um componente só, usado em todos os e-mails.

---

## 4. O filtro anti-spam do formulário (o mesmo da Palumen)

São três camadas, sem captcha e sem nada que a pessoa veja:

1. **Isco:** um campo escondido (por exemplo «website»), fora do ecrã, com `tabindex="-1"`, `autocomplete="off"` e `aria-hidden`. Uma pessoa não o preenche; um robô preenche.
2. **Armadilha de tempo:** o servidor assina o instante em que o formulário abriu (HMAC com um segredo do servidor). Um envio feito em menos de ~3 s, ou com a assinatura em falta ou inválida, é de robô.
3. **Filtro de conteúdo:** recusa mensagens com várias ligações, palavras típicas de spam (SEO, crypto, casino, backlinks…), alfabetos que não são latinos, e domínios de topo usados quase só por spam (.ru, .xyz, .top…).

Quando é spam, **finge-se sucesso**: a resposta é igual à de um envio real, mas não se grava nada nem se envia e-mail. Assim o robô não aprende a contornar o filtro.

Há ainda um **limite por ligação**: N pedidos por hora. O limite faz-se na base de dados, sem polling e sem custo extra (plano grátis).

A referência é o código da Palumen: `lib/contacto/spam.ts`, `lib/contacto/acao.ts` e `components/contacto/formulario.tsx`, no repositório Palumen.

---

## 5. Falta a dona dar

- **Identificação da empresa** (DL 7/2004, art. 10.º): a denominação, o NIF e a morada. Deixa-se o espaço preparado, que só aparece com os dados. Não se inventa nada.
- **Registo da Líquen** na plataforma livroreclamacoes.pt (é obrigatório).

---

## 6. Lista de verificação

- [ ] A nota de proteção de dados está por baixo do formulário, em PT e EN, com ligação para a Política de Privacidade.
- [ ] O prazo de conservação é igual na nota e na Política.
- [ ] O Livro de Reclamações (ícone oficial e ligação) e o CNIACC com o Portal do Consumidor estão no rodapé de todas as páginas, incluindo a 404 e a proposta online.
- [ ] Não há nenhuma menção à ODR.
- [ ] Não aparece a frase «não partilhamos os seus dados».
- [ ] O isco, a armadilha de tempo e o filtro de conteúdo estão feitos, com sucesso fingido para o spam.
- [ ] Há um teste Playwright que confirma o Livro de Reclamações e a RAL em todas as rotas, e que nada fica guardado antes do consentimento dos cookies.
- [ ] O rodapé legal está nos e-mails (ver o documento anterior).
- [ ] O PR fica aberto para a aprovação da dona.
