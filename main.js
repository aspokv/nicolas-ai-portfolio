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
   GSAP MATCHMEDIA (DESKTOP VS MOBILE)
   ========================================= */
let mm = gsap.matchMedia();

mm.add("(min-width: 769px)", () => {
  if (prefersReducedMotion) {
    document.body.classList.remove('loading');
    return;
  }

  // --- DESKTOP VIDEO SCRUB (Pinned via CSS Sticky) ---
  function setupDesktopScrub(videoId, sectionSelector) {
    const video = document.getElementById(videoId);
    const section = document.querySelector(sectionSelector);
    if (!video || !section) return;
    
    video.addEventListener('loadedmetadata', () => {
      video.classList.add('ready');
      gsap.to(video, {
        currentTime: video.duration - 0.1,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.5,
        }
      });
      ScrollTrigger.refresh();
    }, { once: true });
    
    if (video.readyState >= 1) video.dispatchEvent(new Event('loadedmetadata'));
    else video.load();
  }

  setupDesktopScrub('vid-opening', '.act-opening');
  setupDesktopScrub('vid-omega', '.act-omega');
  setupDesktopScrub('vid-exec', '.act-exec');

  // --- DESKTOP REVEALS ---
  const tlHero = gsap.timeline({ onComplete: () => { document.body.classList.remove('loading'); }});
  tlHero.to('.hero-headline span', { y: '0%', duration: 1.2, stagger: 0.1, ease: 'power4.out', delay: 0.2 });
  
  gsap.to('.manifesto-text span', {
    y: '0%', duration: 1, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: '.manifesto-section', start: 'top 75%' }
  });
  
  gsap.from('.evidence-item', {
    y: 40, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power2.out',
    scrollTrigger: { trigger: '.evidence-grid', start: 'top 80%' }
  });
  
  gsap.to('.about-headline span', {
    y: '0%', duration: 1, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: '.about-section', start: 'top 75%' }
  });

  gsap.from('.act-omega .system-content > *', {
    y: 50, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: '.act-omega', start: 'top 50%', end: 'bottom 50%', scrub: 1 }
  });

  gsap.from('.act-exec .system-content > *', {
    y: 50, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: '.act-exec', start: 'top 50%', end: 'bottom 50%', scrub: 1 }
  });
});

mm.add("(max-width: 768px)", () => {
  if (prefersReducedMotion) {
    document.body.classList.remove('loading');
    return;
  }
  
  // --- MOBILE VIDEO SCRUB (No Pinning, Trigger on Video Container) ---
  function setupMobileScrub(videoId, containerSelector) {
    const video = document.getElementById(videoId);
    const container = document.querySelector(containerSelector);
    if (!video || !container) return;
    
    video.addEventListener('loadedmetadata', () => {
      video.classList.add('ready');
      gsap.to(video, {
        currentTime: video.duration - 0.1,
        ease: "none",
        scrollTrigger: {
          trigger: container,
          start: "top 80%",
          end: "bottom 20%",
          scrub: 0.5,
        }
      });
      ScrollTrigger.refresh();
    }, { once: true });
    
    if (video.readyState >= 1) video.dispatchEvent(new Event('loadedmetadata'));
    else video.load();
  }

  setupMobileScrub('vid-opening', '.act-opening .video-container');
  setupMobileScrub('vid-omega', '.act-omega .video-container');
  setupMobileScrub('vid-exec', '.act-exec .video-container');

  // --- MOBILE REVEALS (Faster, Normal Flow) ---
  const tlHero = gsap.timeline({ onComplete: () => { document.body.classList.remove('loading'); }});
  tlHero.to('.hero-headline span', { y: '0%', duration: 0.8, stagger: 0.05, ease: 'power3.out', delay: 0.1 });
  
  gsap.to('.manifesto-text span', {
    y: '0%', duration: 0.8, stagger: 0.05, ease: 'power3.out',
    scrollTrigger: { trigger: '.manifesto-section', start: 'top 85%' }
  });
  
  gsap.from('.evidence-item', {
    y: 20, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out',
    scrollTrigger: { trigger: '.evidence-grid', start: 'top 85%' }
  });
  
  gsap.to('.about-headline span', {
    y: '0%', duration: 0.8, stagger: 0.05, ease: 'power3.out',
    scrollTrigger: { trigger: '.about-section', start: 'top 85%' }
  });

  gsap.from('.act-omega .system-content > *', {
    y: 20, opacity: 0, duration: 0.8, stagger: 0.05, ease: 'power3.out',
    scrollTrigger: { trigger: '.act-omega .system-content', start: 'top 85%' }
  });

  gsap.from('.act-exec .system-content > *', {
    y: 20, opacity: 0, duration: 0.8, stagger: 0.05, ease: 'power3.out',
    scrollTrigger: { trigger: '.act-exec .system-content', start: 'top 85%' }
  });
});
