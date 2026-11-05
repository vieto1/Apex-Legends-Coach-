// Decorative motion never controls scrolling, playback or analysis.
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const hero = document.querySelector(".hero");
const header = document.getElementById("siteHeader");
const menuButton = document.getElementById("navToggle");
const motionButton = document.getElementById("motionToggle");
const narrowNav = matchMedia("(max-width: 760px)");
const navLinks = document.getElementById("navLinks");
const syncMenuFocus = () => {
  navLinks.inert = narrowNav.matches && !header.classList.contains("menu-open");
};
let paused = false,
  frame = 0,
  heroInView = true;
const layers = [...document.querySelectorAll("[data-depth]")];
const closeMenu = () => {
  header.classList.remove("menu-open");
  menuButton.setAttribute("aria-expanded", "false");
  syncMenuFocus();
};
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  header.classList.toggle("menu-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  syncMenuFocus();
});
narrowNav.addEventListener("change", () => {
  if (!narrowNav.matches) closeMenu();
  syncMenuFocus();
});
syncMenuFocus();
document
  .querySelectorAll(".nav-links a")
  .forEach((a) => a.addEventListener("click", closeMenu));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && header.classList.contains("menu-open")) {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener("click", (e) => {
  if (!header.contains(e.target)) closeMenu();
});
const paint = () => {
  frame = 0;
  const active = !reduced.matches && !paused;
  const scroll = active ? Math.min(scrollY, hero.offsetHeight) : 0;
  for (const layer of layers)
    layer.style.setProperty(
      "--layer-y",
      `${scroll * Number(layer.dataset.depth)}px`,
    );
};
const schedule = () => {
  header.classList.toggle("is-scrolled", scrollY > 50);
  if (!frame && heroInView) frame = requestAnimationFrame(paint);
};
const applyMotion = () => {
  const stopped = paused || reduced.matches;
  document.body.dataset.motion = stopped ? "paused" : "playing";
  document.documentElement.dataset.motion = document.body.dataset.motion;
  motionButton.setAttribute("aria-pressed", String(stopped));
  motionButton.disabled = reduced.matches;
  motionButton.setAttribute(
    "aria-label",
    reduced.matches
      ? "Reduzierte Bewegung ist im System aktiviert"
      : stopped
        ? "Animationen fortsetzen"
        : "Animationen pausieren",
  );
  if (reduced.matches) {
    for (const layer of layers) layer.style.setProperty("--layer-y", "0px");
  } else if (!stopped) schedule();
};
motionButton.addEventListener("click", () => {
  paused = !paused;
  applyMotion();
});
reduced.addEventListener("change", applyMotion);
addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", schedule, { passive: true });
if ("IntersectionObserver" in window) {
  new IntersectionObserver(
    (entries) => {
      heroInView = entries[0].isIntersecting;
      document.body.dataset.heroVisible = String(heroInView);
      if (heroInView) schedule();
    },
    { rootMargin: "150px" },
  ).observe(hero);
  document.documentElement.classList.add("motion-ready");
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          reveal.unobserve(entry.target);
        }
    },
    { threshold: 0.12 },
  );
  document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));
  const sections = [...document.querySelectorAll("[data-chapter-section]")];
  const chapters = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          const id = entry.target.dataset.chapterSection;
          document.querySelectorAll("[data-chapter]").forEach((link) => {
            if (link.dataset.chapter === id)
              link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          });
        }
    },
    { rootMargin: "-12% 0px -58% 0px", threshold: 0 },
  );
  sections.forEach((section) => chapters.observe(section));
}
const leaves = document.getElementById("leaves");
for (let i = 0; i < 13; i++) {
  const leaf = document.createElement("i");
  leaf.className = "leaf";
  leaf.style.setProperty("--x", `${(i * 19 + 7) % 100}%`);
  leaf.style.setProperty("--size", `${7 + ((i * 7) % 13)}px`);
  leaf.style.setProperty("--duration", `${19 + ((i * 7) % 19)}s`);
  leaf.style.setProperty("--delay", `${-i * 3.7}s`);
  leaves.append(leaf);
}
applyMotion();
