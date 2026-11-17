"use client";

import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ROTULO_CURTO, type View } from "../nav";
import { ESTADO, PRESSAO } from "../ui/movimento";

/**
 * Um destino da barra de baixo: o ícone, o rótulo (curto no telemóvel, inteiro
 * no computador) e a bolha dos pedidos por responder. (Saiu da barra na fase 7
 * de `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual.)
 */
export interface DestinoDaBarraProps {
  setView: Dispatch<SetStateAction<View>>;
  pendingCount: number;
  id: View;
  navItem: { id: View; label: string; icon: ReactNode };
  noTelemovel: boolean;
  isActive: boolean;
}

export function DestinoDaBarra({
  setView,
  pendingCount,
  id,
  navItem,
  noTelemovel,
  isActive,
}: DestinoDaBarraProps) {
  return (
    <>
      <button
        onClick={() => setView(id)}
        aria-current={isActive ? "page" : undefined}
        /*
          ── O NOME ACESSÍVEL É SEMPRE O INTEIRO ────────────────
          O rótulo visível encurta no telemóvel («Visão» em vez de
          «Visão Geral») para caber numa linha. O nome que um leitor
          de ecrã anuncia NÃO pode encurtar com ele: quem não vê o
          ícone tem só a palavra, e «Visão» não é um destino.

          Foi a suite de telemóvel que o apanhou — «A barra de baixo
          não tem "^Visão Geral$"» — e ela tinha razão pela razão
          certa: procura os destinos pelo nome acessível, que é o
          que uma pessoa com leitor de ecrã ouve.
        */
        aria-label={navItem.label}
        /* ── A PASTILHA DO DESTINO ONDE ELA ESTÁ ──────────────────
         A MESMA que a coluna da esquerda usa (ver `ItemDoMenu`):
         lavagem de acento e tinta de acento. Duas navegações da
         mesma casa que marcassem a escolha de maneiras diferentes
         eram duas casas — e «colocação previsível e iconografia
         consistente» é o que a documentação que ela mandou pede.

         A lavagem aqui é a OPACA (`--bo-accent-lavagem`) e não o
         `--bo-accent-ring`: por baixo desta pastilha não está o
         branco do painel, está vidro, e o que passa através dele
         pode ser uma fotografia escura. Com a lavagem translúcida,
         o acento por cima descia com o fundo e perdia os 4,5:1;
         com ela opaca mede 5,19:1 e não depende de nada. A conta
         está no `globals.css`, ao lado do token.

         E não é só cor: a pastilha é uma FORMA que aparece, e o
         `font-medium` fica como terceira pista (WCAG 1.4.1). */
        /* ── A PASTILHA LEVANTA-SE DO VIDRO ────────────────────────
         A segunda captura dela é a barra do iOS 26: o destino onde
         se está não é uma mancha de cor pintada no vidro — é uma
         peça que SOBE dele, com moldura própria e sombra por baixo.

         A cor de fundo NÃO muda, e é de propósito: a lavagem opaca
         (`--bo-accent-lavagem`) é o que faz o acento medir 5,19:1
         por cima dela mesmo quando o que passa através do vidro é
         uma fotografia escura, e essa conta está prendida no
         `barra-que-flutua.test.ts`. O que se acrescenta é RELEVO —
         um fio à volta e uma sombra —, que não mexe em contraste
         nenhum. Levantar sem repintar. */
        /* ── E A TINTA DO DESTINO EM REPOUSO SUBIU UM DEGRAU ──────
         De `--bo-text-muted` (0,64) para `--bo-tinta-72`, e não é
         cosmético: é a outra metade da transparência que a cápsula
         ganhou, e as duas andam juntas.

         O material desceu de 0,80 para 0,66, o que quer dizer que
         a superfície por baixo desta tinta ficou mais escura no
         pior caso — uma fotografia preta a passar por baixo dá
         `#a8a8a8` em vez de `#cccccc`. Medido, sobre esse pior
         caso:

             tinta   sobre #cccccc (antes)   sobre #a8a8a8 (agora)
             0,64          4,88:1                  4,05:1  ← chumba
             0,72          6,21:1                  4,91:1  ← este

         Ou seja: com a tinta de antes, mais vidro custava a
         legibilidade. Subindo o degrau, os dois números melhoram
         ao mesmo tempo — 4,88:1 passa a 4,91:1 E a transmissão
         sobe de 20% para 34%. É a mesma manobra que o `globals.css`
         já fez uma vez, quando tirou o verde do visto do
         `ui/Escolha` em vez de subir a opacidade do material.

         E o 0,72 continua a ler-se como secundário: o texto de
         corpo desta casa é o 0,82. */
        className={`alvo-toque relative ${
          noTelemovel ? "flex" : "hidden lg:flex"
        } min-w-0 flex-1 lg:w-auto lg:flex-none lg:px-1.5 flex-col items-center justify-center gap-0.5 rounded-[var(--bo-raio-pilula)] px-1 ${ESTADO} ${PRESSAO} ${
          isActive
            ? "bg-[var(--bo-accent-lavagem)] text-[var(--bo-accent)] font-medium shadow-[var(--bo-sombra-suspensa)] ring-1 ring-inset ring-[var(--bo-hairline)]"
            : "text-[var(--bo-tinta-72)] font-normal"
        }`}
      >
        {id === "pedidos" && pendingCount > 0 && (
          <span className="absolute top-1.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-[var(--bo-accent)]" />
        )}
        {/* 120 ms e não 150 — e é o `ESTADO` que serve, apesar de aqui só
          mudar a escala: no Tailwind v4 a classe `scale-110` emite a
          propriedade autónoma `scale`, e `scale` está de propósito na
          lista do `ESTADO` (ver `ui/movimento.ts`). Um degrau a menos
          para a casa manter. */}
        <span className={`${ESTADO} ${isActive ? "scale-110" : ""}`}>{navItem.icon}</span>
        {/* DUAS LINHAS RESERVADAS EM TODAS AS CÉLULAS (`min-h-[2.2em]`),
          e não só na que parte. Sem isso, a célula mais alta empurra
          o seu ícone para cima e os ícones da barra deixam de estar à
          mesma altura — lê-se como um desalinhamento, que é
          exactamente a queixa que trouxe este trabalho. Reservar o
          espaço em todas custa uns píxeis e devolve a linha direita. */}
        {/* `2.5em` e não `2.2em`: a reserva tem de ser a altura REAL
          de duas linhas, e no telemóvel o chão da letra desta casa
          é 12 px (`escala-movel.test.ts`) — duas linhas a
          `leading-tight` são 30 px, ou seja 2,5em. Com 2,2em a
          reserva mentia e o rótulo transbordava a cápsula por
          baixo: medido, 2 px em «Visão Geral» e «Fazer proposta». */}
        {/* ── O RÓTULO CRESCE, E SAI DA CAIXA ALTA ────────────────
          Ela mandou duas referências do vidro do iOS 26 — a barra do
          Instagram e a do WhatsApp — e disse «eu queria algo neste
          liquid glass e não está». Fui compará-las com esta barra.

          O material já cá estava, e é o mesmo: cápsula a flutuar,
          desfoque, fio especular no bordo de cima, pastilha
          levantada no destino activo. O que NÃO estava era a
          escala. Nas referências o rótulo lê-se de relance —
          «Atualizações», «Conversas», em caixa normal, com o
          tamanho de texto de interface. Aqui eram 8 px em
          MAIÚSCULAS, que é a tipografia de uma etiqueta de campo,
          não a de um menu.

          E a caixa alta não é detalhe: o `docs/DESIGN-SYSTEM.md`
          proíbe-a em cabeçalhos por escrito (Parte 18), com a razão
          da Apple atrás — «o sistema novo abandonou a caixa alta».
          Um rótulo de navegação é um cabeçalho.

          11 px no telemóvel (a cápsula tem 390 px para quatro
          células) e 12 px a partir de `lg`, onde a barra é O MENU.
          A reserva de duas linhas fica, porque «Propostas Aceites»
          continua a precisar delas. */}
        {/* ── UMA LINHA, E O RÓTULO CURTO ONDE É PRECISO ──────────
          A reserva de duas linhas (`min-h-[2.5em]`) existia porque
          «Visão Geral» e «Fazer proposta» partiam — e servia para os
          ícones das outras células não subirem. Resolvia o
          desalinhamento e criava outro problema: uma barra com
          rótulos de duas linhas não se lê como barra, lê-se como
          uma lista apertada. Nas duas referências que ela mandou
          (Instagram e WhatsApp) o rótulo é sempre UMA linha, ou não
          existe.

          Agora não parte nenhum: no telemóvel usa-se o rótulo curto
          (`ROTULO_CURTO`) onde o inteiro não cabe, e a reserva de
          duas linhas deixa de fazer falta — todas as células têm
          exactamente uma. */}
        {/* ── E A CÉLULA DEIXA DE TER 80 px NO COMPUTADOR ─────────
          Ela mandou uma fotografia com dois rótulos POR CIMA um do
          outro. A célula tinha `lg:w-20` — 80 px fixos, o idioma de
          quatro separadores iguais de um telemóvel — e o rótulo é
          `whitespace-nowrap`: não parte, não encolhe, transborda.
          Medido a 1440 px, com as doze células:

              Fazer proposta ....... 89 px numa célula de 80  (+9)
              Propostas Aceites ... 106 px numa célula de 80  (+26)

          As outras dez cabiam, e por isso o defeito era invisível
          até dois vizinhos compridos ficarem lado a lado.

          No computador a célula passa a ter a largura do seu nome
          mais 16 px de folga. Somadas dão 942 px e a cápsula tem
          971 — cabe, e sem estrear o `overflow-x-auto` que já
          estava declarado ao lado. No telemóvel nada muda: lá são
          quatro células iguais (`flex-1`), que é onde esse idioma
          está certo.

          E a folga é 6 px, a mesma em todas as larguras, porque a
          1024 — o primeiro pixel em que este menu existe — não é
          só a célula que tem de caber. Medido lá: a cápsula e o
          botão «⋯» ao lado somavam 1033 px num ecrã de 1024, e
          SAÍAM os dois, um por cada lado. Não era defeito meu (com
          as células de 80 px a cápsula era ainda mais larga, 971),
          mas é defeito, e o guarda novo mede-o.

          Cheguei a pôr 8 px a partir de `xl`, para ficar com mais
          ar no ecrã grande. O `Cortes.contrato.test.ts` chumbou-o
          na hora: esta casa tem TRÊS larguras e só três, e um
          quarto ponto de corte é uma regra nova para toda a gente
          manter em troca de dois píxeis. Uma folga só, medida nas
          duas pontas. */}
        <span className="text-[11px] lg:text-[12px] leading-tight text-center whitespace-nowrap flex items-start justify-center">
          <span className="lg:hidden">{ROTULO_CURTO[id] ?? navItem.label}</span>
          <span className="hidden lg:inline">{navItem.label}</span>
        </span>
      </button>
    </>
  );
}
