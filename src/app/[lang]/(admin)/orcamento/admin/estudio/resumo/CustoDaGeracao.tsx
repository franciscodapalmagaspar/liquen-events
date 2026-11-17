"use client";

import {
  orcamentoDeTempo,
  passaDoAnexo,
  tamanhoEmPalavras,
  tamanhoEstimado,
  tempoEmPalavras,
  tempoEstimado,
  type AmostraDeGeracao,
} from "@/lib/custo-do-pdf";

export function CustoDaGeracao({
  fotos,
  amostras,
}: {
  fotos: number;
  amostras: AmostraDeGeracao[];
}) {
  if (fotos === 0) return null;
  const ms = tempoEstimado(fotos, amostras);
  const bytes = tamanhoEstimado(fotos, amostras);
  const pesado = passaDoAnexo(bytes);
  /**
   * ── E O TECTO DA ROTA, QUE É OUTRA COISA ────────────────────────────────
   *
   * O tempo acima é o que ELA espera, medido daqui. Este é o que o SERVIDOR
   * gasta — e o servidor tem um tecto que ela não tem como saber: a rota que
   * redesenha o documento para o casal morre ao fim de `TECTO_DA_ROTA_MS`. Não é a mesma
   * conta nem a mesma pergunta, e por isso não se mistura com a frase de cima:
   * uma diz «vais esperar isto», a outra diz «isto está a chegar ao limite».
   */
  const orcamento = orcamentoDeTempo(fotos);
  // Com medições, diz-se que são medições — «cerca de» com uma amostra atrás é
  // outra coisa do que «cerca de» com um modelo por omissão.
  const medido = amostras.length >= 2;

  return (
    <div className="mt-3">
      <p className="text-xs leading-relaxed text-foreground/50">
        Gerar este PDF demora {tempoEmPalavras(ms)} e dá um ficheiro de {tamanhoEmPalavras(bytes)}
        {medido ? ", pelas últimas gerações neste computador" : ""}.
      </p>
      {pesado && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
          <span aria-hidden="true">⚠</span>
          <span>
            Um anexo deste tamanho pode ser recusado pelo servidor de email do cliente — muitos
            param nos 8 MB, e o anexo viaja ~33% maior do que o ficheiro. Tira algumas fotografias
            das páginas mais cheias. O link da proposta continua a servir na mesma, com o PDF
            inteiro do outro lado.
          </span>
        </p>
      )}
      {orcamento.aperta && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
          <span aria-hidden="true">⚠</span>
          <span>
            Com esta quantidade de fotografias, o servidor demora{" "}
            {tempoEmPalavras(orcamento.msOptimista)} a {tempoEmPalavras(orcamento.msPessimista)} a
            desenhar o documento — e a página onde o casal o abre desiste ao fim de{" "}
            {tempoEmPalavras(orcamento.tectoMs).replace(/^cerca de /, "")}. O PDF do envio sai na
            mesma (tem mais tempo); quem pode ficar sem ele é o casal, ao carregar no link. Tira
            algumas fotografias das páginas mais cheias.
          </span>
        </p>
      )}
    </div>
  );
}
