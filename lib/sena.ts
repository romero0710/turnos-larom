import "server-only";

// ============================================================================
// Config de la seña (Servicio 1, ladrillo 5). La seña se cobra en la web con
// MercadoPago. Todo por env para poder prenderla/apagarla por barbería.
// ============================================================================

/** ¿Se cobra seña por MercadoPago al reservar? */
export function senaHabilitada(): boolean {
  return process.env.SENA_ENABLED === "true" && (process.env.SENA_METODO || "mp") === "mp";
}

/** Monto de la seña en ARS a partir del precio del servicio (porcentaje configurable). */
export function montoSena(precioArs: number): number {
  const pct = parseInt(process.env.SENA_PORCENTAJE || "50", 10);
  return Math.max(0, Math.round((precioArs * pct) / 100));
}
