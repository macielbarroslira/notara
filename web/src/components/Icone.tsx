const caminhos = {
  monitores: "M22 12h-4l-3 9L9 3l-3 9H2",
  sino: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  mais: "M12 5v14M5 12h14",
  ajustes: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  externo: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  atualizar: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  pausar: "M7 4h3v16H7zM14 4h3v16h-3z",
  retomar: "M7 4l13 8-13 8V4z",
  lixo: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  editar: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  check: "M20 6 9 17l-5-5",
  voltar: "m15 18-6-6 6-6",
  fechar: "M18 6 6 18M6 6l12 12",
  busca: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  alerta: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  sair: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  mira: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM22 12h-4M6 12H2M12 6V2M12 22v-4",
  subir: "m18 15-6-6-6 6",
  descer: "m6 9 6 6 6-6",
  imagem: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM21 15l-5-5L5 21M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  baixar:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
} as const;

export type NomeIcone = keyof typeof caminhos;

export function Icone({ nome, className = "size-5" }: { nome: NomeIcone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={caminhos[nome]} />
    </svg>
  );
}
