# Imagen de producción de la web de reservas (Next.js 16 standalone + better-sqlite3).
# Build multi-stage: dependencias -> compilación -> runtime mínimo.

# ---- Dependencias ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 es un módulo nativo: puede necesitar compilar. Toolchain mínima.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- Compilación ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DB_PATH=/app/data/turnos.db \
    UPLOADS_PATH=/app/data/uploads
# Output "standalone": Next copia el server + solo los node_modules que traza
# (incluye el binario nativo de better-sqlite3).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Carpeta de datos persistente: acá se monta el volumen del server (DB + uploads).
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
