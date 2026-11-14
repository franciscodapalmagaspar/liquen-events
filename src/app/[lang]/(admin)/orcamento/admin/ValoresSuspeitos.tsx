"use client";

import { useState } from "react";
import { useToast } from "./Toast";
import { EmCurso } from "./ui/EmCurso";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PROPOSTAS QUE FICARAM COM O VALOR INCHADO — A LISTA, E MAIS NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A avaria: o total de uma proposta subia sozinho a cada visita, um degrau de
 * cada vez, do tamanho dos valores adicionais. Numa proposta observada, 3.000 →
 * 3.140 → 3.280 → 3.420, com uma deslocação de 140 €. Está fechada — ver
 * `baseDoPedidoParaOEcra`, no estúdio.
 *
 * Este painel é a outra metade: **algumas dessas propostas já foram enviadas a
 * casais com o número errado**, e essas o código não desfaz.
 *
 * ── PORQUE É QUE NÃO HÁ AQUI UM BOTÃO DE CORRIGIR ─────────────────────────
 *
 * Palavras dela: «não corrijas dados em base sem me mostrares primeiro o que
 * vai ser alterado». E mesmo depois de ver, corrigir não é o gesto óbvio: um
 * número que já saiu num PDF para um casal não se muda em silêncio do lado de
 * cá — ou se telefona, ou se manda a proposta outra vez, ou se deixa como está
 * porque foi esse o preço combinado. Nenhuma dessas decisões cabe num botão.
 *
 * O que o painel faz é pôr à frente dela tudo o que é preciso para decidir:
 * quem, quanto está lá, quanto devia estar, e se a proposta chegou a sair.
 */

/**
 * ── E A CONTA QUE NÃO FECHA ENTRE O DOCUMENTO E O PEDIDO ──────────────────
 *
 * Uma auditoria em produção foi ver os 15 pedidos à mão e encontrou dois com o
 * preço errado. Este ecrã respondia «Nenhuma das 7 propostas tem a assinatura
 * desta avaria» — um falso negativo, e do pior tipo: dá sensação de segurança
 * sobre dinheiro que já saiu num PDF.
 *
 * A avaria dos dois casos reais não era a inflação; era a marca dos adicionais
 * estar POR ESCREVER, e o código lê uma marca ausente de duas maneiras opostas
 * conforme o sítio. Ver `contasQueNaoFecham`.
 */
interface NaoFecha {
  quoteId: string;
  nome: string;
  estado: string;
  enviada: boolean;
  quando: string;
  tipo: "marca-em-falta" | "desalinhado";
  base: number;
  adicionais: number;
  noPedido: number | null;
  seSomam: number;
  seNaoSomam: number;
  emJogoComIva: number;
}

interface Suspeita {
  quoteId: string;
  nome: string;
  estado: string;
  enviada: boolean;
  quando: string;
  degrau: number;
  escrito: number;
  somaDasLinhas: number;
  somasAMais: number;
  escritoCorrigido: number;
  noPedido: number | null;
  noPedidoCorrigido: number;
  comIva: number;
  comIvaCorrigido: number;
}

const eur = (n: number) =>
  n.toLocaleString("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });

const dia = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-PT");
};

export default function ValoresSuspeitos() {
  const { toast } = useToast();
  const [resultado, setResultado] = useState<{
    suspeitas: Suspeita[];
    naoFecham: NaoFecha[];
    examinadas: number;
    propostas: number;
    rascunhos: number;
    rascunhosPorLer: boolean;
  } | null>(null);
  const [aLer, setALer] = useState(false);

  async function procurar() {
    setALer(true);
    try {
      const res = await fetch("/api/admin/valores-suspeitos");
      const dados = await res.json().catch(() => null);
      if (!res.ok) throw new Error(dados?.error ?? "Não consegui ler os pedidos.");
      setResultado({
        suspeitas: dados.suspeitas ?? [],
        naoFecham: dados.naoFecham ?? [],
        examinadas: dados.examinadas ?? 0,
        propostas: dados.propostas ?? 0,
        rascunhos: dados.rascunhos ?? 0,
        rascunhosPorLer: !!dados.rascunhosPorLer,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui ler os pedidos.", "error");
    } finally {
      setALer(false);
    }
  }

  const suspeitas = resultado?.suspeitas ?? [];
  const naoFecham = resultado?.naoFecham ?? [];
  const enviadas = suspeitas.filter((s) => s.enviada).length;
  /** Nada a dizer só quando NENHUM dos dois reconhecimentos encontrou nada. */
  const limpo = suspeitas.length === 0 && naoFecham.length === 0;

  return (
    <section className="mt-4 rounded-xl border border-[var(--bo-hairline-strong)] p-4 sm:p-5">
      <h3 className="text-sm font-medium">Valores que podem ter crescido sozinhos</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--bo-text-muted)]">
        Havia uma avaria que somava os valores adicionais outra vez a cada visita à mesma proposta —
        3.000, depois 3.140, depois 3.280. Está resolvida, mas as propostas que ficaram com o número
        inchado continuam com ele. Esta procura só <strong className="font-medium">lê</strong>: não
        corrige nem altera nada.
      </p>

      <div className="mt-3">
        <button
          type="button"
          onClick={procurar}
          disabled={aLer}
          className={`min-h-11 rounded-lg border border-foreground/20 px-3 text-sm hover:bg-[var(--bo-tinta-6)] disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
        >
          {aLer ? "A procurar…" : "Procurar"}
        </button>
      </div>

      {aLer && (
        <EmCurso
          className="mt-3"
          titulo="A comparar os totais com as linhas de cada proposta"
          estimadoMs={6000}
          nota="Lê os pedidos e as propostas todos. Não escreve nada."
          notaDemorada="Está a demorar mais do que o costume — com muitas propostas, é normal."
        />
      )}

      {resultado && !aLer && (
        <div className="mt-4 text-xs">
          {limpo ? (
            <p className="text-[var(--bo-tinta-72)]">
              {/* A frase diz agora O QUE FOI LIDO, e não só quantos. «7 examinadas» sem
                  dizer se os rascunhos lá estavam era exactamente o que dava a falsa
                  segurança: o valor inchado vive no rascunho, e os rascunhos ficavam
                  de fora da leitura. */}
              Nada a apontar em {resultado.propostas}{" "}
              {resultado.propostas === 1 ? "proposta" : "propostas"} e {resultado.rascunhos}{" "}
              {resultado.rascunhos === 1 ? "rascunho" : "rascunhos"}: os totais batem certo com as
              linhas, e o preço de cada pedido bate certo com o documento.{" "}
              <span className="text-foreground/50">
                Se mesmo assim houver um valor que não bate certo, é outra coisa — e vale a pena
                dizê-lo.
              </span>
            </p>
          ) : (
            <>
              {/* Os dois reconhecimentos são independentes: pode haver contas que não
                  fecham sem haver uma única proposta inchada, que é precisamente o
                  caso dos dois clientes reais que a auditoria encontrou. Sem esta
                  guarda, o ecrã abria com «0 propostas com o total acima da soma das
                  linhas» por cima da lista que interessa. */}
              {suspeitas.length > 0 && (
                <p className="text-[var(--bo-text)]">
                  <strong>
                    {suspeitas.length} {suspeitas.length === 1 ? "proposta" : "propostas"}
                  </strong>{" "}
                  em {resultado.examinadas}, com o total acima da soma das linhas por um múltiplo
                  exacto dos adicionais.
                  {enviadas > 0 && (
                    <>
                      {" "}
                      <span className="text-[var(--bo-perigo)]">
                        {enviadas === 1
                          ? "Uma já seguiu para o cliente."
                          : `${enviadas} já seguiram para o cliente.`}
                      </span>
                    </>
                  )}
                </p>
              )}
              {naoFecham.length > 0 && (
                <div className="mt-4 rounded-lg border border-[var(--bo-aviso-tom)]/40 bg-[var(--bo-aviso-tom)]/[0.07] p-3">
                  <p className="text-[var(--bo-text)]">
                    <strong>
                      {naoFecham.length}{" "}
                      {naoFecham.length === 1 ? "conta que não fecha" : "contas que não fecham"}
                    </strong>{" "}
                    entre o documento e o «Preço final» do pedido.
                  </p>
                  <ul className="mt-2.5 space-y-2.5">
                    {naoFecham.map((c) => (
                      <li
                        key={`${c.quoteId}-${c.tipo}`}
                        className="rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface,#fff)] p-2.5"
                      >
                        <p className="font-medium text-[var(--bo-text)]">
                          {c.nome}
                          {c.enviada && (
                            <span className="ml-2 text-[var(--bo-perigo)]">
                              já seguiu para o cliente
                            </span>
                          )}
                        </p>
                        <p className="mt-1 leading-relaxed text-[var(--bo-tinta-72)]">
                          {c.tipo === "marca-em-falta" ? (
                            <>
                              Tem {eur(c.adicionais)} de valores adicionais e o documento{" "}
                              <strong className="font-medium">não diz se eles contam</strong>. Com
                              eles o pedido vale {eur(c.seSomam)}; sem eles, {eur(c.seNaoSomam)}.
                              Hoje está gravado como{" "}
                              {c.noPedido == null ? "sem preço" : eur(c.noPedido)}.
                            </>
                          ) : (
                            <>
                              O pedido está gravado como{" "}
                              {c.noPedido == null ? "sem preço" : eur(c.noPedido)}, e o documento
                              diz {eur(c.seSomam)} ({eur(c.base)} de serviços mais{" "}
                              {eur(c.adicionais)} de adicionais).
                            </>
                          )}
                        </p>
                        <p className="mt-1 text-[var(--bo-text-muted)]">
                          Em jogo: {eur(c.emJogoComIva)} com IVA · {dia(c.quando)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {suspeitas.length > 0 && (
                <ul className="mt-3 space-y-2.5">
                  {suspeitas.map((s) => (
                    <li
                      key={s.quoteId}
                      className="rounded-lg border border-[var(--bo-hairline-strong)] px-3 py-2.5"
                    >
                      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-medium text-[var(--bo-text)]">{s.nome}</span>
                        <span className="text-[11px] text-foreground/45">{s.quoteId}</span>
                        {s.enviada ? (
                          <span className="rounded-full bg-[var(--bo-perigo)]/10 px-2 py-0.5 text-[10px] tracking-[0.06em] uppercase text-[var(--bo-perigo)]">
                            enviada {dia(s.quando)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-foreground/40">por enviar</span>
                        )}
                      </p>
                      {/* Os números lado a lado, e não uma frase: é a comparação
                        que se está a pedir a quem lê, e uma frase obriga a
                        fazê-la de cabeça. */}
                      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
                        <dt className="text-foreground/50">Está lá</dt>
                        <dd className="text-[var(--bo-text)]">
                          {eur(s.escrito)} <span className="text-foreground/40">sem IVA</span>
                          {s.enviada && (
                            <span className="text-foreground/45"> · {eur(s.comIva)} com IVA</span>
                          )}
                        </dd>
                        <dt className="text-foreground/50">As linhas somam</dt>
                        <dd className="text-[var(--bo-tinta-72)]">{eur(s.somaDasLinhas)}</dd>
                        <dt className="text-foreground/50">Somas a mais</dt>
                        <dd className="text-[var(--bo-tinta-72)]">
                          {s.somasAMais} × {eur(s.degrau)} de adicionais
                        </dd>
                        <dt className="text-foreground/50">Daria</dt>
                        <dd className="text-[var(--bo-text)]">
                          {eur(s.escritoCorrigido)}{" "}
                          <span className="text-foreground/40">sem IVA</span>
                          {s.enviada && (
                            <span className="text-foreground/45">
                              {" "}
                              · {eur(s.comIvaCorrigido)} com IVA
                            </span>
                          )}
                        </dd>
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-foreground/50">
                Um total diferente da soma das linhas também pode ser um desconto ou um acerto
                combinado ao telefone — só entram aqui as diferenças que dão um múltiplo exacto dos
                adicionais, que é a assinatura desta avaria. Confirma antes de mexer, sobretudo nas
                que já seguiram.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
