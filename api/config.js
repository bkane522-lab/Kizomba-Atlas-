module.exports = function handler(request, response) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabasePublicKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "";
    const adminEmail =
      process.env.KIZOMBA_ATLAS_ADMIN_EMAIL ||
      "kizombaatlas.contact@gmail.com";

    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.status(200).json({
      configured: Boolean(supabaseUrl && supabasePublicKey),
      supabaseUrl,
      supabasePublicKey,
      adminEmail
    });
  } catch (err) {
    return response.status(500).json({
      configured: false,
      error: String(err && err.message ? err.message : err)
    });
  }
};
