export async function leerJson(response) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('El servidor no devolvió JSON. Comprueba que la API esté disponible en /api.');
  }
  try {
    return await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error('El servidor devolvió una respuesta JSON inválida. Vuelve a intentar.');
  }
}
