"use client";

import { useState } from "react";
import { Button, Card, EmptyState, PerguntaDestrutiva, TabelaOuCartoes, type Coluna } from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RECICLAGEM — o que se apagou nos últimos 30 dias
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 10/10: «tem que haver no site todo, em tudo aquilo que se
 * faz, uma forma de voltar atrás». Para apagar, escolheu «Reciclagem 30 dias»
 * (`docs/TUDO-REVERSIVEL.md`, fase R3; o motor está em `src/lib/reciclagem.ts`).
 *
 * Cada linha diz o quê, quem apagou, quando, e o dia em que sai sozinha. Duas
 * acções:
 *  · «Repor» — volta tal e qual, com o mesmo id. Quando não pode (já existe
 *    outra vez, ou falta aquilo de que depende), a frase do servidor diz
 *    porquê, e nada é pisado;
 *  · «Apagar de vez» — a única coisa deste ecrã que não tem volta, e por isso
 *    a única que pergunta.
 *
 * Sem a tabela (a migração ainda não correu) o ecrã di-lo, em vez de mostrar
 * uma Reciclagem vazia que faria crer que o que se apaga está a ser guardado.
 */

interface Entrada {
  id: string;
  tipo: string;
  tipoNome: string;
  rotulo: string;
  apagadoEm: string;
  apagadoPor?: string;
  saiEm: string;
}

interface Resposta {
  ligada: boolean;
  itens: Entrada[];
}

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });

/** «faltam 3 dias» / «sai hoje» — o que conta é quanto tempo ainda há. */
function faltam(saiEm: string, agora = Date.now()): string {
  const dias = Math.ceil((new Date(saiEm).getTime() - agora) / 86_400_000);
  if (dias <= 0) return "sai hoje";
  return dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
}

const apagadoPor = (e: Entrada) =>
  e.apagadoPor ? `${dia(e.apagadoEm)} · ${e.apagadoPor}` : dia(e.apagadoEm);

export default function Reciclagem() {
  const { toast } = useToast();
  const { data, loading, error, errorMessage, refresh } = useCachedList<Resposta>(
    "reciclagem",
    "/api/reciclagem",
  );
  const [aApagar, setAApagar] = useState<Entrada | null>(null);
  const [aTrabalhar, setATrabalhar] = useState<string | null>(null);

  async function pedir(e: Entrada, oQue: string, url: string, init: RequestInit): Promise<boolean> {
    setATrabalhar(e.id);
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      setATrabalhar(null);
      toast(porqueRebentou(oQue).mensagem, "error");
      return false;
    }
    const corpo = await res.json().catch(() => null);
    setATrabalhar(null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return false;
    }
    return true;
  }

  async function repor(e: Entrada) {
    const ok = await pedir(e, `repor «${e.rotulo}»`, `/api/reciclagem/${e.id}/repor`, {
      method: "POST",
    });
    if (!ok) return;
    toast(`«${e.rotulo}» reposto.`, "success");
    // Uma foto (ou um tema) que volta muda o que a Biblioteca, o escolhedor e
    // as páginas já desenhadas do estúdio mostram — o mesmo aviso do ecrã dos
    // Temas (revisão de 14/11, menor n.º 4).
    window.dispatchEvent(new Event("liquen:biblioteca-alterada"));
    void refresh();
  }

  async function apagarDeVez(e: Entrada) {
    const ok = await pedir(e, `apagar «${e.rotulo}» de vez`, `/api/reciclagem/${e.id}`, {
      method: "DELETE",
    });
    if (!ok) return;
    toast(`«${e.rotulo}» apagado de vez.`, "success");
    void refresh();
  }

  const accoes = (e: Entrada) => (
    <span className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => void repor(e)} disabled={aTrabalhar === e.id}>
        Repor
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setAApagar(e)}
        disabled={aTrabalhar === e.id}
      >
        Apagar de vez
      </Button>
    </span>
  );

  const colunas: Coluna<Entrada>[] = [
    {
      chave: "rotulo",
      cabecalho: "O quê",
      celula: (e) => <span className="font-medium text-[var(--bo-text)]">{e.rotulo}</span>,
      ordenar: (a, b) => a.rotulo.localeCompare(b.rotulo, "pt"),
    },
    {
      chave: "tipo",
      cabecalho: "Tipo",
      celula: (e) => <span className="bo-text-muted">{e.tipoNome}</span>,
      ordenar: (a, b) => a.tipoNome.localeCompare(b.tipoNome, "pt"),
    },
    {
      chave: "apagado",
      cabecalho: "Apagado",
      celula: (e) => <span className="bo-text-muted tabular-nums">{apagadoPor(e)}</span>,
      ordenar: (a, b) => a.apagadoEm.localeCompare(b.apagadoEm),
    },
    {
      chave: "sai",
      cabecalho: "Sai sozinho",
      celula: (e) => (
        <span className="bo-text-muted tabular-nums" title={dia(e.saiEm)}>
          {faltam(e.saiEm)}
        </span>
      ),
      ordenar: (a, b) => a.saiEm.localeCompare(b.saiEm),
      soLargo: true,
    },
    { chave: "accoes", cabecalho: "", celula: accoes, interactiva: true },
  ];

  if (error && !data) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler a Reciclagem"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }
  if (loading && !data) return <SkeletonList rows={4} />;

  const itens = data?.itens ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="bo-text-muted max-w-2xl text-sm leading-relaxed">
        O que se apaga no back office fica aqui 30 dias. «Repor» devolve-o tal e qual, no sítio onde
        estava; ao fim dos 30 dias sai sozinho.
      </p>

      {data && !data.ligada ? (
        <Card padding="md">
          <EmptyState
            title="A Reciclagem ainda não está ligada"
            description="Falta aplicar uma mudança à base de dados. Até lá, o que se apaga é apagado de vez — e o aviso de cada apagar di-lo."
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          {itens.length === 0 ? (
            <EmptyState
              title="Nada na Reciclagem"
              description="O que se apaga fica aqui 30 dias, e pode voltar."
            />
          ) : (
            <div className="p-3 sm:p-4">
              <TabelaOuCartoes
                itens={itens}
                chaveDe={(e) => e.id}
                legenda="Reciclagem"
                colunas={colunas}
                ordemInicial={{ chave: "apagado", ascendente: false }}
                cartao={(e) => (
                  <div className="flex flex-col gap-2">
                    <div>
                      <p className="font-medium text-[var(--bo-text)]">{e.rotulo}</p>
                      <p className="bo-text-muted text-xs">
                        {e.tipoNome} · {apagadoPor(e)} · {faltam(e.saiEm)}
                      </p>
                    </div>
                    {accoes(e)}
                  </div>
                )}
              />
            </div>
          )}
        </Card>
      )}

      <PerguntaDestrutiva
        aberto={!!aApagar}
        onFechar={() => setAApagar(null)}
        titulo={`Apagar «${aApagar?.rotulo ?? ""}» de vez?`}
        aviso="Sai da Reciclagem e não pode ser reposto."
        rotuloConfirmar="Apagar de vez"
        onConfirmar={() => {
          const e = aApagar;
          setAApagar(null);
          if (e) void apagarDeVez(e);
        }}
      />
    </div>
  );
}
