import { ESTADO, PRESSAO } from "../../ui/movimento";

/**
 * As marcas por cima de uma célula de fotografia: «a entrar…», «fora do PDF»
 * e o × de remover. Sobrepostas, nunca no fluxo: a célula tem de ter
 * exatamente o mesmo tamanho antes e depois de a foto assentar.
 */
export function MarcasDaCelula({
  pendente,
  foraDoPdf,
  semRemover,
  onRemove,
}: {
  pendente: boolean;
  foraDoPdf: boolean;
  semRemover: boolean;
  onRemove: () => void;
}) {
  return (
    <>
      {pendente && (
        <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-center text-[8px] tracking-[0.12em] uppercase text-white">
          a entrar…
        </span>
      )}
      {foraDoPdf && !pendente && (
        <span className="absolute inset-x-0 bottom-0 bg-[var(--bo-perigo)]/85 px-1 py-0.5 text-center text-[8px] tracking-[0.12em] uppercase text-white">
          fora do PDF
        </span>
      )}
      {!semRemover && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover imagem"
          /**
           * ── INVISÍVEL E TOCÁVEL AO MESMO TEMPO ────────────────────────
           *
           * Isto era `opacity-0 group-hover:opacity-100`. Num ecrã táctil não
           * há hover nenhum, portanto o botão NUNCA se via — e `opacity: 0`
           * não desliga o toque: um dedo no canto da miniatura apagava a
           * fotografia sem que nada tivesse aparecido primeiro. É o único
           * botão destrutivo do back office assim, e no telemóvel o engano nem
           * se desfaz (o Cmd+Z do estúdio não existe lá).
           *
           * O par é o da casa (`globals.css:98`), e é o mesmo que o
           * `ServicesEditor` e os `Fornecedores` já usam: à vista no dedo,
           * escondido até ao hover só onde HÁ rato.
           *
           * 20 px é menos de metade do mínimo de toque, e o `alvo-toque` (44
           * px) não serve aqui: a miniatura tem pouco mais de 100 px de largo
           * e um alvo de 44 px no canto engolia um terço dela — num botão que
           * APAGA, um alvo grande de mais é tão mau como um pequeno de mais.
           * 32 px no dedo é o meio-termo, e é o que cabe.
           */
          className={`absolute top-1 right-1 flex h-5 w-5 pointer-coarse:h-8 pointer-coarse:w-8 items-center justify-center rounded-full bg-black/55 text-white text-xs leading-none opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 ${ESTADO} ${PRESSAO}`}
        >
          ×
        </button>
      )}
    </>
  );
}
