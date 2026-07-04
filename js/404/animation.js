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
  animation.to("#notfound", {
    backgroundSize: "100% 100%",
    duration: 0.6,          // Increased slightly for a smoother color transition blend
    ease: "power2.out",
    //stagger: 0.2
  }, "-=0.2"); 

  // no idea why but this makes it look better
  animation.from("#notfound", {
    duration: 0.1,
    ease: "power2.in",
    //stagger: 0.2
  }, "-=0.2"); 

  // 3. Transition the gradient color AT THE SAME TIME as the growth
  animation.to("#notfound", {
    backgroundImage: "linear-gradient(to right, #473b4f, #473b4f)",
    backgroundColor: "#473b4f", 
    duration: 0.6,          // Matches the growth duration so they finish together
    ease: "power2.out",     // Matches the growth ease so they transition at the same rate
    stagger: 0.2
  }, "<"); // "<" means "start exactly at the beginning of the previous twin animation"

  animation.from("#description", {
    rotationX: -100,
    transformOrigin: "50% 50% -160px",
    opacity: 0,         // Starts at 0 opacity and animates up to 1
    duration: 0.8,
    ease: "power3.out", // Added .out for a smoother settle
    stagger: 0.25,
  }, "-=0.8");
  animation.from("#goback", {
    rotationX: -100,
    transformOrigin: "50% 50% -160px",
    opacity: 0,         // Starts at 0 opacity and animates up to 1
    duration: 0.8,
    ease: "power3.out", // Added .out for a smoother settle
    stagger: 0.25,
  }, "-=0.2");
}

function setup() {
  if (split) split.revert();
  const target = document.querySelector("#header");
  if (target) {
    split = new SplitText(target, { type: "words" });
  }
}

setup();
playAnimation();
