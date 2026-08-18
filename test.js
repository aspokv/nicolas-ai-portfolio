import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'no-preference' }
  ]);

  page.on('console', msg => {
    if (msg.type() !== 'warning') {
      console.log('PAGE LOG:', msg.text());
    }
  });

  const getCanvasData = async (id) => page.evaluate((id) => {
    const c = document.getElementById(id);
    if (!c) return { frame: -1, progress: -1 };
    return { frame: Number(c.dataset.currentFrame), progress: Number(c.dataset.progress) };
  }, id);

  const runTest = async (triggerSelector, canvasId, isMobileEnv, scrollStart, scrollEnd) => {
    const results = {};
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const rect = el.getBoundingClientRect();
      const scrollY = window.scrollY;
      return { 
        top: rect.top + scrollY, 
        height: rect.height,
        windowHeight: window.innerHeight
      };
    }, triggerSelector);

    // Parse the start/end strings to calculate exact scroll positions
    // format: "trigger-hook window-hook" e.g., "top 80%" or "top top"
    const parseHook = (hookStr, elementTop, elementHeight, windowHeight) => {
      const parts = hookStr.split(' ');
      const triggerPart = parts[0];
      const windowPart = parts[1];
      
      let triggerY = elementTop;
      if (triggerPart === 'bottom') triggerY += elementHeight;
      else if (triggerPart === 'center') triggerY += elementHeight / 2;
      else if (triggerPart.includes('%')) triggerY += elementHeight * (parseFloat(triggerPart) / 100);

      let windowOffset = 0;
      if (windowPart === 'bottom') windowOffset = windowHeight;
      else if (windowPart === 'center') windowOffset = windowHeight / 2;
      else if (windowPart.includes('%')) windowOffset = windowHeight * (parseFloat(windowPart) / 100);

      return triggerY - windowOffset;
    };

    const startY = parseHook(scrollStart, box.top, box.height, box.windowHeight);
    const endY = parseHook(scrollEnd, box.top, box.height, box.windowHeight);

    const scrollPositions = {
      start: startY,
      quarter: startY + (endY - startY) * 0.25,
      mid: startY + (endY - startY) * 0.5,
      threeQuarter: startY + (endY - startY) * 0.75,
      end: endY,
      returnStart: startY
    };

    const scrollToY = async (y) => {
      await page.evaluate((targetY) => {
        window.scrollTo({ top: targetY, behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
      }, y);
      await new Promise(r => setTimeout(r, 1000));
    };

    await scrollToY(scrollPositions.start);
    let d = await getCanvasData(canvasId);
    results.start = d.frame;

    await scrollToY(scrollPositions.quarter);
    d = await getCanvasData(canvasId);
    results.quarter = d.frame;

    await scrollToY(scrollPositions.mid);
    d = await getCanvasData(canvasId);
    results.mid = d.frame;

    await scrollToY(scrollPositions.threeQuarter);
    d = await getCanvasData(canvasId);
    results.threeQuarter = d.frame;

    await scrollToY(scrollPositions.end);
    d = await getCanvasData(canvasId);
    results.end = d.frame;

    await scrollToY(scrollPositions.returnStart);
    d = await getCanvasData(canvasId);
    results.return = d.frame;
    
    console.log(`\nTesting ${canvasId}...`);
    console.table(results);
  };

  console.log('=== MOBILE TEST (390x844) ===');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  await runTest('.act-opening .scrub-wrapper', 'canvas-opening', true, "top top", "bottom 20%");
  await runTest('.act-omega .scrub-wrapper', 'canvas-omega', true, "top 80%", "bottom 20%");
  await runTest('.act-exec .scrub-wrapper', 'canvas-exec', true, "top 80%", "bottom 20%");

  console.log('\n=== DESKTOP TEST (1440x900) ===');
  await page.setViewport({ width: 1440, height: 900, isMobile: false, hasTouch: false });
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  await runTest('.act-opening', 'canvas-opening', false, "top top", "bottom bottom");
  await runTest('.act-omega', 'canvas-omega', false, "top top", "bottom bottom");
  await runTest('.act-exec', 'canvas-exec', false, "top top", "bottom bottom");

  await browser.close();
})();
