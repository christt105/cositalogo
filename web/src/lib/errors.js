/** A message for the user about a failed API call, by status. */
export function errorMessage(err) {
  switch (err?.status) {
    case 401:
      return "Tienes que iniciar sesión otra vez.";
    case 403:
      return "No tienes permiso para hacer esto.";
    case 404:
      return "Eso ya no existe.";
    case 400:
    case 409:
    case 422:
      return `La API no lo acepta: ${err.message}`;
    case 503:
      return "La web no está configurada del todo todavía. Avisa a un admin.";
    default:
      return "Algo ha fallado. Vuelve a intentarlo dentro de un rato.";
  }
}
