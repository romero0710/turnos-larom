import "server-only";

// ============================================================================
// Integración con MercadoPago (Checkout Pro) para el cobro de la seña.
// Se habla contra la API REST con fetch (sin SDK) para no sumar dependencias
// nativas. Todo lo secreto (Access Token) vive en env, nunca en el repo.
// ============================================================================

const MP_API = "https://api.mercadopago.com";

function accessToken(): string {
  const t = process.env.MP_ACCESS_TOKEN || "";
  if (!t) throw new Error("MP_ACCESS_TOKEN no configurado");
  return t;
}

/** URL pública del sitio (para back_urls y webhook). Sin barra final. */
export function appUrl(): string {
  return (process.env.APP_URL || "https://turnos.larom.cloud").replace(/\/+$/, "");
}

/** Minutos que se mantiene el horario "en espera" mientras el cliente paga. */
export function holdMin(): number {
  return parseInt(process.env.MP_HOLD_MIN || "10", 10);
}

export interface PreferenciaSena {
  turnoId: number;
  token: string; // se usa como external_reference (identifica el turno en el webhook)
  titulo: string; // ej: "Seña · Corte · Don Gambino"
  montoArs: number;
  expiraEnMs: number; // epoch de expiración del hold (para expiration_date_to)
}

export interface PreferenciaCreada {
  id: string;
  initPoint: string; // URL del checkout a la que se manda al cliente
}

/**
 * Crea una preferencia de pago (Checkout Pro) por el monto de la seña.
 * external_reference = token del turno → así el webhook sabe qué turno confirmar.
 * La preferencia expira junto con el hold del horario.
 */
export async function crearPreferenciaSena(p: PreferenciaSena): Promise<PreferenciaCreada> {
  const base = appUrl();
  const back = `${base}/reservar/pago?token=${encodeURIComponent(p.token)}`;
  const body = {
    items: [
      {
        id: `sena-${p.turnoId}`,
        title: p.titulo,
        quantity: 1,
        currency_id: "ARS",
        unit_price: Math.round(p.montoArs),
      },
    ],
    external_reference: p.token,
    notification_url: `${base}/api/pagos/webhook`,
    back_urls: { success: back, failure: back, pending: back },
    auto_return: "approved",
    // El checkout deja de aceptar pagos cuando vence el hold del horario.
    expires: true,
    expiration_date_to: new Date(p.expiraEnMs).toISOString(),
    metadata: { turno_id: p.turnoId, token: p.token },
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`MP crearPreferencia ${res.status}: ${detalle.slice(0, 300)}`);
  }

  const data = (await res.json()) as { id: string; init_point: string; sandbox_init_point?: string };
  // En sandbox, init_point ya apunta al entorno de prueba con estas credenciales.
  return { id: data.id, initPoint: data.init_point || data.sandbox_init_point || "" };
}

export interface PagoMP {
  id: number;
  status: string; // approved | pending | rejected | ...
  statusDetail: string;
  externalReference: string | null; // = token del turno
  montoArs: number;
}

/** Consulta un pago por id (lo usa el webhook para confirmar contra MP, sin confiar en el POST). */
export async function obtenerPago(paymentId: string | number): Promise<PagoMP | null> {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`MP obtenerPago ${res.status}: ${detalle.slice(0, 300)}`);
  }
  const d = (await res.json()) as {
    id: number;
    status: string;
    status_detail: string;
    external_reference: string | null;
    transaction_amount: number;
  };
  return {
    id: d.id,
    status: d.status,
    statusDetail: d.status_detail,
    externalReference: d.external_reference ?? null,
    montoArs: d.transaction_amount ?? 0,
  };
}
