"use client";

import { useCallback, useRef, useState } from "react";
import { FolhaOuDialogo } from "./ui/FolhaOuDialogo";
import { Button } from "./ui/Button";
import { avaliarFoto, type AvaliacaoDaFoto, type LugarDaFoto } from "@/lib/qualidade-da-foto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «NÃO PONHAS ESTA FOTO, VAI FICAR COM UMA QUALIDADE PÉSSIMA»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (28/10): «quero que o sistema… quando tentamos colocar uma foto, diga
 * que aquela foto vai ficar com uma qualidade péssima… que avise mesmo». E
 * «Avisa, não bloqueia»: a pergunta aparece ANTES de a foto subir, diz porquê
 * em palavras, e deixa escolher.
 *
 * Um aviso por gesto, não por fotografia: largar doze fotos com três más abre
 * UMA pergunta com as três, e «Escolher outras» deixa entrar as nove boas.
 *
 * As medidas lêem-se no browser, do próprio ficheiro, antes de qualquer
 * compressão — é o que a foto TEM, não o que vai ficar guardado.
 */

/**
 * As medidas de um ficheiro de imagem, ou `null` se o browser não o souber ler.
 *
 * `createImageBitmap` e não um `<img>`: devolve sempre (resolve ou rejeita),
 * enquanto um `<img>` com um formato que o browser não lê pode nunca chamar
 * nem `onload` nem `onerror` — e o carregamento ficava parado à espera do
 * aviso. Sem `createImageBitmap` (browsers muito antigos, o jsdom dos testes),
 * não se mede e não se avisa: a foto entra como sempre entrou.
 */
export async function medirFicheiro(file: File): Promise<{ w: number; h: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bmp = await createImageBitmap(file);
    const medidas = { w: bmp.width, h: bmp.height };
    bmp.close?.();
    return medidas.w > 0 && medidas.h > 0 ? medidas : null;
  } catch {
    return null;
  }
}

interface FotoEmDuvida {
  nome: string;
  previa?: string;
  avaliacao: AvaliacaoDaFoto;
}

interface Pergunta {
  lugar: LugarDaFoto;
  fotos: FotoEmDuvida[];
  responder: (usarNaMesma: boolean) => void;
}

const TITULO: Record<LugarDaFoto, (n: number) => string> = {
  capa: () => "Esta foto vai ficar com má qualidade na capa",
  pagina: () => "Esta foto vai ficar com má qualidade nesta página",
  tema: (n) =>
    n === 1 ? "Esta foto vai ficar com má qualidade" : `${n} fotos vão ficar com má qualidade`,
};

/**
 * O aviso, pronto a perguntar. `filtrarFicheiros` mede, pergunta só se houver
 * fotos más, e devolve as que entram: todas («Usar na mesma») ou só as boas
 * («Escolher outras»).
 */
export function useAvisoDeQualidade() {
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const previas = useRef<string[]>([]);

  const largarPrevias = () => {
    for (const u of previas.current) URL.revokeObjectURL(u);
    previas.current = [];
  };

  const filtrarFicheiros = useCallback(
    async (files: File[], lugar: LugarDaFoto): Promise<File[]> => {
      const medidas = await Promise.all(files.map(medirFicheiro));
      const mas: { file: File; avaliacao: AvaliacaoDaFoto }[] = [];
      files.forEach((file, i) => {
        const m = medidas[i];
        if (!m) return;
        const avaliacao = avaliarFoto(m.w, m.h, lugar);
        if (avaliacao.nivel === "ma") mas.push({ file, avaliacao });
      });
      if (mas.length === 0) return files;
      const usarNaMesma = await new Promise<boolean>((responder) => {
        largarPrevias();
        const fotos = mas.map(({ file, avaliacao }) => {
          const previa = URL.createObjectURL(file);
          previas.current.push(previa);
          return { nome: file.name, previa, avaliacao };
        });
        setPergunta({ lugar, fotos, responder });
      });
      setPergunta(null);
      largarPrevias();
      if (usarNaMesma) return files;
      const fora = new Set(mas.map((m) => m.file));
      return files.filter((f) => !fora.has(f));
    },
    [],
  );

  const dialogo = pergunta ? <AvisoDeQualidade pergunta={pergunta} /> : null;
  return { filtrarFicheiros, dialogo };
}

function AvisoDeQualidade({ pergunta }: { pergunta: Pergunta }) {
  const { fotos, lugar, responder } = pergunta;
  const varias = fotos.length > 1;
  return (
    <FolhaOuDialogo
      aberto
      onFechar={() => responder(false)}
      titulo={TITULO[lugar](fotos.length)}
      descricao={
        varias
          ? "As outras entram normalmente. Estas parecem «comidas» no PDF e na proposta online."
          : "Vai parecer «comida» no PDF e na proposta online."
      }
      largura="sm"
      accoes={
        <>
          {/* «Usar na mesma» à esquerda e discreto: o caminho por omissão é
              não pôr a foto (o pedido dela: «não coloque esta foto»). */}
          <Button variant="ghost" onClick={() => responder(true)}>
            Usar na mesma
          </Button>
          <Button variant="primary" onClick={() => responder(false)} autoFocus>
            {varias ? "Escolher outras" : "Escolher outra"}
          </Button>
        </>
      }
    >
      <ul className="space-y-3" aria-label="Fotos com má qualidade">
        {fotos.map((f, i) => (
          <li key={i} className="flex items-start gap-3">
            {f.previa && (
              // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local (blob:), antes de subir
              <img
                src={f.previa}
                alt=""
                className="size-14 shrink-0 rounded-[var(--bo-raio-controlo)] object-cover"
              />
            )}
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{f.nome}</p>
              <p className="mt-0.5 text-[var(--bo-perigo)]">{f.avaliacao.motivo}</p>
            </div>
          </li>
        ))}
      </ul>
    </FolhaOuDialogo>
  );
}
