import { NextResponse } from "next/server";
import { negocio } from "@/config/negocio";
import { listarPendientes } from "@/lib/turnos";

// Turnos que esperan confirmación por WhatsApp (ladrillo 3a). Protegida por
// header x-bot-secret. La consume el bot para mandar la confirmación y expirar
// los que no responden a los 20 min.

export const dynamic = "force-dynamic";

const TZ_OFFSET_MIN = 180; // Argentina UTC-3

export async function GET(req: Request) {
  const secret = process.env.BOT_API_SECRET || "";
  if (!secret || (req.headers.get("x-bot-secret") || "") !== secret) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const pendientes = listarPendientes().map((t) => {
    const [y, m, d] = t.fecha.split("-").map(Number);
    const hh = Math.floor(t.inicioMin / 60);
    const mm = t.inicioMin % 60;
    const inicioEpochMs = Date.UTC(y, m - 1, d, hh, mm) + TZ_OFFSET_MIN * 60_000;
    // creado_en viene en UTC ('YYYY-MM-DD HH:MM:SS')
    const creadoEnEpochMs = Date.parse(t.creadoEn.replace(" ", "T") + "Z");
    return {
      id: t.id,
      nombre: t.nombre,
      telefono: t.telefono,
      servicio: t.servicioNombre,
      barbero: t.barberoNombre,
      fecha: t.fecha,
      hora: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
      inicioEpochMs,
      creadoEnEpochMs,
      token: t.token,
    };
  });

  return NextResponse.json({ negocio: negocio.nombre, pendientes });
}
