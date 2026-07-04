import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Target all windows
ScrollTrigger.batch(".window", {
  start: "top 85%",
  onEnter: (batch) => {
    gsap.to(batch, {
      opacity: 100,
      scale: 1,
      y: 0,
      duration: 0.5,
      ease: "power4.out",
      stagger: {
        amount: 0.2,
        grid: "auto",
        from: "start"
      }
    });
  },
  once: true
});