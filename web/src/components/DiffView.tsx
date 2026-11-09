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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
        <div className="flex gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded bg-emerald-200" /> adicionado
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded bg-red-200" /> removido
          </span>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={soMudancas} onChange={(e) => setSoMudancas(e.target.checked)} className="accent-orange-800" />
          Só as mudanças
        </label>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-xl bg-stone-50 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words ring-1 ring-stone-200">
        {semMudanca && <p className="text-stone-500">Sem diferenças entre as versões.</p>}
        {partes.map((p, i) => {
          if (p.added) return <ins key={i} className="rounded bg-emerald-100 text-emerald-900 no-underline">{p.value}</ins>;
          if (p.removed) return <del key={i} className="rounded bg-red-100 text-red-800">{p.value}</del>;
          if (soMudancas && p.value.length > 240) {
            return (
              <span key={i} className="text-stone-500">
                {i > 0 ? p.value.slice(0, 100) : ""}
                <span className="mx-1 rounded bg-stone-200 px-1.5 text-xs text-stone-600">…</span>
                {i < partes.length - 1 ? p.value.slice(-100) : ""}
              </span>
            );
          }
          return <span key={i} className="text-stone-600">{p.value}</span>;
        })}
      </div>
    </div>
  );
}
