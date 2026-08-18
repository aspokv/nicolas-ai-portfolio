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
   UNIFIED SCROLL-DRIVEN VIDEO SCRUB
   ========================================= */
const isMobile = window.innerWidth <= 768;

function setupUnifiedScrub(videoId, wrapperSelector) {
  if (prefersReducedMotion) {
    return;
  }

  const video = document.getElementById(videoId);
  const wrapper = document.querySelector(wrapperSelector);
  
  if (!video || !wrapper) {
    return;
  }

  // JS enforced attributes
  video.muted = true;
  video.playsInline = true;
  video.disableRemotePlayback = true;

  // Unlock video on mobile to allow programmatic seeking
  if (isMobile) {
    const unlockVideo = () => {
      const current = video.currentTime;
      video.play().then(() => {
        video.pause();
        video.currentTime = current;
      }).catch(() => {});
      window.removeEventListener('touchstart', unlockVideo);
      window.removeEventListener('pointerdown', unlockVideo);
    };
    window.addEventListener('touchstart', unlockVideo, { once: true });
    window.addEventListener('pointerdown', unlockVideo, { once: true });
  }

  let rafId = null;
  const initScrub = () => {
    video.classList.add('ready');
    const duration = video.duration;

    ScrollTrigger.create({
      trigger: wrapper,
      start: isMobile ? "top 80%" : "top top",
      end: isMobile ? "bottom 20%" : "bottom bottom",
      onUpdate: (self) => {
        const progress = self.progress;
        const targetTime = gsap.utils.clamp(
          0,
          duration - 0.05,
          progress * (duration - 0.05)
        );

        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          if (Number.isFinite(targetTime)) {
            video.currentTime = targetTime;
          }
          rafId = null;
        });
      }
    });
    ScrollTrigger.refresh();
  };
  
  if (video.readyState >= 1 && Number.isFinite(video.duration)) {
    initScrub();
  } else {
    video.addEventListener('loadedmetadata', initScrub, { once: true });
    video.addEventListener('loadeddata', () => {
      if (!video.classList.contains('ready')) initScrub();
    }, { once: true });
    video.load();
  }
}

// Initialize scrubs with their respective wrappers (on mobile, we added scrub-wrapper)
setupUnifiedScrub('vid-opening', isMobile ? '.act-opening .scrub-wrapper' : '.act-opening');
setupUnifiedScrub('vid-omega', isMobile ? '.act-omega .scrub-wrapper' : '.act-omega');
setupUnifiedScrub('vid-exec', isMobile ? '.act-exec .scrub-wrapper' : '.act-exec');

/* =========================================
   GSAP MATCHMEDIA (DESKTOP VS MOBILE REVEALS)
   ========================================= */
let mm = gsap.matchMedia();

mm.add("(min-width: 769px)", () => {
  if (prefersReducedMotion) return;

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
  if (prefersReducedMotion) return;
  
  // --- MOBILE REVEALS (SCFO Flow) ---
  const tlHero = gsap.timeline({ onComplete: () => { document.body.classList.remove('loading'); }});
  tlHero.to('.hero-headline span', { y: '0%', duration: 0.8, stagger: 0.05, ease: 'power3.out', delay: 0.1 });
  
  // Manifesto: Each phrase independent
  gsap.utils.toArray('.manifesto-text .clip-line').forEach((line) => {
    gsap.to(line.querySelector('span'), {
      y: '0%', duration: 0.8, ease: 'power3.out',
      scrollTrigger: { trigger: line, start: 'top 85%' }
    });
  });
  
  // Evidence Wall: Subtle opacity and transform
  gsap.from('.evidence-item', {
    y: 30, opacity: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out',
    scrollTrigger: { trigger: '.evidence-grid', start: 'top 85%' }
  });
  
  gsap.to('.about-headline span', {
    y: '0%', duration: 0.8, stagger: 0.05, ease: 'power3.out',
    scrollTrigger: { trigger: '.about-section', start: 'top 85%' }
  });

  // Systems: Sequential rhythm
  const systems = ['.act-omega', '.act-exec'];
  systems.forEach(sys => {
    gsap.from(`${sys} .system-content > *`, {
      y: 30, opacity: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out',
      scrollTrigger: { trigger: `${sys} .system-content`, start: 'top 85%' }
    });
  });
});
