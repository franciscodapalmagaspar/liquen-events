"use client";

import { INPUT_SM, REMOVE_BTN } from "../../classes";
import { sugerirArtigoDaLinha } from "@/lib/orcamento/artigos-de-faturacao";
import {
  CONVIDADOS_POR_MESA_OMISSAO,
  Escala,
  formulaDaLinha,
  totalDaLinha,
  type TipoDeEscala,
} from "@/lib/orcamento/escala";
import { PrecoDaLinha } from "./PrecoDaLinha";
import { Ajuda } from "../../../ui";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { ArtigoDaLinha } from "./ArtigoDaLinha";
import { eur } from "@/lib/money";
import { useEstudio } from "../../contexto";
import { LinhaOrcamento } from "@/lib/proposal-budget";

export function LinhaDoOrcamento({
  escala,
  i,
  l,
  semPreco,
}: {
  escala: Escala | null;
  i: number;
  l: LinhaOrcamento;
  semPreco: boolean;
}) {
  const {
    contas: { convidados, extrasDoDoc, ordemDoOrcamento },
    documento: { doc, setDoc },
    linhas: {
      definirEscala,
      definirUnitario,
      removeBudgetItem,
      updateBudgetExtraFlag,
      updateBudgetItem,
    },
    traducoes: { caixaDeIngles },
  } = useEstudio();
  return (
    <div key={i} className="flex flex-wrap items-center gap-2">
      {/* ── O NOME DA LINHA NÃO ENCOLHE ABAIXO DE 12 REM ────
                            Do registo do audit, e é um dos oito bloqueios: «a
                            caixa do nome da linha do orçamento tem 62 px — 27
                            com a proposta bilingue ligada».

                            MEDIDO a 390 px: a fila tem 318 px dentro do cartão,
                            e as colunas fixas (a escala `w-32`, o preço `w-28`)
                            mais os espaços comem 264. Sobram 54 para os campos
                            de texto — e como eles são `flex-1` com `min-w-0`
                            escrito à mão, não quebram: ENCOLHEM. Escrever
                            «Decoração da Cerimónia» numa caixa de 62 px é
                            escrever às cegas, e o que ali se escreve é o texto
                            que o casal lê no PDF.

                            O `min-w` é o remédio da própria casa — é o que a
                            fase do cronograma faz cento e trinta linhas acima,
                            e o que o `ServicesEditor` faz nos títulos de grupo.
                            Com um mínimo, o `flex-wrap` que já cá estava passa a
                            fazer o que existe para fazer: o nome fica sozinho
                            numa fila inteira e a escala, o preço e o «Extra»
                            descem para a de baixo. Acima de 520 px nada muda —
                            aí já cabia. */}
      <input
        className={`${INPUT_SM} min-w-[12rem] flex-1`}
        value={l.item}
        onChange={(e) => updateBudgetItem(i, e.target.value)}
        // Ao sair do nome, o artigo do Moloni que ele sugere
        // (só se ainda não houver um escolhido).
        onBlur={() => setDoc((d) => sugerirArtigoDaLinha(d, i))}
        // A pega do salto. Faltava: o «Ver no campo» das
        // gralhas caía na secção porque nenhuma rubrica a
        // tinha, e o painel «Por traduzir» precisa dela para
        // chegar à caixa ao lado.
        data-campo={`linhaDeOrcamento:${i}`}
        placeholder="Decor Cerimónia"
        aria-label="Item de orçamento"
      />
      {/* A inglesa com o mesmo mínimo: com o bilingue ligado
                            eram os dois a repartir os mesmos 54 px, 27 para
                            cada. */}
      {caixaDeIngles({ tipo: "linhaDeOrcamento", i }, "Item de orçamento", {
        className: `${INPUT_SM} min-w-[12rem] flex-1`,
        placeholder: "Ceremony Decor",
      })}
      {/* COMO É QUE ESTA LINHA ESCALA. Metade das linhas de um
                          orçamento de casamento não é um preço, é uma
                          multiplicação — e quando os convidados mudam, refazer
                          essas contas à mão é onde entra o erro que ninguém vê,
                          porque o resultado continua a parecer um preço. */}
      {/* ── O RÓTULO NÃO DESAPARECE SEM SUBSTITUTO ────────
                            Sem o cabeçalho, «Tipo de preço» não voltava em lado
                            nenhum: ficava um `<select>` com três opções e
                            nenhuma palavra visível a dizer o que ele decide. O
                            nome existia para quem OUVE (`aria-label`) e não
                            para quem OLHA — é a mesma família do «Total» que se
                            corrigiu esta semana, e não se resolve com `hidden`.

                            Agora o rótulo está sempre num dos dois sítios, e
                            nunca nos dois: no cabeçalho enquanto a fila é uma
                            só, aqui por cima do campo quando ela quebra. Os
                            dois lêem o MESMO limiar de contentor, que é o que
                            impede haver um instante com ambos ou com nenhum.
                            `aria-hidden` porque o `aria-label` já o diz — dois
                            nomes seguidos era o leitor de ecrã a repetir-se. */}
      <label className="flex w-32 shrink-0 flex-col gap-1">
        <span
          aria-hidden="true"
          className="text-[9px] uppercase tracking-[0.2em] text-foreground/25 @min-[36rem]:hidden"
        >
          Tipo de preço
        </span>
        <select
          value={escala?.tipo ?? "fixa"}
          onChange={(e) => definirEscala(i, e.target.value as TipoDeEscala)}
          aria-label={`Tipo de preço ${l.item || "a linha sem nome"}`}
          className="bo-input w-full px-2 py-2 text-xs"
        >
          <option value="fixa">Valor fixo</option>
          <option value="por-convidado">Por convidado</option>
          <option value="por-mesa">Por mesa</option>
        </select>
      </label>
      <PrecoDaLinha i={i} l={l} semPreco={semPreco} />
      {/* EXTRA OU NÃO. Uma caixa e não um menu: a pergunta é
                          de sim ou não, e um menu de duas entradas custa duas
                          carregadas para responder a uma pergunta de uma.
                          A palavra «extra» some onde o cabeçalho da coluna já a
                          diz, e fica onde não há cabeçalho nenhum — pelo MESMO
                          limiar de contentor que o cabeçalho usa, que é o que
                          impede a palavra e o cabeçalho de se cruzarem. */}
      <label className="alvo-toque flex w-16 shrink-0 items-center justify-center gap-1.5 text-[11px] text-foreground/50">
        <input
          type="checkbox"
          checked={extrasDoDoc[i] ?? false}
          onChange={(e) => updateBudgetExtraFlag(i, e.target.checked)}
          aria-label={`${l.item || "Linha sem nome"} é um extra opcional`}
        />
        <span className="@min-[36rem]:hidden">extra</span>
      </label>
      {/* Onde a fila quebra não há cabeçalho de coluna, e
                            portanto não há onde pendurar o «?» — o mesmo limiar
                            de contentor, pela mesma razão. Fica na PRIMEIRA linha,
                            que é o equivalente móvel do cabeçalho — e só nela:
                            um ponto de interrogação por linha seriam oito
                            botões a explicar a mesma coisa.

                            Fora do `<label>`: um botão lá dentro carregaria a
                            quadrícula ao ser carregado. */}
      {ordemDoOrcamento[0] === i && (
        <Ajuda className="@min-[36rem]:hidden" sobre="o que faz a caixa Extra">
          <strong className="font-semibold text-[var(--bo-text)]">Extra</strong> marca uma linha
          como opcional: ela sai assinalada no quadro do PDF e, por baixo do total, a proposta passa
          a mostrar também o valor <em>sem</em> essa linha. Uma proposta só, com as duas versões lá
          dentro — em vez de dois documentos a divergir.
        </Ajuda>
      )}
      <button
        type="button"
        className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
        onClick={() => removeBudgetItem(i)}
        aria-label="Remover item"
      >
        ×
      </button>
      <ArtigoDaLinha i={i} l={l} />
      {/* A fórmula ao lado do número: um total que muda sozinho
                          e não explica porquê é um total em que se deixa de
                          confiar à primeira surpresa. E o preço UNITÁRIO ao pé
                          dela, que é a única coisa da fórmula que se edita. */}
      {escala && (
        <div className="flex w-full flex-wrap items-center gap-2 pl-1">
          <span className="w-24 shrink-0">
            <input
              // A mesma chave do preço, e pela mesma razão: o
              // unitário é um `defaultValue` num nó que a
              // remoção de uma linha reaproveita, e sem isto
              // ficava a mostrar o unitário da linha anterior
              // — com a fórmula ao lado a explicar uma conta
              // que já não era a desta linha.
              key={`unitario:${i}:${escala.unitario}`}
              className="bo-input px-2.5 py-2 text-right text-xs text-[var(--bo-tinta-72)]"
              defaultValue={String(escala.unitario)}
              onBlur={(e) => definirUnitario(i, e.target.value)}
              placeholder="45"
              inputMode="decimal"
              aria-label={`Preço por ${escala.tipo === "por-mesa" ? "mesa" : "convidado"} de ${l.item || "linha sem nome"}`}
            />
          </span>
          <span className="text-[10px] text-foreground/40">
            {`${formulaDaLinha(
              escala,
              convidados,
              doc.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO,
            )} = ${eur(
              totalDaLinha(
                escala,
                convidados,
                doc.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO,
              ) ?? 0,
            )}`}
          </span>
        </div>
      )}
    </div>
  );
}
