"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import type { Quote, EventCategory } from "@/lib/orcamento/types";
import { useToast } from "./Toast";
import { Button, Field, FolhaOuDialogo } from "./ui";
import { porqueFalhou } from "@/lib/erro-do-servidor";
import CampoTelefone from "@/components/CampoTelefone";
import { carregarTelefones } from "@/lib/telefone-no-browser";
import { APARENCIA_DO_BACK_OFFICE, TELEFONE_SUBLINHADO } from "./ui/aparencia-do-telefone";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (q: Quote) => void;
  existingQuotes?: Quote[];
}

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  company: "",
  category: "" as EventCategory | "",
  eventType: "",
  date: "",
  guests: "",
  location: "",
  notes: "",
  referralSource: "Contacto direto",
};

export default function NewQuoteModal({ open, onClose, onCreated, existingQuotes }: Props) {
  const { toast } = useToast();
  const [f, setF] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof EMPTY, v: string) => setF((p) => ({ ...p, [k]: v }));
  const eventTypes = f.category ? (EVENT_TYPES_BY_CATEGORY[f.category as EventCategory] ?? []) : [];

  // Match the typed e-mail against existing quotes once per change, not per render.
  const email = f.email.trim().toLowerCase();
  const duplicates = useMemo(
    () => (email ? (existingQuotes ?? []).filter((q) => q.email.toLowerCase() === email) : []),
    [email, existingQuotes],
  );

  /**
   * Achado n.º 31 da auditoria: o «Criar pedido» ficava desligado até haver
   * nome, sem dizer porquê, e o Enter não fazia nada. Agora o botão está
   * sempre ligado, o Enter num campo cria, e sem nome a razão aparece no
   * próprio campo.
   */
  const [faltaNome, setFaltaNome] = useState(false);

  /**
   * ── O EMAIL E O TELEFONE TAMBÉM TÊM DE EXISTIR ─────────────────────────
   *
   * Ela (30/10): «não deixe enviar emails que não existem ou números de
   * telefone seja qual país for» — e em todo o lado. O telefone confere-se
   * aqui, com a bandeira (o mesmo `CampoTelefone` do site); o domínio do email
   * só o servidor sabe perguntar ao DNS, e a recusa dele vem com o `campo` e
   * aparece debaixo do campo certo, além do aviso.
   */
  const idTelefone = useId();
  const telefoneRef = useRef<HTMLInputElement>(null);
  const [mostrarErroDoTelefone, setMostrarErroDoTelefone] = useState(false);
  const [recusa, setRecusa] = useState<{ campo: "email" | "telefone"; texto: string } | null>(null);

  async function submit() {
    if (saving) return;
    if (!f.name.trim()) {
      setFaltaNome(true);
      return;
    }
    if (f.phone.trim()) {
      const regras = await carregarTelefones().catch(() => null);
      if (regras && !regras.normalizarTelefone(f.phone)) {
        setMostrarErroDoTelefone(true);
        telefoneRef.current?.focus();
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/orcamento/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          category: f.category || null,
          eventType: f.eventType || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.campo === "email" || data?.campo === "telefone") {
          setRecusa({ campo: data.campo, texto: String(data.error ?? "") });
        }
        throw new Error(data.error || "Erro");
      }
      toast("Pedido criado", "success");
      onCreated(data.quote);
      setF({ ...EMPTY });
      setMostrarErroDoTelefone(false);
      setRecusa(null);
      onClose();
    } catch (e) {
      // A mesma medição das Definições, feita aqui: com a ligação em baixo, o
      // aviso deste diálogo era «Failed to fetch». E vale para duas falhas, não
      // uma — o `res.json()` acima também lança quando o corpo não é JSON (um
      // 502 de um intermediário devolve HTML), e essa mensagem é igualmente do
      // browser e igualmente inglesa.
      toast(porqueFalhou(e, "Não foi possível criar o pedido. Verifica a ligação."), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FolhaOuDialogo
      aberto={open}
      onFechar={onClose}
      sobretitulo="Registo manual"
      titulo="Novo pedido"
      largura="md"
      // Era `z-[85]` à mão: acima dos avisos passageiros (80) e da gaveta do
      // pedido (50, e depois disto na árvore).
      nivel={85}
      accoes={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={saving}
            iconRight={<span aria-hidden="true">→</span>}
          >
            {saving ? "A criar…" : "Criar pedido"}
          </Button>
        </>
      }
    >
      {/* ── AS DUAS COLUNAS MEDEM A CAIXA, NÃO O ECRÃ ──────────────────────
          Eram `sm:grid-cols-2`/`sm:col-span-2`, e `sm:` pergunta pelo ECRÃ.
          Dentro de uma folha inferior o ecrã deixou de ser a pergunta certa:
          num tablet de 768 px o `sm:` disparava e punha dois campos lado a
          lado numa caixa que ali é a largura toda do aparelho, mas noutro
          sítio pode não ser. `@container` pergunta pela caixa — 26 rem é o
          mesmo limiar do `EventCosts` e do `PaymentsPanel`, para a casa não
          ficar com três números a dizer a mesma coisa.
          Os telemóveis todos ficam numa coluna: um iPhone Pro Max dá 388 px
          de caixa, abaixo dos 416 px do limiar. */}
      <div
        className="@container"
        // O Enter num campo de uma linha cria o pedido, como num formulário.
        // Numa caixa de várias linhas continua a ser uma linha nova.
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.nativeEvent.isComposing &&
            e.target instanceof HTMLInputElement &&
            e.target.type !== "checkbox"
          ) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-5 @min-[26rem]:grid-cols-2">
          {duplicates.length > 0 && (
            <div className="@min-[26rem]:col-span-2 flex items-start gap-3 rounded-xl border border-[var(--bo-aviso-tom)]/25 bg-[var(--bo-aviso-tom)]/[0.06] p-3.5">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a9781f"
                strokeWidth="1.9"
                strokeLinecap="round"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
              <div className="min-w-0">
                <p className="text-[var(--bo-aviso)] text-xs font-semibold mb-0.5">
                  Este e-mail já tem {duplicates.length} pedido{duplicates.length !== 1 ? "s" : ""}{" "}
                  registado{duplicates.length !== 1 ? "s" : ""}
                </p>
                <p className="text-foreground/50 text-[11px] leading-relaxed">
                  Podes continuar se for um evento diferente.
                </p>
              </div>
            </div>
          )}

          <Field
            variant="underline"
            containerClassName="@min-[26rem]:col-span-2"
            label="Nome"
            required
            value={f.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (e.target.value.trim()) setFaltaNome(false);
            }}
            error={
              faltaNome ? "Escreve o nome do cliente — é o único campo obrigatório." : undefined
            }
            placeholder="Nome do cliente"
            autoFocus
          />
          <Field
            variant="underline"
            label="E-mail"
            type="email"
            value={f.email}
            onChange={(e) => {
              set("email", e.target.value);
              if (recusa?.campo === "email") setRecusa(null);
            }}
            error={recusa?.campo === "email" ? recusa.texto : undefined}
            placeholder="email@exemplo.com"
          />
          {/* O telefone com a bandeira. O rótulo é o mesmo do `Field` (o
              `text-footnote` a 13 px), escrito à mão porque o controlo não é
              um `<input>` só. */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={idTelefone}
              className="text-footnote font-semibold text-[var(--bo-text-muted)]"
            >
              Telefone
            </label>
            <CampoTelefone
              id={idTelefone}
              inputRef={telefoneRef}
              value={f.phone}
              onChange={(v) => {
                set("phone", v);
                if (recusa?.campo === "telefone") setRecusa(null);
              }}
              mostrarErro={mostrarErroDoTelefone}
              erro={recusa?.campo === "telefone" ? recusa.texto : undefined}
              aparencia={APARENCIA_DO_BACK_OFFICE}
              classeDoBotao={TELEFONE_SUBLINHADO.botao}
              classeDoNumero={`${TELEFONE_SUBLINHADO.numero} ${
                recusa?.campo === "telefone" || mostrarErroDoTelefone
                  ? TELEFONE_SUBLINHADO.numeroComErro
                  : TELEFONE_SUBLINHADO.numeroBom
              }`}
              placeholder="912 345 678"
              locale="pt"
            />
          </div>
          <Field
            variant="underline"
            label="Empresa"
            value={f.company}
            onChange={(e) => set("company", e.target.value)}
          />
          <Field
            variant="underline"
            label="Como nos conheceu"
            value={f.referralSource}
            onChange={(e) => set("referralSource", e.target.value)}
          />
          <Field
            variant="underline"
            as="select"
            label="Categoria"
            value={f.category}
            onChange={(e) => {
              set("category", e.target.value);
              set("eventType", "");
            }}
          >
            <option value="">—</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Field>
          <Field
            variant="underline"
            as="select"
            label="Tipo de evento"
            value={f.eventType}
            onChange={(e) => set("eventType", e.target.value)}
            disabled={!eventTypes.length}
          >
            <option value="">—</option>
            {eventTypes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Field>
          <Field
            variant="underline"
            label="Data do evento"
            type="date"
            value={f.date}
            onChange={(e) => set("date", e.target.value)}
          />
          <Field
            variant="underline"
            label="Nº de convidados"
            type="number"
            min={0}
            value={f.guests}
            onChange={(e) => set("guests", e.target.value)}
          />
          <Field
            variant="underline"
            containerClassName="@min-[26rem]:col-span-2"
            label="Local"
            value={f.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Espaço / cidade"
          />
          <Field
            variant="underline"
            as="textarea"
            containerClassName="@min-[26rem]:col-span-2"
            label="Notas"
            rows={3}
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Detalhes da conversa, pedidos especiais…"
            className="resize-none"
          />
        </div>
      </div>
    </FolhaOuDialogo>
  );
}
