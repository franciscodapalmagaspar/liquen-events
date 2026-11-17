"use client";

import { useCallback, useState } from "react";
import { lerNumero } from "@/lib/numero-escrito";
import { oQueFaltaGravar } from "@/lib/orcamento/pedidos/o-que-falta-gravar";
import { textoDoPreco } from "@/lib/orcamento/pedidos/textos-do-pedido";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { parseMoney } from "../util";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTÁ ESCRITO NO PAINEL DO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os onze campos editáveis do painel (estado, preço, notas, responsável, motivo
 * de perda, data, convidados, local, nome, email, telefone) e as perguntas que
 * o painel lhes faz: o número de convidados serve? o que falta gravar?
 *
 * Viviam soltos no `AdminClient.tsx`: onze `useState` e, em três sítios (abrir
 * um pedido, gravar, anular), as mesmas onze linhas a pô-los iguais ao pedido.
 * Três cópias da mesma sequência são três sítios onde um campo novo fica
 * esquecido — passa a ser `preencherCom`. (Fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`. Os nomes `editX` ficam os de lá: mudar o nome
 * no mesmo passo em que se muda a casa é o diff que não se revê.)
 *
 * `aberto` é o pedido do painel, como o servidor o tem — é com ele que se
 * compara o que está escrito.
 */
export function useEdicaoDoPedido(aberto: Quote | null) {
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<QuoteStatus>("pendente");
  const [editAssigned, setEditAssigned] = useState("");
  const [editLostReason, setEditLostReason] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editGuests, setEditGuests] = useState("");
  const [editLocation, setEditLocation] = useState("");
  /**
   * ── OS DADOS DE CONTACTO, EDITÁVEIS ─────────────────────────────────────
   *
   * Palavras dela: «se criarmos um pedido novo e não colocarmos um email,
   * depois quando quisermos alterar para colocar o email para enviarmos a
   * proposta, não conseguimos editar».
   *
   * Um pedido nascido de um telefonema entra sem email, e é a rota do envio
   * que dá pela falta: grava a proposta, não a manda a ninguém, e responde
   * «acrescenta o email e reenvia». Não havia por onde. Estes três campos são
   * esse «por onde», e gravam pelo mesmo botão que o resto do painel.
   */
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");

  /**
   * Põe no ecrã, campo a campo, o que o pedido tem.
   *
   * `manterConvidados`: depois de uma gravação em que o número de convidados
   * não servia, o campo fica COMO ELA O ESCREVEU — substituí-lo pelo valor
   * gravado apagava o que ela acabou de escrever e voltava a esconder o
   * problema.
   */
  const preencherCom = useCallback((q: Quote, { manterConvidados = false } = {}) => {
    setEditStatus(q.status);
    setEditPrice(textoDoPreco(q));
    setEditNotes(q.adminNotes ?? "");
    setEditAssigned(q.assignedTo ?? "");
    setEditLostReason(q.lostReason ?? "");
    setEditDate(q.date ?? "");
    if (!manterConvidados) setEditGuests(String(q.guests ?? ""));
    setEditLocation(q.location ?? "");
    setEditNome(q.name ?? "");
    setEditEmail(q.email ?? "");
    setEditTelefone(q.phone ?? "");
  }, []);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O NÚMERO DE CONVIDADOS, LIDO ANTES DE SAIR DO ECRÃ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `-50` era enviado tal e qual: o servidor respondia 400 com «Too small:
   * expected number to be >=0», o painel dizia «Não foi possível guardar as
   * alterações» — sem nomear o campo — e TUDO o que ia na mesma gravação (o
   * estado, o email acabado de acrescentar) ficava por gravar. O `min={0}` do
   * input era decoração: o teclado escreve o que quer lá dentro.
   *
   * É a mesma regra das definições da proposta, do mesmo módulo: o que não dá
   * um número que sirva é dito no campo, e não segue.
   *
   * ── O CAMPO EM BRANCO AQUI NÃO É O MESMO QUE LÁ ──────────────────────────
   * Um pedido pode ter entrado sem número de convidados (um telefonema, uma
   * referência de terceiros), e continuar assim é um estado legítimo — em
   * branco não há nada para gravar e não se reclama de um campo que ninguém
   * tocou. Mas APAGAR um número que lá estava é outra coisa: é uma edição a
   * meio, e o ecrã tem de o dizer em vez de gravar o velho por baixo.
   */
  const convidadosEscritos = lerNumero(editGuests, {
    min: 0,
    max: 100000,
    inteiro: true,
    vazioVale: aberto?.guests == null,
    nome: "número de convidados",
    exemplo: "80",
  });
  const erroDeConvidados = convidadosEscritos.ok ? null : convidadosEscritos.porque;

  const {
    motivoVaiComADecisao,
    porConfirmar: alteracoesPorConfirmar,
    porEscrever: escritoPorGravar,
  } = oQueFaltaGravar(aberto, {
    estado: editStatus,
    preco: parseMoney(editPrice),
    notas: editNotes,
    responsavel: editAssigned,
    motivoDePerda: editLostReason,
    data: editDate,
    convidados: editGuests,
    local: editLocation,
    nome: editNome,
    email: editEmail,
    telefone: editTelefone,
  });

  return {
    editPrice,
    setEditPrice,
    editNotes,
    setEditNotes,
    editStatus,
    setEditStatus,
    editAssigned,
    setEditAssigned,
    editLostReason,
    setEditLostReason,
    editDate,
    setEditDate,
    editGuests,
    setEditGuests,
    editLocation,
    setEditLocation,
    editNome,
    setEditNome,
    editEmail,
    setEditEmail,
    editTelefone,
    setEditTelefone,
    preencherCom,
    convidadosEscritos,
    erroDeConvidados,
    motivoVaiComADecisao,
    alteracoesPorConfirmar,
    escritoPorGravar,
  };
}
