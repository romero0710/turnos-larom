import { NextResponse } from "next/server";
import { negocio } from "@/config/negocio";
import { listarParaResena } from "@/lib/turnos";

// Turnos ya terminados para el mensaje post-turno (ladrillo 4): pedido de reseña
// en Google + fidelización. Protegida por header x-bot-secret. El bot filtra por
// su ventana horaria (horas / ventanaMin) y deduplica.
//   ?horas=3        → turnos que terminaron hace ~3 horas
//   ?ventanaMin=45  → ancho de la ventana hacia atrás
// Devuelve para cada turno: id, nombre, telefono, servicio, finEpochMs y
// "asistidos" (conteo de cortes asistidos de ese teléfono, para "vas X/10").

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.BOT_API_SECRET || "";
  if (!secret || (req.headers.get("x-bot-secret") || "") !== secret) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const horas = Math.max(0, Number(url.searchParams.get("horas") ?? "3"));
  const ventanaMin = Math.max(1, Number(url.searchParams.get("ventanaMin") ?? "45"));

  const ahora = Date.now();
  const finDesde = ahora - (horas * 60 + ventanaMin) * 60_000;
  const finHasta = ahora - horas * 60 * 60_000;

  // Solo los que terminaron dentro de la ventana [finDesde, finHasta].
  const turnos = listarParaResena().filter(
    (t) => t.finEpochMs >= finDesde && t.finEpochMs <= finHasta,
  );

  return NextResponse.json({ negocio: negocio.nombre, turnos });
}
