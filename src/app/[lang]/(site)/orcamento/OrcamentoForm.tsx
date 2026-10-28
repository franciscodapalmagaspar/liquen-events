"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { waHref } from "@/data";
import { useTranslations } from "@/components/LocaleProvider";
import { localizeHref } from "@/lib/i18n/config";
import type { Dict } from "@/lib/i18n";
import { PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";
import { track } from "@/lib/track";
import { LEAD_SOURCE_KEY } from "@/components/LeadSourceCapture";
import { lerClique, serializar } from "@/lib/ads/click-id";
import {
  QUOTE_EVENT_OPTIONS,
  GUEST_RANGES,
  CEREMONY_TYPES,
  SPACE_TYPES,
  COORDENACAO_DO_DIA,
} from "@/lib/orcamento/data";
import { PONTOS_DECORACAO } from "@/lib/orcamento/decoracao";
// O identificador de idempotência vive num módulo partilhado: os formulários
// curtos dos anúncios usam exactamente o mesmo, e duas cópias da mesma regra é
// como se acaba com duas regras diferentes.
import { clearSubmissionId, ensureSubmissionId } from "@/lib/orcamento/submission-id";
import { assentarComMola } from "@/lib/motion/assentar";
import CalendarioDaData from "./CalendarioDaData";
import { normalizarTelefone, sugestaoDeEmail } from "@/lib/contacto-do-pedido";

/**
 * Pedido de orçamento — formulário simples e direto.
 *
 * Substitui o antigo wizard com calculadora de preços por um pedido limpo:
 * tipo de evento, data, nº de pessoas e mensagem (+ contacto, indispensável
 * para responder). Submete para o mesmo endpoint `/api/orcamento` (email +
 * dashboard + push) — sem alterações no backend. O tipo escolhido é mapeado
 * para a taxonomia existente para que o email e o back-office mostrem rótulos
 * corretos; "Outro" viaja apenas como `eventName`.
 */

// Local draft so a visitor who navigates away and returns doesn't lose what
// they typed. Stored in sessionStorage (tab-scoped) so this personal data is
// gone when the tab closes — no lingering contact details on a shared/public
// device; also cleared on a successful send.
const DRAFT_KEY = "liquen-orcamento-draft";

// A stable id for THIS enquiry, so a retried submit (lost response → resubmit,
// even across a reload) is deduplicated server-side into one lead + one email
// instead of two. It survives reloads (localStorage) and is regenerated only
// after a successful send.
// Read the first-touch acquisition source recorded by LeadSourceCapture on
// entry (empty for direct visits or when sessionStorage is unavailable).
function readLeadSource(): string {
  try {
    return sessionStorage.getItem(LEAD_SOURCE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Identificador do clique pago guardado à entrada, na forma compacta. */
function lerAdClick(): string {
  const c = lerClique();
  return c ? serializar(c) : "";
}

/**
 * O dia de hoje NO FUSO DE QUEM PREENCHE.
 *
 * `new Date().toISOString()` é sempre UTC, e o dia que sai de lá não é o dia
 * que está no relógio dela. Em Lisboa, no Verão, entre a meia-noite e a 01:00
 * dava ONTEM, e o `min` do campo passava a deixar escolher um dia já passado.
 * A oeste de Greenwich era pior ao contrário: ao fim da tarde dava AMANHÃ, e o
 * dia que ela via no calendário do telemóvel era recusado pelo `okData` — um
 * beco sem saída, com uma mensagem a mandá-la indicar a data que ela tinha
 * acabado de indicar.
 */
function hojeNoFusoDela(agora: Date = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/**
 * O e-mail, exactamente como o servidor o lê.
 *
 * Isto é a expressão do `z.email()` do zod, que é o que valida o campo em
 * `quoteFormSchema` (src/lib/validation.ts). Está aqui copiada e não importada
 * de propósito: importar `@/lib/validation` traria o zod inteiro para o pacote
 * desta página, que é a página que converte.
 *
 * O teste `OrcamentoForm.test.tsx` põe os dois lado a lado sobre a mesma lista
 * de endereços — é ele o fio que os mantém a dizer a mesma coisa se um deles
 * um dia mudar. O que estava antes (`/\S+@\S+\.\S+/`) era mais frouxo do que o
 * servidor: `ana@exemplo.p` ficava com a linha verde de campo válido e só
 * morria depois do envio, num aviso ao fundo da página que não diz qual o
 * campo — com o campo do e-mail, ali em cima, ainda a dizer que estava bem.
 */
const EMAIL_RE =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/**
 * O tecto do que o servidor grava em `notes` (`quoteFormSchema`, em
 * src/lib/validation.ts). Repetido aqui, e não importado, pela mesma razão que
 * a expressão do e-mail: o zod não tem que vir parar ao browser.
 */
const MAX_NOTAS = 4000;

// Single source of truth, shared with the confirmation page so both resolve the
// same option index (and therefore the same localized label).
const EVENT_TYPES = QUOTE_EVENT_OPTIONS;

// Floating-label field wrapper. The control is passed as children (keeping all
// its own attrs/refs/aria); the label overlays it and floats up on focus/value
// via CSS (.ff / .ff-label in globals.css). `floatAlways` forces the floated
// state for the native date input, whose :placeholder-shown is unreliable.
function FloatingField({
  htmlFor,
  labelId,
  label,
  required,
  floatAlways,
  error,
  errorId,
  className,
  children,
}: {
  htmlFor: string;
  /** Para um controlo que se nomeia a si próprio com o rótulo (o calendário). */
  labelId?: string;
  label: string;
  required?: boolean;
  floatAlways?: boolean;
  error?: string;
  errorId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`ff group${floatAlways ? " ff--float" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
      <label id={labelId} htmlFor={htmlFor} className="ff-label font-normal">
        {label}
        {required && (
          <span aria-hidden className="text-gold-text">
            &nbsp;*
          </span>
        )}
      </label>
      {error && errorId && (
        <p id={errorId} role="alert" className="mt-2 text-[11px] tracking-wide text-gold-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** A legenda de uma secção do formulário. Ao nível do módulo (e já não dentro
 *  do componente) para que `EscolhaUnica`, aqui abaixo, use exactamente a mesma
 *  — duas legendas parecidas mas diferentes notam-se logo. */
const labelCls =
  "block text-[10.5px] font-medium text-foreground/70 tracking-[0.16em] uppercase mb-3 transition-colors duration-300 group-focus-within:text-moss-dark";

/**
 * Grupo de escolha ÚNICA e OPCIONAL, em pastilhas — o mesmo desenho das outras
 * do formulário (tipo de evento, pontos de decoração, ordem de grandeza).
 *
 * Duas decisões que valem a pena dizer em voz alta:
 *
 * · Carregar na opção já escolhida DESMARCA-A. São perguntas opcionais, e um
 *   grupo de rádios sem forma de voltar atrás obriga a recarregar a página só
 *   para tirar uma resposta dada por engano.
 *
 * · Por isso mesmo NÃO é um `radiogroup`: um rádio, para a tecnologia de apoio,
 *   é uma escolha entre alternativas que se percorre com as setas e da qual não
 *   se sai. Isto são botões de alternar independentes, cada um com o seu
 *   `aria-pressed`, dentro de um grupo com nome — que é o que estes botões
 *   realmente fazem.
 */
function EscolhaUnica({
  legendId,
  legend,
  hint,
  options,
  value,
  onChange,
  english,
  onStart,
}: {
  legendId: string;
  legend: string;
  hint?: string;
  options: { id: string; label: string; en: string }[];
  value: string;
  onChange: (id: string) => void;
  english: boolean;
  onStart: () => void;
}) {
  return (
    <fieldset className="group">
      <legend id={legendId} className={labelCls}>
        {legend}
      </legend>
      {hint && <p className="mt-2 mb-4 text-[12px] leading-relaxed text-foreground/70">{hint}</p>}
      <div
        role="group"
        aria-labelledby={legendId}
        className={`flex flex-wrap gap-3${hint ? "" : " mt-3"}`}
      >
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              onClick={(e) => {
                onStart();
                if (!active) assentarComMola(e.currentTarget);
                onChange(active ? "" : o.id);
              }}
              className={`px-4 py-2 pointer-coarse:min-h-11 rounded-full text-[10px] tracking-[0.12em] uppercase border transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.97] ${
                active
                  ? "bg-moss border-moss text-white shadow-sm shadow-moss/20"
                  : "border-foreground/12 text-foreground/70 hover:border-moss/40 hover:text-foreground/85"
              }`}
            >
              {english ? o.en : o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// `panelBlur` (the left-panel image's blur placeholder) is resolved on the
// SERVER page and passed in as a single string, so this client component never
// imports blurFor / blur-map.json — that ~107KB map used to bundle into this
// route just to place one decorative image's placeholder.
export default function OrcamentoForm({
  panelBlur,
  orcamento,
}: {
  panelBlur: string;
  orcamento: Dict["orcamento"];
}) {
  // locale + common come from the site-wide chrome context; the heavier
  // `orcamento` namespace is passed in from the /orcamento server page so it
  // doesn't ride the global LocaleProvider slice on every page.
  const { locale, t } = useTranslations();
  const to = orcamento;
  const router = useRouter();
  const [eventType, setEventType] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [data, setData] = useState("");
  const [dateFlexible, setDateFlexible] = useState(false);
  const [pessoas, setPessoas] = useState("");
  const [guestsFlexible, setGuestsFlexible] = useState(false);
  const [local, setLocal] = useState("");
  const [mensagem, setMensagem] = useState("");
  // Pontos de decoração — só existem no casamento, e são sempre OPCIONAIS.
  // Nunca entram na validação: quem não faz ideia do que quer segue em frente
  // sem marcar nada, que é exactamente o estado em que muita gente chega.
  const [decor, setDecor] = useState<string[]>([]);
  /** Os nomes dos noivos. Só existem no casamento, e só aparecem depois de ela
   *  começar a escrever o nome de contacto — pedi-los antes disso era abrir o
   *  formulário com quatro campos de nome à espera, que é o que faz desistir. */
  const [noivo, setNoivo] = useState("");
  const [noiva, setNoiva] = useState("");
  /**
   * A ordem de grandeza dos convidados, para quem marca «ainda a definir».
   *
   * Sem isto, «ainda a definir» dizia à equipa só que não havia número — e um
   * casamento de 40 pessoas e um de 300 não são o mesmo trabalho nem o mesmo
   * orçamento. Continua opcional: quem não faz mesmo ideia deixa em branco.
   */
  const [pessoasAprox, setPessoasAprox] = useState("");
  /**
   * O tipo de cerimónia (civil, religiosa, as duas, simbólica) e o tipo de
   * espaço (interior, exterior, os dois).
   *
   * Os dois são OPCIONAIS e desmarcáveis — voltar a carregar na mesma opção
   * limpa-a. Muita gente pede orçamento precisamente porque ainda não decidiu
   * isto, e um campo obrigatório aqui só serviria para receber uma resposta
   * inventada, que é pior do que uma resposta em branco: a proposta nasceria
   * desenhada para uma coisa que ninguém escolheu.
   *
   * A cerimónia só existe no casamento; o espaço aplica-se a todos os eventos.
   */
  const [cerimonia, setCerimonia] = useState("");
  const [espaco, setEspaco] = useState("");
  // A coordenação do dia: "sim" ou nada (pedido dela, 25/10).
  const [coordenacao, setCoordenacao] = useState("");
  const alternarDecor = (id: string) =>
    setDecor((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  const [website, setWebsite] = useState(""); // honeypot — fica vazio
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * A confirmação dos contactos está aberta: o formulário está pronto e falta
   * só ela dizer que o email e o telemóvel estão bem escritos. Ver o painel
   * «Confirme os seus contactos», junto do botão de enviar.
   */
  const [aConfirmar, setAConfirmar] = useState(false);
  const confirmarRef = useRef<HTMLHeadingElement | null>(null);
  /** Mexer no email ou no telemóvel com a confirmação aberta fecha-a: o que lá
   *  estava escrito deixou de ser o que vai seguir. */
  const mudarContacto = (mudar: (v: string) => void, valor: string) => {
    mudar(valor);
    setAConfirmar(false);
  };
  // Every field is required, so every field needs its own "has the visitor
  // been here yet" flag — errors must appear after leaving a field, never while
  // it's still being typed into for the first time.
  type Field = "nome" | "email" | "telefone" | "data" | "pessoas" | "local" | "mensagem";
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const markTouched = (f: Field) => setTouched((prev) => (prev[f] ? prev : { ...prev, [f]: true }));
  // Set once the user tries to submit an incomplete form — drives the visible,
  // announced error identification (WCAG 3.3.1) instead of a silent disabled button.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // Fire a single "QuoteStart" analytics event on the first interaction, so the
  // owner can measure form-start → submit (abandonment). No-ops without Plausible.
  const startedRef = useRef(false);
  const markStart = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      track("QuoteStart");
    }
  };
  // Refs for focus management on invalid submit + the event-type radiogroup.
  const nomeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dataRef = useRef<HTMLInputElement>(null);
  const dataBotaoRef = useRef<HTMLButtonElement>(null);
  const pessoasRef = useRef<HTMLInputElement>(null);
  const localRef = useRef<HTMLInputElement>(null);
  const telefoneRef = useRef<HTMLInputElement>(null);
  const mensagemRef = useRef<HTMLTextAreaElement>(null);
  // Data mínima = hoje (não faz sentido pedir orçamento para uma data passada).
  //
  // Calculada num EFEITO, e não no primeiro desenho: esta página é pré-gerada
  // no build, por isso o HTML servido levava a data em que o site foi
  // compilado. Na hidratação o cliente dizia outra, o React avisava da
  // divergência e — como faz com os atributos — ficava com a do servidor: um
  // `min` velho de semanas, que deixava escolher datas já passadas. Sem `min`
  // no primeiro desenho, portanto; o `okData` aqui abaixo prende a mesma regra
  // do lado do envio, que é o que conta.
  //
  // E é o dia DELA, não o de Greenwich — ver `hojeNoFusoDela` lá em cima.
  const [minDate, setMinDate] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinDate(hojeNoFusoDela());
  }, []);

  // O calendário da data: o nosso (ao estilo da Apple) com rato, o do sistema
  // com o dedo. Pedido dela, 28/10, com a captura do calendário do Chrome:
  // «quero melhorar isto para ficar ao estilo da apple». No telemóvel fica o
  // `<input type="date">`, que no iPhone abre a roda da própria Apple — e é
  // também o que vem no HTML pré-gerado, para o campo funcionar antes do
  // JavaScript e sem ele. Decide-se pelo ponteiro e não pela largura: um
  // portátil com ecrã táctil estreito continua a ter rato.
  const [calendarioProprio, setCalendarioProprio] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    if (!mq) return;
    const ver = () => setCalendarioProprio(mq.matches);
    ver();
    mq.addEventListener?.("change", ver);
    return () => mq.removeEventListener?.("change", ver);
  }, []);

  // Restaura o rascunho guardado (uma vez, após montar — evita mismatch de SSR).
  const firstSave = useRef(true);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const d = JSON.parse(saved) as Record<string, string>;
      // The draft lives in sessionStorage, so it is already gone when the tab
      // closes — the personal contact data can't linger on a shared/public
      // device. The 7-day stamp is kept as a secondary guard within a very
      // long-lived tab.
      const ts = Number(d._ts);
      if (ts && Date.now() - ts > 7 * 24 * 60 * 60 * 1000) {
        sessionStorage.removeItem(DRAFT_KEY);
        return;
      }
      if (d.eventType) setEventType(d.eventType);
      if (d.nome) setNome(d.nome);
      if (d.email) setEmail(d.email);
      if (d.telefone) setTelefone(d.telefone);
      if (d.data) setData(d.data);
      if (d.dateFlexible) setDateFlexible(d.dateFlexible === "1");
      if (d.guestsFlexible) setGuestsFlexible(d.guestsFlexible === "1");
      if (d.pessoas) setPessoas(d.pessoas);
      if (d.local) setLocal(d.local);
      if (d.mensagem) setMensagem(d.mensagem);
      if (d.decor) setDecor(d.decor.split(",").filter(Boolean));
      if (d.pessoasAprox) setPessoasAprox(d.pessoasAprox);
      if (d.cerimonia) setCerimonia(d.cerimonia);
      if (d.espaco) setEspaco(d.espaco);
      if (d.coordenacao) setCoordenacao(d.coordenacao);
      // Os nomes do casal são gravados como todos os outros: quem sai daqui
      // para ler a política de privacidade e volta não pode voltar a um
      // formulário que se lembra de tudo menos de quem se vai casar.
      if (d.noivo) setNoivo(d.noivo);
      if (d.noiva) setNoiva(d.noiva);
    } catch {
      /* localStorage indisponível — segue sem rascunho */
    }
  }, []);

  // Deep-link pre-selection: a service page can link to /orcamento?tipo=casamentos
  // so the visitor arrives with the event type already chosen instead of
  // re-picking what they just came from. Declared AFTER the draft restore so an
  // explicit link wins over a stale draft; unknown values are ignored. Reads
  // window.location directly (no useSearchParams) to avoid a CSR bailout.
  useEffect(() => {
    try {
      const tipo = new URLSearchParams(window.location.search).get("tipo");
      if (!tipo) return;
      const opt = EVENT_TYPES.find((o) => o.eventType === tipo);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (opt) setEventType(opt.label);
    } catch {
      /* sem query string acessível — segue sem pré-seleção */
    }
  }, []);

  // Grava o rascunho a cada alteração. Salta a 1ª execução para não escrever o
  // estado vazio inicial por cima de um rascunho ainda por restaurar acima.
  // Debounced (~500ms): keystrokes on the 9 fields no longer each trigger a
  // synchronous JSON.stringify + localStorage write on the main thread — only
  // the last change in a burst persists, keeping typing snappy (INP).
  //
  // The latest draft is mirrored into a ref every render so it can be flushed
  // SYNCHRONOUSLY when the page is being hidden/unloaded — otherwise a fast
  // navigate-away (or tab close) mid-debounce would drop the pending write and
  // lose the draft the user expects to survive the round-trip.
  const draftRef = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    draftRef.current = {
      eventType,
      nome,
      email,
      telefone,
      data,
      dateFlexible: dateFlexible ? "1" : "",
      guestsFlexible: guestsFlexible ? "1" : "",
      pessoas,
      local,
      mensagem,
      // Guardado como lista separada por vírgulas porque o rascunho inteiro é
      // um `Record<string, string>` — e os identificadores do catálogo não
      // têm vírgulas.
      decor: decor.join(","),
      pessoasAprox,
      cerimonia,
      espaco,
      coordenacao,
      noivo,
      noiva,
    };
  }, [
    eventType,
    nome,
    email,
    telefone,
    data,
    dateFlexible,
    pessoas,
    guestsFlexible,
    local,
    mensagem,
    decor,
    pessoasAprox,
    cerimonia,
    espaco,
    coordenacao,
    noivo,
    noiva,
  ]);
  // Once the quote is submitted the draft is intentionally cleared; block any
  // later lifecycle flush (the router.push unmount below) from resurrecting it.
  const submittedRef = useRef(false);
  const flushDraft = useCallback(() => {
    if (firstSave.current || submittedRef.current) return; // nothing to persist
    const d = draftRef.current;
    if (!d) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, _ts: Date.now() }));
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const timer = setTimeout(flushDraft, 500);
    return () => clearTimeout(timer);
  }, [
    eventType,
    nome,
    email,
    telefone,
    data,
    dateFlexible,
    pessoas,
    guestsFlexible,
    local,
    mensagem,
    decor,
    pessoasAprox,
    cerimonia,
    espaco,
    coordenacao,
    noivo,
    noiva,
    flushDraft,
  ]);

  // Persist immediately when the page is hidden or torn down (navigation, tab
  // close, bfcache). `visibilitychange → hidden` and `pagehide` are the only
  // reliably-fired lifecycle events for this; the effect cleanup covers the
  // client-side route change that unmounts the form before either fires.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushDraft();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushDraft);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushDraft);
      flushDraft();
    };
  }, [flushDraft]);

  // One predicate per field, so the error text, the focus target and the
  // submit gate can never disagree about what "valid" means.
  const okTipo = eventType !== "";
  // Os pontos de decoração são a linguagem do casamento — a cerimónia, o
  // cocktail, o seating plan. Num aniversário ou num corporativo não querem
  // dizer nada, por isso a secção nem chega a existir.
  const ehCasamento = EVENT_TYPES.find((o) => o.label === eventType)?.eventType === "casamentos";
  const okNome = nome.trim().length >= 2;
  /**
   * ── O CONTACTO: O EMAIL É OBRIGATÓRIO (decisão dela, 28/10) ─────────────
   *
   * Até aqui bastava o email ou o telemóvel. Chegou um pedido com o email mal
   * escrito e sem telemóvel: a confirmação não chegou a ninguém e não havia
   * por onde responder. Ela decidiu: «o email é obrigatório mas o telemóvel
   * não é» (as fichas rápidas dos anúncios ficam como estão).
   *
   * A regra é a MESMA do servidor (`quoteFormSchema` com `origem: "completo"`):
   *  - o email com a `EMAIL_RE` (a do zod) e, no servidor, o domínio a receber
   *    correio;
   *  - o telemóvel, quando vem, pela `normalizarTelefone`
   *    (src/lib/contacto-do-pedido.ts), que é partilhada — um número português
   *    de 9 dígitos, ou o indicativo do país à frente.
   */
  const temEmail = email.trim() !== "";
  const temTelefone = telefone.trim() !== "";
  const okEmail = temEmail && EMAIL_RE.test(email.trim());
  const okTelefone = !temTelefone || normalizarTelefone(telefone) !== null;
  /** «Quis dizer ana@gmail.com?», quando o domínio se parece com um conhecido. */
  const emailSugerido = okEmail ? sugestaoDeEmail(email) : null;
  // "Ainda a definir" IS an answer — the field is satisfied either way.
  // A data passada é recusada AQUI e não só pelo `min` do campo: o `min` é uma
  // sugestão que se contorna a escrever no teclado, e um pedido para o mês
  // passado não é um pedido. Enquanto `minDate` ainda não foi calculada (o
  // primeiro desenho, antes do efeito) não se rejeita nada — mais vale não
  // acusar do que acusar por engano.
  const okData = dateFlexible || (data !== "" && (!minDate || data >= minDate));
  // "Ainda a definir" IS an answer here too: a ordem de grandeza que ela pode
  // escolher a seguir fica OPCIONAL de propósito — quem não faz mesmo ideia
  // segue em frente, que é melhor do que inventar um número ou desistir.
  const okPessoas = guestsFlexible || Number(pessoas) > 0;
  const okLocal = local.trim().length >= 2;
  const okMensagem = mensagem.trim().length > 0;
  /**
   * Quanto cabe no campo da mensagem.
   *
   * O texto dela não viaja sozinho: as marcas de «ainda a definir» seguem
   * agarradas à frente, dentro do mesmo `notes` que o servidor limita. Sem
   * limite nenhum no campo, quem escrevia a página inteira que a proposta pede
   * — a cliente mais empenhada que há — carregava em Enviar e recebia de volta
   * um «Too big: expected string to have <=4000 characters», em inglês, sem
   * dizer qual o campo nem quanto sobrava.
   *
   * As duas marcas contam SEMPRE, mesmo desmarcadas: marcá-las depois de
   * escrever não encurta o que já está escrito.
   */
  const maxMensagem = useMemo(
    () =>
      MAX_NOTAS -
      [`(${to.dateFlexibleLabel})`, `(${to.labelPessoas}: ${to.guestsFlexibleLabel})`].reduce(
        // +2 pela linha em branco com que cada marca se separa da seguinte.
        (sobra, marca) => sobra + marca.length + 2,
        0,
      ),
    [to],
  );

  const show = (t: boolean | undefined) => Boolean(t) || attemptedSubmit;
  const nomeErr = show(touched.nome) && !okNome ? to.errNome : "";
  const emailErr = show(touched.email)
    ? !temEmail
      ? to.errEmailObrigatorio
      : !okEmail
        ? to.errEmail
        : ""
    : "";
  const telefoneErr = show(touched.telefone) && !okTelefone ? to.errTelefone : "";
  const dataErr = show(touched.data) && !okData ? to.errData : "";
  const pessoasErr = show(touched.pessoas) && !okPessoas ? to.errPessoas : "";
  const localErr = show(touched.local) && !okLocal ? to.errLocal : "";
  const mensagemErr = show(touched.mensagem) && !okMensagem ? to.errMensagem : "";
  const tipoErr = attemptedSubmit && !okTipo ? to.errTipo : "";
  const ready =
    okTipo && okNome && okEmail && okTelefone && okData && okPessoas && okLocal && okMensagem;

  // Ao abrir, o foco vai para o título do painel — quem usa leitor de ecrã
  // ouve logo o que se lhe pede; quem vê, vê o painel no sítio do botão.
  useEffect(() => {
    if (aConfirmar) confirmarRef.current?.focus();
  }, [aConfirmar]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Don't gate the submit on the honeypot here: if anything ever populates the
    // hidden `website` field, a bare `return` would make the button appear dead
    // with no feedback and lose a real lead. The field still rides the payload so
    // the SERVER can silently discard bots — that's the sole enforcement point.
    if (sending) return;
    // Incomplete: reveal + announce what's missing (the submit stays operable so
    // keyboard/AT users get a reason, not a silently disabled control).
    if (!ready) {
      setTouched({
        nome: true,
        email: true,
        telefone: true,
        data: true,
        pessoas: true,
        local: true,
        mensagem: true,
      });
      setAttemptedSubmit(true);
      // Move focus to the first invalid control, in the order the fields are
      // laid out, so the reason is discoverable rather than somewhere off
      // screen (WCAG 3.3.1 error identification + 2.4.3 focus order).
      const first: [boolean, { focus: () => void } | null][] = [
        [okTipo, radioRefs.current[0]],
        [okData, dataRef.current ?? dataBotaoRef.current],
        [okPessoas, pessoasRef.current],
        [okLocal, localRef.current],
        [okNome, nomeRef.current],
        [okEmail, emailRef.current],
        [okTelefone, telefoneRef.current],
        [okMensagem, mensagemRef.current],
      ];
      first.find(([ok]) => !ok)?.[1]?.focus();
      return;
    }
    // Pronto: antes de sair, mostra os contactos para os confirmar (ver
    // `aConfirmar`). O envio a sério é o botão «Está certo, enviar».
    if (!aConfirmar) {
      setAConfirmar(true);
      return;
    }
    await enviar();
  }

  async function enviar() {
    if (sending) return;
    setSending(true);
    setError(null);

    const opt = EVENT_TYPES.find((o) => o.label === eventType);
    const form = {
      name: nome.trim(),
      email: email.trim(),
      phone: telefone.trim(),
      // Liga, no servidor, a regra dos dois contactos e a verificação do
      // domínio do email (as fichas rápidas não mandam isto).
      origem: "completo" as const,
      // A língua em que preencheu: ganha ao cookie, que uma navegação directa
      // para /en pode não ter posto.
      idioma: locale.startsWith("en") ? ("en" as const) : ("pt" as const),
      category: opt?.category ?? null,
      eventType: opt?.eventType ?? null,
      /**
       * VAZIO, e de propósito. Aqui estava o rótulo da opção escolhida — e o
       * `eventName` é lido em todo o lado como sendo o nome que o CLIENTE deu
       * ao evento («Casamento da Ana e do João»), portanto era preferido ao
       * tipo e ia parar dentro de frases: «para o batizado / comunhão de 3 de
       * maio», «para o outro de 15 de maio». Sempre em português, mesmo para
       * quem leu a página em inglês, porque estes rótulos são os canónicos.
       *
       * A escolha viaja no `eventType`, que é um identificador estável e que
       * cada leitor traduz para a sua língua (ver `eventTypeName`, em
       * `orcamento/data.ts`). Este formulário nunca pergunta um nome, logo não
       * tem nenhum para enviar — e o «Outro» deixa de andar por aí a fingir
       * que é um.
       */
      eventName: "",
      date: dateFlexible ? "" : data,
      guests: guestsFlexible ? 0 : Number(pessoas) || 0,
      location: local.trim(),
      // Só viajam quando o pedido É um casamento. Sem esta guarda, marcar
      // pontos e depois mudar de ideias para "Aniversário" enviava uma
      // decoração de casamento agarrada a uma festa que não é uma — e a
      // proposta nascia semeada com o que ninguém pediu.
      decorPoints: opt?.eventType === "casamentos" ? decor : [],
      // Mesma guarda que os pontos de decoração: mudar de "Casamento" para
      // "Aniversário" depois de escrever os nomes não pode deixar um casal
      // agarrado a uma festa que não é um casamento.
      partnerA: opt?.eventType === "casamentos" ? noivo.trim() || undefined : undefined,
      partnerB: opt?.eventType === "casamentos" ? noiva.trim() || undefined : undefined,
      // A cerimónia é uma pergunta de casamento, e leva a mesma guarda que os
      // pontos e os nomes: escolher "religiosa" e depois mudar para
      // "Aniversário" não pode deixar uma cerimónia agarrada a uma festa que
      // não tem nenhuma.
      //
      // O espaço NÃO leva guarda nenhuma: interior ou exterior é uma pergunta
      // válida em todos os tipos de evento, e é a mesma pergunta em todos.
      ceremonyType: opt?.eventType === "casamentos" ? cerimonia : "",
      spaceType: espaco,
      // A coordenação do dia vale para qualquer evento, como o espaço.
      dayCoordination: coordenacao === "sim",
      // Só quando NÃO há número: os dois nunca convivem, e é o número que
      // manda. Enviar os dois deixava a equipa sem saber qual acreditar.
      guestsRange: guestsFlexible ? pessoasAprox : "",
      // Capture the "no fixed date yet" signal for the team (a high-value
      // early-stage lead segment) by folding it into the notes.
      notes: [
        dateFlexible ? `(${to.dateFlexibleLabel})` : "",
        guestsFlexible ? `(${to.labelPessoas}: ${to.guestsFlexibleLabel})` : "",
        mensagem.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
      // First-touch acquisition source (UTM/referrer), captured on entry by
      // LeadSourceCapture. Feeds the admin's conversion-by-source aggregation;
      // empty for direct visits.
      referralSource: readLeadSource(),
      // Identificador do clique pago, se esta pessoa veio de um anúncio. É o
      // que permite devolver à Google o valor real do casamento quando ele
      // fechar, em vez de ela optimizar para formulários preenchidos.
      adClick: lerAdClick(),
    };

    // Abort a hung request instead of spinning forever on a stalled connection
    // (3G that opens the socket but never responds). Without this the submit
    // button spins with no error and no recovery — the worst failure mode on
    // the site's primary conversion. maxDuration server-side is 30s.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O honeypot segue no payload para o servidor também poder descartar
        // bots que preencham o campo (a guarda no cliente é contornável).
        // submissionId torna o envio idempotente (reenvio após resposta perdida
        // = um só lead + um só email).
        body: JSON.stringify({ form, website, submissionId: ensureSubmissionId() }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      // ── A RESPOSTA DO SERVIDOR SAI AQUI, E NÃO PELO `catch` ────────────────
      //
      // Vinha por um `throw new Error(json?.error)`, e o `catch` mostrava
      // `e.message` de QUALQUER excepção que passasse por ali. A que passa por
      // ali quase sempre não é esta: é a do `fetch` a rejeitar quando a rede
      // cai — «Failed to fetch» no Chrome, «Load failed» no Safari. Era isso
      // que se lia, em inglês e em bruto, na página que paga a casa, no lugar
      // da única frase que diz que há um WhatsApp do outro lado.
      //
      // Separadas: a explicação do servidor (o 400 que diz «E-mail inválido»,
      // o 429 que diz para esperar um pouco) sai neste ramo, e o `catch` fica
      // só com o que ele sabe mesmo explicar — a rede.
      if (!res.ok || !json?.id) {
        const doServidor = typeof json?.error === "string" ? json.error.trim() : "";
        setError(doServidor || to.error);
        setSending(false);
        // Volta o botão de sempre: tentar outra vez volta a mostrar os
        // contactos para confirmar.
        setAConfirmar(false);
        // O servidor recusou o email (o domínio não recebe correio): volta ao
        // campo, que é onde se corrige.
        if (json?.campo === "email") emailRef.current?.focus();
        return;
      }

      track("QuoteSubmit", { tipo: opt?.eventType ?? eventType });

      // Hand-off para a página de confirmação (funciona em qualquer host).
      try {
        sessionStorage.setItem(
          `liquen-quote-${json.id}`,
          JSON.stringify({
            id: json.id,
            status: "pendente",
            submittedAt: new Date().toISOString(),
            ...form,
          }),
        );
      } catch {
        /* sessionStorage indisponível — a confirmação usa o fallback genérico */
      }
      // Pedido enviado: limpa o rascunho local para não reaparecer depois, e
      // trava o flush de ciclo de vida para o unmount da navegação não o repor.
      submittedRef.current = true;
      try {
        sessionStorage.removeItem(DRAFT_KEY);
        // Retire this enquiry's idempotency id so a genuinely NEW enquiry later
        // gets a fresh one (and doesn't dedup against the just-sent lead).
        clearSubmissionId();
      } catch {
        /* ignora */
      }
      router.push(localizeHref(`/orcamento/confirmacao/${json.id}`, locale));
    } catch {
      // Rede em baixo, DNS, proxy da empresa, ou o `abort` aos 25 s. O que o
      // browser atira aqui nunca foi escrito para ser lido por ninguém — a
      // frase do site é que diz o que fazer a seguir, e diz que há WhatsApp.
      setError(to.error);
      setSending(false);
      setAConfirmar(false);
    } finally {
      clearTimeout(timeout);
    }
  }

  // WhatsApp fallback message, composed from whatever the visitor has already
  // typed, so switching channel mid-form doesn't discard their context (the
  // team receives the details instead of an empty "Olá"). Recomputed each
  // render, so the link always reflects the current field state.
  function waMessage(): string {
    const idx = EVENT_TYPES.findIndex((o) => o.label === eventType);
    const tipoLabel = idx >= 0 ? (to.eventTypeLabels[idx] ?? eventType) : "";
    const lines = [t.common.whatsappPrefill];
    if (tipoLabel) lines.push(`${to.labelTipo}: ${tipoLabel}`);
    if (dateFlexible) lines.push(to.dateFlexibleLabel);
    else if (data) lines.push(`${to.labelData}: ${data}`);
    if (guestsFlexible) {
      const aprox = GUEST_RANGES.find((r) => r.id === pessoasAprox);
      lines.push(
        `${to.labelPessoas}: ${aprox ? `~${locale.startsWith("en") ? aprox.en : aprox.label}` : to.guestsFlexibleLabel}`,
      );
    } else if (pessoas) lines.push(`${to.labelPessoas}: ${pessoas}`);
    if (local.trim()) lines.push(`${to.labelLocal}: ${local.trim()}`);
    if (coordenacao === "sim") {
      const c = COORDENACAO_DO_DIA[0];
      if (c) lines.push(locale.startsWith("en") ? c.en : c.label);
    }
    if (nome.trim()) lines.push(`${to.labelNome}: ${nome.trim()}`);
    return lines.join("\n");
  }
  // Memoise the WhatsApp link so it isn't rebuilt + URL-encoded on every
  // keystroke (the link sits idle off to the side); only recompute when a field
  // that feeds it changes.
  const waLink = useMemo(
    () => waHref(waMessage()),
    // `pessoasAprox` entra na lista porque a mensagem o LÊ: sem ele, quem
    // marcava "ainda a definir" e escolhia a seguir a ordem de grandeza levava
    // para o WhatsApp um "Ainda a definir" que já não era verdade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      eventType,
      dateFlexible,
      data,
      pessoas,
      guestsFlexible,
      pessoasAprox,
      local,
      coordenacao,
      nome,
      to,
      t,
    ],
  );

  // Arrow-key navigation for the event-type radiogroup (WAI-ARIA radio pattern).
  const onRadioKey = (e: React.KeyboardEvent) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const cur = EVENT_TYPES.findIndex((o) => o.label === eventType);
    const from = cur === -1 ? 0 : cur;
    const next = (from + dir + EVENT_TYPES.length) % EVENT_TYPES.length;
    setEventType(EVENT_TYPES[next].label);
    radioRefs.current[next]?.focus();
  };

  // Floating-label input: `.ff-input` (globals.css) owns the vertical padding so
  // the label has room to float, and the placeholder colour is handled there
  // (hidden until focus). `field-line` draws the hairline moss underline in on
  // focus; border-b at /55 clears the 3:1 non-text-contrast floor (WCAG 1.4.11)
  // and focus switches it to solid moss.
  const ffInputCls =
    "ff-input field-line w-full bg-transparent border-b border-foreground/45 text-sm text-foreground focus:outline-none focus:border-moss";
  const hintCls = "mt-2 text-[11px] tracking-wide text-gold-text";

  // lg:pt-20 clears the tall at-rest navbar (≈164px logo lockup vs the global
  // main pt-24=96px), so the left image panel starts BELOW the header instead of
  // the logo sitting on top of the photo.
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] lg:pt-20">
      {/* ── Painel imagem (esquerda) ──
          Palavras dela, com três capturas a descer a página: «isto não está
          bom assim...». O painel esticava à altura da coluna do formulário
          (~1600 px a 1440), e o título «Conte-nos a sua ideia», encostado ao
          fundo dele, só aparecia quando se chegava ao botão de enviar — quem
          entrava via só árvores escuras ao lado de um formulário.

          Passa a ter a altura do ecrã e a ficar preso (`sticky`) enquanto o
          formulário desce. O `top` é a altura da barra do sítio já encolhida
          (76 px, `Navbar.tsx`), que é fixa e nunca se esconde; a altura é o
          ecrã menos essa barra, para o painel acabar no fundo do ecrã. O título
          deixa de estar no fundo e vai para o meio (`my-auto`): à chegada, com
          a barra ainda alta, o fundo do painel fica um pouco abaixo da dobra,
          e o título no meio fica à vista na mesma. */}
      <aside className="relative hidden lg:block overflow-hidden lg:sticky lg:top-[76px] lg:h-[calc(100svh-76px)] lg:self-start">
        <Image
          src="/imagens/DaniGui_JantarFesta_1.jpg"
          placeholder="blur"
          blurDataURL={panelBlur}
          alt={t.common.imageAlt.orcamentoPanel}
          fill
          sizes="(max-width: 1024px) 0vw, 45vw"
          quality={75}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/35 to-[#080808]/55" />
        <div className="absolute inset-0 flex flex-col p-12 xl:p-16">
          <Link
            href={localizeHref("/", locale)}
            // `alvo-toque`: MEDIDO a 375 px com toque emulado, 72×17 px — falha
            // a altura mínima por mais de metade. É o único caminho de volta
            // ao sítio a partir do painel de imagem num tablet de toque.
            className="alvo-toque pointer-fine:py-1 pointer-fine:-my-1 text-cream/70 text-[11px] tracking-[0.3em] uppercase hover:text-cream transition-colors inline-flex items-center gap-2 w-fit"
          >
            ← {to.back}
          </Link>
          <div className="my-auto">
            <p className="text-cream/70 text-[10px] tracking-[0.5em] uppercase mb-7 flex items-center gap-3">
              <span className="w-6 h-px bg-gold/60 flex-shrink-0" />
              {to.eyebrow}
            </p>
            {/* Decorative panel heading — the page's real <h1> lives in the
                form column (present at every breakpoint). aria-hidden so AT
                doesn't read the title twice on desktop. */}
            <p
              aria-hidden
              className="text-cream font-bold uppercase tracking-display leading-[0.92] mb-8"
              style={{ fontSize: "clamp(40px, 4vw, 68px)" }}
            >
              {to.titleLine1}
              <br />
              <span className="text-moss-light">{to.titleMoss}</span>
            </p>
            <p className="text-cream/75 text-sm leading-[1.8] max-w-xs">{to.lead}</p>
            <p className="mt-5 text-cream/55 text-[10px] tracking-[0.28em] uppercase">
              {to.processHint}
            </p>
          </div>
        </div>
      </aside>

      {/* ── Formulário (direita) ── */}
      {/* Not a <main>: the root layout already provides the page's single <main>
          landmark, so this stays a plain <div> to avoid a nested/duplicate one. */}
      <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-16 xl:px-24 py-16 lg:py-20">
        <div className="w-full max-w-xl mx-auto">
          {/* Back link — mobile only; the desktop panel has its own.
              `alvo-toque`: MEDIDO a 375 px com toque emulado, 72×17 px (65×17
              em inglês) — falha a altura mínima por mais de metade, e é o
              único caminho de volta ao sítio a partir do formulário no
              telemóvel. */}
          <Link
            href={localizeHref("/", locale)}
            className="alvo-toque lg:hidden text-foreground/68 text-[11px] tracking-[0.3em] uppercase hover:text-moss transition-colors inline-flex items-center gap-2 mb-8"
          >
            ← {to.back}
          </Link>
          {/* The page's single <h1>: visible + styled on mobile, sr-only on
              desktop (where the left panel shows the display title). Always in
              the a11y tree, so heading navigation works at every breakpoint. */}
          <h1
            className="lg:sr-only text-foreground font-bold uppercase tracking-display leading-[0.95] mb-6"
            style={{ fontSize: "clamp(34px, 9vw, 52px)" }}
          >
            {to.titleLine1} <span className="text-moss">{to.titleMoss}</span>
          </h1>

          <form
            onSubmit={submit}
            onFocusCapture={markStart}
            aria-busy={sending}
            noValidate
            className="orc-reveal flex flex-col gap-9"
          >
            {/* Required-fields key, before the fields so the '*' is explained
                first (WCAG 3.3.2 Labels or Instructions). */}
            <p className="text-foreground/68 text-[11px] leading-relaxed -mb-4">
              {to.requiredNote}
            </p>
            {/* Honeypot — a bot fills it, a human never sees it. The data-*ignore
                hints stop password managers (1Password / LastPass) from
                autofilling it, which was silently dropping real submissions. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            {/* Tipo de evento */}
            <fieldset className="group">
              {/* No per-field asterisk: with every field required it marked
                  nothing, and the note above the form says it once. */}
              <legend id="of-tipo-legend" className={labelCls}>
                {to.labelTipo}
              </legend>
              {/* A single-select toggle group is semantically a radiogroup —
                  aria-required/invalid on a <fieldset> aren't exposed by AT, so
                  the role + roving tabindex + arrow keys live here instead. */}
              <div
                role="radiogroup"
                aria-labelledby="of-tipo-legend"
                aria-required="true"
                aria-invalid={!!tipoErr}
                aria-describedby={tipoErr ? "of-tipo-err" : undefined}
                onKeyDown={onRadioKey}
                className="flex flex-wrap gap-3"
              >
                {EVENT_TYPES.map((o, i) => {
                  const active = eventType === o.label;
                  const focusable = eventType === "" ? i === 0 : active;
                  return (
                    <button
                      key={o.label}
                      type="button"
                      ref={(el) => {
                        radioRefs.current[i] = el;
                      }}
                      role="radio"
                      aria-checked={active}
                      tabIndex={focusable ? 0 : -1}
                      onClick={(e) => {
                        if (!active) assentarComMola(e.currentTarget);
                        setEventType(o.label);
                      }}
                      className={`px-4 py-2 pointer-coarse:min-h-11 rounded-full text-[10px] tracking-[0.12em] uppercase border transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.97] ${
                        active
                          ? "bg-moss border-moss text-white shadow-sm shadow-moss/20"
                          : "border-foreground/12 text-foreground/70 hover:border-moss/40 hover:text-foreground/85"
                      }`}
                    >
                      {to.eventTypeLabels[i] ?? o.label}
                    </button>
                  );
                })}
              </div>
              {tipoErr && (
                <p id="of-tipo-err" role="alert" className={hintCls}>
                  {tipoErr}
                </p>
              )}
            </fieldset>

            {/* Tipo de cerimónia — só no casamento, porque só aí existe uma.
                Vem ANTES dos pontos de decoração de propósito: é um facto sobre
                o dia (e sobre quantos sítios há para montar), e os pontos são o
                que o casal quer feito. Primeiro o que o dia é, depois o que
                querem nele. */}
            {ehCasamento && (
              <EscolhaUnica
                legendId="of-cerimonia-legend"
                legend={to.labelCerimonia}
                hint={to.hintCerimonia}
                options={CEREMONY_TYPES}
                value={cerimonia}
                onChange={setCerimonia}
                english={locale.startsWith("en")}
                onStart={markStart}
              />
            )}

            {/* Pontos de decoração — só no casamento.
                Sem preços de propósito: uma lista com valores ao lado
                transforma um pedido de casamento numa loja, e o preço destes
                pontos depende sempre do espaço, da paleta e do número de
                mesas. O que se pergunta aqui é ONDE querem decoração, não
                quanto estão dispostos a pagar. */}
            {ehCasamento && (
              <fieldset className="group">
                <legend id="of-decor-legend" className={labelCls}>
                  {to.labelDecor}
                </legend>
                <p className="mt-2 mb-4 text-[12px] leading-relaxed text-foreground/70">
                  {to.hintDecor}
                </p>
                <div
                  role="group"
                  aria-labelledby="of-decor-legend"
                  className="flex flex-wrap gap-3"
                >
                  {PONTOS_DECORACAO.map((p) => {
                    const active = decor.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={active}
                        onClick={(e) => {
                          markStart();
                          if (!active) assentarComMola(e.currentTarget);
                          alternarDecor(p.id);
                        }}
                        className={`px-4 py-2 pointer-coarse:min-h-11 rounded-full text-[10px] tracking-[0.12em] uppercase border transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.97] ${
                          active
                            ? "bg-moss border-moss text-white shadow-sm shadow-moss/20"
                            : "border-foreground/12 text-foreground/70 hover:border-moss/40 hover:text-foreground/85"
                        }`}
                      >
                        {locale.startsWith("en") ? p.en : p.pt}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Coordenação do dia — pedido dela, 25/10. Logo a seguir à
                decoração, porque é a outra metade do que a casa faz: a
                decoração diz ONDE, isto diz se também estamos lá no dia. Em
                TODOS os tipos de evento, e opcional. */}
            <EscolhaUnica
              legendId="of-coordenacao-legend"
              legend={to.labelCoordenacao}
              hint={to.hintCoordenacao}
              options={COORDENACAO_DO_DIA}
              value={coordenacao}
              onChange={setCoordenacao}
              english={locale.startsWith("en")}
              onStart={markStart}
            />

            {/* Data + Nº de pessoas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-9">
              <div>
                <FloatingField
                  htmlFor="of-data"
                  labelId="of-data-rotulo"
                  label={to.labelData}
                  floatAlways
                  error={dataErr}
                  errorId="of-data-err"
                >
                  {calendarioProprio ? (
                    <CalendarioDaData
                      id="of-data"
                      rotuloId="of-data-rotulo"
                      botaoRef={dataBotaoRef}
                      valor={data}
                      minimo={minDate}
                      desligado={dateFlexible}
                      descritoPor={dataErr ? "of-data-err" : undefined}
                      locale={locale.startsWith("en") ? "en-GB" : "pt-PT"}
                      textos={to.calendario}
                      aoMudar={setData}
                      aoFechar={() => markTouched("data")}
                      className={`${ffInputCls} ${dateFlexible ? "opacity-40" : ""}`}
                    />
                  ) : (
                    <input
                      id="of-data"
                      ref={dataRef}
                      type="date"
                      min={minDate || undefined}
                      value={data}
                      disabled={dateFlexible}
                      onBlur={() => markTouched("data")}
                      aria-invalid={dataErr ? true : undefined}
                      aria-describedby={dataErr ? "of-data-err" : undefined}
                      onChange={(e) => setData(e.target.value)}
                      className={`${ffInputCls} [color-scheme:light] ${dateFlexible ? "opacity-40" : ""}`}
                    />
                  )}
                </FloatingField>
                {/* `alvo-toque`: MEDIDO a 375 px com toque emulado, 132×29 px —
                    falha a altura mínima. É o rótulo, não a caixa de 16 px lá
                    dentro, que faz de alvo (mesmo mecanismo do back office). */}
                <label className="alvo-toque mt-2 inline-flex items-center gap-2.5 py-1.5 min-h-[24px] cursor-pointer text-foreground/68 hover:text-foreground/85 transition-colors">
                  <input
                    type="checkbox"
                    checked={dateFlexible}
                    onChange={(e) => {
                      setDateFlexible(e.target.checked);
                      markTouched("data");
                    }}
                    className="w-4 h-4 accent-moss cursor-pointer"
                  />
                  <span className="text-[11px] tracking-wide">{to.dateFlexibleLabel}</span>
                </label>
              </div>
              {/* Same escape hatch as the date: "how many" is often the last
                  thing a couple settles, and forcing a number would either lose
                  the lead or invite a made-up one — which is worse, because the
                  proposal would then be built on it. */}
              <div>
                <FloatingField
                  htmlFor="of-pessoas"
                  label={to.labelPessoas}
                  error={pessoasErr}
                  errorId="of-pessoas-err"
                >
                  <input
                    id="of-pessoas"
                    ref={pessoasRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={pessoas}
                    disabled={guestsFlexible}
                    onBlur={() => markTouched("pessoas")}
                    aria-invalid={pessoasErr ? true : undefined}
                    aria-describedby={pessoasErr ? "of-pessoas-err" : undefined}
                    onChange={(e) => setPessoas(e.target.value.replace(/[^0-9]/g, ""))}
                    className={`${ffInputCls} ${guestsFlexible ? "opacity-40" : ""}`}
                    placeholder={to.phPessoas}
                  />
                </FloatingField>
                {/* `alvo-toque`: MEDIDO a 375 px com toque emulado, 105×29 px —
                    mesma falha e mesma correcção do rótulo da data acima. */}
                <label className="alvo-toque mt-2 inline-flex items-center gap-2.5 py-1.5 min-h-[24px] cursor-pointer text-foreground/68 hover:text-foreground/85 transition-colors">
                  <input
                    type="checkbox"
                    checked={guestsFlexible}
                    onChange={(e) => {
                      setGuestsFlexible(e.target.checked);
                      markTouched("pessoas");
                    }}
                    className="w-4 h-4 accent-moss cursor-pointer"
                  />
                  <span className="text-[11px] tracking-wide">{to.guestsFlexibleLabel}</span>
                </label>
                {/* A ordem de grandeza. Só aparece depois de ela dizer que não
                    sabe o número — antes disso seria uma pergunta a mais num
                    formulário cuja força é ser curto. */}
                {guestsFlexible && (
                  <div className="mt-2">
                    <p className="mb-2 text-[11px] leading-relaxed text-foreground/70">
                      {to.hintPessoasAprox}
                    </p>
                    <div
                      role="group"
                      aria-label={to.hintPessoasAprox}
                      className="flex flex-wrap gap-2"
                    >
                      {GUEST_RANGES.map((r) => {
                        const active = pessoasAprox === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                              markStart();
                              // Voltar a carregar no mesmo desmarca: é uma
                              // estimativa opcional, e ter de recarregar a
                              // página para a tirar seria absurdo.
                              setPessoasAprox(active ? "" : r.id);
                            }}
                            className={`px-3 py-1.5 pointer-coarse:min-h-11 rounded-full text-[10px] tracking-[0.1em] uppercase border transition-[background-color,border-color,color] duration-200 ${
                              active
                                ? "bg-moss border-moss text-white"
                                : "border-foreground/12 text-foreground/70 hover:border-moss/40 hover:text-foreground/85"
                            }`}
                          >
                            {locale.startsWith("en") ? r.en : r.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Local / região */}
            <FloatingField
              htmlFor="of-local"
              label={to.labelLocal}
              error={localErr}
              errorId="of-local-err"
            >
              <input
                id="of-local"
                ref={localRef}
                type="text"
                autoComplete="address-level2"
                value={local}
                onBlur={() => markTouched("local")}
                aria-invalid={localErr ? true : undefined}
                aria-describedby={localErr ? "of-local-err" : undefined}
                onChange={(e) => setLocal(e.target.value)}
                className={ffInputCls}
                placeholder={to.phLocal}
              />
            </FloatingField>

            {/* Interior ou exterior — logo a seguir ao local, porque é a mesma
                pergunta continuada: onde é, e como é esse onde. Aparece em
                TODOS os tipos de evento; ao ar livre há sempre uma montagem
                alternativa a preparar, e isso conta-se em horas e em material
                antes de se contar em euros. */}
            <EscolhaUnica
              legendId="of-espaco-legend"
              legend={to.labelEspaco}
              hint={to.hintEspaco}
              options={SPACE_TYPES}
              value={espaco}
              onChange={setEspaco}
              english={locale.startsWith("en")}
              onStart={markStart}
            />

            {/* Nome + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-9">
              <FloatingField
                htmlFor="of-nome"
                label={to.labelNome}
                error={nomeErr}
                errorId="of-nome-err"
              >
                <input
                  id="of-nome"
                  ref={nomeRef}
                  type="text"
                  autoComplete="name"
                  aria-required="true"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onBlur={() => markTouched("nome")}
                  aria-invalid={!!nomeErr}
                  aria-describedby={nomeErr ? "of-nome-err" : undefined}
                  className={`${ffInputCls} ${
                    nomeErr ? "border-gold/60" : nome.trim().length >= 2 ? "border-moss/50" : ""
                  }`}
                  placeholder={to.phNome}
                />
              </FloatingField>
              {/* O email é obrigatório (decisão dela, 28/10). A dica por
                  baixo diz porque é que importa escrevê-lo bem; a sugestão
                  apanha o domínio mal escrito («gmial.com»). */}
              <div>
                <FloatingField
                  htmlFor="of-email"
                  label={to.labelEmail}
                  required
                  error={emailErr}
                  errorId="of-email-err"
                >
                  <input
                    id="of-email"
                    ref={emailRef}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => mudarContacto(setEmail, e.target.value)}
                    onBlur={() => markTouched("email")}
                    aria-required="true"
                    aria-invalid={!!emailErr}
                    aria-describedby={emailErr ? "of-email-err of-email-hint" : "of-email-hint"}
                    className={`${ffInputCls} ${
                      emailErr ? "border-gold/60" : temEmail && okEmail ? "border-moss/50" : ""
                    }`}
                    placeholder={to.phEmail}
                  />
                </FloatingField>
                <p
                  id="of-email-hint"
                  className="mt-2 text-[11px] leading-relaxed text-foreground/68"
                >
                  {to.hintEmail}
                </p>
                {emailSugerido && (
                  <p
                    role="status"
                    className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-foreground/78"
                  >
                    <span>
                      {to.sugestaoEmailPre}
                      <strong className="font-medium text-foreground">{emailSugerido}</strong>
                      {to.sugestaoEmailPos}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        mudarContacto(setEmail, emailSugerido);
                        emailRef.current?.focus();
                      }}
                      className="alvo-toque underline underline-offset-2 hover:text-moss transition-colors"
                    >
                      {to.sugestaoEmailUsar}
                    </button>
                  </p>
                )}
              </div>
            </div>

            {/* Nomes dos noivos — só no casamento, e só depois de ela começar a
                escrever o nome de contacto. São OPCIONAIS: quem chega ainda a
                sondar não tem de expor os dois nomes para pedir um orçamento,
                e travar o envio por causa disto perdia o contacto por uma
                coisa que se pergunta depois numa frase. */}
            {ehCasamento && nome.trim().length > 0 && (
              <div>
                <p className="mb-3 text-[11px] tracking-[0.14em] uppercase text-foreground/70">
                  {to.labelNoivos}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-9">
                  {/*
                    OS DOIS CAMPOS SÃO IGUAIS, e é isso que os torna certos.

                    Diziam "Nome do noivo" e "Nome da noiva". Para dois homens
                    ou duas mulheres, o formulário estava a dizer-lhes que não
                    contava com eles — logo no primeiro contacto.

                    Quem os distingue é o `aria-label`, não o que se vê: para
                    quem OUVE o formulário, dois campos "Nome" seguidos seriam
                    indistinguíveis, e é aí que a diferença faz falta.
                  */}
                  <FloatingField htmlFor="of-noivo" label={to.phNoivo}>
                    <input
                      id="of-noivo"
                      type="text"
                      autoComplete="off"
                      maxLength={80}
                      value={noivo}
                      onChange={(e) => setNoivo(e.target.value)}
                      className={ffInputCls}
                      placeholder={to.phNoivo}
                      aria-label={to.ariaNoivoA}
                    />
                  </FloatingField>
                  <FloatingField htmlFor="of-noiva" label={to.phNoiva}>
                    <input
                      id="of-noiva"
                      type="text"
                      autoComplete="off"
                      maxLength={80}
                      value={noiva}
                      onChange={(e) => setNoiva(e.target.value)}
                      className={ffInputCls}
                      placeholder={to.phNoiva}
                      aria-label={to.ariaNoivoB}
                    />
                  </FloatingField>
                </div>
                <p className="mt-2 text-[11px] text-foreground/70">{to.hintNoivos}</p>
              </div>
            )}

            {/* Telefone */}
            <FloatingField
              htmlFor="of-telefone"
              label={to.labelTelefone}
              error={telefoneErr}
              errorId="of-telefone-err"
            >
              <input
                id="of-telefone"
                ref={telefoneRef}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={telefone}
                onBlur={() => markTouched("telefone")}
                aria-invalid={telefoneErr ? true : undefined}
                aria-describedby={telefoneErr ? "of-telefone-err" : undefined}
                onChange={(e) => mudarContacto(setTelefone, e.target.value)}
                className={`${ffInputCls} ${
                  telefoneErr ? "border-gold/60" : temTelefone && okTelefone ? "border-moss/50" : ""
                }`}
                placeholder={to.phTelefone}
              />
            </FloatingField>

            {/* Mensagem — the field the proposal is actually built from.
                A quote can be priced from the date and the headcount; it can
                only be DESIGNED from what the client pictures. It used to be
                labelled "Mensagem" with no reason to fill it, so most arrived
                empty and every proposal started from a blank page. It now asks
                a question, says plainly what the answer buys, and is tall
                enough to look like somewhere to write — and required, like
                every other field, so no proposal ever starts from nothing. */}
            <div>
              <FloatingField
                htmlFor="of-mensagem"
                label={to.labelMensagem}
                error={mensagemErr}
                errorId="of-mensagem-err"
              >
                <textarea
                  id="of-mensagem"
                  ref={mensagemRef}
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  onBlur={() => markTouched("mensagem")}
                  rows={6}
                  maxLength={maxMensagem}
                  aria-invalid={mensagemErr ? true : undefined}
                  aria-describedby={
                    mensagemErr ? "of-mensagem-err of-mensagem-hint" : "of-mensagem-hint"
                  }
                  className={`${ffInputCls} resize-y min-h-[132px]`}
                  placeholder={to.phMensagem}
                />
              </FloatingField>
              <p
                id="of-mensagem-hint"
                className="mt-2.5 whitespace-pre-line text-left text-pretty sm:text-justify hyphens-auto text-[12px] leading-relaxed text-foreground/70"
              >
                {to.hintMensagem}
              </p>
            </div>

            {/* ── CONFIRME OS SEUS CONTACTOS ─────────────────────────────────
                Ela (28/10): o pedido que se perdeu tinha o email mal escrito
                ANTES do @ — nenhuma verificação o apanha, só os olhos de quem
                o escreveu. Por isso, antes de enviar, mostram-se os dois
                contactos em grande e pergunta-se se estão certos. Ocupa o
                lugar do botão de enviar (o envio a sério é o «Está certo»). */}
            {aConfirmar && !sending && (
              <section
                aria-labelledby="of-confirmar-titulo"
                className="border-l-2 border-moss/60 bg-moss/[0.05] px-5 py-5 sm:px-6"
              >
                <h3
                  id="of-confirmar-titulo"
                  ref={confirmarRef}
                  tabIndex={-1}
                  className="text-[11px] tracking-[0.18em] uppercase text-foreground/78 outline-none"
                >
                  {to.confirmarTitulo}
                </h3>
                <dl className="mt-4 grid gap-3">
                  <div>
                    <dt className="text-[11px] text-foreground/68">{to.confirmarEmail}</dt>
                    <dd className="mt-0.5 text-lg text-foreground [overflow-wrap:anywhere]">
                      {email.trim()}
                    </dd>
                  </div>
                  {temTelefone && (
                    <div>
                      <dt className="text-[11px] text-foreground/68">{to.confirmarTelefone}</dt>
                      <dd className="mt-0.5 text-lg text-foreground tabular-nums">
                        {telefone.trim()}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-4 max-w-md text-[12px] leading-relaxed text-foreground/78">
                  {to.confirmarTexto}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-4">
                  <button
                    type="button"
                    onClick={() => void enviar()}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    {to.confirmarEnviar} <span aria-hidden>→</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAConfirmar(false);
                      emailRef.current?.focus();
                    }}
                    className="alvo-toque pointer-fine:py-1 pointer-fine:-my-1 text-[11px] tracking-[0.22em] uppercase text-foreground/68 hover:text-moss transition-colors"
                  >
                    {to.confirmarCorrigir}
                  </button>
                </div>
              </section>
            )}

            {/* Ações */}
            <div
              className="flex flex-wrap items-center gap-x-7 gap-y-4 pt-1"
              hidden={aConfirmar && !sending}
            >
              {/* aria-disabled (not `disabled`) so activating it while sending
                  doesn't yank focus off the button to <body> — the handler
                  already no-ops on re-entry. */}
              <button
                type="submit"
                aria-disabled={sending}
                className={`${PRIMARY_BUTTON_CLASS} ${sending ? "opacity-30 cursor-wait" : ""}`}
              >
                {sending ? (
                  <>
                    <span
                      className="inline-block w-3.5 h-3.5 rounded-full border border-cream/30 border-t-cream animate-spin"
                      aria-hidden
                    />
                    {to.enviando}
                  </>
                ) : (
                  <>
                    {to.enviar} <span aria-hidden>→</span>
                  </>
                )}
              </button>
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("WhatsAppClick", { source: "form" })}
                // `alvo-toque`: MEDIDO a 375 px com toque emulado, 177×17 px
                // (164×17 em inglês) — falha a altura mínima por mais de
                // metade, ao lado do botão de enviar, a acção alternativa a
                // quem prefere WhatsApp.
                className="alvo-toque pointer-fine:py-1 pointer-fine:-my-1 inline-flex items-center gap-2.5 text-[11px] tracking-[0.22em] uppercase text-foreground/68 hover:text-moss transition-colors"
              >
                <WhatsAppIcon className="w-4 h-4 flex-shrink-0" />
                {to.ouWhatsApp}
                <span className="sr-only"> ({t.common.newWindow})</span>
              </a>
            </div>

            {/* Reassurance + privacy at the point of decision — the moment
                hesitation peaks. Reuses facts already shown up top. */}
            <p className="mt-6 text-[11px] leading-relaxed text-foreground/70 max-w-md">
              {to.submitReassure}
              <br />
              {to.privacyPre}
              <Link
                href={localizeHref("/privacidade", locale)}
                className="underline underline-offset-2 hover:text-foreground/80 transition-colors"
              >
                {to.privacyLinkLabel}
              </Link>
              {to.privacyPost}
            </p>

            {error && (
              // Failure state — deliberately NOT moss/green (that's the brand's
              // success colour). Uses the same gold as the field-level errors so
              // "something went wrong" reads as a problem, not a confirmation.
              <div
                role="alert"
                className="flex items-start gap-3 p-4 border-l-2 border-gold bg-gold/[0.06] rounded-sm"
              >
                <span aria-hidden className="text-gold-text text-base leading-none mt-px">
                  !
                </span>
                <p className="text-gold-text text-sm">{error}</p>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
