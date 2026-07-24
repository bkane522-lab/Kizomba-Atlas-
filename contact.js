(() => {
  "use strict";

  /* =========================================================
     KIZOMBA ATLAS — Page contact
     L'envoi principal passe par la fonction serveur /api/submit.
     La copie et l'e-mail restent disponibles en secours.
     ========================================================= */

  const state = {
    busy: false
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    byId("contactForm")?.addEventListener("submit", sendRequest);
    byId("copyRequestButton")?.addEventListener("click", copyRequest);
    byId("emailRequestButton")?.addEventListener("click", prepareEmail);
    byId("contactAnother")?.addEventListener("click", backToForm);

    byId("contactLanguageButton")?.addEventListener("click", () => {
      window.KizombaAtlasLanguage?.toggle();
    });

    renderOfficialContact();
  }

  /* ---------------------------------------------------------
     Envoi principal
     --------------------------------------------------------- */
  async function sendRequest(event) {
    event.preventDefault();
    if (state.busy) return;

    const styles = checkedValues("contactStyle");
    if (!styles.length) {
      setStatus(t("selectOneStyle", "Sélectionnez au moins un style de danse."), "error");
      return;
    }

    const start = value("contactStart");
    const end = value("contactEnd");

    if (end && new Date(end) <= new Date(start)) {
      setStatus(
        "La date de fin doit être postérieure au début. Pour une soirée qui finit après minuit, indiquez le lendemain.",
        "error"
      );
      return;
    }

    const payload = {
      title_fr: value("contactEventName"),
      description_fr: value("contactMessage"),
      organizer_name: value("contactOrganization"),
      category: value("contactEventType") || "party",
      styles,
      starts_at: start ? new Date(start).toISOString() : null,
      ends_at: end ? new Date(end).toISOString() : null,
      venue_name: value("contactVenue"),
      address: value("contactAddress"),
      city: value("contactCity"),
      country: value("contactCountry") || "France",
      ticket_url: value("contactTicket") || null,
      image_url: value("contactPoster") || null,
      price_text_fr: value("contactPrice"),
      contact_name: value("contactName"),
      contact_email: value("contactEmail"),
      contact_profile: value("contactProfile") || null,
      course_tags: checkedValues("courseTag"),
      request_type: value("contactRequestType"),
      website: value("contactWebsite")
    };

    setBusy(true, "Envoi en cours…");

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "L’envoi a échoué. Réessayez.");
      }

      showSuccess();
    } catch (error) {
      console.error(error);
      setStatus(
        `${error.message} Vous pouvez aussi utiliser « Envoyer par e-mail ».`,
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------
     Secours : copie et e-mail
     --------------------------------------------------------- */
  async function copyRequest() {
    const text = buildPlainText();

    try {
      await navigator.clipboard.writeText(text);
      setStatus(t("requestCopied", "La demande a été copiée."), "success");
    } catch (error) {
      setStatus("La copie n’a pas fonctionné sur cet appareil.", "error");
    }
  }

  function prepareEmail() {
    const config = window.KIZOMBA_ATLAS_CONTACT || {};

    if (!window.isKizombaAtlasContactConfigured?.()) {
      copyRequest();
      return;
    }

    const subject = `Proposition d’événement — ${value("contactEventName") || "Kizomba Atlas"}`;
    const body = buildPlainText();

    window.location.href =
      `mailto:${encodeURIComponent(config.EMAIL)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    setStatus(t("emailPrepared", "L’e-mail est prêt dans votre application de messagerie."), "success");
  }

  function buildPlainText() {
    const styles = checkedValues("contactStyle").join(", ");

    const lines = [
      `Nom : ${value("contactName")}`,
      `Organisation : ${value("contactOrganization")}`,
      `Email : ${value("contactEmail")}`,
      `Profil officiel : ${value("contactProfile")}`,
      "",
      `Événement : ${value("contactEventName")}`,
      `Type : ${value("contactEventType")}`,
      `Styles : ${styles}`,
      `Début : ${value("contactStart")}`,
      `Fin : ${value("contactEnd")}`,
      "",
      `Lieu : ${value("contactVenue")}`,
      `Adresse : ${value("contactAddress")}`,
      `Ville : ${value("contactCity")}`,
      `Pays : ${value("contactCountry")}`,
      "",
      `Billetterie : ${value("contactTicket")}`,
      `Affiche : ${value("contactPoster")}`,
      `Tarif : ${value("contactPrice")}`,
      `Demande : ${value("contactRequestType")}`,
      "",
      "Informations complémentaires :",
      value("contactMessage")
    ];

    return lines.join("\n");
  }

  /* ---------------------------------------------------------
     Affichage
     --------------------------------------------------------- */
  function showSuccess() {
    byId("contactForm")?.closest(".contact-card")?.classList.add("is-hidden");
    byId("contactSuccess")?.classList.remove("is-hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToForm() {
    byId("contactForm")?.reset();
    byId("contactForm")?.closest(".contact-card")?.classList.remove("is-hidden");
    byId("contactSuccess")?.classList.add("is-hidden");
    setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderOfficialContact() {
    const config = window.KIZOMBA_ATLAS_CONTACT || {};
    const card = byId("officialContactCard");
    const container = byId("officialContactLinks");
    if (!card || !container) return;

    const links = [];

    if (config.EMAIL && config.EMAIL.includes("@")) {
      links.push({ label: `✉ ${config.EMAIL}`, href: `mailto:${config.EMAIL}` });
    }

    if (config.INSTAGRAM_URL) {
      links.push({ label: "Profil officiel", href: config.INSTAGRAM_URL });
    }

    if (!links.length) return;

    container.innerHTML = "";

    links.forEach((link) => {
      const anchor = document.createElement("a");
      anchor.className = "secondary-button";
      anchor.href = link.href;
      anchor.textContent = link.label;
      anchor.rel = "noopener noreferrer";
      container.appendChild(anchor);
    });

    card.classList.remove("is-hidden");
  }

  function setBusy(busy, label = "") {
    state.busy = busy;
    const button = byId("sendRequestButton");
    if (button) button.disabled = busy;
    if (busy && label) setStatus(label);
  }

  function setStatus(message, type = "") {
    const element = byId("contactStatus");
    if (!element) return;
    element.textContent = message || "";
    element.classList.remove("is-error", "is-success");
    if (type === "error") element.classList.add("is-error");
    if (type === "success") element.classList.add("is-success");
  }

  /* ---------------------------------------------------------
     Utilitaires
     --------------------------------------------------------- */
  function byId(id) {
    return document.getElementById(id);
  }

  function value(id) {
    return byId(id)?.value?.trim() || "";
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)]
      .map((input) => input.value);
  }

  function t(key, fallback) {
    const translated = window.KizombaAtlasLanguage?.t?.(key);
    return translated && translated !== key ? translated : fallback;
  }
})();
