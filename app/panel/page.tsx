import Panel from "@/components/Panel";
import { leerSesion } from "@/lib/auth";

// Ruta 100% dinámica: usa cookies y la base. No intentar analizarla como estática
// (mismo motivo que /turno/[token]).
export const dynamic = "force-dynamic";

export default async function PanelPage() {
  const sesion = await leerSesion();
  return <Panel sesionInicial={sesion} />;
}
