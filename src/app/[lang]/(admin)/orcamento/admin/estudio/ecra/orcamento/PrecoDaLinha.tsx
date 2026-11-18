"use client";

import type { LinhaOrcamento } from "@/lib/proposal-budget";
import { useEstudio } from "../../contexto";

/**
 * A largura vai no invólucro e não no campo: `.bo-input`
 * tem `width: 100%` escrito em CSS, que ganha a um
 * `w-28` do Tailwind. Sem isto o preço comia a linha
 * toda e o nome ficava numa caixa de trinta pixels — foi
 * o que a captura de ecrã mostrou.
 *
 * A largura continua no invólucro e não no campo, pela
 * razão escrita aqui em cima; o invólucro é que passou
 * a ser um `<label>`, para o rótulo desta coluna voltar
 * quando a fila quebra — ver o `<select>` ao lado.
 */
export function PrecoDaLinha({
  i,
  l,
  semPreco,
}: {
  i: number;
  l: LinhaOrcamento;
  semPreco: boolean;
}) {
  const {
    contas: { subpontosDoDoc },
    linhas: { updateBudgetPrice },
  } = useEstudio();
  return (
    <label className="flex w-28 shrink-0 flex-col gap-1">
      <span
        aria-hidden="true"
        className="text-[9px] uppercase tracking-[0.2em] text-foreground/25 @min-[36rem]:hidden"
      >
        Preço (sem IVA)
      </span>
      {/* ── PREENCHIDO E POR PREENCHER, INCONFUNDÍVEIS ──
                              Tinha aqui `placeholder="900"`. Palavras dela: «um
                              número redondo e plausível como placeholder num
                              campo de preço é perigoso — mais cedo ou mais
                              tarde alguém pensa que já está preenchido». E
                              tinha acontecido: quatro serviços por orçamentar
                              mostravam «900» a cinzento cada um.

                              O placeholder saiu, e as duas caixas passaram a
                              ser diferentes ao olhar, não só ao ler: a que tem
                              preço é sólida e escura, a que não tem é
                              tracejada, lavada, e diz «sem preço» — três
                              palavras que ninguém confunde com euros. */}
      <input
        /**
         * ── A CHAVE TRAZ O PREÇO GRAVADO DE VOLTA AO CAMPO ──
         * A linha é desenhada com `key={i}`, e o `i` é a
         * POSIÇÃO: ao apagar a do meio, o React reaproveita
         * o nó que sobrevive na posição e um `defaultValue`
         * não se volta a aplicar a um nó que já existia. O
         * campo ficava a mostrar o preço da linha ANTERIOR
         * ao lado do nome da linha nova — e o `blur`
         * seguinte GRAVAVA esse número por cima do
         * verdadeiro. Com [Alfa, Beta, Gama] a 100/200/300,
         * apagar a Beta e tocar no campo da Gama punha a
         * Gama a valer 200 €, e daí ia para o PDF, para o
         * sinal e para a factura. O mesmo acontecia no
         * arrumar, no Cmd+Z, no anular a limpeza e no repor
         * uma versão: o que estava no campo deixava de ser
         * o que estava no documento.
         *
         * Pôr o valor gravado na chave resolve-o pela raiz —
         * é o mesmo remédio que os valores adicionais já
         * usam aqui em baixo. A chave só muda quando o
         * DOCUMENTO muda, nunca a cada tecla: continua a
         * poder escrever-se «1.500,50» sem o campo se
         * reformatar a meio da escrita.
         */
        key={`preco:${i}:${l.preco}`}
        className={`bo-input px-2.5 py-2 text-right text-xs ${
          semPreco
            ? "border-dashed bg-[var(--bo-tinta-3)] text-foreground/40 placeholder:text-foreground/30 placeholder:italic"
            : "font-medium text-[var(--bo-text)]"
        }`}
        defaultValue={l.preco === null ? "" : String(l.preco)}
        // Com subpontos, a linha vale a soma deles e
        // escreve-se lá em baixo, em cada um (6/11).
        readOnly={subpontosDoDoc[i].length > 0}
        // `onBlur` e não `onChange`: normalizar a cada tecla
        // apagava o que ela estava a escrever a meio ("1." vira
        // 1, e o "500" seguinte já não tinha onde entrar).
        onBlur={(e) => updateBudgetPrice(i, e.target.value)}
        placeholder="sem preço"
        inputMode="decimal"
        aria-label={`Preço de ${l.item || "linha sem nome"}`}
        // A pega do salto da regra do envio (5/11).
        data-campo={`budgetPreco:${i}`}
      />
    </label>
  );
}
