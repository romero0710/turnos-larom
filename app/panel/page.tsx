import Panel from "@/components/Panel";
import { leerSesion } from "@/lib/auth";

// Ruta 100% dinámica: usa cookies y la base. No intentar analizarla como estática
// (mismo motivo que /turno/[token]).
export const dynamic = "force-dynamic";

export default async function PanelPage() {
  const sesion = await leerSesion();
  // Métricas avanzadas (navegación por fecha) solo en planes Automatización/Crecimiento.
  const metricasAvanzadas = process.env.METRICAS_AVANZADAS === "true";
  return <Panel sesionInicial={sesion} metricasAvanzadas={metricasAvanzadas} />;
}
