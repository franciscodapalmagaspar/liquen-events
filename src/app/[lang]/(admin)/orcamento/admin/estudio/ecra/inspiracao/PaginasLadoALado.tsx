"use client";

import { VistaAdiada } from "../../VistasAdiadas";
import { type ProposalDoc } from "@/lib/proposal-doc";
import { useEstudio } from "../../contexto";

/**
 * ══════════════════════════════════════════════════════════════
 * AS PÁGINAS LADO A LADO — NO FIM, E SEM SE PEDIR
 * ══════════════════════════════════════════════════════════════
 *
 * Palavras dela: «eu quero que apareça isto automaticamente no
 * final sem pedirmos ou carregarmos para ver».
 *
 * Estava atrás de um botão («Ver as páginas lado a lado»), e o
 * botão só existia com mais do que um mood board. Duas condições
 * para ver o documento inteiro, e a segunda não fazia sentido
 * nenhuma desde que esta vista deixou de ser dos mood boards e
 * passou a ser da PROPOSTA: a capa, a apresentação, o orçamento,
 * as condições e a contracapa existem com um board ou com zero.
 *
 * Fica no FIM da coluna onde ela escreve, que é onde a pergunta
 * nasce — acabei, como é que isto ficou? Estava em cima, antes de
 * tudo o que a responde.
 *
 * ── PORQUE É QUE ESTÁ AQUI E NÃO UM NÍVEL ACIMA ────────────────
 * O passo 1 é uma FILA (`lg:flex`): o índice, esta coluna e o
 * painel «O que vai sair». Um quarto filho ali seria uma quarta
 * COLUNA, e as folhas lado a lado espremidas numa coluna deixam de
 * se poder comparar — que é a única coisa que esta vista serve.
 * Último filho da coluna de escrita é a largura toda, e é a mesma
 * que ela já tinha quando estava em cima.
 *
 * ── E PORQUE É QUE NÃO LEVA `content-visibility` ──────────────
 * Foi a primeira ideia — saltar o desenho enquanto ela não chega cá
 * abaixo. Mas o `Paineis.contrato.test.ts` proíbe escrevê-lo à mão
 * numa página, e tem razão medida: quem o usa tem de reservar a
 * altura certa, e uma reserva errada faz a página encolher debaixo
 * do dedo na primeira descida (576 px medidos em `/servicos`). O
 * molde da casa, `.cv-panel`, FIXA a altura a `--cv-h` — serve
 * bandas de altura conhecida, e esta vista tem tantas folhas quantas
 * a proposta tiver. Fixá-la era cortá-la.
 *
 * Fica sem optimização nenhuma, que é o estado honesto: se algum dia
 * pesar, mede-se primeiro.
 */
export function PaginasLadoALado() {
  const {
    documento: { doc },
    fotos: { aspetosDasFotos, assetOriginais, assetUrls },
    ordenacao: { ordemDosBoards },
    paginasDaProposta: { fotosDoPdf },
    painel: { vistaIrParaSeccao, vistaMover, vistaMudarFoto, vistaSaltar },
    passos: { step },
    traducoes: { idiomaDoPdf },
  } = useEstudio();
  return (
    <div className="mt-6" hidden={step !== "inspiracao"}>
      <VistaAdiada
        // ADIADO (10/11): as folhas acompanham o que se escreve logo a
        // seguir, sem a letra ter de esperar por elas.
        doc={doc as ProposalDoc}
        fotosDoPdf={fotosDoPdf}
        onMudarFoto={vistaMudarFoto}
        ordem={ordemDosBoards}
        idioma={idiomaDoPdf}
        urls={assetUrls}
        originais={assetOriginais}
        aspetos={aspetosDasFotos}
        onMover={vistaMover}
        onSaltar={vistaSaltar}
        // O salto de uma folha de texto usa o MESMO caminho da
        // Conferência: abre a secção se estiver dobrada e só então
        // leva a vista. Uma segunda maneira de saltar era uma segunda
        // maneira de falhar a abertura da dobra.
        onIrParaSeccao={vistaIrParaSeccao}
      />
    </div>
  );
}
