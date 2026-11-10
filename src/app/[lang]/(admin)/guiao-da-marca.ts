/** O guião de uma linha que põe a classe `.bo` (e a aparência) no `<body>` antes
 * da primeira pintura. Vive fora do `MarcaDoBackOffice.tsx` porque esse é um
 * módulo de cliente, e o servidor não pode chamar funções de lá. */
export function guiaoDaMarca(aparencia: string | undefined): string {
  const a = aparencia === "claro" || aparencia === "escuro" ? aparencia : "";
  return (
    "var b=document.body;b.classList.add('bo');" +
    (a ? `b.setAttribute('data-aparencia','${a}')` : "b.removeAttribute('data-aparencia')")
  );
}
