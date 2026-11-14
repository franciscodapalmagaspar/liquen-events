"use client";

import { useEffect, useMemo } from "react";
import { eur } from "@/lib/money";
import type { PropostaImportada } from "@/lib/importar-proposta/mapear";
import type { Revisao } from "@/lib/importar-proposta/ia/importar";
import type { Aviso } from "@/lib/importar-proposta/ia/verificar";
import { documentoEmTexto, type UnidadeLida } from "@/lib/importar-proposta/documento-completo";
import { pedidoParaOClaude } from "@/lib/importar-proposta/ia/instrucoes";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { Segmented } from "./ui";
import {
  comServicosPostos,
  valoresQueVaoSerGravados,
  type Correccoes,
} from "@/lib/importar-proposta/montar";
import type { VatMode } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REVISÃO LADO A LADO — O DOCUMENTO À ESQUERDA, A PROPOSTA NOVA À DIREITA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido de 13/11: «que não falhe nada». O que se leu do documento inteiro vai
 * à esquerda, pela ordem (texto e miniaturas); o que fica na proposta nova vai
 * à direita. Os avisos vêm a vermelho no topo E junto do sítio a que dizem
 * respeito. Os que mexem em dinheiro têm uma caixa «confirmo» — e a criação
 * não avança sem ela (`avisosPorConfirmar`, lido pelo `ImportarProposta`).
 *
 * Diz sempre que via leu o documento: com IA, pelo JSON que ela trouxe (custo
 * zero), ou sem IA — e, nesse caso, dá o pedido para o Claude do plano dela.
 *
 * Mora num ficheiro seu para o ecrã da importação mudar o mínimo.
 */

export function avisosPorConfirmar(
  revisao: Revisao | null,
  confirmados: ReadonlySet<string>,
): Aviso[] {
  return revisao ? revisao.avisos.filter((a) => a.dinheiro && !confirmados.has(a.id)) : [];
}

interface Props {
  revisao: Revisao;
  proposta: PropostaImportada;
  /** Todas as imagens que o navegador conseguiu ler, pelo caminho no ficheiro. */
  imagens: ReadonlyMap<string, File>;
  confirmados: ReadonlySet<string>;
  onConfirmar: (id: string, sim: boolean) => void;
  /** Carregar o JSON de uma leitura feita fora (custo zero). */
  onLeitura: (f: File) => void;
  /** O que ela corrigiu (para mostrar o que VAI ser gravado). */
  correccoes?: Correccoes;
  /** O que ela escolheu para o IVA (o mesmo campo do total), ou null. */
  modoDoIva?: VatMode | null;
  onModoDoIva?: (m: VatMode) => void;
  /** Avisos que nascem do que ela escolheu no ecrã (a soma depois do IVA). */
  avisosExtra?: readonly Aviso[];
  /** Há total ou linhas com valor (do documento ou escritos por ela): o IVA escolhe-se aqui. */
  mostrarIva?: boolean;
}

const PARECE: Record<string, string> = {
  sem: "parece dizer: sem IVA",
  com: "parece dizer: com IVA",
  ambos: "fala das duas coisas",
  isento: "fala de isenção",
};

/**
 * ── O IVA É SEMPRE ELA QUE O ESCOLHE ─────────────────────────────────────
 * Nem o texto, nem as contas, nem a leitura decidem sozinhos
 * (`ia/verificar.ts`). Ela escolhe com um clique — nada pré-escolhido — e vê ao
 * lado o que AJUDA: o que as contas do documento sugerem, as frases que falam
 * de IVA e o que a leitura disse. Se as contas e as frases discordam, diz-se.
 */
function EscolherOIva({
  revisao,
  modo,
  onModo,
}: {
  revisao: Revisao;
  modo: VatMode | null;
  onModo: (m: VatMode) => void;
}) {
  // Sem contas (um documento sem valores, total escrito por ela): só a escolha.
  const contas = revisao.contas;
  const lido = (x: { valor: string; citacao: string | null }) =>
    x.valor === "sem_iva" ? "sem IVA" : x.valor === "com_iva" ? "com IVA" : "não sabe";
  return (
    <div
      role="group"
      aria-label="O IVA dos valores do documento"
      className="rounded-xl border border-[var(--bo-perigo)]/25 bg-[var(--bo-perigo-lavagem)]/50 px-4 py-3"
    >
      <p className="text-footnote font-semibold text-[var(--bo-perigo)]">
        Os valores do documento são:
      </p>
      <div className="mt-2">
        <Segmented<VatMode | "">
          ariaLabel="Os valores do documento têm IVA?"
          size="sm"
          value={modo ?? ""}
          onChange={(v) => v && onModo(v)}
          options={[
            { value: "acrescer", label: "sem IVA" },
            { value: "incluido", label: "com IVA" },
          ]}
        />
      </div>
      {contas?.sugestaoDasContas && (
        <p className="mt-2 text-footnote text-[var(--bo-text)]">{contas.sugestaoDasContas.texto}</p>
      )}
      {contas?.discordancia && (
        <p role="alert" className="mt-2 text-footnote font-semibold text-[var(--bo-perigo)]">
          Atenção: as contas sugerem{" "}
          {contas.sugestaoDasContas?.modo === "sem_iva" ? "sem IVA" : "com IVA"}, mas as frases do
          documento parecem dizer {contas.sugestaoDasFrases === "sem_iva" ? "sem IVA" : "com IVA"}.
        </p>
      )}
      <p className="mt-2 text-caption text-[var(--bo-text-muted)]">
        Escolhes sempre tu.
        {contas
          ? ` A leitura disse: linhas ${lido(contas.leituraDoIva.linhas)}, total ${lido(contas.leituraDoIva.total)}.`
          : ""}
      </p>
      {contas && contas.frasesDoIva.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {contas.frasesDoIva.map((f) => (
            <li key={f.unidade} className="break-words text-footnote text-[var(--bo-text)]">
              «{f.texto}»
              {f.parece ? (
                <span className="text-caption text-[var(--bo-text-muted)]">
                  {" "}
                  — {PARECE[f.parece]}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-footnote text-[var(--bo-text)]">O documento não fala de IVA.</p>
      )}
    </div>
  );
}

const VIA: Record<Revisao["via"], string> = {
  ia: "Lido com IA e verificado por regras fixas",
  json: "Lido pela leitura que carregaste (sem custo) e verificado por regras fixas",
  regras: "Importação sem IA",
};

export function AvisoLinha({
  a,
  confirmados,
  onConfirmar,
}: {
  a: Aviso;
  confirmados: ReadonlySet<string>;
  onConfirmar: (id: string, sim: boolean) => void;
}) {
  const vermelho = a.gravidade === "erro";
  return (
    <li
      className={`flex min-w-0 items-start gap-2 text-footnote ${vermelho ? "text-[var(--bo-perigo)]" : "text-[var(--bo-text)]"}`}
    >
      {a.dinheiro ? (
        <label className="flex min-w-0 cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 shrink-0 accent-[var(--bo-accent)]"
            checked={confirmados.has(a.id)}
            onChange={(e) => onConfirmar(a.id, e.target.checked)}
          />
          <span className="min-w-0 break-words">
            {a.texto}{" "}
            <span className="font-semibold">
              {confirmados.has(a.id) ? "Confirmado." : "Confirma depois de veres."}
            </span>
          </span>
        </label>
      ) : (
        <span className="min-w-0 break-words">{a.texto}</span>
      )}
    </li>
  );
}

function AvisosDoCampo({
  avisos,
  prefixo,
  confirmados,
  onConfirmar,
}: {
  avisos: Aviso[];
  prefixo: string;
  confirmados: ReadonlySet<string>;
  onConfirmar: (id: string, sim: boolean) => void;
}) {
  const aqui = avisos.filter((a) => a.campo === prefixo || a.campo.startsWith(`${prefixo}.`));
  if (!aqui.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-[var(--bo-perigo-lavagem)]/40 px-3 py-2">
      {aqui.map((a) => (
        <AvisoLinha key={a.id} a={a} confirmados={confirmados} onConfirmar={onConfirmar} />
      ))}
    </ul>
  );
}

export default function RevisaoDaImportacao({
  revisao,
  proposta,
  imagens,
  confirmados,
  onConfirmar,
  onLeitura,
  modoDoIva,
  onModoDoIva,
  correccoes,
  avisosExtra = [],
  mostrarIva = false,
}: Props) {
  const urls = useMemo(
    () => new Map([...imagens].map(([c, f]) => [c, URL.createObjectURL(f)])),
    [imagens],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const naoColocados = new Map(revisao.naoColocados.map((x) => [x.id, x]));
  const destinoDa = new Map(revisao.imagens.map((i) => [i.id, i]));
  const porConfirmar = [
    ...avisosPorConfirmar(revisao, confirmados),
    ...avisosExtra.filter((a) => a.dinheiro && !confirmados.has(a.id)),
  ].length;
  const todosOsAvisos = [...revisao.avisos, ...avisosExtra];
  const partes = new Map(revisao.documento.partes.map((p) => [p.id, p]));

  function descarregarPedido() {
    // Feito aqui, do documento que já veio: a resposta da rota não leva o mesmo texto duas vezes.
    const pedido = pedidoParaOClaude(documentoEmTexto(revisao.documento));
    const blob = new Blob([pedido], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pedido-para-o-claude.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const unidade = (u: UnidadeLida, i: number, todas: UnidadeLida[]) => {
    const nova = i === 0 || todas[i - 1].parte !== u.parte;
    const p = partes.get(u.parte);
    const fora = naoColocados.get(u.id);
    const cabeca = nova ? (
      <p className="bo-eyebrow mt-3 first:mt-0">
        {p?.nome ?? u.parte}
        {p?.escondido ? " · escondido" : ""}
      </p>
    ) : null;
    if (u.tipo === "imagem") {
      const d = destinoDa.get(u.imagem);
      const url = urls.get(u.caminho);
      return (
        <li key={u.id} className="min-w-0">
          {cabeca}
          <div className="flex items-center gap-3">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL do próprio navegador
              <img
                src={url}
                alt={u.descricao ?? ""}
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--bo-surface-sunken)] text-caption2 text-[var(--bo-text-muted)]">
                imagem
              </span>
            )}
            <span className="min-w-0 text-caption text-[var(--bo-text-muted)]">
              {d?.destino === "capa" ? (
                "→ Capa"
              ) : d?.destino === "moodboard" ? (
                `→ ${d.tema ?? "Inspiração"}`
              ) : d?.destino === "fora" ? (
                `Fica de fora${d.motivo ? ` (${d.motivo})` : ""}`
              ) : (
                <span className="text-[var(--bo-perigo)]">Sem destino</span>
              )}
              {u.legenda ? ` · «${u.legenda}»` : ""}
            </span>
          </div>
        </li>
      );
    }
    const texto = u.tipo === "paragrafo" ? u.texto : u.celulas.join("  |  ");
    const titulo =
      u.tipo === "paragrafo" && (u.papel === "titulo" || (u.nivel !== undefined && u.nivel <= 2));
    return (
      <li key={u.id} className="min-w-0">
        {cabeca}
        <p
          className={`whitespace-pre-line break-words text-footnote ${
            titulo ? "font-semibold text-[var(--bo-text)]" : "text-[var(--bo-tinta-72)]"
          } ${u.tipo === "paragrafo" && u.lista !== undefined ? "pl-4" : ""} ${
            fora && !fora.motivo && revisao.via !== "regras"
              ? "rounded-md bg-[var(--bo-perigo-lavagem)]/50 px-1.5 text-[var(--bo-perigo)]"
              : ""
          } ${u.tipo === "paragrafo" && (u.papel === "notas" || u.papel === "cabecalho" || u.papel === "rodape") ? "italic" : ""}`}
        >
          {u.tipo === "paragrafo" && u.lista !== undefined ? "• " : ""}
          {texto}
        </p>
        {fora?.motivo && revisao.via !== "regras" && (
          <p className="text-caption2 text-[var(--bo-text-muted)]">
            Fica nas notas internas: {fora.motivo}
          </p>
        )}
      </li>
    );
  };

  // O que VAI ser gravado, depois da escolha dela (a mesma função do `montarDocumento`).
  const gravar = correccoes
    ? valoresQueVaoSerGravados(proposta, correccoes)
    : {
        budgetAmounts: proposta.budgetAmounts,
        totalAmount: proposta.totalAmount,
        totalVatMode: proposta.totalVatMode,
      };
  // As linhas que se gravam, com as financeiras que ela pôs como serviço.
  const linhasDaProposta = correccoes ? comServicosPostos(proposta, correccoes) : proposta;
  // SÓ o que vai ser gravado: se ela apagou o total, aqui não aparece o do documento.
  const total = gravar.totalAmount;
  return (
    <section className="@container flex min-w-0 flex-col gap-4">
      <div
        role="status"
        className="rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-surface-sunken)] px-4 py-3 text-footnote text-[var(--bo-text)]"
      >
        <p className="font-semibold">{VIA[revisao.via]}</p>
        {revisao.porque && <p className="mt-0.5 text-[var(--bo-text-muted)]">{revisao.porque}</p>}
        {revisao.custo && (
          <p className="mt-0.5 text-[var(--bo-text-muted)]">
            Custo desta leitura: {revisao.custo.dolares.toFixed(2).replace(".", ",")} US$
            {revisao.tecto?.usadas != null
              ? ` · ${revisao.tecto.usadas} de ${revisao.tecto.maximo} leituras este mês`
              : ""}
          </p>
        )}
        {revisao.via === "regras" && !revisao.documentoGrandeDemais && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={descarregarPedido}
              className={`font-semibold text-[var(--bo-accent)] underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
            >
              Descarregar o pedido para o Claude
            </button>
            <label
              className={`cursor-pointer font-semibold text-[var(--bo-accent)] underline underline-offset-2 ${ESTADO}`}
            >
              Carregar a leitura (.json)
              <input
                type="file"
                accept=".json,application/json,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onLeitura(f);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="basis-full text-caption text-[var(--bo-text-muted)]">
              Sem custo: cola o pedido no Claude do teu plano, guarda a resposta como .json e
              carrega-a aqui. Passa pelas mesmas verificações.
            </span>
          </div>
        )}
      </div>

      {mostrarIva && onModoDoIva && (
        <EscolherOIva revisao={revisao} modo={modoDoIva ?? null} onModo={onModoDoIva} />
      )}

      {todosOsAvisos.length > 0 && (
        <div className="rounded-xl border border-[var(--bo-perigo)]/25 bg-[var(--bo-perigo-lavagem)]/50 px-4 py-3">
          <p className="text-footnote font-semibold text-[var(--bo-perigo)]">
            {todosOsAvisos.length === 1 ? "1 aviso" : `${todosOsAvisos.length} avisos`}
            {porConfirmar > 0
              ? ` · ${porConfirmar === 1 ? "falta confirmar 1 que mexe" : `faltam confirmar ${porConfirmar} que mexem`} em dinheiro`
              : ""}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {todosOsAvisos.map((a) => (
              <AvisoLinha key={a.id} a={a} confirmados={confirmados} onConfirmar={onConfirmar} />
            ))}
          </ul>
        </div>
      )}

      {revisao.avisosDaLeitura.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-footnote text-[var(--bo-text-muted)]">
          {revisao.avisosDaLeitura.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 @min-[44rem]:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-[var(--bo-hairline)] p-3">
          <h3 className="bo-eyebrow mb-2">No documento</h3>
          <ol className="flex max-h-[32rem] flex-col gap-1.5 overflow-y-auto pr-1">
            {revisao.documento.unidades.map(unidade)}
          </ol>
        </div>

        <div className="min-w-0 rounded-xl border border-[var(--bo-hairline)] p-3">
          <h3 className="bo-eyebrow mb-2">Na proposta nova</h3>
          <div className="flex max-h-[32rem] flex-col gap-4 overflow-y-auto pr-1 text-footnote">
            <div>
              <p className="font-semibold text-[var(--bo-text)]">
                {proposta.clientNames || "— sem nome —"}
              </p>
              <p className="text-[var(--bo-tinta-72)]">
                {[
                  proposta.eventType,
                  proposta.dataIso,
                  proposta.location,
                  proposta.guests ? `${proposta.guests} convidados` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "— sem dados do evento —"}
              </p>
              <AvisosDoCampo
                avisos={todosOsAvisos}
                prefixo="cliente"
                confirmados={confirmados}
                onConfirmar={onConfirmar}
              />
              <AvisosDoCampo
                avisos={todosOsAvisos}
                prefixo="evento"
                confirmados={confirmados}
                onConfirmar={onConfirmar}
              />
            </div>

            <div>
              <p className="bo-eyebrow mb-1">Serviços</p>
              {proposta.serviceGroups.length === 0 ? (
                <p className="text-[var(--bo-text-muted)]">Nenhum.</p>
              ) : (
                proposta.serviceGroups.map((g, gi) => (
                  <div key={gi} className="mb-2">
                    <p className="font-semibold text-[var(--bo-text)]">
                      {g.letter} {g.title}
                    </p>
                    <ul className="flex list-disc flex-col gap-0.5 pl-5">
                      {g.items.map((it, k) => (
                        <li
                          key={k}
                          className="whitespace-pre-line break-words text-[var(--bo-tinta-72)]"
                        >
                          <span className="font-medium text-[var(--bo-text)]">{it.label}</span>
                          {it.desc ? ` — ${it.desc}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
              <AvisosDoCampo
                avisos={todosOsAvisos}
                prefixo="servicos"
                confirmados={confirmados}
                onConfirmar={onConfirmar}
              />
            </div>

            <div>
              <p className="bo-eyebrow mb-1">Orçamento (valores sem IVA)</p>
              <ul className="flex flex-col divide-y divide-[var(--bo-hairline)]">
                {linhasDaProposta.budgetItems.map((item, k) => (
                  <li key={k} className="py-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words text-[var(--bo-text)]">
                        {item || "— sem descrição —"}
                        {linhasDaProposta.budgetOpcional?.[k] ? " (opcional)" : ""}
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--bo-tinta-72)]">
                        {gravar.budgetAmounts[k] != null
                          ? eur(gravar.budgetAmounts[k] as number)
                          : "—"}
                      </span>
                    </div>
                    <AvisosDoCampo
                      avisos={todosOsAvisos}
                      prefixo={`orcamento.linhas.${k}`}
                      confirmados={confirmados}
                      onConfirmar={onConfirmar}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-baseline justify-between gap-3 font-semibold text-[var(--bo-text)]">
                <span>Total</span>
                <span className="tabular-nums">
                  {total !== null
                    ? `${eur(total)}${gravar.totalVatMode === "acrescer" ? " + IVA" : gravar.totalVatMode === "incluido" ? " (IVA incluído)" : " (IVA por escolher)"}`
                    : "sem total"}
                </span>
              </p>
              {revisao.contas?.somaDasLinhas != null && (
                <p className="text-caption text-[var(--bo-text-muted)]">
                  As linhas do documento somam {eur(revisao.contas.somaDasLinhas)} · IVA a{" "}
                  {Math.round(revisao.contas.vatRate * 100)}%
                </p>
              )}
              <AvisosDoCampo
                avisos={todosOsAvisos}
                prefixo="orcamento.total"
                confirmados={confirmados}
                onConfirmar={onConfirmar}
              />
              <AvisosDoCampo
                avisos={todosOsAvisos}
                prefixo="orcamento.iva"
                confirmados={confirmados}
                onConfirmar={onConfirmar}
              />
            </div>

            <div>
              <p className="bo-eyebrow mb-1">Inspirações</p>
              {proposta.moodBoards.length === 0 && !proposta.capa ? (
                <p className="text-[var(--bo-text-muted)]">Nenhuma.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {proposta.capa && (
                    <li className="flex items-center gap-2">
                      {urls.get(proposta.capa) && (
                        // eslint-disable-next-line @next/next/no-img-element -- URL do próprio navegador
                        <img
                          src={urls.get(proposta.capa)}
                          alt="Capa"
                          className="h-10 w-10 rounded-md object-cover"
                        />
                      )}
                      <span className="text-[var(--bo-text)]">Capa</span>
                    </li>
                  )}
                  {proposta.moodBoards.map((m, k) => (
                    <li key={k} className="min-w-0">
                      <p className="text-[var(--bo-text)]">{m.title}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.images.map((c) =>
                          urls.get(c) ? (
                            // eslint-disable-next-line @next/next/no-img-element -- URL do próprio navegador
                            <img
                              key={c}
                              src={urls.get(c)}
                              alt=""
                              className="h-10 w-10 rounded-md object-cover"
                            />
                          ) : null,
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <AvisosDoCampo
                avisos={todosOsAvisos}
                prefixo="imagens"
                confirmados={confirmados}
                onConfirmar={onConfirmar}
              />
            </div>

            {proposta.notasInternas && (
              <div>
                <p className="bo-eyebrow mb-1">Notas internas (não saem no PDF)</p>
                <p className="whitespace-pre-line break-words text-[var(--bo-tinta-72)]">
                  {proposta.notasInternas}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
