"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "./Toast";
import { log } from "@/lib/logger";
import { Button } from "./ui";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

/** Um cookie legível pelo browser (o nome de quem entrou, `liquen_user`). */
function lerCookie(nome: string): string | null {
  if (typeof document === "undefined") return null;
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${nome}=`));
  if (!par) return null;
  try {
    return decodeURIComponent(par.slice(nome.length + 1));
  } catch {
    return null;
  }
}

function BellIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
    </svg>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O SININHO NÃO ANIMA NADA — e isto é a decisão, não o esquecimento
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quem vier a este ficheiro à procura da lista a abrir e do contador a mudar
 * não os encontra, e não é por estarem noutro sítio: NÃO EXISTEM. Este
 * componente é UM BOTÃO — um sino que liga as notificações push do aparelho e,
 * quando já estão ligadas, manda o resumo agora. Não há caixa suspensa, não há
 * lista de avisos, não há número por cima do sino. Fica escrito porque a
 * ausência de um contador lê-se como um contador esquecido, e a primeira coisa
 * que alguém faria era animar um número que não há.
 *
 * ── E SE O CONTADOR APARECER? NÃO PULSA ─────────────────────────────────────
 *
 * A regra da casa é que o movimento indica DIRECÇÃO e ORIGEM, não chama
 * atenção. Um número a pulsar não indica coisa nenhuma: repete-se para sempre,
 * não tem destino, e o que ele acrescenta ao «3» é só insistência. Pior: o
 * único movimento periódico que este back office tem hoje é o ponto do
 * `ui/EmCurso` — e esse quer dizer, exactamente, «ISTO ESTÁ A ACONTECER
 * AGORA». Pôr a mesma pulsação num contador parado ensinava o olho a ignorá-la
 * nos dois sítios, e o que se perdia era o primeiro.
 *
 * O que um contador PODE fazer, no dia em que existir, é a entrada de 240 ms da
 * casa quando o número aparece pela primeira vez — uma vez, com fim. Repetir
 * não.
 *
 * ── E O SINO A APARECER DO NADA? TAMBÉM NÃO SE ANIMA ────────────────────────
 *
 * Há aqui um corte seco verdadeiro: enquanto o estado é `loading` este
 * componente devolve `null`, e quando a sondagem responde nasce um botão na
 * barra do cabeçalho — ao lado do «Guardar tudo» e da pesquisa, que SALTAM para
 * o lado para lhe abrir espaço. Uma `.bo-entrada` por cima disto piora o que
 * está mal: os vizinhos mexem-se no primeiro fotograma e o recém-chegado só
 * fica visível 240 ms depois, ou seja a linha parece partir-se e só depois se
 * explica.
 *
 * A avaria é de DISPOSIÇÃO (um lugar que não estava reservado), e a casa já
 * escreveu esta lição a propósito do rodopio do `ui/Button.tsx`: «o salto de
 * largura […] resolve-se com espaço reservado, que é layout e não animação —
 * não se remenda com uma transição». Reservar o lugar do sino é do dono do
 * cabeçalho; até lá, uma animação aqui seria maquilhagem por cima de um salto.
 *
 * ── O QUE JÁ ANIMA, E CHEGA ─────────────────────────────────────────────────
 *
 * A troca entre os quatro ramos (`indisponivel`, `granted`, `denied`, o de
 * activar) é sempre o MESMO `<Button>` na mesma posição: o React remenda-lhe as
 * propriedades em vez de o trocar, e a mudança de tinta corre nos 120 ms do
 * `ESTADO` que o `ui/Button.tsx` já traz. Não falta nada aqui.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `unconfigured` é uma RESPOSTA do servidor («não há chaves VAPID montadas»).
 * `indisponivel` é uma AVARIA («a rota não respondeu, ou respondeu em erro»).
 *
 * Eram a mesma coisa, e é isso que este ficheiro corrige: o sino desaparecia da
 * barra nos dois casos, sem uma linha em lado nenhum, e a leitura natural de um
 * sino ausente é «isto ainda não está montado». A rota podia estar a rebentar
 * há semanas — com os pedidos de orçamento a entrar sem avisar ninguém — e não
 * havia por onde desconfiar.
 */
type State =
  | "unsupported"
  | "unconfigured"
  | "indisponivel"
  | "default"
  | "granted"
  | "denied"
  | "loading";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotificationBell() {
  const { toast } = useToast();
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  /** A perguntar outra vez, a pedido dela. Só para o botão não aceitar dez
   *  cliques enquanto a primeira pergunta ainda vai a caminho. */
  const [aSondar, setASondar] = useState(false);

  /** Perguntar ao servidor em que pé estão as notificações. Deixou de estar
   *  enterrada no efeito para o ramo «não consegui ler» poder repeti-la. */
  const sondar = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setState("unsupported");
      return;
    }
    try {
      const res = await fetch("/api/push/subscribe", { cache: "no-store" });
      if (!res.ok) {
        log.error("push: a rota das notificações respondeu em erro", null, {
          estado: res.status,
        });
        setState("indisponivel");
        return;
      }
      const data = (await res.json()) as { configured?: boolean; publicKey?: string | null };
      if (!data.configured || !data.publicKey) {
        // Resposta legítima: não está montado. Não é erro, e não se regista —
        // um aviso que aparece todos os dias é um aviso que se aprende a ignorar.
        setState("unconfigured");
        return;
      }
      setPublicKey(data.publicKey);
      setState(Notification.permission as State);
    } catch (e) {
      log.error("push: não consegui perguntar ao servidor pelas notificações", e);
      setState("indisponivel");
    }
  }, []);

  useEffect(() => {
    // A sondagem é assíncrona: o `setState` acontece quando o servidor
    // responde, não no corpo do efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sondar();
  }, [sondar]);

  /**
   * ── LIGAR À CONTA UMA SUBSCRIÇÃO DE ANTES (auditoria de 13/11, n.º 7) ────
   *
   * As subscrições passaram a guardar a conta de quem as ligou, e as antigas
   * não a têm — por isso só recebem um aviso genérico, sem nomes nem valores.
   * Num aparelho que já tem as notificações ligadas, isto volta a mandar a
   * MESMA subscrição uma vez, com a sessão de agora, e o servidor prende-a à
   * conta. Uma vez por aparelho e por conta (lembrado no `localStorage`): não é
   * um pedido por carregamento.
   */
  useEffect(() => {
    if (state !== "granted") return;
    const conta = lerCookie("liquen_user") ?? "";
    const marca = `liquen-push-conta:${conta}`;
    try {
      if (localStorage.getItem(marca) === "1") return;
    } catch {
      return;
    }
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!sub) return;
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        });
        if (res.ok) {
          try {
            localStorage.setItem(marca, "1");
          } catch {
            /* sem armazenamento: tenta outra vez no próximo carregamento */
          }
        }
      } catch {
        // Fica para o próximo carregamento; até lá chega o aviso genérico.
      }
    })();
  }, [state]);

  /**
   * O lado do NAVEGADOR: registar o service worker, pedir a permissão,
   * subscrever. Separado do pedido ao servidor de propósito — enquanto os dois
   * partilhavam um `try`, a frase de falha tinha de servir para as duas
   * causas, e acabava em «Não foi possível ativar», que não é nenhuma delas.
   */
  async function subscreverNoNavegador(chave: string): Promise<PushSubscription | null> {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission as State);
        toast("Notificações não autorizadas", "info");
        return null;
      }

      return await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(chave).buffer as ArrayBuffer,
      });
    } catch (e) {
      log.error("push: registo de notificações falhou", e);
      setState("default");
      toast(
        "O navegador não deixou ativar as notificações neste dispositivo. Recarrega a página e tenta outra vez.",
        "error",
      );
      return null;
    }
  }

  async function enable() {
    if (!publicKey) return;
    setState("loading");
    const sub = await subscreverNoNavegador(publicKey);
    if (!sub) return;

    /**
     * ── A GRAVAÇÃO QUE NINGUÉM OLHAVA ───────────────────────────────────────
     *
     * Isto era um `await fetch(…)` sem `res.ok` e sem nada a seguir. Com um 500
     * ou com a sessão expirada, a subscrição ficava só no navegador — o
     * servidor não a conhece, portanto nunca lhe manda nada — e o ecrã dizia
     * na mesma «Notificações ativadas neste dispositivo». A frase mais fácil de
     * acreditar do painel, dita exactamente quando não se cumpre; e o preço
     * paga-se semanas depois, num pedido que entra sem avisar ninguém.
     *
     * A falhar, o estado volta a «default»: o botão fica outra vez em «Ativar
     * notificações», que é o gesto que a resolve.
     */
    const oQue = "guardar as notificações neste dispositivo";
    let res: Response;
    try {
      res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
    } catch (e) {
      log.error("push: a subscrição não chegou ao servidor", e);
      setState("default");
      toast(porqueRebentou(oQue).mensagem, "error");
      return;
    }
    if (!res.ok) {
      const corpo = await res.json().catch(() => null);
      log.error("push: a subscrição não ficou guardada", null, { estado: res.status });
      setState("default");
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return;
    }

    setState("granted");
    toast("Notificações ativadas neste dispositivo", "success");
  }

  if (state === "loading" || state === "unsupported" || state === "unconfigured") {
    // Hidden when unsupported/unconfigured to keep the UI clean. Nos dois casos
    // o desaparecimento é a leitura certa: o navegador não sabe fazer isto, ou
    // o servidor RESPONDEU que não está montado.
    return null;
  }

  /**
   * ── COM A ROTA EM BAIXO, O SINO FICA ──────────────────────────────────────
   *
   * A escolha aqui foi entre desaparecer e ficar calado a dizer que não sabe.
   * Fica.
   *
   * Desaparecer era a pior das duas porque não se lê como avaria: lê-se como
   * «isto ainda não está montado» — que é exactamente o que o ramo de cima
   * quer dizer. Duas situações opostas com o mesmo desenho, e a que precisa de
   * alguém é justamente a que fica invisível. Foi assim que a rota pôde estar
   * a rebentar durante semanas com o motivo só no registo do servidor, que
   * ninguém no back office lê.
   *
   * Ficar não é inventar: sem resposta do servidor não se sabe se as
   * notificações estão ligadas, por isso o sino fica SEM contagem e sem
   * estado, e o rótulo diz «sem resposta» — não «bloqueadas» nem «desligadas»,
   * que seriam afirmações que ninguém aqui pode fazer.
   *
   * Carregar volta a perguntar em vez de mandar recarregar a página: quase
   * sempre isto é um servidor a acordar, e a segunda pergunta resolve. Sem
   * toast na montagem — um aviso a saltar sempre que ela abre o painel é um
   * aviso que se aprende a fechar sem ler, e o motivo já vai no registo.
   */
  if (state === "indisponivel") {
    return (
      <Button
        variant="secondary"
        size="sm"
        // O mesmo 41×44 dos outros ramos, e pela mesma razão: sem rótulo no
        // telemóvel, o sino fica com a largura dos `px-3` e mais nada.
        className="pointer-coarse:min-w-11"
        iconLeft={<BellIcon />}
        loading={aSondar}
        onClick={() => {
          setASondar(true);
          void sondar().finally(() => setASondar(false));
        }}
        // Regra 8 da «Escrita»: a dica descreve o CONTROLO, não repete o
        // rótulo («Notificações: sem resposta» já está no botão) e não leva
        // ponto final. O que faltava era o que ela faz ao ser carregada.
        title="Perguntar outra vez ao servidor, que costuma estar só a acordar"
      >
        <span className="hidden sm:inline">Notificações: sem resposta</span>
      </Button>
    );
  }

  if (state === "granted") {
    return (
      <Button
        variant="subtle"
        size="sm"
        // MEDIDO a 375 px: 41×44. O rótulo é `hidden sm:inline`, portanto no
        // telemóvel sobra o sino sozinho dentro dos `px-3` do tamanho `sm` —
        // três píxeis abaixo do mínimo na largura. A altura já vem dos 44 do
        // `ui/Button.tsx`; falta-lhe a largura, e só onde há dedo. É o mesmo
        // remendo, e pela mesma razão, que o abridor do `MoreMenu` já leva.
        className="pointer-coarse:min-w-11"
        iconLeft={<BellIcon />}
        onClick={async () => {
          /**
           * TRÊS DESFECHOS, E ANTES DIZIAM-SE TODOS COM DUAS FRASES.
           *
           * `res.json()` era lido sem olhar ao `res.ok`: um 500 dava um corpo
           * `{ error: … }`, o `data.sent > 0` era falso, e saía «Sem novidades
           * para notificar agora» — a frase mais tranquilizadora do painel,
           * dita exactamente quando o sistema tinha falhado.
           *
           * «Não havia nada a dizer» e «havia e não chegou a lado nenhum» são
           * coisas diferentes, e é a diferença entre elas que decide se alguém
           * vai ver o que entrou hoje.
           */
          const oQue = "enviar o resumo agora";
          try {
            const res = await fetch("/api/cron/reminders", { cache: "no-store" });
            const data = (await res.json().catch(() => ({}))) as {
              sent?: number;
              falhados?: number;
            };
            if (!res.ok) {
              log.error("push: o resumo não pôde ser pedido", null, { estado: res.status });
              // «Não foi possível enviar o resumo» dizia o mesmo à sessão
              // expirada e ao servidor em baixo, e em nenhum dos dois dizia o
              // que fazer a seguir.
              toast(porqueFalhou(oQue, res, data).mensagem, "error");
              return;
            }
            if ((data.sent ?? 0) > 0) {
              toast("Resumo enviado para os teus dispositivos", "success");
            } else if ((data.falhados ?? 0) > 0) {
              toast("O resumo não chegou a nenhum dispositivo", "error");
            } else {
              toast("Sem novidades para notificar agora", "info");
            }
          } catch (e) {
            log.error("push: o resumo não pôde ser pedido", e);
            toast(porqueRebentou(oQue).mensagem, "error");
          }
        }}
        title="Notificações ativas — clique para enviar o resumo agora"
      >
        <span className="hidden sm:inline">Ativas</span>
      </Button>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      // O mesmo 41×44 do ramo de cima, e pela mesma razão: sem rótulo no
      // telemóvel, o sino fica com a largura dos `px-3` e mais nada.
      className="pointer-coarse:min-w-11"
      iconLeft={<BellIcon />}
      onClick={enable}
      disabled={state === "denied"}
      title={
        state === "denied"
          ? "Notificações bloqueadas no navegador"
          : "Ativar notificações neste dispositivo"
      }
    >
      <span className="hidden sm:inline">
        {state === "denied" ? "Bloqueadas" : "Ativar notificações"}
      </span>
    </Button>
  );
}
