import { useEffect, useSyncExternalStore, type ComponentType } from "react";
import { onIdle } from "@/lib/onIdle";
import { useToast } from "./Toast";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS JANELAS QUE SÓ SE ABREM A PEDIDO — FORA DO PACOTE DO PAINEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel tem um tecto de JavaScript (`scripts/peso-das-rotas.mjs`, 520 KB
 * crus). A 17/11 passou-o (526 KB), e uma boa parte do que lá estava eram
 * janelas que ela abre de vez em quando — repor uma cópia, as chaves de
 * acesso, a folha dos atalhos, o glossário, e o painel da sessão que caiu
 * (que só se abre depois de um 401) — e que vinham
 * todas no primeiro descarregamento, fechadas, sem desenhar nada.
 *
 * `janelaAPedido` tira cada uma do pacote inicial SEM mudar o que se vê:
 *
 *   • fechada e ainda por chegar, desenha `null` — exactamente o que estas
 *     janelas desenham quando estão fechadas (todas acabam em `return null`
 *     com `open` a falso e sem saída a correr);
 *   • o módulo é aquecido logo a seguir ao `load`, numa janela de
 *     inatividade — quando ela carrega no botão ou na tecla, já cá está e
 *     desenha DIRECTAMENTE, sem `<Suspense>` nem esqueleto: nem clarão, nem
 *     os 300 ms que o React segura um fallback (ver `splitView`, em `lazy.tsx`);
 *   • se ela abrir antes de o aquecimento acabar, o pedido parte nesse
 *     instante e a janela aparece mal chegue — já com `open` a verdadeiro, a
 *     mesma montagem de quem abre;
 *   • depois de chegar, fica montada para sempre, como estava: as animações
 *     de saída e o que ficou escrito numa janela fechada continuam iguais.
 *
 * Uma falha de rede não fica colada nem calada: aparece o aviso «Sem ligação
 * — tenta outra vez» (o toast do back office), e a janela devolve a vez — o
 * estado de quem a abriu volta a «fechada» — para o próximo toque no mesmo
 * botão tentar de novo. Sem isto, uma janela que falhasse a chegar (sem rede,
 * ou depois de um deploy) deixava o `open` preso e ela carregava sem
 * acontecer nada.
 *
 * A vez devolve-se pelo `aoNaoChegar`, quando quem abre o passa, e só por
 * omissão pelo `onClose`: o `onClose` de algumas janelas faz mais do que
 * fechar (o da cópia de segurança revalida os pedidos todos, porque a janela
 * pode ter trocado os dados) — e uma janela que nunca chegou não mudou nada.
 *
 * O ⌘K e o «Novo pedido» NÃO passam por aqui, de propósito: abrem-se com uma
 * tecla («⌘K», «n») e escreve-se logo a seguir. Uma letra carregada antes de
 * a caixa existir ia parar ao `body` — onde o «G»+letra navega. Ficam no
 * pacote.
 */

type Modulo<P> = { default: ComponentType<P> };

type PropsDaJanela = { open: boolean; onClose: () => void };

/** O que a janela a pedido acrescenta às props da janela verdadeira. */
type PropsAPedido = {
  /** Fecha quando o código não chega. Por omissão, o `onClose` da janela. */
  aoNaoChegar?: () => void;
};

export const AVISO_SEM_LIGACAO = "Sem ligação — tenta outra vez";

export interface JanelaAPedido<P extends PropsDaJanela> {
  Janela: ComponentType<P & PropsAPedido>;
  /** Traz o módulo para memória. Idempotente; uma falha de rede não fica.
   *  Resolve com `true` se o módulo está cá. */
  aquecer: () => Promise<boolean>;
}

export function janelaAPedido<P extends PropsDaJanela>(
  carregar: () => Promise<Modulo<P>>,
): JanelaAPedido<P> {
  let Chegou: ComponentType<P> | null = null;
  let aCaminho: Promise<boolean> | null = null;
  const ouvintes = new Set<() => void>();

  const aquecer = (): Promise<boolean> => {
    if (Chegou) return Promise.resolve(true);
    if (aCaminho) return aCaminho;
    aCaminho = carregar().then(
      (m) => {
        Chegou = m.default;
        aCaminho = null;
        for (const avisar of ouvintes) avisar();
        return true;
      },
      () => {
        aCaminho = null;
        return false;
      },
    );
    return aCaminho;
  };

  const subscrever = (avisar: () => void) => {
    ouvintes.add(avisar);
    return () => {
      ouvintes.delete(avisar);
    };
  };
  const leitura = () => Chegou;
  // No servidor e ao hidratar, a janela está fechada e desenha `null` — o mesmo
  // que o módulo desenharia; não há diferença de HTML a reconciliar.
  const leituraDoServidor = () => null;

  function Janela({ aoNaoChegar, ...resto }: P & PropsAPedido) {
    const props = resto as unknown as P;
    const Componente = useSyncExternalStore(subscrever, leitura, leituraDoServidor);
    const { toast } = useToast();
    const { open, onClose } = props;
    const devolverAVez = aoNaoChegar ?? onClose;
    useEffect(() => {
      if (!open || Componente) return;
      let viva = true;
      void aquecer().then((chegou) => {
        if (chegou || !viva) return;
        toast(AVISO_SEM_LIGACAO, "error");
        devolverAVez();
      });
      return () => {
        viva = false;
      };
    }, [open, Componente, devolverAVez, toast]);
    if (!Componente) return null;
    return <Componente {...props} />;
  }
  Janela.displayName = "JanelaAPedido";

  return { Janela, aquecer };
}

const repor = janelaAPedido(() => import("./RestoreDialog"));
const chaves = janelaAPedido(() => import("./PasskeysDialog"));
const atalhos = janelaAPedido(() => import("./ShortcutsModal"));
const glossario = janelaAPedido(() => import("./AjudaGlossario"));
const sessao = janelaAPedido(() => import("./PainelDaSessaoExpirada"));

export const RestoreDialog = repor.Janela;
export const PasskeysDialog = chaves.Janela;
export const ShortcutsModal = atalhos.Janela;
export const AjudaGlossario = glossario.Janela;
/** O painel de reautenticação: o vigia (`SessaoExpirada`) fica no pacote. */
export const PainelDaSessaoExpirada = sessao.Janela;

/** Pela ordem de quem ela abre mais; a sessão a cair é a mais rara. */
const ORDEM = [atalhos, glossario, chaves, repor, sessao];

/**
 * Aquece as cinco janelas, uma por janela de inatividade, depois do `load`.
 * Corre também em desenvolvimento — ao contrário das vistas, são cinco ficheiros
 * pequenos, e é o que deixa os passeios medirem o mesmo que ela vê.
 * Devolve um cancelador.
 */
export function aquecerJanelas(): () => void {
  if (typeof window === "undefined") return () => {};
  let cancelado = false;
  let cancelarEspera: () => void = () => {};
  const fila = [...ORDEM];
  const passo = () => {
    if (cancelado) return;
    const seguinte = fila.shift();
    if (!seguinte) return;
    void seguinte.aquecer().then(() => {
      if (!cancelado) cancelarEspera = onIdle(passo, 2000);
    });
  };
  const comecar = () => {
    if (!cancelado) cancelarEspera = onIdle(passo, 2000);
  };
  if (document.readyState === "complete") comecar();
  else window.addEventListener("load", comecar, { once: true });
  return () => {
    cancelado = true;
    cancelarEspera();
    window.removeEventListener("load", comecar);
  };
}
