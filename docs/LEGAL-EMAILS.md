# Líquen Events: rodapé legal dos e-mails de confirmação

**Para:** a sessão do Claude que trabalha no repositório `liquen-events`
**Pedido de:** Francisco, 17/11/2026
**Objetivo:** acrescentar ao fundo de TODOS os e-mails automáticos que a Líquen envia a clientes (a confirmação «recebemos o seu pedido», os e-mails da proposta e outros) o mesmo rodapé legal que a Palumen já usa: a proteção de dados, a resolução de litígios e o Livro de Reclamações.

---

## 1. Porque é obrigatório

| O quê | Lei | O que pede |
|---|---|---|
| Informação sobre os dados pessoais | RGPD, art. 13.º | Quando se recolhem dados, dizer quem os trata, para quê, com que base legal, por quanto tempo e onde estão os direitos |
| Resolução alternativa de litígios (RAL) | Lei 144/2015, art. 18.º | Informar o consumidor das entidades de RAL, no site e nos contratos ou comunicações |
| Livro de Reclamações Eletrónico | DL 156/2005, art. 5.º-B (redação do DL 74/2017) | Acesso visível e destacado à plataforma livroreclamacoes.pt |

A plataforma europeia de litígios (ODR) **já não se põe**: o Regulamento (UE) 2024/3228 extinguiu-a a 20/07/2025.

---

## 2. Texto a usar (PT), formal

> **Proteção de dados.** A Líquen Events trata os dados deste pedido apenas para lhe responder e preparar a proposta, a pedido do titular (artigo 6.º, n.º 1, alínea b), do RGPD). Os prazos de conservação, os direitos do titular e a forma de os exercer constam da [Política de Privacidade](https://liquen-events.com/privacidade).
>
> **Resolução de litígios.** Em caso de litígio de consumo, o consumidor pode recorrer ao CNIACC — Centro Nacional de Informação e Arbitragem de Conflitos de Consumo ([cniacc.pt](https://www.cniacc.pt/)). Mais informação no Portal do Consumidor ([consumidor.gov.pt](https://www.consumidor.gov.pt/)).
>
> **[Livro de Reclamações]** — o ícone oficial, com ligação para https://www.livroreclamacoes.pt/inicio
>
> Recebeu este e-mail porque foi submetido um pedido em liquen-events.com com este endereço.

### Versão em inglês (para os e-mails em EN)

> **Data protection.** Líquen Events processes the data in this request solely to reply and prepare the proposal, at the data subject's request (Article 6(1)(b) GDPR). Retention periods, the data subject's rights and how to exercise them are set out in the [Privacy Policy](https://liquen-events.com/en/privacidade).
>
> **Dispute resolution.** In the event of a consumer dispute, the consumer may refer it to CNIACC, the National Centre for Information and Arbitration of Consumer Disputes ([cniacc.pt](https://www.cniacc.pt/)). Further information is available on the Consumer Portal ([consumidor.gov.pt](https://www.consumidor.gov.pt/)).
>
> **[Complaints Book]** — the official icon, linking to https://www.livroreclamacoes.pt/inicio
>
> You are receiving this e-mail because a request was submitted at liquen-events.com with this address.

**Atenção ao texto da proteção de dados.** Ajusta a finalidade ao que cada e-mail é:
- confirmação do pedido: «para lhe responder e preparar a proposta»;
- e-mails da proposta: «para preparar e executar a proposta» (art. 6.º, n.º 1, al. b);
- e-mails de faturação: acrescentar a obrigação legal (al. c).

Não escrevas «não partilhamos os seus dados»: com consentimento, os dados vão cifrados para a Google e a Meta.

---

## 3. Como implementar (instruções para o Claude)

1. Lê o CLAUDE.md, o AGENTS.md e `docs/DESIGN-SYSTEM.md` do repositório da Líquen.
2. Encontra **todos os sítios que enviam e-mail** a clientes. Procura pelo envio (Resend, nodemailer, `sendEmail`, `emails.send`) e pelos modelos de e-mail.
3. Cria **um só componente ou função de rodapé legal**, em PT e EN, e usa-o em todos os e-mails. Não copies o texto para cada modelo.
4. **O ícone do Livro de Reclamações:**
   - usa o oficial que já está em `public/logos/livro-de-reclamacoes.png`;
   - os clientes de e-mail não mostram SVG nem filtros CSS, por isso gera a partir dele um PNG em versão escura (para fundo claro) e outro em versão clara, se o e-mail tiver modo escuro;
   - põe-nos com URL absoluto (https://liquen-events.com/…), `alt="Livro de Reclamações"`, width e height;
   - leva uma ligação para https://www.livroreclamacoes.pt/inicio.
5. O rodapé vai em **letra pequena**, separado do corpo por um filete, com as cores do sistema de design da Líquen. Faz também a versão em **texto simples** (multipart), com os URL escritos por extenso.
6. **Identificação da empresa** (DL 7/2004, art. 10.º): a denominação, o NIF e a morada ainda faltam. A dona tem de os dar. Deixa no rodapé um espaço preparado que só aparece quando os dados existirem. Não inventes valores.
7. **Testa:**
   - gera o HTML de cada e-mail localmente e tira capturas a 390 e 640 px, em claro e escuro;
   - confirma que as ligações abrem e que o ícone aparece;
   - não envies e-mails reais, exceto um teste para a própria dona.
8. **Abre o PR**, sem juntar ao main: o CLAUDE.md da Líquen diz que nada entra sem a aprovação dela.

---

## 4. Lista de verificação final

- [ ] O rodapé está em todos os e-mails automáticos a clientes (confirmação, proposta, lembretes, faturação).
- [ ] Há versões PT e EN, e versões HTML e texto simples.
- [ ] A ligação à Política de Privacidade abre.
- [ ] O CNIACC e o Portal do Consumidor têm ligação.
- [ ] O ícone oficial do Livro de Reclamações aparece e leva a livroreclamacoes.pt.
- [ ] Não há nenhuma menção à plataforma ODR europeia.
- [ ] Não há a frase «não partilhamos os seus dados».
- [ ] Há espaço para a identificação da empresa, que fica escondido sem dados.
- [ ] Há capturas, e o PR está aberto para aprovação.

*As fontes legais foram verificadas a 17/11/2026 no estudo da Palumen: `docs/fiscal/estudos/legal-site.md` e `livro-reclamacoes.md` (repositório Palumen).*
