"use client";

import { useRef, useState } from "react";
import { EmCurso } from "../../ui";
import { ESTADO, PRESSAO } from "../../ui/movimento";

export function UploadArea({
  label,
  progresso,
  multiple,
  compact = false,
  curto = false,
  faixa = false,
  onFiles,
}: {
  label: string;
  /**
   * O lote que está a subir, ou nada.
   *
   * Era um `busy: boolean`, e a caixa só sabia escrever «A carregar…» — em
   * cima de vinte fotografias de telemóvel numa rede de quinta, que são
   * minutos, «ocupado» e «preso» leem-se exactamente igual. A contagem já
   * existia no `handleUpload`; passa a chegar ao ecrã.
   */
  progresso?: { feito: number; total: number };
  multiple: boolean;
  compact?: boolean;
  /**
   * Caixa BAIXA em vez de proporcional.
   *
   * Uma zona de largar com `aspect-[4/3]` numa coluna de 520px fica com 391px
   * de altura — medido. Duas dessas, lado a lado, são metade da janela de
   * trabalho gasta a não mostrar nada. Vazia é uma faixa; ao ganhar uma foto,
   * a miniatura é que traz a proporção de volta.
   */
  curto?: boolean;
  /**
   * Uma FAIXA por baixo da grelha, e não uma célula dentro dela.
   *
   * É a forma que a caixa de acrescentar fotos tem num mood board. Como célula
   * quadrada, caía a meio de uma fila e lia-se como uma foto em falta; a toda a
   * largura e baixa, lê-se pelo que é: o que se faz A SEGUIR às que já lá
   * estão.
   */
  faixa?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function pick(list: FileList | null) {
    if (!list) return;
    // Alguns sistemas entregam HEIC/ficheiros de câmara com `type` vazio —
    // aceitar também por extensão, em vez de os descartar em silêncio.
    const files = Array.from(list).filter(
      (f) =>
        f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name),
    );
    if (files.length) onFiles(files);
  }

  /**
   * A ALTURA É A MESMA, esteja a carregar ou não.
   *
   * A caixa de espera vai EXACTAMENTE onde o «A carregar…» já vivia, e no
   * mesmo tamanho: uma faixa de 56 px que crescesse a meio de um lote
   * empurrava a grelha de fotografias para baixo debaixo do dedo dela — que é
   * a maneira mais certa de uma animação de progresso piorar o telemóvel. Por
   * isso a medida sai daqui e serve os dois estados; o que muda lá dentro é só
   * o conteúdo.
   */
  const caixa = faixa ? "h-14" : curto ? "h-24" : compact ? "aspect-square" : "aspect-[4/3]";

  if (progresso) {
    return (
      <div className={`flex w-full items-center justify-center ${caixa}`}>
        <EmCurso
          titulo={progresso.total === 1 ? "A carregar a foto…" : "A carregar as fotos…"}
          // A contagem a sério, que o `handleUpload` sempre soube e nunca disse.
          feito={progresso.feito}
          total={progresso.total}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pick(e.dataTransfer.files);
      }}
      // `flex-row`/`flex-col` e `gap` são escolhidos AQUI, e não acrescentados
      // por cima: duas utilidades da mesma propriedade decidem-se pela ordem na
      // folha de estilo e não pela ordem na string, e um `flex-col` de base
      // ganharia ao `flex-row` da faixa sem nada o denunciar.
      className={`flex w-full items-center justify-center rounded-lg border border-dashed text-center  focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-600/55 ${caixa} ${
        faixa
          ? "flex-row gap-2 p-2"
          : curto
            ? "flex-col gap-1 p-2"
            : compact
              ? "flex-col gap-1 p-2"
              : "flex-col gap-1 p-3"
      } ${
        drag
          ? "border-sage-600/60 bg-sage-600/[0.06]"
          : "border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] hover:border-sage-600/45"
      } ${ESTADO} ${PRESSAO}`}
    >
      <span className="text-[9px] tracking-[0.15em] uppercase text-foreground/35">{label}</span>
      {!compact && <span className="text-[9px] text-foreground/25">arraste ou clique</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}
