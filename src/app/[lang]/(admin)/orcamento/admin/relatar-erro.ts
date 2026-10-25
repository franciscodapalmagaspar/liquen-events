import { relatarErroPara } from "@/lib/relatar-erro";

/**
 * Conta um erro do back office a quem o possa ler. O porquê e as regras (não
 * lança, não espera, não leva o estado da página) estão em
 * `src/lib/relatar-erro.ts`, que o site público também usa.
 */
const ROTA = "/api/admin/erro-do-cliente";

export function relatarErro(erro: unknown, marca?: string): void {
  relatarErroPara(ROTA, erro, marca);
}
