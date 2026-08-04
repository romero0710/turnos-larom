import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autocontenido para el contenedor de producción: Next copia solo lo
  // necesario (server + node_modules mínimos) a .next/standalone. No afecta al dev.
  output: "standalone",
  // Permite acceder al servidor de desarrollo desde otros dispositivos de la
  // misma red (ej: celular) sin que Next.js bloquee los assets por origen distinto.
  allowedDevOrigins: ["192.168.1.56"],
  // better-sqlite3 es un módulo nativo: no debe pasar por el bundler.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
