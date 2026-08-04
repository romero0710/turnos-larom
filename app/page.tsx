import Image from "next/image";
import Link from "next/link";
import { negocio } from "@/config/negocio";
import { formatearPrecio, horarioResumen } from "@/lib/disponibilidad";
import { listarServicios } from "@/lib/servicios";
import { listarBarberos } from "@/lib/barberos";
import { listarGaleria } from "@/lib/galeria";
import Galeria from "@/components/Galeria";

// Lee servicios/barberos de la base en cada request (editables desde el panel).
export const dynamic = "force-dynamic";

export default function Home() {
  const primario = negocio.marca.primario;
  const textoSobrePrimario = negocio.marca.primarioTextoOscuro ? "#111827" : "#ffffff";
  const servicios = listarServicios();
  const barberos = listarBarberos(true);
  const horarios = horarioResumen({ ...negocio, barberos });
  const { logo, portada } = negocio.imagenes ?? {};
  const galeria = listarGaleria().map((f) => f.imagen);

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            {logo && (
              <Image
                src={logo}
                alt={`Logo de ${negocio.nombre}`}
                width={40}
                height={40}
                className="rounded-full object-cover"
              />
            )}
            <span className="text-lg font-semibold tracking-tight">{negocio.nombre}</span>
          </div>
          <Link
            href="/reservar"
            className="rounded-full px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: primario, color: textoSobrePrimario }}
          >
            Reservar turno
          </Link>
        </div>
      </header>

      {/* Hero con foto del local de fondo */}
      <section className="relative overflow-hidden bg-zinc-950 text-white">
        {portada && (
          <>
            <Image
              src={portada}
              alt={`Frente de ${negocio.nombre}`}
              fill
              priority
              className="object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-950/30" />
          </>
        )}
        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-6 py-24">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            style={{ background: primario, color: textoSobrePrimario }}
          >
            {negocio.rubro}
          </span>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {negocio.nombre}
          </h1>
          <p className="max-w-xl text-lg leading-8 text-zinc-200">{negocio.descripcion}</p>
          <Link
            href="/reservar"
            className="mt-2 rounded-full px-7 py-3 text-base font-semibold transition-opacity hover:opacity-90"
            style={{ background: primario, color: textoSobrePrimario }}
          >
            Reservar turno online
          </Link>
        </div>
      </section>

      {/* Servicios */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-bold tracking-tight">Servicios</h2>
        <p className="mt-1 text-zinc-500">Elegí el servicio y reservá el horario que te quede cómodo.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servicios.map((s) => {
            const conFoto = Boolean(s.imagen);
            return (
              <Link
                key={s.id}
                href={`/reservar?servicio=${s.id}`}
                className={`relative flex min-h-56 flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200 p-6 transition-shadow hover:shadow-md ${
                  conFoto ? "text-white" : "bg-white text-zinc-900"
                }`}
              >
                {conFoto && (
                  <>
                    <Image
                      src={s.imagen!}
                      alt={s.nombre}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/25" />
                  </>
                )}
                <div className="relative">
                  <h3 className={`text-lg font-semibold ${conFoto ? "drop-shadow" : ""}`}>{s.nombre}</h3>
                  <p className={`mt-1 text-sm ${conFoto ? "text-zinc-200" : "text-zinc-500"}`}>
                    {s.duracionMin} min
                  </p>
                </div>
                <p className={`relative mt-6 text-2xl font-bold ${conFoto ? "drop-shadow" : ""}`}>
                  {formatearPrecio(s.precioArs)}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Galería de trabajos */}
      {galeria && galeria.length > 0 && (
        <section className="border-t border-zinc-200 bg-zinc-50">
          <div className="mx-auto w-full max-w-5xl px-6 py-16">
            <h2 className="text-2xl font-bold tracking-tight">Nuestro trabajo</h2>
            <p className="mt-1 text-zinc-500">Algunos de nuestros mejores cortes.</p>
            <div className="mt-8">
              <Galeria imagenes={galeria} alt={`Trabajo de ${negocio.nombre}`} />
            </div>
          </div>
        </section>
      )}

      {/* Info: horarios + equipo */}
      <section className="border-t border-zinc-200 bg-white">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-16 sm:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Horarios de atención</h2>
            <ul className="mt-4 space-y-2 text-zinc-700">
              {horarios.map((h) => (
                <li key={h} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: primario }} />
                  {h}
                </li>
              ))}
            </ul>
            {negocio.direccion && (
              <p className="mt-6 text-zinc-700">
                <span className="font-semibold">Dirección: </span>
                {negocio.direccion}
              </p>
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Nuestro equipo</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {barberos.map((b) => (
                  <span
                    key={b.id}
                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium"
                  >
                    {b.nombre}
                  </span>
                ))}
            </div>
            <Link
              href="/reservar"
              className="mt-8 inline-block rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: primario, color: textoSobrePrimario }}
            >
              Reservar turno
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 text-sm text-zinc-500">
          © {new Date().getFullYear()} {negocio.nombre}. Reservá tu turno online.
        </div>
      </footer>
    </div>
  );
}
