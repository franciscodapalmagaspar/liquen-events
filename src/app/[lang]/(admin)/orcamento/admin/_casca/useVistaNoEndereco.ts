"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { NAV, type View } from "../nav";
import { PARAM_VISTA, VIEW_COOKIE, VIEW_STORAGE_KEY } from "./vista-guardada";

/**
 * A secção aberta acompanha o endereço (`?v=`), o cookie que o servidor lê no
 * arranque, e o `localStorage` — e, uma vez, a ponte de quem só tem o
 * `localStorage`. Saiu do `AdminClient` tal e qual, pela mesma ordem (fase 7
 * de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export function useVistaNoEndereco(
  view: View,
  setView: Dispatch<SetStateAction<View>>,
  vistaInicial: View | undefined,
): void {
  /**
   * ── A PONTE, E SÓ A PONTE ────────────────────────────────────────────────
   *
   * A secção passou a vir DO SERVIDOR (ver `VIEW_COOKIE`): quando o cookie já
   * existe, o primeiro desenho já é o certo e não há nada a restaurar aqui.
   *
   * O que fica é o caso de quem já tinha uma escolha guardada no
   * `localStorage` e ainda não tem cookie — a primeira visita depois desta
   * alteração. Aí ainda há um salto, uma vez, e a gravação seguinte escreve o
   * cookie que o faz desaparecer para sempre.
   *
   * `vistaInicial` a dizer que já veio decidida é o que impede isto de voltar
   * a pôr o salto no ecrã de quem já não precisa dele.
   */
  useEffect(() => {
    if (vistaInicial) return;
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      const vista = NAV.find((n) => n.id === saved)?.id;
      if (vista) setView(vista);
    } catch {
      /* localStorage unavailable — keep default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
    /**
     * E no cookie, que é o que o servidor lê no arranque seguinte. Um ano, o
     * mesmo horizonte do `localStorage`; `SameSite=Lax` porque isto não é uma
     * credencial — é a preferência de que separador abrir — e `Lax` é o que
     * deixa o cookie viajar numa navegação normal sem o oferecer a terceiros.
     * Sem `Secure` escrito à mão: em `localhost` ele impedia a gravação, e em
     * produção o site é servido só por HTTPS.
     */
    try {
      document.cookie = `${VIEW_COOKIE}=${encodeURIComponent(view)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      /* sem cookies: fica o `localStorage`, e volta a haver o salto de uma vez */
    }
  }, [view]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O BACK OFFICE INTEIRO TINHA UM ENDEREÇO SÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Achado F-05 de uma auditoria em produção, e é dos que se sentem todos os
   * dias: Visão Geral, Pedidos, Propostas, Temas, Definições — dezoito secções,
   * e `/orcamento/admin` para todas. Quatro consequências, todas verdadeiras:
   *
   *  · **os favoritos não servem.** Guardar as Propostas guarda a aplicação, e
   *    abrir o favorito leva ao que estivesse aberto da última vez;
   *  · **não se manda um link a ninguém.** «Vê as Definições» é uma frase, não
   *    um endereço;
   *  · **o botão «voltar» sai da aplicação.** Não recua uma secção: sai. Num
   *    telemóvel, onde o gesto de voltar é o mais usado que há, isso quer dizer
   *    que o gesto natural a deita fora do back office;
   *  · **dois separadores em secções diferentes é impossível** — partilham a
   *    memória, e o segundo arrasta o primeiro.
   *
   * ── COMO, E PORQUE É QUE NÃO SÃO ROTAS ────────────────────────────────────
   *
   * `window.history.replaceState` com `?v=<secção>`. É o caminho que o guia de
   * `single-page-applications` do próprio Next descreve para isto — «shallow
   * routing on the client» —, e diz que estas chamadas se integram no Router,
   * portanto o `usePathname`/`useSearchParams` continuam a ver a verdade.
   *
   * Rotas a sério (`/orcamento/admin/pedidos`) dariam um endereço mais bonito e
   * custariam caro: cada troca de secção passava a ser uma navegação do Next,
   * com o `AdminClient` inteiro a remontar — e com ele os pedidos carregados, o
   * pedido aberto, o rascunho por gravar. Trocar de secção é uma coisa que ela
   * faz dezenas de vezes por dia, e é instantânea. Fica assim.
   *
   * ── TRÊS DOS QUATRO, E O QUARTO RECUSADO COM RAZÃO ────────────────────────
   *
   * Dos quatro estragos que a auditoria enumera, este bloco resolve três — os
   * favoritos, o link que se manda a alguém, os dois separadores. O quarto — «o
   * botão voltar sai da aplicação em vez de recuar uma secção» — fica por
   * resolver, DE PROPÓSITO, e vale a pena dizer porquê.
   *
   * O gesto de voltar já tem dono neste back office. O `useCamadaDeHistoria`
   * põe uma ENTRADA MARCADA por cada camada aberta — gaveta, folha, diálogo —
   * para que o deslizar da esquerda no iPhone feche o que está aberto em vez de
   * sair. Foi o primeiro dos oito bloqueios do registo do audit, e o ficheiro
   * dele é uma lista de armadilhas que essa contabilidade tem: uma entrada a
   * mais no sítio errado e uma camada conclui que foi consumida e fecha-se
   * sozinha.
   *
   * Eu escrevi a primeira versão disto com `pushState`, para o «voltar» andar
   * pelas secções. Chumbou três testes do painel de detalhe, e a causa era
   * exactamente essa: as minhas entradas sem marca entravam no meio das
   * marcadas e desalinhavam a contagem. Não é um defeito dos testes — é o
   * mesmo desalinhamento que aconteceria no telemóvel dela, onde o gesto de
   * voltar é o mais usado que há.
   *
   * Dar duas leituras ao mesmo gesto («fecha o que está aberto» E «recua uma
   * secção») era pedir-lhe que adivinhasse qual delas ia acontecer. Fica com a
   * que já tinha, que é a que importa num telemóvel. `replaceState`: o endereço
   * acompanha sempre a secção, e o histórico fica exactamente como estava.
   *
   * ── E O ESTADO QUE JÁ LÁ ESTÁ VIAJA SEMPRE ────────────────────────────────
   *
   * `replaceState(window.history.state, …)` e nunca `null`. `null` APAGA o
   * `history.state`, e com ele a marca da camada aberta — que é, palavra por
   * palavra, o acidente que o `useCamadaDeHistoria` descreve vindo do router do
   * Next: «reescreve o estado do topo e leva a nossa marca com ele».
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get(PARAM_VISTA) === view) return;
      url.searchParams.set(PARAM_VISTA, view);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* sem `history` (embutidos antigos) a aplicação funciona como sempre
         funcionou: o endereço é que deixa de acompanhar. */
    }
  }, [view]);

  /**
   * ── E PORQUE É QUE NÃO HÁ AQUI UM OUVINTE DE `popstate` ───────────────────
   *
   * Havia. Escutava o «voltar» e punha a secção que o endereço passasse a
   * dizer. Saiu, e a razão é a mesma do `replaceState` acima, vista do outro
   * lado: com as secções a substituir e nunca a empilhar, ESTE componente nunca
   * cria uma entrada de história com um `?v=` diferente. Um `popstate` que
   * chegue aqui é sempre de outra pessoa — quase sempre do `useCamadaDeHistoria`
   * a consumir a entrada de uma camada que fechou.
   *
   * E segui-lo tinha custo: o `back()` de limpeza de uma camada é ADIADO (o
   * próprio ficheiro dela conta que já «aterrou a meio do que vinha a seguir»),
   * portanto o ouvinte apanhava um endereço de outro momento e trocava a secção
   * debaixo dos pés de quem estava a trabalhar. Foi o que dois testes do apagar
   * mostraram, com o painel a desaparecer sozinho.
   *
   * O `?v=` é uma PORTA DE ENTRADA — favorito, link, separador novo —, e quem a
   * lê é o servidor, no arranque. Não é uma dimensão do histórico, e fingir que
   * era custava mais do que valia.
   */
}
