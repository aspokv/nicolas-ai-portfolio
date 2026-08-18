import './style.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

// Update copyright year
document.getElementById('year').textContent = new Date().getFullYear()

// Reduced Motion Check
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* =========================================
   LENIS SMOOTH SCROLL
   ========================================= */
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smooth: !prefersReducedMotion,
})

lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((time) => { lenis.raf(time * 1000) })
gsap.ticker.lagSmoothing(0)

// Progress Bar
lenis.on('scroll', (e) => {
  const progress = e.progress * 100;
  gsap.set('.progress-fill', { width: `${progress}%` });
})

/* =========================================
   VIDEO SCRUB ENGINE
   ========================================= */
function setupVideoScrub(videoId, sectionSelector) {
  const video = document.getElementById(videoId);
  const section = document.querySelector(sectionSelector);
  
  if (!video || !section) return;

  function initScrub() {
    video.classList.add('ready');
    
    if (prefersReducedMotion) return; // Fallback handles layout, just skip GSAP tween

    // Calculate safe duration to avoid edge cases
    let safeDuration = video.duration - 0.05;
    if (safeDuration < 0) safeDuration = 0;
    
    gsap.to(video, {
      currentTime: safeDuration,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.5,
      }
    });
    
    ScrollTrigger.refresh();
  }

  // Force preload attribute just in case HTML hasn't parsed it early enough
  video.setAttribute('preload', 'auto');

  // Check if metadata is already available
  if (video.readyState >= 1) { // HAVE_METADATA
    initScrub();
  } else {
    // Wait for metadata
    video.addEventListener('loadedmetadata', initScrub, { once: true });
    video.load();
  }
}

// Initialize Video Scrubs
setupVideoScrub('vid-opening', '.act-opening');
setupVideoScrub('vid-omega', '.act-omega');
setupVideoScrub('vid-exec', '.act-exec');

/* =========================================
   TYPOGRAPHY REVEALS & FALLBACKS
   ========================================= */
function initTextReveals() {
  // Always remove loading state to show content
  document.body.classList.remove('loading');

  if (prefersReducedMotion) {
    // FALLBACK: Reset all GSAP hidden states to fully visible instantly
    gsap.set('.clip-line span', { y: '0%' });
    gsap.set('.evidence-item', { y: 0, opacity: 1 });
    gsap.set('.about-headline span', { y: '0%' });
    gsap.set('.act-omega .system-content > *', { y: 0, opacity: 1 });
    gsap.set('.act-exec .system-content > *', { y: 0, opacity: 1 });
    return; // Exit here, no animations
  }

  // Hero Reveal
  const tlHero = gsap.timeline();
  tlHero.to('.hero-headline span', {
    y: '0%',
    duration: 1.2,
    stagger: 0.1,
    ease: 'power4.out',
    delay: 0.2
  });

  // Manifesto Reveal
  gsap.to('.manifesto-text span', {
    y: '0%',
    duration: 1,
    stagger: 0.1,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: '.manifesto-section',
      start: 'top 75%'
    }
  });

  // Evidence Wall Reveal
  gsap.from('.evidence-item', {
    y: 40,
    opacity: 0,
    duration: 0.8,
    stagger: 0.1,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: '.evidence-grid',
      start: 'top 80%'
    }
  });
  
  // About Reveal
  gsap.to('.about-headline span', {
    y: '0%',
    duration: 1,
    stagger: 0.1,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: '.about-section',
      start: 'top 75%'
    }
  });

  const isMobile = window.innerWidth <= 768;
  
  // Omega Vault Content Parallax/Fade
  gsap.from('.act-omega .system-content > *', {
    y: isMobile ? 20 : 50,
    opacity: 0,
    duration: 1,
    stagger: 0.1,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: isMobile ? '.act-omega .system-content' : '.act-omega',
      start: isMobile ? 'top 80%' : 'top 50%',
      end: isMobile ? 'bottom 80%' : 'bottom 50%',
      scrub: isMobile ? false : 1
    }
  });

  // AI Exec Content Parallax/Fade
  gsap.from('.act-exec .system-content > *', {
    y: isMobile ? 20 : 50,
    opacity: 0,
    duration: 1,
    stagger: 0.1,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: isMobile ? '.act-exec .system-content' : '.act-exec',
      start: isMobile ? 'top 80%' : 'top 50%',
      end: isMobile ? 'bottom 80%' : 'bottom 50%',
      scrub: isMobile ? false : 1
    }
  });
}

/* =========================================
   INITIALIZATION & REFRESH LOGIC
   ========================================= */
// 1. Wait for fonts before calculating heights
document.fonts.ready.then(() => {
  initTextReveals();
  ScrollTrigger.refresh();
});

// 2. Refresh on resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    ScrollTrigger.refresh();
  }, 250);
});
