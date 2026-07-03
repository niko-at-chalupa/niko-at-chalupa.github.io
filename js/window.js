import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Target all windows
gsap.from(".window", {
    // 1. Setup the viewport trigger
    scrollTrigger: {
        trigger: ".window",         // What element kicks off the animation
        start: "top 85%",           // Trigger when the top of the window hits 85% of viewport height
        toggleActions: "play none none none" // Play once, don't reverse on scroll up
    },
    
    // 2. The "Spawn" starting states
    opacity: 0,
    scale: 0.92,                    // Starts slightly smaller
    y: 40,                          // Starts 40px lower down
    
    // 3. The Animation Easing & Timing
    duration: 0.5,
    ease: "power4.out",             // Fast start, smooth deceleration (matches your cubic-bezier)
    
    // 4. The Magic Sauce
    stagger: {
        amount: 0.2,                // Total time distributed among all entering windows
        grid: "auto",               // Smart staggering if they are in a grid layout
        from: "start"
    }
});