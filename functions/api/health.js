export async function onRequestGet() {
  return Response.json({
    ok: true,
    service: "Liffan All-School Platform API",
    note: "Health check only. Configure D1 and authentication before using real school data."
  });
}
