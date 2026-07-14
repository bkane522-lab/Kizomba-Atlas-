(() => {
  "use strict";

  const AUTO_DELAY = 3000;
  const TRANSITION_DELAY = 560;

  let currentIndex = 0;
  let timer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let isOpen = false;

  const elements = {};

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  function init() {
    elements.showcase = document.getElementById("featuredShowcase");
    elements.stage = document.getElementById("featuredStage");
    elements.slides = [...document.querySelectorAll(".featured-slide")];
    elements.dots = [...document.querySelectorAll(".featured-dot")];
    elements.close = document.getElementById("featuredCloseButton");
    elements.explore = document.getElementById("featuredExploreButton");
    elements.reopen = document.getElementById("featuredReopenButton");
    elements.label = document.getElementById("featuredShowcaseTitle");
    elements.exploreTitle = document.getElementById("featuredExploreTitle");
    elements.exploreText = document.getElementById("featuredExploreText");

    if (!elements.showcase || elements.slides.length < 2) return;

    bindEvents();
    updateLanguage();

    // Laisse la carte se construire, puis fait arriver l'affiche avec l'effet "bimm".
    window.setTimeout(openShowcase, 360);
  }

  function bindEvents() {
    elements.close?.addEventListener("click", closeShowcase);
    elements.explore?.addEventListener("click", closeShowcase);
    elements.reopen?.addEventListener("click", openShowcase);

    elements.dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        const nextIndex = Number(dot.dataset.slide);
        showSlide(nextIndex, nextIndex > currentIndex ? 1 : -1);
        restartTimer();
      });
    });

    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => {
        if (isOpen) closeShowcase();
      });
    });

    elements.stage?.addEventListener("pointerenter", stopTimer);
    elements.stage?.addEventListener("pointerleave", () => {
      if (isOpen) startTimer();
    });

    elements.stage?.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      stopTimer();
    }, { passive: true });

    elements.stage?.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;

      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
        showSlide(currentIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      }
      if (isOpen) startTimer();
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopTimer();
      else if (isOpen) startTimer();
    });

    window.addEventListener("kizomba-atlas:languagechange", updateLanguage);
  }

  function openShowcase() {
    if (!elements.showcase) return;

    isOpen = true;
    elements.showcase.hidden = false;
    elements.reopen?.classList.remove("is-visible");

    // Deux frames garantissent que l'animation d'entrée démarre réellement.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        elements.showcase.classList.add("is-open");
      });
    });

    currentIndex = 0;
    updateSlides(0);
    startTimer();
  }

  function closeShowcase() {
    if (!elements.showcase || !isOpen) return;

    isOpen = false;
    stopTimer();
    elements.showcase.classList.remove("is-open");
    elements.showcase.classList.add("is-closing");

    window.setTimeout(() => {
      elements.showcase.hidden = true;
      elements.showcase.classList.remove("is-closing");
      elements.reopen?.classList.add("is-visible");
      window.dispatchEvent(new Event("resize"));
    }, 430);
  }

  function showSlide(rawIndex, direction = 1) {
    if (!elements.slides.length) return;

    const nextIndex = (rawIndex + elements.slides.length) % elements.slides.length;
    if (nextIndex === currentIndex) return;

    const previous = elements.slides[currentIndex];
    const next = elements.slides[nextIndex];

    previous.classList.remove("is-active", "is-entering-forward", "is-entering-backward");
    previous.classList.add(direction >= 0 ? "is-leaving-forward" : "is-leaving-backward");
    previous.setAttribute("aria-hidden", "true");

    next.classList.remove("is-leaving-forward", "is-leaving-backward");
    next.classList.add(direction >= 0 ? "is-entering-forward" : "is-entering-backward");
    next.setAttribute("aria-hidden", "false");

    // Force le navigateur à prendre en compte l'état initial de l'animation.
    void next.offsetWidth;

    next.classList.add("is-active");
    next.classList.remove("is-entering-forward", "is-entering-backward");

    window.setTimeout(() => {
      previous.classList.remove("is-leaving-forward", "is-leaving-backward");
    }, TRANSITION_DELAY);

    currentIndex = nextIndex;
    updateDots();
  }

  function updateSlides(activeIndex) {
    elements.slides.forEach((slide, index) => {
      const active = index === activeIndex;
      slide.classList.toggle("is-active", active);
      slide.classList.remove(
        "is-leaving-forward",
        "is-leaving-backward",
        "is-entering-forward",
        "is-entering-backward"
      );
      slide.setAttribute("aria-hidden", String(!active));
    });
    currentIndex = activeIndex;
    updateDots();
  }

  function updateDots() {
    elements.dots.forEach((dot, index) => {
      const active = index === currentIndex;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
  }

  function startTimer() {
    stopTimer();

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reducedMotion || !isOpen) return;

    timer = window.setInterval(() => {
      showSlide(currentIndex + 1, 1);
    }, AUTO_DELAY);
  }

  function stopTimer() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function restartTimer() {
    stopTimer();
    if (isOpen) startTimer();
  }

  function updateLanguage() {
    const language = window.KizombaAtlasLanguage?.current || "fr";
    const english = language === "en";

    if (elements.label) elements.label.textContent = english ? "FEATURED" : "À LA UNE";
    if (elements.exploreTitle) elements.exploreTitle.textContent = english ? "Explore the map" : "Découvrir la carte";
    if (elements.exploreText) {
      elements.exploreText.textContent = english
        ? "Parties, festivals and workshops around you"
        : "Soirées, festivals et workshops autour de vous";
    }
    if (elements.close) elements.close.setAttribute("aria-label", english ? "Close posters" : "Fermer les affiches");
    if (elements.reopen) {
      elements.reopen.setAttribute(
        "aria-label",
        english ? "Show featured events" : "Afficher les événements à la une"
      );
    }
  }
})();
