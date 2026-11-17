/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GRELHA DAS FOTOS DE UM TEMA, PELO TECLADO — fase 11 do `APPLE-TEMAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O mesmo desenho da grelha do Calendário (`diaPelaTecla`): um só elemento no
 * fio do Tab, e as setas a andar entre as fotos. A diferença é que aqui o
 * número de colunas MUDA com a largura (`repeat(auto-fill, minmax(180px,
 * 1fr))`), por isso entra por argumento — quem chama mede-o na grelha.
 *
 *   ←/→       a foto anterior / seguinte
 *   ↑/↓       a mesma coluna, uma linha acima / abaixo
 *   Home/End  o início / o fim da LINHA
 *   ⌘/Ctrl+Home/End   a primeira / a última foto
 *   PageUp/PageDown   três linhas acima / abaixo
 *
 * Fora da grelha não se sai: nas pontas, a tecla não faz nada (`null`).
 */
export function fotoPelaTecla(
  i: number,
  tecla: string,
  colunas: number,
  total: number,
  comModificador = false,
): number | null {
  if (total <= 0) return null;
  const c = Math.max(1, Math.floor(colunas));
  const inicioDaLinha = i - (i % c);
  let destino: number;
  switch (tecla) {
    case "ArrowLeft":
      destino = i - 1;
      break;
    case "ArrowRight":
      destino = i + 1;
      break;
    case "ArrowUp":
      destino = i - c;
      break;
    case "ArrowDown":
      destino = i + c;
      break;
    case "Home":
      destino = comModificador ? 0 : inicioDaLinha;
      break;
    case "End":
      destino = comModificador ? total - 1 : Math.min(total - 1, inicioDaLinha + c - 1);
      break;
    case "PageUp":
      destino = Math.max(i % c, i - 3 * c);
      break;
    case "PageDown": {
      const salto = i + 3 * c;
      destino = salto < total ? salto : i + c * Math.floor((total - 1 - i) / c);
      break;
    }
    default:
      return null;
  }
  if (destino < 0 || destino >= total || destino === i) return null;
  return destino;
}
