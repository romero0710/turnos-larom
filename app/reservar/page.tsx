import Reserva from "@/components/Reserva";
import { listarServicios } from "@/lib/servicios";
import { listarBarberos, barberosParaServicio } from "@/lib/barberos";

// Lee servicios/barberos de la base en cada request (editables desde el panel).
export const dynamic = "force-dynamic";

export default function ReservarPage() {
  const servicios = listarServicios();
  const barberos = listarBarberos(true);

  // Qué barberos hacen cada servicio, precomputado para que el paso "¿Con
  // quién?" filtre sin pegarle otra vez al servidor.
  const barberosPorServicio: Record<string, string[]> = {};
  for (const s of servicios) {
    barberosPorServicio[s.id] = [...barberosParaServicio(s.id)];
  }

  // Si la confirmación por WhatsApp está activa, la pantalla de éxito avisa que
  // hay que revisar el WhatsApp (mismo flag que usa la reserva).
  const confirmacionWhatsApp = process.env.CONFIRMACION_TURNO !== "false";

  return (
    <Reserva
      servicios={servicios}
      barberos={barberos}
      barberosPorServicio={barberosPorServicio}
      confirmacionWhatsApp={confirmacionWhatsApp}
    />
  );
}
