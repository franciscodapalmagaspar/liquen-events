"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button, Field, FolhaOuDialogo } from "./ui";
/* A escala de movimento da casa — ver `ui/movimento.ts` para o censo que a
   motivou. `ESTADO` são os 120 ms do degrau `micro` numa lista fechada de
   propriedades (nenhuma delas força *layout*); `PRESSAO` é o toque a 20 ms.
   As duas trazem `motion-safe:` — não há rede global no `globals.css`. */
import { ESTADO, PRESSAO } from "./ui/movimento";
import { mensagemDeErro, registarDispositivo, suportaPasskeys } from "@/lib/passkeys-cliente";

/**
 * OS MEUS DISPOSITIVOS — registar este aparelho como chave de entrada, ver os
 * que já estão registados, e remover os que já não existem.
 *
 * Só mostra os dispositivos de quem está a ver. Não é um ecrã de administração
 * de equipa: a lista de aparelhos de uma pessoa diz onde ela trabalha, e não há
 * razão para a mostrar aos outros.
 *
 * Duas coisas ficam ditas no ecrã, e não num manual que ninguém abre:
 *
 *  • a passkey fica presa a ESTE aparelho e a ESTE endereço. Trocar de telemóvel
 *    obriga a registar outra vez, e é isso que a torna impossível de dar por
 *    engano num site cópia;
 *  • remover o último dispositivo não tranca ninguém fora — a palavra-passe
 *    continua a funcionar. Se um dia deixar de funcionar, esta frase deixa de
 *    ser verdade e tem de mudar com ela.
 */

interface Dispositivo {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  toast?: (message: string, kind?: "success" | "error") => void;
}

/** "há 3 dias", "hoje" — datas absolutas não dizem nada num ecrã destes. */
function quando(iso: string | null): string {
  if (!iso) return "ainda não foi usado";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const dias = Math.floor(ms / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há um mês" : `há ${meses} meses`;
}

/** Um palpite decente para o nome, para não obrigar a inventar um. */
function nomeSugerido(): string {
  if (typeof navigator === "undefined") return "Dispositivo";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Telemóvel Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Computador Windows";
  return "Dispositivo";
}

export default function PasskeysDialog({ open, onClose, toast }: Props) {
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [aCarregar, setACarregar] = useState(false);
  const [aRegistar, setARegistar] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Vazio de propósito: o palpite vai no `placeholder`, não escrito no campo.
  // Assim quem não quer pensar no nome carrega em Registar e fica com o palpite,
  // e quem quer escrever não tem de apagar texto primeiro.
  const [nome, setNome] = useState("");
  /** A palavra-passe da conta, pedida antes de registar (auditoria de 13/11, n.º 5). */
  const [palavraPasse, setPalavraPasse] = useState("");
  /** Que dispositivo está a ser renomeado, e para quê. */
  const [aRenomear, setARenomear] = useState<{ id: string; nome: string } | null>(null);
  // Capacidades do ambiente, não estado: ver a nota igual no AdminLogin.
  const suportado = useSyncExternalStore(
    () => () => {},
    suportaPasskeys,
    () => false,
  );
  const sugestao = useSyncExternalStore(
    () => () => {},
    nomeSugerido,
    () => "Dispositivo",
  );

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/passkeys");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível ler os dispositivos.");
      setDispositivos(Array.isArray(data.dispositivos) ? data.dispositivos : []);
      setIndisponivel(Boolean(data.indisponivel));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível ler os dispositivos.");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Ir buscar a lista ao abrir é o que este efeito é. O `carregar` liga o
    // indicador de espera antes do pedido, e é isso que a regra vê.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [open, carregar]);

  async function registar() {
    if (aRegistar) return;
    if (!palavraPasse) {
      setErro("Escreve a tua palavra-passe para confirmar que és tu.");
      return;
    }
    setARegistar(true);
    setErro(null);
    try {
      await registarDispositivo(nome.trim() || nomeSugerido(), palavraPasse);
      setPalavraPasse("");
      toast?.("Dispositivo registado.", "success");
      await carregar();
    } catch (err) {
      const msg = mensagemDeErro(err);
      if (msg) setErro(msg);
    } finally {
      setARegistar(false);
    }
  }

  /**
   * Mudar o nome de um aparelho já registado.
   *
   * O nome é escolhido no registo, quando ainda só há um aparelho na conta —
   * e é aí que quase toda a gente aceita o palpite. Ao terceiro telemóvel, três
   * linhas a dizer «iPhone» tornam a lista inútil: ninguém remove com confiança
   * uma linha que não sabe qual é, e o aparelho que já não existe fica lá para
   * sempre. Que é exactamente o risco que esta lista existe para fechar.
   */
  async function renomear() {
    if (!aRenomear) return;
    const nomeNovo = aRenomear.nome.trim();
    if (!nomeNovo) return;
    setErro(null);
    try {
      const res = await fetch(`/api/admin/passkeys/${encodeURIComponent(aRenomear.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceLabel: nomeNovo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível mudar o nome.");
      setARenomear(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível mudar o nome.");
    }
  }

  async function remover(d: Dispositivo) {
    // Uma confirmação, e não duas: remover um dispositivo não apaga dados nem
    // tranca ninguém — a palavra-passe continua lá. O gesto destrutivo desta
    // casa é a reposição da cópia, e é esse que pede uma frase escrita.
    if (!confirm(`Remover "${d.deviceLabel}"? Este aparelho deixa de poder entrar.`)) return;
    setErro(null);
    try {
      const res = await fetch(`/api/admin/passkeys/${encodeURIComponent(d.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível remover.");
      toast?.("Dispositivo removido.", "success");
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  return (
    <FolhaOuDialogo
      aberto={open}
      onFechar={onClose}
      titulo="Os meus dispositivos"
      descricao="Entrar sem palavra-passe, com o rosto ou a impressão digital do aparelho."
      largura="md"
      // A lista de aparelhos cresce (três telemóveis, dois computadores) e por
      // baixo dela há dois parágrafos que explicam o que uma passkey é. Sem
      // isto, a folha ajustava-se ao conteúdo e ficava uma janela alta com
      // scroll dentro de scroll.
      folhaAlta
      // Era `z-[95]` à mão: acima da paleta de comandos (90) e dos avisos
      // passageiros (80), abaixo da barreira da sessão expirada (110).
      nivel={95}
      // Enquanto o aparelho pergunta pelo rosto ou pela impressão digital, o
      // Escape não fecha isto — era o que o `&& !aRegistar` do efeito à mão já
      // fazia. Acaba sempre sozinho: o `registar()` desliga isto no `finally`.
      bloqueado={aRegistar}
    >
      {erro && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-1.5 rounded-lg bg-[var(--bo-perigo-lavagem)] px-3 py-2 text-sm leading-relaxed text-[var(--bo-perigo)]"
        >
          <span aria-hidden="true">⚠</span>
          <span>{erro}</span>
        </p>
      )}

      {indisponivel && (
        <p className="mb-4 rounded-lg bg-[var(--bo-aviso-lavagem)] px-3 py-2 text-sm leading-relaxed text-[var(--bo-aviso)]">
          A tabela das passkeys ainda não existe na base de dados. Corre o{" "}
          <code className="text-xs">db/schema.sql</code> no Supabase e volta aqui.
        </p>
      )}

      {!suportado ? (
        <p className="text-sm leading-relaxed text-[var(--bo-text-muted)]">
          Este browser não sabe trabalhar com passkeys. Continua a entrar com a palavra-passe, ou
          abre o back office no Safari ou no Chrome do teu telemóvel.
        </p>
      ) : (
        <>
          {/* ── Registar este aparelho ── */}
          <div className="rounded-xl border border-[var(--bo-hairline-strong)] p-4">
            <p className="text-sm font-medium text-[var(--bo-text)]">Registar este aparelho</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/50">
              A chave fica guardada dentro deste aparelho e nunca sai de lá. Num site que imite o
              nosso, ela simplesmente não existe — é isso que impede um engano.
            </p>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <Field
                  label="Nome"
                  name="deviceLabel"
                  type="text"
                  value={nome}
                  maxLength={60}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder={sugestao}
                />
                <div className="mt-2">
                  <Field
                    label="Palavra-passe (para confirmar que és tu)"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={palavraPasse}
                    maxLength={200}
                    onChange={(e) => setPalavraPasse(e.target.value)}
                  />
                </div>
              </div>
              <Button type="button" onClick={registar} loading={aRegistar} className="mb-[2px]">
                {aRegistar ? "A confirmar…" : "Registar"}
              </Button>
            </div>
          </div>

          {/* ── Os que já estão registados ── */}
          <div className="mt-5">
            <p className="bo-eyebrow mb-2">Registados</p>
            {aCarregar && dispositivos.length === 0 ? (
              <div className="bo-skeleton h-12 w-full" aria-hidden />
            ) : dispositivos.length === 0 ? (
              <p className="text-sm leading-relaxed text-foreground/50">
                Ainda não há nenhum. Enquanto não houver, entra-se só com a palavra-passe.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dispositivos.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--bo-hairline-strong)] px-3 py-2.5"
                  >
                    {aRenomear?.id === d.id ? (
                      <>
                        <div className="min-w-0 flex-1">
                          <Field
                            label="Nome do dispositivo"
                            hideLabel
                            name="nome-novo"
                            type="text"
                            maxLength={60}
                            value={aRenomear.nome}
                            autoFocus
                            onChange={(e) => setARenomear({ id: d.id, nome: e.target.value })}
                            onKeyDown={(e) => {
                              // Enter grava, Escape desiste. Isto vive dentro
                              // de um diálogo e não de um `<form>`: sem estas
                              // duas teclas só se sairia daqui com o rato.
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void renomear();
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                e.stopPropagation();
                                setARenomear(null);
                              }
                            }}
                          />
                        </div>
                        <Button type="button" size="sm" onClick={renomear}>
                          Guardar
                        </Button>
                        <button
                          onClick={() => setARenomear(null)}
                          className={`alvo-toque shrink-0 rounded-md px-2 py-1 text-xs text-foreground/50 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-[var(--bo-text)]">{d.deviceLabel}</p>
                          <p className="text-xs text-foreground/45">
                            Última entrada: {quando(d.lastUsedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => setARenomear({ id: d.id, nome: d.deviceLabel })}
                            className={`alvo-toque rounded-md px-2 py-1 text-xs text-foreground/50 ${ESTADO} ${PRESSAO} hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text)]`}
                          >
                            Mudar nome
                          </button>
                          <button
                            onClick={() => remover(d)}
                            className={`alvo-toque rounded-md px-2 py-1 text-xs text-[var(--bo-perigo)] ${ESTADO} ${PRESSAO} hover:bg-[var(--bo-perigo-lavagem)]`}
                          >
                            Remover
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-5 text-xs leading-relaxed text-foreground/45">
            Remover o último dispositivo não te tranca fora: a palavra-passe continua a funcionar.
            As passkeys registadas noutro endereço — numa pré-visualização, por exemplo — não
            funcionam aqui, e é assim de propósito.
          </p>
        </>
      )}
    </FolhaOuDialogo>
  );
}
