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
   DETERMINISTIC CANVAS FRAME SEQUENCE
   ========================================= */
const isMobile = window.innerWidth <= 768;

class CanvasFrameSequence {
  constructor(canvasId, fallbackId, config, wrapperSelector) {
    this.canvas = document.getElementById(canvasId);
    this.fallback = document.getElementById(fallbackId);
    this.wrapper = document.querySelector(wrapperSelector);
    this.config = config;
    this.ctx = this.canvas ? this.canvas.getContext('2d', { alpha: false, willReadFrequently: false }) : null;
    this.frameCount = config.frameCount;
    this.basePath = config.basePath;
    this.pattern = config.pattern;
    
    // Internal resolution is fixed to the frame size for CSS object-fit to handle responsiveness
    if (this.canvas) {
      this.canvas.width = 1440;
      this.canvas.height = 810;
    }

    this.bitmaps = new Map();
    this.loading = new Set();
    this.currentIndex = -1;
    this.targetIndex = 0;
    this.rafId = null;
    this.hasFailed = false;
    this.maxCache = 30; // Number of frames to keep in memory

    if (!this.canvas || !this.wrapper || !this.ctx) return;
    
    if (prefersReducedMotion) {
      this.handleFallback();
      return;
    }

    // Initialize display state
    if (this.fallback) this.fallback.style.display = 'none';
    this.canvas.style.display = 'block';

    // Load first frame immediately
    this.loadFrame(0)
      .then(() => this.drawFrame(0))
      .catch((e) => {
        console.error(`Failed to load first frame for ${canvasId}:`, e);
        this.handleFallback();
      });

    // ScrollTrigger to drive progress
    ScrollTrigger.create({
      trigger: this.wrapper,
      start: config.scrollStart || (isMobile ? "top 80%" : "top top"),
      end: config.scrollEnd || (isMobile ? "bottom 20%" : "bottom bottom"),
      scrub: true,
      invalidateOnRefresh: true,
      onUpdate: (self) => this.setProgress(self.progress)
    });
  }

  handleFallback() {
    this.hasFailed = true;
    if (this.canvas) this.canvas.style.display = 'none';
    if (this.fallback) {
      this.fallback.style.display = 'block';
      this.fallback.play().catch(()=>{});
    }
  }

  getFrameUrl(index) {
    const padded = String(index + 1).padStart(4, '0');
    return `${this.basePath}/${this.pattern.replace('%04d', padded)}`;
  }

  async loadFrame(index) {
    if (this.bitmaps.has(index)) return this.bitmaps.get(index);
    if (this.loading.has(index)) return null;
    
    // Backpressure: allow max 6 concurrent requests, skip if too far
    if (this.loading.size >= 6 && Math.abs(index - this.targetIndex) > 4) return null;

    this.loading.add(index);

    try {
      const response = await fetch(this.getFrameUrl(index));
      if (!response.ok) throw new Error("HTTP " + response.status);
      const blob = await response.blob();
      
      let img;
      if (window.createImageBitmap) {
        img = await createImageBitmap(blob);
      } else {
        img = new Image();
        img.src = URL.createObjectURL(blob);
        await new Promise((r, j) => { img.onload = r; img.onerror = j; });
      }
      
      this.bitmaps.set(index, img);
      this.loading.delete(index);
      
      // Cleanup cache if it exceeds maxCache
      if (this.bitmaps.size > this.maxCache) {
        let keys = Array.from(this.bitmaps.keys());
        // Sort descending by distance from target index (furthest first)
        keys.sort((a, b) => Math.abs(b - this.targetIndex) - Math.abs(a - this.targetIndex));
        for (let key of keys) {
          if (this.bitmaps.size <= this.maxCache) break;
          // Never delete target, current, or immediately requested frames
          if (key === index || key === this.currentIndex || key === this.targetIndex) continue;
          let old = this.bitmaps.get(key);
          if (old && old.close) old.close();
          this.bitmaps.delete(key);
        }
      }
      
      // If this frame is the current target and hasn't been drawn, draw it!
      if (index === this.targetIndex) {
        if (!this.rafId) {
          this.rafId = requestAnimationFrame(() => this.updateLoop());
        }
      }
      
      return img;
    } catch (e) {
      this.loading.delete(index);
      return null;
    }
  }

  setProgress(progress) {
    if (this.hasFailed) return;
    const clamped = gsap.utils.clamp(0, 1, progress);
    this.targetIndex = Math.round(clamped * (this.frameCount - 1));
    this.preloadNeighbors(this.targetIndex);
    
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => this.updateLoop());
  }

  updateLoop() {
    this.rafId = null;
    if (this.currentIndex === this.targetIndex) return;

    if (this.bitmaps.has(this.targetIndex)) {
      this.drawFrame(this.targetIndex);
    }
  }

  preloadNeighbors(index) {
    this.loadFrame(index); // prioritize target
    for (let i = 1; i <= 6; i++) {
      if (index + i < this.frameCount) this.loadFrame(index + i);
      if (index - i >= 0) this.loadFrame(index - i);
    }
  }

  drawFrame(index) {
    if (this.hasFailed) return;
    const img = this.bitmaps.get(index);
    if (!img) return;

    this.currentIndex = index;
    
    // Draw
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    
    // Show canvas gracefully
    if (!this.canvas.classList.contains('ready')) {
      this.canvas.classList.add('ready');
    }

    // Dataset exposed for testing automation
    this.canvas.dataset.currentFrame = index;
    this.canvas.dataset.frameCount = this.frameCount;
    this.canvas.dataset.progress = index / (this.frameCount - 1);
  }
}

const sequences = {
  opening: { basePath: '/sequences/opening', frameCount: 120, pattern: 'frame_%04d.webp', scrollStart: 'top top' },
  omega: { basePath: '/sequences/omega', frameCount: 120, pattern: 'frame_%04d.webp' },
  execution: { basePath: '/sequences/execution', frameCount: 120, pattern: 'frame_%04d.webp' }
};

new CanvasFrameSequence('canvas-opening', 'vid-opening', sequences.opening, isMobile ? '.act-opening .scrub-wrapper' : '.act-opening');
new CanvasFrameSequence('canvas-omega', 'vid-omega', sequences.omega, isMobile ? '.act-omega .scrub-wrapper' : '.act-omega');
new CanvasFrameSequence('canvas-exec', 'vid-exec', sequences.execution, isMobile ? '.act-exec .scrub-wrapper' : '.act-exec');

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
