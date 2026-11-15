import { diffLines, diffWords } from "diff";
import { useMemo, useState } from "react";

const LIMITE_PALAVRAS = 60_000;

export function DiffView({ antigo, novo }: { antigo: string; novo: string }) {
  const [soMudancas, setSoMudancas] = useState(true);
  const grande = antigo.length + novo.length > LIMITE_PALAVRAS;
  const partes = useMemo(() => (grande ? diffLines(antigo, novo) : diffWords(antigo, novo)), [antigo, novo, grande]);
  const semMudanca = partes.every((p) => !p.added && !p.removed);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <div className="flex gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded bg-ok-soft" /> adicionado
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded bg-danger-soft" /> removido
          </span>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={soMudancas} onChange={(e) => setSoMudancas(e.target.checked)} className="accent-accent" />
          Só as mudanças
        </label>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-xl bg-card-2 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words ring-1 ring-line">
        {semMudanca && <p className="text-muted">Sem diferenças entre as versões.</p>}
        {partes.map((p, i) => {
          if (p.added) return <ins key={i} className="rounded bg-ok-soft text-ok no-underline">{p.value}</ins>;
          if (p.removed) return <del key={i} className="rounded bg-danger-soft text-danger">{p.value}</del>;
          if (soMudancas && p.value.length > 240) {
            return (
              <span key={i} className="text-muted">
                {i > 0 ? p.value.slice(0, 100) : ""}
                <span className="mx-1 rounded bg-frame px-1.5 text-xs text-muted">…</span>
                {i < partes.length - 1 ? p.value.slice(-100) : ""}
              </span>
            );
          }
          return <span key={i} className="text-muted">{p.value}</span>;
        })}
      </div>
    </div>
  );
}
