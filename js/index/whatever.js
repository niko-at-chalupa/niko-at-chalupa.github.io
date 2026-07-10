import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

let animatedSplit = null;
let staticSplit = null;
let animation = null;

function playAnimation() {
  if (animation) animation.revert();
  if (!animatedSplit || !animatedSplit.words) return;
  animation = gsap.timeline();

  // 1. Fade in the words
  animation.from(animatedSplit.words, {
    opacity: 0,
    duration: 0.3,
    ease: "power1.out",
    stagger: 0.04,
  });

  // 2. Animate the backgrounds growing
  animation.to("#rustandpython", {
    backgroundSize: "100% 100%",
    duration: 0.6,
    ease: "power2.out",
    stagger: 0.2
  }, "-=0.2");

  animation.from("#rustandpython", {
    duration: 0.1,
    ease: "power2.in",
  }, "-=0.2");

  // 3. Transition the gradient color at the same time as the growth
  animation.to("#rustandpython", {
    backgroundImage: "linear-gradient(to right, #473b4f, #473b4f)",
    backgroundColor: "#473b4f",
    duration: 0.6,
    ease: "power2.out",
    stagger: 0.2
  }, "<");
}

function setup() {
  if (animatedSplit) animatedSplit.revert();
  if (staticSplit) staticSplit.revert();

  const animatedTarget = document.querySelector("#headertext-animated");
  const staticTarget = document.querySelector("#headertext-nonanimated");

  if (animatedTarget) {
    animatedSplit = new SplitText(animatedTarget, { type: "words" });
    gsap.set(animatedTarget, { visibility: "visible" });
  }

  // Split the static layer too, purely so both go through
  // identical whitespace/kerning layout — don't animate its words
  if (staticTarget) {
    staticSplit = new SplitText(staticTarget, { type: "words" });
  }
}

setup();
playAnimation();