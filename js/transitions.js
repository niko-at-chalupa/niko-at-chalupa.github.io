import Swup from "swup";
import { gsap } from "gsap";

// Get the transition overlay element that covers the page
const overlay = document.querySelector("#page-transition-overlay");

// Handle initial page load transition:
// The overlay starts with opacity 1 (black/dark background) in CSS to hide flash of content.
// We animate it to opacity 0 on load to create a smooth fade-in reveal effect.
if (overlay) {
  gsap.to(overlay, { 
    opacity: 0, 
    duration: 0.15, 
    ease: "power1.in" 
  });
}

// Initialize Swup with the main page container for SPA-like transitions
const swup = new Swup({
  containers: ["#swup"],
});

// Hook executed before loading the new page content:
// We fade the overlay back to opacity 1 to mask the content switch (fade-out transition)
swup.hooks.replace("animation:out:await", async () => {
  await gsap.to(overlay, { opacity: 1, duration: 0.3, ease: "power1.out" });
});

// Hook executed after the new page content is loaded:
// We fade the overlay to opacity 0 to reveal the new page (fade-in transition)
swup.hooks.replace("animation:in:await", async () => {
  await gsap.to(overlay, { opacity: 0, duration: 0.3, ease: "power1.in" });
});
