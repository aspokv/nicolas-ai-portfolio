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
  if (prefersReducedMotion) return; // Skip scrub on reduced motion

  const video = document.getElementById(videoId);
  const section = document.querySelector(sectionSelector);
  
  if (!video || !section) return;

  // Wait for metadata to know the duration
  video.addEventListener('loadedmetadata', () => {
    // Fade video in once ready
    video.classList.add('ready');
    
    // Safety margin to prevent video from looping or breaking at the exact end
    const safeDuration = video.duration - 0.1;
    
    gsap.to(video, {
      currentTime: safeDuration,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.5, // Smooth scrubbing
      }
    });
  }, { once: true });

  // In case metadata is already loaded (browser cache)
  if (video.readyState >= 1) {
    video.dispatchEvent(new Event('loadedmetadata'));
  } else {
    video.load(); // Force load metadata if needed
  }
}

// Initialize Video Scrubs
setupVideoScrub('vid-opening', '.act-opening');
setupVideoScrub('vid-omega', '.act-omega');
setupVideoScrub('vid-exec', '.act-exec');

/* =========================================
   TYPOGRAPHY REVEALS
   ========================================= */
function initTextReveals() {
  if (prefersReducedMotion) {
    document.body.classList.remove('loading');
    return;
  }

  // Hero Reveal
  const tlHero = gsap.timeline({
    onComplete: () => { document.body.classList.remove('loading'); }
  });

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
}

initTextReveals();

/* =========================================
   SYSTEM CONTENT FADES (MOBILE & DESKTOP)
   ========================================= */
if (!prefersReducedMotion) {
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
