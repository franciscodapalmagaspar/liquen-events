"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";
import { nomeDoFicheiroDaProposta } from "@/lib/email-proposta-textos";
import { MARCADOR_DA_LIGACAO, temLigacaoDaProposta } from "@/lib/email-ligacao-reservada";
// `email-limites` e NÃO `email-corpo-escrito`: aquele é `server-only` e
// arrasta o nodemailer para dentro do pacote do browser. Ver o cabeçalho do
// `email-limites.ts` — foi assim que o build parou.
import { MAXIMO_CORPO_ESCRITO } from "@/lib/email-limites";
import { tamanhoEmPalavras } from "@/lib/custo-do-pdf";
import { Button, Field } from "./ui";
import { useGaveta } from "./ui/gaveta";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL, À VISTA, ANTES DE ALGUÉM CARREGAR EM ENVIAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O passo «Enviar» do estúdio dizia para quem ia e quanto custava, e sobre o
 * EMAIL — que é a única coisa que o casal chega a ler antes de abrir o PDF —
 * não dizia nada. O texto era escolhido no servidor, entre o modelo dela e o
 * texto da casa, e quem carregava no botão só o via depois, na caixa de saída.
 *
 * Isto é esse email: quem recebe, quem assina, de que modelo parte, o texto já
 * com os dados daquele casal lá dentro, e o ficheiro que segue em anexo.
 *
 * ── A REGRA QUE DESENHA ESTE ECRÃ ─────────────────────────────────────────
 *
 * Palavras dela: «se ninguém quiser alterar esse texto, coloca esse texto para
 * mandar para o cliente». ENVIAR SEM EDITAR É O CAMINHO MAIS CURTO — não há
 * aqui um passo a validar, uma caixa a desdobrar nem um botão a «usar este
 * texto». O que abre já está pronto a sair; a caixa está aberta porque se pode
 * mexer nela, não porque falte fazer-lhe alguma coisa.
 *
 * ── O QUE ISTO NÃO FAZ, E É DECISÃO DELA ──────────────────────────────────
 *
 * Não há rastreio nenhum: nem pixel, nem endereço que conte cliques, nem aviso
 * de leitura. O que se guarda do envio são factos do lado de cá — ver o
 * `envios-de-proposta.ts`, onde isso está escrito para quem vier a seguir.
 *
 * ── QUEM ASSINA NÃO É UM CAMPO ────────────────────────────────────────────
 *
 * O remetente vem do servidor, do cookie assinado da sessão (`email-quem-assina`
 * .ts), e MOSTRA-SE. Um campo aqui era deixar qualquer pessoa com sessão pôr o
 * nome de outra debaixo de um email.
 */

/** Uma variável que ficou vazia À VISTA no texto — vem pronta do servidor. */
export interface VariavelEmFalta {
  chave: string;
  rotulo: string;
}

interface ModeloDaLista {
  chave: string;
  nome: string;
  descricao?: string;
  temEsteIdioma?: boolean;
}

interface RespostaDoRascunho {
  rascunho?: { chave: string; nome: string; assunto: string; texto: string; avisos?: string[] };
  porPreencher?: VariavelEmFalta[];
  remetente?: string;
  destinatario?: { nome: string; email: string };
  modelos?: ModeloDaLista[];
  porOmissao?: string;
  error?: string;
}

export interface EmailDoEnvioProps {
  quoteId: string;
  doc: ProposalDoc;
  /** A língua da proposta — a mesma do PDF, escolhida ao lado. */
  idioma: IdiomaDaProposta;
  /** A nota pessoal do passo «Enviar»: alguns modelos citam-na. */
  mensagem: string;
  /**
   * O passo «Enviar» está à vista?
   *
   * O passo 3 fica MONTADO enquanto se escreve o conteúdo (é um `hidden`, não
   * uma remoção da árvore), e sem isto cada tecla escrita no passo 1 mandava
   * uma leitura do rascunho para o servidor.
   */
  activo: boolean;
  /** O corpo que vai sair. Vive no estúdio porque é ele que o envia. */
  corpo: string;
  onCorpo: (texto: string) => void;
  assunto: string;
  onAssunto: (texto: string) => void;
  /** A chave do modelo de que este texto partiu (para a cópia do envio). */
  onModelo: (chave: string) => void;
  /** O tamanho do PDF em bytes e se foi MEDIDO (pré-visualização) ou estimado. */
  bytesDoAnexo: number;
  bytesMedidos: boolean;
  /** O nome do anexo, escrito por ela. Vazio = composto automaticamente. */
  onNomeDoFicheiro: (nome: string) => void;
}

/** Quanto tempo se espera antes de ir buscar o rascunho outra vez. Escrever a
 *  mensagem pessoal muda o rascunho (há modelos que a citam) e não pode ser uma
 *  ida à rede por tecla. */
const ESPERA_MS = 400;

export default function EmailDoEnvio({
  quoteId,
  doc,
  idioma,
  mensagem,
  activo,
  corpo,
  onCorpo,
  assunto,
  onAssunto,
  onModelo,
  bytesDoAnexo,
  bytesMedidos,
  onNomeDoFicheiro,
}: EmailDoEnvioProps) {
  /** «Ver como o cliente o recebe». Ver `ui/gaveta.ts`. */
  const gaveta = useGaveta();
  const [modelo, setModelo] = useState("");
  const [modelos, setModelos] = useState<ModeloDaLista[]>([]);
  const [remetente, setRemetente] = useState("");
  const [destinatario, setDestinatario] = useState<{ nome: string; email: string } | null>(null);
  const [porPreencher, setPorPreencher] = useState<VariavelEmFalta[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aLer, setALer] = useState(false);
  /** O texto que o servidor entregou da última vez. Serve para saber se o que
   *  está na caixa foi mexido à mão — e é a única coisa que decide se um
   *  rascunho novo pode substituir o que lá está. */
  const [ultimoRascunho, setUltimoRascunho] = useState<{
    assunto: string;
    texto: string;
  } | null>(null);
  /** O que se substituiu quando ela trocou de modelo com texto escrito à mão.
   *  Um clique repõe-no: trocar de modelo não pode ser um caminho sem volta. */
  const [reposicao, setReposicao] = useState<{ assunto: string; texto: string } | null>(null);

  /**
   * O QUE ESTÁ NA CAIXA AGORA, para quem volta de uma ida à rede.
   *
   * A leitura do rascunho começa antes e acaba depois de se escrever na caixa,
   * e uma função `async` só conhece o que existia quando ELA arrancou. Sem
   * isto, a comparação «isto foi mexido à mão?» era feita contra o texto de há
   * um segundo — e o botão de repor devolvia uma caixa vazia. É a mesma razão
   * (e a mesma solução) do `docActual` do estúdio.
   *
   * Escreve-se DEPOIS de desenhar (o efeito sem lista de dependências corre a
   * cada pintura) e lê-se só de dentro do `async`: um `ref` mexido a meio do
   * desenho é o que o compilador do React proíbe, e com razão.
   */
  const agora = useRef({ corpo, assunto, ultimo: ultimoRascunho });
  useEffect(() => {
    agora.current = { corpo, assunto, ultimo: ultimoRascunho };
  });

  const mexidoAMao = ultimoRascunho !== null && corpo.trim() !== ultimoRascunho.texto.trim();

  /**
   * Ir buscar o rascunho.
   *
   * `substituir` diz se o texto da caixa pode ser trocado. Numa troca de modelo
   * é SEMPRE sim — é isso que se pediu ao trocar —, mas na releitura que se
   * segue a uma mudança do documento é «só se ninguém lhe tiver mexido»: o
   * contrário deitava fora, sem aviso, um texto escrito à mão.
   */
  const buscar = useCallback(
    async (chave: string, substituir: "sempre" | "se-intacto", sinal: AbortSignal) => {
      setALer(true);
      try {
        const res = await fetch(`/api/orcamento/${quoteId}/email-rascunho`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: sinal,
          body: JSON.stringify({
            ...(chave ? { modelo: chave } : {}),
            idioma,
            doc,
            ...(mensagem.trim() ? { mensagem: mensagem.trim() } : {}),
          }),
        });
        const data = (await res.json().catch(() => null)) as RespostaDoRascunho | null;
        if (sinal.aborted) return;
        if (!res.ok || !data?.rascunho) {
          // O ecrã não fica em branco nem trava o envio: mostra a frase e
          // continua a oferecer os outros modelos. Nada disto enviou nada.
          setErro(data?.error ?? "Não foi possível preparar o texto do email.");
          if (Array.isArray(data?.modelos)) setModelos(data.modelos);
          return;
        }
        setErro(null);
        setModelos(Array.isArray(data.modelos) ? data.modelos : []);
        setRemetente(String(data.remetente ?? ""));
        setDestinatario(data.destinatario ?? null);
        setPorPreencher(Array.isArray(data.porPreencher) ? data.porPreencher : []);
        setAvisos(Array.isArray(data.rascunho.avisos) ? data.rascunho.avisos : []);
        setModelo(data.rascunho.chave);
        onModelo(data.rascunho.chave);

        const { corpo: naCaixa, assunto: assuntoNaCaixa, ultimo: anterior } = agora.current;
        const intacto = anterior !== null && anterior.texto.trim() === naCaixa.trim();
        const podeTrocar = substituir === "sempre" || anterior === null || intacto;
        setUltimoRascunho({ assunto: data.rascunho.assunto, texto: data.rascunho.texto });
        if (podeTrocar) {
          // Só se guarda a reposição quando havia MESMO texto escrito à mão para
          // perder — senão o botão de repor aparecia a oferecer o texto que ela
          // acabou de deixar para trás de propósito.
          if (substituir === "sempre" && anterior && !intacto) {
            setReposicao({ assunto: assuntoNaCaixa, texto: naCaixa });
          } else {
            setReposicao(null);
          }
          onCorpo(data.rascunho.texto);
          onAssunto(data.rascunho.assunto);
        }
      } catch (e) {
        if (sinal.aborted || (e as Error)?.name === "AbortError") return;
        setErro("Não foi possível preparar o texto do email.");
      } finally {
        if (!sinal.aborted) setALer(false);
      }
    },
    // O que está na caixa entra pelos `ref`s acima e NÃO por dependência: uma
    // função nova a cada tecla escrita fazia o efeito abaixo pedir o rascunho
    // outra vez — e o que se escreve seria substituído por si próprio.
    [quoteId, idioma, doc, mensagem, onCorpo, onAssunto, onModelo],
  );

  /**
   * A LEITURA. Só com o passo à vista, e com uma pausa: escrever a mensagem
   * pessoal muda o rascunho, e uma ida à rede por tecla era o ecrã a piscar.
   */
  useEffect(() => {
    if (!activo) return;
    const controlo = new AbortController();
    const t = setTimeout(() => void buscar(modelo, "se-intacto", controlo.signal), ESPERA_MS);
    return () => {
      clearTimeout(t);
      controlo.abort();
    };
    // `modelo` de fora: a troca de modelo tem o seu próprio caminho (abaixo),
    // que substitui o texto SEMPRE. Se entrasse aqui, a troca fazia duas
    // leituras e a segunda desfazia a primeira.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, buscar]);

  function trocarDeModelo(chave: string) {
    setModelo(chave);
    const controlo = new AbortController();
    void buscar(chave, "sempre", controlo.signal);
  }

  const nomeDoAnexo = nomeDoFicheiroDaProposta(
    {
      escolhido: doc.nomeDoFicheiro,
      clientNames: doc.clientNames,
      eventDate: doc.eventDate,
      ref: quoteId,
    },
    idioma,
  );
  /** O nome que a composição daria — é o que o botão «Automático» repõe, e o
   *  que a caixa mostra como sugestão quando está vazia. */
  const nomeComposto = nomeDoFicheiroDaProposta(
    { clientNames: doc.clientNames, eventDate: doc.eventDate, ref: quoteId },
    idioma,
  );
  const nomeEscrito = (doc.nomeDoFicheiro ?? "").trim();
  const semLigacao = corpo.trim().length > 0 && !temLigacaoDaProposta(corpo);
  const passaDoTecto = corpo.length > MAXIMO_CORPO_ESCRITO;

  return (
    <section
      aria-labelledby="email-do-envio-titulo"
      className="mt-5 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)]/70 p-4"
    >
      <h3 id="email-do-envio-titulo" className="font-display text-base text-[var(--bo-text)]">
        O email que o cliente vai receber
      </h3>

      {/* ── QUEM RECEBE E QUEM ASSINA ────────────────────────────────────────
          Lado a lado a partir dos 640 px; empilhados no telemóvel, onde uma
          grelha de duas colunas parte o endereço a meio. */}
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-foreground/50">Para</dt>
          <dd className="min-w-0 break-words text-[var(--bo-text)]">
            {destinatario?.nome ? `${destinatario.nome} · ` : ""}
            {destinatario?.email || "—"}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-foreground/50">Assina</dt>
          <dd className="min-w-0 break-words text-[var(--bo-text)]">
            {remetente || "—"}
            {/* Não é um campo, e diz-se porquê no sítio onde alguém procuraria
                o campo. */}
            <span className="ml-1.5 text-xs text-foreground/45">(da tua sessão)</span>
          </dd>
        </div>
      </dl>

      {/* ── O MODELO, COM TROCA RÁPIDA ───────────────────────────────────────
          Um `select` e não uma fila de botões: são vários modelos, os nomes são
          longos, e a 390 px uma fila de pastilhas passa a duas linhas e come o
          ecrã todo. Um toque abre, um toque escolhe. */}
      <div className="mt-4">
        <Field
          as="select"
          label="Modelo"
          value={modelo}
          onChange={(e) => trocarDeModelo(e.target.value)}
          hint="O texto abaixo parte deste modelo, já com os dados deste casal. Trocar de modelo reescreve o texto."
        >
          {/* Enquanto a lista não chega (a primeira leitura), o modelo que abriu
              tem de ter uma opção sua — senão o `select` aparece vazio. */}
          {modelos.length === 0 && modelo && <option value={modelo}>{modelo}</option>}
          {modelos.map((m) => (
            <option key={m.chave} value={m.chave}>
              {m.nome}
              {m.temEsteIdioma === false ? " (sem versão nesta língua)" : ""}
            </option>
          ))}
        </Field>
      </div>

      {erro && (
        <p
          aria-live="polite"
          className="mt-3 flex items-start gap-1.5 rounded-xl border border-[var(--bo-perigo)]/35 bg-[var(--bo-perigo)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            {erro} Escolhe outro modelo, ou escreve o texto aqui em baixo — o email sai à mesma.
          </span>
        </p>
      )}

      {/* ── O ASSUNTO ────────────────────────────────────────────────────────
          É a única linha que o casal lê ANTES de decidir se abre, e saía sem
          nunca aparecer no ecrã. */}
      <div className="mt-4">
        <Field
          label="Assunto"
          value={assunto}
          onChange={(e) => onAssunto(e.target.value)}
          placeholder="A vossa proposta — Líquen Events"
        />
      </div>

      {/* ── O TEXTO, JÁ RESOLVIDO E EDITÁVEL ────────────────────────────────
          Aberto, sem nada a desdobrar e sem nada a confirmar: quem não quiser
          mexer carrega em Enviar e acabou. */}
      <div className="mt-4">
        <Field
          as="textarea"
          label="Texto do email"
          rows={12}
          value={corpo}
          onChange={(e) => onCorpo(e.target.value)}
          className="resize-y font-sans"
          hint={
            aLer
              ? "A preparar o texto com os dados desta proposta…"
              : "Já está com os dados deste casal. Se não quiseres mudar nada, é este que segue. A assinatura da Líquen entra sozinha no fim."
          }
          error={
            passaDoTecto
              ? `O texto passa dos ${MAXIMO_CORPO_ESCRITO} caracteres e o envio vai ser recusado. Encurta-o.`
              : undefined
          }
        />
        {reposicao && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--bo-text-muted)]">
              O texto que tinhas escrito foi substituído pelo modelo.
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onCorpo(reposicao.texto);
                onAssunto(reposicao.assunto);
                setReposicao(null);
              }}
            >
              Repor o meu texto
            </Button>
          </div>
        )}
        {mexidoAMao && !reposicao && (
          <p className="mt-2 text-xs text-foreground/50">
            Este texto foi escrito por ti — o modelo já não lhe toca.
          </p>
        )}
      </div>

      {/* ── «NADA PIOR DO QUE ENVIAR "OLÁ ,"» ───────────────────────────────
          A lista vem PRONTA do servidor, que sabe quais das variáveis vazias
          ficaram mesmo à vista no texto e quais é que o `{{#se}}` do modelo
          dela já cobriu. Aqui não se recalcula regra nenhuma. */}
      {porPreencher.length > 0 && (
        <p
          aria-live="polite"
          className="mt-4 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/40 bg-[var(--bo-aviso-tom)]/[0.07] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            Ficou por preencher, e vai sair assim:{" "}
            <strong className="font-medium">{porPreencher.map((v) => v.rotulo).join(", ")}</strong>.
            Corrige o texto acima antes de enviar — ou preenche o dado no passo «Evento».
          </span>
        </p>
      )}

      {avisos.map((a) => (
        <p
          key={a}
          className="mt-2 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
        >
          <span aria-hidden="true">⚠</span>
          <span>{a}</span>
        </p>
      ))}

      {/* Apagar o marcador é uma escolha legítima (há quem prefira falar
          antes), mas não pode ser uma escolha por acidente. */}
      {semLigacao && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--bo-text-muted)]">
          <span aria-hidden="true">·</span>
          <span>
            O texto não tem a ligação da proposta. O casal fica com o PDF em anexo e mais nada — se
            quiseres a ligação, escreve{" "}
            <code className="text-[var(--bo-tinta-72)]">{MARCADOR_DA_LIGACAO}</code> onde ela deve
            aparecer.
          </span>
        </p>
      )}

      {/* ── O ANEXO ──────────────────────────────────────────────────────────
          O nome sai da MESMA função que o servidor usa para nomear o anexo, e
          não de uma segunda escrita à mão: duas versões do nome era o ecrã a
          dizer um ficheiro e o email a levar outro. */}
      <dl className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <dt className="text-foreground/50">Anexo</dt>
        <dd className="min-w-0 break-all text-[var(--bo-text)]">
          {nomeDoAnexo}
          <span className="ml-1.5 whitespace-nowrap text-xs text-foreground/50">
            {bytesDoAnexo > 0
              ? `· ${tamanhoEmPalavras(bytesDoAnexo)}${bytesMedidos ? "" : " (estimado)"}`
              : "· tamanho só depois de gerar o PDF"}
          </span>
        </dd>
      </dl>

      {/* ── O NOME DO FICHEIRO, ESCRITO POR ELA ─────────────────────────────
          Pedido dela: «gostava de poder editar o nome do pdf que vai ser
          gerado». Fica AQUI, um dedo abaixo da linha que mostra o nome, porque
          é aqui que ela o lê — um campo com o mesmo assunto noutro ecrã era
          obrigar a procurar o sítio onde se muda o que se está a ver.

          O resultado aparece na linha «Anexo» acima enquanto se escreve: a
          limpeza (letras, números e hífenes — um acento num anexo ainda hoje
          chega partido a alguns clientes de correio) nunca é uma surpresa,
          porque se vê a acontecer. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor="nome-do-anexo" className="shrink-0 text-xs text-foreground/50">
          Nome do ficheiro
        </label>
        <input
          id="nome-do-anexo"
          value={nomeEscrito}
          onChange={(e) => onNomeDoFicheiro(e.target.value)}
          placeholder={nomeComposto.replace(/\.pdf$/i, "")}
          className="bo-input min-w-0 flex-1 px-2.5 py-1.5 text-xs sm:max-w-sm"
        />
        {nomeEscrito !== "" && (
          <Button size="sm" variant="ghost" onClick={() => onNomeDoFicheiro("")}>
            ↺ Automático
          </Button>
        )}
        <p className="w-full text-[11px] leading-snug text-foreground/50">
          Em branco, o nome é composto sozinho — a casa, o casal e a data do evento. O que
          escreveres aqui vale para o anexo do email, para a descarga do link do casal e para o
          botão do estúdio: é o mesmo ficheiro nos três sítios, e o casal tem de o reconhecer.
        </p>
      </div>

      {/* ── COMO O CLIENTE O RECEBE ──────────────────────────────────────────
          O texto acima já está resolvido, portanto isto não é «ver as variáveis
          preenchidas» — é ver a FORMA: os parágrafos, o assunto por cima e o
          fecho da casa que entra sozinho. Fechado por omissão porque o caminho
          curto é enviar, e aberto num toque para quem quiser confirmar. */}
      <details
        className="mt-4 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-chao)]/60"
        onToggle={gaveta.aoAlternar}
      >
        <summary
          onClick={gaveta.aoTocarNoResumo}
          className={` list-none px-3 py-2 text-xs text-[var(--bo-text-muted)] ${ESTADO} ${PRESSAO}`}
        >
          <span aria-hidden="true">▸ </span>Ver como o cliente o recebe
        </summary>
        {/* A pré-visualização inteira é UM bloco: o assunto, os parágrafos e a
            nota do fecho lêem-se como uma folha de papel, e uma folha não entra
            aos bocados. Os 240 ms e os quatro píxeis da `.bo-entrada`. */}
        <div className={`border-t border-[var(--bo-hairline-strong)] px-3 py-3 ${gaveta.corpo}`}>
          <p className="text-xs text-foreground/50">Assunto</p>
          <p className="text-sm text-[var(--bo-text)]">{assunto || "—"}</p>
          <div className="mt-3 border-t border-[var(--bo-hairline-strong)] pt-3">
            {corpo
              .split(/\n[ \t]*\n/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((paragrafo, i) => (
                <p
                  key={i}
                  className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--bo-text)]"
                >
                  {paragrafo}
                </p>
              ))}
            <p className="mt-3 border-t border-[var(--bo-hairline-strong)] pt-3 text-xs leading-relaxed text-foreground/50">
              A seguir entra a assinatura da Líquen (Catarina Gaspar e contactos) e o PDF em anexo.
              {temLigacaoDaProposta(corpo)
                ? ` O ${MARCADOR_DA_LIGACAO} vira o endereço da proposta no momento do envio — ele só existe quando a proposta é criada.`
                : ""}
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}
