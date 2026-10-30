"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/track";
import { lerClique, serializar } from "@/lib/ads/click-id";
import { LEAD_SOURCE_KEY } from "@/components/LeadSourceCapture";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import { clearSubmissionId, ensureSubmissionId } from "@/lib/orcamento/submission-id";
import CampoTelefone from "@/components/CampoTelefone";
import { carregarTelefones } from "@/lib/telefone-no-browser";
import {
  BOTAO_APPLE,
  CAMPO_APPLE,
  CARTAO_APPLE,
  ROTULO_APPLE,
  TELEFONE_APPLE,
} from "@/lib/formulario-apple";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O FORMULÁRIO CURTO DAS LANDING PAGES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * QUATRO perguntas: data, local, convidados, contacto. Mais nada.
 *
 * Não é preguiça — é a diferença entre um formulário que se preenche num
 * semáforo e um que se adia para "logo à noite no computador" e nunca mais.
 * Quem chega aqui veio de um anúncio, não conhece a marca, e não tem paciência
 * acumulada. O formulário completo (/orcamento) continua a existir para quem
 * quer configurar o pedido ao pormenor, e a página tem um caminho para lá.
 *
 * Estas quatro chegam para a equipa responder: a DATA diz se há
 * disponibilidade (é o que decide quase tudo), o LOCAL diz a deslocação, os
 * CONVIDADOS dizem a escala, e o CONTACTO permite ligar. Tudo o resto se
 * pergunta na resposta.
 *
 * ── O QUE ISTO ENVIA ALÉM DO QUE SE VÊ ─────────────────────────────────────
 * `adClick` — o identificador do clique pago, para o valor real do casamento
 * poder voltar ao Google Ads quando ele fechar. Sem isto a Google optimiza
 * para formulários preenchidos, que é a métrica errada.
 *
 * ── BASE LEGAL ─────────────────────────────────────────────────────────────
 * Não há caixa de "aceito os termos" porque tratar um pedido de orçamento é
 * uma diligência PRÉ-CONTRATUAL (RGPD art. 6.º/1/b), não um tratamento por
 * consentimento — pedir consentimento aqui seria juridicamente errado e
 * custaria conversões. O aviso de privacidade fica visível, com ligação.
 */

export interface TextosPedidoRapido {
  /** O que a data vazia diz no toque (o iPhone não escreve nada lá dentro). */
  escolherData: string;
  titulo: string;
  subtitulo: string;
  data: string;
  local: string;
  localPlaceholder: string;
  convidados: string;
  nome: string;
  email: string;
  telefone: string;
  telefoneOpcional: string;
  submeter: string;
  aSubmeter: string;
  erro: string;
  privacidade: string;
  privacidadeLink: string;
  completo: string;
}

export const TEXTOS_PT: TextosPedidoRapido = {
  titulo: "Pedir orçamento",
  subtitulo: "Quatro perguntas. Respondemos em 48 horas úteis.",
  data: "Data do casamento",
  escolherData: "Escolher a data",
  local: "Local",
  localPlaceholder: "Quinta, herdade ou localidade",
  convidados: "Convidados",
  nome: "Nome",
  email: "Email",
  telefone: "Telemóvel",
  telefoneOpcional: "opcional",
  submeter: "Enviar pedido",
  aSubmeter: "A enviar",
  erro: "Não foi possível enviar. Tente novamente ou escreva para liquen.alentejo@gmail.com.",
  privacidade: "Os dados servem apenas para responder ao pedido. Ver",
  privacidadeLink: "política de privacidade",
  completo: "Prefere detalhar o pedido?",
};

export const TEXTOS_EN: TextosPedidoRapido = {
  titulo: "Request a quote",
  subtitulo: "Four questions. We reply within two working days.",
  data: "Wedding date",
  escolherData: "Choose a date",
  local: "Location",
  localPlaceholder: "Venue, estate or town",
  convidados: "Guests",
  nome: "Name",
  email: "Email",
  telefone: "Phone",
  telefoneOpcional: "optional",
  submeter: "Send request",
  aSubmeter: "Sending",
  erro: "We could not send this. Please try again or write to liquen.alentejo@gmail.com.",
  privacidade: "Your details are used only to answer this request. See our",
  privacidadeLink: "privacy policy",
  completo: "Rather give us the full picture?",
};

/** Identificador do clique pago guardado à entrada, na forma compacta. */
function lerAdClick(): string {
  const c = lerClique();
  return c ? serializar(c) : "";
}

/** Origem de primeiro toque (UTM/referenciador), gravada por LeadSourceCapture. */
function lerOrigem(): string {
  try {
    return sessionStorage.getItem(LEAD_SOURCE_KEY) ?? "";
  } catch {
    return "";
  }
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

export default function PedidoRapido({
  locale,
  textos,
  contexto,
  className = "",
}: {
  locale: Locale;
  textos: TextosPedidoRapido;
  /**
   * Que página gerou este pedido ("polo:alentejo", "estilo:boho",
   * "internacional"). Segue no pedido e chega ao email da equipa, para se
   * saber qual das landing pages está a produzir — e para o teste de uma
   * página nova ter resposta ao fim de duas semanas em vez de nunca.
   */
  contexto: string;
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [aEnviar, setAEnviar] = useState(false);
  // A MENSAGEM do erro, e já não um sim/não. O 400 da rota diz o que está mal
  // («Email inválido», «Nome demasiado curto») e era isso que se deitava fora:
  // quem escrevia o email sem TLD via «Não foi possível enviar» e voltava a
  // carregar no botão para sempre, sem nunca saber que campo corrigir.
  const [erro, setErro] = useState("");
  // A data vazia diz «Escolher a data» no toque (ver o campo, lá em baixo).
  const [temData, setTemData] = useState(false);
  const comecouRef = useRef(false);
  /**
   * O telemóvel, com a bandeira (pedido dela, 30/10: «números de telefone
   * seja qual país for»). É o único campo deste formulário com estado: o
   * `CampoTelefone` entrega o E.164, e é esse que segue (pelo `name`, num
   * campo escondido). Os outros continuam a ser lidos do `FormData`.
   */
  const [telefone, setTelefone] = useState("");
  const [mostrarErroDoTelefone, setMostrarErroDoTelefone] = useState(false);
  const telefoneRef = useRef<HTMLInputElement>(null);

  // "Começou a preencher" é o sinal intermédio que falta na maioria das contas:
  // separa "a página não convence" de "a página convence mas o formulário
  // trava". São problemas diferentes com correcções diferentes.
  function aoTocar() {
    if (comecouRef.current) return;
    comecouRef.current = true;
    track("QuoteStart", { origem: contexto });
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (aEnviar) return;
    const formulario = e.currentTarget;
    // Um telemóvel escrito tem de existir no país da bandeira — conferido AQUI
    // com a mesma regra do servidor, para o erro aparecer debaixo do campo e
    // não como uma frase no fundo do formulário. As regras já chegaram quando
    // ela tocou no campo; se não (sem rede), quem decide é o servidor.
    if (telefone.trim()) {
      const regras = await carregarTelefones().catch(() => null);
      if (regras && !regras.normalizarTelefone(telefone)) {
        setMostrarErroDoTelefone(true);
        telefoneRef.current?.focus();
        return;
      }
    }
    setErro("");
    setAEnviar(true);

    const dados = new FormData(formulario);
    const s = (k: string) => String(dados.get(k) ?? "").trim();

    const form = {
      category: "particulares",
      eventType: "casamentos",
      eventName: "",
      date: s("data"),
      endDate: "",
      location: s("local"),
      locationType: "",
      guests: Number(s("convidados")) || 0,
      duration: 0,
      isMultiDay: false,
      packageTier: "",
      addons: [],
      budgetRange: null,
      urgency: "standard",
      notes: `Pedido rápido (${contexto})`,
      referralSource: lerOrigem(),
      adClick: lerAdClick(),
      name: s("nome"),
      email: s("email"),
      phone: s("telefone"),
      company: "",
      nif: "",
      acceptMarketing: false,
    };

    // Mesmo tratamento de ligação pendurada que o formulário completo: sem
    // isto, uma rede que abre o socket e nunca responde deixa o botão a rodar
    // para sempre, que é o pior desfecho possível na conversão principal.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `website` é o campo-armadilha que a rota também inspecciona.
        // O `submissionId` torna o envio idempotente: numa rede fraca, o dedo
        // que carrega outra vez porque a resposta não chegou deixava aqui dois
        // pedidos e dois emails.
        body: JSON.stringify({ form, website: s("website"), submissionId: ensureSubmissionId() }),
        signal: controller.signal,
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
      clearTimeout(timeout);
    }
  }

  return (
    <form
      onSubmit={submeter}
      onFocusCapture={aoTocar}
      // SEM `noValidate`: não há validação por campo neste formulário, por isso
      // desligar a do browser deixava o email sem TLD ou o nome vazio irem até
      // ao servidor para voltarem como um erro genérico no fundo do ecrã. A
      // nativa marca o campo errado e leva lá o cursor, que é o que falta aqui.
      className={`${CARTAO_APPLE} p-6 sm:p-8 ${className}`}
    >
      <h2 className="text-[24px] font-semibold leading-tight text-[var(--fg-primary)] sm:text-[26px]">
        {textos.titulo}
      </h2>
      <p className="mt-1.5 text-[14px] text-[var(--fg-secondary)]">{textos.subtitulo}</p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
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
                className="pointer-events-none absolute inset-y-0 left-[calc(0.875rem+1px)] hidden items-center text-[16px] text-[var(--fg-tertiary)] pointer-coarse:flex"
              >
                {textos.escolherData}
              </span>
            )}
          </div>
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${id}-convidados`}>
            {textos.convidados}
          </label>
          <input
            id={`${id}-convidados`}
            name="convidados"
            type="number"
            min={1}
            max={2000}
            inputMode="numeric"
            required
            className={CAMPO}
          />
        </div>
        <div className="sm:col-span-2">
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
        <div className="sm:col-span-2">
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
        {/* O email e o telemóvel numa linha cada um: a caixa da bandeira tem
            largura fixa, e a meia coluna deixava o número com 76 px. */}
        <div className="sm:col-span-2">
          <label className={ROTULO} htmlFor={`${id}-email`}>
            {textos.email}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            className={CAMPO}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={ROTULO} htmlFor={`${id}-telefone`}>
            {textos.telefone}{" "}
            <span className="font-normal text-[var(--fg-tertiary)]">
              ({textos.telefoneOpcional})
            </span>
          </label>
          <CampoTelefone
            id={`${id}-telefone`}
            name="telefone"
            inputRef={telefoneRef}
            value={telefone}
            onChange={setTelefone}
            mostrarErro={mostrarErroDoTelefone}
            aparencia={TELEFONE_APPLE}
            classeDoNumero={CAMPO}
            locale={locale}
          />
        </div>
      </div>

      {/* Campo-armadilha. Fora do ecrã e fora da ordem de tabulação, com
          autocomplete desligado para o gestor de senhas não o preencher.
          O `autoComplete="off"` sozinho não chega: o 1Password e o LastPass
          ignoram-no e enchem o campo à mesma — e como é o SERVIDOR que descarta
          quem o preenche, isso descartava pedidos verdadeiros em silêncio.
          As dicas `data-*` são o que estes gestores respeitam. */}
      <div aria-hidden="true" className="absolute left-[-9999px] w-px h-px overflow-hidden">
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
        <p role="alert" className="mt-4 text-[13px] text-red-700">
          {erro}
        </p>
      )}

      <button type="submit" disabled={aEnviar} className={`${BOTAO_APPLE} mt-6 w-full`}>
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
