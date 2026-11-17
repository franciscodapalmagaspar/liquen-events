/**
 * Largar ficheiros e pastas inteiras numa pasta de tema: o que é imagem, e
 * como se percorrem as pastas largadas, com tectos.
 * (Saiu do topo do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`,
 * tal e qual.)
 */

/** Teto de ficheiros aceites de uma pasta largada — trava um engano
 *  ("larguei a pasta Fotos toda") antes de ele encher a memória do browser. */
export const MAX_DROP_FILES = 5000;

/** Teto de entradas percorridas ao expandir pastas largadas (anel de segurança
 *  contra árvores patológicas / atalhos circulares). */
export const MAX_DROP_ENTRIES = 20_000;

/** Um ficheiro largado que é (ou parece ser) uma imagem. HEIC e ficheiros de
 *  câmara chegam por vezes com `type` vazio — aceitar também por extensão em
 *  vez de os descartar em silêncio. */
export function isImageFile(f: File): boolean {
  return f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name);
}

/**
 * As "entries" de um arrasto — TÊM de ser lidas de forma SÍNCRONA dentro do
 * handler do drop: o `DataTransfer` é esvaziado assim que ele retorna, e um
 * único `await` antes disto deixava a lista vazia. Devolve [] em ambientes
 * sem a API (é o caso do jsdom, e de browsers antigos): aí usa-se
 * `dataTransfer.files`, que só traz ficheiros soltos.
 */
export function readDropEntries(dt: DataTransfer | null): FileSystemEntry[] {
  const items = dt?.items;
  if (!items || typeof items.length !== "number") return [];
  const out: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item?.webkitGetAsEntry !== "function") continue;
    try {
      const entry = item.webkitGetAsEntry();
      if (entry) out.push(entry);
    } catch {
      // Um item que não é ficheiro (texto arrastado, por ex.) — ignora-se.
    }
  }
  return out;
}

/**
 * Expande pastas largadas até aos ficheiros, em largura.
 *
 * Vale a complexidade: a Catarina tem as fotos organizadas em pastas no
 * computador, e a alternativa é abrir a pasta, marcar tudo e arrastar — ou,
 * pior, largar a pasta e não perceber porque não aconteceu nada.
 *
 * O detalhe que costuma passar despercebido: `readEntries` devolve no máximo
 * ~100 entradas por chamada e tem de ser repetido até vir vazio — uma pasta de
 * 300 fotos largada assim carregava só as primeiras 100.
 */
export async function expandDropEntries(entries: FileSystemEntry[]): Promise<{
  files: File[];
  capped: boolean;
}> {
  const files: File[] = [];
  const queue = [...entries];
  let seen = 0;
  while (queue.length > 0 && files.length < MAX_DROP_FILES && seen < MAX_DROP_ENTRIES) {
    const entry = queue.shift();
    if (!entry) break;
    seen += 1;
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        try {
          (entry as FileSystemFileEntry).file(
            (f) => resolve(f),
            () => resolve(null),
          );
        } catch {
          resolve(null);
        }
      });
      if (file) files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => {
          try {
            reader.readEntries(
              (e) => resolve(e),
              () => resolve([]),
            );
          } catch {
            resolve([]);
          }
        });
        if (batch.length === 0) break;
        queue.push(...batch);
        if (queue.length + files.length > MAX_DROP_ENTRIES) break;
      }
    }
  }
  return { files, capped: files.length >= MAX_DROP_FILES || queue.length > 0 };
}
