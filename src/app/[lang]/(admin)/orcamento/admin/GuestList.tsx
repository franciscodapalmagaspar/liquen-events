"use client";

import { useMemo, useRef, useState } from "react";
import { randomId } from "./util";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { metaFor, tintaDoRotulo } from "./status-meta";
import { downloadCsv, guestsToCsvRows, printGuestList, dateStamp } from "./export";
import type { Quote, Guest, RsvpStatus } from "@/lib/orcamento/types";
import { Button, Escolha, Field } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

const RSVP_META: Record<RsvpStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "#8a8a82" },
  confirmado: { label: "Confirmado", color: "#4c6752" },
  recusado: { label: "Recusado", color: "#8a2a22" },
};

interface Props {
  quote: Quote;
  onChange: (guestList: Guest[]) => void;
}

/**
 * Event RSVP / guest list. Each entry is a person or party (`party` = headcount
 * for that entry), so the confirmed headcount is the sum of confirmed parties —
 * shown against the estimate the client gave (quote.guests) so the team can see
 * at a glance how the numbers are firming up.
 */
export default function GuestList({ quote, onChange }: Props) {
  const { toast } = useToast();
  const anular = useAnular();
  const [guests, setGuests] = useState<Guest[]>(quote.guestList ?? []);
  const [name, setName] = useState("");
  const [party, setParty] = useState("1");
  const [note, setNote] = useState("");

  const totals = useMemo(() => {
    let confirmed = 0;
    let pending = 0;
    let declined = 0;
    for (const g of guests) {
      const n = g.party || 1;
      // Só "recusado" conta como recusa. Um valor que este ecrã não conheça cai
      // em "Pendente" — que é o que ele é, uma resposta por apurar — e não em
      // "Recusados", que seria afirmar uma recusa que ninguém deu.
      if (g.rsvp === "confirmado") confirmed += n;
      else if (g.rsvp === "recusado") declined += n;
      else pending += n;
    }
    return { confirmed, pending, declined };
  }, [guests]);

  /**
   * Otimista com reversão — mas a reversão é para o último estado que o SERVIDOR
   * confirmou, e só quando não há gravação mais recente.
   *
   * Guardar `guests` antes do pedido e repô-lo no erro era guardar um instante
   * que já passou. Marcar duas famílias de seguida põe dois PATCH no ar; o
   * segundo leva a lista INTEIRA (já com a primeira alteração dentro), portanto
   * quando o servidor o aceita fica com as duas. A primeira, ao falhar, repunha
   * o mundo anterior às DUAS e apagava do ecrã — e do `onChange`, e por isso da
   * gravação seguinte — uma confirmação que estava gravada.
   */
  const gravacoes = useRef(0);
  const gravado = useRef<Guest[]>(quote.guestList ?? []);
  /**
   * A versão de que esta lista partiu — como nas outras listas da gaveta. Não
   * ia nenhuma, e por isso o servidor (que protege `guestList` com 409) nunca
   * podia recusar: duas pessoas a mexer na mesma lista pisavam-se sem aviso.
   * Avança ao ENVIAR, pela mesma razão das outras.
   */
  const base = useRef<Guest[]>(quote.guestList ?? []);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ QUE FAMÍLIA
   * ══════════════════════════════════════════════════════════════════════
   *
   * Todas as alterações desta lista — acrescentar, remover, mudar o RSVP,
   * corrigir o número de pessoas — falhavam com «Não foi possível guardar a
   * lista de convidados. Tenta novamente.». A mesma frase para a rede em
   * baixo, a sessão expirada e o servidor em baixo, e num ecrã em que a
   * alteração que se perdeu é sempre a de UMA família.
   *
   * Ao contrário do `gravar` dos outros ecrãs, este DEVOLVE a frase em vez de
   * a dizer: aqui há gravações que ficam para trás (ver o `persist`), e essas
   * não têm nada a dizer a ninguém — o aviso delas seria sobre trabalho que a
   * gravação seguinte já leva lá dentro.
   */
  async function gravar(
    oQue: string,
    next: Guest[],
    baseAnterior: Guest[],
  ): Promise<{ ok: boolean; aviso: string; doServidor?: Guest[] }> {
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestList: next, base: { guestList: baseAnterior } }),
      });
    } catch {
      return { ok: false, aviso: porqueRebentou(oQue).mensagem };
    }
    const corpo = await res.json().catch(() => null);
    if (res.status === 409) {
      const doServidor =
        (corpo as { current?: { guestList?: Guest[] } } | null)?.current?.guestList ?? [];
      return {
        ok: false,
        aviso: "A lista de convidados foi alterada noutro sítio. Está aqui a versão guardada.",
        doServidor,
      };
    }
    if (!res.ok) return { ok: false, aviso: porqueFalhou(oQue, res, corpo).mensagem };
    return { ok: true, aviso: "" };
  }

  /** Devolve se ficou gravado — o «Anular» usa-o para não dizer «Anulado.» em falso. */
  async function persist(next: Guest[], oQue: string): Promise<boolean> {
    const minha = ++gravacoes.current;
    setGuests(next);
    onChange(next);
    const baseAnterior = base.current;
    base.current = next;
    const { ok, aviso, doServidor } = await gravar(oQue, next, baseAnterior);
    if (ok) {
      if (minha === gravacoes.current) gravado.current = next;
      return true;
    }
    // 409: adopta-se o que o servidor tem, e diz-se — não se repõe nada.
    if (doServidor) {
      gravado.current = doServidor;
      base.current = doServidor;
      if (minha === gravacoes.current) {
        setGuests(doServidor);
        onChange(doServidor);
      }
      toast(aviso, "error");
      return false;
    }
    // A base acompanha o que fica no ecrã: declarar uma versão que nunca
    // chegou a ser gravada dava um 409 inventado na gravação seguinte.
    base.current = gravado.current;
    // Já foi substituída por uma gravação mais recente: o que essa levar
    // contém o que esta levava, portanto não há nada a desfazer nem nada a
    // dizer. Se ELA também falhar, é ela que repõe — e para o mesmo sítio.
    if (minha !== gravacoes.current) return false;
    setGuests(gravado.current);
    onChange(gravado.current);
    toast(aviso, "error");
    return false;
  }

  function add() {
    const n = name.trim();
    if (!n) return;
    const trimmedNote = note.trim();
    const antes = guests;
    void persist(
      [
        ...guests,
        {
          id: randomId(),
          name: n,
          party: Math.max(1, parseInt(party) || 1),
          rsvp: "pendente",
          note: trimmedNote || undefined,
        },
      ],
      `acrescentar «${n}» à lista de convidados`,
    );
    anular(`«${n}» acrescentado à lista.`, () => persist(antes, `tirar «${n}» da lista`));
    setName("");
    setParty("1");
    setNote("");
  }
  function remove(id: string) {
    const g = guests.find((x) => x.id === id);
    const antes = guests;
    void persist(
      guests.filter((x) => x.id !== id),
      `remover «${g?.name ?? "convidado"}» da lista`,
    );
    // Remover não pergunta — anula-se, e a família volta ao sítio onde estava.
    anular(`«${g?.name ?? "O convidado"}» saiu da lista.`, () =>
      persist(antes, `repor «${g?.name ?? "o convidado"}» na lista`),
    );
  }
  // Estado do RSVP escolhido diretamente (um clique para qualquer estado), em vez
  // de ciclar tocando no badge (que ninguém adivinhava).
  function setRsvpOf(id: string, rsvp: RsvpStatus) {
    const g = guests.find((x) => x.id === id);
    persist(
      guests.map((x) => (x.id === id ? { ...x, rsvp } : x)),
      `marcar «${g?.name ?? "convidado"}» como ${metaFor(RSVP_META, rsvp).label.toLowerCase()}`,
    );
  }
  // Escrever no campo atualiza o número no ecrã de imediato (aceita vazio para se
  // poder reescrever); só grava (um PATCH) ao sair do campo, com o mínimo de 1.
  function setPartyOf(id: string, value: string) {
    const n = value === "" ? 0 : Math.max(0, parseInt(value) || 0);
    setGuests((prev) => prev.map((x) => (x.id === id ? { ...x, party: n } : x)));
  }
  function commitPartyOf(id: string) {
    const g = guests.find((x) => x.id === id);
    if (!g) return;
    const n = Math.max(1, g.party || 1);
    persist(
      guests.map((x) => (x.id === id ? { ...x, party: n } : x)),
      `guardar o número de pessoas de «${g.name}»`,
    );
  }

  const estimate = quote.guests || 0;

  return (
    // `@container` porque tudo o que se segue pergunta pela largura DESTE
    // painel: ele vive num cartão de zona do dossier, dentro de uma coluna, e
    // a 375 px de ecrã sobram-lhe 279 — os mesmos 279 que sobram num iPad a
    // 768, onde o `sm:` já disparou. É o que o `EventCosts` e o
    // `PaymentsPanel` ao lado já fazem.
    //
    // E o `pt-6` do separador eram 24 px de ar por cima do título a qualquer
    // largura. `--bo-p-vista` (12 → 24) é o token do respiro vertical de uma
    // vista, o mesmo que os painéis vizinhos passaram a ler.
    <section className="@container border-t border-[var(--bo-hairline-strong)] pt-[var(--bo-p-vista)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Lista de Convidados</p>
        {/* ── OS DOIS BOTÕES DE ÍCONE DESTA BARRA ──────────────────────────
            O `ui/Button` já dá os 44 px de ALTURA sob dedo
            (`pointer-coarse:h-11`), mas estes são só ícone e levam `px-2`
            para ficarem compactos — medidos a 375 px davam 39 px de LARGURA.
            Altura certa, largura curta: o alvo continuava por baixo do
            mínimo no eixo que ninguém tinha medido. `alvo-toque` trata do
            `min-width`, e os dois estão colados um ao outro (`gap-1`), que é
            o caso em que falhar a largura acerta no vizinho. */}
        {guests.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadCsv(`convidados-${quote.id}-${dateStamp()}`, guestsToCsvRows(quote))
              }
              title="Exportar convidados para CSV"
              aria-label="Exportar CSV"
              iconLeft={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              className="px-2 alvo-toque"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => printGuestList(quote)}
              title="Imprimir lista de convidados"
              aria-label="Imprimir"
              iconLeft={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="6" y="14" width="12" height="7" rx="1" />
                </svg>
              }
              className="px-2 alvo-toque"
            />
            <span className="ml-1 shrink-0 rounded-full bg-[var(--bo-tinta-6)] px-2.5 py-1 text-[11px] tabular-nums text-[var(--bo-text-muted)]">
              {guests.length} {guests.length === 1 ? "grupo" : "grupos"}
            </span>
          </div>
        )}
      </div>

      {/* Headcount summary */}
      {/* `sm:grid-cols-4` media a JANELA: num iPad a 768 px disparava e punha
          os quatro contadores a 62 px de célula dentro de um painel que
          continuava com 279 — e «Confirm.» já precisa de 60. O limiar passa a
          ser o do painel (26 rem, o mesmo dos quadrados de dinheiro dos
          painéis vizinhos), onde as quatro colunas têm 90 px cada. */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 @min-[26rem]:grid-cols-4">
        <div className="rounded-xl bg-[var(--bo-tinta-6)] p-3 text-center">
          <p className="text-base font-semibold text-sage-600">{totals.confirmed}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Confirm.
          </p>
        </div>
        <div className="rounded-xl bg-[var(--bo-tinta-6)] p-3 text-center">
          <p className="text-base font-semibold text-[var(--bo-text-muted)]">{totals.pending}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Pendente
          </p>
        </div>
        <div className="rounded-xl bg-[var(--bo-tinta-6)] p-3 text-center">
          <p className="text-base font-semibold text-[var(--bo-perigo)]">{totals.declined}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Recusados
          </p>
        </div>
        <div className="rounded-xl bg-[var(--bo-tinta-6)] p-3 text-center">
          <p className="text-base font-semibold text-[var(--bo-text-muted)]">
            {totals.confirmed}
            <span className="font-normal text-foreground/40">/{estimate || "—"}</span>
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Estimativa
          </p>
        </div>
      </div>

      {/* Guests */}
      {guests.length > 0 ? (
        <ul className="mb-5 flex flex-col gap-1.5">
          {guests.map((g) => (
            <li
              key={g.id}
              className="group flex flex-wrap items-center gap-2.5 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--bo-text)]">{g.name}</p>
                {g.note && (
                  <p className="truncate text-[11px] text-foreground/40" title={g.note}>
                    {g.note}
                  </p>
                )}
              </div>
              <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-foreground/45">
                <input
                  type="number"
                  min={1}
                  value={g.party || ""}
                  onChange={(e) => setPartyOf(g.id, e.target.value)}
                  onBlur={() => commitPartyOf(g.id)}
                  className="bo-input w-14 px-1.5 py-1 text-center text-xs text-[var(--bo-tinta-72)]"
                  aria-label={`Convidados no grupo ${g.name}`}
                />
                convidados
              </label>
              <Escolha
                // `?? ""` porque um registo anterior ao campo nem sequer o tem:
                // um valor indefinido passava o campo a NÃO-controlado a meio
                // da vida do componente, e a partir daí ele deixava de reflectir
                // o que está gravado.
                valor={g.rsvp ?? ""}
                aoMudar={(v) => setRsvpOf(g.id, v as RsvpStatus)}
                aria-label={`Estado do RSVP de ${g.name}`}
                // ── E OS 16 px DO iOS PASSARAM A SER PEDIDOS, NÃO HERDADOS ──
                // Enquanto isto foi um `<select>`, os 16 px que impedem o Safari
                // de AMPLIAR a página ao focar vinham da regra
                // `@media (pointer: coarse) { select { font-size: 16px } }` do
                // `globals.css` — e a nota que aqui estava explicava porque é que
                // o `text-xs` era preciso para não lhe ganhar. No dedo isto
                // CONTINUA a ser um `<select>` (é a decisão do `ui/Escolha`),
                // portanto a regra continua a valer tal e qual; e no dia em que
                // deixar de ser, o `pointer-coarse:text-base` do próprio
                // `Escolha` faz o mesmo trabalho. O `text-xs` fica porque é ele
                // que dá a densidade com rato.
                containerClassName="w-[110px] shrink-0"
                className="px-2 py-1 text-xs font-medium"
                // `RSVP_META[g.rsvp].color` à bruta era `undefined.color` assim
                // que aparecesse um valor de fora — uma linha antiga, uma
                // migração, uma correcção feita à mão na base de dados. Num
                // componente de cliente isso não perde a linha: perde o back
                // office inteiro para o ecrã de erro.
                style={{ color: tintaDoRotulo(metaFor(RSVP_META, g.rsvp).color) }}
              >
                {/* Sem esta, um valor desconhecido não casava com opção
                    nenhuma e o campo mostrava "Pendente" — dizia uma coisa
                    enquanto o registo dizia outra. Assim vê-se o valor cru. */}
                {!(g.rsvp in RSVP_META) && <option value={g.rsvp ?? ""}>{g.rsvp || "—"}</option>}
                <option value="pendente">Pendente</option>
                <option value="confirmado">Confirmado</option>
                <option value="recusado">Recusado</option>
              </Escolha>
              {/* MEDIDO a 768×1024 com dedo (o iPad em retrato): 12 destes botões e
                    ZERO visíveis. 768 passa dos 640 do `sm:`, portanto `sm:opacity-0`
                    disparava — e sem rato não há como o revelar. A pergunta certa é sobre o
                    PONTEIRO, não sobre a largura: `com-rato:` (globals.css) esconde só onde
                    há mesmo rato, e a 375 e a 768 com dedo ficam os 12 visíveis.

                    Fica um ícone e não um menu «⋯»: com UMA acção por linha, o menu custa
                    os mesmos 44 px e cobra um toque a mais para chegar ao mesmo sítio. */}
              <button
                onClick={() => remove(g.id)}
                className={`alvo-toque shrink-0 rounded-md p-1 text-foreground/25 sem-rato:text-[var(--bo-text-muted)] opacity-100 com-rato:opacity-0 hover:text-[var(--bo-perigo)] com-rato:focus-visible:opacity-100 com-rato:group-hover:opacity-100 ${ESTADO} ${PRESSAO}`}
                aria-label={`Remover ${g.name}`}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 rounded-xl bg-[var(--bo-tinta-3)] px-4 py-6 text-center text-sm leading-relaxed text-foreground/50">
          Ainda sem convidados. Adiciona a primeira pessoa ou família abaixo — o número de
          confirmados atualiza-se sozinho.
        </p>
      )}

      {/* Add guest */}
      {/* ── QUEBRA QUANDO NÃO CABE, E NÃO QUANDO A JANELA MUDA ────────────
          `sm:flex-row` media a JANELA: num iPad a 768 px disparava e punha os
          três campos e o botão numa linha dentro de um painel de 279 px — o
          «Nome» ficava com 60 px e o botão saía da margem. Sem ponto de corte
          nenhum: `flex-wrap` com uma largura mínima por campo quebra só quando
          não cabe, seja qual for a largura da janela. A 279 px dá Nome numa
          linha, Nota noutra e «Convidados» ao lado do botão; a 550 dá a fila
          inteira que o computador sempre teve. É a receita do `ui/Toolbar.tsx`,
          que já estava certa. */}
      <div className="flex flex-wrap items-end gap-2">
        <Field
          as="input"
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nome (convidado ou família)"
          containerClassName="min-w-[10rem] flex-1"
        />
        <Field
          as="input"
          label="Nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Ex.: mesa 3, alergia, +1"
          containerClassName="min-w-[10rem] flex-1"
        />
        <Field
          as="input"
          type="number"
          min={1}
          label="Convidados"
          value={party}
          onChange={(e) => setParty(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="text-center"
          containerClassName="w-24 shrink-0"
        />
        <Button variant="primary" onClick={add} disabled={!name.trim()}>
          Adicionar
        </Button>
      </div>
    </section>
  );
}
