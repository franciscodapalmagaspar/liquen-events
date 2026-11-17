"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, Field, Button } from "@/app/[lang]/(admin)/orcamento/admin/ui";

const MINIMO = 12;

/**
 * Escolher a palavra-passe nova.
 *
 * O ecrã é gémeo do da entrada de propósito: quem chega aqui vem de um email e
 * tem de reconhecer imediatamente que está no sítio certo — é isso que separa
 * esta página de uma cópia montada por quem faz phishing.
 *
 * A confirmação da palavra-passe existe por uma razão prática e não cerimonial:
 * a seguir a isto a pessoa vai ter de a escrever numa página onde ela não se vê,
 * e um engano de teclado aqui deixava-a fechada de fora com uma palavra-passe
 * que ninguém sabe qual é.
 */
export default function DefinirPalavraPasse({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const router = useRouter();

  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (aGravar) return;
    setErro(null);
    if (password !== confirmacao) {
      setErro("As duas palavras-passe não são iguais.");
      return;
    }
    if (password.length < MINIMO) {
      // Verificação do lado do browser só para poupar uma ida ao servidor — a
      // que MANDA é a do servidor, porque esta desliga-se com duas linhas.
      setErro(`A palavra-passe tem de ter pelo menos ${MINIMO} caracteres.`);
      return;
    }
    setAGravar(true);
    try {
      const res = await fetch("/api/admin/recuperar/definir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPronto(true);
      } else {
        setErro(data?.error ?? "Não foi possível definir a palavra-passe.");
      }
    } catch {
      setErro("Erro de ligação. Tenta novamente.");
    }
    setAGravar(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "linear-gradient(180deg, #ffffff 0%, #f4f5f3 100%)" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <Image
          src="/logo-liquen.png"
          alt="Líquen Events"
          width={210}
          height={125}
          priority
          className="h-16 w-auto object-contain"
        />

        <Card padding="lg" className="w-full">
          <div className="mb-6 text-center">
            <p className="bo-eyebrow mb-2">Área Restrita</p>
            <h1 className="font-display text-2xl leading-tight text-[var(--bo-text)]">
              Palavra-passe nova
            </h1>
          </div>

          {pronto ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-[var(--bo-tinta-72)]">
                Pronto. A palavra-passe nova já está a valer — usa-a na página de entrada.
              </p>
              <p className="text-sm leading-relaxed text-[var(--bo-tinta-72)]">
                Por segurança, os aparelhos que entravam sem palavra-passe (rosto, impressão digital
                ou PIN) deixaram de servir. Depois de entrares, regista-os outra vez.
              </p>
              <Button
                type="button"
                size="lg"
                fullWidth
                onClick={() => router.push("/orcamento/admin")}
              >
                Ir para a entrada
              </Button>
            </div>
          ) : !token ? (
            <p className="text-sm leading-relaxed text-[var(--bo-tinta-72)]">
              Esta página só funciona a partir da ligação que te chega por email. Pede uma nova na
              página de entrada.
            </p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field
                label="A tua palavra-passe nova"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MINIMO}
                hint={`Pelo menos ${MINIMO} caracteres. Não precisa de símbolos nem de números — precisa de ser comprida. Uma frase de que te lembres serve muito bem.`}
                placeholder="••••••••••••"
              />
              <Field
                label="Escreve-a outra vez"
                name="confirmacao"
                type="password"
                autoComplete="new-password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                required
                placeholder="••••••••••••"
              />

              {erro && (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="flex items-start gap-1.5 text-sm leading-relaxed text-[var(--bo-perigo)]"
                >
                  <span aria-hidden="true">⚠</span>
                  <span>{erro}</span>
                </p>
              )}

              <Button type="submit" size="lg" fullWidth loading={aGravar} className="mt-1">
                {aGravar ? "A guardar…" : "Definir palavra-passe"}
              </Button>
            </form>
          )}
        </Card>

        <p className="text-[10px] tracking-[0.3em] uppercase text-white/25">
          Líquen Events · Portugal
        </p>
      </div>
    </div>
  );
}
