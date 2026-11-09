"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stripPendingImages, type ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA REAL, PEDIDA AO SERVIDOR — A1 do `docs/FAZER-PROPOSTA-MELHORIAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel do estúdio mostrava uma APROXIMAÇÃO da página (`PaginaEditorial`,
 * desenhada no navegador). Ela pediu a página real, e escolheu (2/11) «Só a
 * página, mais rápido»: o servidor desenha só a página `n` do rascunho, com o
 * motor do PDF (`/api/orcamento/[id]/pagina-do-rascunho`), em ~1 s.
 *
 * ── QUANDO SE PEDE ───────────────────────────────────────────────────────
 *
 * `ESPERA_MS` depois de o rascunho parar de mudar — escrever, carregar uma
 * foto, trocar de página. Uma tecla não é um pedido: a meio de uma frase a
 * página não interessa a ninguém, e cada pedido é um desenho no servidor.
 *
 * ── E ENQUANTO NÃO CHEGA ─────────────────────────────────────────────────
 *
 * A imagem ANTERIOR fica (`url`) até a nova chegar, com `aCarregar` ligado —
 * o painel nunca pisca para vazio. Se ainda não há imagem nenhuma (a primeira
 * vez) ou o servidor falhou, quem chama mostra a aproximação de antes, e diz
 * que é uma aproximação. Um pedido que fica velho (o rascunho mudou outra vez)
 * é cancelado: só a resposta ao último rascunho conta.
 */
/**
 * Desceu de 3 s para 1 s a 9/11: ela pediu a página «em tempo real» («é
 * mesmo importante que aquilo que se está a ver é aquilo que vai sair»), e
 * medido na fatura desse mês o processador das funções foi 0,18 $ — o que
 * pesa é a construção do site, não isto. Uma tecla continua a não ser um
 * pedido: cada letra adia-o, e o anterior é cancelado.
 *
 * Tinha subido de 1,2 s para 3 s a 3/11. Cada pedido desenha uma página com o motor
 * do PDF (meio segundo a vários segundos de processador), e a 2/11 a conta da
 * Vercel passou o limite de processador. A meio de uma frase ninguém olha para
 * a página; três segundos parada é «acabei de escrever». E com o separador
 * escondido não se pede nada (ver o `document.hidden` em baixo).
 */
export const ESPERA_MS = 1000;

/**
 * Quando o rascunho NÃO mudou e só mudou a página — ela desceu para outra
 * secção, ou carregou em «seguinte» (9/11, «à medida que vamos fazendo scroll,
 * as páginas vão mudando») —, o pedido sai mais cedo: não há frase a meio. E
 * continua a não sair a cada secção por que se passa a descer depressa: cada
 * nova paragem adia o pedido, e o que já se viu vem da memória sem pedir.
 */
export const ESPERA_DA_PAGINA_MS = 1200;

/**
 * ── O QUE JÁ VEIO NÃO SE PEDE OUTRA VEZ (4/11) ──────────────────────────
 *
 * Ela pediu para cortar o processador da Vercel «mantendo tudo como está».
 * Este é o pedido mais caro do back office: 1,5 s de processador por página,
 * medido nos registos de 4/11. E repetia-se sem razão: trocar de página e
 * voltar, mudar de passo ou de vista e regressar desmontava o painel, e a
 * página voltava a ser desenhada no servidor, com o rascunho igual.
 *
 * Agora a resposta fica guardada no navegador, pela mesma chave que o servidor
 * já usava (o rascunho inteiro, a língua, a página e a largura). Rascunho igual
 * é imagem igual — o motor do PDF é o mesmo e não depende de mais nada —, por
 * isso a página guardada é exactamente a que o servidor voltaria a desenhar.
 * Basta mudar uma vírgula para a chave mudar e a página ser pedida de novo.
 *
 * Guardam-se as últimas `GUARDADAS_MAX`: umas 100 KB cada, uns 2–3 MB no
 * total. Uma falha nunca se guarda.
 */
export const GUARDADAS_MAX = 24;
const guardadas = new Map<string, { imagem: Blob; paginas: number | null }>();

function guardar(chave: string, valor: { imagem: Blob; paginas: number | null }) {
  guardadas.delete(chave);
  guardadas.set(chave, valor);
  while (guardadas.size > GUARDADAS_MAX) {
    const maisVelha = guardadas.keys().next().value;
    if (maisVelha === undefined) break;
    guardadas.delete(maisVelha);
  }
}

/** Para os testes: cada um começa sem páginas guardadas. */
export function esquecerPaginasGuardadas() {
  guardadas.clear();
}

export interface PaginaReal {
  /** URL de objeto da última página que chegou, ou `null`. */
  url: string | null;
  /** Que página é essa (pode não ser a pedida, enquanto a nova não chega). */
  n: number | null;
  /** Há um pedido a caminho. */
  aCarregar: boolean;
  /** O último pedido falhou (e não há página real para mostrar desta vez). */
  falhou: boolean;
  /** As páginas do PDF inteiro, quando o servidor já disse. */
  paginas: number | null;
}

export function usePaginaReal({
  quoteId,
  doc,
  idioma,
  n,
  largura = 800,
}: {
  /** Sem pedido (nos testes antigos, ou fora do estúdio), não se pede nada. */
  quoteId?: string;
  doc?: ProposalDoc;
  idioma: IdiomaDaProposta;
  /** A página do PDF, a contar de 1 (`null`: nenhuma). */
  n: number | null;
  largura?: number;
}): PaginaReal {
  const [estado, setEstado] = useState<PaginaReal>({
    url: null,
    n: null,
    aCarregar: false,
    falhou: false,
    paginas: null,
  });
  // As fotografias a caminho não vão — a mesma fronteira da pré-visualização.
  const corpo = useMemo(
    () =>
      quoteId && doc && n
        ? JSON.stringify({ doc: stripPendingImages(doc), idioma, n, largura })
        : null,
    [quoteId, doc, idioma, n, largura],
  );
  const ultimaUrl = useRef<string | null>(null);
  /** O rascunho do último pedido — para saber se agora só mudou a página. */
  const ultimoDoc = useRef<ProposalDoc | undefined>(undefined);

  useEffect(() => {
    if (!corpo || !quoteId) return;
    const chave = `${quoteId}\u0000${corpo}`;
    const mostrar = (imagem: Blob, paginas: number | null) => {
      const url = URL.createObjectURL(imagem);
      if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current);
      ultimaUrl.current = url;
      setEstado({ url, n: JSON.parse(corpo).n, aCarregar: false, falhou: false, paginas });
    };
    const ja = guardadas.get(chave);
    if (ja) {
      // Já veio: mostra-se logo, sem pausa e sem pedir nada ao servidor.
      guardar(chave, ja);
      const logo = window.setTimeout(() => mostrar(ja.imagem, ja.paginas), 0);
      return () => window.clearTimeout(logo);
    }
    const controlo = new AbortController();
    const soAPagina = ultimoDoc.current === doc;
    ultimoDoc.current = doc;
    const temporizador = window.setTimeout(
      async () => {
        // Ninguém está a ver: o desenho fica para quando ela voltar e mexer.
        if (typeof document !== "undefined" && document.hidden) return;
        setEstado((e) => ({ ...e, aCarregar: true, falhou: false }));
        try {
          const res = await fetch(`/api/orcamento/${quoteId}/pagina-do-rascunho`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: corpo,
            signal: controlo.signal,
          });
          const paginas = Number(res.headers.get("X-Paginas")) || null;
          if (!res.ok) throw new Error(String(res.status));
          const imagem = await res.blob();
          // Guarda-se mesmo que este pedido tenha ficado velho: a página está
          // certa para AQUELE rascunho, e voltar a ele não a pede outra vez.
          guardar(chave, { imagem, paginas });
          if (controlo.signal.aborted) return;
          mostrar(imagem, paginas);
        } catch {
          if (controlo.signal.aborted) return;
          setEstado((e) => ({ ...e, aCarregar: false, falhou: true }));
        }
      },
      soAPagina ? ESPERA_DA_PAGINA_MS : ESPERA_MS,
    );
    return () => {
      window.clearTimeout(temporizador);
      controlo.abort();
    };
    // `doc` só é lido para comparar com o anterior; o pedido depende do
    // `corpo`, que já muda com ele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpo, quoteId]);

  // A última imagem liberta-se quando o painel sai.
  useEffect(
    () => () => {
      if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current);
      ultimaUrl.current = null;
    },
    [],
  );

  return estado;
}
