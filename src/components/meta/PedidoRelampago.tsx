"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/track";
import { meta } from "@/lib/meta/enviar";
import { temConsentimento } from "@/lib/meta/consentimento";
import { lerClique, serializar } from "@/lib/ads/click-id";
import { lerIdentificadores, serializar as serializarMeta } from "@/lib/meta/click-id";
import { LEAD_SOURCE_KEY } from "@/components/LeadSourceCapture";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import { clearSubmissionId, ensureSubmissionId } from "@/lib/orcamento/submission-id";
import { useTranslationsSeHouver } from "@/components/LocaleProvider";
import {
  TEXTOS_DE_RECURSO,
  carregarTelefones,
  fraseDoTelefoneInvalido,
} from "@/lib/telefone-no-browser";
import { BOTAO_APPLE, CAMPO_APPLE, ROTULO_APPLE } from "@/lib/formulario-apple";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O FORMULÁRIO DE QUATRO CAMPOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `PedidoRapido` das páginas do Google tem SEIS campos (data, convidados,
 * local, nome, email, telemóvel). Aqui são QUATRO: data, local, contacto,
 * nome. O resto pergunta-se na resposta.
 *
 * ── PORQUE É QUE SÃO QUATRO E NÃO TRÊS ─────────────────────────────────────
 * Foi pedido "contacto + data + local". Falta o NOME, e não é enchimento: a
 * primeira coisa que a equipa faz com um pedido é responder, e responder a
 * alguém sem saber como se chama começa a conversa mal. Quatro campos num
 * telemóvel são quatro toques; o que se cortou foi o que custava pensar —
 * quantos convidados (que muita gente ainda não sabe) e a escolha entre dar
 * email OU telefone.
 *
 * ── O CAMPO "CONTACTO" É UM SÓ ─────────────────────────────────────────────
 * Email e telemóvel eram dois campos e passaram a um. Escreve-se o que se
 * tiver à mão; aqui decide-se qual é qual pela forma (há `@` ou não), e a
 * rota do orçamento aceita agora um dos dois — antes exigia sempre email, que
 * era o que obrigava a ter os dois campos.
 *
 * Quem vem do Instagram tem o teclado na mão e escreve o número. Quem está no
 * computador escreve o email. Nenhum dos dois é obrigado a fornecer o outro.
 *
 * ── O QUE VIAJA JUNTO, ALÉM DO QUE SE VÊ ───────────────────────────────────
 *   • `adClick`   — o identificador do clique da Google (se veio de lá antes);
 *   • `metaClick` — o `fbp` e o `fbc` da Meta, para o valor real do casamento
 *                   poder voltar à Meta quando ele fechar;
 *   • `leadEventId` — o `event_id` do evento `Lead`, para o servidor poder
 *                   reenviar pela CAPI sem duplicar.
 *
 * ── BASE LEGAL ─────────────────────────────────────────────────────────────
 * Igual à do formulário das páginas do Google: diligência pré-contratual
 * (RGPD art. 6.º/1/b), sem caixa de consentimento, com o aviso de privacidade
 * visível. O consentimento que existe nesta página é OUTRO — o do pixel — e
 * vive no banner de cookies.
 */

export interface TextosRelampago {
  /** O que a data vazia diz no toque (o iPhone não escreve nada lá dentro). */
  escolherData: string;
  titulo: string;
  subtitulo: string;
  data: string;
  local: string;
  localPlaceholder: string;
  contacto: string;
  contactoPlaceholder: string;
  contactoAjuda: string;
  nome: string;
  submeter: string;
  aSubmeter: string;
  erro: string;
  erroContacto: string;
  privacidade: string;
  privacidadeLink: string;
}

export const RELAMPAGO_PT: TextosRelampago = {
  titulo: "Pedir orçamento",
  subtitulo: "Quatro campos. Respondemos em 48 horas úteis.",
  data: "Data do casamento",
  escolherData: "Escolher a data",
  local: "Onde",
  localPlaceholder: "Quinta, herdade ou localidade",
  contacto: "Contacto",
  contactoPlaceholder: "Telemóvel ou email",
  contactoAjuda: "O que lhe der mais jeito.",
  nome: "Nome",
  submeter: "Enviar",
  aSubmeter: "A enviar",
  erro: "Não foi possível enviar. Tente novamente ou fale connosco por WhatsApp.",
  erroContacto: "Escreva um telemóvel ou um email para lhe podermos responder.",
  privacidade: "Os dados servem apenas para responder ao pedido. Ver",
  privacidadeLink: "política de privacidade",
};

export const RELAMPAGO_EN: TextosRelampago = {
  titulo: "Request a quote",
  subtitulo: "Four fields. We reply within two working days.",
  data: "Wedding date",
  escolherData: "Choose a date",
  local: "Where",
  localPlaceholder: "Venue, estate or town",
  contacto: "Contact",
  contactoPlaceholder: "Phone or email",
  contactoAjuda: "Whichever suits you.",
  nome: "Name",
  submeter: "Send",
  aSubmeter: "Sending",
  erro: "We could not send this. Please try again or message us on WhatsApp.",
  erroContacto: "Please give us a phone number or an email so we can reply.",
  privacidade: "Your details are used only to answer this request. See our",
  privacidadeLink: "privacy policy",
};

/**
 * Email ou telefone?
 *
 * A regra é a mais simples que funciona: há `@` → é email. Não há → tira-se
 * tudo o que não é dígito e, se sobrarem nove ou mais, é telefone.
 *
 * NÃO se valida o email a fundo aqui. Quem valida é a rota, com o mesmo
 * esquema de sempre; duplicar a regra em dois sítios é como se acaba com duas
 * regras diferentes. O que se faz aqui é só ENCAMINHAR o valor para o campo
 * certo, e recusar o que não é nem uma coisa nem outra — que é o único erro
 * que vale a pena mostrar antes de submeter.
 */
export function repartirContacto(v: string): { email: string; telefone: string } | null {
  const s = v.trim();
  if (!s) return null;
  if (s.includes("@")) return { email: s, telefone: "" };
  const digitos = s.replace(/\D/g, "");
  if (digitos.length >= 9) return { email: "", telefone: s };
  return null;
}

/** O campo: a caixa redonda da Apple (ela, 30/10 — ver `lib/formulario-apple.ts`). */
const CAMPO = CAMPO_APPLE;
/**
 * O RÓTULO DE CADA CAMPO — E PORQUE É QUE PASSOU DE `/50` PARA `/70`
 *
 * MEDIDO com o axe (WCAG 1.4.3, nível AA) num telemóvel de 375 px, em
 * `/s/comporta` e em `/en/s/portugal`:
 *
 *   label[for=…-data]      #95928f sobre #ffffff  →  3,09:1
 *   label[for=…-local]     idem
 *   label[for=…-nome]      idem
 *   label[for=…-contacto]  idem
 *
 * O mínimo é 4,5:1. `/70` dá #6b6a68 sobre branco, 5,4:1.
 *
 * Não é uma questão de conformidade: são os quatro rótulos do único formulário
 * de uma página que recebe tráfego PAGO, escritos a 10 px em maiúsculas com
 * `tracking` largo — o pior caso que há para ler — e olhados quase sempre num
 * telemóvel, muitas vezes na rua. Quem não distingue o que cada campo pede não
 * o preenche: fecha.
 *
 * A bateria de acessibilidade (`e2e/a11y.spec.ts`) nunca chegou aqui — visita
 * nove endereços e nenhum deles é `/s/*` nem `/orcamento`. Era por isso que
 * isto estava invisível.
 */
const ROTULO = ROTULO_APPLE;

export default function PedidoRelampago({
  locale,
  textos,
  contexto,
}: {
  locale: Locale;
  textos: TextosRelampago;
  /** "s/comporta" — segue no pedido e chega ao email da equipa. */
  contexto: string;
}) {
  const router = useRouter();
  const id = useId();
  const [aEnviar, setAEnviar] = useState(false);
  // A MENSAGEM a mostrar, e já não um código de erro. O 400 da rota diz o que
  // está mal («Email inválido», «Nome demasiado curto») e isso deitava-se fora:
  // quem escrevia um email sem TLD lia «Não foi possível enviar» e voltava a
  // carregar no botão para sempre, sem saber que campo corrigir.
  const [erro, setErro] = useState("");
  // A data vazia diz «Escolher a data» no toque (ver o campo, lá em baixo).
  const [temData, setTemData] = useState(false);
  const comecouRef = useRef(false);
  const textosDoTelefone = useTranslationsSeHouver()?.t.common.campoTelefone ?? TEXTOS_DE_RECURSO;

  function aoTocar() {
    if (comecouRef.current) return;
    comecouRef.current = true;
    track("QuoteStart", { origem: contexto });
    meta.comecouFormulario({ contexto });
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (aEnviar) return;

    const dados = new FormData(e.currentTarget);
    const s = (k: string) => String(dados.get(k) ?? "").trim();

    const contacto = repartirContacto(s("contacto"));
    if (!contacto) {
      setErro(textos.erroContacto);
      return;
    }
    /**
     * ── O TELEMÓVEL TEM DE EXISTIR (pedido dela, 30/10) ───────────────────
     *
     * O campo continua a ser um só, «telemóvel ou email» — é o desenho do
     * anúncio, e não leva bandeira. Por isso a regra é a do servidor quando
     * não há bandeira: um número sem «+» é português; com «+», é do país do
     * indicativo, e conferido com as regras de lá. Recusado aqui, com o país
     * na frase, antes de a Meta contar um `Lead` que não serve para nada.
     * Sem as regras (sem rede para as trazer), quem confere é o servidor.
     */
    if (contacto.telefone) {
      const regras = await carregarTelefones().catch(() => null);
      if (regras) {
        const e164 = regras.normalizarTelefone(contacto.telefone);
        if (!e164) {
          const pais = regras.paisDoNumero(contacto.telefone)?.pais ?? regras.PAIS_POR_OMISSAO;
          setErro(
            fraseDoTelefoneInvalido(
              textosDoTelefone.invalido,
              pais,
              regras.indicativoDe(pais),
              locale,
            ),
          );
          return;
        }
        contacto.telefone = e164;
      }
    }
    setErro("");
    setAEnviar(true);

    // O `event_id` é gerado AQUI e viaja com o pedido: o servidor reenvia o
    // mesmo `Lead` pela CAPI com este identificador, e a Meta conta uma vez.
    const leadEventId = meta.lead({
      contexto,
      email: contacto.email,
      telefone: contacto.telefone,
      nome: s("nome"),
    });

    const cliqueGoogle = (() => {
      try {
        const c = lerClique();
        return c ? serializar(c) : "";
      } catch {
        return "";
      }
    })();
    const cliqueMeta = (() => {
      try {
        return serializarMeta(lerIdentificadores());
      } catch {
        return "";
      }
    })();
    const origem = (() => {
      try {
        return sessionStorage.getItem(LEAD_SOURCE_KEY) ?? "";
      } catch {
        return "";
      }
    })();

    const form = {
      category: "particulares",
      eventType: "casamentos",
      eventName: "",
      date: s("data"),
      endDate: "",
      location: s("local"),
      locationType: "",
      guests: 0,
      duration: 0,
      isMultiDay: false,
      packageTier: "",
      addons: [],
      budgetRange: null,
      urgency: "standard",
      notes: `Pedido de anúncio social (${contexto})`,
      referralSource: origem,
      adClick: cliqueGoogle,
      metaClick: cliqueMeta,
      /**
       * ── SÓ COM CONSENTIMENTO ─────────────────────────────────────────────
       * O servidor reenvia o `Lead` à Conversions API (com email, telefone,
       * nome, IP) quando recebe este identificador — e a regra escrita lá é
       * «só quando o pixel correu, que só corre com consentimento». Mas o
       * `meta.lead` devolve o identificador SEMPRE, e o `metaClick` existe sem
       * pixel (o `fbclid` fica guardado do URL). MEDIDO a 9 de outubro: com
       * «Recusar» carregado, o pedido levava os dois e o servidor enviava.
       * Sem consentimento, o identificador não sai daqui, e o reenvio não
       * acontece.
       */
      leadEventId: temConsentimento() ? leadEventId : "",
      name: s("nome"),
      email: contacto.email,
      phone: contacto.telefone,
      company: "",
      nif: "",
      acceptMarketing: false,
    };

    // O mesmo tratamento de ligação pendurada do formulário completo: sem
    // isto, uma rede que abre o socket e nunca responde deixa o botão a rodar
    // para sempre — que no browser interno do Instagram, onde a rede é pior, é
    // um desfecho bem mais provável do que no Safari.
    const controlador = new AbortController();
    const limite = setTimeout(() => controlador.abort(), 25000);
    try {
      const res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O `submissionId` torna o envio idempotente: no browser interno do
        // Instagram, onde a rede falha mais, o segundo toque no botão depois de
        // uma resposta perdida deixava aqui dois pedidos e dois emails.
        body: JSON.stringify({
          form,
          website: s("website"),
          submissionId: ensureSubmissionId(),
        }),
        signal: controlador.signal,
      });
      const json = (await res.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.id) {
        // A mensagem do SERVIDOR, e nada mais: o 400 diz o motivo («Nome
        // demasiado curto», «Email inválido») e é isso que se lê. Sai daqui em
        // vez de subir como excepção de propósito — assim uma falha de rede
        // (`TypeError: Failed to fetch`) nunca se confunde com uma resposta e
        // acaba no ecrã em bruto.
        setErro(json?.error || textos.erro);
        setAEnviar(false);
        return;
      }

      track("QuoteSubmit", { tipo: "casamentos", origem: contexto });
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
        /* a confirmação usa o recurso genérico */
      }
      // Pedido entregue: o identificador deste envio sai de cena para que um
      // pedido genuinamente novo mais tarde não seja deduplicado contra este.
      clearSubmissionId();
      router.push(localizeHref(`/orcamento/confirmacao/${json.id}`, locale));
    } catch {
      // Rede em baixo ou ligação pendurada: não há motivo nenhum para dar, e o
      // texto genérico é o certo (um "AbortError" em bruto não é uma mensagem).
      setErro(textos.erro);
      setAEnviar(false);
    } finally {
      clearTimeout(limite);
    }
  }

  return (
    <form
      id="pedido"
      onSubmit={submeter}
      onFocusCapture={aoTocar}
      // SEM `noValidate`: não há validação por campo neste formulário, por isso
      // desligar a do browser deixava o nome vazio ou a data em branco irem até
      // ao servidor para voltarem como um erro genérico no fundo do ecrã. A
      // nativa marca o campo errado e leva lá o cursor, que é o que falta aqui.
      // O «contacto» continua a ser `type="text"` — quem o valida é o
      // `repartirContacto`, porque o campo aceita telemóvel OU email.
      className="bg-[var(--bg-elevated)] px-5 py-8 sm:rounded-[28px] sm:px-8 sm:py-10"
    >
      <h2 className="text-[24px] font-semibold leading-tight text-[var(--fg-primary)] sm:text-[26px]">
        {textos.titulo}
      </h2>
      <p className="mt-1.5 text-[14px] text-[var(--fg-secondary)]">{textos.subtitulo}</p>

      <div className="mt-7 space-y-5">
        <div>
          <label className={ROTULO} htmlFor={`${id}-data`}>
            {textos.data}
          </label>
          {/* O iPhone não escreve nada numa data vazia: era uma caixa em
              branco. Vazia e no toque, diz «Escolher a data». Só no toque: no
              computador escreve-se a data à mão e os números têm de se ver. */}
          <div className="relative">
            <input
              id={`${id}-data`}
              name="data"
              type="date"
              required
              className={`${CAMPO} ${temData ? "" : "pointer-coarse:text-transparent"}`}
              onChange={(e) => setTemData(e.currentTarget.value !== "")}
              // Achado n.º 12: sem `min`, aceitava datas passadas. Posto ao
              // tocar no campo e não no desenho: a página é pré-gerada, e um
              // `min` do servidor seria o dia da compilação. É o dia DE QUEM
              // PREENCHE, como no formulário do site.
              onFocus={(e) => {
                const agora = new Date();
                const mes = String(agora.getMonth() + 1).padStart(2, "0");
                const dia = String(agora.getDate()).padStart(2, "0");
                e.currentTarget.min = `${agora.getFullYear()}-${mes}-${dia}`;
              }}
            />
            {!temData && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-[calc(0.875rem+1px)] hidden items-center text-[16px] text-[var(--fg-secondary)] pointer-coarse:flex"
              >
                {textos.escolherData}
              </span>
            )}
          </div>
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${id}-local`}>
            {textos.local}
          </label>
          <input
            id={`${id}-local`}
            name="local"
            type="text"
            required
            autoComplete="off"
            placeholder={textos.localPlaceholder}
            className={CAMPO}
          />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${id}-nome`}>
            {textos.nome}
          </label>
          <input
            id={`${id}-nome`}
            name="nome"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            className={CAMPO}
          />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${id}-contacto`}>
            {textos.contacto}
          </label>
          <input
            id={`${id}-contacto`}
            name="contacto"
            // `type="text"` e não `email` nem `tel`: o campo aceita os dois, e
            // um `type="email"` faria o browser recusar um número de telemóvel
            // com a sua própria mensagem, antes de este código lhe tocar.
            // `inputMode="text"` deixa o teclado do telemóvel completo, com
            // números e com `@`.
            type="text"
            required
            /**
             * `on`, e não `"tel email"`.
             *
             * A intenção de `"tel email"` lê-se bem — «isto é um telemóvel OU um
             * email» — mas não é HTML válido: o atributo é uma lista de fichas
             * de autopreenchimento com uma gramática fixa, onde `tel` e `email`
             * são dois NOMES DE CAMPO e nunca podem estar lado a lado. MEDIDO
             * com o axe em `/s/comporta` e `/en/s/portugal`:
             *   [serious] autocomplete-valid — «the autocomplete attribute is
             *   incorrectly formatted»
             *
             * Um atributo que o browser não consegue analisar não é neutro: ou
             * o ignora (e fica-se à mercê das heurísticas dele) ou o trata como
             * `off`. Aqui isso custa dinheiro — é o ÚNICO campo de contacto de
             * uma página que recebe tráfego pago, e escrever um email à mão num
             * telemóvel é exactamente onde se desiste de um formulário de
             * quatro campos.
             *
             * `on` é a ficha que existe para este caso: diz «preenche, o campo
             * não tem um nome canónico». Não se escolhe `tel` nem `email`
             * porque escolher um deles é sugerir o errado a metade das pessoas.
             */
            autoComplete="on"
            placeholder={textos.contactoPlaceholder}
            aria-describedby={`${id}-contacto-ajuda`}
            className={CAMPO}
          />
          {/*
            `/68` e não `/45`. MEDIDO com o axe: a `/45` sai #9f9d9b sobre
            branco — 2,7:1, quando o mínimo AA é 4,5:1. Esta é a linha que
            explica que serve tanto um telemóvel como um email, e é a que
            desfaz a hesitação em frente ao único campo de contacto da página.
          */}
          <p id={`${id}-contacto-ajuda`} className="mt-1.5 text-[12px] text-[var(--fg-secondary)]">
            {textos.contactoAjuda}
          </p>
        </div>
      </div>

      {/* Campo-armadilha. Fora do ecrã e fora da ordem de tabulação.
          O `autoComplete="off"` sozinho não chega: o 1Password e o LastPass
          ignoram-no e enchem o campo à mesma — e como é o SERVIDOR que descarta
          quem o preenche, isso descartava pedidos verdadeiros em silêncio.
          As dicas `data-*` são o que estes gestores respeitam. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input
          id={`${id}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
        />
      </div>

      {erro && (
        <p role="alert" className="mt-5 text-[13px] text-red-700">
          {erro}
        </p>
      )}

      <button type="submit" disabled={aEnviar} className={`${BOTAO_APPLE} mt-7 w-full`}>
        {aEnviar ? textos.aSubmeter : textos.submeter}
      </button>

      {/*
        `/68` e não `/45`. MEDIDO com o axe: #9f9d9b sobre branco dá 2,7:1, e o
        mínimo AA é 4,5:1. É a linha do consentimento — a que diz o que se faz
        com os dados que a pessoa acabou de escrever, mesmo por baixo do botão
        de enviar. Uma nota legal ilegível não é uma nota legal.
      */}
      <p className="mt-4 text-[11px] leading-relaxed text-foreground/68">
        {textos.privacidade}{" "}
        <a href={localizeHref("/privacidade", locale)} className="underline hover:text-moss">
          {textos.privacidadeLink}
        </a>
        .
      </p>
    </form>
  );
}
