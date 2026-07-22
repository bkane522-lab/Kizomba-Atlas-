// Kizomba Atlas — connexion Supabase
window.KIZOMBA_ATLAS_CONFIG = {
  SUPABASE_URL: "https://kiqavtasdwqkfmuqbagk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_iSHoDQRc8RUh8U2Q2JGgOA_0DbIu2jP",

  DEFAULT_MAP_CENTER: [48.25, 3.05],
  DEFAULT_MAP_ZOOM: 5.35
};

window.isSupabaseConfigured = function () {
  const config = window.KIZOMBA_ATLAS_CONFIG || {};

  return Boolean(
    config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    config.SUPABASE_URL.startsWith("https://") &&
    !config.SUPABASE_URL.includes("YOUR_") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_")
  );
};
