"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./Toast";
import { SkeletonList } from "./Skeleton";
import { Escolha, Button } from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { ESTADO, MARCA, PRESSAO } from "./ui/movimento";
import { useMarcaQueAnda } from "./ui/useMarcaQueAnda";
import {
  construirCorpoDeModelo,
  extractSimpleText,
  insertToken,
} from "@/lib/email-template-format";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { renderizarAssunto, renderizarCorpo, validarModelo } from "@/lib/email-template-engine";
import {
  VALORES_DE_EXEMPLO,
  VARIAVEIS_POR_GRUPO,
  type GrupoDeVariavel,
} from "@/lib/email-template-vars";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ DOS MODELOS, NAS DUAS LÍNGUAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que este ecrã acrescenta ao editor clássico, e porquê cada coisa:
 *
 *  • PT E EN lado a lado. As propostas já são bilingues e o email tem de
 *    seguir a língua do cliente. Enquanto o lado inglês estiver por escrever,
 *    diz-se — não se traduz à máquina o texto dela.
 *  • O MENU DE VARIÁVEIS POR GRUPOS, com «Quem assina» separado do «Cliente».
 *    Está a sair correio a clientes assinado com o nome deles; um menu que
 *    ofereça «nome» sem dizer de quem é o nome é onde essa troca começa.
 *  • BLOCOS CONDICIONAIS com um botão. `{{#se evento_data}}` escrito à mão
 *    erra-se, e um bloco mal fechado não se vê a olho.
 *  • PRÉ-VISUALIZAÇÃO COM UM PEDIDO A SÉRIO. Ver a forma do email não é ver o
 *    que ele diz: um `{{#se_nao evento_data}}` só se percebe num pedido que
 *    não tem data.
 *  • UM TESTE PARA A PRÓPRIA CAIXA. A moldura e a assinatura da casa só
 *    aparecem depois de o correio passar — não há como as ver aqui.
 *  • HISTÓRICO COM REVERSÃO. Publicar é enviar; poder voltar atrás em dois
 *    cliques é o que torna a experimentação segura.
 *
 * ── A 390 px ──────────────────────────────────────────────────────────────
 *
 * O back office usa-se no telemóvel. Tudo empilha por omissão (`grid-cols-1`)
 * e só se divide em colunas a partir de `lg`. Nada aqui tem largura fixa: a
 * lista de modelos, os separadores de língua, o menu de variáveis e o
 * histórico são todos `flex-wrap`, e a pré-visualização é `w-full`.
 */

interface LadoDoModelo {
  subject: string;
  body: string;
  updatedAt: string;
}
interface ModeloBilingue {
  chave: string;
  nome: string;
  descricao: string;
  pt: LadoDoModelo;
  en: LadoDoModelo;
}
interface VersaoDeModelo {
  chave: string;
  idioma: Idioma;
  versaoEm: string;
  nome: string;
  subject: string;
  body: string;
}
interface PedidoParaPreVisualizar {
  id: string;
  etiqueta: string;
  idioma: Idioma;
  semData: boolean;
}

type Idioma = "pt" | "en";
type Campo = "assunto" | "corpo";

const inputCls = "bo-input px-3 py-2 text-sm text-[var(--bo-tinta-72)] placeholder-foreground/22";

/** Um payload que não tem a forma certa ignora-se — nunca parte o ecrã. */
function ehModelo(v: unknown): v is ModeloBilingue {
  const m = v as Partial<ModeloBilingue> | null;
  return !!m && typeof m.chave === "string" && !!m.pt && !!m.en;
}

const horaCurta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const TITULO_DO_GRUPO: Record<GrupoDeVariavel, string> = {
  cliente: "Cliente",
  evento: "Evento",
  proposta: "Proposta",
  remetente: "Quem assina",
};

export default function EmailTemplatesBilingue() {
  const { toast } = useToast();
  const [modelos, setModelos] = useState<ModeloBilingue[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  /**
   * ── «MODELOS (0)» É UMA AFIRMAÇÃO, E UMA LEITURA FALHADA NÃO A SABE FAZER ─
   *
   * Falhando a leitura, `modelos` ficava a zero e o ecrã dizia «Modelos (0)» e
   * «Seleciona um modelo para editar.» — com a mesma cara com que o diria se o
   * servidor tivesse mesmo respondido que não há nenhum. O toast que dizia a
   * verdade dura cinco segundos; o ecrã que mente fica lá o dia todo.
   *
   * E o passo seguinte que essa mentira sugere é o pior possível: reescrever à
   * mão um texto que está inteiro do outro lado — e aqui gravar é PUBLICAR, ou
   * seja, é o que o próximo cliente recebe.
   *
   * `null` = correu bem. String = falhou, e é o que o servidor disse (vazia
   * quando não disse nada).
   */
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [chave, setChave] = useState<string | null>(null);
  const [idioma, setIdioma] = useState<Idioma>("pt");

  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [baseAssunto, setBaseAssunto] = useState("");
  const [baseCorpo, setBaseCorpo] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  const assuntoRef = useRef<HTMLInputElement>(null);
  const corpoRef = useRef<HTMLTextAreaElement>(null);
  const campoActivo = useRef<Campo>("corpo");

  const [pedidos, setPedidos] = useState<PedidoParaPreVisualizar[]>([]);
  /**
   * A lista de pedidos falhava em SILÊNCIO TOTAL: um `if (rp.ok)` sem `else`.
   * O seletor ficava só com «Dados de exemplo» e nada dizia porquê — e quem
   * abriu isto para ver o modelo com um pedido a sério conclui que a
   * funcionalidade não existe, ou que não há pedidos nenhuns.
   */
  const [falhaNosPedidos, setFalhaNosPedidos] = useState<string | null>(null);
  const [pedidoId, setPedidoId] = useState("");
  const [valoresReais, setValoresReais] = useState<Record<string, string> | null>(null);

  const [versoes, setVersoes] = useState<VersaoDeModelo[]>([]);
  /**
   * ── TRÊS ESTADOS QUE PARTILHAVAM UMA FRASE VERDADEIRA NUM SÓ ──────────────
   *
   * «Ainda não há versões anteriores desta língua» aparecia enquanto a leitura
   * ainda ia a caminho E depois de ela rebentar — e nos dois casos é falso: as
   * versões podem estar todas lá. Pior do que falso, é a frase que convida a
   * publicar «para criar a primeira», que é exactamente o gesto que não se
   * quer a seguir a uma falha, porque publicar aqui é enviar.
   */
  const [estadoDoHistorico, setEstadoDoHistorico] = useState<"a-ler" | "lido" | "falhou">("lido");
  const [falhaDoHistorico, setFalhaDoHistorico] = useState("");
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const [destinoDoTeste, setDestinoDoTeste] = useState("");
  const [aEnviarTeste, setAEnviarTeste] = useState(false);

  const modelo = useMemo(() => modelos.find((m) => m.chave === chave) ?? null, [modelos, chave]);

  /**
   * ── A MARCA DA LÍNGUA ACTIVA ANDA ────────────────────────────────────────
   *
   * A barra «Português / English» é escrita à mão, fora do `ui/Segmented.tsx`,
   * e trocava de língua a corte seco: o fundo verde apagava-se num separador e
   * acendia-se no outro no mesmo fotograma. As cores tinham os 120 ms do
   * `ESTADO`; a posição não tinha tempo nenhum.
   *
   * É o mesmo gancho do `NavEstudio` e da barra de cima do `EmailTemplates` —
   * `useMarcaQueAnda`, medido e não calculado, porque «Português» e «English»
   * não medem o mesmo e porque um deles pode trazer «(por escrever)» ao lado,
   * o que lhe muda a largura sem nada no índice o dizer. E porque a barra tem
   * `flex-wrap`: a 390 px os dois passam a duas linhas e a marca desce com o
   * activo, que é para isso que o gancho devolve os DOIS eixos.
   *
   * ── PORQUE É QUE A CHAVE É O MODELO *E* A LÍNGUA ─────────────────────────
   *
   * A barra só existe depois de haver modelo aberto — antes disso o `ref` está
   * vazio e não há nada a medir. Pôr as duas coisas na chave é o que manda
   * medir tanto quando ela muda de língua (o gesto) como quando a barra nasce
   * ao abrir o primeiro modelo (senão a marca só aparecia à segunda troca).
   *
   * O gancho é chamado AQUI, acima dos `return` de espera e de falha, para a
   * ordem dos ganchos não depender do que o servidor respondeu.
   */
  const barraDaLinguaRef = useRef<HTMLDivElement>(null);
  const { marca: marcaDaLingua, podeAndar: linguaPodeAndar } = useMarcaQueAnda(
    barraDaLinguaRef,
    '[aria-selected="true"]',
    `${chave ?? ""}:${idioma}`,
  );

  /**
   * ── A CAIXA MOSTRA O TEXTO, NÃO O FORMATO GUARDADO ──────────────────────
   *
   * Achado n.º 9 da auditoria: a «Mensagem» dos sete modelos abria com
   * `<!-- liquen:simple:v1:T2zDoSB7…` seguido do HTML com estilos — mudar uma
   * palavra era editar HTML, e o marcador escondido (que o editor clássico
   * lê) deixava de acompanhar o que se mudava aqui.
   *
   * Um corpo com marcador abre como o TEXTO que lá está guardado, e volta a
   * ser construído inteiro (marcador incluído) ao publicar, ao pré-visualizar
   * e ao enviar o teste. Um corpo escrito à mão em HTML, sem marcador, abre
   * como está — não há texto de origem para lhe tirar.
   */
  const [corpoEmTexto, setCorpoEmTexto] = useState(false);
  const paraGravar = (texto: string) => (corpoEmTexto ? construirCorpoDeModelo(texto) : texto);
  const paraEditar = (body: string) => {
    const texto = extractSimpleText(body);
    setCorpoEmTexto(texto != null);
    return texto ?? body;
  };

  const abrir = useCallback((m: ModeloBilingue, lingua: Idioma) => {
    const lado = m[lingua];
    const texto = extractSimpleText(lado.body);
    setCorpoEmTexto(texto != null);
    setChave(m.chave);
    setIdioma(lingua);
    setAssunto(lado.subject);
    setCorpo(texto ?? lado.body);
    setBaseAssunto(lado.subject);
    setBaseCorpo(texto ?? lado.body);
    setHistoricoAberto(false);
  }, []);

  /**
   * As duas leituras estavam num `Promise.all` com um `catch` só, portanto a
   * rede em baixo do lado dos pedidos levava também os modelos — e vice-versa.
   * Separadas, cada uma falha por si e diz-se onde dói.
   */
  const lerModelos = useCallback(async () => {
    try {
      const r = await fetch("/api/email-templates/bilingues", { cache: "no-store" });
      if (!r.ok) {
        // A frase do servidor tal e qual: um «falta correr o db/schema.sql»
        // resolve o problema sozinho, e trocá-lo por um genérico deitava fora
        // a única coisa útil que veio na resposta.
        const d = (await r.json().catch(() => null)) as { error?: unknown } | null;
        setFalhaAoLer(typeof d?.error === "string" ? d.error : "");
        return;
      }
      const dados: unknown = await r.json();
      const lista = Array.isArray(dados) ? dados.filter(ehModelo) : [];
      setFalhaAoLer(null);
      setModelos(lista);
      if (lista.length) abrir(lista[0], "pt");
    } catch {
      setFalhaAoLer("");
    } finally {
      setACarregar(false);
    }
  }, [abrir]);

  const lerPedidos = useCallback(async () => {
    try {
      const r = await fetch("/api/email-templates/dados", { cache: "no-store" });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: unknown } | null;
        setFalhaNosPedidos(typeof d?.error === "string" ? d.error : "");
        return;
      }
      const d = (await r.json()) as { pedidos?: PedidoParaPreVisualizar[] };
      setFalhaNosPedidos(null);
      setPedidos(Array.isArray(d?.pedidos) ? d.pedidos : []);
    } catch {
      setFalhaNosPedidos("");
    }
  }, []);

  useEffect(() => {
    // As duas leituras são assíncronas: os `setState` acontecem quando as
    // respostas chegam, não no corpo do efeito. Mesmo padrão do `useCachedList`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void lerModelos();
    void lerPedidos();
  }, [lerModelos, lerPedidos]);

  /** O «Tentar de novo» do painel de falha: volta ao esqueleto e repete. */
  function lerModelosOutraVez() {
    setACarregar(true);
    setFalhaAoLer(null);
    void lerModelos();
  }

  /** Os valores da pré-visualização: de um pedido a sério, ou os de exemplo. */
  useEffect(() => {
    if (!pedidoId) {
      setValoresReais(null);
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/email-templates/dados?pedido=${encodeURIComponent(pedidoId)}`, {
          cache: "no-store",
        });
        if (!vivo) return;
        if (!r.ok) {
          toast("Não foi possível ler esse pedido.", "error");
          setValoresReais(null);
          return;
        }
        const d = (await r.json()) as { valores?: Record<string, string> };
        setValoresReais(d?.valores ?? null);
      } catch {
        if (vivo) setValoresReais(null);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  const sujo = assunto !== baseAssunto || corpo !== baseCorpo;
  const erros = useMemo(() => validarModelo(assunto, corpo), [assunto, corpo]);
  const valores = valoresReais ?? VALORES_DE_EXEMPLO;

  const previsualizacao = useMemo(() => {
    const html = renderizarCorpo(paraGravar(corpo), valores);
    return `<!doctype html><html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0}body{padding:20px;background:#f7f4ee;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}</style></head><body>${html}</body></html>`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpo, valores, idioma, corpoEmTexto]);

  function inserir(texto: string, deslocaCursor = 0) {
    const alvo =
      campoActivo.current === "assunto"
        ? { el: assuntoRef.current, valor: assunto, set: setAssunto }
        : { el: corpoRef.current, valor: corpo, set: setCorpo };
    const el = alvo.el;
    if (!el) {
      alvo.set(alvo.valor + texto);
      return;
    }
    const inicio = el.selectionStart ?? alvo.valor.length;
    const fim = el.selectionEnd ?? alvo.valor.length;
    const { text, caret } = insertToken(alvo.valor, inicio, fim, texto);
    alvo.set(text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret + deslocaCursor, caret + deslocaCursor);
    });
  }

  /** Envolve o que estiver seleccionado — ou abre o bloco vazio no cursor. */
  function inserirBloco(negado: boolean) {
    const variavel = "evento_data";
    const abre = negado ? `{{#se_nao ${variavel}}}` : `{{#se ${variavel}}}`;
    const fecha = negado ? "{{/se_nao}}" : "{{/se}}";
    const el = corpoRef.current;
    campoActivo.current = "corpo";
    if (!el) {
      setCorpo(corpo + abre + fecha);
      return;
    }
    const inicio = el.selectionStart ?? corpo.length;
    const fim = el.selectionEnd ?? corpo.length;
    const dentro = corpo.slice(inicio, fim);
    const novo = corpo.slice(0, inicio) + abre + dentro + fecha + corpo.slice(fim);
    setCorpo(novo);
    // O cursor fica DENTRO do bloco: o gesto seguinte é escrever lá dentro.
    const posicao = inicio + abre.length + dentro.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(posicao, posicao);
    });
  }

  /**
   * ── UMA GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU ─────────────────────
   *
   * Este ficheiro tinha três cópias do mesmo `try { fetch } catch { toast("Não
   * foi possível …") }` — publicar, repor e enviar o teste —, e as três diziam
   * a mesma coisa à rede em baixo, à sessão expirada, ao servidor em baixo e a
   * uma recusa do conteúdo. Em metade dos casos «tenta outra vez» não podia
   * funcionar, e é a segunda tentativa falhada que faz alguém desistir do ecrã.
   *
   * Mesmo padrão do `MaterialListas`: um sítio só, a frase vem do
   * `porque-falhou`, nomeia a coisa e acaba numa instrução. Devolve o corpo
   * porque o teste precisa dele para dizer para onde é que o email foi.
   */
  async function gravar(
    oQue: string,
    url: string,
    init?: RequestInit,
  ): Promise<{ ok: boolean; corpo: unknown }> {
    let r: Response;
    try {
      r = await fetch(url, init);
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return { ok: false, corpo: null };
    }
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      toast(porqueFalhou(oQue, r, corpo).mensagem, "error");
      return { ok: false, corpo };
    }
    return { ok: true, corpo };
  }

  /** O nome da língua por extenso — «guardar o modelo «X» em pt» não se lê. */
  const nomeDaLingua = (l: Idioma) => (l === "pt" ? "português" : "inglês");

  async function guardar() {
    if (!modelo || aGuardar) return;
    if (!assunto.trim()) {
      toast("O assunto não pode ficar vazio.", "error");
      return;
    }
    if (erros.length) {
      toast("Há blocos mal fechados — corrige-os antes de publicar.", "error");
      return;
    }
    setAGuardar(true);
    try {
      const { ok, corpo: resposta } = await gravar(
        `publicar o modelo «${modelo.nome}» em ${nomeDaLingua(idioma)}`,
        "/api/email-templates/bilingues",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chave: modelo.chave,
            nome: modelo.nome,
            idioma,
            subject: assunto.trim(),
            body: paraGravar(corpo),
          }),
        },
      );
      if (!ok) return;
      const guardado = resposta as LadoDoModelo | null;
      setModelos((prev) =>
        prev.map((m) =>
          m.chave === modelo.chave
            ? {
                ...m,
                [idioma]: {
                  subject: assunto.trim(),
                  body: paraGravar(corpo),
                  updatedAt: guardado?.updatedAt ?? new Date().toISOString(),
                },
              }
            : m,
        ),
      );
      setBaseAssunto(assunto.trim());
      setBaseCorpo(corpo);
      if (historicoAberto) void carregarVersoes();
      toast("Modelo publicado.", "success");
    } finally {
      setAGuardar(false);
    }
  }

  const carregarVersoes = useCallback(async () => {
    if (!chave) return;
    setEstadoDoHistorico("a-ler");
    try {
      const r = await fetch(
        `/api/email-templates/versoes?chave=${encodeURIComponent(chave)}&idioma=${idioma}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: unknown } | null;
        // A lista antiga vai fora: era de outro modelo ou de outra língua, e
        // uma lista velha mostrada como se fosse desta é pior do que nenhuma —
        // «Repor» ao lado dela repõe a versão errada.
        setVersoes([]);
        setFalhaDoHistorico(typeof d?.error === "string" ? d.error : "");
        setEstadoDoHistorico("falhou");
        return;
      }
      const lista = (await r.json()) as VersaoDeModelo[];
      setVersoes(Array.isArray(lista) ? lista : []);
      setFalhaDoHistorico("");
      setEstadoDoHistorico("lido");
    } catch {
      setVersoes([]);
      setFalhaDoHistorico("");
      setEstadoDoHistorico("falhou");
    }
  }, [chave, idioma]);

  async function abrirHistorico() {
    const abrirAgora = !historicoAberto;
    setHistoricoAberto(abrirAgora);
    if (abrirAgora) await carregarVersoes();
  }

  async function reverter(versaoEm: string) {
    if (!modelo) return;
    const ok = window.confirm(
      "Voltar a esta versão? O texto que está a sair agora fica guardado no histórico, por isso podes desfazer.",
    );
    if (!ok) return;
    const { ok: passou, corpo: resposta } = await gravar(
      `repor a versão de ${horaCurta(versaoEm)} do modelo «${modelo.nome}»`,
      "/api/email-templates/versoes",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: modelo.chave, idioma, versaoEm }),
      },
    );
    if (!passou) return;
    const reposto = resposta as { subject: string; body: string; updatedAt: string } | null;
    if (!reposto || typeof reposto.body !== "string") {
      // Repôs (o servidor disse que sim) mas a resposta não veio legível.
      // Escrever isto nas caixas era pôr `undefined` no texto que sai para
      // clientes — mais vale não mexer no editor e mandar recarregar.
      toast(
        "Versão reposta, mas não deu para ler o texto que ficou. Atualiza a página antes de continuares.",
        "error",
      );
      return;
    }
    setModelos((prev) =>
      prev.map((m) => (m.chave === modelo.chave ? { ...m, [idioma]: reposto } : m)),
    );
    const repostoEmTexto = paraEditar(reposto.body);
    setAssunto(reposto.subject);
    setCorpo(repostoEmTexto);
    setBaseAssunto(reposto.subject);
    setBaseCorpo(repostoEmTexto);
    await carregarVersoes();
    toast("Versão reposta.", "success");
  }

  async function enviarTeste() {
    if (!modelo || aEnviarTeste) return;
    setAEnviarTeste(true);
    try {
      const { ok, corpo: resposta } = await gravar(
        `enviar o teste do modelo «${modelo.nome}»`,
        "/api/email-templates/teste",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: modelo.nome,
            subject: assunto,
            body: paraGravar(corpo),
            idioma,
            pedido: pedidoId,
            para: destinoDoTeste.trim(),
          }),
        },
      );
      if (!ok) return;
      const para = (resposta as { para?: unknown } | null)?.para;
      toast(
        `Teste enviado para ${typeof para === "string" ? para : "a caixa da Líquen"}.`,
        "success",
      );
    } finally {
      setAEnviarTeste(false);
    }
  }

  if (aCarregar) {
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
          aoTentarDeNovo={lerModelosOutraVez}
        />
      </div>
    );
  }

  const ladoVazio = !!modelo && !modelo[idioma].subject.trim() && !modelo[idioma].body.trim();

  return (
    /* ── O ESQUELETO DÁ LUGAR AOS MODELOS, EM VEZ DE SALTAR PARA ELES ───────
       O mesmo que no `EmailTemplates`, e pela mesma razão: enquanto
       `aCarregar`, um `SkeletonList` de quatro linhas; quando os modelos
       chegam, estas duas colunas montam de raiz e o esqueleto sai — até aqui,
       num só fotograma.

       `.bo-cena`: 600 ms e doze píxeis, a banda de apresentação, uma vez só no
       contentor. O esqueleto continua sem entrada. */
    <div className="bo-cena max-w-6xl grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
      {/* ── A lista ── */}
      <div className="bo-card overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-[var(--bo-hairline)]">
          <p className="bo-eyebrow">Modelos ({modelos.length})</p>
        </div>
        <div className="divide-y divide-[var(--bo-hairline)]">
          {modelos.map((m) => {
            const activo = m.chave === chave;
            const temIngles = !!m.en.subject.trim() || !!m.en.body.trim();
            return (
              <button
                key={m.chave}
                onClick={() => abrir(m, idioma)}
                className={`w-full text-left px-4 py-3 ${ESTADO} ${PRESSAO} ${
                  activo ? "bg-[var(--bo-marca)]/10" : "hover:bg-[var(--bo-tinta-3)]"
                }`}
              >
                <p
                  className={`text-sm ${activo ? "text-sage-600 font-medium" : "text-[var(--bo-tinta-72)]"}`}
                >
                  {m.nome}
                  {!temIngles && (
                    <span className="ml-1.5 rounded-full bg-[var(--bo-aviso-tom)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--bo-aviso)] align-middle">
                      sem EN
                    </span>
                  )}
                </p>
                {m.descricao && (
                  <p className="text-[11px] text-foreground/40 mt-0.5 leading-snug">
                    {m.descricao}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── EDITOR E PRÉ-VISUALIZAÇÃO LADO A LADO A PARTIR DE 1024 ─────────
          Era `xl:` (1280), e este ecrã é onde o mesmo texto se escreve em duas
          línguas: sem a pré-visualização ao lado, cada alteração custava uma
          descida e uma subida. Entre 1024 e 1280 havia espaço para as duas
          colunas e não se usava. O corte passa a ser o `lg` da casa — o mesmo
          do `EmailTemplates`, que é o mesmo ecrã noutra língua. */}
      {modelo ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* ── O editor ── */}
          <div className="bo-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="bo-eyebrow">A editar</p>
                <p className="text-sm text-[var(--bo-tinta-72)] mt-1">{modelo.nome}</p>
              </div>
              <div className="flex flex-wrap shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={abrirHistorico}>
                  {historicoAberto ? "Fechar histórico" : "Histórico"}
                </Button>
                <Button
                  variant="primary"
                  onClick={guardar}
                  loading={aGuardar}
                  disabled={aGuardar || !sujo || erros.length > 0}
                >
                  {aGuardar ? "A publicar…" : "Publicar"}
                </Button>
              </div>
            </div>

            {/* ── Língua ──
                Os dois separadores estão sempre presentes, mesmo quando o
                inglês ainda não existe: é a única maneira de ela reparar que
                falta — e a etiqueta di-lo, em vez de o ecrã fingir que está
                tudo escrito. */}
            <div
              ref={barraDaLinguaRef}
              /* `relative`: é esta barra o `offsetParent` das medidas que o
                 gancho devolve, e é dentro dela que a pílula se posiciona. */
              className="relative flex flex-wrap gap-1.5 mb-4"
              role="tablist"
              aria-label="Língua do modelo"
            >
              {/* A pílula que anda, entre um separador e o outro. `aria-hidden`
                  porque não diz nada que o `aria-selected` não diga melhor — é
                  desenho, não informação. Só anda a partir do segundo desenho
                  (`linguaPodeAndar`): sem isso, abrir um modelo fazia-a deslizar
                  do canto até ao «Português», a anunciar uma troca de língua que
                  ninguém fez. E `MARCA` traz `motion-safe:`, portanto quem pediu
                  para não animar vê-a mudar de sítio num fotograma. */}
              {marcaDaLingua && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-0 top-0 rounded-md bg-[var(--bo-marca)] ${
                    linguaPodeAndar ? MARCA : ""
                  }`}
                  style={{
                    translate: `${marcaDaLingua.x}px ${marcaDaLingua.y}px`,
                    width: marcaDaLingua.largura,
                    height: marcaDaLingua.altura,
                  }}
                />
              )}
              {(["pt", "en"] as Idioma[]).map((l) => {
                const activo = l === idioma;
                const vazio = !modelo[l].subject.trim() && !modelo[l].body.trim();
                return (
                  <button
                    key={l}
                    role="tab"
                    aria-selected={activo}
                    onClick={() => abrir(modelo, l)}
                    /* `relative`: o rótulo fica POR CIMA da pílula, que é um
                       irmão absoluto desenhado antes dele. */
                    className={`relative px-3 py-1.5 rounded-md text-xs ${ESTADO} ${PRESSAO} ${
                      activo
                        ? // O fundo próprio é a rede de antes de a pílula estar
                          // medida — no HTML do servidor não há medida nenhuma, e
                          // um separador activo sem fundo lia-se como inactivo.
                          // Sai no instante em que ela está no sítio: nunca há
                          // dois fundos, e nunca há nenhum. É a manobra do
                          // `Segmented`, contada lá por extenso.
                          `text-white ${marcaDaLingua ? "" : "bg-[var(--bo-marca)]"}`
                        : "bg-[var(--bo-marca)]/10 text-sage-600 hover:bg-[var(--bo-marca)]/20"
                    }`}
                  >
                    {l === "pt" ? "Português" : "English"}
                    {vazio && <span className="ml-1 opacity-70">(por escrever)</span>}
                  </button>
                );
              })}
            </div>

            {ladoVazio && (
              <p className="mb-4 rounded-lg bg-[var(--bo-aviso-tom)]/10 px-3 py-2 text-[11px] leading-relaxed text-[var(--bo-aviso)]">
                Este modelo ainda não tem versão inglesa. Enquanto não a escreveres, um pedido em
                inglês não recebe este modelo — em vez de receber português, não recebe nada e o
                envio diz-te porquê. Não traduzimos o teu texto à máquina.
              </p>
            )}

            <label htmlFor="etb-assunto" className="bo-eyebrow block mb-1.5">
              Assunto
            </label>
            <input
              id="etb-assunto"
              ref={assuntoRef}
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              onFocus={() => (campoActivo.current = "assunto")}
              placeholder="Assunto do email"
              className={`${inputCls} w-full mb-4`}
            />

            {/* ── O menu de variáveis, por grupos ──
                «Quem assina» é um grupo À PARTE e com a sua nota. Um menu que
                oferecesse um «nome» sem dono é onde a troca entre quem recebe
                e quem assina começa — e ela já aconteceu. */}
            <label className="bo-eyebrow block mb-1.5">Dados a inserir</label>
            <div className="space-y-2 mb-2">
              {VARIAVEIS_POR_GRUPO.filter((g) => g.itens.length > 0).map((grupo) => (
                <div key={grupo.grupo}>
                  <p className="text-[10px] uppercase tracking-wide text-foreground/35 mb-1">
                    {TITULO_DO_GRUPO[grupo.grupo]}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {grupo.itens.map((v) => (
                      <button
                        key={v.chave}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => inserir(`{{${v.chave}}}`)}
                        title={v.dica}
                        className={`px-2.5 py-1 rounded-md text-[11px] ${ESTADO} ${PRESSAO} ${
                          grupo.grupo === "remetente"
                            ? "bg-[var(--bo-aviso)]/10 text-[var(--bo-aviso)] hover:bg-[var(--bo-aviso)]/20"
                            : "bg-[var(--bo-marca)]/10 text-sage-600 hover:bg-[var(--bo-marca)]/20"
                        }`}
                      >
                        {v.rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-foreground/40 mb-4 leading-relaxed">
              «Quem assina» é quem envia o email — nunca o cliente. Se um dado não existir no
              pedido, sai vazio: usa um bloco «só se» para escrever o que dizer nesse caso.
            </p>

            {/* ── Blocos condicionais ── */}
            <label className="bo-eyebrow block mb-1.5">Texto que só aparece às vezes</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => inserirBloco(false)}
                className={`px-2.5 py-1 rounded-md text-[11px] bg-[var(--bo-marca)]/10 text-sage-600 hover:bg-[var(--bo-marca)]/20 ${ESTADO} ${PRESSAO}`}
              >
                só se houver data
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => inserirBloco(true)}
                className={`px-2.5 py-1 rounded-md text-[11px] bg-[var(--bo-marca)]/10 text-sage-600 hover:bg-[var(--bo-marca)]/20 ${ESTADO} ${PRESSAO}`}
              >
                só se NÃO houver data
              </button>
            </div>
            <p className="text-[11px] text-foreground/40 mb-4 leading-relaxed">
              Selecciona o texto e carrega — ele passa a aparecer só nesse caso. Trocando{" "}
              <span className="font-mono text-[var(--bo-text-muted)]">evento_data</span> por outro
              nome, a regra passa a ser sobre esse dado.
            </p>

            <label htmlFor="etb-corpo" className="bo-eyebrow block mb-1.5">
              Mensagem
            </label>
            <textarea
              id="etb-corpo"
              ref={corpoRef}
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              onFocus={() => (campoActivo.current = "corpo")}
              spellCheck={false}
              rows={14}
              className={`${inputCls} w-full font-mono !text-xs pointer-coarse:!text-base leading-relaxed resize-y`}
            />

            {erros.length > 0 && (
              <ul className="mt-2 space-y-1" aria-live="polite">
                {erros.map((e) => (
                  <li key={e} className="text-[11px] leading-snug text-[var(--bo-perigo)]">
                    {e}
                  </li>
                ))}
              </ul>
            )}

            {historicoAberto && (
              <div className="mt-5 border-t border-[var(--bo-hairline)] pt-4">
                {/* A contagem também espera: «(0)» é uma afirmação, e faz-se
                    com a lista na mão, não a caminho dela nem depois de a
                    leitura ter falhado. */}
                <p className="bo-eyebrow mb-2">
                  Histórico{estadoDoHistorico === "lido" ? ` (${versoes.length})` : ""}
                </p>
                {estadoDoHistorico === "a-ler" ? (
                  <p className="text-[11px] text-foreground/40 leading-relaxed" aria-live="polite">
                    A ler as versões anteriores…
                  </p>
                ) : estadoDoHistorico === "falhou" ? (
                  <AvisoDeFalha
                    titulo="Não foi possível ler as versões anteriores"
                    mensagem={falhaDoHistorico}
                    aoTentarDeNovo={() => void carregarVersoes()}
                  />
                ) : versoes.length === 0 ? (
                  <p className="text-[11px] text-foreground/40 leading-relaxed">
                    Ainda não há versões anteriores desta língua. A primeira aparece quando
                    publicares uma alteração.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {versoes.map((v) => (
                      <li
                        key={v.versaoEm}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="text-[11px] text-foreground/50 min-w-0 break-words">
                          {horaCurta(v.versaoEm)} · {v.subject || "(sem assunto)"}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => reverter(v.versaoEm)}>
                          Repor
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-foreground/40 mt-2 leading-relaxed">
                  Guardam-se as últimas 10 versões de cada língua. Repor é ele próprio desfazível: o
                  texto que está a sair agora fica no histórico.
                </p>
              </div>
            )}
          </div>

          {/* ── Pré-visualização + teste ── */}
          <div className="bo-card p-5 lg:sticky lg:top-5">
            <p className="bo-eyebrow mb-1.5">Pré-visualização</p>

            {/* `aria-labelledby` e não só o `for`: o `for` de um `<label>`
                nomeia um `<select>` por ele ser nativo, mas não nomeia um
                `role="combobox"`. Os dois ficam — o `for` para o clique no
                rótulo levar ao campo, o `aria-labelledby` para o nome. */}
            <label id="etb-pedido-rotulo" htmlFor="etb-pedido" className="sr-only">
              Pedido a usar na pré-visualização
            </label>
            <Escolha
              id="etb-pedido"
              aria-labelledby="etb-pedido-rotulo"
              valor={pedidoId}
              aoMudar={setPedidoId}
              variante="nua"
              containerClassName="mb-2 w-full"
              className={`${inputCls} w-full`}
            >
              <option value="">Dados de exemplo</option>
              {pedidos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.etiqueta}
                  {p.semData ? " · sem data" : ""}
                  {p.idioma === "en" ? " · EN" : ""}
                </option>
              ))}
            </Escolha>
            {/* NÃO é o `AvisoDeFalha` de página inteira, de propósito: a
                pré-visualização continua a funcionar com os dados de exemplo,
                e um painel vermelho por cima dela diria que rebentou tudo. O
                que falhou foi só a lista de pedidos — diz-se onde ela está, e
                dá-se por onde repetir.

                ── E APARECE DE ALGUM SÍTIO ────────────────────────────────
                `.bo-entrada` — 240 ms e QUATRO píxeis, a distância de um
                rótulo. Nasce colado ao `<select>` logo acima, que é o campo de
                que ele fala: a lista que ficou só com os dados de exemplo é
                aquela. Os oito píxeis da `.bo-entrada-folha` são de quem vem
                de fora do ecrã, e este vem daqui.

                A frase está legível bem antes dos 240 ms — a curva da casa
                gasta a distância quase toda no arranque —, que é a regra que
                manda num aviso: a animação diz de onde ele veio, nunca atrasa
                o que ele tem para dizer. */}
            {falhaNosPedidos !== null && (
              <div
                role="alert"
                className="bo-entrada mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[var(--bo-perigo-lavagem)]/60 px-3 py-2 text-[11px] leading-relaxed text-[var(--bo-perigo)]"
              >
                <span>
                  Não foi possível ler os pedidos para pré-visualizar
                  {falhaNosPedidos ? ` — ${falhaNosPedidos}` : ""}. A lista acima ficou só com os
                  dados de exemplo.
                </span>
                <Button variant="ghost" size="sm" onClick={() => void lerPedidos()}>
                  Tentar de novo
                </Button>
              </div>
            )}
            <p className="text-[11px] text-foreground/40 mb-3 leading-relaxed">
              Escolhe um pedido a sério para veres o que este modelo diz com os dados dele — um
              pedido sem data é a melhor maneira de ver os blocos a funcionar. No fim, a assinatura
              da Líquen entra sozinha: não precisas de te despedir.
            </p>

            <div className="rounded-lg border border-[var(--bo-hairline)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--bo-tinta-3)] border-b border-[var(--bo-hairline)]">
                <p className="text-[10px] text-foreground/40">Assunto</p>
                <p className="text-sm text-[var(--bo-tinta-72)] break-words">
                  {renderizarAssunto(assunto, valores) || (
                    <span className="text-foreground/30">(sem assunto)</span>
                  )}
                </p>
              </div>
              <iframe
                title="Pré-visualização do email"
                srcDoc={previsualizacao}
                sandbox=""
                className="w-full block bg-[var(--bo-chao)]"
                style={{ height: 420, border: "none" }}
              />
            </div>

            {/* ── O teste ── */}
            <div className="mt-4 border-t border-[var(--bo-hairline)] pt-4">
              <label htmlFor="etb-teste" className="bo-eyebrow block mb-1.5">
                Enviar um teste
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="etb-teste"
                  type="email"
                  value={destinoDoTeste}
                  onChange={(e) => setDestinoDoTeste(e.target.value)}
                  placeholder="para a caixa da Líquen"
                  className={`${inputCls} flex-1 min-w-0`}
                />
                <Button variant="subtle" onClick={enviarTeste} loading={aEnviarTeste}>
                  {aEnviarTeste ? "A enviar…" : "Enviar teste"}
                </Button>
              </div>
              <p className="text-[11px] text-foreground/40 mt-2 leading-relaxed">
                Vai o texto que está no editor, mesmo por publicar, com «[TESTE]» no assunto. Nunca
                é enviado para o cliente do pedido escolhido.
              </p>
            </div>
          </div>
        </div>
      ) : modelos.length === 0 ? (
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
    </div>
  );
}
