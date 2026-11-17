"use client";

import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { porqueRecusou } from "@/lib/erro-do-servidor";
import type { LeituraDeNumero } from "@/lib/numero-escrito";
import {
  corpoDaGravacao,
  corpoDoAnular,
  linhasDoHistorico,
} from "@/lib/orcamento/pedidos/gravar-o-pedido";
import { substituirNaLista } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import type { NotasAutomaticas } from "@/lib/orcamento/pedidos/notas-automaticas";
import { painelParaGravar, type PainelDoPedido } from "@/lib/orcamento/pedidos/painel-do-pedido";
import type { Quote } from "@/lib/orcamento/types";
import { reporEstadoDoPedido } from "../anular-estado";
import { asPropostasMudaram } from "../percentagem-do-sinal";
import { esquecerRascunho } from "../rascunho-do-pedido";
import type { useToast } from "../Toast";
import type { useAnular } from "../ui/anular";
import {
  enviarComRepeticao,
  fetchComTecto,
  respostaDeHttp,
  type RespostaDoEnvio,
} from "../useGravacaoAutomatica";
import { randomId } from "../util";
import type { EdicaoDoPedido } from "./useEdicaoDoPedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «GUARDAR ALTERAÇÕES» DO PAINEL DO PEDIDO — a casca, e o estado dela
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Saiu do `AdminClient.tsx` tal e qual (júri das fases 7 e 8, ponto 3): as
 * três decisões puras vivem em `lib/orcamento/pedidos/gravar-o-pedido.ts`;
 * aqui fica ler o painel, mandar, mostrar — e o «Anular» que se lhe segue.
 *
 * O que muda é o estado: era um `saving` booleano, que não distinguia «nunca
 * gravei» de «gravei» nem de «falhou». Passa a ser uma máquina de quatro
 * estados (`EstadoDaGravacao`); o `saving` que o painel lê deriva dela, e é
 * exactamente o de antes (verdadeiro só enquanto `a-gravar`).
 */
export type EstadoDaGravacao = "ocioso" | "a-gravar" | "gravado" | "falhou";

/** O que a gravação precisa do `AdminClient` — passado a cada desenho, como o
 *  fecho da função antiga o via. */
export interface DependenciasDaGravacao {
  selected: Quote | null;
  toast: ReturnType<typeof useToast>["toast"];
  painel: PainelDoPedido;
  convidadosEscritos: LeituraDeNumero;
  erroDeConvidados: string | null;
  userName: string;
  escritoNoServidor: RefObject<NotasAutomaticas | null>;
  acertarBaseDoConflito: (id: string, res: Response) => Promise<void>;
  setRascunhoPorRepor: (v: null) => void;
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  setSelected: Dispatch<SetStateAction<Quote | null>>;
  preencherCom: EdicaoDoPedido["preencherCom"];
  anular: ReturnType<typeof useAnular>;
  refletirPedidoReposto: (q: Quote) => void;
}

export function useGravacaoDoPedido({
  selected,
  toast,
  painel,
  convidadosEscritos,
  erroDeConvidados,
  userName,
  escritoNoServidor,
  acertarBaseDoConflito,
  setRascunhoPorRepor,
  setQuotes,
  setSelected,
  preencherCom,
  anular,
  refletirPedidoReposto,
}: DependenciasDaGravacao) {
  const [estado, setEstado] = useState<EstadoDaGravacao>("ocioso");

  async function gravar(
    opcoes: { silencioso?: boolean } = {},
  ): Promise<{ ok: boolean; porque?: string }> {
    if (!selected) return { ok: true };
    const dizer = (mensagem: string, tipo: "success" | "error") => {
      if (!opcoes.silencioso) toast(mensagem, tipo);
    };
    try {
      /**
       * As três decisões — que linhas entram no histórico, o que vai no corpo,
       * e (depois de gravar) o que o «Anular» devolve — são puras e vivem em
       * `lib/orcamento/pedidos/gravar-o-pedido.ts`; o painel lido, e o que
       * fazer com convidados que não servem, em `painel-do-pedido.ts`. Aqui
       * fica a casca: ler o painel, mandar, mostrar.
       */
      const escrito = painelParaGravar(painel, convidadosEscritos, selected);
      const linhas = linhasDoHistorico(selected, escrito, {
        actor: userName,
        agora: new Date().toISOString(),
        novoId: randomId,
      });
      // O texto de onde as notas partiram, como na gravação automática: o
      // servidor recusa com 409 se outra pessoa gravou notas entretanto.
      const lido = escritoNoServidor.current;
      const body = corpoDaGravacao(selected, escrito, {
        baseDasNotas:
          lido && lido.id === selected.id ? lido.adminNotes : (selected.adminNotes ?? ""),
        linhas,
      });

      // Nada mudou (o botão foi carregado depois de a gravação automática já ter
      // feito o trabalho). Não se inventa um pedido para não fazer nada.
      if (Object.keys(body).length === 0) {
        // A não ser que o que ela mudou tenha sido justamente o que não serve:
        // aí «já está tudo guardado» seria mentira.
        if (erroDeConvidados) {
          const porque = `Convidados não ficou guardado. ${erroDeConvidados}`;
          dizer(porque, "error");
          return { ok: false, porque };
        }
        dizer("Já está tudo guardado", "success");
        return { ok: true };
      }

      /**
       * ── O MESMO CUIDADO QUE A GRAVAÇÃO AUTOMÁTICA AO LADO ────────────────
       *
       * Este era o caminho MENOS resistente dos dois que vivem neste ficheiro.
       * A gravação automática das notas já usava `fetchComTecto` (tecto de
       * tempo) e `enviarComRepeticao` (três tentativas); o botão «Guardar» —
       * por onde sai o preço, a data, os convidados e os contactos — fazia um
       * `fetch` cru, sem `signal`, sem tecto e sem repetição.
       *
       * Numa quinta com 4G fraco isso não é um pormenor: uma rede que aceita a
       * ligação e nunca responde deixa esse `fetch` pendurado até o Safari
       * desistir sozinho, com o botão eternamente em «a guardar…», e uma única
       * falha de rede devolvia «não foi possível» sem sequer tentar outra vez.
       *
       * A resposta do servidor tem de sair daqui de dentro: o
       * `enviarComRepeticao` devolve se ficou guardado, não o corpo. Daí a
       * variável apanhada no fecho.
       */
      let guardado: Quote | null = null;
      const resultado = await enviarComRepeticao(async () => {
        const res = await fetchComTecto(`/api/orcamento/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          /**
           * O servidor já diz o que está mal — e era essa a frase que se
           * deitava fora, para pôr no lugar «Não foi possível guardar as
           * alterações», que não nomeia o campo nem diz o que fazer. Passa a
           * ser a dele, em português (ver `erro-do-servidor`). Sem corpo
           * aproveitável fica a frase genérica, que pelo menos não inventa uma
           * razão.
           *
           * O `respostaDeHttp` decide também se vale a pena repetir: um 4xx é
           * o pedido que está errado e repeti-lo dá exactamente o mesmo.
           */
          if (res.status === 409) await acertarBaseDoConflito(selected.id, res);
          return respostaDeHttp(res.status, {
            porque: (await porqueRecusou(res)) ?? undefined,
          });
        }
        guardado = (await res.json()) as Quote;
        // Um estado novo gravado pelo formulário («Ganho», «Perdido») arrasta
        // a proposta no servidor: a lista leve relê-se, depois do PATCH.
        if ("status" in body) asPropostasMudaram();
        return { estado: "guardado" } satisfies RespostaDoEnvio;
      });
      if (resultado.estado !== "guardado") {
        const porque = resultado.porque
          ? `Não foi guardado. ${resultado.porque}`
          : "Não foi possível guardar. Fica no telemóvel — volta a tentar quando houver rede.";
        dizer(porque, "error");
        return { ok: false, porque };
      }
      // O TypeScript não vê a atribuição que acontece dentro do fecho acima, e
      // por isso continua a achar que isto é `null`. A leitura tem de ser
      // explícita — e a verificação que se segue não é cerimónia: se o servidor
      // respondesse 200 com um corpo ilegível, seguir em frente escrevia
      // `undefined` por cima do pedido que está no ecrã.
      // Chegou ao servidor: a cópia local deixa de ter razão de existir. O
      // efeito acima também a apagaria assim que os campos re-sincronizassem,
      // mas entre uma coisa e outra há uma janela — e uma rede de segurança que
      // sobra é um aviso falso na abertura seguinte.
      esquecerRascunho(selected.id);
      setRascunhoPorRepor(null);
      const updated = guardado as Quote | null;
      if (updated === null) {
        const porque = "Não foi guardado: o servidor respondeu sem o pedido.";
        dizer(porque, "error");
        return { ok: false, porque };
      }
      setQuotes((prev) => substituirNaLista(prev, updated));
      setSelected(updated);
      // Re-sync EVERY edit field to what the server persisted, so the form can
      // never sit dirty on a value the user did not type (e.g. price formatting).
      // O campo por corrigir fica COMO ELA O ESCREVEU: substituí-lo pelo valor
      // gravado apagava o que ela acabou de escrever e voltava a esconder o
      // problema — que é o defeito de origem, ao contrário.
      preencherCom(updated, { manterConvidados: !!erroDeConvidados });
      // A linha de base da gravação automática move-se com este clique: sem
      // isto, a gravação adiada que estivesse a caminho reenviava o texto que o
      // botão acabou de gravar.
      escritoNoServidor.current = {
        id: updated.id,
        adminNotes: updated.adminNotes ?? "",
        lostReason: updated.lostReason ?? "",
      };
      if (erroDeConvidados) {
        // Guardou-se o que se conseguia guardar, e diz-se o que ficou de fora
        // e porquê. A barra continua em «Alterações por guardar» — porque
        // continua mesmo a haver uma alteração por guardar.
        const porque = `Convidados não ficou guardado. ${erroDeConvidados} O resto das alterações ficou.`;
        dizer(porque, "error");
        return { ok: false, porque };
      }
      /**
       * ── «ANULAR» DE TUDO O QUE ESTE «GUARDAR» MUDOU ────────────────────────
       *
       * `selected` aqui ainda é o pedido de ANTES desta gravação (o fecho do
       * clique). Para cada campo que foi no corpo, volta o valor que lá estava
       * — com a mesma regra de `null`/`""` do envio, para apagar mesmo. Se o
       * estado também mudou, vai tudo no mesmo gesto do `reporEstadoDoPedido`
       * (que desfaz a cadeia do «Ganho»); senão, um PATCH com a linha no
       * histórico.
       */
      const antes = selected;
      const inverso = corpoDoAnular(antes, body);
      const mudouEstado = updated.status !== antes.status;
      if (opcoes.silencioso || (!mudouEstado && Object.keys(inverso).length === 0)) {
        dizer("Pedido atualizado", "success");
        return { ok: true };
      }
      anular("Pedido atualizado", async () => {
        let reposto: Quote | null;
        if (mudouEstado) {
          reposto = await reporEstadoDoPedido({
            quoteId: updated.id,
            de: antes.status,
            para: updated.status,
            actor: userName,
            extra: { ...inverso },
          });
        } else {
          const res = await fetch(`/api/orcamento/${encodeURIComponent(updated.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...inverso,
              activityLogAppend: [
                {
                  id: randomId(),
                  at: new Date().toISOString(),
                  kind: "note_added",
                  actor: userName,
                  summary: "Alterações anuladas",
                },
              ],
            }),
          });
          const corpo = (await res.json().catch(() => null)) as (Quote & { error?: string }) | null;
          if (!res.ok) throw new Error(corpo?.error || `Não foi possível anular (${res.status}).`);
          reposto = corpo;
        }
        if (!reposto) return;
        refletirPedidoReposto(reposto);
      });
      return { ok: true };
    } catch {
      const porque = "Não foi possível guardar as alterações";
      dizer(porque, "error");
      return { ok: false, porque };
    }
  }

  async function saveChanges(
    opcoes: { silencioso?: boolean } = {},
  ): Promise<{ ok: boolean; porque?: string }> {
    if (!selected) return { ok: true };
    setEstado("a-gravar");
    let resultado: { ok: boolean; porque?: string } = { ok: false };
    try {
      resultado = await gravar(opcoes);
      return resultado;
    } finally {
      setEstado(resultado.ok ? "gravado" : "falhou");
    }
  }

  return { estado, saving: estado === "a-gravar", saveChanges };
}
