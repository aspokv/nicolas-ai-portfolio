import './style.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

document.getElementById('year').textContent = new Date().getFullYear()

/* =========================================
   SMOOTH SCROLL (LENIS)
   ========================================= */
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  direction: 'vertical',
  gestureDirection: 'vertical',
  smooth: true,
  mouseMultiplier: 1,
})

lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((time) => { lenis.raf(time * 1000) })
gsap.ticker.lagSmoothing(0)

/* =========================================
   MOUSE TRACKING (GLOW & MAGNET)
   ========================================= */
const root = document.documentElement;

document.addEventListener('mousemove', (e) => {
  root.style.setProperty('--mouse-x', `${e.clientX}px`);
  root.style.setProperty('--mouse-y', `${e.clientY}px`);
});

// Magnetic Buttons
const magneticBtns = document.querySelectorAll('.magnetic-btn');

magneticBtns.forEach(btn => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    gsap.to(btn, {
      x: x * 0.3,
      y: y * 0.3,
      duration: 0.5,
      ease: 'power3.out'
    });
    
    gsap.to(btn.querySelector('.btn-text'), {
      x: x * 0.1,
      y: y * 0.1,
      duration: 0.5,
      ease: 'power3.out'
    });
  });

  btn.addEventListener('mouseleave', () => {
    gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.3)' });
    gsap.to(btn.querySelector('.btn-text'), { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.3)' });
  });
});

// Card Glow Tracker
const premiumCards = document.querySelectorAll('.premium-hover');
premiumCards.forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  });
});

/* =========================================
   INITIAL LOAD ANIMATION
   ========================================= */
const tl = gsap.timeline({
  onComplete: () => {
    document.body.style.overflow = 'auto'
    ScrollTrigger.refresh()
  }
})

document.body.style.overflow = 'hidden'

// Preloader
tl.to('.preloader .char', {
  y: '0%', opacity: 1, duration: 1, stagger: 0.05, ease: 'power4.out'
})
.to('.preloader .char', {
  y: '-100%', opacity: 0, duration: 0.8, stagger: 0.02, ease: 'power3.in', delay: 0.3
})
.to('.preloader', {
  yPercent: -100, duration: 1, ease: 'expo.inOut'
}, '-=0.5')

// Hero Reveal (Clip-path/Translate)
tl.fromTo('.line-inner', 
  { y: '100%', rotate: 5 },
  { y: '0%', rotate: 0, duration: 1.4, stagger: 0.1, ease: 'power4.out' },
  '-=0.5'
)

tl.to('.hero-image-wrapper', {
  opacity: 1, scale: 1, duration: 1.5, ease: 'power3.out'
}, '-=1.2')

tl.to('.image-reveal-mask', {
  yPercent: -100, duration: 1.2, ease: 'expo.inOut'
}, '-=1.2')

tl.to('.bio-line-inner', {
  y: '0%', duration: 1.2, stagger: 0.1, ease: 'power3.out'
}, '-=1')

tl.to('.scroll-indicator', {
  opacity: 1, duration: 1, ease: 'power2.out'
}, '-=0.5')

/* =========================================
   HERO SCROLL PARALLAX
   ========================================= */
gsap.to('.hero-image', {
  yPercent: 15, scale: 1.05, ease: 'none',
  scrollTrigger: {
    trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true
  }
})

gsap.to('.hero-left', {
  yPercent: -30, opacity: 0, ease: 'none',
  scrollTrigger: {
    trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true
  }
})

/* =========================================
   OMEGA VAULT HORIZONTAL SCROLL (FIXED)
   ========================================= */
const scrollContainer = document.querySelector('.ov-scroll-container');

// Reveal header
gsap.from('.ov-header > *', {
  y: 40, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out',
  scrollTrigger: {
    trigger: '.omega-vault', start: 'top 75%'
  }
})

// Calculate the exact distance to scroll horizontally
function getScrollAmount() {
  let containerWidth = scrollContainer.scrollWidth;
  return -(containerWidth - window.innerWidth + (window.innerWidth * 0.05)); // 5vw padding offset
}

const tween = gsap.to(scrollContainer, {
  x: getScrollAmount,
  ease: "none",
  scrollTrigger: {
    trigger: ".ov-pin-wrapper",
    pin: true,
    scrub: 1,
    end: () => `+=${getScrollAmount() * -1}`
  }
});

// Update calculation on resize
ScrollTrigger.addEventListener("refresh", () => {
  if (tween) {
    tween.vars.x = getScrollAmount;
    tween.invalidate();
  }
});

/* =========================================
   AI EXECUTION OS REVEALS
   ========================================= */
gsap.from('.ai-exec-header > *', {
  y: 40, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out',
  scrollTrigger: {
    trigger: '.ai-exec-header', start: 'top 80%'
  }
})

// Premium Clip-path Reveal for Grid
gsap.from('.clip-reveal', {
  y: 60,
  opacity: 0,
  scale: 0.95,
  rotationX: -5,
  duration: 1.2,
  stagger: 0.1,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.council-grid',
    start: 'top 85%'
  }
})

gsap.from('.ai-exec-footer', {
  y: 20, opacity: 0, duration: 0.8, ease: 'power3.out',
  scrollTrigger: {
    trigger: '.ai-exec-footer', start: 'top 90%'
  }
})
