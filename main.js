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

   The pacing of an act is shaped by giving different parts of the sequence
   different amounts of *distance* — never different amounts of time. A stretch
   that lingers is a stretch with few frames spread over a lot of scroll, so it
   still reverses the instant the visitor scrolls back up.
   ========================================= */

document.getElementById('year').textContent = new Date().getFullYear()

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Touch devices keep the browser's own scrolling. Nothing is intercepted there.
const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window

const SOURCE_W = 1440
const SOURCE_H = 810
const SOURCE_ASPECT = SOURCE_W / SOURCE_H
const FRAME_COUNT = 120
const PREFETCH_BEHIND = 12
const PREFETCH_AHEAD = 16
const MAX_PARALLEL_LOADS = 6          // total in-flight frame requests, all acts
const MAX_BACKGROUND_LOADS = 2        // of which background prefetch may use
const MAX_CANVAS_PX = 1600            // cap on either backing-store dimension

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

let geometryReady = false

/* =========================================
   PIECEWISE PACING

   A list of [progress, value] knots read with linear interpolation. Both the
   frame and the horizontal framing of every act are expressed this way, which
   makes each of them a pure, continuous function of scroll position: the same
   scroll position always produces exactly the same picture, in either
   direction of travel.
   ========================================= */
function knotValue(knots, p) {
  if (p <= knots[0][0]) return knots[0][1]
  for (let i = 1; i < knots.length; i++) {
    const p1 = knots[i][0]
    if (p <= p1) {
      const p0 = knots[i - 1][0]
      const t = p1 === p0 ? 0 : (p - p0) / (p1 - p0)
      return knots[i - 1][1] + (knots[i][1] - knots[i - 1][1]) * t
    }
  }
  return knots[knots.length - 1][1]
}

/* --- OMEGA VAULT: how the sequence is spread across its scene ---
   0–10%   frames 0–8     character and hand, SYSTEM / 01
   10–30%  frames 9–44    the light forms, the title settles
   30–42%  frames 45–52   the Omega symbol, held for contemplation
   42–70%  frames 53–89   the vault/portal is built
   70–90%  frames 90–112  panels and interface
   90–100% frames 113–119 final state, and only here the CTA           */
const OMEGA_FRAMES = [[0, 0], [0.10, 8], [0.30, 44], [0.42, 52], [0.70, 89], [0.90, 112], [1, 119]]

/* --- AI EXECUTION OS ---
   0–10%   frames 0–8     character and hand, SYSTEM / 02
   10–30%  frames 9–44    sphere and beam, the title settles
   30–48%  frames 45–70   the glass structure appears
   48–75%  frames 71–100  the interface is built
   75–90%  frames 101–112 the complete system
   90–100% frames 113–119 final state, and only here the CTA           */
const EXEC_FRAMES = [[0, 0], [0.10, 8], [0.30, 44], [0.48, 70], [0.75, 100], [0.90, 112], [1, 119]]

/* --- Framing ---
   The two sequences are composed as mirrors of each other, and in both the
   subject of the shot travels sideways as the act builds. These knots slide the
   crop window so whatever matters at a given point is the thing on screen:

   Omega     character (right) -> symbol (centre) -> vault interface (left)
   Execution character (left)  -> sphere (centre) -> mission interface (right)

   0 is the left edge of the frame, 1 the right. Derived from the same scroll
   progress as everything else, so it cannot drift or carry on after a stop. */
const OMEGA_PAN = [[0, 0.78], [0.10, 0.77], [0.30, 0.68], [0.42, 0.66], [0.70, 0.44], [0.90, 0.24], [1, 0.16]]
const EXEC_PAN = [[0, 0.10], [0.10, 0.12], [0.30, 0.30], [0.48, 0.45], [0.75, 0.72], [0.90, 0.84], [1, 0.88]]

// The call to action belongs to the closing stretch of each act.
const CTA_FRAME = 113

/* =========================================
   GLOBAL RENDER SCHEDULER

   One rAF for every canvas on the page.

   The frame callback reads window.scrollY itself rather than trusting a value
   cached by the scroll listener. On a phone the page is scrolled by the
   compositor and the scroll event reaches the main thread late, so a callback
   that renders from the cached value can paint a position several frames old.
   Reading it here means the canvas is always drawn for where the page is at
   the moment of painting.

   After the last movement the loop keeps checking for a few frames, to catch
   compositor updates that arrive without an event, and then stops.
   ========================================= */
const IDLE_FRAMES_BEFORE_STOP = 3

let latestScrollY = window.scrollY
let renderedScrollY = NaN
let dirty = true
let idleFrames = 0
let rafId = null
const renderables = []

function schedule() {
  if (rafId === null) rafId = requestAnimationFrame(renderPass)
}

function markDirty() {
  dirty = true
  idleFrames = 0
  schedule()
}

function renderPass() {
  rafId = null
  const y = window.scrollY                 // live position, read at paint time
  const moved = y !== renderedScrollY

  if (moved || dirty) {
    latestScrollY = y
    renderedScrollY = y
    dirty = false
    idleFrames = 0
    for (let i = 0; i < renderables.length; i++) renderables[i].update(y)
    updatePreloadHorizon(y)
    schedule()                             // keep watching while things move
    return
  }

  // Nothing changed this frame. Watch a little longer in case the compositor
  // is still moving without having told us, then go quiet.
  if (++idleFrames < IDLE_FRAMES_BEFORE_STOP) schedule()
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

/* Bandwidth is shared across the acts: frames for wherever the visitor is now
   always take priority over any background warming. */
const budget = { active: 0, background: 0, urgent: 0 }
const pumps = []
const pumpAll = () => { for (let i = 0; i < pumps.length; i++) pumps[i]() }

/* =========================================
   FRAME SEQUENCE
   ========================================= */
class FrameSequence {
  constructor(canvasId, sectionSelector, basePath, ctaSelector, frameKnots, panKnots) {
    this.canvas = document.getElementById(canvasId)
    this.section = document.querySelector(sectionSelector)
    this.stage = this.section ? this.section.querySelector('.cinematic-stage') : null
    this.basePath = basePath
    this.cta = ctaSelector ? document.querySelector(ctaSelector) : null
    this.frameKnots = frameKnots
    this.panKnots = panKnots
    this.ctaOn = false
    this.frames = new Map()
    this.inflight = new Set()
    this.queueHi = []
    this.queueLo = []
    // (in-flight accounting lives in the shared budget above)
    this.lastDrawn = -1
    this.lastPan = -1
    this.start = 0
    this.end = 1
    if (!this.canvas || !this.section) {
      // Nothing to scrub: never leave the call to action stranded off-stage.
      if (this.cta) this.cta.classList.add('cta-live')
      return
    }
    this.ctx = this.canvas.getContext('2d', { alpha: false })
    this.measure()
    renderables.push(this)
    pumps.push(() => this.pump())
  }

  /* --- geometry ---
     The stage is pinned for the whole section, so progress runs from the moment
     the section reaches the top of the viewport to the moment its bottom edge
     catches up with the stage and releases it. Measuring the stage rather than
     assuming a viewport keeps the mapping honest when mobile browser chrome
     changes the visible height under our feet. */
  measure() {
    const rect = this.section.getBoundingClientRect()
    const top = rect.top + window.scrollY
    const stageH = this.stage ? this.stage.offsetHeight : window.innerHeight
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    this.start = clamp(top, 0, maxScroll)
    this.end = clamp(top + rect.height - stageH, 1, maxScroll)
    if (this.end <= this.start) this.end = this.start + 1
    this.sizeCanvas()
  }

  // The backing store follows the box, not the source: the frame is cropped to
  // fill whatever shape the stage gives it, so a square-ish phone frame is
  // drawn at the phone's own aspect instead of being letterboxed into 16:9.
  sizeCanvas() {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5)
    const scale = Math.min(dpr, MAX_CANVAS_PX / rect.width, MAX_CANVAS_PX / rect.height)
    const w = Math.max(1, Math.round(rect.width * scale))
    const h = Math.max(1, Math.round(rect.height * scale))
    if (this.canvas.width === w && this.canvas.height === h) return
    this.canvas.width = w
    this.canvas.height = h
    this.lastDrawn = -1        // backing store was wiped, force a repaint
  }

  progressAt(scrollY) {
    return clamp((scrollY - this.start) / (this.end - this.start), 0, 1)
  }

  // The single definition of "which frame belongs to this scroll position".
  frameAt(scrollY) {
    return Math.floor(knotValue(this.frameKnots, this.progressAt(scrollY)))
  }

  /* --- loading: never blocks scrolling, never draws a stale answer --- */
  url(i) {
    return `${this.basePath}/frame_${String(i + 1).padStart(4, '0')}.webp`
  }

  request(i, low) {
    if (i < 0 || i >= FRAME_COUNT) return
    if (this.frames.has(i) || this.inflight.has(i)) return
    this.inflight.add(i)
    if (low) {
      this.queueLo.push(i)
    } else {
      this.queueHi.push(i)
      budget.urgent++
    }
    this.pump()
  }

  pump() {
    while (budget.active < MAX_PARALLEL_LOADS) {
      // Frames near where the visitor actually is always overtake background
      // work. Background warming may use the whole budget while nothing urgent
      // is waiting, and is squeezed back to a couple of slots the moment it is.
      const bgCap = budget.urgent > 0 ? MAX_BACKGROUND_LOADS : MAX_PARALLEL_LOADS
      const takeHi = this.queueHi.length > 0
      const takeLo = !takeHi && this.queueLo.length > 0 && budget.background < bgCap
      if (!takeHi && !takeLo) return
      const i = takeHi ? this.queueHi.shift() : this.queueLo.shift()
      budget.active++
      if (takeHi) budget.urgent--
      if (takeLo) budget.background++
      this.fetchFrame(i).finally(() => {
        budget.active--
        if (takeLo) budget.background--
        pumpAll()
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
      // on the canvas, judged against the current scroll position rather than
      // the one that originally asked for this frame. So a frame fetched for a
      // place the visitor has already left can never take over the canvas, and
      // once the exact frame is up nothing repaints again.
      const want = this.frameAt(window.scrollY)
      const improves = this.lastDrawn < 0
        || Math.abs(i - want) < Math.abs(this.lastDrawn - want)
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

  // Every remaining frame, at background priority. Combined with the skeleton
  // this brings the act to a complete decode without ever competing with the
  // frames the visitor is looking at.
  prefetchComplete() {
    for (let i = 0; i < FRAME_COUNT; i++) this.request(i, true)
  }

  get decoded() {
    return this.frames.size
  }

  /* --- draw ---
     Crops the 16:9 source to the shape of the stage and slides that crop
     window to `panX`. Both the frame and the pan come from the same scroll
     position, so the picture is fully determined by where the page is. */
  paint(img, alpha, panX) {
    const cw = this.canvas.width
    const ch = this.canvas.height
    const boxAspect = cw / ch
    let sx, sy, sw, sh
    if (boxAspect < SOURCE_ASPECT) {
      sh = SOURCE_H                       // full height, crop the sides
      sw = SOURCE_H * boxAspect
      sx = (SOURCE_W - sw) * panX
      sy = 0
    } else {
      sw = SOURCE_W                       // full width, trim top and bottom
      sh = SOURCE_W / boxAspect
      sx = 0
      sy = (SOURCE_H - sh) * 0.5
    }
    this.ctx.globalAlpha = alpha
    this.ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch)
    this.ctx.globalAlpha = 1
  }

  update(scrollY) {
    if (!this.ctx) return
    const p = this.progressAt(scrollY)
    const exact = knotValue(this.frameKnots, p)
    const a = Math.floor(exact)
    const bIndex = Math.min(FRAME_COUNT - 1, a + 1)
    const mix = exact - a
    const panX = knotValue(this.panKnots, p)

    this.prefetchAround(a)

    const drawIndex = this.nearestIndex(a)
    if (drawIndex < 0) return               // nothing decoded yet: leave as is

    this.paint(this.frames.get(drawIndex), 1, panX)

    // Spatial cross-fade towards the next frame. This is not an animation: the
    // blend amount is a pure function of the current scroll position.
    if (mix > 0.01 && bIndex !== a && this.frames.has(a) && this.frames.has(bIndex)) {
      this.paint(this.frames.get(bIndex), mix, panX)
    }

    this.lastDrawn = drawIndex
    this.lastPan = panX
    this.canvas.dataset.frame = a           // frame the scroll position asks for
    this.canvas.dataset.drawn = drawIndex   // frame actually painted

    // The call to action lights up only once the platform's interface has been
    // built on screen, and dims again if the visitor scrolls back before it.
    if (this.cta) {
      const on = a >= CTA_FRAME
      if (on !== this.ctaOn) {
        this.ctaOn = on
        this.cta.classList.toggle('cta-live', on)
      }
    }
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
// Only the two platform acts are scrubbed. The hero is a one-shot entrance video
// and owns no canvas, no frame sequence and no scroll maths.
const omega = new FrameSequence('canvas-omega', '.act-omega', '/sequences/omega', '.omega-btn', OMEGA_FRAMES, OMEGA_PAN)
const execution = new FrameSequence('canvas-exec', '.act-exec', '/sequences/execution', '.exec-btn', EXEC_FRAMES, EXEC_PAN)
const sequences = [omega, execution].filter((s) => s.ctx)

/* =========================================
   SCROLL-LINKED PAGE CHROME

   Both of these are read-outs of the scroll position in exactly the same sense
   as the canvases: a value in, a style out, nothing running in between.
   ========================================= */
const heroSection = document.querySelector('.act-opening')
const heroDim = document.querySelector('.hero-dim')
if (heroSection && heroDim && !prefersReducedMotion) {
  let lastDim = ''
  renderables.push({
    update(scrollY) {
      // The footage sinks into black across the closing fifth of its viewport,
      // so the declaration that follows is born out of that black.
      const h = heroSection.offsetHeight || window.innerHeight
      const t = clamp((scrollY - h * 0.78) / (h * 0.22), 0, 1)
      const next = (t * 0.96).toFixed(3)
      if (next !== lastDim) {
        lastDim = next
        heroDim.style.opacity = next
      }
    },
  })
}

const progressFill = document.querySelector('.progress-fill')
if (progressFill) {
  let lastP = ''
  renderables.push({
    update(scrollY) {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const next = clamp(scrollY / max, 0, 1).toFixed(4)
      if (next !== lastP) {
        lastP = next
        progressFill.style.transform = `scaleX(${next})`
      }
    },
  })
}

/* =========================================
   EDITORIAL REVEALS

   Content reveals itself as its section comes into view. One shot per element,
   independent of the canvas, and it never gates scrolling. Movement is kept
   short and small: 16px of travel, well under two thirds of a second.
   ========================================= */
const revealTargets = document.querySelectorAll('[data-reveal]')

const revealSection = (el) => {
  const lines = el.querySelectorAll('.clip-line span')
  if (lines.length) gsap.to(lines, { y: '0%', duration: 0.6, stagger: 0.07, ease: 'power3.out' })
  const blocks = el.querySelectorAll('[data-reveal]')
  if (blocks.length) gsap.to(blocks, { opacity: 1, y: 0, duration: 0.6, stagger: 0.06, ease: 'power3.out' })
}

const SECTIONS = ['.act-opening', '.act-declaration', '.manifesto-section', '.evidence-wall', '.act-omega', '.act-exec', '.lab-section', '.about-section']
  .map((sel) => document.querySelector(sel))
  .filter(Boolean)

if (prefersReducedMotion) {
  gsap.set('.clip-line span', { y: '0%' })
  gsap.set(revealTargets, { opacity: 1, y: 0 })
} else {
  gsap.set(revealTargets, { opacity: 0, y: 16 })
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
window.addEventListener('load', () => { remeasure(); geometryReady = true }, { passive: true })
// Belt and braces if the load event has already gone by.
setTimeout(() => { remeasure(); geometryReady = true }, 1200)

/* =========================================
   BOOT

   Scrolling is available from the first paint: no sequence is ever waited on.
   The first frame of every act is fetched straight away so nothing is blank,
   and the acts ahead are warmed while the visitor is still on the one before.
   ========================================= */
document.body.classList.remove('loading')

// Both acts show their first frame straight away so neither is ever blank.
sequences.forEach((s) => s.request(0))
remeasure()

/* =========================================
   HERO VIDEO

   An entrance, played exactly once. It opens in the dark, the lighter is struck,
   the scene is revealed, and then it stops on its last frame and stays there.
   Nothing about it is tied to the scroll: scrolling away and back does not
   restart it, and it never loops.
   ========================================= */
const heroVideo = document.getElementById('hero-video')

if (heroVideo) {
  // Set on the element as well as in the markup: these three are what allow a
  // mobile browser to start the footage inline instead of refusing it or
  // opening a fullscreen player, so nothing here is left to the attribute alone.
  heroVideo.muted = true
  heroVideo.defaultMuted = true
  heroVideo.playsInline = true
  heroVideo.loop = false
  heroVideo.controls = false

  if (prefersReducedMotion) {
    // The entrance is not played and not even fetched: the CSS shows the closing
    // frame as a still instead. Dropping the sources and reloading cancels the
    // request the markup already started.
    heroVideo.autoplay = false
    heroVideo.removeAttribute('autoplay')
    heroVideo.pause()
    heroVideo.querySelectorAll('source').forEach((source) => source.remove())
    heroVideo.removeAttribute('src')
    heroVideo.load()
  } else {
    const tryPlay = () => {
      const attempt = heroVideo.play()
      if (attempt && attempt.catch) attempt.catch(() => {})
    }

    // The element is revealed only once there are frames to show, so the section
    // holds its own black until then rather than flashing anything.
    const reveal = () => heroVideo.classList.add('is-ready')
    const onReady = () => { reveal(); tryPlay(); startPlatformPreload() }
    heroVideo.addEventListener('canplay', onReady, { once: true })
    heroVideo.addEventListener('loadeddata', reveal, { once: true })
    if (heroVideo.readyState >= 3) onReady()
    else if (heroVideo.readyState >= 2) reveal()

    // The opening is played from its beginning, whatever position a reload or a
    // restored session left behind.
    const rewindOnce = () => { try { heroVideo.currentTime = 0 } catch (e) {} }
    if (heroVideo.readyState >= 1) rewindOnce()
    else heroVideo.addEventListener('loadedmetadata', rewindOnce, { once: true })

    tryPlay()

    // The last frame is the state the hero rests in. Pausing on `ended` keeps
    // the element on screen holding that frame; without it a browser is free to
    // decide what a finished video shows.
    heroVideo.addEventListener('ended', () => heroVideo.pause())

    // If autoplay is refused, resume silently on the first interaction — but
    // only while the entrance still has somewhere to go. Once it has ended, an
    // interaction must never start it again.
    const resume = () => {
      if (heroVideo.ended) { stopResume(); return }
      if (heroVideo.paused) tryPlay()
      if (!heroVideo.paused) stopResume()
    }
    function stopResume() {
      window.removeEventListener('touchstart', resume)
      window.removeEventListener('pointerdown', resume)
    }
    window.addEventListener('touchstart', resume, { passive: true })
    window.addEventListener('pointerdown', resume, { passive: true })
  }
}

/* =========================================
   PLATFORM PRELOAD

   Omega is warmed once the hero can play, Execution once the visitor is within
   reach of Omega. The two sequences are never fetched at the same time.
   ========================================= */
let omegaWarmed = false
let execWarmed = false

// Omega is brought to a complete decode as soon as the hero can play, which is
// long before its section can be reached. The stride-2 skeleton goes first at
// foreground priority so that even an immediate scroll finds a frame at most
// one away from the one it asks for; the rest fills in behind it.
function startPlatformPreload() {
  if (omegaWarmed || prefersReducedMotion || !omega.ctx) return
  omegaWarmed = true
  omega.prefetchSkeleton(2, false)   // promote anything still queued
  omega.prefetchComplete()
}

// Execution is prepared while the visitor is inside the Omega section, which is
// a whole section of scrolling before its own frames are needed.
function warmExecution() {
  if (execWarmed || prefersReducedMotion || !execution.ctx) return
  execWarmed = true
  execution.prefetchSkeleton(2, false)
  execution.prefetchComplete()
}

function updatePreloadHorizon(scrollY) {
  // Distances are only meaningful once the layout has settled; before that the
  // section offsets are still moving and would trigger both acts at once.
  if (!geometryReady) return
  const vh = window.innerHeight
  if (!omegaWarmed && omega.ctx && scrollY > omega.start - vh * 3) startPlatformPreload()
  // Entering the Omega section starts Execution.
  if (!execWarmed && omega.ctx && scrollY > omega.start - vh * 0.25) warmExecution()
}

if (!prefersReducedMotion) {
  // Omega starts immediately. The hero video only needs its opening buffer to
  // begin playing and the browser prioritises media, so starting here rather
  // than at canplay buys the seconds that decide whether the act is complete
  // by the time it can be reached.
  startPlatformPreload()
}
