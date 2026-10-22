import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PALAVRAS QUE SÃO DA PÁGINA, E NÃO DO DOCUMENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Ampliar», «Fechar», «Fotografia 3 de 12». Nada disto existe no documento —
 * são gestos de um ecrã, e um ecrã é coisa que o PDF não tem. O documento tem
 * os seus (`proposal-doc-textos.ts`) e continua a ser de lá que sai tudo o que
 * o casal já leu no papel: os títulos das secções, os rótulos do orçamento, as
 * condições.
 *
 * ── PORQUE É QUE NÃO VIVEM NO DICIONÁRIO DO SÍTIO ─────────────────────────
 *
 * Porque o `getDictionary(locale)` responde na língua do VISITANTE, e esta
 * página segue a língua da PROPOSTA (`idiomaDaProposta` — a decisão está
 * escrita no cabeçalho da `page.tsx` e não se mexe). São dois eixos diferentes
 * com o mesmo nome; misturá-los era convidar o defeito que já cá esteve — a
 * moldura numa língua e o documento noutra, na mesma folha.
 *
 * Estas seguem o documento, e por isso são indexadas por
 * {@link IdiomaDaProposta} e não por `Locale`. O tipo é que o garante.
 */
export interface TextosDaPagina {
  /** O rótulo do botão que abre a fotografia em grande. */
  ampliar: string;
  fechar: string;
  anterior: string;
  seguinte: string;
  /**
   * «Fotografia 3 de 12» — o que o leitor de ecrã anuncia ao mudar de foto.
   *
   * É um MOLDE com `{i}` e `{n}`, e não uma função, porque isto atravessa a
   * fronteira servidor→cliente: uma função não se serializa, e o React
   * rebentaria a passá-la como propriedade a um Client Component. Ver
   * {@link contar}.
   */
  contagem: string;
  /** A célula que não conseguiu mostrar a fotografia. */
  fotoFalhou: string;
  /**
   * O botão que volta a tentar UMA fotografia — dentro da célula que falhou.
   *
   * Separado do {@link recarregarFotos} de propósito: são duas acções
   * diferentes (uma volta a pedir esta imagem, a outra vai buscar assinaturas
   * novas ao servidor) e enquanto tiveram o mesmo rótulo estavam os dois no
   * ecrã a dizer a mesma coisa, um por cima do outro.
   */
  tentarDeNovo: string;
  /** O botão que volta a pedir as assinaturas ao servidor. */
  recarregarFotos: string;
  /** Quando esse botão também não conseguiu (A9-008). */
  recarregarFalhou: string;
  /** O índice no topo, para se chegar às fotografias sem rolar tudo. */
  nestaPagina: string;
  inspiracao: string;
  /** O aviso de que a galeria não abriu — sem fotografias não há nada a fazer. */
  semFotos: string;

  /* ── O PDF NA PÁGINA (22/10) ──────────────────────────────────────────── */
  /** Enquanto a primeira página do PDF chega. */
  aAbrirAProposta: string;
  /** O nome de cada página desenhada, para quem lê o ecrã: «Página {i} de {n}». */
  paginaDe: string;
  /** Quando o browser não conseguiu desenhar o PDF — fica o botão para o abrir. */
  pdfNaoAbriu: string;

  /* ── AS ESCOLHAS DO CASAL (Fase 3) ─────────────────────────────────────── */
  /** O título da secção onde ela deixou alternativas. */
  escolhas: string;
  /** A linha que explica o que ali se faz, e o que acontece a seguir. */
  escolhasIntro: string;
  /** O botão de cada alternativa, para quem lê o ecrã: «Escolher …». */
  escolherEsta: string;
  /** A marca da que ficou escolhida. */
  escolhida: string;
  /**
   * O que se diz DEPOIS de a escolha seguir.
   *
   * Não é «guardado»: o que interessa ao casal não é o nosso registo, é saber
   * que a mensagem chegou a alguém. E é o que permite mudar de ideias sem
   * telefonar — a frase di-lo.
   */
  escolhaGuardada: string;
  /** A escolha não chegou ao servidor. Diz-se, e não se finge. */
  escolhaFalhou: string;
  /** O botão que tenta outra vez a mesma escolha. */
  escolhaRepetir: string;

  /* ── AS SECÇÕES DE CONDIÇÕES, DOBRADAS ─────────────────────────────────── */
  /**
   * O resumo de uma linha por baixo do título de cada secção dobrada.
   *
   * Uma secção fechada esconde o que lá está dentro, e um título sozinho não
   * chega para se decidir se vale a pena abrir: «Condições Gerais» podia ser
   * uma linha ou catorze. O resumo é o que substitui a leitura.
   *
   * Estão escritos a olhar para o TEXTO DA CASA, cláusula a cláusula, e por
   * isso só se mostram enquanto o texto for esse — quem decide é o
   * `blocoEDaCasa`. Onde ela reescreveu, a página conta os pontos
   * ({@link pontos}): menos útil, sempre verdade.
   */
  resumos: Readonly<Record<SeccaoDobravel, string>>;
  /** «9 pontos» — o molde com `{n}`, para quando não se pode resumir. */
  pontos: string;
  /** O mesmo, no singular. Um molde com `{n}` dizia «1 pontos». */
  umPonto: string;

  /* ── OS SOBRETÍTULOS QUE A PÁGINA DIZ DE OUTRA MANEIRA ─────────────────── */
  /**
   * ════════════════════════════════════════════════════════════════════════
   * A PÁGINA MUDOU DE VOZ; O PDF FICA COMO ESTÁ
   * ════════════════════════════════════════════════════════════════════════
   *
   * Decisão dela, dita com todas as letras: as mudanças de linguagem são para
   * a página web, e no PDF fica tudo igual. E o PDF e a página bebem do MESMO
   * dicionário (`proposal-doc-textos.ts`) — mudar lá uma palavra mudava-a nos
   * dois de uma vez, que é precisamente o que não se pode fazer.
   *
   * Por isso estes sobretítulos vivem aqui, no dicionário que só a página lê,
   * e o `Documento` prefere-os aos do documento quando existem. Não é uma
   * segunda verdade: é o mesmo sítio a ser dito de duas maneiras a dois
   * públicos, e o único que o vê nas duas formas é ela, ao rever.
   *
   * ── O QUE MUDA, E PORQUÊ ─────────────────────────────────────────────
   *
   * «O investimento» é a palavra que as agências usam para não dizer preço, e
   * destoa de um documento que em tudo o resto diz as coisas como elas são: a
   * seguir a ela vem uma tabela com números, e quem a lê já sabe que vai pagar.
   *
   * «Para sua tranquilidade» trata uma pessoa. Quem lê são duas, e são duas
   * que vão casar. As cláusulas lá dentro continuam a falar de «o cliente» e
   * da «Líquen Events» — são contratuais, e uma cláusula que trate as partes
   * por «vocês» deixa de dizer quem se obriga a quê. O que muda é a voz da
   * casa à volta delas, não o texto que obriga.
   */
  sobretituloOrcamento: string;
  sobretituloCondicoes: string;

  /* ── O ORÇAMENTO, COM O QUE SE PAGA AGORA À VISTA ─────────────────────── */
  /**
   * «30% na adjudicação» e «70% um mês antes», ao lado do total.
   *
   * O faseamento estava três secções abaixo do número, e a pergunta que um
   * casal faz a seguir a ver um total é sempre a mesma: quanto é que pagamos
   * agora. Ter de rolar mais três secções para a responder é a diferença entre
   * uma proposta que se percebe e uma que se põe de lado para ver depois.
   *
   * Moldes com `{pct}` e `{valor}` e não funções: isto atravessa a fronteira
   * servidor→cliente. Ver {@link contagem}.
   */
  agora: string;
  depois: string;
  /**
   * A linha por cima do «Incluído na proposta»: os nomes das secções por que o
   * casal acabou de passar.
   *
   * Sem ela a lista flutua — «serviço de decoração, material e flores conforme
   * descrito» é abstracto a seguir a quarenta fotografias de coisas concretas,
   * e o que o casal precisa é de ligar uma coisa à outra.
   */
  oQueViram: string;
}

/** As secções que a página dobra. Todas são texto de condições. */
export type SeccaoDobravel =
  | "notasImportantes"
  | "condicoesGerais"
  | "observacoesGerais"
  | "faseamento"
  | "cancelamento";

const PT: TextosDaPagina = {
  ampliar: "Ampliar",
  fechar: "Fechar",
  anterior: "Fotografia anterior",
  seguinte: "Fotografia seguinte",
  contagem: "Fotografia {i} de {n}",
  fotoFalhou: "Não foi possível mostrar esta fotografia.",
  tentarDeNovo: "Tentar de novo",
  recarregarFotos: "Voltar a carregar as fotografias",
  recarregarFalhou: "Ainda não deu. Verifique a ligação e tente outra vez daqui a pouco.",
  nestaPagina: "Nesta página",
  inspiracao: "Inspiração",
  semFotos: "As fotografias desta secção não estão disponíveis neste momento.",
  aAbrirAProposta: "A abrir a proposta…",
  paginaDe: "Página {i} de {n}",
  pdfNaoAbriu: "Não deu para mostrar a proposta aqui. Pode abri-la em PDF no botão abaixo.",
  escolhas: "À vossa escolha",
  escolhasIntro:
    "Deixámos aqui algumas alternativas. Escolham a que preferirem: podem mudar de ideias, e falamos sobre isso na mesma.",
  escolherEsta: "Escolher",
  escolhida: "A vossa escolha",
  escolhaGuardada: "Ficámos a saber. Podem mudar de ideias quando quiserem.",
  escolhaFalhou: "Não foi possível registar a escolha.",
  escolhaRepetir: "Tentar outra vez",
  resumos: {
    notasImportantes: "A montagem e a desmontagem, e o que fica do lado do espaço.",
    condicoesGerais:
      "IVA, pré-reserva, deslocações da equipa e a confirmação do número de convidados.",
    observacoesGerais: "O uso do material, os direitos de imagem e a confidencialidade.",
    faseamento: "Quando se paga cada parte, e sobre que valor.",
    cancelamento: "O que acontece se o evento for cancelado, e em que prazos.",
  },
  pontos: "{n} pontos",
  umPonto: "1 ponto",
  sobretituloOrcamento: "O que custa",
  sobretituloCondicoes: "Para vossa tranquilidade",
  agora: "{pct}% na adjudicação: {valor}",
  depois: "os restantes {pct}% um mês antes",
  oQueViram: "Tudo o que viram atrás:",
};

const EN: TextosDaPagina = {
  ampliar: "Enlarge",
  fechar: "Close",
  anterior: "Previous photo",
  seguinte: "Next photo",
  contagem: "Photo {i} of {n}",
  fotoFalhou: "This photo could not be shown.",
  tentarDeNovo: "Try again",
  recarregarFotos: "Load the photos again",
  recarregarFalhou: "That didn't work yet. Please check your connection and try again in a moment.",
  nestaPagina: "On this page",
  inspiracao: "Inspiration",
  semFotos: "The photos in this section are not available right now.",
  aAbrirAProposta: "Opening the proposal…",
  paginaDe: "Page {i} of {n}",
  pdfNaoAbriu:
    "The proposal could not be shown here. You can open it as a PDF with the button below.",
  escolhas: "Yours to choose",
  escolhasIntro:
    "We have left a few alternatives here. Pick the one you prefer: you can change your mind, and we will talk it through anyway.",
  escolherEsta: "Choose",
  escolhida: "Your choice",
  escolhaGuardada: "We have got it. Change your mind whenever you like.",
  escolhaFalhou: "We could not register your choice.",
  escolhaRepetir: "Try again",
  resumos: {
    notasImportantes: "Set-up and take-down, and what the venue is responsible for.",
    condicoesGerais: "VAT, booking, the team's travel, and confirming the final guest count.",
    observacoesGerais: "Use of the materials, image rights, and confidentiality.",
    faseamento: "When each part is due, and on which amount.",
    cancelamento: "What happens if the event is cancelled, and by when.",
  },
  pontos: "{n} points",
  umPonto: "1 point",
  sobretituloOrcamento: "What it costs",
  sobretituloCondicoes: "For your peace of mind",
  agora: "{pct}% on booking: {valor}",
  depois: "the remaining {pct}% one month before",
  oQueViram: "Everything you have just seen:",
};

export function textosDaPagina(idioma: IdiomaDaProposta): TextosDaPagina {
  return idioma === "en" ? EN : PT;
}

/** O molde da contagem preenchido — a única forma de o ler, dos dois lados. */
export function contar(molde: string, i: number, n: number): string {
  return molde.replace("{i}", String(i)).replace("{n}", String(n));
}

/** O molde do faseamento preenchido: a percentagem e, quando há, o valor. */
export function fase(molde: string, pct: number, valor?: string): string {
  return molde.replace("{pct}", String(pct)).replace("{valor}", valor ?? "");
}
