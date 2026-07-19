(() => {
  "use strict";

  const t = (key) => window.KizombaAtlasLanguage.t(key);
  const byId = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    byId("contactLanguageButton").addEventListener("click", () => {
      window.KizombaAtlasLanguage.toggle();
    });

    window.addEventListener("kizomba-atlas:languagechange", renderOfficialContact);
    byId("contactForm").addEventListener("submit", prepareEmail);
    byId("copyRequestButton").addEventListener("click", copyRequest);
    byId("shareRequestButton").addEventListener("click", shareRequest);

    renderOfficialContact();
  }

  function selectedStyles() {
    return [...document.querySelectorAll('input[name="contactStyle"]:checked')]
      .map((input) => input.value);
  }

  function value(id) {
    return byId(id)?.value.trim() || "";
  }

  function formatLocalDate(inputValue) {
    if (!inputValue) return "";
    const date = new Date(inputValue);
    if (Number.isNaN(date.getTime())) return inputValue;

    return new Intl.DateTimeFormat(
      window.KizombaAtlasLanguage.current === "fr" ? "fr-FR" : "en-GB",
      { dateStyle: "full", timeStyle: "short" }
    ).format(date);
  }

  function eventTypeLabel(value) {
    const keys = {
      party: "party",
      festival: "festival",
      workshop: "workshop"
    };
    return t(keys[value] || "party");
  }

  function requestTypeLabel(value) {
    const keys = {
      standard: "standardListing",
      featured: "featuredRequest",
      pro: "proRequest"
    };
    return t(keys[value] || "standardListing");
  }

  function buildRequest() {
    const language = window.KizombaAtlasLanguage.current;
    const divider = "────────────────────────";
    const styles = selectedStyles().join(", ") || "—";

    const lines = language === "fr"
      ? [
          "DEMANDE KIZOMBA ATLAS",
          divider,
          `Nom : ${value("contactName")}`,
          `Organisation : ${value("contactOrganization")}`,
          `E-mail : ${value("contactEmail")}`,
          `Profil officiel : ${value("contactProfile") || "—"}`,
          "",
          `Événement : ${value("contactEventName")}`,
          `Type : ${eventTypeLabel(value("contactEventType"))}`,
          `Styles : ${styles}`,
          `Début : ${formatLocalDate(value("contactStart"))}`,
          `Fin : ${formatLocalDate(value("contactEnd")) || "—"}`,
          `Lieu : ${value("contactVenue")}`,
          `Adresse : ${value("contactAddress")}`,
          `Ville / pays : ${value("contactCity")} — ${value("contactCountry")}`,
          `Billetterie : ${value("contactTicket") || "—"}`,
          `Affiche : ${value("contactPoster") || "—"}`,
          `Tarif : ${value("contactPrice") || "—"}`,
          `Demande : ${requestTypeLabel(value("contactRequestType"))}`,
          "",
          "Informations complémentaires :",
          value("contactMessage") || "—",
          divider,
          "Cette demande doit être vérifiée avant toute publication."
        ]
      : [
          "KIZOMBA ATLAS REQUEST",
          divider,
          `Name: ${value("contactName")}`,
          `Organization: ${value("contactOrganization")}`,
          `Email: ${value("contactEmail")}`,
          `Official profile: ${value("contactProfile") || "—"}`,
          "",
          `Event: ${value("contactEventName")}`,
          `Type: ${eventTypeLabel(value("contactEventType"))}`,
          `Styles: ${styles}`,
          `Start: ${formatLocalDate(value("contactStart"))}`,
          `End: ${formatLocalDate(value("contactEnd")) || "—"}`,
          `Venue: ${value("contactVenue")}`,
          `Address: ${value("contactAddress")}`,
          `City / country: ${value("contactCity")} — ${value("contactCountry")}`,
          `Tickets: ${value("contactTicket") || "—"}`,
          `Poster: ${value("contactPoster") || "—"}`,
          `Price: ${value("contactPrice") || "—"}`,
          `Request: ${requestTypeLabel(value("contactRequestType"))}`,
          "",
          "Additional information:",
          value("contactMessage") || "—",
          divider,
          "This request must be reviewed before publication."
        ];

    return lines.join("\n");
  }

  function validateForm() {
    const form = byId("contactForm");
    if (!form.reportValidity()) return false;

    if (!selectedStyles().length) {
      setStatus(t("selectOneStyle"), "error");
      return false;
    }
    return true;
  }

  function subject() {
    const prefix = window.KizombaAtlasLanguage.current === "fr"
      ? "Proposition d’événement"
      : "Event submission";
    return `[Kizomba Atlas] ${prefix} — ${value("contactEventName")} — ${value("contactCity")}`;
  }

  async function prepareEmail(event) {
    event.preventDefault();
    if (!validateForm()) return;

    const body = buildRequest();
    const config = window.KIZOMBA_ATLAS_CONTACT || {};
    const recipient = config.EMAIL || "";

    if (!recipient || !recipient.includes("@")) {
      await copyText(body);
      setStatus(t("contactNotConfiguredCopied"), "success");
      return;
    }

    const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject())}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setStatus(t("emailPrepared"), "success");
  }

  async function copyRequest() {
    if (!validateForm()) return;
    await copyText(buildRequest());
    setStatus(t("requestCopied"), "success");
  }

  async function shareRequest() {
    if (!validateForm()) return;
    const text = buildRequest();

    try {
      if (navigator.share) {
        await navigator.share({ title: subject(), text });
        setStatus(t("requestShared"), "success");
      } else {
        await copyText(text);
        setStatus(t("requestCopied"), "success");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        await copyText(text);
        setStatus(t("requestCopied"), "success");
      }
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function renderOfficialContact() {
    const config = window.KIZOMBA_ATLAS_CONTACT || {};
    const card = byId("officialContactCard");
    const links = byId("officialContactLinks");
    const items = [];

    if (config.EMAIL && config.EMAIL.includes("@")) {
      items.push(`<a class="secondary-button" href="mailto:${escapeAttribute(config.EMAIL)}">✉ ${escapeHTML(config.EMAIL)}</a>`);
    }

    if (isSafeUrl(config.INSTAGRAM_URL)) {
      items.push(`<a class="secondary-button" href="${escapeAttribute(config.INSTAGRAM_URL)}" target="_blank" rel="noopener noreferrer">Instagram</a>`);
    }

    links.innerHTML = items.join("");
    card.classList.toggle("is-hidden", !items.length);
  }

  function setStatus(message, type) {
    const status = byId("contactStatus");
    status.textContent = message || "";
    status.classList.remove("is-error", "is-success");
    if (type === "error") status.classList.add("is-error");
    if (type === "success") status.classList.add("is-success");
  }

  function isSafeUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHTML(value).replaceAll("`", "&#096;");
  }
})();
