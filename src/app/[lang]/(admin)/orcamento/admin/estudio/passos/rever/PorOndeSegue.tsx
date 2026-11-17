"use client";

import { Segmented } from "../../../ui";
import { OPCOES_DO_CANAL } from "../../envio/canal-de-envio";
import type { CanalDeEnvio } from "../../envio/canal-de-envio";
import { Section } from "../../formulario/Section";
import type { Step } from "../../tipos";

interface PropsPorOndeSegue {
  canal: CanalDeEnvio;
  emailDoCliente: boolean;
  escolherCanal: (c: CanalDeEnvio) => void;
  sent: boolean;
  step: Step;
}

/**
 * PASSO 5 · por onde segue (email, WhatsApp, ou os dois), NO FIM (10/11).
 * Sempre montado e escondido como o envio, para o salto de «Falta o email»
 * (`#seccao-envio`) ter onde cair.
 *
 * Saiu do `ProposalStudio` tal e qual (fase 4 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export function PorOndeSegue({
  canal,
  emailDoCliente,
  escolherCanal,
  sent,
  step,
}: PropsPorOndeSegue) {
  return (
    <div
      className={step === "enviar" && !sent ? "view-in mt-4 mb-4" : undefined}
      hidden={step !== "enviar" || sent}
    >
      <Section title="Por onde segue">
        {/* ── POR ONDE SEGUE ────────────────────────────────────────────
                A escolha vem ANTES do resumo e do botão (e, desde 14/10, no
                topo do passo), porque muda o que o
                resumo quer dizer: com «só WhatsApp», a linha «Para: <email>»
                deixa de ser o destino e passa a ser só um dado do pedido.

                Os rótulos dizem o CANAL e não o verbo — «Email», «WhatsApp»,
                «Os dois» — porque o verbo já está no botão a seguir, e repetir
                «enviar» três vezes numa fila de três não ajuda a escolher. */}
        <div className="scroll-mt-24" id="seccao-envio">
          <Segmented
            size="sm"
            ariaLabel="Por onde é que a proposta segue"
            value={canal}
            onChange={escolherCanal}
            options={OPCOES_DO_CANAL}
          />
          {/* ── O QUE CADA ESCOLHA FAZ, DITO ANTES DO GESTO ────────────
                  Sem esta linha, «WhatsApp» prometia um envio automático que
                  não existe: nenhuma página consegue mandar uma mensagem por
                  alguém. O que acontece é o WhatsApp ABRIR com a mensagem
                  escrita, e ser ela a escolher a quem — e isso é um segundo
                  gesto, dela, depois deste. Dizê-lo aqui é a diferença entre
                  uma expectativa cumprida e uma surpresa. */}
          <p className="bo-text-muted mt-2 text-xs leading-relaxed">
            {canal === "email"
              ? "O cliente recebe a proposta em PDF por email."
              : canal === "whatsapp"
                ? "Não sai email. A proposta é gerada e o link fica pronto — a seguir abres o WhatsApp e escolhes a quem o mandas."
                : "O cliente recebe o PDF por email, e a seguir abres o WhatsApp com o link para lho mandares também."}
          </p>
        </div>
        {/* ── SEM DESTINATÁRIO, DIZ-SE AQUI E NÃO DEPOIS ──────────────
                Um pedido que entrou por telefone não tem email. Até aqui só
                se sabia DEPOIS de carregar em Enviar: a proposta ficava
                gravada, o email não saía, e o aviso vinha a seguir ao gesto.

                Agora está antes do dedo, e diz ONDE se resolve — no painel do
                pedido, que passou a deixar corrigir os contactos. */}
        {/* ── E O AVISO DO EMAIL EM FALTA CALA-SE QUANDO NÃO É POR AÍ ──
                Com «só WhatsApp», não ter email de cliente deixou de ser um
                problema — é o caso NORMAL de um pedido que entrou por
                telefone. Um aviso cor de laranja a apontar para uma coisa
                que não faz falta ensina a ignorar avisos. */}
        {!emailDoCliente && canal !== "whatsapp" && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
            <span aria-hidden="true">⚠</span>
            <span>
              Este pedido não tem email de cliente, e sem ele a proposta não pode seguir por email.
              Acrescenta-o nos <strong className="font-medium">contactos do pedido</strong>, em
              Detalhes — ou escolhe «WhatsApp».
            </span>
          </p>
        )}
      </Section>
    </div>
  );
}
