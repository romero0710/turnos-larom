import VerTurno from "@/components/VerTurno";

// Evita que Next intente generar/analizar rutas estáticas para este segmento
// dinámico (rompía en dev: un worker de análisis no podía cargar el driver
// nativo de SQLite y tiraba abajo la ruta hasta reiniciar el server).
export const dynamic = "force-dynamic";

export default async function TurnoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <VerTurno token={token} />;
}
