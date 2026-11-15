"use client";

import { useEffect } from "react";
import { CORTES } from "./adaptativo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS BARRAS QUE ENCOLHEM AO DESCER — o «Fazer proposta» no telemóvel (15/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num iPhone 14 com as barras do Safari (390 × 664): o cabeçalho do
 * back office, a barra dos passos, a barra de acção e a barra de destinos
 * comiam o ecrã — ao abrir, 35 % dele era formulário; a descer, 59 %.
 *
 * O que ela aprovou: ao DESCER, em cima ficam só os passos, compactos; em
 * baixo fica a barra de baixo (a de destinos NÃO sai — «Fica a barra de
 * baixo»), e a de acção fica só com o essencial: o total «A pagar» e o botão
 * principal. Ao SUBIR, ou no topo, tudo volta inteiro. No computador nada
 * muda.
 *
 * ── PORQUE É UM ATRIBUTO NA RAIZ, E NÃO ESTADO NO CABEÇALHO ───────────────
 * O cabeçalho é do `AdminClient`; os passos e a barra de acção são do
 * estúdio. Quem sabe que se está a escrever uma proposta é o estúdio — por
 * isso é ele que liga isto, e o resto do back office não ganha nem um
 * ouvinte. O CSS (`admin.css`, «As barras que encolhem») lê
 * `html[data-barras="encolhidas"]` e mexe SÓ em `translate`: nada muda de
 * altura, nada empurra o conteúdo, e o `--bo-cabecalho` medido continua certo.
 *
 * ── A DECISÃO É UMA FUNÇÃO PURA ───────────────────────────────────────────
 * `proximoEstado` decide com histerese de 10 px (Parte 2.5 do sistema de
 * design: «histerese de ~10 px antes de comprometer a direcção de um gesto»),
 * para um dedo que pára não fazer as barras tremer. E no fundo da página não
 * decide nada: se esconder um botão mudar a altura da página, o browser corrige
 * o `scrollY` — e essa correcção não é um gesto dela.
 */

/** Quantos píxeis numa direcção antes de as barras mudarem. */
export const HISTERESE = 10;
/** Até aqui é «o topo»: as barras estão sempre inteiras. O limiar do `useDesceu`. */
export const TOPO = 24;

/**
 * Onde isto vale: num ecrã de TOQUE abaixo do computador — telemóvel ou
 * tablet. Uma janela de computador estreita (rato) não muda: dizia só
 * `max-width` para o telemóvel, e um computador com a janela a 600 px via o
 * cabeçalho desaparecer debaixo do rato (revisão de 15/11).
 */
export const ONDE_ENCOLHEM = `(pointer: coarse) and (max-width: ${CORTES.desktop - 0.02}px)`;

/**
 * O que, estando focado, segura as barras inteiras: os acessórios que saem
 * (o «anterior», os comandos do envio) e o cabeçalho. Encolher com o foco lá
 * dentro escondia o elemento focado — e o foco caía no `body`.
 */
const SEGURA_O_FOCO = "[data-acessorio-da-barra], [data-barra-do-topo]";

export interface EstadoDasBarras {
  encolhidas: boolean;
  /**
   * O ponto de viragem: com as barras inteiras, o `scrollY` mais ALTO (menor)
   * desde que estão inteiras; encolhidas, o mais BAIXO (maior). A histerese
   * conta-se a partir dele, e não do fotograma anterior — um dedo lento anda
   * 1 px por fotograma e nunca passaria os 10.
   */
  ancora: number;
}

export function proximoEstado(
  antes: EstadoDasBarras,
  y: number,
  { fundo }: { fundo: number },
): EstadoDasBarras {
  if (y <= TOPO) return { encolhidas: false, ancora: Math.max(0, y) };
  // No fundo, a página pode ter encolhido por baixo do dedo: não é gesto.
  if (y >= fundo - 2) return { encolhidas: antes.encolhidas, ancora: y };
  if (antes.encolhidas) {
    if (y < antes.ancora - HISTERESE) return { encolhidas: false, ancora: y };
    return { encolhidas: true, ancora: Math.max(antes.ancora, y) };
  }
  if (y > antes.ancora + HISTERESE) return { encolhidas: true, ancora: y };
  return { encolhidas: false, ancora: Math.min(antes.ancora, y) };
}

/** O atributo que o CSS lê. Fica `inteiras` enquanto o estúdio está montado. */
export const ATRIBUTO = "data-barras";

/**
 * Liga as barras que encolhem enquanto quem chama está montado.
 *
 * Não devolve estado de propósito: quem chama é o estúdio (17 mil linhas), e
 * um `setState` a cada mudança de direcção voltava a desenhá-lo inteiro a
 * meio de uma rolagem. O atributo na raiz chega — o CSS faz o resto,
 * incluindo esconder o que leva `data-acessorio-da-barra`.
 */
export function useBarrasQueEncolhem(): void {
  useEffect(() => {
    const raiz = document.documentElement;
    const mq = window.matchMedia?.(ONDE_ENCOLHEM);
    let estado: EstadoDasBarras = { encolhidas: false, ancora: window.scrollY };
    let pedido = 0;

    const cabecalho = () => document.querySelector<HTMLElement>("[data-barra-do-topo]");
    const aplicar = (e: boolean) => {
      /* ── OS PASSOS DESLIZAM, MAS SÓ SE SE MEXEM (FLIP) ──────────────────
         O CSS muda o `top` onde os passos colam, a seco. Se estavam colados,
         isso salta-os ~60 px; se ainda não tinham colado, não os mexe. Mede-se
         antes e depois e, só quando mudaram de sítio, põe-se um `translate`
         da diferença que a transição do CSS leva a zero. */
      const passos = document.querySelector<HTMLElement>("[data-passos-da-proposta]");
      const antes = passos?.getBoundingClientRect().top;
      raiz.setAttribute(ATRIBUTO, e ? "encolhidas" : "inteiras");
      /* Escondido, o cabeçalho sai também do teclado e do leitor de ecrã: um
         Tab não pode ir parar fora do ecrã, e não se lê o que não se vê. */
      cabecalho()?.toggleAttribute("inert", e);
      if (passos && antes != null) {
        // Sem transição ao medir: uma ida e volta ainda a meio deixava o
        // «depois» a meio caminho, e a diferença saía curta.
        const transicao = passos.style.transition;
        passos.style.transition = "none";
        passos.style.translate = "";
        const d = antes - passos.getBoundingClientRect().top;
        if (Math.abs(d) > 0.5) {
          passos.style.translate = `0 ${d}px`;
          void passos.getBoundingClientRect();
        }
        passos.style.transition = transicao;
        passos.style.translate = "";
      }
    };
    const ver = () => {
      pedido = 0;
      const fundo = document.documentElement.scrollHeight - window.innerHeight;
      const novo = proximoEstado(estado, window.scrollY, { fundo });
      if (novo.encolhidas && !estado.encolhidas) {
        const focado = document.activeElement;
        if (focado && focado !== document.body && focado.closest?.(SEGURA_O_FOCO)) return;
      }
      if (novo.encolhidas !== estado.encolhidas) aplicar(novo.encolhidas);
      estado = novo;
    };
    const aoRolar = () => {
      if (!pedido) pedido = requestAnimationFrame(ver);
    };
    const ligar = () => {
      window.removeEventListener("scroll", aoRolar);
      if (pedido) cancelAnimationFrame(pedido);
      pedido = 0;
      estado = { encolhidas: false, ancora: window.scrollY };
      if (mq?.matches) {
        aplicar(false);
        window.addEventListener("scroll", aoRolar, { passive: true });
      } else {
        raiz.removeAttribute(ATRIBUTO);
        cabecalho()?.removeAttribute("inert");
      }
    };
    ligar();
    mq?.addEventListener?.("change", ligar);
    return () => {
      mq?.removeEventListener?.("change", ligar);
      window.removeEventListener("scroll", aoRolar);
      if (pedido) cancelAnimationFrame(pedido);
      raiz.removeAttribute(ATRIBUTO);
      cabecalho()?.removeAttribute("inert");
    };
  }, []);
}
