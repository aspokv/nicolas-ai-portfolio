import './style.css'
import gsap from 'gsap'
import Lenis from 'lenis'

/* =========================================
   NICOLAS AI — SCENE SNAP ENGINE

   The page is a sequence of full-viewport scenes. A gesture (wheel, swipe,
   arrow / page key) does not drive pixels directly: it requests the next scene
   and hands control to a single cinematic timeline that plays the act's frame
   sequence, animates the DOM and moves the page, then settles exactly on the
   next scene. Nothing moves without a gesture.
   ========================================= */

document.getElementById('year').textContent = new Date().getFullYear()

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const SOURCE_W = 1440
const SOURCE_H = 810
const TRANSITION_DURATION = 2.0      // seconds, within the 1.8s - 2.2s target
const SCROLL_EASE = 'power3.inOut'
const FRAME_EASE = 'power2.inOut'
const GESTURE_THRESHOLD = 55         // px of touch travel, within the 45 - 70 band
const WHEEL_THRESHOLD = 18
const EDGE_TOLERANCE = 4             // px slack when deciding "scene is at its edge"
const PENDING_GESTURE_WINDOW = 400   // ms before the end within which a queued intent still counts

/* =========================================
   LENIS — programmatic scroller only

   Input handling is disabled: the engine owns wheel and touch. Lenis remains
   the mechanism that actually moves the page, driven from the timeline.
   ========================================= */
const lenis = new Lenis({
  smoothWheel: false,
  syncTouch: false,
  autoRaf: false,
})

gsap.ticker.add((time) => { lenis.raf(time * 1000) })
gsap.ticker.lagSmoothing(0)

const scrollTo = (y) => lenis.scrollTo(y, { immediate: true, force: true })

/* =========================================
   FRAME SEQUENCE

   Decodes a WebP frame sequence into memory and renders single frames on
   demand. It never clears to black: if a requested frame is not decoded yet the
   previously drawn frame stays on the canvas.
   ========================================= */
class FrameSequence {
  constructor(canvasId, basePath, frameCount) {
    this.canvas = document.getElementById(canvasId)
    this.basePath = basePath
    this.frameCount = frameCount
    this.frames = new Map()
    this.inflight = new Set()
    this.lastDrawn = -1
    this.ready = false
    this.failed = false
    this._readyWaiters = []

    if (!this.canvas) { this.failed = true; return }
    this.ctx = this.canvas.getContext('2d', { alpha: false })
    this.sizeCanvas()
  }

  // Backing store follows devicePixelRatio but is capped at the source
  // resolution: beyond it there is nothing more to resolve, only memory to burn.
  sizeCanvas() {
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const w = Math.max(1, Math.min(Math.round((rect.width || SOURCE_W) * dpr), SOURCE_W))
    const h = Math.max(1, Math.round(w * (SOURCE_H / SOURCE_W)))
    if (this.canvas.width === w && this.canvas.height === h) return
    this.canvas.width = w
    this.canvas.height = h
    // Resizing wipes the backing store — restore what was on screen.
    if (this.lastDrawn >= 0) this.paint(this.frames.get(this.lastDrawn))
  }

  url(index) {
    return `${this.basePath}/frame_${String(index + 1).padStart(4, '0')}.webp`
  }

  async load(index) {
    if (this.frames.has(index) || this.inflight.has(index)) return
    this.inflight.add(index)
    try {
      const res = await fetch(this.url(index))
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      const bitmap = window.createImageBitmap
        ? await createImageBitmap(blob)
        : await this.decodeViaImage(blob)
      this.frames.set(index, bitmap)
      if (index === 0 && this.lastDrawn < 0) this.render(0)
      this.checkReady()
    } catch (e) {
      // A single missing frame is survivable: playback simply holds the
      // previous one. Only a completely empty sequence is fatal.
      if (index === 0) this.failed = true
    } finally {
      this.inflight.delete(index)
    }
  }

  decodeViaImage(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')) }
      img.src = url
    })
  }

  // Sequential with small concurrency: keeps weaker devices from decoding
  // three sequences at once.
  async loadAll(concurrency = 4) {
    let next = 0
    const worker = async () => {
      while (next < this.frameCount) await this.load(next++)
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    this.checkReady()
  }

  checkReady() {
    if (this.ready) return
    if (this.frames.size < this.frameCount) return
    this.ready = true
    this._readyWaiters.splice(0).forEach((fn) => fn())
  }

  // Resolves once the sequence can be played smoothly, or after `timeout` so a
  // slow network degrades into a coarser playback instead of a dead gesture.
  whenReady(timeout = 2500) {
    if (this.ready || this.failed) return Promise.resolve()
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); resolve() }
      const timer = setTimeout(() => {
        this._readyWaiters = this._readyWaiters.filter((f) => f !== done)
        resolve()
      }, timeout)
      this._readyWaiters.push(done)
    })
  }

  paint(bitmap) {
    if (!bitmap || !this.ctx) return
    this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height)
  }

  // Returns true when the requested frame was actually painted.
  render(index) {
    const i = Math.max(0, Math.min(this.frameCount - 1, Math.round(index)))
    if (i === this.lastDrawn) return true
    const bitmap = this.frames.get(i)
    if (!bitmap) return false          // hold the last valid frame, never blank
    this.paint(bitmap)
    this.lastDrawn = i
    this.canvas.dataset.frame = i
    if (!this.canvas.classList.contains('ready')) this.canvas.classList.add('ready')
    return true
  }
}

/* =========================================
   SCENE REGISTRY
   ========================================= */
const sequences = {
  opening: new FrameSequence('canvas-opening', '/sequences/opening', 120),
  omega: new FrameSequence('canvas-omega', '/sequences/omega', 120),
  execution: new FrameSequence('canvas-exec', '/sequences/execution', 120),
}

// Reveals the clipped editorial lines and lifts the body copy of a scene.
const enterScene = (el, tl, at) => {
  const lines = el.querySelectorAll('.clip-line span')
  if (lines.length) {
    tl.to(lines, { y: '0%', duration: 0.9, stagger: 0.08, ease: 'power3.out' }, at)
  }
  const blocks = el.querySelectorAll('[data-reveal]')
  if (blocks.length) {
    tl.to(blocks, { opacity: 1, y: 0, duration: 0.9, stagger: 0.07, ease: 'power3.out' }, at)
  }
}

const SCENE_DEFS = [
  { sel: '.act-opening', id: 'opening', sequence: 'opening' },
  { sel: '.manifesto-section', id: 'manifesto', sequence: null },
  { sel: '.evidence-wall', id: 'evidence', sequence: null },
  { sel: '.act-omega', id: 'omega', sequence: 'omega' },
  { sel: '.act-exec', id: 'execution', sequence: 'execution' },
  { sel: '.lab-section', id: 'lab', sequence: null },
  { sel: '.about-section', id: 'about', sequence: null },
]

const scenes = SCENE_DEFS.map((def) => {
  const element = document.querySelector(def.sel)
  if (element) {
    element.dataset.scene = def.id
    element.querySelectorAll('[data-reveal]').forEach((n) => gsap.set(n, { opacity: 0, y: 26 }))
  }
  return {
    element,
    id: def.id,
    sequence: def.sequence ? sequences[def.sequence] : null,
    forwardTransition: (tl, at) => element && enterScene(element, tl, at),
    backwardTransition: (tl, at) => element && enterScene(element, tl, at),
  }
}).filter((s) => s.element)

/* =========================================
   SCENE SNAP ENGINE
   ========================================= */
const STATE = {
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  TRANSITIONING_FORWARD: 'TRANSITIONING_FORWARD',
  TRANSITIONING_BACKWARD: 'TRANSITIONING_BACKWARD',
  SETTLING: 'SETTLING',
  LOCKED_ERROR: 'LOCKED_ERROR',
}

class SceneSnapEngine {
  constructor(sceneList) {
    this.scenes = sceneList
    this.state = STATE.IDLE
    this.currentSceneIndex = 0
    this.targetSceneIndex = 0
    this.isTransitioning = false
    this.direction = 0
    this.activeTimeline = null
    this.currentSequence = null
    this.loadedSequences = new Set()
    this.pendingGesture = null
    this.revealed = new Set()
  }

  sceneTop(i) {
    const el = this.scenes[i].element
    return Math.round(el.getBoundingClientRect().top + window.scrollY)
  }

  // How far the page can travel inside a scene taller than the viewport.
  sceneOverflow(i) {
    const el = this.scenes[i].element
    const isLast = i === this.scenes.length - 1
    // The tail scene owns everything below it (the footer) as its own overflow.
    const extent = isLast
      ? document.documentElement.scrollHeight - this.sceneTop(i)
      : el.getBoundingClientRect().height
    return Math.max(0, Math.round(extent - window.innerHeight))
  }

  atEdge(dir) {
    const top = this.sceneTop(this.currentSceneIndex)
    const overflow = this.sceneOverflow(this.currentSceneIndex)
    if (overflow <= 0) return true
    const offset = window.scrollY - top
    return dir > 0 ? offset >= overflow - EDGE_TOLERANCE : offset <= EDGE_TOLERANCE
  }

  // Which sequence plays: the act you are leaving when going forward, the act
  // you are entering when going back. Each sequence therefore plays exactly
  // once per direction and always rests on frame 0.
  sequenceFor(from, to, dir) {
    return dir > 0 ? this.scenes[from].sequence : this.scenes[to].sequence
  }

  request(dir) {
    if (this.state === STATE.LOCKED_ERROR) return
    if (this.isTransitioning) {
      // A burst fired at the start of a transition is spam and is discarded.
      // Only an intent expressed near the end is kept, so a deliberate second
      // gesture chains smoothly while ten stray wheel events cannot skip ahead.
      this.pendingGesture = { dir, at: performance.now() }
      return
    }
    // Long scenes scroll internally first and only snap at their edges.
    if (!this.atEdge(dir)) { this.stepWithinScene(dir); return }

    const target = this.currentSceneIndex + dir
    if (target < 0 || target >= this.scenes.length) return
    this.transition(target, dir)
  }

  stepWithinScene(dir) {
    const top = this.sceneTop(this.currentSceneIndex)
    const overflow = this.sceneOverflow(this.currentSceneIndex)
    const next = gsap.utils.clamp(top, top + overflow, window.scrollY + dir * window.innerHeight * 0.7)
    this.isTransitioning = true
    this.state = STATE.SETTLING
    const proxy = { y: window.scrollY }
    this.activeTimeline = gsap.timeline({
      onComplete: () => {
        this.activeTimeline = null
        this.isTransitioning = false
        this.state = STATE.IDLE
        this.drain()
      },
    }).to(proxy, {
      y: next, duration: 0.7, ease: SCROLL_EASE, onUpdate: () => scrollTo(proxy.y),
    })
  }

  async transition(target, dir) {
    const from = this.currentSceneIndex
    this.isTransitioning = true
    this.direction = dir
    this.targetSceneIndex = target
    this.state = STATE.PREPARING

    const seq = this.sequenceFor(from, target, dir)
    this.currentSequence = seq

    if (seq && !seq.failed) {
      // Never start a timeline on an undecoded sequence.
      await seq.whenReady()
    }

    this.state = dir > 0 ? STATE.TRANSITIONING_FORWARD : STATE.TRANSITIONING_BACKWARD

    const destY = this.snapTargetFor(target, dir)
    const scrollProxy = { y: window.scrollY }
    const playhead = seq ? { frame: dir > 0 ? 0 : seq.frameCount - 1 } : null

    const tl = gsap.timeline({
      onComplete: () => this.settle(target, destY),
    })
    this.activeTimeline = tl

    tl.to(scrollProxy, {
      y: destY,
      duration: TRANSITION_DURATION,
      ease: SCROLL_EASE,
      onUpdate: () => scrollTo(scrollProxy.y),
    }, 0)

    if (seq && playhead) {
      seq.render(playhead.frame)
      tl.to(playhead, {
        frame: dir > 0 ? seq.frameCount - 1 : 0,
        duration: TRANSITION_DURATION,
        ease: FRAME_EASE,
        onUpdate: () => seq.render(playhead.frame),
      }, 0)
    }

    // Editorial motion for the scene being entered, once.
    const entering = this.scenes[target]
    if (!this.revealed.has(target)) {
      this.revealed.add(target)
      const fn = dir > 0 ? entering.forwardTransition : entering.backwardTransition
      fn(tl, TRANSITION_DURATION * 0.35)
    }
  }

  // Where the page must come to rest. Entering a scene backwards lands on its
  // bottom edge when the scene is taller than the viewport, so the reverse move
  // mirrors the forward one.
  snapTargetFor(index, dir) {
    const top = this.sceneTop(index)
    const overflow = this.sceneOverflow(index)
    return dir < 0 ? top + overflow : top
  }

  settle(target, destY) {
    this.state = STATE.SETTLING
    scrollTo(destY)                    // exact snap, no sub-pixel drift
    this.currentSceneIndex = target
    this.currentSequence = null
    this.activeTimeline = null
    this.direction = 0
    this.isTransitioning = false
    this.state = STATE.IDLE
    this.syncProgress()
    this.drain()
  }

  drain() {
    const queued = this.pendingGesture
    this.pendingGesture = null
    if (!queued) return
    if (performance.now() - queued.at > PENDING_GESTURE_WINDOW) return   // stale: discard
    this.request(queued.dir)
  }

  syncProgress() {
    const denom = Math.max(1, this.scenes.length - 1)
    gsap.set('.progress-fill', { width: `${(this.currentSceneIndex / denom) * 100}%` })
  }

  // Deep links and refreshes land on a real scene instead of a random offset.
  jumpTo(index) {
    const i = gsap.utils.clamp(0, this.scenes.length - 1, index)
    this.currentSceneIndex = i
    this.targetSceneIndex = i
    if (!this.revealed.has(i)) {
      this.revealed.add(i)
      const tl = gsap.timeline()
      this.scenes[i].forwardTransition(tl, 0)
    }
    scrollTo(this.sceneTop(i))
    this.syncProgress()
  }

  refresh() {
    Object.values(sequences).forEach((s) => s.sizeCanvas())
    if (!this.isTransitioning) scrollTo(this.sceneTop(this.currentSceneIndex))
  }
}

const engine = new SceneSnapEngine(scenes)

/* =========================================
   GESTURE INPUT

   Navigation is owned by the engine, but nothing that makes the page usable is
   blocked: clicks, links, buttons, form fields and anything inside a
   [data-native-scroll] region keep their native behaviour.
   ========================================= */
const INTERACTIVE = 'a,button,input,textarea,select,label,[contenteditable],[data-native-scroll]'
const isExempt = (target) => target instanceof Element && target.closest(INTERACTIVE)
const isNativeScroll = (target) => target instanceof Element && target.closest('[data-native-scroll]')

let gateOpen = false
const gate = (fn) => (e) => { if (gateOpen) fn(e) }

/* --- wheel --- */
let wheelCooldown = 0
window.addEventListener('wheel', gate((e) => {
  if (isNativeScroll(e.target)) return
  e.preventDefault()
  if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return
  const now = performance.now()
  // Inertial trackpads emit long tails; one gesture must stay one scene.
  if (now - wheelCooldown < 120) return
  wheelCooldown = now
  engine.request(e.deltaY > 0 ? 1 : -1)
}), { passive: false })

/* --- keyboard --- */
const KEY_FORWARD = new Set(['ArrowDown', 'PageDown', 'KeyS', 'Space'])
const KEY_BACKWARD = new Set(['ArrowUp', 'PageUp', 'KeyW'])
window.addEventListener('keydown', gate((e) => {
  if (isExempt(e.target)) return
  if (e.repeat) return                            // held keys must not queue up
  if (KEY_FORWARD.has(e.code)) { e.preventDefault(); engine.request(1) }
  else if (KEY_BACKWARD.has(e.code)) { e.preventDefault(); engine.request(-1) }
}))

/* --- touch --- */
let touchStartY = null
let touchFired = false
window.addEventListener('touchstart', gate((e) => {
  if (isNativeScroll(e.target)) { touchStartY = null; return }
  touchStartY = e.touches[0].clientY
  touchFired = false
}), { passive: true })

window.addEventListener('touchmove', gate((e) => {
  if (touchStartY === null) return
  if (e.cancelable) e.preventDefault()
  if (touchFired) return
  const delta = touchStartY - e.touches[0].clientY
  if (Math.abs(delta) < GESTURE_THRESHOLD) return
  touchFired = true                                // exactly one scene per swipe
  engine.request(delta > 0 ? 1 : -1)
}), { passive: false })

const endTouch = () => { touchStartY = null; touchFired = false }
window.addEventListener('touchend', endTouch, { passive: true })
window.addEventListener('touchcancel', endTouch, { passive: true })

/* --- viewport changes --- */
let resizeTimer = null
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => engine.refresh(), 180)
})
window.addEventListener('orientationchange', () => {
  setTimeout(() => engine.refresh(), 300)
})

/* --- in-page anchors --- */
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href').slice(1)
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    const idx = scenes.findIndex((s) => s.element === el || s.element.contains(el))
    if (idx < 0) return
    e.preventDefault()
    engine.jumpTo(idx)
  })
})

/* =========================================
   BOOT

   The opening sequence is decoded before any gesture is accepted, so the very
   first transition is already smooth. The remaining acts stream in behind it,
   one at a time, in the order the visitor will reach them.
   ========================================= */
const sceneFromHash = () => {
  const id = location.hash.slice(1)
  if (!id) return 0
  const el = document.getElementById(id)
  if (!el) return 0
  const idx = scenes.findIndex((s) => s.element === el || s.element.contains(el))
  return idx < 0 ? 0 : idx
}

const revealEverything = () => {
  scenes.forEach((s, i) => {
    engine.revealed.add(i)
    const tl = gsap.timeline()
    s.forwardTransition(tl, 0)
    tl.progress(1)
  })
}

async function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

  if (prefersReducedMotion) {
    // No extended sequence: every scene is shown in its final state and the
    // page scrolls normally, with all content present and reachable.
    document.body.classList.remove('loading')
    document.body.classList.add('reduced-motion')
    revealEverything()
    await Promise.all([
      sequences.opening.load(0),
      sequences.omega.load(0),
      sequences.execution.load(0),
    ])
    sequences.opening.render(0)
    sequences.omega.render(0)
    sequences.execution.render(0)
    const idx = sceneFromHash()
    if (idx > 0) engine.jumpTo(idx)
    return
  }

  await sequences.opening.loadAll()
  sequences.opening.render(0)
  engine.loadedSequences.add('opening')

  document.body.classList.remove('loading')

  const intro = gsap.timeline()
  engine.revealed.add(0)
  scenes[0].forwardTransition(intro, 0)

  const startIndex = sceneFromHash()
  if (startIndex > 0) engine.jumpTo(startIndex)
  else scrollTo(0)

  gateOpen = true
  engine.syncProgress()

  // Background streaming, sequentially, in visit order.
  await sequences.omega.loadAll(3)
  engine.loadedSequences.add('omega')
  await sequences.execution.loadAll(3)
  engine.loadedSequences.add('execution')
}

boot().catch((err) => {
  // The page must remain readable and scrollable whatever happens to the canvases.
  console.error('Scene engine failed to start:', err)
  engine.state = STATE.LOCKED_ERROR
  document.body.classList.remove('loading')
  document.body.classList.add('reduced-motion')
  revealEverything()
})
