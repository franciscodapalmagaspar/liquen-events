import type { Quote } from "@/lib/orcamento/types";
import { esquecerRascunho, type RascunhoEncontrado } from "../rascunho-do-pedido";
import {
  enviarComRepeticao,
  fetchComTecto,
  respostaDeHttp,
  type RespostaDoEnvio,
} from "@/lib/gravar-com-tecto";
import { type GravacaoAutomatica } from "../useGravacaoAutomatica";
import { randomId } from "../util";
import { reporEstadoDoPedido } from "../anular-estado";
import { asPropostasMudaram } from "../percentagem-do-sinal";
import { type NotasAutomaticas } from "@/lib/orcamento/pedidos/notas-automaticas";
import { comPedidoSubstituido } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import { type EdicaoDoPedido } from "./useEdicaoDoPedido";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { porqueRecusou } from "@/lib/erro-do-servidor";
import { type ResultadoDoEcra } from "../registo-de-gravacoes";
import {
  corpoDaGravacao,
  corpoDoAnular,
  linhasDoHistorico,
} from "@/lib/orcamento/pedidos/gravar-o-pedido";
import { lerPainel } from "@/lib/orcamento/pedidos/painel-do-pedido";
import { type Avisar } from "../Toast";
import { type Anular } from "../ui/anular";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GRAVAR O PEDIDO ABERTO — o histórico, o «Guardar» e o «Anular»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que leva o painel do pedido ao servidor: acrescentar linhas ao histórico,
 * gravar as decisões (com as regras puras de `lib/orcamento/pedidos/
 * gravar-o-pedido.ts`), o «Guardar tudo» e o atalho de gravar já.
 *
 * Saiu do corpo do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`)
 * tal e qual, e é chamado NO MESMO SÍTIO onde o código estava: a ordem dos
 * hooks e dos efeitos do componente não muda. Os nomes ficam os de lá.
 */
export interface EntradasGravacaoDoPedido {
  userName: string;
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  setSelected: Dispatch<SetStateAction<Quote | null>>;
  selected: Quote | null;
  setSaving: Dispatch<SetStateAction<boolean>>;
  toast: Avisar;
  anular: Anular;
  escritoNoServidor: RefObject<NotasAutomaticas | null>;
  acertarBaseDoConflito: (id: string, res: Response) => Promise<void>;
  setRascunhoPorRepor: Dispatch<SetStateAction<RascunhoEncontrado | null>>;
  gravacao: GravacaoAutomatica;
  edicao: EdicaoDoPedido;
  refletirPedidoReposto: (q: Quote) => void;
}

export function useGravacaoDoPedido({
  userName,
  setQuotes,
  setSelected,
  selected,
  setSaving,
  toast,
  anular,
  escritoNoServidor,
  acertarBaseDoConflito,
  setRascunhoPorRepor,
  gravacao,
  edicao,
  refletirPedidoReposto,
}: EntradasGravacaoDoPedido) {
  const {
    preencherCom,
    painel,
    convidadosEscritos,
    erroDeConvidados,
    alteracoesPorConfirmar,
    escritoPorGravar,
  } = edicao;

  /**
   * Confirma o que exige um clique.
   *
   * Devolve se ficou guardado, e sabe estar CALADO: quando é o gesto «Guardar
   * tudo» a chamá-lo, quem dá a notícia é a resposta desse gesto — item a item,
   * com o nome de cada um. Dois recados ao mesmo tempo sobre a mesma gravação
   * seriam ruído, e o recado que sobra é sempre o menos exacto dos dois.
   */
  async function saveChanges(
    opcoes: { silencioso?: boolean } = {},
  ): Promise<{ ok: boolean; porque?: string }> {
    if (!selected) return { ok: true };
    const dizer = (mensagem: string, tipo: "success" | "error") => {
      if (!opcoes.silencioso) toast(mensagem, tipo);
    };
    setSaving(true);
    try {
      /**
       * As três decisões — que linhas entram no histórico, o que vai no corpo,
       * e (depois de gravar) o que o «Anular» devolve — são puras e vivem em
       * `lib/orcamento/pedidos/gravar-o-pedido.ts`. Aqui fica a casca: ler o
       * painel, mandar, mostrar.
       *
       * Um número de convidados que não serve NÃO é uma alteração: fica igual
       * ao que está gravado e, por isso, nem vai no corpo nem se anuncia no
       * histórico. É assim que o email escrito na mesma gravação deixa de ser
       * arrastado abaixo por um sinal a menos.
       */
      const escrito = lerPainel(painel, convidadosEscritos, selected);
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
        // Um 200 com corpo ilegível é um 200: gravou. Repetir mandava outra vez
        // as linhas do histórico (lá em baixo diz-se que veio sem o pedido).
        guardado = (await res.json().catch(() => null)) as Quote | null;
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
      setQuotes((prev) => comPedidoSubstituido(prev, updated));
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
    } finally {
      setSaving(false);
    }
  }

  /**
   * O painel do pedido inteiro, gravado de uma vez.
   *
   * Faz as duas coisas pela ordem certa: primeiro descarrega o que grava
   * sozinho (é o que ela está a tentar outra vez quando a gravação automática
   * falhou), e só depois confirma o que exige um clique. Ao contrário, o clique
   * gravava o texto e a gravação adiada voltava a mandá-lo a seguir.
   *
   * É esta a função que o botão «Guardar» do painel usa E a que o registo
   * chama quando ela carrega em «Guardar tudo» — o mesmo trabalho pelo mesmo
   * caminho, para os dois gestos não poderem divergir com o tempo.
   *
   * O que devolve não arredonda para melhor: basta uma das metades falhar para
   * a resposta ser «não ficou guardado». Aqui não há cópia local nenhuma — o
   * que não chega ao servidor não existe em mais lado nenhum, e é por isso que
   * o desfecho é `nao-guardado` e não «só neste computador».
   */
  async function guardarTudoDoPedido(silencioso = false): Promise<ResultadoDoEcra> {
    let porque: string | undefined;
    let falhou = false;
    if (gravacao.porGravar || gravacao.naoChegouAoServidor || escritoPorGravar) {
      const r = await gravacao.gravarJa();
      if (r.estado !== "guardado") {
        falhou = true;
        porque = r.porque;
      }
    }
    if (alteracoesPorConfirmar) {
      const r = await saveChanges({ silencioso });
      if (!r.ok) {
        falhou = true;
        // A razão é a do próprio campo — «Convidados não ficou guardado. Não
        // pode ser negativo…». Dizer «o servidor não aceitou as alterações»
        // por cima disso era voltar ao recado que não diz nada.
        porque = porque ?? r.porque ?? "O servidor não aceitou as alterações do pedido.";
      }
    }
    return falhou ? { estado: "nao-guardado", porque } : { estado: "guardado" };
  }

  /** O botão «Guardar» da barra do painel. Fala por si (com `toast`), porque
   *  aqui o gesto é dela e a resposta é sobre este pedido e mais nenhum. */
  function guardarAgora() {
    void guardarTudoDoPedido();
  }
  return { guardarTudoDoPedido, guardarAgora };
}
