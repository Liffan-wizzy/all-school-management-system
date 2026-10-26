import {
  getAuthenticatedUser,
  json
} from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    const auth = await getAuthenticatedUser(request, env);

    if (!auth.user) {
      return auth.response;
    }

    return json({
      ok: true,
      user: auth.user
    });
  } catch (error) {
    console.error("Auth me error:", error);

    return json({
      error: "Unable to load signed-in user."
    }, 500);
  }
}