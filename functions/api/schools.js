function authenticationUnavailable() {
  return Response.json({
    error: "School registry is unavailable until authentication and server-side authorization are configured."
  }, { status: 503 });
}

// Fail closed: never expose or change school records without verified identity,
// platform-admin role checks, and server-side school membership enforcement.
export async function onRequestGet() {
  return authenticationUnavailable();
}

export async function onRequestPost() {
  return authenticationUnavailable();
}
