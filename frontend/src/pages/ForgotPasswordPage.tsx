import { Link } from "react-router-dom";

export function ForgotPasswordPage() {
  return (
    <div className="min-h-screen w-full min-w-0 flex items-center justify-center p-4 sm:p-6 bg-zinc-100">
      <div className="w-full max-w-md min-w-0 f-panel">
        <h1 className="text-lg font-semibold text-zinc-900">Recuperar contraseña</h1>
        <p className="text-sm text-zinc-600 mt-3 leading-relaxed">
          En este entorno de demostración no hay restablecimiento automático por correo.
          Si olvidó su contraseña, contacte al administrador de su organización o al equipo
          que gestiona Finecta para que le asignen una nueva clave.
        </p>
        <p className="text-sm text-zinc-500 mt-4">
          Para pruebas puede usar las cuentas de ejemplo en la pantalla de inicio de sesión.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex text-sm font-medium text-orange-600 hover:underline"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}
