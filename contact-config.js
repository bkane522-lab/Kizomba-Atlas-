window.KIZOMBA_ATLAS_CONTACT = {
  EMAIL: "kizombaatlas.contact@gmail.com",
  INSTAGRAM_URL: "",
  PUBLIC_NAME: "L’équipe Kizomba Atlas"
};

window.isKizombaAtlasContactConfigured = function () {
  const config = window.KIZOMBA_ATLAS_CONTACT || {};
  return Boolean(config.EMAIL && config.EMAIL.includes("@"));
};
