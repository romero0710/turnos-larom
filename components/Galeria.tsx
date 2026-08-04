"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// Carrusel simple de trabajos: rota automáticamente y permite navegar con los puntos.
export default function Galeria({
  imagenes,
  alt,
  intervaloMs = 4000,
}: {
  imagenes: string[];
  alt: string;
  intervaloMs?: number;
}) {
  const [actual, setActual] = useState(0);

  useEffect(() => {
    if (imagenes.length <= 1) return;
    const id = setInterval(() => {
      setActual((i) => (i + 1) % imagenes.length);
    }, intervaloMs);
    return () => clearInterval(id);
  }, [imagenes.length, intervaloMs]);

  if (imagenes.length === 0) return null;

  return (
    <div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-zinc-200">
        {imagenes.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 1024px) 100vw, 900px"
            className={`object-cover transition-opacity duration-700 ${
              i === actual ? "opacity-100" : "opacity-0"
            }`}
            priority={i === 0}
          />
        ))}
      </div>

      {imagenes.length > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {imagenes.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Ver trabajo ${i + 1}`}
              onClick={() => setActual(i)}
              className={`h-2.5 rounded-full transition-all ${
                i === actual ? "w-6 bg-zinc-800" : "w-2.5 bg-zinc-300 hover:bg-zinc-400"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
