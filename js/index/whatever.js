import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

let split = null;
let animation = null;

function playAnimation() {
  if (animation) animation.revert();
  if (!split || !split.words) return;
  
  animation = gsap.timeline();

  // 1. Fade in the words
  animation.from(split.words, {
    opacity: 0,
    duration: 0.3,
    ease: "power1.out",
    stagger: 0.05
  });

  // 2. Animate the backgrounds growing
  animation.to("#rustandpython", {
    backgroundSize: "100% 100%",
    duration: 0.6,          // Increased slightly for a smoother color transition blend
    ease: "power2.out",
    stagger: 0.2
  }, "-=0.2"); 
  // no idea why but this makes it look better
  animation.from("#rustandpython", {
    duration: 0.1,
    ease: "power2.in",
    //stagger: 0.2
  }, "-=0.2"); 

  // 3. Transition the gradient color AT THE SAME TIME as the growth
  animation.to("#rustandpython", {
    backgroundImage: "linear-gradient(to right, #473b4f, #473b4f)",
    backgroundColor: "#473b4f", 
    duration: 0.6,          // Matches the growth duration so they finish together
    ease: "power2.out",     // Matches the growth ease so they transition at the same rate
    stagger: 0.2
  }, "<"); // "<" means "start exactly at the beginning of the previous twin animation"
}

function setup() {
  if (split) split.revert();
  const target = document.querySelector("#header h1");
  if (target) {
    split = new SplitText(target, { type: "words" });
    gsap.set(target, { visibility: "visible" });
  }
}

setup();
playAnimation();
