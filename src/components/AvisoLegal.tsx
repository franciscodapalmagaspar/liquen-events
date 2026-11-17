import type { CSSProperties, ReactNode } from "react";
import LivroDeReclamacoes from "@/components/LivroDeReclamacoes";
import { localizeHref } from "@/lib/i18n/config";
import {
  LIGACOES_LEGAIS,
  NOME_DAS_LIGACOES,
  RESOLUCAO_DE_LITIGIOS,
  type Lingua,
  type Troco,
} from "@/lib/legal/textos-legais";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O FIM LEGAL DE TODAS AS PÁGINAS — UMA PEÇA SÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do Francisco, 17/11 (`docs/LEGAL-FORMULARIO.md`, ponto 2): em todas
 * as páginas, 404 e proposta online incluídas,
 *   · o Livro de Reclamações (DL 156/2005, art. 5.º-B);
 *   · a resolução de litígios com o CNIACC e o Portal do Consumidor
 *     (Lei 144/2015, art. 18.º);
 *   · as ligações Privacidade · Cookies · Termos.
 *
 * Esta peça junta as três, e é a mesma no rodapé do sítio, no `/orcamento`,
 * nos anúncios (`/s/`), na proposta online e nos ecrãs de erro. Os textos vêm
 * de `textos-legais.ts`, os mesmos do rodapé dos e-mails.
 *
 * ── PORQUE É QUE O DESENHO VAI EM `style` ─────────────────────────────────
 * Entra no `global-error`, que não carrega a folha do sítio, e no 404 global.
 * O essencial (letra pequena, centrado, a medida da linha) vai em `style`, e
 * a COR herda-se de quem a monta: cada fundo já tem a sua tinta suave, com o
 * contraste medido lá. Sem componentes de cliente, sem pedidos: é uma ligação,
 * não fala com ninguém enquanto não for tocada.
 *
 * `alinhar="fim"`: só no rodapé do sítio, que tem a folha de estilos — no
 * telemóvel centrado, a partir do `sm` encostado à direita.
 */
export default function AvisoLegal({
  lingua,
  sobre = "claro",
  alturaDoLivro = 32,
  alinhar = "centro",
  acoes,
  className,
  style,
  classeDasLigacoes = "",
}: {
  lingua: Lingua;
  /** A cor do fundo por trás (o logótipo vai em silhueta da cor oposta). */
  sobre?: "claro" | "escuro";
  alturaDoLivro?: number;
  alinhar?: "centro" | "fim";
  /** O que se junta às três ligações (o «Gerir cookies» do rodapé). */
  acoes?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Classes de cada ligação (o `alvo-toque` e o realce de quem tem a folha). */
  classeDasLigacoes?: string;
}) {
  const fim = alinhar === "fim";
  const eixo: CSSProperties = fim ? {} : { alignItems: "center", textAlign: "center" };
  return (
    <div
      data-aviso-legal=""
      className={`${fim ? "items-center text-center sm:items-end sm:text-right" : ""} ${className ?? ""}`.trim()}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontSize: 11,
        lineHeight: 1.6,
        letterSpacing: "0.01em",
        ...eixo,
        ...style,
      }}
    >
      <div
        className={fim ? "justify-center sm:justify-end" : undefined}
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 20,
          rowGap: 10,
          ...(fim ? {} : { justifyContent: "center" }),
        }}
      >
        <LivroDeReclamacoes
          lingua={lingua}
          sobre={sobre}
          altura={alturaDoLivro}
          className="alvo-toque"
          style={{ opacity: 0.75 }}
        />
        <nav aria-label={NOME_DAS_LIGACOES[lingua]}>
          <ul
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 16,
              rowGap: 6,
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {LIGACOES_LEGAIS[lingua].map((l) => (
              <li key={l.caminho}>
                <a
                  href={localizeHref(l.caminho, lingua)}
                  className={classeDasLigacoes}
                  style={{ color: "inherit" }}
                >
                  {l.texto}
                </a>
              </li>
            ))}
            {acoes ? <li>{acoes}</li> : null}
          </ul>
        </nav>
      </div>
      <p style={{ margin: 0, maxWidth: "62ch", textWrap: "pretty" }}>
        <Trocos trocos={RESOLUCAO_DE_LITIGIOS[lingua]} />
      </p>
    </div>
  );
}

/** Uma frase com ligações externas (abrem noutro separador). */
function Trocos({ trocos }: { trocos: Troco[] }) {
  return (
    <>
      {trocos.map((t, i) =>
        typeof t === "string" ? (
          <span key={i}>{t}</span>
        ) : (
          <a
            key={i}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            {t.texto}
          </a>
        ),
      )}
    </>
  );
}
