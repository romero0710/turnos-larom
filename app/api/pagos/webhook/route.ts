import { NextRequest, NextResponse } from "next/server";
import { obtenerPago } from "@/lib/mp";
import { aprobarPagoPorToken } from "@/lib/turnos";

// ============================================================================
// Webhook de MercadoPago (Servicio 1, ladrillo 5). MP nos avisa acá cuando pasa
// algo con un pago. NO confiamos en el cuerpo: tomamos el id del pago y lo
// re-consultamos contra la API de MP con nuestro Access Token para saber la
// verdad. Si está aprobado, confirmamos el turno (idempotente).
// ============================================================================

export const dynamic = "force-dynamic";

/** Extrae el id del pago de las distintas formas en que MP notifica. */
function idDePago(req: NextRequest, body: unknown): string | null {
  const q = req.nextUrl.searchParams;
  const tipo = q.get("type") || q.get("topic") || (isObj(body) ? String(body.type ?? body.topic ?? "") : "");
  // Solo nos interesan notificaciones de pago.
  if (tipo && tipo !== "payment") return null;

  const porQuery = q.get("data.id") || q.get("id");
  if (porQuery) return porQuery;

  if (isObj(body)) {
    const data = body.data;
    if (isObj(data) && data.id != null) return String(data.id);
    if (body.id != null) return String(body.id);
  }
  return null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function avisarBotConfirmado(): Promise<void> {
  const secret = process.env.BOT_API_SECRET || "";
  if (!secret) return;
  const botUrl = process.env.BOT_URL || "http://larom_wabot:3000";
  try {
    await fetch(`${botUrl}/interno/check`, {
      method: "POST",
      headers: { "x-bot-secret": secret },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // ignorado a propósito
  }
}

async function manejar(req: NextRequest): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null; // MP a veces notifica sin cuerpo (solo query params)
  }

  const pagoId = idDePago(req, body);
  if (!pagoId) return NextResponse.json({ ok: true, ignorado: true });

  try {
    const pago = await obtenerPago(pagoId);
    if (!pago || pago.status !== "approved" || !pago.externalReference) {
      // Pendiente/rechazado/otro: no confirmamos nada, pero avisamos recibido.
      return NextResponse.json({ ok: true, estado: pago?.status ?? "desconocido" });
    }
    const r = aprobarPagoPorToken(pago.externalReference, pago.montoArs);
    if (r.ok) await avisarBotConfirmado();
    return NextResponse.json({ ok: true, confirmado: r.ok });
  } catch (e) {
    // Error transitorio (ej. MP no responde): 500 para que MP reintente.
    console.error("[webhook] error procesando pago:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return manejar(req);
}

// MP a veces valida el endpoint con un GET; respondemos 200.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
