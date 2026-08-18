import './style.css'
import gsap from 'gsap'
import Lenis from 'lenis'

/* =========================================
   NICOLAS AI — SCROLL-LINKED CANVAS

   The canvas is a direct read-out of where the page currently is:

       scroll position -> local progress of the section -> frame

   There is no timeline between those steps, no playback clock, no gesture
   capture and no input lock. Scroll moves, the canvas redraws on the next
   animation frame. Scroll stops, the canvas stops.
   ========================================= */

document.getElementById('year').textContent = new Date().getFullYear()

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Touch devices keep the browser's own scrolling. Nothing is intercepted there.
const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window

const SOURCE_W = 1440
const SOURCE_H = 810
const FRAME_COUNT = 120
const PREFETCH_BEHIND = 12
const PREFETCH_AHEAD = 16
const MAX_PARALLEL_LOADS = 6

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/* =========================================
   GLOBAL RENDER SCHEDULER

   One rAF for every canvas on the page. Scroll listeners only record the
   position and raise a flag; the frame callback does the drawing and then goes
   quiet until something actually changes.
   ========================================= */
let latestScrollY = window.scrollY
let dirty = true
let rafId = null
const renderables = []

function schedule() {
  if (rafId === null) rafId = requestAnimationFrame(renderPass)
}

function markDirty() {
  dirty = true
  schedule()
}

function renderPass() {
  rafId = null
  if (!dirty) return          // nothing changed: the loop simply stops
  dirty = false
  for (let i = 0; i < renderables.length; i++) renderables[i].update(latestScrollY)
}

// Passive: the page scrolls natively, this only observes it.
window.addEventListener('scroll', () => {
  latestScrollY = window.scrollY
  markDirty()
}, { passive: true })

/* =========================================
   LENIS — desktop only, and only as a scroller

   It never becomes a second source of progress: every frame is still derived
   from window.scrollY, so the canvas tracks whatever is actually on screen.
   ========================================= */
let lenis = null
if (!isCoarsePointer && !prefersReducedMotion) {
  lenis = new Lenis({ duration: 0.9, smoothWheel: true, syncTouch: false })
  lenis.on('scroll', () => {
    latestScrollY = window.scrollY
    markDirty()
  })
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
}

/* =========================================
   FRAME SEQUENCE
   ========================================= */
class FrameSequence {
  constructor(canvasId, sectionSelector, basePath) {
    this.canvas = document.getElementById(canvasId)
    this.section = document.querySelector(sectionSelector)
    this.basePath = basePath
    this.frames = new Map()
    this.inflight = new Set()
    this.queueHi = []
    this.queueLo = []
    this.active = 0
    this.lastDrawn = -1
    this.wantIndex = 0
    this.start = 0
    this.end = 1
    if (!this.canvas || !this.section) return
    this.ctx = this.canvas.getContext('2d', { alpha: false })
    this.measure()
    renderables.push(this)
  }

  /* --- geometry: the section's own bounds, no invented scroll corridor --- */
  measure() {
    const rect = this.section.getBoundingClientRect()
    const top = rect.top + window.scrollY
    const vh = window.innerHeight
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh)
    // The sequence plays across the section's transit through the viewport:
    // progress 0 as it starts entering, 1 as it finishes leaving.
    this.start = clamp(top - vh, 0, maxScroll)
    this.end = clamp(top + rect.height, 1, maxScroll)
    if (this.end <= this.start) this.end = this.start + 1
    this.sizeCanvas()
  }

  // Backing store follows devicePixelRatio, capped at the source resolution so
  // phones never allocate more pixels than the frames actually contain.
  sizeCanvas() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5)
    const w = clamp(Math.round((rect.width || SOURCE_W) * dpr), 1, SOURCE_W)
    const h = Math.max(1, Math.round(w * (SOURCE_H / SOURCE_W)))
    if (this.canvas.width === w && this.canvas.height === h) return
    this.canvas.width = w
    this.canvas.height = h
    this.lastDrawn = -1        // backing store was wiped, force a repaint
  }

  progressAt(scrollY) {
    return clamp((scrollY - this.start) / (this.end - this.start), 0, 1)
  }

  /* --- loading: never blocks scrolling, never draws a stale answer --- */
  url(i) {
    return `${this.basePath}/frame_${String(i + 1).padStart(4, '0')}.webp`
  }

  request(i, low) {
    if (i < 0 || i >= FRAME_COUNT) return
    if (this.frames.has(i) || this.inflight.has(i)) return
    this.inflight.add(i)
    if (low) this.queueLo.push(i)
    else this.queueHi.push(i)
    this.pump()
  }

  pump() {
    while (this.active < MAX_PARALLEL_LOADS && (this.queueHi.length || this.queueLo.length)) {
      // Frames near where the visitor actually is always overtake the skeleton.
      const i = this.queueHi.length ? this.queueHi.shift() : this.queueLo.shift()
      this.active++
      this.fetchFrame(i).finally(() => {
        this.active--
        this.pump()
      })
    }
  }

  async fetchFrame(i) {
    try {
      const res = await fetch(this.url(i))
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      const bmp = window.createImageBitmap ? await createImageBitmap(blob) : await decodeBlob(blob)
      this.frames.set(i, bmp)
      // A late arrival never replays itself. It only asks for a repaint when it
      // is a better match for where the page is RIGHT NOW than what is already
      // on the canvas, and the repaint re-reads the current scroll position. So
      // a frame fetched for a position the visitor already left cannot appear,
      // and once the exact frame is up, nothing repaints again.
      const improves = this.lastDrawn < 0
        || Math.abs(i - this.wantIndex) < Math.abs(this.lastDrawn - this.wantIndex)
      if (improves) markDirty()
    } catch (e) {
      /* a missing frame degrades to its nearest loaded neighbour */
    } finally {
      this.inflight.delete(i)
    }
  }

  // Closest decoded frame to `i`, reported with its real index so the canvas
  // always states which frame it is genuinely showing.
  nearestIndex(i) {
    if (this.frames.has(i)) return i
    for (let d = 1; d < FRAME_COUNT; d++) {
      if (this.frames.has(i - d)) return i - d
      if (this.frames.has(i + d)) return i + d
    }
    return -1
  }

  prefetchAround(target) {
    this.request(target)
    for (let d = 1; d <= Math.max(PREFETCH_BEHIND, PREFETCH_AHEAD); d++) {
      if (d <= PREFETCH_AHEAD) this.request(target + d)
      if (d <= PREFETCH_BEHIND) this.request(target - d)
    }
  }

  // A coarse skeleton across the whole sequence, fetched at low priority. It
  // bounds how far the nearest available frame can be from the requested one
  // while the dense window is still filling in.
  prefetchSkeleton(stride, low) {
    for (let i = 0; i < FRAME_COUNT; i += stride) this.request(i, low)
    this.request(FRAME_COUNT - 1, low)
  }

  /* --- draw: derived from the scroll position handed in, nothing else --- */
  update(scrollY) {
    if (!this.ctx) return
    const p = this.progressAt(scrollY)
    const exact = p * (FRAME_COUNT - 1)
    const a = Math.floor(exact)
    const bIndex = Math.min(FRAME_COUNT - 1, a + 1)
    const mix = exact - a

    this.wantIndex = a
    this.prefetchAround(a)

    const drawIndex = this.nearestIndex(a)
    if (drawIndex < 0) return               // nothing decoded yet: leave as is

    const w = this.canvas.width
    const h = this.canvas.height
    this.ctx.globalAlpha = 1
    this.ctx.drawImage(this.frames.get(drawIndex), 0, 0, w, h)

    // Spatial cross-fade towards the next frame. This is not an animation: the
    // blend amount is a pure function of the current scroll position.
    if (mix > 0.01 && bIndex !== a && this.frames.has(a) && this.frames.has(bIndex)) {
      this.ctx.globalAlpha = mix
      this.ctx.drawImage(this.frames.get(bIndex), 0, 0, w, h)
      this.ctx.globalAlpha = 1
    }

    this.lastDrawn = drawIndex
    this.canvas.dataset.frame = a           // frame the scroll position asks for
    this.canvas.dataset.drawn = drawIndex   // frame actually painted
    if (!this.canvas.classList.contains('ready')) this.canvas.classList.add('ready')
  }
}

function decodeBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')) }
    img.src = url
  })
}

/* =========================================
   SEQUENCES
   ========================================= */
const sequences = [
  new FrameSequence('canvas-opening', '.act-opening', '/sequences/opening'),
  new FrameSequence('canvas-omega', '.act-omega', '/sequences/omega'),
  new FrameSequence('canvas-exec', '.act-exec', '/sequences/execution'),
].filter((s) => s.ctx)

/* =========================================
   EDITORIAL REVEALS

   Content reveals itself as its section comes into view. One shot per element,
   independent of the canvas, and it never gates scrolling.
   ========================================= */
const revealTargets = document.querySelectorAll('[data-reveal]')

const revealSection = (el) => {
  const lines = el.querySelectorAll('.clip-line span')
  if (lines.length) gsap.to(lines, { y: '0%', duration: 0.9, stagger: 0.08, ease: 'power3.out' })
  const blocks = el.querySelectorAll('[data-reveal]')
  if (blocks.length) gsap.to(blocks, { opacity: 1, y: 0, duration: 0.9, stagger: 0.07, ease: 'power3.out' })
}

const SECTIONS = ['.act-opening', '.manifesto-section', '.evidence-wall', '.act-omega', '.act-exec', '.lab-section', '.about-section']
  .map((sel) => document.querySelector(sel))
  .filter(Boolean)

SECTIONS.forEach((el, i) => { el.dataset.scene = String(i) })

if (prefersReducedMotion) {
  gsap.set('.clip-line span', { y: '0%' })
  gsap.set(revealTargets, { opacity: 1, y: 0 })
} else {
  gsap.set(revealTargets, { opacity: 0, y: 24 })
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      io.unobserve(entry.target)
      revealSection(entry.target)
    })
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 })
  SECTIONS.forEach((el) => io.observe(el))
}

/* =========================================
   VIEWPORT CHANGES
   ========================================= */
let resizeTimer = null
const remeasure = () => {
  sequences.forEach((s) => s.measure())
  latestScrollY = window.scrollY
  markDirty()
}
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(remeasure, 150)
}, { passive: true })
window.addEventListener('orientationchange', () => setTimeout(remeasure, 250), { passive: true })
window.addEventListener('load', remeasure, { passive: true })

/* =========================================
   BOOT

   Scrolling is available from the first paint: no sequence is ever waited on.
   The first frame of every act is fetched straight away so nothing is blank,
   and the acts ahead are warmed while the visitor is still on the one before.
   ========================================= */
document.body.classList.remove('loading')

sequences.forEach((s) => s.request(0))
if (sequences[0]) {
  // Skeleton first: with every other frame decoded, the nearest available frame
  // is never more than one away from the one the scroll asks for, so the canvas
  // tracks the finger from the first seconds instead of waiting on the network.
  sequences[0].prefetchSkeleton(2, false)
  sequences[0].prefetchAround(0)
}
remeasure()

if (!prefersReducedMotion) {
  const warm = () => sequences.slice(1).forEach((s, i) => setTimeout(() => {
    s.prefetchSkeleton(4, true)
    s.prefetchAround(0)
  }, i * 500))
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 })
  else setTimeout(warm, 1200)
}
