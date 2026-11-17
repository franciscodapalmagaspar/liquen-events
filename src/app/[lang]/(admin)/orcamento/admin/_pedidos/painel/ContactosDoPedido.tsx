"use client";

import CampoTelefone from "@/components/CampoTelefone";
import { APARENCIA_DO_BACK_OFFICE, TELEFONE_EM_CAIXA } from "../../ui/aparencia-do-telefone";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { usePedidoAberto } from "./pedido-aberto";

/** Os contactos do cliente — nome, email (com o aviso de devolução e a
 *  sugestão de domínio) e telefone. (Saíram da gestão do pedido na fase 7 da
 *  estrutura do código, tal e qual.) */
export interface ContactosDoPedidoProps {
  devolvidoAqui: { quoteId: string; endereco: string } | null;
  emailSugerido: string | null;
}

export function ContactosDoPedido({ devolvidoAqui, emailSugerido }: ContactosDoPedidoProps) {
  const { edicao } = usePedidoAberto();
  const { editNome, setEditNome, editEmail, setEditEmail, editTelefone, setEditTelefone } = edicao;
  return (
    <>
      {/* ── OS CONTACTOS, QUE ATÉ AQUI ERAM DEFINITIVOS ──
        Palavras dela: «se criarmos um pedido novo e não
        colocarmos um email, depois quando quisermos
        colocar o email para enviarmos a proposta, não
        conseguimos editar».

        Um pedido nascido de um telefonema entra sem
        email — o formulário público aceita «email OU
        telefone», e o back office nem isso exige. Quem
        dava pela falta era a rota do envio: gravava a
        proposta, não a mandava a ninguém, e respondia
        «acrescenta o email e reenvia». Não havia por
        onde.

        Ficam num bloco próprio e por baixo: são os
        dados de QUEM, e o que está em cima é o QUÊ. */}
      <div className="grid grid-cols-1 gap-4 border-t border-[var(--bo-hairline)] pt-4 sm:grid-cols-3">
        <div>
          <label htmlFor="pedido-nome" className="bo-eyebrow block mb-1.5">
            Nome do cliente
          </label>
          <input
            id="pedido-nome"
            value={editNome}
            onChange={(e) => setEditNome(e.target.value)}
            placeholder="Quem pediu…"
            className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
          />
        </div>
        <div>
          <label htmlFor="pedido-email" className="bo-eyebrow block mb-1.5">
            Email
          </label>
          <input
            id="pedido-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            placeholder="para onde a proposta segue…"
            className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
          />
          {/* O aviso aparece só quando falta MESMO, e diz
            a consequência em vez de dizer «campo
            obrigatório» — porque não é: há pedidos que
            só têm telefone, e isso é legítimo. */}
          {!editEmail.trim() && (
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--bo-perigo)]">
              Sem email, a proposta é gravada e o link continua a servir, mas não é enviada a
              ninguém.
            </p>
          )}
          {devolvidoAqui && (
            <p
              role="alert"
              className="mt-1 rounded-lg border border-[var(--bo-perigo)]/40 bg-[var(--bo-perigo-lavagem)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--bo-perigo)]"
            >
              {devolvidoAqui.endereco.toLowerCase() === editEmail.trim().toLowerCase()
                ? `O último email para ${devolvidoAqui.endereco} voltou para trás: o endereço não existe. Corrige o email e volta a enviar.`
                : `O último email foi para ${devolvidoAqui.endereco} e voltou para trás. Grava o email novo e volta a enviar.`}
            </p>
          )}
          {emailSugerido && (
            <p role="status" className="mt-1 text-[11px] leading-relaxed text-[var(--bo-aviso)]">
              Querias dizer{" "}
              <button
                type="button"
                onClick={() => setEditEmail(emailSugerido)}
                className={`font-semibold underline underline-offset-2 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
              >
                {emailSugerido}
              </button>
              ? Um email com uma letra trocada não chega a ninguém.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="pedido-telefone" className="bo-eyebrow block mb-1.5">
            Telefone
          </label>
          {/* A bandeira e o número (pedido dela, 30/10:
            «números de telefone seja qual país for»).
            O que segue é o E.164; um número antigo
            abre como estava e só é conferido se ela
            lhe mexer — a mesma regra do servidor. */}
          <CampoTelefone
            id="pedido-telefone"
            value={editTelefone}
            onChange={setEditTelefone}
            aparencia={APARENCIA_DO_BACK_OFFICE}
            classeDoBotao={TELEFONE_EM_CAIXA.botao}
            classeDoNumero={TELEFONE_EM_CAIXA.numero}
            placeholder="912 345 678"
            locale="pt"
          />
        </div>
      </div>
    </>
  );
}
