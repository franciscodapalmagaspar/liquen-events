"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { SkeletonList } from "./Skeleton";
import { Button, PerguntaDestrutiva } from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { ESTADO, MARCA, PRESSAO } from "./ui/movimento";
import { useMarcaQueAnda } from "./ui/useMarcaQueAnda";
import { RichEmailEditor, type RichEmailEditorHandle } from "./RichEmailEditor";
import EmailTemplatesBilingue from "./EmailTemplatesBilingue";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import {
  extractSimpleText,
  htmlToPlainText,
  insertToken,
  renderPreview,
  renderPreviewSubject,
} from "@/lib/email-template-format";
import {
  buildRichEmailHtml,
  docFromPlainText,
  emptyRichDoc,
  extractRichDoc,
  type RichDoc,
} from "@/lib/email-rich-format";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

/** Merge fields, each with a plain-language hint for the tooltip. */
const MERGE_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "nome", label: "Nome do cliente", hint: "insere o nome do cliente" },
  { key: "link", label: "Ligação", hint: "insere a ligação para a proposta" },
  { key: "valor", label: "Valor", hint: "insere o valor / montante" },
  { key: "data_evento", label: "Data do evento", hint: "insere a data do evento" },
  { key: "local", label: "Local", hint: "insere o local do evento" },
  { key: "empresa", label: "Empresa", hint: "insere o nome da empresa" },
];

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ECRÃ PROMETIA, E NÃO CUMPRIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estava escrito aqui, por baixo de cada modelo:
 *
 *   «Enviado ao cliente quando a proposta segue.»
 *   «Enviado quando o sinal é recebido e a reserva fica confirmada.»
 *   «Enviado na semana anterior ao evento.»
 *   «Enviado depois do evento, a agradecer ao cliente.»
 *
 * Nenhuma das quatro era verdade. O `renderTemplate` — a função que resolve os
 * `{marcadores}` no envio — não tinha um único chamador de produção: o email
 * que saía com a proposta era HTML escrito à mão dentro da rota, e os outros
 * três não saíam de lado nenhum. Ela escreveu estes textos a acreditar que
 * chegavam a clientes.
 *
 * A promessa nova é MENOR e é verdadeira, e cada linha diz duas coisas — se
 * sai sozinho, e por onde. Um modelo que se envie por um botão sem dizer onde
 * está o botão só troca uma frase falsa por uma frase inútil.
 *
 * ── PORQUE É QUE TRÊS DELES NÃO SÃO AUTOMÁTICOS ───────────────────────────
 *
 * Não é trabalho por acabar: é uma decisão. Um «Falta uma semana para o grande
 * dia» que sai sozinho para um casamento adiado, ou um agradecimento a caminho
 * de um casal cujo evento foi cancelado na véspera, é a casa a mostrar que não
 * está a olhar. Ver o cabeçalho de `api/orcamento/[id]/modelo/route.ts`.
 *
 * Estas frases andam sempre com o código que as cumpre. Ligar um agendador aos
 * três, ou mudar de sítio o botão, obriga a reescrevê-las — e há testes
 * (`EmailTemplates.verdade.test.tsx`) que falham primeiro se assim não for.
 */
const DESCRIPTIONS: Record<string, string> = {
  "proposta-enviada":
    "Sai sozinho no email que leva a proposta ao cliente (botão «Enviar proposta», no Estúdio de " +
    "propostas). Enquanto não guardares este modelo, sai o texto da casa; e quando escreves uma " +
    "mensagem tua para acompanhar a proposta, é o texto da casa que sai, para a tua mensagem ficar " +
    "logo a seguir ao «Olá».",
  "sinal-recebido":
    "Não sai sozinho. Envias tu, no Dossier do evento → Comunicação → «Enviar um modelo», quando o " +
    "sinal já estiver registado como pago.",
  "semana-evento":
    "Não sai sozinho. Envias tu, no Dossier do evento → Comunicação → «Enviar um modelo», na semana " +
    "anterior ao evento.",
  agradecimento:
    "Não sai sozinho. Envias tu, no Dossier do evento → Comunicação → «Enviar um modelo», depois do " +
    "evento.",
};

type Mode = "visual" | "advanced";
type Field = "subject" | "visual" | "advanced";

const inputCls = "bo-input px-3 py-2 text-sm text-[var(--bo-tinta-72)] placeholder-foreground/22";

/** The body as stored/sent, given the current editor state. */
function computeBody(mode: Mode, doc: RichDoc, html: string): string {
  return mode === "advanced" ? html : buildRichEmailHtml(doc);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE ESCREVEU AQUI NÃO SE DEITA FORA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `onClick={() => selectInto(t)}` na lista da esquerda substituía o assunto, o
 * documento visual e o HTML sem guarda nenhuma — apesar de o `dirty` já estar
 * calculado ao lado, a activar o botão «Guardar». Meia hora a compor um email
 * ia-se num clique, sem pergunta e sem aviso. E não havia `beforeunload`:
 * fechar o separador fazia o mesmo, em silêncio.
 *
 * ── Porquê um rascunho local e não gravar sozinho no servidor ──────────────
 *
 * O resto do back office vai passar a gravar sozinho, e aqui isso seria uma
 * má ideia com boas intenções: esta rota (`PUT /api/email-templates`) não
 * guarda um rascunho — PUBLICA. O que ficar gravado é o texto que sai para
 * clientes na hora seguinte, e uma gravação automática a cada 800 ms punha
 * frases a meio («Olá {nome}, venho por este») no email que o próximo cliente
 * recebe. Guardar a mais é a regra em todo o lado; publicar a mais não é
 * guardar a mais, é enviar a mais.
 *
 * Por isso a divisão: **o rascunho grava-se sozinho, a publicação continua a
 * ser um gesto**. O texto por publicar fica no navegador desde a primeira
 * tecla, volta ao voltar ao modelo (e ao recarregar a página), a lista marca
 * quais os modelos que têm trabalho por publicar, e enquanto assim for o ecrã
 * di-lo com as palavras do estúdio: guardado, mas só neste computador.
 *
 * ── E o que fica por fazer ────────────────────────────────────────────────
 *
 * Só neste computador é MENOS do que o estúdio dá (esse leva o rascunho ao
 * servidor). Um rascunho de modelo no servidor precisa de uma gaveta que os
 * modelos ainda não têm — e que não se inventa a meio disto, porque a gaveta
 * errada é a que publica sem querer.
 */
const PREFIXO_RASCUNHO = "liquen-email-template-draft:";
const chaveDoRascunho = (key: string) => `${PREFIXO_RASCUNHO}${key}`;

/** O que se guarda por publicar: tudo o que o editor tem no ecrã. */
interface RascunhoDeModelo {
  subject: string;
  mode: Mode;
  doc: RichDoc;
  htmlBody: string;
  /** Quando ficou escrito no navegador — é a hora que o indicador mostra. */
  at: number;
}

function lerRascunho(key: string): RascunhoDeModelo | null {
  try {
    const cru = localStorage.getItem(chaveDoRascunho(key));
    if (!cru) return null;
    const r = JSON.parse(cru) as Partial<RascunhoDeModelo>;
    // Desconfiança de propósito: isto pode vir de uma versão anterior do ecrã
    // ou de um `localStorage` mexido à mão. O que não tiver forma ignora-se —
    // nunca faz a página estoirar nem publica coisa nenhuma sozinho.
    if (typeof r?.subject !== "string" || (r.mode !== "visual" && r.mode !== "advanced")) {
      return null;
    }
    return {
      subject: r.subject,
      mode: r.mode,
      doc: (r.doc ?? emptyRichDoc()) as RichDoc,
      htmlBody: typeof r.htmlBody === "string" ? r.htmlBody : "",
      at: typeof r.at === "number" ? r.at : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Devolve se ficou mesmo escrito. Um `false` não é detalhe: é a diferença
 *  entre poder trocar de modelo à vontade e ter de perguntar antes. */
function escreverRascunho(key: string, r: RascunhoDeModelo): boolean {
  try {
    localStorage.setItem(chaveDoRascunho(key), JSON.stringify(r));
    return true;
  } catch {
    return false;
  }
}

function apagarRascunho(key: string): void {
  try {
    localStorage.removeItem(chaveDoRascunho(key));
  } catch {
    /* indisponível — não há nada a apagar que se possa apagar */
  }
}

/** Que modelos têm trabalho por publicar guardado neste navegador. Lê-se ao
 *  abrir o ecrã para a lista poder marcá-los logo — inclusive os que ficaram
 *  de uma sessão anterior, que são exactamente os que se esqueciam. */
function modelosComRascunho(chaves: string[]): Set<string> {
  const out = new Set<string>();
  for (const k of chaves) if (lerRascunho(k)) out.add(k);
  return out;
}

function EditorClassico() {
  const { toast } = useToast();
  const anular = useAnular();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * ── TRÊS DESFECHOS DE UMA LEITURA, E O ECRÃ SÓ CONHECIA DOIS ──────────────
   *
   * Uma leitura falhada deixava `templates` a zero, e o ecrã dizia com toda a
   * confiança «Modelos (0)» e «Seleciona um modelo para editar.» — duas
   * afirmações que quem não conseguiu perguntar não sabe fazer. O toast que
   * dizia a verdade some-se em cinco segundos; o ecrã que mente fica.
   *
   * E aqui a mentira é cara: quem lê «Modelos (0)» conclui que os modelos se
   * perderam, e o gesto seguinte é reescrever à mão um texto que está inteiro
   * do outro lado — só que escrever por cima, nesta rota, é PUBLICAR, e
   * publicar é enviar.
   *
   * `null` = correu bem. String = falhou, e é o que o servidor disse (vazia
   * quando não disse nada). «Não há nenhum» e «não consegui ler» passam a ser
   * dois ecrãs diferentes, como já são no resto da casa.
   */
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Editor draft. `doc` is the visual (WYSIWYG) document model; `htmlBody` is the
  // hand-written HTML of the secondary "HTML avançado" escape hatch. `mode`
  // decides which is active. `baselineBody` is the stored/last-saved body used
  // for the dirty check (so re-opening a template is never falsely "dirty").
  const [subject, setSubject] = useState("");
  const [doc, setDoc] = useState<RichDoc>(emptyRichDoc);
  const [htmlBody, setHtmlBody] = useState("");
  const [mode, setMode] = useState<Mode>("visual");

  /**
   * ── AS TRÊS PERGUNTAS DESTE EDITOR, NUMA JANELA SÓ ─────────────────────
   *
   * Nenhuma destas é um «apagar», e todas as três são destrutivas na mesma:
   * o que se perde é TRABALHO. Trocar de modelo com o rascunho por gravar,
   * descartar o que está por publicar, e voltar ao editor visual a partir de
   * HTML escrito à mão — nas três, quem responde «sim» perde o que escreveu.
   *
   * Uma janela e um estado, com a acção lá dentro: três estados seriam três
   * folhas a poderem abrir ao mesmo tempo, e é o mesmo desenho que o
   * `Inventario` já usa.
   */
  const [aPerguntar, setAPerguntar] = useState<{
    titulo: string;
    aviso?: string;
    rotulo: string;
    fazer: () => void;
  } | null>(null);
  const [baselineBody, setBaselineBody] = useState("");

  const subjectRef = useRef<HTMLInputElement>(null);
  const advancedRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<RichEmailEditorHandle>(null);
  // Which editable last held focus — the merge chips insert into this one.
  const activeFieldRef = useRef<Field>("visual");

  /** Os modelos com trabalho por publicar guardado neste navegador. */
  const [porPublicar, setPorPublicar] = useState<Set<string>>(() => new Set());
  /** Quando é que o rascunho deste modelo ficou escrito no navegador. */
  const [rascunhoEm, setRascunhoEm] = useState<Date | null>(null);
  /**
   * O `localStorage` recusou guardar o rascunho (modo privado, quota cheia).
   *
   * É o único caso em que trocar de modelo VOLTA a poder perder trabalho — e
   * por isso é o único caso em que se pergunta antes. Perguntar sempre seria
   * ensinar a carregar em «OK» sem ler.
   */
  const rascunhoFalhou = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/email-templates", { cache: "no-store" });
      if (!res.ok) {
        // A frase do servidor tal e qual, quando ele deu uma: um «falta correr
        // o db/schema.sql» resolve o problema sozinho, e trocá-lo por um
        // genérico deitava fora a única coisa útil que veio na resposta.
        const corpo = (await res.json().catch(() => null)) as { error?: unknown } | null;
        setFalhaAoLer(typeof corpo?.error === "string" ? corpo.error : "");
        return;
      }
      const data: EmailTemplate[] = await res.json();
      setFalhaAoLer(null);
      setTemplates(data);
      setPorPublicar(modelosComRascunho(data.map((t) => t.key)));
      if (data.length) selectInto(data[0]);
    } catch {
      setFalhaAoLer("");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A leitura é assíncrona: os `setState` acontecem quando a resposta chega,
    // não no corpo do efeito. É o mesmo padrão (e a mesma dispensa) do
    // `useCachedList`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  /** O «Tentar de novo» do painel de falha: volta ao esqueleto e repete. Um
   *  painel que explica sem dar por onde sair é meia correcção. */
  function lerOutraVez() {
    setLoading(true);
    setFalhaAoLer(null);
    void carregar();
  }

  /**
   * Abre um modelo: primeiro o que está PUBLICADO (que é o que define a linha
   * de base do «tem alterações?»), e por cima, se houver, o que ficou escrito e
   * ainda não foi publicado.
   *
   * Por esta ordem e não pela inversa: a linha de base tem de ser sempre a
   * versão do servidor, senão o texto recuperado abria como se já estivesse
   * publicado — e o botão «Guardar» apagado é uma maneira silenciosa de dizer
   * «está tudo tratado» a quem ainda tem trabalho por publicar.
   */
  function selectInto(t: EmailTemplate) {
    abrirOPublicado(t);
    const r = lerRascunho(t.key);
    if (!r) {
      setRascunhoEm(null);
      return;
    }
    setSubject(r.subject);
    setMode(r.mode);
    setDoc(r.doc);
    setHtmlBody(r.htmlBody);
    activeFieldRef.current = r.mode === "advanced" ? "advanced" : "visual";
    setRascunhoEm(new Date(r.at));
  }

  function abrirOPublicado(t: EmailTemplate) {
    setSelectedKey(t.key);
    setSubject(t.subject);
    setHtmlBody(t.body);

    const rich = extractRichDoc(t.body);
    if (rich) {
      // Already a visual template — restore the model exactly.
      setDoc(rich);
      setMode("visual");
      setBaselineBody(computeBody("visual", rich, t.body));
      activeFieldRef.current = "visual";
      return;
    }
    const simple = extractSimpleText(t.body);
    if (simple !== null) {
      // Older "modo simples" template — open its paragraphs in the visual editor.
      const converted = docFromPlainText(simple);
      setDoc(converted);
      setMode("visual");
      setBaselineBody(computeBody("visual", converted, t.body));
      activeFieldRef.current = "visual";
      return;
    }
    // Hand-written HTML — open the advanced escape hatch so nothing is mangled.
    setDoc(emptyRichDoc());
    setMode("advanced");
    setBaselineBody(t.body);
    activeFieldRef.current = "advanced";
  }

  const selected = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? null,
    [templates, selectedKey],
  );
  /** Qual está aberto AGORA — o «Anular» corre dez segundos depois, e a
   *  `selectedKey` que ele fecharia é a desse instante, não a de agora. */
  const chaveAberta = useRef(selectedKey);
  useEffect(() => {
    chaveAberta.current = selectedKey;
  }, [selectedKey]);

  const effectiveBody = computeBody(mode, doc, htmlBody);
  const dirty = selected ? subject !== selected.subject || effectiveBody !== baselineBody : false;

  /**
   * ── O RASCUNHO GRAVA-SE SOZINHO, 800 ms DEPOIS DA ÚLTIMA TECLA ────────────
   *
   * O mesmo travão do estúdio, e pela mesma razão: gravar a cada tecla é
   * gravar cem vezes uma frase que ainda está a ser escrita. Escrever no
   * `localStorage` não custa uma ida à rede, mas serializar o documento
   * inteiro a cada letra fazia o editor engasgar-se — e um editor que
   * engasga é um editor onde se escreve pior.
   *
   * Quando NÃO há alterações, o rascunho é apagado: um rascunho igual ao que
   * está publicado não é trabalho por publicar, é ruído à espera de assustar
   * alguém daqui a três semanas.
   */
  const guardarRascunhoAgora = useCallback(() => {
    const chave = selectedKey;
    if (!chave) return;
    if (dirty) {
      const ok = escreverRascunho(chave, { subject, mode, doc, htmlBody, at: Date.now() });
      rascunhoFalhou.current = !ok;
      if (ok) {
        setRascunhoEm(new Date());
        setPorPublicar((prev) => (prev.has(chave) ? prev : new Set(prev).add(chave)));
      }
      return;
    }
    apagarRascunho(chave);
    rascunhoFalhou.current = false;
    setRascunhoEm(null);
    setPorPublicar((prev) => {
      if (!prev.has(chave)) return prev;
      const next = new Set(prev);
      next.delete(chave);
      return next;
    });
  }, [selectedKey, dirty, subject, mode, doc, htmlBody]);

  useEffect(() => {
    const t = setTimeout(guardarRascunhoAgora, 800);
    return () => clearTimeout(t);
  }, [guardarRascunhoAgora]);

  /**
   * ── OS 800 ms SÃO EXACTAMENTE A JANELA EM QUE SE PERDIA TUDO ──────────────
   *
   * O gesto que motivou isto — escrever e clicar noutro modelo — acontece,
   * quase por definição, ANTES de o travão da gravação disparar: escreve-se a
   * última palavra e clica-se. Um rascunho que só existe passados 800 ms não
   * apanhava nada disto. Por isso a troca de modelo grava PRIMEIRO (ver
   * `trocarDeModelo`), e sair do ecrã inteiro grava também.
   */
  const gravacaoPendente = useRef(guardarRascunhoAgora);
  useEffect(() => {
    gravacaoPendente.current = guardarRascunhoAgora;
  }, [guardarRascunhoAgora]);
  useEffect(() => {
    return () => gravacaoPendente.current();
  }, []);

  /**
   * ── ESTE MODELO NO REGISTO DO BACK OFFICE ─────────────────────────────────
   *
   * Este ecrã é o caso estranho do registo, e vale a pena dizer porquê: aqui
   * «guardar» é PUBLICAR — o que ficar gravado é o texto que sai para clientes
   * na hora seguinte. Por isso o gesto «Guardar tudo» NÃO publica nada. O que
   * faz é o mesmo que o ecrã já faz sozinho: põe o rascunho a salvo neste
   * navegador, e diz exactamente isso.
   *
   * E é por isso que se inscreve na mesma, em vez de ficar de fora: um modelo
   * com alterações por publicar é trabalho feito que não existe no servidor. Um
   * botão que dissesse «tudo guardado» com isso à espera estaria a mentir por
   * omissão — e a resposta, quando ela carrega, diz-lhe em duas linhas o que
   * falta fazer e onde.
   */
  const oRegistoFalaPorMim = useInscricaoNoRegisto({
    nome: selected ? `Modelo de email «${selected.name}»` : "",
    porGravar: dirty,
    gravarJa: async (): Promise<ResultadoDoEcra> => {
      guardarRascunhoAgora();
      if (rascunhoFalhou.current) {
        // O único caso em que o trabalho não está mesmo em lado nenhum: este
        // computador recusou guardar o rascunho (modo privado, quota cheia).
        return {
          estado: "nao-guardado",
          porque: "Este computador não deixa guardar o rascunho deste modelo.",
        };
      }
      return {
        estado: "so-neste-computador",
        porque: "O modelo só vai para os clientes depois de «Guardar» neste ecrã.",
      };
    },
    activo: !!selected,
  });

  /**
   * Fechar o separador com alterações por publicar.
   *
   * O rascunho local já as segura, portanto isto não é o último recurso que
   * era — é o aviso de que o que está no ecrã ainda NÃO saiu para lado nenhum.
   * E volta a ser o último recurso no computador onde o `localStorage` recusou
   * escrever, que é precisamente onde ninguém está à espera disso.
   *
   * Havendo registo, quem trava é ele — e nomeia o modelo. Sem registo, este
   * continua a valer.
   */
  useEffect(() => {
    if (oRegistoFalaPorMim || !dirty) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [oRegistoFalaPorMim, dirty]);

  /**
   * Trocar de modelo na lista da esquerda.
   *
   * Deixou de deitar fora o que estava escrito: o rascunho fica guardado e
   * volta quando se voltar a este modelo. Só se pergunta quando o rascunho NÃO
   * pôde ser guardado — aí a troca volta a ser destrutiva, e é o único caso em
   * que uma pergunta antes vale mais do que o incómodo de a responder.
   */
  function trocarDeModelo(t: EmailTemplate) {
    if (t.key === selectedKey) return;
    // Guarda ANTES de trocar: o travão de 800 ms ainda não disparou e é
    // precisamente isso que se perdia.
    guardarRascunhoAgora();
    if (dirty && rascunhoFalhou.current) {
      setAPerguntar({
        titulo: "Mudar de modelo e perder o que escreveu?",
        aviso:
          "Este aparelho não está a deixar guardar o rascunho, e as alterações a este modelo ainda não foram publicadas.",
        rotulo: "Mudar de modelo",
        fazer: () => selectInto(t),
      });
      return;
    }
    selectInto(t);
  }

  /** Deitar fora o que está por publicar — mas por decisão dela, e num botão
   *  que diz o que faz, não como efeito colateral de clicar noutro modelo. */
  function descartarRascunho() {
    if (!selected) return;
    setAPerguntar({
      titulo: "Descartar as alterações por publicar?",
      aviso: "O modelo volta ao que está guardado no servidor.",
      rotulo: "Descartar",
      fazer: descartarRascunhoMesmo,
    });
  }

  function descartarRascunhoMesmo() {
    if (!selected) return;
    apagarRascunho(selected.key);
    rascunhoFalhou.current = false;
    setRascunhoEm(null);
    setPorPublicar((prev) => {
      const next = new Set(prev);
      next.delete(selected.key);
      return next;
    });
    abrirOPublicado(selected);
  }

  // Live preview: subject + body with example merge values, exactly as the send
  // path resolves them. The preview body is DEFERRED: rebuilding it resets the
  // iframe's srcDoc, which forces the browser to reparse a whole HTML document +
  // reflow — doing that per keystroke made composing an email stutter. The
  // contentEditable stays instant; the iframe catches up after a typing pause.
  // (`dirty`/save use the immediate effectiveBody, so save-state stays exact.)
  // O assunto vai por `renderPreviewSubject`: é um cabeçalho e não leva escape
  // de HTML no envio, por isso a pré-visualização também não o pode levar.
  const previewSubject = renderPreviewSubject(subject);
  const deferredBody = useDeferredValue(effectiveBody);
  const previewSrcDoc = useMemo(() => {
    const rendered = renderPreview(deferredBody);
    return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0}body{padding:20px;background:#f7f4ee;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}</style></head><body>${rendered}</body></html>`;
  }, [deferredBody]);

  function insertMerge(field: string) {
    const token = `{${field}}`;
    const which = activeFieldRef.current;
    if (which === "visual") {
      editorRef.current?.insertToken(token);
      return;
    }
    const target =
      which === "advanced"
        ? { ref: advancedRef, value: htmlBody, set: setHtmlBody }
        : { ref: subjectRef, value: subject, set: setSubject };
    const el = target.ref.current;
    if (!el) {
      target.set(target.value + token);
      return;
    }
    const start = el.selectionStart ?? target.value.length;
    const end = el.selectionEnd ?? target.value.length;
    const { text, caret } = insertToken(target.value, start, end, token);
    target.set(text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  /** Switch to the hand-HTML escape hatch, seeding it with the current body. */
  function switchToAdvanced() {
    setHtmlBody(computeBody("visual", doc, htmlBody));
    setMode("advanced");
    activeFieldRef.current = "advanced";
  }

  /** Return to the visual editor, recovering the model when possible. */
  function switchToVisual() {
    const rich = extractRichDoc(htmlBody);
    if (rich) {
      setDoc(rich);
      setMode("visual");
      activeFieldRef.current = "visual";
      return;
    }
    const simple = extractSimpleText(htmlBody);
    if (simple !== null) {
      setDoc(docFromPlainText(simple));
      setMode("visual");
      activeFieldRef.current = "visual";
      return;
    }
    setAPerguntar({
      titulo: "Voltar ao editor visual?",
      aviso:
        "Este HTML foi escrito à mão. Ao voltar, a formatação avançada é convertida em texto simples e pode perder-se.",
      rotulo: "Voltar ao visual",
      fazer: () => {
        setDoc(docFromPlainText(htmlToPlainText(htmlBody)));
        setMode("visual");
        activeFieldRef.current = "visual";
      },
    });
  }

  /**
   * ── UMA GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU ─────────────────────
   *
   * Publicar um modelo falhava com «Não foi possível guardar. Tenta
   * novamente.» — a mesma frase para a rede em baixo, para a sessão expirada e
   * para um assunto que o servidor recusou. Nos dois últimos, «tenta
   * novamente» é conselho errado, e é a segunda tentativa falhada que faz
   * alguém deixar de acreditar no ecrã.
   *
   * Mesmo padrão do `MaterialListas`: um sítio só, a frase vem do
   * `porque-falhou`, nomeia o modelo e acaba numa instrução que pode funcionar.
   */
  async function gravar(
    oQue: string,
    url: string,
    init?: RequestInit,
  ): Promise<{ ok: boolean; corpo: unknown }> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return { ok: false, corpo: null };
    }
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return { ok: false, corpo };
    }
    return { ok: true, corpo };
  }

  async function save() {
    if (!selected || saving) return;
    const antes = selected;
    if (!subject.trim()) {
      toast("O assunto não pode ficar vazio.", "error");
      return;
    }
    setSaving(true);
    try {
      const body = effectiveBody;
      const { ok, corpo } = await gravar(
        `guardar o modelo «${selected.name}»`,
        "/api/email-templates",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: selected.key,
            name: selected.name,
            subject: subject.trim(),
            body,
          }),
        },
      );
      if (!ok) return;
      const saved = corpo as EmailTemplate | null;
      if (!saved || typeof saved.key !== "string") {
        // Gravou (o servidor disse que sim) mas a resposta não veio legível.
        // Actualizar a lista com isto era inventar; e apagar o rascunho era
        // deitar fora a única cópia do texto. Fica tudo como está, e diz-se.
        toast(
          "Modelo guardado, mas não deu para reler o que ficou gravado. Atualiza a página antes de continuares.",
          "error",
        );
        return;
      }
      setTemplates((prev) => prev.map((t) => (t.key === saved.key ? saved : t)));
      setBaselineBody(saved.body);
      setSavedKey(saved.key);
      // Publicado: o rascunho já não representa trabalho por publicar. Deixá-lo
      // ficar era pior do que não o ter — daqui a uma semana ressuscitava por
      // cima de uma versão já enviada a clientes.
      apagarRascunho(saved.key);
      rascunhoFalhou.current = false;
      setRascunhoEm(null);
      setPorPublicar((prev) => {
        if (!prev.has(saved.key)) return prev;
        const next = new Set(prev);
        next.delete(saved.key);
        return next;
      });
      // O «Anular» publica outra vez a versão de antes deste «Guardar», e o
      // editor volta a ela se o modelo ainda estiver aberto.
      anular(`Modelo «${antes.name}» guardado.`, async () => {
        const { ok: voltou, corpo: reposto } = await gravar(
          `repor o modelo «${antes.name}» como estava`,
          "/api/email-templates",
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: antes.key,
              name: antes.name,
              subject: antes.subject,
              body: antes.body,
            }),
          },
        );
        if (!voltou) return false;
        const t = reposto as EmailTemplate | null;
        const ficou = t && typeof t.key === "string" ? t : antes;
        setTemplates((prev) => prev.map((x) => (x.key === ficou.key ? ficou : x)));
        if (chaveAberta.current === ficou.key) abrirOPublicado(ficou);
        return true;
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl">
        <SkeletonList rows={4} />
      </div>
    );
  }

  // A falha ANTES da lista, como no resto da casa: «Modelos (0)» só se pode
  // dizer depois de o servidor ter respondido que não há nenhum.
  if (falhaAoLer !== null) {
    return (
      <div className="max-w-6xl">
        <AvisoDeFalha
          titulo="Não foi possível ler os modelos de email"
          mensagem={falhaAoLer}
          aoTentarDeNovo={lerOutraVez}
        />
      </div>
    );
  }

  const showSaved = !dirty && !saving && savedKey === selectedKey;

  return (
    /* ── O ESQUELETO DÁ LUGAR AOS MODELOS, EM VEZ DE SALTAR PARA ELES ───────
       Enquanto `loading`, mostra-se um `SkeletonList` de quatro linhas (lá em
       cima); quando os modelos chegam, estas duas colunas montam de raiz e o
       esqueleto sai. Era uma troca de um fotograma para o outro.

       `.bo-cena`: 600 ms, doze píxeis, `cubic-bezier(0, 0, 0.2, 1)` — a banda
       de apresentação, uma vez só e no contentor.

       Nada de `key` por baixo disto: o editor de modelos guarda rascunhos por
       publicar (`dirty`, `rascunhos`), e uma animação que remontasse a árvore
       deitava-os fora. A entrada vem da CLASSE do elemento que monta, e a
       montagem é a que já acontecia quando a espera acaba. */
    <div className="bo-cena max-w-6xl grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
      {/* Left: template list */}
      <div className="bo-card overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-[var(--bo-hairline)]">
          <p className="bo-eyebrow">Modelos ({templates.length})</p>
        </div>
        <div className="divide-y divide-[var(--bo-hairline)]">
          {templates.map((t) => {
            const active = t.key === selectedKey;
            return (
              <button
                key={t.key}
                onClick={() => trocarDeModelo(t)}
                className={`w-full text-left px-4 py-3 ${ESTADO} ${PRESSAO} ${
                  active ? "bg-sage-600/10" : "hover:bg-[var(--bo-tinta-3)]"
                }`}
              >
                <p
                  className={`text-sm truncate ${active ? "text-sage-600 font-medium" : "text-[var(--bo-tinta-72)]"}`}
                >
                  {t.name}
                  {/* A MARCA DO TRABALHO POR PUBLICAR.
                      Sem ela, um modelo com meia hora de escrita por publicar
                      é indistinguível dos outros na lista — e o esquecimento
                      passa a ser só uma questão de tempo. Não é só cor: é uma
                      palavra, e vai também no nome acessível do botão. */}
                  {porPublicar.has(t.key) && (
                    <span className="ml-1.5 rounded-full bg-[var(--bo-aviso-tom)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--bo-aviso)] align-middle">
                      por publicar
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-foreground/40 mt-0.5 leading-snug">
                  {DESCRIPTIONS[t.key] ?? "Modelo de email."}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── EDITOR E PRÉ-VISUALIZAÇÃO LADO A LADO A PARTIR DE 1024 ─────────
          Era `xl:` (1280). Entre 1024 e 1280 — que é o portátil dela — havia
          largura para as duas colunas e mostrava-se uma só: escrevia-se o
          modelo em cima e rolava-se para baixo para ver como ficava, a cada
          alteração. A partir de agora as duas colunas abrem no mesmo sítio em
          que a barra lateral do back office deixa de ser gaveta (`lg`, 1024),
          que é o único corte que esta casa usa para «cabem duas colunas?». */}
      {selected ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Editor */}
          <div className="bo-card p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="bo-eyebrow">A editar</p>
                <p className="text-sm text-[var(--bo-tinta-72)] mt-1 truncate">{selected.name}</p>
                <p className="text-[11px] text-foreground/40 mt-1 leading-snug">
                  {DESCRIPTIONS[selected.key] ?? "Modelo de email."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {dirty && (
                  <Button variant="ghost" size="sm" onClick={descartarRascunho}>
                    Descartar alterações
                  </Button>
                )}
                <Button
                  variant={showSaved ? "subtle" : "primary"}
                  onClick={save}
                  loading={saving}
                  disabled={saving || !dirty}
                >
                  {saving ? "A guardar…" : showSaved ? "Guardado ✓" : "Guardar"}
                </Button>
              </div>
            </div>

            {/* ONDE É QUE ESTE TEXTO ESTÁ, NESTE MOMENTO.
                As palavras são as do estúdio, porque o facto é o mesmo: o
                trabalho existe e está guardado, mas só neste computador. O que
                muda é a razão — ali é uma avaria, aqui é de propósito, porque
                guardar no servidor seria PUBLICAR e o que está a meio de ser
                escrito não pode sair para clientes. Daí o âmbar e não o
                vermelho: isto é um estado normal do trabalho, não um alarme. */}
            {dirty && (
              <p
                className="mb-4 -mt-1 inline-flex rounded-full bg-[var(--bo-aviso-tom)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--bo-aviso)]"
                aria-live="polite"
              >
                {rascunhoEm
                  ? `por publicar — guardado só neste computador às ${rascunhoEm.toLocaleTimeString(
                      "pt-PT",
                      { hour: "2-digit", minute: "2-digit" },
                    )}`
                  : "por publicar — alterações ainda não guardadas"}
              </p>
            )}

            {/* Subject */}
            <label htmlFor="et-subject" className="bo-eyebrow block mb-1.5">
              Assunto
            </label>
            <input
              id="et-subject"
              ref={subjectRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => (activeFieldRef.current = "subject")}
              placeholder="Assunto do email"
              className={`${inputCls} w-full mb-4`}
            />

            {/* Merge-field insert buttons */}
            <label className="bo-eyebrow block mb-1.5">Dados do cliente</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  // Keep the editor's selection when clicking a chip so the token
                  // lands at the caret rather than the field losing focus first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMerge(f.key)}
                  title={f.hint}
                  className={`px-2.5 py-1 rounded-md text-[11px] bg-sage-600/10 text-sage-600 hover:bg-sage-600/20 ${ESTADO} ${PRESSAO}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-foreground/40 mb-4 leading-relaxed">
              Clica para inserir onde está o cursor — no envio, cada campo é preenchido com os dados
              reais.
            </p>

            {/* Body */}
            <div className="flex items-center justify-between mb-1.5">
              <label className="bo-eyebrow">Mensagem</label>
              {mode === "visual" ? (
                <button
                  type="button"
                  onClick={switchToAdvanced}
                  className={`text-[11px] text-foreground/35 hover:text-[var(--bo-text-muted)] underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                >
                  HTML avançado
                </button>
              ) : (
                <button
                  type="button"
                  onClick={switchToVisual}
                  className={`text-[11px] text-sage-600 hover:text-[var(--bo-accent-hover)] underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                >
                  ← Voltar ao editor visual
                </button>
              )}
            </div>

            {mode === "visual" ? (
              <>
                <RichEmailEditor
                  key={`${selectedKey}:visual`}
                  ref={editorRef}
                  initialDoc={doc}
                  onChange={setDoc}
                  onFocus={() => (activeFieldRef.current = "visual")}
                />
                <p className="text-[11px] text-foreground/40 mt-2 leading-relaxed">
                  Escreve e formata com a barra acima. À direita vês como o cliente recebe.
                </p>
              </>
            ) : (
              <>
                <textarea
                  ref={advancedRef}
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  onFocus={() => (activeFieldRef.current = "advanced")}
                  spellCheck={false}
                  rows={16}
                  placeholder="<div>…</div>"
                  className={`${inputCls} w-full font-mono !text-xs pointer-coarse:!text-base leading-relaxed resize-y`}
                  aria-label="HTML do email"
                />
                <p className="text-[11px] text-foreground/40 mt-2 leading-relaxed">
                  Modo secundário para quem sabe HTML. Os campos entre chavetas (ex.:{" "}
                  <span className="font-mono text-[var(--bo-text-muted)]">{"{nome}"}</span>) são
                  substituídos no envio. À direita vê como fica.
                </p>
              </>
            )}
          </div>

          {/* Live preview */}
          <div className="bo-card p-5 lg:sticky lg:top-5">
            <p className="bo-eyebrow mb-1.5">Pré-visualização</p>
            {/* A MOLDURA E O FECHO NÃO ESTÃO AQUI, E TÊM DE SER DITOS.
                O que se vê é só o CORPO. Todo o email ao cliente é embrulhado
                na moldura da casa e fechado pela assinatura (Catarina Gaspar,
                cargo, contactos, logótipo e banner), que o `emailAoCliente`
                põe sempre no fim — e essa vive no servidor, com imagens que
                viajam por `cid:`, portanto não se desenha nesta caixa.
                Sem esta frase, o modelo despede-se por cima da assinatura e o
                cliente recebe dois fechos colados: foi exactamente o que
                aconteceu nos atalhos do mensageiro. */}
            <p className="text-[11px] text-foreground/40 mb-3 leading-relaxed">
              É assim que o cliente vê o corpo do email, com dados de exemplo. No fim, a assinatura
              da Líquen (Catarina Gaspar, contactos e logótipo) entra sozinha — não precisas de te
              despedir nem de repetir o nome da empresa.
            </p>
            <div className="rounded-lg border border-[var(--bo-hairline)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--bo-tinta-3)] border-b border-[var(--bo-hairline)]">
                <p className="text-[10px] text-foreground/40">Assunto</p>
                <p className="text-sm text-[var(--bo-tinta-72)] truncate">
                  {previewSubject || <span className="text-foreground/30">(sem assunto)</span>}
                </p>
              </div>
              <iframe
                title="Pré-visualização do email"
                srcDoc={previewSrcDoc}
                sandbox=""
                className="w-full block bg-[var(--bo-chao)]"
                style={{ height: 460, border: "none" }}
              />
            </div>
          </div>
        </div>
      ) : templates.length === 0 ? (
        /* Uma leitura BOA que não trouxe nada. A falhada nunca chega aqui —
           sai no `AvisoDeFalha` lá em cima —, e é por isso que esta frase pode
           afirmar o que afirma. */
        <div className="bo-card p-8 text-center text-foreground/30 text-sm">
          Ainda não há modelos de email guardados.
        </div>
      ) : (
        <div className="bo-card p-8 text-center text-foreground/30 text-sm">
          Seleciona um modelo para editar.
        </div>
      )}

      {/* ── A PERGUNTA É A DA CASA ──────────────────────────────────────────
          As três perguntas deste editor cabem aqui: cada uma traz o seu título,
          o seu aviso e o que fazer se a resposta for sim. */}
      <PerguntaDestrutiva
        aberto={!!aPerguntar}
        onFechar={() => setAPerguntar(null)}
        titulo={aPerguntar?.titulo ?? ""}
        aviso={aPerguntar?.aviso}
        rotuloConfirmar={aPerguntar?.rotulo ?? ""}
        // Fecha primeiro e só depois age, como nos outros ecrãs: o que vem a
        // seguir é uma troca de vista, e uma caixa aberta por cima dela ficaria
        // pendurada sobre um ecrã que já mudou.
        onConfirmar={() => {
          const pedido = aPerguntar;
          setAPerguntar(null);
          pedido?.fazer();
        }}
      />
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DOIS EDITORES, E PORQUE É QUE O ANTIGO NÃO SE DEITOU FORA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O separador «Modelos» é o novo: as duas línguas, o menu de variáveis por
 * grupos, os blocos condicionais, a pré-visualização com um pedido a sério, o
 * envio de teste e o histórico com reversão.
 *
 * O «Editor clássico» é este ficheiro, tal e qual, e fica por três razões
 * concretas — nenhuma delas nostalgia:
 *
 *  1. É ELE QUE TEM O EDITOR VISUAL (negritos, listas, ligações). O ecrã novo
 *     edita o markup directamente; tirar-lhe o editor visual sem lho dar era
 *     uma troca em que ela perdia.
 *  2. É ELE QUE TEM O RASCUNHO LOCAL, com o trabalho por publicar de quem
 *     estiver a meio de escrever quando isto for para produção. Desligá-lo
 *     fazia desaparecer esse trabalho do ecrã sem o apagar do navegador — a
 *     pior das duas coisas.
 *  3. Os quatro modelos antigos usam o dialecto `{marcador}`, que continua a
 *     ser servido e enviado como sempre. Este editor é o que os conhece.
 *
 * As duas metades gravam na MESMA tabela e o português de um modelo é a mesma
 * linha nas duas: o que se publicar num vê-se no outro.
 */
export default function EmailTemplates() {
  const [vista, setVista] = useState<"modelos" | "classico">("modelos");

  /**
   * ── A MARCA DO SEPARADOR ACTIVO ANDA, EM VEZ DE ACENDER NOUTRO SÍTIO ──────
   *
   * Esta barra é escrita à mão — está fora do `ui/Segmented.tsx`, que é o
   * primitivo que já tem a marca a deslizar. O gesto era o mesmo do índice do
   * estúdio antes de ele o receber: o fundo verde apagava-se num separador e
   * acendia-se no outro, no mesmo fotograma, e nada dizia que se veio de um e
   * se foi para o outro. As cores tinham os 120 ms do `ESTADO`; a POSIÇÃO não
   * tinha tempo nenhum, porque não havia nada que se movesse.
   *
   * `useMarcaQueAnda` é a medida do `Segmented` e da barra lateral extraída
   * para um sítio só, e é o mesmo gancho que o `NavEstudio` usa. Mede-se em vez
   * de se calcular porque «Modelos» e «Editor clássico» não medem o mesmo, e
   * porque esta barra tem `flex-wrap`: a 390 px os dois separadores passam a
   * duas linhas e a marca tem de descer com o activo — é para isso que o eixo
   * `y` vem no gancho, e é por isso que ele traz um `ResizeObserver`.
   *
   * O selector é `[aria-selected="true"]`, que é como um `role="tab"` diz qual
   * é o activo. Não se inventa um `data-*` para isto: a informação já está no
   * ARIA, e duas fontes para a mesma verdade divergem.
   */
  const barraRef = useRef<HTMLDivElement>(null);
  const { marca, podeAndar } = useMarcaQueAnda(barraRef, '[aria-selected="true"]', vista);
  const temMarca = marca !== null;

  const separador = (chave: "modelos" | "classico", rotulo: string) => (
    <button
      role="tab"
      aria-selected={vista === chave}
      onClick={() => setVista(chave)}
      /* `relative`: o rótulo tem de ficar POR CIMA da pílula, que é um irmão
         absoluto desenhado antes dele. */
      className={`relative px-3 py-1.5 rounded-md text-xs ${ESTADO} ${PRESSAO} ${
        vista === chave
          ? // O fundo próprio é a rede de antes de a pílula estar medida — entre
            // o HTML do servidor e o primeiro fotograma do React não há medida
            // nenhuma, e um separador activo sem fundo lia-se como inactivo.
            // Sai no instante em que a pílula está no sítio: nunca há dois
            // fundos ao mesmo tempo, e nunca há nenhum. É a manobra do
            // `Segmented`, e a razão está escrita lá por extenso.
            `text-white ${temMarca ? "" : "bg-[var(--bo-marca)]"}`
          : "bg-[var(--bo-marca)]/10 text-sage-600 hover:bg-[var(--bo-marca)]/20"
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <div>
      {/* Empilha e embrulha a 390 px como tudo o resto deste ecrã.
          `relative` porque é ESTA barra o `offsetParent` das medidas que o
          gancho devolve, e é dentro dela que a pílula se posiciona. */}
      <div
        ref={barraRef}
        className="relative flex flex-wrap gap-1.5 mb-4"
        role="tablist"
        aria-label="Editor de modelos"
      >
        {/* A pílula que anda. `aria-hidden` porque não diz nada que o
            `aria-selected` de cada separador não diga melhor — é desenho, não
            informação. `MARCA` traz `motion-safe:` nas duas classes, portanto
            quem pediu para não animar vê-a mudar de sítio de um fotograma para
            o outro; e só entra depois do primeiro desenho (`podeAndar`), senão
            ao abrir o ecrã ela deslizava do canto até ao separador activo, a
            anunciar uma transição que ninguém provocou. */}
        {marca && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-0 top-0 rounded-md bg-[var(--bo-marca)] ${
              podeAndar ? MARCA : ""
            }`}
            style={{
              translate: `${marca.x}px ${marca.y}px`,
              width: marca.largura,
              height: marca.altura,
            }}
          />
        )}
        {separador("modelos", "Modelos")}
        {separador("classico", "Editor clássico")}
      </div>
      {/* ── E O PAINEL? JÁ SE APRESENTA, E NÃO LEVA SEGUNDA ENTRADA ──────────
          Os dois lados montam de raiz a cada troca (são componentes
          diferentes, portanto o React desmonta um e monta o outro), e a raiz de
          cada um já traz a `.bo-cena` — 600 ms, a banda de apresentação — para
          quando os modelos chegam do servidor. Uma `.view-in` aqui por cima
          somava uma segunda entrada de 240 ms à mesma troca: dois gestos para
          uma coisa só, que é exactamente o «hesitar entre as duas velocidades»
          que o `ui/movimento.ts` proíbe.

          E o que aparece no INSTANTE do clique é o esqueleto, enquanto a
          leitura vai a caminho. Esse não leva entrada nenhuma de propósito: um
          estado de espera que demorasse 240 ms a ficar visível é uma animação a
          atrasar uma tarefa, que é a regra que não se quebra. */}
      {vista === "modelos" ? <EmailTemplatesBilingue /> : <EditorClassico />}
    </div>
  );
}
