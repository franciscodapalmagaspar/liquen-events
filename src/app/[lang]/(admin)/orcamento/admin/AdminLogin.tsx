"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, Field, Button } from "@/app/[lang]/(admin)/orcamento/admin/ui";
import {
  armarEntradaAutomatica,
  cancelarCerimonia,
  entrarComDispositivo,
  mensagemDeErro,
  suportaAutofillDePasskeys,
  suportaPasskeys,
} from "@/lib/passkeys-cliente";
import { EntradaComFotografia, RodapeDaEntrada } from "./EntradaComFotografia";
/* A escala de movimento da casa — ver `ui/movimento.ts` para o censo que a
   motivou. `ESTADO` são os 120 ms do degrau `micro` numa lista fechada de
   propriedades (nenhuma delas força *layout*); `PRESSAO` é o toque a 20 ms.
   As duas trazem `motion-safe:` — não há rede global no `globals.css`. */
import { ESTADO, PRESSAO } from "./ui/movimento";
import { useGaveta } from "./ui/gaveta";
import { rolarAJanela } from "@/lib/motion/rolar";
import {
  PARAM_DESTINO,
  consumirMarcaDeSaida,
  consumirMarcaDeSessao,
  destinoSeguro,
} from "./entrada-destino";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PORTA DO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O desenho da PÁGINA (a fotografia, o véu, as medidas) vive no
 * `EntradaComFotografia.tsx` e o cabeçalho dele explica-o. Aqui está o que se
 * FAZ na porta, e a ordem por que se faz.
 *
 * ── PRIMEIRO O APARELHO, DEPOIS A PALAVRA-PASSE ───────────────────────────
 * Estava ao contrário: o formulário em cima e «Entrar com este dispositivo» lá
 * em baixo, depois de um «ou», com três linhas a explicá-lo. Ou seja, o método
 * mais rápido E mais seguro dos dois — não há segredo partilhado para roubar, e
 * a assinatura está presa à origem que o browser vê, portanto não se pode dar
 * por engano num site cópia — estava desenhado como a alternativa.
 *
 * Agora é o botão principal, e o aparelho já registado nem espera pelo clique:
 * `armarEntradaAutomatica` deixa a passkey proposta na lista do preenchimento
 * automático, e escolhê-la basta.
 *
 * ── E O CAMINHO INVERSO, QUE NÃO EXISTIA ──────────────────────────────────
 * Nada nesta página dizia como se REGISTA um aparelho novo. Quem trocasse de
 * telemóvel via um botão que não funcionava e nenhuma explicação — e registar
 * exige sessão aberta, portanto a resposta («entra com a palavra-passe e regista
 * lá dentro») não é adivinhável. Está escrita, em duas linhas, no fundo do
 * cartão.
 *
 * ── O QUE ISTO CUSTOU À DOBRA DO TELEMÓVEL, medido ────────────────────────
 * A 390x844 (o iPhone que ela usa), fundo de cada botão contado do topo do
 * ecrã. A condição que o `EntradaComFotografia` põe é que o botão de entrar
 * caiba acima da dobra:
 *
 *                          antes    depois
 *   «Entrar com este dispositivo»     800       465    ← passou a ser o primeiro
 *   entrar com palavra-passe          660       831    ← desceu, e continua acima
 *
 * A palavra-passe desce 171 px: é o preço de a passkey passar para cima, e é
 * pago com 13 px de folga para a dobra, não com fé. Foram precisos três cortes
 * para lá chegar, e cada um está anotado onde foi feito — o maior é a caixa de
 * «manter a sessão iniciada», que só explica o que se perde DEPOIS de ser
 * desligada. A página inteira passa de 975 para 1150 px de altura; o que cresce
 * fica todo abaixo do botão (a recuperação e o «mudaste de telemóvel?»).
 *
 * ── O QUE NÃO PODE MUDAR DAQUI ────────────────────────────────────────────
 * A frase de recusa vem do servidor e é a MESMA haja ou não haja conta com
 * aquele endereço. O plano B local nunca pode ser mais específico do que ela.
 */

/** Onde vive a lista de dispositivos, dito por palavras e não por um link que
 *  daqui não se pode seguir (o ecrã está atrás da sessão). */
const ONDE_SE_REGISTA = "Os meus dispositivos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «MANTER A SESSÃO INICIADA» VEM DESLIGADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Vinha ligada, e a razão escrita era honesta: era o que já acontecia, e mudar
 * punha a equipa a voltar a entrar sem ninguém ter pedido. O que mudou desde
 * então foi a PASSKEY.
 *
 * ── Porque é que a passkey muda a conta ───────────────────────────────────
 * O custo de uma sessão curta é o de voltar a entrar. Quando isso era escrever
 * um email e uma palavra-passe várias vezes por semana, 30 dias compravam
 * qualquer coisa real — e uma sessão curta empurra as pessoas para
 * palavras-passe fáceis e para as escrever num papel. Com a passkey, voltar a
 * entrar é um toque no leitor de impressão digital. O preço caiu quase a zero;
 * o risco não caiu nada.
 *
 * ── E o risco é concreto, não teórico ─────────────────────────────────────
 * Isto é uma ferramenta com dados de clientes — nomes, moradas, preços,
 * contratos, facturas — e é usada em cima do acontecimento: tablets e
 * portáteis que andam para quintas e hotéis, e que são precisamente os
 * aparelhos que se perdem. Uma senha de 30 dias num aparelho perdido é 30 dias
 * de acesso a tudo.
 *
 * ── Ligada por omissão não é uma escolha ──────────────────────────────────
 * É o argumento que decide. Uma caixa pré-marcada não foi decidida por
 * ninguém: quem entra todos os dias deixa de a ver ao fim de uma semana. O que
 * se perde ao desmarcá-la é um toque; o que se ganha é que ficar com sessão
 * aberta um mês passe a ser um gesto de quem o quer, feito num aparelho que
 * essa pessoa sabe que é seu.
 *
 * ── Como se volta atrás ───────────────────────────────────────────────────
 * Esta constante, para `true`. Fica num sítio só e com a razão ao lado,
 * precisamente para a decisão poder ser revista sem se ter de a reconstituir.
 * Nada mais no ecrã depende dela: o texto explica os dois lados nos dois
 * estados.
 */
const MANTER_SESSAO_POR_OMISSAO = false;

export default function AdminLogin() {
  /** «Mudaste de telemóvel ou de computador?». Ver `ui/gaveta.ts`. */
  const gaveta = useGaveta();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * DE QUAL DAS DUAS PORTAS VEIO O ERRO.
   *
   * Havia um sítio só para a mensagem — dentro do formulário, por cima do botão
   * de submeter — e a entrada por dispositivo escrevia lá a dela. MEDIDO a
   * 375×667: o botão «Entrar com este dispositivo» está a 473–521 px do topo,
   * portanto à vista; a mensagem nascia aos 782,8 px, ou seja 116 px ABAIXO da
   * borda de baixo do ecrã. Quem tocasse no botão e o servidor recusasse o
   * desafio via o botão voltar ao normal e mais nada — o ecrã dizia que não
   * tinha acontecido nada, e o que tinha acontecido era uma recusa.
   *
   * Com isto a mensagem fica encostada ao botão que a produziu, que é onde os
   * olhos já estão. Uma variável e não duas mensagens: o texto continua a ser
   * um só, e quem submete a palavra-passe volta a pô-lo no sítio de sempre.
   */
  const [erroNoDispositivo, setErroNoDispositivo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aEntrarComDispositivo, setAEntrarComDispositivo] = useState(false);
  /** Bloco 3: escrever às cegas no telemóvel é das coisas mais irritantes. */
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [manterSessao, setManterSessao] = useState(MANTER_SESSAO_POR_OMISSAO);
  // Recuperação: painel fechado por omissão, para a página continuar a ser uma
  // página de ENTRADA. Só abre a quem o pedir.
  /**
   * ── DOIS ESTADOS, E SÓ UM BOTÃO CHEIO EM CADA ─────────────────────────
   *
   * O `docs/LOGIN.md` abre com a avaria: «Entrar com este dispositivo»
   * (preenchido) e «Entrar com palavra-passe →» (contornado) tinham a MESMA
   * largura e a MESMA altura. Dois caminhos com o mesmo peso não são uma
   * recomendação — são uma pergunta —, e a regra da Apple é distinguir a
   * opção preferida por ESTILO e nunca por tamanho.
   *
   * E o formulário estava sempre aberto, mesmo para quem ia usar a chave de
   * acesso. Era isso que obrigava ao separador «ou» e criava a competição.
   *
   * Passa a haver dois estados:
   *
   *   · `chave`  — a chave de acesso é o botão cheio; a palavra-passe é um
   *                link de texto;
   *   · `senha`  — o formulário abre, «Entrar» é o botão cheio, e a chave de
   *                acesso recua para link.
   *
   * Nunca há dois cheios. O caminho não escolhido é sempre um link.
   *
   * O de omissão é `chave` quando o browser sabe o que é uma chave de acesso;
   * onde não sabe, o formulário é a única porta e abre já — é o ponto do
   * documento sobre «chave de acesso indisponível neste aparelho: abre-se
   * directamente no estado B».
   */
  const [caminho, setCaminho] = useState<"chave" | "senha">("chave");

  const [aRecuperar, setARecuperar] = useState(false);
  const [emailRecuperacao, setEmailRecuperacao] = useState("");
  const [aEnviarLigacao, setAEnviarLigacao] = useState(false);
  const [respostaRecuperacao, setRespostaRecuperacao] = useState<{
    tipo: "ok" | "erro";
    texto: string;
  } | null>(null);
  /** A sessão caiu a meio do trabalho nesta aba? Ver `entrada-destino.ts`. */
  const [sessaoExpirou, setSessaoExpirou] = useState(false);
  const router = useRouter();
  const capsId = useId();

  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => {
      document.body.classList.remove("admin-mode");
      // O espaço aberto para o teclado (ver `seguirOTeclado`) é do <body>, que
      // sobrevive a esta página. Sair com um campo em foco — que é exactamente
      // o que acontece a quem entra com o Enter — deixava-o lá para o back
      // office inteiro herdar.
      abrirEspaco(0);
    };
  }, []);

  useEffect(() => {
    // A marca é consumida ao ler: o aviso é para esta chegada à entrada, não
    // para todas as que venham a seguir dentro da mesma aba.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessaoExpirou(consumirMarcaDeSessao());
  }, []);

  /**
   * A entrada por dispositivo só aparece onde o browser a percebe — um botão
   * que falha ao ser tocado é pior do que um botão que não existe.
   *
   * `useSyncExternalStore` e não um efeito com `setState`: isto é uma
   * capacidade do ambiente, não um estado que muda. O servidor devolve `false`
   * (não há `window`), o browser devolve o que sabe, e o React trata da
   * diferença sem um segundo desenho pedido à mão. A subscrição não faz nada
   * de propósito: a resposta nunca muda durante a vida da página.
   */
  const temPasskeys = useSyncExternalStore(
    () => () => {},
    suportaPasskeys,
    () => false,
  );

  /**
   * Estamos no estado A? Só quando o browser sabe o que é uma chave de acesso
   * E ela ainda não foi recusada em favor da palavra-passe. O `needs2fa`
   * força o estado B: pedido um código, o formulário é o único caminho.
   */
  const noEstadoDaChave = temPasskeys && caminho === "chave" && !needs2fa;

  /**
   * ── UMA PORTA DE CADA VEZ, E A FOTOGRAFIA QUE MO MOSTROU ─────────────────
   *
   * Ela mandou o ecrã com o painel de recuperação aberto, e o que lá estava
   * eram DOIS campos de email visíveis ao mesmo tempo: o «Email» da entrada,
   * lá em cima, e o «Email da tua conta» da recuperação, oito centímetros
   * abaixo — com uma palavra-passe, um «manter a sessão», um «Entrar» apagado
   * e um «Enviar ligação» pelo meio.
   *
   * A regra desta casa é a mesma que o `docs/LOGIN.md` escreve para os dois
   * caminhos de entrada: **esconder o que não é relevante agora**. Recuperar a
   * palavra-passe não é um extra do formulário de entrada — é outro sítio onde
   * se está. Enquanto se está lá, o formulário recolhe (a mesma altura animada
   * que já existe para a chave de acesso), e volta com o «Voltar».
   */
  /**
   * ── DUAS GAVETAS, E NÃO UMA (10/11) ──────────────────────────────────────
   *
   * Era UMA: `noEstadoDaChave || aRecuperar` fechava a caixa inteira — e a
   * caixa inteira tinha lá dentro o formulário de RECUPERAÇÃO. Carregar em
   * «Esqueci-me da palavra-passe» fechava, portanto, o próprio formulário que
   * devia abrir: o cartão ficava só com «Mudei de aparelho». Ela: «aparece isto
   * e mais nada… não dá para fazer nada».
   *
   * Agora a caixa de fora fecha só no estado da chave de acesso
   * ({@link caixaRecolhida}); a de dentro, à volta do formulário de entrada,
   * fecha também enquanto se recupera ({@link formularioRecolhido}).
   */
  const caixaRecolhida = noEstadoDaChave;
  const formularioRecolhido = noEstadoDaChave || aRecuperar;

  /**
   * ── PARA ONDE SE VOLTA DEPOIS DE ENTRAR ───────────────────────────────────
   *
   * Lido do `?destino=` e VALIDADO em `destinoSeguro` — que só deixa passar
   * caminhos internos do back office, porque «vai para onde o URL disser» é um
   * redireccionamento aberto e o cabeçalho do `entrada-destino.ts` explica ao
   * que sabe. Sai daqui `null` ou um caminho que começa por `/`.
   *
   * Lido do `window` e não do `useSearchParams`: o instantâneo do servidor é
   * `null`, portanto o HTML sai igual em qualquer caso e não há hidratação
   * dividida nem fronteira de `Suspense` a montar por uma linha de texto.
   */
  const destino = useSyncExternalStore(
    () => () => {},
    lerDestinoDoUrl,
    () => null,
  );

  /** Depois de a sessão estar aberta: ou se vai ao sítio pedido, ou se fica. */
  const entrou = useCallback(() => {
    /**
     * VOLTA-SE AO TOPO ANTES DE ENTRAR.
     *
     * Esta página passou a ser alta — a fotografia ocupa o ecrã inteiro — e o
     * browser guarda a posição do scroll quando o conteúdo é substituído no
     * lugar (`router.refresh()`). Resultado medido num ecrã de 375×568: quem
     * entrava caía no back office já a 66 px do topo, com o cabeçalho a
     * aparecer encolhido, como se a página já tivesse sido lida.
     *
     * Foi o passeio móvel que o apanhou, e apanhou-o bem: media o cabeçalho
     * «no topo» quando ele já não estava no topo.
     */
    window.scrollTo(0, 0);
    if (destino && destino !== window.location.pathname + window.location.search) {
      router.replace(destino);
      return;
    }
    // Sem destino, a própria página onde estamos passa a ter sessão: basta
    // voltar a pedi-la ao servidor. É também o caso do `/carregamento/[id]`,
    // que desenha esta entrada NO LUGAR e portanto já está no sítio certo.
    router.refresh();
  }, [destino, router]);

  const manterSessaoRef = useRef(manterSessao);
  useEffect(() => {
    manterSessaoRef.current = manterSessao;
  });

  /**
   * O Caps Lock, lido do próprio evento de teclado.
   *
   * `getModifierState` é a única forma de o saber: não existe um evento de «o
   * Caps Lock mudou». Ler no `keydown` E no `keyup` é o que faz o aviso
   * aparecer e desaparecer na própria tecla que o liga — no `keydown` da tecla
   * Caps Lock o estado ainda é o antigo, e no `keyup` já é o novo.
   *
   * Nos teclados de telemóvel `getModifierState` devolve sempre `false`, e é o
   * que se quer: lá não há Caps Lock, há a maiúscula automática, que é outra
   * coisa e não é um engano.
   */
  const aoTeclar = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (typeof e.getModifierState !== "function") return;
    setCapsLock(e.getModifierState("CapsLock"));
  }, []);

  /**
   * ── A PASSKEY PROPOSTA SEM SE CARREGAR EM NADA ────────────────────────────
   *
   * `mediation: "conditional"` (via `useBrowserAutofill`): o browser junta as
   * passkeys deste domínio à lista do preenchimento automático do campo do
   * email — que tem `autoComplete="username webauthn"` por causa disto. Num
   * aparelho já registado, entrar passa a ser escolher uma linha.
   *
   * Só arma onde o browser o sabe fazer; onde não sabe, fica o botão, que
   * continua a ser o caminho principal e não um plano B.
   */
  useEffect(() => {
    if (!temPasskeys) return;
    // QUEM ACABOU DE SAIR FICA FORA. A marca é consumida aqui, uma vez por
    // chegada à porta — ver `consumirMarcaDeSaida`. Medido: sem isto, entre o
    // clique em «Sair» e o ecrã de entrada assentar passavam 600 ms e a sessão
    // estava aberta outra vez, sem um único toque.
    if (consumirMarcaDeSaida()) return;
    let desarmar: (() => void) | undefined;
    let cancelado = false;
    void suportaAutofillDePasskeys().then((podeAutofill) => {
      if (cancelado || !podeAutofill) return;
      desarmar = armarEntradaAutomatica({
        aoEntrar: () => entrou(),
        // Uma falha do caminho automático não pode pintar de vermelho um ecrã
        // onde ninguém pediu nada: a pessoa continua a poder escrever a
        // palavra-passe, e o botão continua lá.
        aoFalhar: () => {},
        manterSessao: () => manterSessaoRef.current,
      });
    });
    return () => {
      cancelado = true;
      desarmar?.();
    };
  }, [temPasskeys, entrou]);

  async function entrarPorDispositivo() {
    if (aEntrarComDispositivo || loading) return;
    setAEntrarComDispositivo(true);
    setError(null);
    setErroNoDispositivo(false);
    try {
      await entrarComDispositivo({ manterSessao });
      entrou();
    } catch (err) {
      // Cancelar não é falhar: `mensagemDeErro` devolve null e o ecrã fica
      // como estava, sem aviso vermelho por a pessoa ter mudado de ideias.
      const msg = mensagemDeErro(err);
      if (msg) {
        setErroNoDispositivo(true);
        setError(msg);
      }
      setAEntrarComDispositivo(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // O duplo envio fecha-se aqui e no botão (`loading` desactiva-o): o Enter
    // repetido não passa pelo botão nenhuma vez.
    if (loading) return;
    setLoading(true);
    setError(null);
    setErroNoDispositivo(false);
    // A cerimónia do autofill fica pendurada à espera de uma escolha que já não
    // vai acontecer — e uma cerimónia viva impede a próxima de arrancar.
    cancelarCerimonia();
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, email, code, manterSessao }),
      });
      if (res.ok) {
        entrou();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.needs2fa) {
        setNeeds2fa(true);
        setError(code ? "Código de verificação inválido." : "Introduz o código de verificação.");
      } else {
        // A frase vem do servidor e é a MESMA para «esta conta não existe» e
        // «a palavra-passe está errada». O plano B nunca pode ser mais
        // específico do que ela — era por aí que voltava a distinção.
        setError(data?.error ?? "Credenciais incorretas.");
      }
      setLoading(false);
    } catch {
      setError("Erro de ligação. Tenta novamente.");
      setLoading(false);
    }
  }

  /**
   * Pedir a ligação para definir uma palavra-passe nova.
   *
   * A resposta do servidor é NEUTRA de propósito — não diz se o endereço
   * existe — e é essa frase que se mostra, tal e qual. Escrever aqui um
   * «enviámos!» mais simpático transformava esta caixa num verificador de
   * endereços da equipa.
   */
  async function pedirLigacao(e: React.FormEvent) {
    e.preventDefault();
    if (aEnviarLigacao) return;
    setAEnviarLigacao(true);
    setRespostaRecuperacao(null);
    try {
      const res = await fetch("/api/admin/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailRecuperacao }),
      });
      const data = await res.json().catch(() => ({}));
      setRespostaRecuperacao(
        res.ok
          ? { tipo: "ok", texto: data?.mensagem ?? "Pedido registado." }
          : {
              tipo: "erro",
              texto: data?.error ?? "Não foi possível tratar o pedido. Tenta daqui a bocado.",
            },
      );
    } catch {
      setRespostaRecuperacao({ tipo: "erro", texto: "Erro de ligação. Tenta novamente." });
    }
    setAEnviarLigacao(false);
  }

  return (
    <EntradaComFotografia>
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Brand mark — colour logo on the light, calm entry screen */}
        <Image
          src="/logo-liquen.png"
          alt="Líquen Events"
          width={210}
          height={125}
          priority
          /**
           * h-24 e não h-16. A marca estava pequena para o espaço que tem: numa
           * coluna de 486 px, 64 px de altura deixavam-na a boiar no topo. A
           * proporção é a do ficheiro (`w-auto`), portanto isto é só escala.
           */
          /*
            h-32 e não h-24. Ela olhou para a marca no ecrã de entrada e disse
            «tem que ficar maior».

            Aqui não há o tecto que a barra do painel tem: esta é uma coluna com
            espaço, e o comentário de cima já dizia que a 64 px «deixavam-na a
            boiar no topo». A proporção é a do ficheiro (`w-auto`); isto é só
            escala.
          */
          className="bo-cena h-32 w-auto object-contain"
        />

        {/* ── O CARTÃO, E A ENTRADA EM DOIS TEMPOS (`docs/LOGIN.md`, 12 e 16)
            «Sem movimento nenhum. É o primeiro ecrã que ela vê todos os
            dias.» A marca e depois o cartão, com a escada da casa (`.bo-cena`:
            600 ms, a curva de saída, degraus de 20 ms) — a mesma da Visão
            Geral, que é o ecrã que vem a seguir. Com «reduzir movimento» não
            há escada nenhuma (`admin.css`).

            `.bo-porta` dá-lhe o raio de folha (26) e os controlos a 10; o
            padding é o dos 32 do documento a partir de `sm`, e 24 no
            telemóvel: medido a 320 px, com 32 o botão da chave de acesso
            fica com 222 px para uma frase de 224 (é `whitespace-nowrap`), e
            a frase sai pela borda. */}
        <Card
          padding="none"
          className="bo-porta bo-cena w-full p-6 sm:p-8"
          style={{ "--cena": 1 } as React.CSSProperties}
        >
          <div className="mb-5 text-center">
            <p className="bo-eyebrow mb-2">Área restrita</p>
            <h1 className="font-display text-2xl leading-tight text-[var(--bo-text)]">
              Painel de Gestão
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--bo-text-muted)]">
              {/* «Escolhe como queres entrar» saiu: com os dois estados já não
                  se pede escolha nenhuma — a chave de acesso é a recomendação e
                  a palavra-passe é um link para quem precisar dela. Uma frase
                  que pede uma decisão que já não existe é ruído.

                  «Bem-vinda» presumia que quem entra é mulher. Hoje é verdade e
                  amanhã deixa de ser — e a frase não ganha nada com o género. */}
              Bem-vindo de volta.
            </p>
          </div>

          {/* ── A sessão caiu a meio ────────────────────────────────────────
              Um redireccionamento seco para a entrada não explica nada: quem
              estava a meio de uma proposta fica sem saber se perdeu o trabalho.
              A frase diz as duas coisas — o que aconteceu e o que não se
              perdeu. */}
          {sessaoExpirou && (
            <p
              role="status"
              className="mb-5 rounded-xl bg-[var(--bo-aviso-lavagem)] px-4 py-3 text-sm leading-relaxed text-[var(--bo-aviso)]"
            >
              A tua sessão expirou. Entra outra vez — tudo o que já tinha sido guardado está
              guardado.
            </p>
          )}

          {/* ── 1. A CHAVE DE ACESSO, que é o caminho principal ────────────
              Só no estado A. Escolhida a palavra-passe, este bloco inteiro
              recua — e o caminho de volta fica no link do fundo do formulário.
              A regra é uma só e vale nos dois sentidos: **nunca dois botões
              cheios ao mesmo tempo**, e o caminho não escolhido é sempre um
              link de texto. */}
          {noEstadoDaChave && (
            <div className="mb-4">
              <Button
                type="button"
                size="lg"
                fullWidth
                loading={aEntrarComDispositivo}
                onClick={entrarPorDispositivo}
                iconLeft={
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
                  </svg>
                }
              >
                {aEntrarComDispositivo ? "A confirmar…" : "Entrar com a chave de acesso"}
              </Button>

              {/* A recusa do aparelho fica AQUI, e não lá em baixo no
                  formulário. Ver `erroNoDispositivo`: a 375×667 a outra
                  posição caía 116 px abaixo da borda do ecrã. */}
              {error && erroNoDispositivo && <AvisoDeRecusa texto={error} className="mt-2" />}

              {/* Uma linha, e não três. O que a pessoa precisa de saber para
                  decidir se carrega é o gesto que lhe vai ser pedido. Voz
                  activa: «Usa o rosto», e não «Com o rosto». */}
              <p className="mt-2 text-center text-xs leading-relaxed text-foreground/45">
                Usa o rosto, a impressão digital ou o PIN deste aparelho.
              </p>

              {/* ── E O SEPARADOR «OU» SAIU ────────────────────────────────
                  Ele existia para separar duas opções simultâneas. Com o
                  formulário fechado já não há duas — há uma recomendação e um
                  link para quem precisar de outra coisa. O separador deixou de
                  ter o que separar.

                  O caminho da palavra-passe é um LINK e não um botão de largura
                  total: dois botões da mesma largura leem-se como duas acções
                  de igual peso, e não são. */}
              <button
                type="button"
                onClick={() => setCaminho("senha")}
                className={`alvo-toque mt-6 w-full text-center text-sm text-[var(--bo-accent)] underline underline-offset-[3px] hover:text-[var(--bo-accent-hover)] ${ESTADO} ${PRESSAO}`}
              >
                Entrar com palavra-passe
              </button>
            </div>
          )}

          {/* ── 2. A PALAVRA-PASSE, a alternativa ──────────────────────────

              ── PORQUE É QUE ISTO COLAPSA COM `grid-template-rows` ──────────

              Porque `height: auto` não anima. As saídas habituais são medir a
              altura em JavaScript (que obriga a um `ResizeObserver` e a um
              fotograma de atraso) ou pôr um `max-height` fixo (que é um número
              inventado que parte no dia em que o conteúdo cresce).

              Uma grelha de UMA linha anima de `0fr` a `1fr` sem saber a altura
              de nada, e o browser trata do resto. O `overflow-hidden` do filho
              é o que faz o conteúdo ser cortado enquanto a linha ainda não
              abriu — sem ele, o formulário aparece todo e a animação não se vê.

              `aria-hidden` e `inert` quando fechado: um formulário invisível
              mas tabulável é uma armadilha para quem navega com o teclado.
          */}
          <div
            className={`grid ${caixaRecolhida ? "grid-rows-[0fr]" : "grid-rows-[1fr]"} motion-safe:transition-[grid-template-rows] motion-safe:duration-quick motion-safe:ease-quick`}
            aria-hidden={caixaRecolhida || undefined}
            inert={caixaRecolhida || undefined}
          >
            {/*
            ── O `overflow-hidden` SÓ ENQUANTO ESTÁ FECHADO ─────────────────

            Ele é o que corta o conteúdo enquanto a linha da grelha ainda não
            abriu — sem ele, o formulário aparece todo de uma vez e a animação
            não se vê.

            Mas ABERTO ele corta outra coisa: o anel de foco. O anel desta casa
            é um `box-shadow` que se estende 4 px para fora do campo, e um
            ascendente com `overflow-hidden` corta-lhe as laterais. O que sobra
            são dois riscos verdes, um por cima e outro por baixo do campo — foi
            isso que ela viu e me disse para tirar.

            A `docs/LOGIN.md` já o proíbe por escrito, na Parte 10: o anel é
            «adaptado aos cantos arredondados, **nunca cortado por `overflow`**».

            Tirar o anel não é opção: a Parte 12 proíbe `outline: none` sem
            substituto, e sem ele quem navega por teclado deixa de saber onde
            está. O que se tira é o CORTE.
          */}
            <div className={caixaRecolhida ? "overflow-hidden" : ""}>
              {/* A gaveta de dentro: o formulário de entrada recolhe enquanto
                  se recupera a palavra-passe — e a recuperação, cá fora dela,
                  fica à vista. */}
              <div
                className={`grid ${formularioRecolhido ? "grid-rows-[0fr]" : "grid-rows-[1fr]"} motion-safe:transition-[grid-template-rows] motion-safe:duration-quick motion-safe:ease-quick`}
                aria-hidden={formularioRecolhido || undefined}
                inert={formularioRecolhido || undefined}
              >
                <div className={formularioRecolhido ? "overflow-hidden" : ""}>
                  <form
                    onSubmit={submit}
                    className="flex flex-col gap-4"
                    onFocus={aoFocarCampo}
                    onBlur={aoSairDoCampo}
                  >
                    <Field
                      label="Email"
                      semMarcaDeObrigatorio
                      name="email"
                      /**
                       * ── PORQUE É QUE ISTO É UM EMAIL E NÃO UM NOME ─────────────
                       *
                       * Um nome próprio é curto, está escrito no site, colide assim
                       * que a equipa cresça, e nenhum gestor de palavras-passe o sabe
                       * guardar — o que empurra toda a gente para palavras-passe
                       * repetidas e decoradas. O email resolve as quatro coisas.
                       *
                       * `type="email"` traz o teclado com o @ no telemóvel;
                       * `spellCheck={false}` e `autoCapitalize="none"` evitam o
                       * «Catarina@…» que o teclado de iOS faz sozinho.
                       *
                       * `autoComplete="username webauthn"`: `username` é o par que os
                       * gestores de palavras-passe esperam encontrar ao lado do
                       * `current-password` — sem ele, muitos não oferecem nada. O
                       * `webauthn` NO FIM é o que a norma exige para o browser juntar
                       * as passkeys a essa mesma lista (ver `armarEntradaAutomatica`);
                       * fora do fim, é ignorado.
                       *
                       * SEM EXEMPLO, e é de propósito: estava aqui o nome verdadeiro
                       * de quem trabalha na empresa, numa página que qualquer pessoa
                       * na internet consegue abrir. Quem tenta entrar sem ser
                       * convidado precisa de um identificador válido e de uma
                       * palavra-passe — e nós dávamos a primeira metade.
                       */
                      type="email"
                      inputMode="email"
                      autoComplete={temPasskeys ? "username webauthn" : "username"}
                      spellCheck={false}
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyUp={aoTeclar}
                      /* Bloco 3: ambos os campos são obrigatórios, portanto ambos
                 levam o asterisco. Ter só um marcado dizia que o outro não
                 era — e era. */
                      required
                      autoFocus
                    />

                    {/* O olho de mostrar/ocultar. `relative` no invólucro e o botão
                encostado ao FUNDO: o campo é o último filho do `Field`, logo o
                fundo do invólucro é o fundo do campo — e continua a ser quando
                a letra do telemóvel cresce para os 16 px. */}
                    <div className="relative">
                      <Field
                        label="Palavra-passe"
                        semMarcaDeObrigatorio
                        name="password"
                        type={mostrarSenha ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyUp={aoTeclar}
                        onKeyDown={aoTeclar}
                        required
                        /* SEM placeholder. Os oito pontinhos que aqui estavam faziam um
                   campo VAZIO parecer preenchido — e num campo de palavra-passe
                   isso é a diferença entre «esqueci-me de escrever» e «escrevi e
                   não guardou». O placeholder só serve onde comunica FORMATO. */
                        /* O aviso do Caps Lock vive fora do `Field` (senão empurrava o
                   olho para baixo ao aparecer); a ligação para quem usa leitor
                   de ecrã faz-se à mão. */
                        aria-describedby={capsLock ? capsId : undefined}
                        /* Espaço para o olho. Em estilo e não numa classe: o `cn` desta
                   casa não resolve conflitos do Tailwind, e um `pr-12` ao lado
                   do `px-3.5` do `Field` decidia-se pela ordem da folha de
                   estilos, que não é coisa que se queira adivinhar. */
                        style={{ paddingRight: "2.75rem" }}
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha((v) => !v)}
                        /* 40 px com rato, 44 no dedo — o mínimo das HIG, o mesmo que o
                   `ui/Button` usa. */
                        className={`absolute bottom-0 right-0.5 flex h-10 w-10 items-center justify-center rounded-lg text-foreground/40 ${ESTADO} ${PRESSAO} hover:text-[var(--bo-tinta-72)] pointer-coarse:h-11 pointer-coarse:w-11`}
                        aria-label={
                          mostrarSenha ? "Ocultar a palavra-passe" : "Mostrar a palavra-passe"
                        }
                        aria-pressed={mostrarSenha}
                        /* Fora da ordem de tabulação: quem anda de campo em campo com o
                   teclado quer ir do email para a palavra-passe e daí para o
                   botão de entrar, não parar num olho pelo meio. Continua
                   alcançável pelo rato, pelo dedo e por leitor de ecrã. */
                        tabIndex={-1}
                      >
                        {mostrarSenha ? <OlhoFechado /> : <OlhoAberto />}
                      </button>
                    </div>

                    {/* Caps Lock. Um aviso, não um erro: a palavra-passe pode muito bem
                ter maiúsculas de propósito. */}
                    {capsLock && (
                      <p
                        id={capsId}
                        role="status"
                        className="-mt-2 flex items-start gap-2 text-xs leading-relaxed text-[var(--bo-aviso)]"
                      >
                        <span aria-hidden="true">⇪</span>
                        <span>O Caps Lock está ligado.</span>
                      </p>
                    )}

                    {needs2fa && (
                      <Field
                        label="Código de verificação (2FA)"
                        name="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        autoFocus
                        required
                        hint="Escreve o código de 6 dígitos da tua aplicação de autenticação."
                        placeholder="000000"
                        className="text-center text-lg tracking-[0.4em]"
                      />
                    )}

                    {error && !erroNoDispositivo && <AvisoDeRecusa texto={error} />}

                    {/* ── Manter a sessão iniciada ──────────────────────────────────
                Com a duração dita por extenso: «manter-me com sessão iniciada»
                sem número é uma promessa que cada pessoa lê como quer. O alvo
                de toque é a linha inteira (`alvo-toque` no rótulo), não o
                quadrado de 16 px.

                A CONSEQUÊNCIA DE DESLIGAR só aparece depois de desligada, e é
                de propósito: ligada é o que já acontecia e não precisa de
                explicação nenhuma, e as três linhas do «se desligares…»
                custavam 54 px que empurravam o botão de submeter para baixo da
                dobra do telemóvel (medido a 390x844). Quem desliga vê logo o
                que trocou. */}
                    <label className="alvo-toque flex items-start gap-2 text-left">
                      <input
                        type="checkbox"
                        name="manterSessao"
                        checked={manterSessao}
                        onChange={(e) => setManterSessao(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-sage-600"
                      />
                      <span className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
                        Manter a sessão iniciada neste aparelho durante 30 dias
                        {/* A CONSEQUÊNCIA APARECE NO ESTADO QUE SE ESCOLHE, não na
                    omissão — que é a MESMA regra de antes, virada ao contrário
                    porque a omissão mudou de lado.

                    Antes explicava-se o desligar (a omissão era ligada); agora
                    explica-se o ligar. E não é só simetria: das duas, é ligar
                    que tem consequência — um mês de sessão aberta num aparelho
                    que anda para quintas e hotéis.

                    Que apareça UMA de cada vez também não é estética. Estas
                    linhas custam ~36 px, e o cabeçalho deste ficheiro mede o
                    botão de submeter a 831 px de uma dobra de 844 no telemóvel
                    dela: com as duas explicações sempre à vista, o botão de
                    entrar caía abaixo da dobra. Foi o que aconteceu à primeira,
                    e viu-se no retrato a 393 px. */}
                        {manterSessao && (
                          <span className="block text-foreground/45">
                            Um mês é muito tempo num aparelho que ande por aí — marca só se este for
                            teu.
                          </span>
                        )}
                      </span>
                    </label>

                    {/* ── UM BOTÃO CHEIO, E É ESTE ────────────────────────────────
                Era `secondary` quando havia chaves de acesso, porque os dois
                caminhos estavam abertos ao mesmo tempo e um deles tinha de
                recuar. Já não estão: chegado aqui, a palavra-passe É o caminho,
                e a chave de acesso é que recuou para o link lá em baixo.

                A seta «→» saiu. Não é convenção da Apple — a convenção são
                reticências, e só quando o botão abre outra vista que pede mais
                alguma coisa. Este não abre nada: entra.

                Desactivado até haver as duas coisas, que é o que substitui os
                asteriscos: em vez de marcar o que falta com cor, o botão diz
                que ainda não dá, e o `title` diz porquê. */}
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      fullWidth
                      loading={loading}
                      className="mt-1"
                      disabled={!needs2fa && (!email.trim() || !password)}
                      title={
                        !needs2fa && (!email.trim() || !password)
                          ? !email.trim() && !password
                            ? "Escreve o email e a palavra-passe"
                            : !email.trim()
                              ? "Falta o email"
                              : "Falta a palavra-passe"
                          : undefined
                      }
                    >
                      {loading ? "A verificar…" : needs2fa ? "Verificar" : "Entrar"}
                    </Button>
                  </form>
                </div>
              </div>

              {/* ── Recuperação ────────────────────────────────────────────────
              Fica FORA do <form> de entrada: dois formulários encaixados são
              HTML inválido, e o Enter dentro do painel submetia a entrada. */}
              {noEstadoDaChave ? null : !aRecuperar ? (
                <button
                  type="button"
                  onClick={() => {
                    setARecuperar(true);
                    // Leva o que já estava escrito: quem chegou aqui é porque a
                    // palavra-passe falhou, e reescrever o email é atrito a mais.
                    setEmailRecuperacao(email);
                  }}
                  className={`alvo-toque mt-4 w-full text-center text-xs text-foreground/50 underline underline-offset-4 hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
                >
                  Esqueci-me da palavra-passe
                </button>
              ) : (
                <form
                  onSubmit={pedirLigacao}
                  className="mt-5 flex flex-col gap-3 border-t border-[var(--bo-hairline-strong)] pt-5"
                  onFocus={aoFocarCampo}
                  onBlur={aoSairDoCampo}
                >
                  {/* Com o formulário recolhido, este bloco passa a ser O ecrã — e
                  um ecrã sem título deixa quem lá chegou sem saber onde está. */}
                  <h2 className="text-base font-medium text-[var(--bo-tinta-82)]">
                    Recuperar a palavra-passe
                  </h2>
                  <p className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
                    Escreve o teu email e enviamos-te uma ligação para definires uma palavra-passe
                    nova. A ligação serve uma vez e dura 30 minutos.
                  </p>
                  <Field
                    label="Email da tua conta"
                    name="email-recuperacao"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={emailRecuperacao}
                    onChange={(e) => setEmailRecuperacao(e.target.value)}
                    required
                    /* Num ecrã com UM campo, o asterisco de obrigatório não informa
                   ninguém: não há nada de que se distinga. A Parte 9 do
                   `docs/LOGIN.md` manda-o tirar, e é aqui que ele aparecia. */
                    semMarcaDeObrigatorio
                    autoFocus
                  />
                  {respostaRecuperacao && (
                    <p
                      role="status"
                      aria-live="polite"
                      className={
                        respostaRecuperacao.tipo === "ok"
                          ? "text-xs leading-relaxed text-[var(--bo-tinta-72)]"
                          : "flex items-start gap-2 text-xs leading-relaxed text-[var(--bo-perigo)]"
                      }
                    >
                      {respostaRecuperacao.tipo === "erro" && <span aria-hidden="true">⚠</span>}
                      <span>{respostaRecuperacao.texto}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button type="submit" variant="secondary" size="sm" loading={aEnviarLigacao}>
                      {aEnviarLigacao ? "A enviar…" : "Enviar ligação"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setARecuperar(false);
                        setRespostaRecuperacao(null);
                      }}
                      className={`alvo-toque text-xs text-foreground/50 underline underline-offset-4 hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
                    >
                      Voltar
                    </button>
                  </div>
                </form>
              )}

              {/* ── E O CAMINHO DE VOLTA À CHAVE DE ACESSO ─────────────────────
              O que não está escolhido é sempre um link, nunca um botão de
              largura total. Aqui o cheio é o «Entrar»; a chave de acesso, que
              era o cheio no outro estado, recua para isto. */}
              {temPasskeys && !needs2fa && !aRecuperar && (
                <button
                  type="button"
                  onClick={() => {
                    setCaminho("chave");
                    setError(null);
                  }}
                  className={`alvo-toque mt-4 w-full text-center text-sm text-[var(--bo-accent)] underline underline-offset-[3px] hover:text-[var(--bo-accent-hover)] ${ESTADO} ${PRESSAO}`}
                >
                  Entrar com a chave de acesso
                </button>
              )}
            </div>
          </div>

          {/* ── O CAMINHO INVERSO: registar um aparelho novo ────────────────
              Isto é o que faltava. Um botão «entrar com este dispositivo» num
              telemóvel novo não faz nada, e não havia uma palavra sobre porquê
              nem sobre o que fazer a seguir. Registar EXIGE sessão aberta — é
              essa a razão de a primeira entrada de cada aparelho ser sempre com
              a palavra-passe — e isso tem de estar escrito aqui, que é onde a
              pessoa está quando faz a pergunta. */}
          {/* FECHADO POR OMISSÃO. São seis linhas de instruções para uma
              situação que acontece uma vez por aparelho — e estavam abertas em
              todas as entradas, todos os dias, por baixo do botão que 99% das
              vezes é o que se usa. O `<details>` nativo em vez de estado em
              React: abre sem JavaScript, é focável e anunciável por omissão, e
              o browser trata do resto. */}
          {temPasskeys && (
            /* SEM o filete por cima (LOGIN.md, ponto 3): «um cartão com
               cinco grupos separados por linhas não tem hierarquia, tem
               fatias». O «ou» já tinha saído; este era o segundo. O espaço
               (`mt-6`) separa sem cortar. */
            <details className="group mt-6" onToggle={gaveta.aoAlternar}>
              {/* `alvo-toque`: MEDIDO a 375×667 com toque emulado, este resumo
                  dava 293×16 px. Dezasseis píxeis de altura — a altura da
                  própria letra — e é o único caminho para o que está lá dentro,
                  numa página onde quem chega é precisamente quem trocou de
                  telemóvel. A classe põe-lhe os 44 px do dedo (e só no dedo:
                  `(pointer: coarse)`, ver globals.css), sem mexer na letra nem
                  no sublinhado. Passa a 232×44. */}
              <summary
                onClick={gaveta.aoTocarNoResumo}
                className={`alvo-toque list-none text-xs font-medium text-[var(--bo-text-muted)] underline decoration-foreground/25 underline-offset-4 ${ESTADO} ${PRESSAO} hover:text-[var(--bo-text)] hover:decoration-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600/45 focus-visible:ring-offset-2 focus-visible:rounded-sm`}
              >
                Mudei de aparelho
              </summary>
              {/* ── E ESTA GAVETA VALE MESMO O TRABALHO ────────────────────
                  O levantamento marcou-a «por confirmar» — leu o markup e não
                  soube dizer em que ramo do fluxo é que ela aparece. Confirmado:
                  aparece sempre que o browser percebe de passkeys (o
                  `temPasskeys` aqui em cima), que é o caminho principal desta
                  página e não um canto raro. E quem a abre é, por definição,
                  quem acabou de trocar de aparelho e não percebe porque é que o
                  botão de cima não lhe serve.

                  Seis linhas de instruções são UM bloco. Entram nos 240 ms e nos
                  quatro píxeis da `.bo-entrada` — distância de rótulo, porque a
                  resposta sai de debaixo da pergunta que está mesmo por cima. */}
              <p
                className={`mt-2 text-xs leading-relaxed text-[var(--bo-text-muted)] ${gaveta.corpo}`}
              >
                Entra aqui com o email e a palavra-passe. Já dentro, abre{" "}
                <span className="font-medium text-[var(--bo-tinta-72)]">«{ONDE_SE_REGISTA}»</span>,
                no fundo da barra lateral, e regista este aparelho. Da próxima vez entras só com o
                rosto ou a impressão digital. Podes registar mais do que um — e apagar de lá o que
                já não usas.
              </p>
            </details>
          )}
        </Card>

        <RodapeDaEntrada />
      </div>
    </EntradaComFotografia>
  );
}

// ── Peças pequenas ─────────────────────────────────────────────────────────

/**
 * A frase de recusa, escrita uma vez e mostrada em dois sítios.
 *
 * `aria-live="assertive"` nos dois: para quem ouve o ecrã, o sítio não muda
 * nada — a mensagem é lida assim que aparece. Quem ganha com a mudança de
 * lugar é quem VÊ, e é por isso que ela existe.
 */
function AvisoDeRecusa({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <p
      role="alert"
      aria-live="assertive"
      /* ── QUATRO PÍXEIS, E NÃO OITO ────────────────────────────────────────
         A regra da casa mede a distância pela importância e pela origem: um
         item de menu 4 px, um aviso 8, uma página inteira 32. Isto tem cara de
         aviso e não é um: é um RÓTULO — nasce colado ao campo que a provocou,
         por baixo dele, e não vem de fora da página como um toast. Oito píxeis
         punham-na a saltar para um sítio onde nunca esteve.

         Os 240 ms e a curva de quem apresenta são os da `.bo-entrada`, a
         mesma classe (e a mesma prosa) que os nove sítios que aparecem por
         cima da página já usam — escrita pelo nome, como lá. E quem
         pediu menos movimento não perde nada: a classe desliga-se sozinha
         dentro do `prefers-reduced-motion` do `globals.css`, e o `aria-live`
         nunca dependeu da animação — para quem ouve o ecrã, isto lê-se na
         mesma, na mesma altura. */
      className={`bo-entrada flex items-start gap-2 text-sm leading-relaxed text-[var(--bo-perigo)] ${className}`}
    >
      <span aria-hidden="true">⚠</span>
      <span>{texto}</span>
    </p>
  );
}

/** O destino pedido no URL, já limpo. Só corre no browser. */
function lerDestinoDoUrl(): string | null {
  try {
    return destinoSeguro(new URLSearchParams(window.location.search).get(PARAM_DESTINO));
  } catch {
    return null;
  }
}

/**
 * O CAMPO FOCADO E O BOTÃO TÊM DE FICAR ACIMA DO TECLADO.
 *
 * No telemóvel o teclado tapa a metade de baixo do ecrã, e o cartão desta
 * página é alto: com a fotografia em faixa no topo, o campo da palavra-passe e
 * o botão «Entrar» caem por baixo dele. O browser leva o campo focado para a
 * vista, mas encosta-o à borda — o que deixa o botão de submeter escondido, e o
 * gesto seguinte é sempre esse.
 *
 * ── O QUE ESTAVA AQUI, E PORQUE É QUE NÃO CHEGAVA ─────────────────────────
 * Estava `scrollIntoView({ block: "center" })`, com a razão escrita de que o
 * meio do ecrã deixa o botão à vista. MEDIDO num iPhone SE (375×667, teclado
 * com barra de sugestões = 260 px, portanto 407 px visíveis), com a janela
 * visual encolhida como o iOS a encolhe — a de LAYOUT fica nos 667, e é essa
 * que o `scrollIntoView` conta:
 *
 *                              campo (topo–fundo)   botão (topo–fundo)
 *   palavra-passe focada           382,9–427,8         503,8–551,8
 *   código de 2FA focado           383,6–428,4         586,2–634,2
 *   email da recuperação           405,1–449,9         461,9–505,9
 *
 * Com a linha do teclado nos 407, os TRÊS campos acabavam por baixo dela e os
 * três botões estavam inteiros dentro do teclado. Ou seja: não é que o botão se
 * perdesse — perdia-se o próprio campo que se acabou de tocar.
 *
 * Duas razões, e nenhuma se via a olho:
 *
 *  1. `block: "center"` centra na área de leitura, e esta folha tem
 *     `scroll-padding-top: 9rem` (globals.css). O «meio» deixa de ser 333 e
 *     passa a ser 405 — já dentro do teclado.
 *  2. E mesmo o meio verdadeiro não chegava: do topo do campo do 2FA ao fundo
 *     do botão «Verificar» vão 251 px, que não cabem por baixo de 333.
 *
 * ── O QUE PASSOU A FAZER ──────────────────────────────────────────────────
 * Deixa de se pedir uma posição ao browser e passa a fazer-se a conta com a
 * medida que interessa: `visualViewport.height`, que é a única que sabe do
 * teclado (no iOS a janela de layout não encolhe; a visual sim). Rola-se o
 * necessário — nem mais — para o fundo do BOTÃO de submeter desse formulário
 * caber acima do teclado, e nunca ao ponto de empurrar o campo para fora pelo
 * topo. A conta está em `deslocamentoParaOTeclado`, à parte e sem DOM, para
 * poder ser provada com números.
 *
 * O botão vem do `closest("form")`: cada formulário desta página tem um só, e
 * assim o da recuperação é servido pela mesma regra sem a repetir.
 *
 * ── QUANDO É QUE SE MEDE ──────────────────────────────────────────────────
 * Os 300 ms de antes eram um palpite sobre a animação do teclado do iOS. Ficam,
 * como rede para quem não tenha `visualViewport` (e para o caso de o teclado já
 * estar aberto, em que não há evento nenhum), mas quem manda é o `resize` da
 * janela visual — que é o aviso de que o teclado abriu, dado pelo próprio
 * browser. Deixa de se ouvir ao fim de 1,5 s: passado isso, um `resize` é a
 * pessoa a rodar o telemóvel, e aí mexer no scroll era movimento que ninguém
 * pediu.
 *
 * Só com o dedo — com rato não há teclado a tapar nada.
 *
 * No `onFocus` do `<form>` e não em cada campo: o evento borbulha, e assim um
 * campo acrescentado amanhã (o do 2FA, por exemplo) fica coberto sem ter de se
 * lembrar disto.
 */
function aoFocarCampo(e: React.FocusEvent<HTMLFormElement>) {
  const alvo = e.target as HTMLElement;
  if (!alvo?.matches?.("input, textarea, select")) return;
  if (typeof window === "undefined") return;
  if (!window.matchMedia?.("(pointer: coarse)").matches) return;
  seguirOTeclado(alvo);
}

/** Espaço entre o que tem de ficar à vista e a borda (do ecrã ou do teclado). */
const FOLGA_DO_TECLADO = 12;

/**
 * QUANTO É PRECISO ROLAR, em píxeis, para o campo e o seu botão caberem.
 *
 * Sem DOM de propósito: é a única parte disto que se pode provar com números
 * num teste, e é onde estavam os dois enganos que o comentário acima descreve.
 *
 * Positivo rola para baixo, negativo para cima, zero fica quieto. A ORDEM das
 * duas regras é o que importa: primeiro puxa-se o fundo do botão para dentro,
 * depois nunca se deixa o topo do campo sair — quando os dois não cabem, ganha
 * o campo, porque é nele que se está a escrever.
 */
export function deslocamentoParaOTeclado({
  campo,
  accao,
  alturaVisivel,
  folga = FOLGA_DO_TECLADO,
}: {
  campo: { top: number; bottom: number };
  accao: { bottom: number } | null;
  alturaVisivel: number;
  folga?: number;
}): number {
  const fundo = Math.max(campo.bottom, accao?.bottom ?? campo.bottom);
  let deslocamento = 0;
  if (fundo + folga > alturaVisivel) deslocamento = fundo + folga - alturaVisivel;
  if (campo.top - deslocamento < folga) deslocamento = campo.top - folga;
  return Math.round(deslocamento);
}

/**
 * ── E A PÁGINA TEM DE TER PARA ONDE ROLAR ─────────────────────────────────
 *
 * A conta acima diz quanto rolar; não diz que a página consiga. MEDIDO a
 * 375×667 depois da primeira metade da correcção, com o teclado nos 260 px: o
 * botão «Entrar» pedia a posição 497,8 e o documento só dava 475 de scroll
 * máximo (1142 de altura menos 667 de ecrã). Faltavam 23 px, e no painel de
 * recuperação — em que a acção está quase no fim da página — faltavam 83.
 *
 * No Android isto não acontece: lá a janela de LAYOUT encolhe com o teclado, e
 * o alcance do scroll cresce sozinho os mesmos píxeis que o teclado ocupa. No
 * iOS a de layout fica quieta, e é essa diferença que se repõe aqui — o mesmo
 * número, medido no próprio momento (`innerHeight - visualViewport.height`), em
 * espaço no fundo do documento. Zero no Android, porque lá a subtracção já dá
 * zero: a mesma linha serve os dois sem perguntar qual é qual.
 *
 * O espaço fica ATRÁS do teclado, portanto ninguém o vê, e sai assim que o
 * último campo perde o foco.
 */
function espacoDoTeclado(): number {
  const janelaVisual = window.visualViewport;
  if (!janelaVisual) return 0;
  return Math.max(0, Math.round(window.innerHeight - janelaVisual.height));
}

function abrirEspaco(px: number): void {
  document.body.style.paddingBottom = px > 0 ? `${px}px` : "";
}

/** O foco saiu de todos os campos: o espaço deixa de fazer falta. */
function aoSairDoCampo(e: React.FocusEvent<HTMLFormElement>) {
  if (typeof window === "undefined") return;
  if (!(e.target as HTMLElement)?.matches?.("input, textarea, select")) return;
  // No tempo de um `focusout` o foco seguinte ainda não assentou. Espera-se um
  // tique: se calhou noutro campo, o espaço continua a ser preciso.
  window.setTimeout(() => {
    if (document.activeElement?.matches?.("input, textarea, select")) return;
    abrirEspaco(0);
  }, 0);
}

/** A parte com DOM: mede, decide quando, e rola. */
function seguirOTeclado(alvo: HTMLElement) {
  const janelaVisual = window.visualViewport;
  const ajustar = () => {
    // O foco pode já ter saído (a pessoa tocou noutro sítio enquanto o teclado
    // abria). Rolar aí é mexer no ecrã por causa de um campo que já não conta.
    if (!alvo.isConnected || document.activeElement !== alvo) return;
    // O espaço PRIMEIRO: sem ele o `scrollBy` a seguir é limitado pelo fundo do
    // documento e a conta certa dá na mesma um botão meio tapado.
    abrirEspaco(espacoDoTeclado());
    const botao = alvo.closest("form")?.querySelector<HTMLElement>('button[type="submit"]');
    const deslocamento = deslocamentoParaOTeclado({
      campo: alvo.getBoundingClientRect(),
      accao: botao?.getBoundingClientRect() ?? null,
      alturaVisivel: janelaVisual?.height ?? window.innerHeight,
    });
    if (Math.abs(deslocamento) > 1) rolarAJanela({ top: deslocamento });
  };
  window.setTimeout(ajustar, 300);
  if (!janelaVisual) return;
  janelaVisual.addEventListener("resize", ajustar);
  window.setTimeout(() => janelaVisual.removeEventListener("resize", ajustar), 1500);
}

function OlhoAberto() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path
        d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function OlhoFechado() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path
        d="M4 5.5C6 8.4 8.8 10.2 12 10.2S18 8.4 20 5.5"
        strokeLinecap="round"
        transform="translate(0 6)"
      />
      <path d="m5 17 -1.4 2.2M12 18.2V21M19 17l1.4 2.2" strokeLinecap="round" />
    </svg>
  );
}
