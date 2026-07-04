import Swup from "swup";
import { gsap } from "gsap";

const overlay = document.querySelector("#page-transition-overlay");

const swup = new Swup({
  containers: ["#swup"],
});

swup.hooks.replace("animation:out:await", async () => {
  await gsap.to(overlay, { opacity: 1, duration: 0.3, ease: "power1.out" });
});

swup.hooks.replace("animation:in:await", async () => {
  await gsap.to(overlay, { opacity: 0, duration: 0.3, ease: "power1.in" });
});
