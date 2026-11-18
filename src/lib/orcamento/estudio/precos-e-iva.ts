/*
 * Os preços das linhas e o IVA dos valores adicionais.
 *
 * Saiu tal e qual do `ProposalStudio.tsx` (fase 1 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
import { normalizarValor, somaDosExtrasSemIva } from "@/lib/proposal-budget";
import { eur } from "@/lib/money";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTAS LINHAS JÁ TÊM PREÇO — E PORQUE É QUE ISSO PRECISA DE SER DITO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre o `placeholder="900"` que estava no campo do preço: «um
 * número redondo e plausível como placeholder num campo de preço é perigoso —
 * mais cedo ou mais tarde alguém pensa que já está preenchido». Tinha razão, e
 * o caso já tinha acontecido: uma proposta de 2.460,00 € com QUATRO serviços
 * sem preço nenhum mostrava «900» a cinzento em todos eles, e a única coisa
 * legível no orçamento inteiro era uma deslocação de 75,00 €.
 *
 * O placeholder saiu. Mas tirar a mentira não chega — é preciso dizer a
 * verdade, e a verdade é um número: quantas das linhas têm mesmo preço. Um
 * contador responde à pergunta de uma vez, sem obrigar a percorrer o formulário
 * a contar caixas vazias.
 *
 * `incompleta` é o caso que faz uma soma mentir sem parecer: UMAS linhas com
 * preço e outras sem. Nem tudo por orçamentar (aí não há soma nenhuma, e a
 * biblioteca devolve `null`), nem tudo orçamentado — o meio, que é onde a soma
 * dá um número plausível que está errado por baixo.
 */
export function contagemDePrecos(precos: (number | null)[]): {
  comPreco: number;
  total: number;
  semPreco: number;
  incompleta: boolean;
  frase: string;
} {
  const total = precos.length;
  const comPreco = precos.filter((p) => p !== null).length;
  const semPreco = total - comPreco;
  return {
    comPreco,
    total,
    semPreco,
    // Só há soma incompleta quando há mesmo uma soma a fazer: zero linhas com
    // preço é «ainda não orçamentei», não «orçamentei mal».
    incompleta: comPreco > 0 && semPreco > 0,
    frase: `${comPreco} de ${total} ${total === 1 ? "linha" : "linhas"} com preço`,
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O IVA QUE UM VALOR ADICIONAL DECLARA — PERGUNTADO À BIBLIOTECA, NÃO ADIVINHADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os valores adicionais são texto («896,00 €», «895,00 € + IVA») e esse texto é
 * impresso no PDF tal e qual. Quem decide o que ele quer dizer é
 * `somaDosExtrasSemIva`, em `proposal-budget.ts`: uma linha que diz «+ IVA» é
 * líquida, uma que diz «IVA incluído» é bruta, e uma calada segue o modo do
 * documento.
 *
 * Para o ecrã poder mostrar essa escolha num selector é preciso LER de volta o
 * que a linha declara — e isso podia ser feito com uma cópia da expressão
 * regular que está lá dentro. Não é: uma segunda cópia diverge no dia em que
 * alguém acrescentar uma forma de escrever «sem IVA», e o selector passaria a
 * mostrar uma coisa e a soma a fazer outra, em silêncio.
 *
 * Em vez disso pergunta-se à própria função, duas vezes, com contextos
 * opostos. Uma linha CALADA responde de maneira diferente conforme o contexto
 * (é essa a definição de calada); uma linha que declara responde o mesmo às
 * duas. E o valor devolvido diz qual das duas declarações é.
 */
export type ModoDeIvaDoAdicional = "documento" | "acrescer" | "incluido";

export function modoDoAdicional(valueText: string, vatRate: number): ModoDeIvaDoAdicional {
  const cru = normalizarValor(valueText);
  // Sem número legível («a definir») não há IVA nenhum a declarar.
  if (cru === null || cru === 0) return "documento";
  const linha = [{ label: "", valueText }];
  const comoLiquido = somaDosExtrasSemIva(linha, { mode: "acrescer", vatRate });
  const comoBruto = somaDosExtrasSemIva(linha, { mode: "incluido", vatRate });
  if (comoLiquido !== comoBruto) return "documento";
  // Responde o mesmo aos dois contextos: a linha declara. Se o que responde é
  // o próprio número escrito, declarou-se líquida («+ IVA»); se responde menos,
  // declarou-se bruta e a função converteu-a («IVA incluído»).
  return Math.abs(comoLiquido - cru) < 0.005 ? "acrescer" : "incluido";
}

/**
 * O texto que fica GRAVADO num valor adicional — o mesmo que o PDF imprime.
 *
 * O campo do valor passou a ser numérico (ela escrevia «1.500», «1500» e
 * «1 500 €» conforme a pressa, e as três tinham de dar o mesmo número), mas o
 * documento continua a guardar TEXTO: é o que o gerador desenha, e é lá que
 * mora a informação de «+ IVA» que não se pode perder. Este é o único sítio
 * onde os dois se juntam.
 *
 * Um valor que não se consegue ler («a definir», «sob consulta») fica exactamente
 * como foi escrito: é uma frase que o casal tem de ver na proposta, não um
 * número que se possa formatar.
 */
export function textoDoAdicional(escrito: string, modo: ModoDeIvaDoAdicional): string {
  const valor = normalizarValor(escrito);
  if (valor === null) return escrito;
  if (modo === "acrescer") return `${eur(valor)} + IVA`;
  if (modo === "incluido") return `${eur(valor)} (IVA incluído)`;
  return eur(valor);
}
