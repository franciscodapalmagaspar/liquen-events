"use client";

import { useCallback, useEffect, useState } from "react";
import { limparMarcaDeSessao, marcarSessaoAberta } from "./entrada-destino";
import { PainelDaSessaoExpirada } from "./janela-a-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SESSÃO CAIU A MEIO — E O QUE ESTAVA A SER ESCRITO NÃO SE PERDE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É esta a ferida deste projecto: uma proposta perdida a meio. A gravação
 * automática já cobre a parte «o servidor recusou uma vez»; o que não estava
 * coberto era o servidor passar a recusar TUDO porque a sessão expirou — a
 * partir daí cada gravação falha, e o desfecho anterior era um redireccionamento
 * para o ecrã de entrada, que desmonta o back office inteiro e leva com ele o
 * parágrafo que estava a ser escrito.
 *
 * Aqui não se navega para lado nenhum. Põe-se um painel POR CIMA, autentica-se,
 * fecha-se, e o que estava escrito continua exactamente onde estava — porque
 * nunca chegou a desmontar. A seguir, se houver trabalho por gravar, ele é
 * gravado sem se pedir mais nada: quem acabou de reautenticar não devia ter de
 * se lembrar de carregar num botão para não perder o que já tinha escrito.
 *
 * ── COMO É QUE SE SABE QUE A SESSÃO CAIU ──────────────────────────────────
 * Pelo único sinal que existe: uma resposta 401/403 a um pedido nosso. Não há
 * evento de «o cookie expirou», e um relógio local a contar 30 dias mentia à
 * primeira vez que o `SESSION_VERSION` fosse rodado ou que alguém saísse noutro
 * separador.
 *
 * Para o ver, o `fetch` do browser é EMBRULHADO enquanto o back office está
 * montado. É uma coisa que se faz com os olhos abertos, e por isso:
 *
 *  · só se LÊ o `status` — o corpo nunca é tocado, portanto quem chamou recebe
 *    a resposta intacta (ler o corpo aqui consumia-o e partia tudo);
 *  · a resposta e os erros seguem tal e qual, sem nada apanhado pelo caminho;
 *  · desembrulha-se ao desmontar, e só se o embrulho ainda for o nosso (outro
 *    código pode ter embrulhado por cima; nesse caso deixa-se estar);
 *  · e as rotas de ENTRADA estão de fora: um 401 do `/api/admin/login` é uma
 *    palavra-passe errada, não uma sessão expirada — abrir aí este painel era
 *    responder a um erro de escrita com um aviso de catástrofe.
 *
 * A alternativa seria mudar as ~40 chamadas do back office para passarem por um
 * cliente comum. É a solução limpa, é meio dia de trabalho em ficheiros que
 * estão a ser mexidos por outra frente agora, e falha por omissão: a chamada que
 * alguém escrever amanhã com `fetch` directo fica de fora do aviso.
 */

/*
 * O painel em si (`PainelDaSessaoExpirada.tsx`) chega a pedido, fora do pacote
 * inicial: aqui fica só o vigia, que tem de estar montado desde o início.
 */

/** Rotas onde um 401 significa «credenciais erradas», não «sessão expirada». */
const ENTRADAS = [
  "/api/admin/login",
  "/api/admin/recuperar",
  "/api/admin/passkeys/entrada",
  "/api/admin/logout",
];

/** O caminho de um pedido, quando ele é para nós. `null` para tudo o resto. */
export function caminhoDoPedido(entrada: unknown, origem: string): string | null {
  try {
    const bruto =
      typeof entrada === "string"
        ? entrada
        : entrada instanceof Request
          ? entrada.url
          : entrada instanceof URL
            ? entrada.href
            : typeof (entrada as { url?: unknown })?.url === "string"
              ? (entrada as { url: string }).url
              : null;
    if (bruto === null) return null;
    const url = new URL(bruto, origem);
    if (url.origin !== origem) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

/**
 * Esta resposta quer dizer «a sessão acabou»?
 *
 * Fora daqui não há como distinguir uma coisa da outra, e é a distinção que
 * decide entre um painel a meio do ecrã e um silêncio.
 */
export function ehSessaoExpirada(caminho: string | null, status: number | undefined): boolean {
  if (caminho === null || typeof status !== "number") return false;
  if (status !== 401 && status !== 403) return false;
  if (!caminho.startsWith("/api/")) return false;
  return !ENTRADAS.some((e) => caminho === e || caminho.startsWith(`${e}/`));
}

export default function SessaoExpirada() {
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);

  // ── A marca de «esta aba esteve cá dentro» ───────────────────────────────
  // Serve o ecrã de entrada: sem ela, uma sessão que expire durante uma
  // navegação (um link seguido, um F5) leva a pessoa a um formulário de entrada
  // que não explica nada. Ver `entrada-destino.ts`.
  useEffect(() => {
    marcarSessaoAberta();
  }, []);

  // ── O vigia ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    const original = window.fetch;
    const origem = window.location.origin;

    /**
     * Um `Proxy` e não uma função nova.
     *
     * A diferença é que o `fetch` continua a SER o mesmo objecto para quem lhe
     * olhe para as propriedades: um `fetch` simulado num teste continua a ter o
     * `mockResolvedValue`, e qualquer coisa que o browser lhe tenha pendurado
     * continua lá. Com uma função nova por cima, o objecto original desaparecia
     * do sítio onde toda a gente o vai buscar — e isso não é um pormenor de
     * testes, é o embrulho a ser MENOS transparente do que diz ser.
     *
     * O `this` é reposto no `window`: o `fetch` nativo recusa ser chamado
     * solto em alguns browsers, e quem chama `fetch(...)` sem objecto chegava
     * aqui com `undefined`.
     */
    const embrulho = new Proxy(original, {
      apply(alvo, esteObjecto, args: Parameters<typeof window.fetch>) {
        return Promise.resolve(Reflect.apply(alvo, esteObjecto ?? window, args)).then(
          (resposta: Response) => {
            const caminho = caminhoDoPedido(args[0], origem);
            // Sair de propósito não é a sessão a expirar: tira-se a marca para
            // que o ecrã de entrada não diga a quem carregou em «Sair» que
            // alguma coisa correu mal.
            if (caminho === "/api/admin/logout") limparMarcaDeSessao();
            if (ehSessaoExpirada(caminho, resposta?.status)) setAberto(true);
            return resposta;
          },
        );
      },
    });

    window.fetch = embrulho;
    return () => {
      // Só se o embrulho ainda for o nosso: desfazer por cima do de outra
      // pessoa deixava a aplicação com um `fetch` que já não é o dela.
      if (window.fetch === embrulho) window.fetch = original;
    };
  }, []);

  return <PainelDaSessaoExpirada open={aberto} onClose={fechar} />;
}
