"use client";

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import type { Locale } from "@/lib/i18n/config";
import { useTranslationsSeHouver } from "@/components/LocaleProvider";
import {
  TEXTOS_DE_RECURSO,
  fraseDoTelefoneInvalido,
  telefonesJaCarregados,
  useTelefones,
  type Telefones,
  type TextosDoTelefone,
} from "@/lib/telefone-no-browser";

export { TEXTOS_DE_RECURSO, type TextosDoTelefone };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TELEFONE COM A BANDEIRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (30/10): «quero que o sistema detete e não deixe enviar […] números de
 * telefone seja qual país for». E escolheu como: a bandeira e o número, com
 * Portugal já escolhido, conferido com as regras do país escolhido — no site e
 * no back office.
 *
 * ── O QUE O CAMPO ENTREGA ──────────────────────────────────────────────────
 *
 * Um texto só, e que se explica sozinho:
 *
 *   · o número em E.164 (`+447911123456`) quando é válido;
 *   · senão, o que está escrito — com o indicativo à frente quando a bandeira
 *     não é a portuguesa (`+44 0791`), para o servidor, que assume Portugal
 *     sem «+», ler o número no país certo e recusá-lo pela razão certa.
 *
 * Assim o pai do campo guarda uma `string` como sempre guardou, e sabe se o
 * número é bom com `useEstadoDoTelefone(valor)` sem precisar de saber a
 * bandeira. E o servidor faz exactamente a mesma pergunta
 * (`normalizarTelefone`).
 *
 * ── O PESO ─────────────────────────────────────────────────────────────────
 *
 * As regras dos telefones (~150 KB) e as bandeiras (~180 KB) NÃO vêm com a
 * página. As regras chegam quando a pessoa toca no campo (ou quando ele já
 * abre com um número); as bandeiras, quando se abre a lista ou o país muda.
 * A de Portugal vem escrita aqui, porque é a que se vê ao abrir.
 *
 * As bandeiras são SVG, e não os emojis 🇵🇹: o Windows dela não tem bandeiras
 * na letra dos emojis e mostra «PT» em vez delas.
 *
 * ── A LISTA ────────────────────────────────────────────────────────────────
 *
 * Os oito países que mais aparecem nos pedidos vêm à frente, e o resto por
 * ordem alfabética, com os nomes na língua de quem lê (`Intl.DisplayNames`,
 * do próprio browser — nenhum dicionário de 245 nomes viaja na página). A
 * procura aceita o nome, o código («GB») ou o indicativo («44», «+44»).
 *
 * O desenho segue o padrão do APG para uma lista com procura: o botão abre, o
 * foco vai para a procura (`role="combobox"`), as setas mexem na opção activa
 * (`aria-activedescendant`), o Enter escolhe, o Escape fecha e devolve o foco
 * ao botão. O Enter e o Escape não saem daqui: um Enter na procura não pode
 * enviar o formulário, nem um Escape fechar o diálogo do back office por
 * baixo.
 */

/** Os mais usados nos pedidos, por esta ordem, no topo da lista. */
export const PAISES_FIXADOS = ["PT", "ES", "FR", "GB", "BR", "CH", "DE", "US"] as const;

/**
 * Os indicativos dos fixados, escritos à mão para a lista poder abrir antes de
 * as regras chegarem. São factos que não mudam (e o teste confere-os contra a
 * biblioteca).
 */
export const INDICATIVOS_FIXADOS: Record<(typeof PAISES_FIXADOS)[number], string> = {
  PT: "351",
  ES: "34",
  FR: "33",
  GB: "44",
  BR: "55",
  CH: "41",
  DE: "49",
  US: "1",
};

/** A bandeira de Portugal, a única que vem com a página (`country-flag-icons`, 3x2). */
const BANDEIRA_PT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="red" d="M0 0h513v342H0z"/><path fill="#060" d="M197 0v342H0V0z"/><circle fill="#FF0" cx="197.1" cy="171" r="64"/><path fill="red" d="M161.1 139v40c0 19.9 16.1 36 36 36s36-16.1 36-36v-40h-72z"/><path fill="#FFF" d="M197.1 191c-6.6 0-12-5.4-12-12v-16h24v16c0 6.6-5.3 12-12 12z"/></svg>';

type Bandeiras = Record<string, string>;
let bandeirasCarregadas: Bandeiras | null = null;
let aCarregarBandeiras: Promise<Bandeiras> | null = null;

function carregarBandeiras(): Promise<Bandeiras> {
  if (bandeirasCarregadas) return Promise.resolve(bandeirasCarregadas);
  aCarregarBandeiras ??= import("country-flag-icons/string/3x2").then(
    (m) => (bandeirasCarregadas = m as unknown as Bandeiras),
    (e) => {
      aCarregarBandeiras = null;
      throw e;
    },
  );
  return aCarregarBandeiras;
}

function srcDaBandeira(pais: string, bandeiras: Bandeiras | null): string | null {
  const svg = pais === "PT" ? BANDEIRA_PT : bandeiras?.[pais];
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
}

/** Começa por «+» ou «00» (com um parêntese antes, como «(+351)»)? */
const INTERNACIONAL = /^\s*\(?\s*(?:\+|00)/;

/** O sítio onde se pinta cada peça — um para o site, outro para o back office. */
export interface AparenciaDoTelefone {
  /** A linha com o botão e o número. */
  caixa: string;
  /** O botão da bandeira (o pai junta a borda e o enchimento do contexto). */
  botao: string;
  /**
   * A seta do botão. `vira` é a do `ui/Escolha` do back office (uma seta para
   * baixo que se vira ao abrir); `dupla` é a do botão de escolha da Apple
   * (`chevron.up.chevron.down`), que não se mexe: diz «isto escolhe-se», não
   * «isto está aberto».
   */
  seta: "vira" | "dupla";
  /** A caixa que se abre por baixo. */
  lista: string;
  /** A caixa à volta da procura (onde se senta a lupa). */
  procuraCaixa: string;
  /** A lupa, à esquerda, dentro da procura. */
  lupa: string;
  procura: string;
  opcoes: string;
  opcao: string;
  opcaoActiva: string;
  opcaoInactiva: string;
  indicativo: string;
  indicativoActivo: string;
  /** O ✓ do país escolhido, no lugar do negrito (o menu da Apple faz assim). */
  visto: string;
  vistoActivo: string;
  /** O fio entre os mais usados e o resto do mundo. */
  separador: string;
  semResultados: string;
  erro: string;
}

/**
 * O site, com o desenho de um menu da Apple (pedido dela, 30/10: «coloca em
 * design de apple», com a lista aberta à frente): um cartão de cantos
 * redondos que flutua com sombra, a procura numa pastilha cinzenta com a
 * lupa, linhas redondas com o realce suave do iOS, e o ✓ no país escolhido
 * em vez do negrito.
 *
 * As cores são os tokens de função do `globals.css` (`--bg-*`, `--fg-*`,
 * `--accent*`, `--shadow-overlay`) — nenhuma família nova. O texto de apoio é
 * `--fg-secondary` (5,9:1 sobre branco; 5,2:1 sobre `--bg-subtle`).
 *
 * Opaco e sem desfoque, de propósito: um `backdrop-filter` por cima de um
 * formulário que sobe é trabalho para a placa gráfica a cada fotograma, e o
 * pedido anterior dela foi o site fluido.
 */
export const APARENCIA_DO_SITE: AparenciaDoTelefone = {
  caixa: "relative flex items-end gap-3",
  /* O sublinhado de antes (31/10: ela pediu a página do orçamento «como
     estava antes do design da apple»). A pastilha da Apple ficou só nos
     formulários dos anúncios — ver `TELEFONE_APPLE` em lib/formulario-apple. */
  botao:
    "inline-flex shrink-0 cursor-pointer items-center gap-1.5 bg-transparent text-foreground transition-colors hover:border-moss focus:border-moss",
  seta: "vira",
  lista:
    "absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw_-_2rem)] origin-top-left " +
    "rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 " +
    "shadow-[var(--shadow-overlay)] motion-safe:animate-[fade-in_160ms_var(--ease-out)]",
  procuraCaixa: "relative mb-1.5",
  lupa: "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-secondary)]",
  procura:
    "w-full rounded-lg border-0 bg-[var(--bg-subtle)] py-2 pl-8 pr-3 text-base text-[var(--fg-primary)] " +
    "placeholder:text-[var(--fg-secondary)] focus:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-[var(--focus-ring)]/40 sm:text-sm",
  opcoes: "max-h-72 overflow-y-auto overscroll-contain",
  opcao:
    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm pointer-coarse:min-h-11",
  opcaoActiva: "bg-[var(--accent-subtle)] text-[var(--fg-primary)]",
  opcaoInactiva: "text-[var(--fg-primary)]",
  indicativo: "ml-auto pl-2 tabular-nums text-[var(--fg-secondary)]",
  indicativoActivo: "ml-auto pl-2 tabular-nums text-[var(--fg-secondary)]",
  visto: "text-[var(--accent)]",
  vistoActivo: "text-[var(--accent)]",
  separador:
    "relative mt-2 before:absolute before:inset-x-2.5 before:-top-1 before:h-px before:bg-[var(--border)]",
  semResultados: "px-2.5 py-3 text-sm text-[var(--fg-secondary)]",
  erro: "mt-2 text-[11px] tracking-wide text-gold-text",
};

type Campo = { pais: string; numero: string };

function separar(valor: string, tel: Telefones | null): Campo {
  const t = (valor ?? "").trim();
  if (!t) return { pais: "PT", numero: "" };
  return tel ? tel.separarTelefone(t) : { pais: "PT", numero: t };
}

function indicativo(pais: string, tel: Telefones | null): string {
  return (
    tel?.indicativoDe(pais) ?? INDICATIVOS_FIXADOS[pais as keyof typeof INDICATIVOS_FIXADOS] ?? ""
  );
}

/** O texto que o campo entrega — ver «O QUE O CAMPO ENTREGA», lá em cima. */
function valorDe(numero: string, pais: string, tel: Telefones | null): string {
  const t = numero.trim();
  if (!t) return "";
  const e164 = tel?.normalizarTelefone(t, pais);
  if (e164) return e164;
  if (INTERNACIONAL.test(t) || pais === "PT") return t;
  const codigo = indicativo(pais, tel);
  return codigo ? `+${codigo} ${t}` : t;
}

/** O nome do país na língua de quem lê; o código, se o browser não souber. */
function nomeDoPais(nomes: Intl.DisplayNames | null, pais: string): string {
  try {
    return nomes?.of(pais) ?? pais;
  } catch {
    return pais;
  }
}

/** Minúsculas e sem acentos, para «Suíça» se encontrar com «suica». */
function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface CampoTelefoneProps {
  /** O `id` do número — é para ele que aponta o `<label htmlFor>` de quem chama. */
  id: string;
  /** E.164 quando é válido; senão o que está escrito (ver lá em cima). */
  value: string;
  onChange: (valor: string) => void;
  onBlur?: () => void;
  /** Mostrar o erro já (a tentativa de enviar), sem esperar que saia do campo. */
  mostrarErro?: boolean;
  /** Um erro de fora (o do servidor), que toma o lugar do do campo. */
  erro?: string;
  aparencia?: AparenciaDoTelefone;
  /** As classes do número (a borda e o enchimento do contexto). */
  classeDoNumero?: string;
  /** A borda e o enchimento do botão, para alinhar com o número. */
  classeDoBotao?: string;
  placeholder?: string;
  /** Com `name`, o valor segue num `<input type="hidden">` (formulários com `FormData`). */
  name?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Só quando não há `<label>` à vista (a linha de edição dos fornecedores). */
  ariaLabel?: string;
  /** Outros ids a ler com o número (uma dica do pai). */
  describedBy?: string;
  required?: boolean;
  disabled?: boolean;
  textos?: TextosDoTelefone;
  locale?: Locale;
}

export default function CampoTelefone({
  id,
  value,
  onChange,
  onBlur,
  mostrarErro = false,
  erro,
  aparencia = APARENCIA_DO_SITE,
  classeDoNumero = "",
  classeDoBotao = "",
  placeholder,
  name,
  inputRef,
  ariaLabel,
  describedBy,
  required,
  disabled,
  textos: textosDados,
  locale: localeDado,
}: CampoTelefoneProps) {
  const contexto = useTranslationsSeHouver();
  const textos = textosDados ?? contexto?.t.common.campoTelefone ?? TEXTOS_DE_RECURSO;
  const locale = localeDado ?? contexto?.locale ?? "pt";

  // As regras só se pedem quando fazem falta: um número já escrito, ou o
  // primeiro toque no campo.
  const [quer, setQuer] = useState(() => (value ?? "").trim() !== "");
  const tel = useTelefones(quer);

  const [campo, setCampo] = useState<Campo>(() => separar(value, telefonesJaCarregados()));
  /** O último valor que ESTE campo entregou — o que volta igual não se relê. */
  const [entregue, setEntregue] = useState<string | null>(null);

  /* ── UM VALOR QUE MUDOU POR FORA ───────────────────────────────────────
     O rascunho reposto, a gaveta que abre outro pedido, o diálogo que se
     limpa depois de criar: o pai muda o valor e o campo parte-o de novo em
     bandeira e número. O que o próprio campo entregou não se relê — senão o
     «912 34» que ela está a escrever virava outra coisa a meio. E quando as
     regras chegam, o que veio de fora relê-se com elas (o E.164 gravado passa
     a «912 345 678» com a bandeira certa). Feito no desenho e não num efeito,
     que é o padrão do React para estado que segue uma propriedade. */
  const [lido, setLido] = useState<{ valor: string; tel: Telefones | null }>({
    valor: value,
    tel: telefonesJaCarregados(),
  });
  if (lido.valor !== value || lido.tel !== tel) {
    setLido({ valor: value, tel });
    if (value !== entregue) {
      setCampo(separar(value, tel));
      if ((value ?? "").trim() && !quer) setQuer(true);
    }
  }

  const [tocado, setTocado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [procura, setProcura] = useState("");
  const [activa, setActiva] = useState(0);
  const [bandeiras, setBandeiras] = useState<Bandeiras | null>(bandeirasCarregadas);

  const caixaRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const numeroRef = useRef<HTMLInputElement>(null);
  const procuraRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  // As bandeiras chegam quando são precisas: a lista aberta, ou um país que
  // não é Portugal (escolhido ou detectado num número colado).
  const precisaDeBandeiras = aberto || campo.pais !== "PT";
  useEffect(() => {
    if (!precisaDeBandeiras || bandeiras) return;
    let vivo = true;
    carregarBandeiras().then(
      (b) => vivo && setBandeiras(b),
      () => {
        /* sem bandeira, fica o código do país no lugar dela */
      },
    );
    return () => {
      vivo = false;
    };
  }, [precisaDeBandeiras, bandeiras]);

  /** Entrega o número ao pai, acertando a bandeira quando o número a diz. */
  function entregar(numero: string, pais: string, regras: Telefones | null) {
    let c: Campo = { pais, numero };
    if (regras && INTERNACIONAL.test(numero)) {
      const doNumero = regras.paisDoNumero(numero);
      if (doNumero) c = doNumero;
    }
    const v = valorDe(c.numero, c.pais, regras);
    // Num indicativo partilhado (o +1, o +44) é o número que diz o país: um
    // 416… escolhido com a bandeira dos EUA é de Toronto.
    if (regras && v.startsWith("+")) {
      const real = regras.paisDoE164(v);
      if (real && real !== c.pais && regras.indicativoDe(real) === regras.indicativoDe(c.pais)) {
        c = { ...c, pais: real };
      }
    }
    setCampo(c);
    setEntregue(v);
    if (v !== value) onChange(v);
  }

  /* As regras chegaram DEPOIS de ela ter escrito (o primeiro toque pede-as e
     os dedos são mais rápidos do que a rede): o que está escrito volta a ser
     entregue com elas — um «+44…» colado passa a ter a bandeira, e um número
     válido passa a E.164. */
  const [regrasAplicadas, setRegrasAplicadas] = useState(tel !== null);
  useEffect(() => {
    if (!tel || regrasAplicadas) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegrasAplicadas(true);
    if (campo.numero.trim() && value === entregue) entregar(campo.numero, campo.pais, tel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tel]);

  const nomes = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);

  const opcoes = useMemo(() => {
    const todos: { pais: string; indicativo: string }[] = tel
      ? tel.paisesComIndicativo()
      : PAISES_FIXADOS.map((pais) => ({ pais, indicativo: INDICATIVOS_FIXADOS[pais] }));
    const fixados = new Set<string>(PAISES_FIXADOS);
    const porPais = new Map(todos.map((t) => [t.pais, t]));
    const comNome = (t: { pais: string; indicativo: string }) => ({
      ...t,
      nome: nomeDoPais(nomes, t.pais),
    });
    const lista = [
      ...PAISES_FIXADOS.flatMap((p) => {
        const t = porPais.get(p);
        return t ? [comNome(t)] : [];
      }),
      ...todos
        .filter((t) => !fixados.has(t.pais))
        .map(comNome)
        .sort((a, b) => a.nome.localeCompare(b.nome, locale)),
    ];
    const q = semAcentos(procura.trim()).replace(/^\+/, "");
    if (!q) return lista;
    return lista.filter(
      (o) =>
        semAcentos(o.nome).includes(q) || o.pais.toLowerCase() === q || o.indicativo.startsWith(q),
    );
  }, [tel, nomes, procura, locale]);

  // A opção activa nunca aponta para fora da lista filtrada. `-1` quer dizer
  // «a escolhida»: é onde a lista abre, como um `<select>`.
  const activaSegura =
    activa < 0
      ? Math.max(
          0,
          opcoes.findIndex((o) => o.pais === campo.pais),
        )
      : Math.min(activa, Math.max(0, opcoes.length - 1));

  useEffect(() => {
    if (!aberto) return;
    procuraRef.current?.focus();
    const fora = (e: PointerEvent) => {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-i="${activaSegura}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [aberto, activaSegura]);

  function abrir() {
    if (disabled) return;
    setQuer(true);
    setProcura("");
    setActiva(-1);
    setAberto(true);
  }

  function fechar(devolverFoco: boolean) {
    setAberto(false);
    if (devolverFoco) botaoRef.current?.focus();
  }

  function escolher(pais: string) {
    setAberto(false);
    entregar(campo.numero, pais, tel);
    // Escolhida a bandeira, o que vem a seguir é escrever o número.
    numeroRef.current?.focus();
  }

  function teclaNaProcura(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setActiva(Math.min(Math.max(activaSegura + passo, 0), Math.max(0, opcoes.length - 1)));
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      const passo = e.key === "PageDown" ? 8 : -8;
      setActiva(Math.min(Math.max(activaSegura + passo, 0), Math.max(0, opcoes.length - 1)));
    } else if (e.key === "Enter") {
      // Nunca deixa o Enter chegar ao formulário (que enviava) nem ao
      // diálogo do back office (que criava o pedido).
      e.preventDefault();
      e.stopPropagation();
      const o = opcoes[activaSegura];
      if (o) escolher(o.pais);
    } else if (e.key === "Escape") {
      // Fecha a LISTA, e só ela — o diálogo por baixo fica aberto.
      e.preventDefault();
      e.stopPropagation();
      fechar(true);
    } else if (e.key === "Tab") {
      setAberto(false);
    }
  }

  function teclaNoBotao(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      abrir();
    }
  }

  const t = campo.numero.trim();
  const estado = !t
    ? "vazio"
    : !tel
      ? "a-verificar"
      : tel.normalizarTelefone(t, campo.pais)
        ? "valido"
        : "invalido";
  const codigo = indicativo(campo.pais, tel);
  const nomeDoPaisEscolhido = nomeDoPais(nomes, campo.pais);
  const erroDoCampo =
    (tocado || mostrarErro) && estado === "invalido"
      ? fraseDoTelefoneInvalido(textos.invalido, campo.pais, codigo, locale)
      : "";
  const erroVisivel = erro || erroDoCampo;
  const idDoErro = `${id}-erro`;
  const idDaLista = `${id}-paises`;
  const srcBandeira = srcDaBandeira(campo.pais, bandeiras);
  const descritoPor = [erroVisivel ? idDoErro : "", describedBy ?? ""].filter(Boolean).join(" ");

  // O pai recebe o número (para lhe levar o foco quando é o primeiro erro).
  useImperativeHandle(inputRef, () => numeroRef.current as HTMLInputElement, []);

  return (
    <div>
      <div ref={caixaRef} className={aparencia.caixa}>
        <button
          ref={botaoRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-controls={aberto ? idDaLista : undefined}
          // O nome lido COMEÇA pelo que se vê no botão (o «+351»): quem usa o
          // controlo por voz diz o que vê («carregar em mais trezentos e
          // cinquenta e um»), e o WCAG 2.5.3 pede que o nome o contenha. Antes
          // era «País do número: Portugal (+351)» — o axe (e o Lighthouse do
          // /orcamento, 96) apontava-o como `label-content-name-mismatch`.
          aria-label={`+${codigo}, ${nomeDoPaisEscolhido}. ${textos.pais}`}
          title={`${nomeDoPaisEscolhido} (+${codigo})`}
          onClick={() => (aberto ? fechar(false) : abrir())}
          onKeyDown={teclaNoBotao}
          onFocus={() => setQuer(true)}
          className={`${aparencia.botao} ${classeDoBotao}`}
        >
          {srcBandeira ? (
            // eslint-disable-next-line @next/next/no-img-element -- um SVG de 300 bytes num `data:`, sem nada para optimizar
            <img
              src={srcBandeira}
              alt=""
              width={20}
              height={14}
              className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.12)]"
            />
          ) : (
            <span aria-hidden="true" className="w-5 shrink-0 text-center text-[10px] font-medium">
              {campo.pais}
            </span>
          )}
          <span className="tabular-nums">+{codigo}</span>
          {aparencia.seta === "dupla" ? (
            <svg
              aria-hidden="true"
              width="8"
              height="12"
              viewBox="0 0 8 12"
              className="ml-0.5 shrink-0 text-[var(--fg-secondary)]"
            >
              <path
                d="M1.5 4.25 4 1.75l2.5 2.5M1.5 7.75 4 10.25l2.5-2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className={`shrink-0 opacity-60 transition-transform ${aberto ? "-scale-y-100" : ""}`}
            >
              <path
                d="M2 3.5 5 6.5 8 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        <input
          ref={numeroRef}
          id={id}
          type="tel"
          inputMode="tel"
          /* `tel` e não `tel-national`: o autopreenchimento de quem vive fora
             traz o número COM o indicativo («+44 7911 …»), e o campo muda a
             bandeira sozinho. Com `tel-national` vinha o número nacional e a
             bandeira portuguesa ao lado — um número certo recusado. */
          autoComplete="tel"
          value={campo.numero}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={erroVisivel ? true : undefined}
          aria-describedby={descritoPor || undefined}
          onFocus={() => setQuer(true)}
          onChange={(e) => entregar(e.target.value, campo.pais, tel)}
          onBlur={() => {
            setTocado(true);
            onBlur?.();
          }}
          className={`min-w-0 flex-1 ${classeDoNumero}`}
        />

        {aberto && (
          <div className={aparencia.lista}>
            <div className={aparencia.procuraCaixa}>
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                className={aparencia.lupa}
              >
                <circle
                  cx="6"
                  cy="6"
                  r="4.25"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="m9.25 9.25 3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={procuraRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={idDaLista}
                aria-autocomplete="list"
                aria-activedescendant={
                  opcoes[activaSegura] ? `${id}-pais-${opcoes[activaSegura].pais}` : undefined
                }
                aria-label={textos.procurar}
                placeholder={textos.procurar}
                autoComplete="off"
                spellCheck={false}
                value={procura}
                onChange={(e) => {
                  setProcura(e.target.value);
                  setActiva(0);
                }}
                onKeyDown={teclaNaProcura}
                className={aparencia.procura}
              />
            </div>
            <ul
              ref={listaRef}
              id={idDaLista}
              role="listbox"
              aria-label={textos.pais}
              className={aparencia.opcoes}
            >
              {opcoes.map((o, i) => {
                const src = srcDaBandeira(o.pais, bandeiras);
                const activaAqui = i === activaSegura;
                return (
                  <li
                    key={o.pais}
                    id={`${id}-pais-${o.pais}`}
                    data-i={i}
                    role="option"
                    aria-selected={o.pais === campo.pais}
                    // O foco fica na procura: carregar numa opção não o tira de lá.
                    onPointerDown={(e) => e.preventDefault()}
                    onPointerMove={() => activa !== i && setActiva(i)}
                    onClick={() => escolher(o.pais)}
                    className={`${aparencia.opcao} ${
                      activaAqui ? aparencia.opcaoActiva : aparencia.opcaoInactiva
                    } ${
                      // O fio entre os mais usados e o resto do mundo.
                      !procura && i === PAISES_FIXADOS.length ? aparencia.separador : ""
                    }`}
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ver o botão
                      <img
                        src={src}
                        alt=""
                        width={20}
                        height={14}
                        loading="lazy"
                        className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.12)]"
                      />
                    ) : (
                      <span aria-hidden="true" className="h-3.5 w-5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{o.nome}</span>
                    <span
                      className={activaAqui ? aparencia.indicativoActivo : aparencia.indicativo}
                    >
                      +{o.indicativo}
                    </span>
                    {/* O ✓ do escolhido, numa coluna fixa para os indicativos
                        ficarem alinhados (o `aria-selected` diz o mesmo ao
                        leitor de ecrã). */}
                    <span aria-hidden="true" className="flex w-4 shrink-0 justify-end">
                      {o.pais === campo.pais && (
                        <svg
                          data-visto=""
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          className={activaAqui ? aparencia.vistoActivo : aparencia.visto}
                        >
                          <path
                            d="M2.5 6.25 5 8.75l4.5-5.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {opcoes.length === 0 && (
              <p role="status" className={aparencia.semResultados}>
                {textos.semResultados}
              </p>
            )}
          </div>
        )}
      </div>

      {name && <input type="hidden" name={name} value={value} />}

      {erroVisivel && (
        <p id={idDoErro} role="alert" className={aparencia.erro}>
          {erroVisivel}
        </p>
      )}
    </div>
  );
}
