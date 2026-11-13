import { SITE } from "@/lib/site";
import type { Locale } from "@/lib/i18n";

// Structured legal content (RGPD/GDPR privacy policy + terms) for both locales.
// Kept out of the main i18n dictionaries so those stay focused on UI copy.
//
// ⚠️ Conteúdo-base, redigido segundo o RGPD (Regulamento (UE) 2016/679) e a Lei
// n.º 58/2019. DEVE ser revisto por um advogado e completado com a identificação
// legal exata do responsável pelo tratamento (denominação, NIF, morada e sede)
// antes de considerado definitivo.

export interface LegalSection {
  heading: string;
  body: string[];
}
export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const UPDATED_PT = "Última atualização: novembro de 2026";
const UPDATED_EN = "Last updated: November 2026";

function privacyPt(): LegalDoc {
  return {
    title: "Política de Privacidade",
    updated: UPDATED_PT,
    intro: `A ${SITE.legalName} respeita a sua privacidade e trata os seus dados pessoais de acordo com o Regulamento Geral sobre a Proteção de Dados (RGPD) e a legislação portuguesa aplicável. Esta política explica que dados recolhemos, para quê, com que fundamento e quais os seus direitos.`,
    sections: [
      {
        heading: "1. Responsável pelo tratamento",
        body: [
          `${SITE.legalName}, com contacto através de ${SITE.email} e ${SITE.phoneDisplay}, é a entidade responsável pelo tratamento dos dados pessoais recolhidos neste site.`,
          "Para qualquer questão relacionada com os seus dados pessoais ou com esta política, pode contactar-nos por e-mail.",
        ],
      },
      {
        heading: "2. Que dados recolhemos",
        body: [
          "Dados que nos fornece diretamente ao preencher o formulário de pedido de orçamento: nome, e-mail, telefone, tipo e data do evento, localidade ou região do evento, número de convidados e a mensagem que nos enviar. O fornecimento destes dados é facultativo, mas necessário para lhe respondermos e elaborarmos um orçamento: sem eles não conseguimos dar seguimento ao pedido.",
          "Dados de aceitação de propostas e contratação: se aceitar uma proposta através da ligação que lhe enviamos, registamos o nome indicado por quem aceita, a data e hora e o endereço IP, como prova da aceitação da proposta de prestação de serviços.",
          "Dados de faturação e pagamentos do seu evento (valores, faturas de sinal e de saldo e o estado dos pagamentos), acessíveis na sua área de cliente e conservados para cumprimento das obrigações fiscais.",
          "Origem da visita: se chegar ao site através de uma ligação com parâmetros de campanha (UTM) ou a partir de outro site, podemos registar essa proveniência, associada ao pedido, para percebermos como nos encontrou.",
          "Dados técnicos recolhidos automaticamente para segurança e estatística: endereço IP (de forma efémera, para limitação de abusos) e informação básica do pedido.",
          "Dados de análise e de publicidade (apenas com o seu consentimento): se aceitar os cookies no aviso apresentado, utilizamos o Google Analytics e o Google Ads. Estes serviços recolhem identificadores associados a cookies, informação do dispositivo e do navegador e as páginas e interações no site, para medirmos a audiência e a eficácia da nossa publicidade. Se recusar, não são colocados cookies nem recolhida informação associada a cookies; o Google poderá ainda receber sinais técnicos agregados e sem cookies (por exemplo, país e tipo de página), que utiliza para modelação estatística e que não permitem identificá-lo individualmente.",
          "Dados de publicidade da Meta (apenas com o seu consentimento): se aceitar os cookies, utilizamos também o Pixel da Meta (Facebook e Instagram), que regista as páginas visitadas e o envio do pedido de orçamento, com identificadores associados a cookies. Quando nos envia um pedido de orçamento depois de ter aceitado, comunicamos esse pedido à Meta também a partir do nosso servidor (API de Conversões), com o seu e-mail e telefone encriptados (hash) antes do envio, para medir a eficácia dos nossos anúncios. Se recusar os cookies, nada disto acontece.",
          "Rascunho do formulário: para não perder o que escreve, o formulário de pedido de orçamento guarda temporariamente as suas respostas no armazenamento de sessão do navegador (sessionStorage), apenas no seu dispositivo e apenas durante a sessão, e são apagadas ao fechar o separador. Pode também limpá-lo a qualquer momento nas definições do navegador; nada é enviado enquanto não submeter o pedido.",
        ],
      },
      {
        heading: "3. Finalidades e fundamento legal",
        body: [
          "Responder a pedidos e elaborar orçamentos: diligências pré-contratuais que solicita (art. 6.º, n.º 1, al. b) do RGPD) e, quanto a mensagens que não visem a contratação, o nosso interesse legítimo em responder-lhe (al. f)).",
          "Gerir a relação com clientes e a prestação dos nossos serviços de organização de eventos: execução do contrato (al. b).",
          "Medir a audiência do site e a eficácia da nossa publicidade (Google Analytics e Google Ads): com base no seu consentimento (al. a)), quando aceita os cookies.",
          "Medir a eficácia da nossa publicidade na Meta (Facebook e Instagram), incluindo saber se um pedido de orçamento ou uma contratação teve origem num anúncio: com base no seu consentimento (al. a)), quando aceita os cookies.",
          "Garantir a segurança do site e prevenir abusos: interesse legítimo (al. f).",
          "Cumprir obrigações legais, nomeadamente fiscais e contabilísticas: obrigação legal (al. c).",
        ],
      },
      {
        heading: "4. Prazos de conservação",
        body: [
          "Conservamos os dados de pedidos de orçamento apenas durante o tempo necessário para lhe responder e, caso avance, durante a relação contratual. Pedidos que não deem origem a contrato são eliminados no prazo máximo de 12 meses após o último contacto.",
          "Dados associados a faturação e obrigações fiscais e contabilísticas são conservados pelos prazos legais aplicáveis (em regra, 10 anos). Findos os prazos, os dados são eliminados ou anonimizados.",
        ],
      },
      {
        heading: "5. Subcontratantes e partilha de dados",
        body: [
          "Não vendemos os seus dados. Podemos recorrer a prestadores de serviços que os tratam em nosso nome e sob instruções, com garantias de segurança adequadas: alojamento e infraestrutura do site, envio e receção de e-mail, e base de dados. Sempre que aplicável, celebramos contratos de subcontratação nos termos do art. 28.º do RGPD.",
          "Recorremos ainda ao Google (Google Ireland Limited) para estatísticas de utilização (Google Analytics) e para medição e otimização de publicidade (Google Ads), mas apenas quando aceita os cookies respetivos no aviso de cookies. Se recusar, não são colocados cookies nem partilhados identificadores; o Google poderá ainda receber sinais agregados e sem cookies para modelação estatística, que não o identificam individualmente.",
          "Conversões Melhoradas: se aceitar os cookies e submeter um pedido de orçamento, o seu e-mail e/ou telefone podem ser partilhados com o Google apenas para medir a eficácia dos anúncios. Estes dados são encriptados (com hash) no seu navegador antes de serem enviados, e o Google usa-os apenas para associar a conversão ao anúncio, nunca para o identificar publicamente. Se recusar os cookies, nada disto acontece.",
          "Recorremos ainda à Meta (Meta Platforms Ireland Limited) para medir e otimizar a nossa publicidade no Facebook e no Instagram, apenas quando aceita os cookies. A Meta recebe os identificadores dos cookies «_fbp» e «_fbc», o endereço IP e o tipo de navegador e, quando envia um pedido de orçamento ou contrata os nossos serviços, o seu e-mail e telefone encriptados (hash), que usa apenas para associar o resultado ao anúncio. A Meta atua, nesta medição, como responsável conjunto connosco, nos termos dos seus Termos de Ferramentas Empresariais.",
          "Poderemos divulgar dados quando exigido por lei ou por autoridade competente.",
        ],
      },
      {
        heading: "6. Transferências internacionais",
        body: [
          "Alguns prestadores podem tratar dados fora do Espaço Económico Europeu. Nesses casos, asseguramos garantias adequadas (por exemplo, cláusulas contratuais-tipo da Comissão Europeia) para proteger os seus dados.",
          "Em concreto, se aceitar os cookies de análise e publicidade, o Google poderá tratar dados nos Estados Unidos, ao abrigo dessas garantias (cláusulas contratuais-tipo e/ou o EU-US Data Privacy Framework).",
          "Também a Meta poderá tratar dados nos Estados Unidos (Meta Platforms, Inc.), ao abrigo das mesmas garantias (EU-US Data Privacy Framework e/ou cláusulas contratuais-tipo), apenas se aceitar os cookies de publicidade.",
        ],
      },
      {
        heading: "7. Segurança dos dados",
        body: [
          "Adotamos medidas técnicas e organizativas adequadas para proteger os seus dados contra o acesso não autorizado, a perda, a alteração ou a divulgação indevida, por exemplo o acesso restrito à informação e a utilização de ligações encriptadas (HTTPS).",
          "Nenhum sistema é totalmente inviolável; caso ocorra uma violação de dados que implique risco elevado para os seus direitos, cumpriremos os deveres de comunicação previstos no RGPD.",
        ],
      },
      {
        heading: "8. Os seus direitos",
        body: [
          "Tem o direito de aceder, retificar, apagar, limitar e opor-se ao tratamento dos seus dados, bem como o direito à portabilidade e a retirar o consentimento a qualquer momento, sem afetar a licitude do tratamento anterior.",
          "Não tomamos decisões exclusivamente automatizadas, incluindo a definição de perfis, que produzam efeitos jurídicos na sua esfera ou que o afetem de forma significativa e similar.",
          `Para exercer estes direitos, contacte-nos através de ${SITE.email}. Tem ainda o direito de apresentar reclamação junto da Comissão Nacional de Proteção de Dados (CNPD).`,
        ],
      },
      {
        heading: "9. Direitos de imagem",
        body: [
          "Nos eventos que organizamos podem ser captadas fotografias e vídeos. Algumas destas imagens poderão ser publicadas no nosso portefólio, neste site e nas nossas redes sociais, para divulgar o nosso trabalho.",
          "A publicação de imagens em que seja identificável assenta no seu consentimento, recolhido de forma específica (por exemplo, no contrato de prestação de serviços ou em autorização própria). Pode não autorizar essa utilização, sem que isso afete a prestação dos nossos serviços.",
          `Pode, a qualquer momento, retirar o consentimento e pedir a remoção de imagens em que seja identificável, através de ${SITE.email}. Removê-las-emos, num prazo razoável, dos canais que controlamos. Note-se que imagens eventualmente já partilhadas ou reproduzidas por terceiros podem não estar sob o nosso controlo.`,
          "As imagens são utilizadas exclusivamente para divulgar o nosso trabalho, no nosso site e nas nossas redes sociais, não sendo cedidas a terceiros para fins promocionais próprios destes. Nos eventos podem estar presentes menores: a captação e a publicação de imagens de menores identificáveis dependem do consentimento prévio dos respetivos representantes legais (pais ou tutores), que pode ser retirado a qualquer momento.",
        ],
      },
      {
        heading: "10. Cookies",
        body: [
          "Cookies estritamente necessários ao funcionamento, por exemplo «liquen-lang», que guarda o idioma escolhido, não requerem consentimento. A sua preferência de cookies é guardada no armazenamento local do navegador (localStorage), na chave «liquen-consent», e não num cookie.",
          "Cookies de análise e de publicidade (Google Analytics e Google Ads): só são ativados se os aceitar no aviso de cookies apresentado na primeira visita. Servem para medir as visitas e a eficácia da nossa publicidade e podem implicar a partilha de dados com o Google (ver secções 5 e 6). Utilizamos o Modo de Consentimento da Google: enquanto não aceitar, não são colocados cookies de análise nem de publicidade.",
          "Cookies de publicidade da Meta («_fbp» e «_fbc», cerca de 90 dias): só são colocados se aceitar os cookies no mesmo aviso, e servem para medir a eficácia dos anúncios no Facebook e no Instagram (ver secções 5 e 6).",
          "Pode recusar, ou alterar a sua escolha a qualquer momento, através da ligação «Gerir cookies» no rodapé do site. Recusar os cookies não essenciais não afeta o funcionamento do site.",
          "Principais cookies e armazenamento utilizados: «liquen-lang» (cookie de idioma, cerca de 1 ano); «liquen-consent» (a sua escolha de cookies, guardada no localStorage do navegador); «_ga» e «_ga_*» (Google Analytics: distinguem visitantes e sessões, até 2 anos); «_gcl_au» (Google Ads: medição de conversões, cerca de 90 dias). Os cookies de análise e de publicidade só existem se os tiver aceitado.",
          "Para funcionamento offline, o site pode guardar no seu dispositivo uma cópia de páginas e recursos (cache do navegador), que não contém dados pessoais. A área reservada da equipa utiliza ainda cookies de sessão estritamente necessários, que não são colocados aos visitantes do site.",
        ],
      },
      {
        heading: "11. Alterações a esta política",
        body: [
          "Podemos atualizar esta política para refletir alterações legais ou dos nossos serviços. A versão em vigor é sempre a publicada nesta página, com a respetiva data de atualização.",
        ],
      },
    ],
  };
}

function termsPt(): LegalDoc {
  return {
    title: "Termos e Condições",
    updated: UPDATED_PT,
    intro: `Estes termos regem a utilização do site da ${SITE.legalName}. Ao navegar e utilizar este site, aceita as condições descritas abaixo.`,
    sections: [
      {
        heading: "1. Objeto",
        body: [
          `Este site apresenta os serviços de organização e planeamento de eventos da ${SITE.legalName} e permite o envio de pedidos de orçamento. O envio de um pedido não constitui, por si só, um contrato: a prestação de serviços é formalizada em documento próprio.`,
          "Quando aceita uma proposta através da ligação que lhe enviamos, registamos o nome indicado por quem aceita, a data e a hora e o endereço IP, como prova dessa aceitação. Esse registo respeita à aceitação da proposta de prestação de serviços, cujas condições se regem pelo contrato referido na secção 5, e não por estes termos de utilização do site.",
        ],
      },
      {
        heading: "2. Utilização do site",
        body: [
          "Compromete-se a utilizar o site de forma lícita, a fornecer informação verdadeira nos formulários e a não realizar ações que prejudiquem o funcionamento, a segurança ou a disponibilidade do serviço.",
        ],
      },
      {
        heading: "3. Propriedade intelectual",
        body: [
          `Os conteúdos deste site, incluindo textos, imagens, fotografias, marca e identidade visual, são propriedade da ${SITE.legalName} ou usados com autorização, e estão protegidos por direitos de autor. Não é permitida a sua reprodução sem autorização prévia e escrita.`,
        ],
      },
      {
        heading: "4. Orçamentos e propostas",
        body: [
          "Os valores indicados em propostas são válidos pelo período nelas mencionado e podem variar em função dos detalhes finais do evento. Uma proposta só se torna vinculativa após aceitação por ambas as partes.",
        ],
      },
      {
        heading: "5. Limitação de responsabilidade",
        body: [
          "Envidamos os melhores esforços para manter a informação do site correta, atualizada e disponível, mas não garantimos a ausência de erros ou imprecisões, nem que o site esteja permanentemente acessível ou livre de interrupções. O conteúdo do site tem caráter informativo e não dispensa a confirmação connosco.",
          "Na medida máxima permitida pela lei, não nos responsabilizamos por danos indiretos decorrentes da utilização ou da impossibilidade de utilização do site, nem pelo conteúdo de sites de terceiros para os quais existam ligações.",
          "Nada nestes termos exclui ou limita a responsabilidade que a lei não permita afastar, designadamente por dolo ou culpa grave e por danos causados à vida ou à integridade física, nem quaisquer direitos que assistam ao cliente na qualidade de consumidor, que permanecem integralmente salvaguardados.",
          "Estes termos regem a utilização do site. As condições da prestação de serviços de eventos (âmbito, preços, pagamentos, prazos e responsabilidades) regem-se pelo contrato específico celebrado com o cliente, que prevalece em caso de divergência.",
        ],
      },
      {
        heading: "6. Lei aplicável e foro",
        body: [
          "Estes termos regem-se pela lei portuguesa. Em caso de litígio, é competente o tribunal determinado nos termos da lei aplicável; tratando-se de um consumidor, é competente o tribunal do seu domicílio, nos termos legalmente previstos.",
        ],
      },
      {
        heading: "7. Resolução alternativa de litígios de consumo",
        body: [
          "Em caso de litígio de consumo, pode recorrer a uma entidade de resolução alternativa de litígios de consumo (RAL). A entidade de competência genérica a nível nacional é o CNIACC, Centro Nacional de Informação e Arbitragem de Conflitos de Consumo (www.cniacc.pt).",
          "A lista atualizada das entidades de RAL competentes está disponível no Portal do Consumidor, em www.consumidor.gov.pt.",
        ],
      },
      {
        heading: "8. Alterações a estes termos",
        body: [
          "Podemos atualizar estes termos para refletir alterações legais ou dos nossos serviços. A versão em vigor é sempre a publicada nesta página, com a respetiva data de atualização; a utilização do site após essa publicação vale como conhecimento da versão em vigor.",
        ],
      },
    ],
  };
}

function privacyEn(): LegalDoc {
  return {
    title: "Privacy Policy",
    updated: UPDATED_EN,
    intro: `${SITE.legalName} respects your privacy and processes your personal data in accordance with the General Data Protection Regulation (GDPR) and applicable Portuguese law. This policy explains what data we collect, why, on what basis, and what your rights are.`,
    sections: [
      {
        heading: "1. Data controller",
        body: [
          `${SITE.legalName}, reachable at ${SITE.email} and ${SITE.phoneDisplay}, is the controller of the personal data collected on this website.`,
          "For any question about your personal data or this policy, you can contact us by e-mail.",
        ],
      },
      {
        heading: "2. What data we collect",
        body: [
          "Data you provide directly when filling in the quote-request form: name, e-mail, phone, event type and date, event location or region, number of guests and the message you send us. Providing this data is optional but necessary for us to reply and prepare a quote: without it we cannot act on your request.",
          "Proposal-acceptance and contracting data: if you accept a proposal through the link we send you, we record the name given by whoever accepts, the date and time and the IP address, as proof of acceptance of the service proposal.",
          "Billing and payment data for your event (amounts, deposit and balance invoices and payment status), available in your client area and retained to meet tax obligations.",
          "Visit source: if you reach the site via a link carrying campaign parameters (UTM) or from another website, we may record that origin, linked to your request, to understand how you found us.",
          "Technical data collected automatically for security and statistics: IP address (ephemerally, for abuse limiting) and basic request information.",
          "Analytics and advertising data (only with your consent): if you accept cookies in the notice shown, we use Google Analytics and Google Ads. These services collect cookie-based identifiers, device and browser information and the pages and interactions on the site, so we can measure our audience and the effectiveness of our advertising. If you decline, no cookies are set and no cookie-based information is collected; Google may still receive aggregated, cookieless signals (for example, country and page type) that it uses for statistical modelling and that do not identify you individually.",
          "Meta advertising data (only with your consent): if you accept cookies, we also use the Meta Pixel (Facebook and Instagram), which records the pages visited and the submission of the quote request, with cookie-based identifiers. When you send us a quote request after accepting, we also report that request to Meta from our server (Conversions API), with your e-mail and phone hashed before they are sent, to measure the effectiveness of our ads. If you decline cookies, none of this happens.",
          "Form draft: so you don't lose what you type, the quote-request form temporarily saves your answers in the browser's session storage (sessionStorage), on your device only and only for the session, and they are cleared when you close the tab. You can also clear it at any time in your browser settings; nothing is sent until you submit the request.",
        ],
      },
      {
        heading: "3. Purposes and legal basis",
        body: [
          "Responding to requests and preparing quotes: pre-contractual steps you request (Art. 6(1)(b) GDPR) and, for messages not aimed at contracting, our legitimate interest in replying to you (f).",
          "Managing the client relationship and delivering our event-planning services: performance of a contract (b).",
          "Measuring the site's audience and the effectiveness of our advertising (Google Analytics and Google Ads): based on your consent (a), when you accept cookies.",
          "Measuring the effectiveness of our advertising on Meta (Facebook and Instagram), including whether a quote request or a booking came from an ad: based on your consent (a), when you accept cookies.",
          "Ensuring the security of the site and preventing abuse: legitimate interest (f).",
          "Complying with legal obligations, notably tax and accounting: legal obligation (c).",
        ],
      },
      {
        heading: "4. Retention periods",
        body: [
          "We keep quote-request data only for as long as needed to respond and, if you proceed, for the duration of the contractual relationship. Requests that do not lead to a contract are deleted within a maximum of 12 months after the last contact.",
          "Data linked to invoicing and tax and accounting obligations is kept for the applicable legal periods (as a rule, 10 years). Once those periods lapse, data is deleted or anonymised.",
        ],
      },
      {
        heading: "5. Processors and data sharing",
        body: [
          "We do not sell your data. We may use service providers who process it on our behalf and under our instructions, with appropriate security safeguards: website hosting and infrastructure, sending and receiving e-mail, and database. Where applicable, we enter into processing agreements under Art. 28 GDPR.",
          "We also use Google (Google Ireland Limited) for usage statistics (Google Analytics) and for advertising measurement and optimisation (Google Ads), but only when you accept the relevant cookies in the cookie notice. If you decline, no cookies are set and no identifiers are shared; Google may still receive aggregated, cookieless signals for statistical modelling that do not identify you individually.",
          "Enhanced Conversions: if you accept cookies and submit a quote request, your e-mail and/or phone may be shared with Google solely to measure ad effectiveness. This data is hashed in your browser before it is sent, and Google uses it only to match the conversion to the ad, never to identify you publicly. If you decline cookies, none of this happens.",
          "We also use Meta (Meta Platforms Ireland Limited) to measure and optimise our advertising on Facebook and Instagram, only when you accept cookies. Meta receives the identifiers in the “_fbp” and “_fbc” cookies, your IP address and browser type and, when you send a quote request or book our services, your e-mail and phone in hashed form, which it uses solely to match the outcome to the ad. For this measurement Meta acts as joint controller with us, under its Business Tools Terms.",
          "We may disclose data where required by law or by a competent authority.",
        ],
      },
      {
        heading: "6. International transfers",
        body: [
          "Some providers may process data outside the European Economic Area. In such cases we ensure appropriate safeguards (for example, the European Commission's standard contractual clauses) to protect your data.",
          "In particular, if you accept analytics and advertising cookies, Google may process data in the United States, under those safeguards (standard contractual clauses and/or the EU-US Data Privacy Framework).",
          "Meta may also process data in the United States (Meta Platforms, Inc.), under the same safeguards (EU-US Data Privacy Framework and/or standard contractual clauses), only if you accept advertising cookies.",
        ],
      },
      {
        heading: "7. Data security",
        body: [
          "We put in place appropriate technical and organisational measures to protect your data against unauthorised access, loss, alteration or improper disclosure, for example restricted access to information and the use of encrypted connections (HTTPS).",
          "No system is entirely secure; should a data breach occur that is likely to result in a high risk to your rights, we will comply with the notification duties set out in the GDPR.",
        ],
      },
      {
        heading: "8. Your rights",
        body: [
          "You have the right to access, rectify, erase, restrict and object to the processing of your data, as well as the right to data portability and to withdraw consent at any time, without affecting the lawfulness of prior processing.",
          "We do not carry out solely automated decision-making, including profiling, that produces legal effects concerning you or similarly significantly affects you.",
          `To exercise these rights, contact us at ${SITE.email}. You also have the right to lodge a complaint with the Portuguese Data Protection Authority (CNPD).`,
        ],
      },
      {
        heading: "9. Image rights",
        body: [
          "At the events we organise, photographs and video may be taken. Some of these images may be published in our portfolio, on this website and on our social media, to showcase our work.",
          "Publishing images in which you are identifiable is based on your consent, obtained specifically (for example, in the service contract or in a separate authorisation). You may decline this use without it affecting the delivery of our services.",
          `You may, at any time, withdraw your consent and ask us to remove images in which you are identifiable, by contacting ${SITE.email}. We will remove them, within a reasonable period, from the channels we control. Note that images already shared or reproduced by third parties may be outside our control.`,
          "Images are used solely to showcase our work, on our website and social media, and are not transferred to third parties for their own promotional purposes. Minors may be present at events: capturing and publishing identifiable images of minors depends on the prior consent of their legal representatives (parents or guardians), which may be withdrawn at any time.",
        ],
      },
      {
        heading: "10. Cookies",
        body: [
          "Strictly necessary cookies for the site to work, for example “liquen-lang”, which remembers your chosen language, do not require consent. Your cookie preference is stored in the browser's local storage (localStorage), under the key “liquen-consent”, not in a cookie.",
          "Analytics and advertising cookies (Google Analytics and Google Ads): these are only activated if you accept them in the cookie notice shown on your first visit. They are used to measure visits and the effectiveness of our advertising and may involve sharing data with Google (see sections 5 and 6). We use Google Consent Mode: until you accept, no analytics or advertising cookies are set.",
          "Meta advertising cookies (“_fbp” and “_fbc”, about 90 days): only set if you accept cookies in the same notice; they measure the effectiveness of ads on Facebook and Instagram (see sections 5 and 6).",
          "You can decline, or change your choice at any time, via the “Manage cookies” link in the site footer. Declining non-essential cookies does not affect how the site works.",
          "Main cookies and storage used: “liquen-lang” (language cookie, about 1 year); “liquen-consent” (your cookie choice, stored in the browser's localStorage); “_ga” and “_ga_*” (Google Analytics: distinguish visitors and sessions, up to 2 years); “_gcl_au” (Google Ads: conversion measurement, about 90 days). Analytics and advertising cookies only exist if you have accepted them.",
          "For offline use, the site may store a copy of pages and resources on your device (browser cache), which contains no personal data. The team's restricted area also uses strictly necessary session cookies, which are not set for site visitors.",
        ],
      },
      {
        heading: "11. Changes to this policy",
        body: [
          "We may update this policy to reflect legal or service changes. The version in force is always the one published on this page, with its update date.",
        ],
      },
    ],
  };
}

function termsEn(): LegalDoc {
  return {
    title: "Terms & Conditions",
    updated: UPDATED_EN,
    intro: `These terms govern the use of the ${SITE.legalName} website. By browsing and using this site, you accept the conditions described below.`,
    sections: [
      {
        heading: "1. Purpose",
        body: [
          `This site presents the event organisation and planning services of ${SITE.legalName} and allows quote requests to be sent. Sending a request does not, in itself, constitute a contract: the provision of services is formalised in a separate document.`,
          "When you accept a proposal through the link we send you, we record the name given by whoever accepts, the date and time and the IP address, as proof of that acceptance. This record concerns acceptance of the service proposal, whose conditions are governed by the contract referred to in section 5, and not by these website terms of use.",
        ],
      },
      {
        heading: "2. Use of the site",
        body: [
          "You agree to use the site lawfully, to provide truthful information in the forms, and not to take actions that harm the operation, security or availability of the service.",
        ],
      },
      {
        heading: "3. Intellectual property",
        body: [
          `The contents of this site, including text, images, photographs, brand and visual identity, are the property of ${SITE.legalName} or used with permission, and are protected by copyright. Reproduction without prior written authorisation is not permitted.`,
        ],
      },
      {
        heading: "4. Quotes and proposals",
        body: [
          "Amounts stated in proposals are valid for the period mentioned in them and may vary depending on the final event details. A proposal only becomes binding once accepted by both parties.",
        ],
      },
      {
        heading: "5. Limitation of liability",
        body: [
          "We make our best efforts to keep the site's information correct, up to date and available, but we do not guarantee the absence of errors or inaccuracies, nor that the site is permanently accessible or free of interruptions. The site's content is informational and does not replace confirmation with us.",
          "To the maximum extent permitted by law, we are not liable for indirect damages arising from the use of, or inability to use, the site, nor for the content of third-party sites to which links exist.",
          "Nothing in these terms excludes or limits liability that the law does not allow to be excluded, in particular for wilful misconduct or gross negligence and for damage to life or physical integrity, nor any rights you may have as a consumer, which remain fully safeguarded.",
          "These terms govern the use of the website. The conditions for the provision of event services (scope, prices, payments, deadlines and responsibilities) are governed by the specific contract entered into with the client, which prevails in the event of any conflict.",
        ],
      },
      {
        heading: "6. Governing law and jurisdiction",
        body: [
          "These terms are governed by Portuguese law. In the event of a dispute, the competent court is the one determined under applicable law; where you are a consumer, the court of your domicile is competent, as legally provided.",
        ],
      },
      {
        heading: "7. Alternative consumer dispute resolution",
        body: [
          "In the event of a consumer dispute, you may turn to an alternative consumer dispute resolution (ADR) body. The nationally competent body of general jurisdiction is CNIACC, Centro Nacional de Informação e Arbitragem de Conflitos de Consumo (www.cniacc.pt).",
          "The up-to-date list of competent ADR bodies is available on the Portuguese Consumer Portal, at www.consumidor.gov.pt.",
        ],
      },
      {
        heading: "8. Changes to these terms",
        body: [
          "We may update these terms to reflect legal or service changes. The version in force is always the one published on this page, with its update date; using the site after such publication counts as awareness of the version in force.",
        ],
      },
    ],
  };
}

export function getLegal(locale: Locale): { privacy: LegalDoc; terms: LegalDoc } {
  return locale === "en"
    ? { privacy: privacyEn(), terms: termsEn() }
    : { privacy: privacyPt(), terms: termsPt() };
}
