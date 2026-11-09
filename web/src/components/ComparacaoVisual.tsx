import { doc, getDoc, type Bytes } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { useUid } from "../lib/dados";
import { Spinner } from "./ui";

async function carregarCaptura(caminho: string): Promise<string | null> {
  const s = await getDoc(doc(db, caminho));
  const jpeg = s.get("jpeg") as Bytes | undefined;
  return jpeg ? `data:image/jpeg;base64,${jpeg.toBase64()}` : null;
}

/** Screenshot de uma versão. */
export function ImagemCaptura({ monitorId, versaoId }: { monitorId: string; versaoId: string }) {
  const uid = useUid();
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setSrc(undefined);
    carregarCaptura(`users/${uid}/monitores/${monitorId}/capturas/${versaoId}`).then(setSrc).catch(() => setSrc(null));
  }, [uid, monitorId, versaoId]);
  if (src === undefined) return <Spinner className="size-6 text-orange-900" />;
  if (!src) return <p className="text-sm text-stone-500">Screenshot indisponível.</p>;
  return <img src={src} alt="Screenshot" className="w-full rounded-lg ring-1 ring-stone-200" loading="lazy" />;
}

/** Antes × depois: lado a lado ou deslizando uma sobre a outra. */
export function ComparacaoVisual({ monitorId, antes, depois }: { monitorId: string; antes: string; depois: string }) {
  const uid = useUid();
  const [imgs, setImgs] = useState<{ a: string | null; b: string | null } | null>(null);
  const [modo, setModo] = useState<"lado" | "deslizar">("deslizar");
  const [corte, setCorte] = useState(50);

  useEffect(() => {
    setImgs(null);
    const base = `users/${uid}/monitores/${monitorId}/capturas`;
    Promise.all([carregarCaptura(`${base}/${antes}`), carregarCaptura(`${base}/${depois}`)])
      .then(([a, b]) => setImgs({ a, b }))
      .catch(() => setImgs({ a: null, b: null }));
  }, [uid, monitorId, antes, depois]);

  if (!imgs) return <div className="flex justify-center py-8"><Spinner className="size-6 text-orange-900" /></div>;
  if (!imgs.a || !imgs.b) return <p className="text-sm text-stone-500">Screenshots indisponíveis para estas versões.</p>;

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(["deslizar", "lado"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${modo === m ? "bg-orange-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300"}`}
          >
            {m === "lado" ? "Lado a lado" : "Deslizar"}
          </button>
        ))}
      </div>

      {modo === "lado" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Antes", imgs.a, "text-red-700"],
            ["Depois", imgs.b, "text-emerald-700"],
          ].map(([rotulo, src, cor]) => (
            <figure key={rotulo}>
              <figcaption className={`mb-1 text-xs font-semibold uppercase ${cor}`}>{rotulo}</figcaption>
              <div className="max-h-[70vh] overflow-auto rounded-lg ring-1 ring-stone-200">
                <img src={src!} alt={rotulo!} className="w-full" />
              </div>
            </figure>
          ))}
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-3 text-xs font-semibold">
            <span className="text-red-700">ANTES</span>
            <input type="range" min={0} max={100} value={corte} onChange={(e) => setCorte(Number(e.target.value))} className="flex-1 accent-orange-800" aria-label="Posição da comparação" />
            <span className="text-emerald-700">DEPOIS</span>
          </div>
          <div className="max-h-[70vh] overflow-auto rounded-lg ring-1 ring-stone-200">
            <div className="relative">
              <img src={imgs.b} alt="Depois" className="block w-full" />
              <img
                src={imgs.a}
                alt="Antes"
                className="absolute inset-x-0 top-0 block w-full"
                style={{ clipPath: `inset(0 ${100 - corte}% 0 0)` }}
              />
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-orange-600" style={{ left: `${corte}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
