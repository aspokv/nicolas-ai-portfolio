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
  smoothTouch: false,
  touchMultiplier: 2,
  infinite: false,
})

lenis.on('scroll', ScrollTrigger.update)

gsap.ticker.add((time) => {
  lenis.raf(time * 1000)
})

gsap.ticker.lagSmoothing(0)

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

// 1. Preloader
tl.to('.preloader .char', {
  y: '0%',
  opacity: 1,
  duration: 1,
  stagger: 0.05,
  ease: 'power4.out'
})
.to('.preloader .char', {
  y: '-100%',
  opacity: 0,
  duration: 0.8,
  stagger: 0.02,
  ease: 'power3.in',
  delay: 0.5
})
.to('.preloader', {
  yPercent: -100,
  duration: 1,
  ease: 'expo.inOut'
}, '-=0.5')

// 2. Hero Reveal
tl.fromTo('.hero-title-inner', 
  { y: '100%' },
  { y: '0%', duration: 1.2, ease: 'expo.out' },
  '-=0.5'
)

tl.to('.hero-image-wrapper', {
  opacity: 1,
  scale: 1,
  duration: 1,
  ease: 'power3.out'
}, '-=1')

tl.to('.image-reveal-mask', {
  yPercent: -100,
  duration: 1.2,
  ease: 'expo.inOut'
}, '-=1')

tl.to('.bio-line-inner', {
  y: '0%',
  opacity: 1,
  duration: 1,
  stagger: 0.1,
  ease: 'power3.out'
}, '-=0.8')

tl.to('.scroll-indicator', {
  opacity: 1,
  y: -10,
  duration: 1,
  ease: 'power2.out'
}, '-=0.5')

gsap.to('.scroll-indicator', {
  y: 0,
  duration: 1.5,
  repeat: -1,
  yoyo: true,
  ease: 'sine.inOut',
  delay: 3
})

/* =========================================
   HERO SCROLL PARALLAX
   ========================================= */
gsap.to('.hero-image', {
  yPercent: 20,
  ease: 'none',
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: 'bottom top',
    scrub: true
  }
})

gsap.to('.hero-content', {
  y: -100,
  opacity: 0,
  ease: 'none',
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: 'bottom top',
    scrub: true
  }
})

/* =========================================
   OMEGA VAULT HORIZONTAL SCROLL
   ========================================= */
const scrollContainer = document.querySelector('.ov-scroll-container');
const cards = gsap.utils.toArray('.ov-card');

// Reveal header
gsap.from('.ov-header .section-title, .ov-header .section-subtitle', {
  y: 50,
  opacity: 0,
  duration: 1,
  stagger: 0.2,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.omega-vault',
    start: 'top 75%'
  }
})

// Horizontal Scroll logic
let scrollTween = gsap.to(cards, {
  xPercent: -100 * (cards.length - 1),
  ease: "none",
  scrollTrigger: {
    trigger: ".ov-pin-wrapper",
    pin: true,
    scrub: 1,
    end: () => "+=" + scrollContainer.offsetWidth
  }
});

/* =========================================
   AI EXECUTION OS REVEALS
   ========================================= */

// Reveal Header
gsap.from('.ai-exec-header > *', {
  y: 40,
  opacity: 0,
  duration: 1,
  stagger: 0.1,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.ai-exec-header',
    start: 'top 80%'
  }
})

// Stagger Council Panels
gsap.from('.expert-panel', {
  y: 30,
  opacity: 0,
  duration: 0.8,
  stagger: 0.1,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.council-grid',
    start: 'top 85%'
  }
})

// Footer Button Reveal
gsap.from('.ai-exec-footer', {
  y: 20,
  opacity: 0,
  duration: 0.8,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.ai-exec-footer',
    start: 'top 90%'
  }
})
