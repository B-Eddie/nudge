const CHARACTERS = {
  crab: "Crab",
  panda: "Panda",
  red_panda: "Red panda",
  cat: "Cat",
  capybara: "Capybara",
};

const MODES = {
  idle: { pose: "idle", status: "Feeling at home", message: "Hi. Your desk looks like a nice place to stay." },
  focus: { pose: "focus", status: "Keeping you company", message: "You focus. I’ll keep you company." },
  music: { pose: "music", status: "Enjoying the soundtrack", message: "A good soundtrack makes everything better." },
  break: { pose: "sleep", status: "Taking a little breather", message: "Time to rest those eyes. I’ll join you." },
};

const PREFERENCE_KEY = "nudge.website.preview";
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? { matches: false };
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function readPreference() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PREFERENCE_KEY) ?? "null");
    return saved && Object.hasOwn(CHARACTERS, saved.character) && Object.hasOwn(MODES, saved.mode) ? saved : null;
  } catch {
    return null;
  }
}

function savePreference(character, mode) {
  try {
    sessionStorage.setItem(PREFERENCE_KEY, JSON.stringify({ character, mode }));
  } catch {
    // The preview also works when browser storage is unavailable.
  }
}

export function initPlayground(stage = document.getElementById("pet-playground")) {
  const pet = document.getElementById("demo-pet");
  const image = document.getElementById("demo-pet-image");
  if (!stage || !pet || !image) return () => {};

  const bubble = document.getElementById("demo-bubble");
  const caption = document.getElementById("demo-caption");
  const status = document.getElementById("demo-status");
  const item = document.getElementById("demo-item");
  const effects = document.getElementById("demo-effects");
  const characterButtons = [...document.querySelectorAll("button[data-character]")];
  const modeButtons = [...document.querySelectorAll("button[data-mode]")];
  const actionButtons = [...document.querySelectorAll("button[data-action]")];
  const controller = new AbortController();
  const listen = (target, type, handler, options = {}) => target?.addEventListener(type, handler, { ...options, signal: controller.signal });
  const defaultCaption = caption?.textContent || "Drag your pet. Use the arrow keys when it’s selected.";
  const saved = readPreference();
  const initialCharacter = characterButtons.find((button) => button.getAttribute("aria-pressed") === "true")?.dataset.character;
  const initialMode = modeButtons.find((button) => button.getAttribute("aria-pressed") === "true")?.dataset.mode;
  let character = saved?.character ?? (Object.hasOwn(CHARACTERS, initialCharacter) ? initialCharacter : "crab");
  let mode = saved?.mode ?? (Object.hasOwn(MODES, initialMode) ? initialMode : "idle");
  let position = { x: 0, y: 0 };
  let direction = 1;
  let pointer = null;
  let poseGeneration = 0;
  let activityGeneration = 0;
  let currentPose = MODES[mode].pose;
  let motion = null;
  let idleTimer = 0;
  let idleCount = 0;
  let stageVisible = true;
  let suppressClickUntil = 0;
  let lastPointerResponse = 0;
  let disposed = false;
  const timers = new Set();
  const animations = new Set();
  const decodedImages = new Map();

  function loadPose(nextCharacter, pose) {
    const source = `assets/pets/${nextCharacter}/${pose}.webp`;
    if (!decodedImages.has(source)) {
      const frame = new Image();
      const loaded = new Promise((resolve) => {
        frame.onload = () => resolve(frame);
        frame.onerror = () => resolve(null);
      });
      frame.src = source;
      decodedImages.set(source, typeof frame.decode === "function" ? frame.decode().then(() => frame, () => loaded) : loaded);
    }
    return decodedImages.get(source);
  }

  async function setPose(pose) {
    const generation = ++poseGeneration;
    const nextCharacter = character;
    currentPose = pose;
    const frame = await loadPose(nextCharacter, pose);
    if (disposed || generation !== poseGeneration || nextCharacter !== character || !frame) return;
    image.src = frame.src;
    image.dataset.pose = pose;
  }

  function bounds() {
    const padding = 12;
    const width = pet.offsetWidth || 144;
    const height = pet.offsetHeight || 144;
    const stageWidth = stage.clientWidth || stage.getBoundingClientRect().width;
    const stageHeight = stage.clientHeight || stage.getBoundingClientRect().height;
    const baseX = pet.offsetLeft;
    const baseY = pet.offsetTop;
    const minX = padding + width / 2 - baseX;
    const maxX = stageWidth - padding - width / 2 - baseX;
    const minY = padding - baseY;
    const maxY = stageHeight - padding - height - baseY;
    return { minX, maxX: Math.max(minX, maxX), minY, maxY: Math.max(minY, maxY) };
  }

  function setPosition(next) {
    const limit = bounds();
    position = { x: clamp(next.x, limit.minX, limit.maxX), y: clamp(next.y, limit.minY, limit.maxY) };
    pet.style.setProperty("--pet-x", `${position.x}px`);
    pet.style.setProperty("--pet-y", `${position.y}px`);
    return position;
  }

  function face(nextDirection) {
    direction = nextDirection < 0 ? -1 : 1;
    image.style.transform = `scaleX(${direction})`;
  }

  function cancelMotion() {
    if (!motion) return;
    const petRect = pet.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const current = {
      x: petRect.left + petRect.width / 2 - stageRect.left - stage.clientLeft - pet.offsetLeft,
      y: petRect.top - stageRect.top - stage.clientTop - pet.offsetTop,
    };
    motion.cancel();
    motion = null;
    setPosition(current);
  }

  async function moveTo(next, duration = 420) {
    cancelMotion();
    const from = { ...position };
    const to = setPosition(next);
    if (reducedMotion.matches || typeof pet.animate !== "function" || duration === 0) return true;
    const animation = pet.animate([
      { transform: `translate(${from.x}px, ${from.y}px) translateX(-50%)` },
      { transform: `translate(${to.x}px, ${to.y}px) translateX(-50%)` },
    ], { duration, easing: "cubic-bezier(.22,1,.36,1)" });
    motion = animation;
    try {
      await animation.finished;
      return true;
    } catch {
      return false;
    } finally {
      if (motion === animation) motion = null;
    }
  }

  function later(callback, delay) {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
    return timer;
  }

  function clearActivity() {
    activityGeneration += 1;
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    cancelMotion();
    animations.forEach((animation) => animation.cancel());
    animations.clear();
    if (item) item.hidden = true;
    effects?.replaceChildren();
    pet.removeAttribute("data-playing");
  }

  function announce(message, state = MODES[mode].status) {
    if (bubble) bubble.textContent = message;
    if (status) status.textContent = state;
  }

  function updateControls() {
    characterButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.character === character)));
    modeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
    stage.dataset.character = character;
    stage.dataset.mode = mode;
    pet.setAttribute("aria-label", `${CHARACTERS[character]}, your pixel companion. Activate to pet; use the arrow keys to move.`);
    pet.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Home");
    image.alt = "";
    if (status) status.textContent = MODES[mode].status;
  }

  function reward() {
    if (!effects || reducedMotion.matches) return;
    const rect = pet.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    for (let index = 0; index < 3; index += 1) {
      const spark = document.createElement("span");
      spark.className = "demo-spark";
      spark.textContent = "♥";
      spark.setAttribute("aria-hidden", "true");
      Object.assign(spark.style, {
        position: "absolute", pointerEvents: "none", color: "#ff8f92", fontSize: "18px",
        left: `${rect.left - stageRect.left + rect.width * (0.3 + index * 0.2)}px`,
        top: `${rect.top - stageRect.top + rect.height * 0.16}px`,
      });
      effects.appendChild(spark);
      if (typeof spark.animate === "function") {
        const animation = spark.animate([
          { opacity: 0, transform: "translateY(4px) scale(.65)" },
          { opacity: 1, transform: "translateY(-12px) scale(1)", offset: 0.3 },
          { opacity: 0, transform: `translate(${(index - 1) * 10}px,-42px) scale(.8)` },
        ], { duration: 820, delay: index * 90, easing: "ease-out", fill: "both" });
        animations.add(animation);
        animation.finished.then(() => { animations.delete(animation); spark.remove(); }, () => {});
      } else later(() => spark.remove(), 850);
    }
  }

  function petCompanion() {
    endPointer(true);
    clearActivity();
    stopIdle();
    setPose("happy");
    announce("A little kindness. A very happy pet.", `${CHARACTERS[character]} feels loved`);
    reward();
    later(() => setPose("delighted"), 250);
    later(() => { setPose(MODES[mode].pose); scheduleIdle(); }, 1500);
  }

  async function play() {
    endPointer(true);
    clearActivity();
    stopIdle();
    const generation = activityGeneration;
    const origin = { ...position };
    const limit = bounds();
    const availableRight = limit.maxX - position.x;
    const availableLeft = position.x - limit.minX;
    const playDirection = availableRight >= availableLeft ? 1 : -1;
    const targetX = clamp(position.x + playDirection * 82, limit.minX, limit.maxX);
    pet.dataset.playing = "true";
    announce("A tiny play break? Excellent idea.", `${CHARACTERS[character]} is playing`);
    face(playDirection);
    if (item) {
      item.hidden = false;
      item.style.left = `${pet.offsetLeft + targetX + playDirection * 45}px`;
    }
    const animateTravel = !reducedMotion.matches && typeof pet.animate === "function";
    if (animateTravel) {
      setPose("walkA");
      later(() => setPose("walkB"), 160);
      later(() => setPose("walkA"), 320);
    }
    await moveTo({ x: targetX, y: 0 }, 550);
    if (generation !== activityGeneration || disposed) return;
    setPose("play");
    later(() => { setPose("delighted"); reward(); }, 700);
    later(async () => {
      if (item) item.hidden = true;
      face(-playDirection);
      if (animateTravel) setPose("walkA");
      await moveTo({ x: origin.x, y: 0 }, 500);
      if (generation !== activityGeneration || disposed) return;
      face(1);
      pet.removeAttribute("data-playing");
      setPose(MODES[mode].pose);
      scheduleIdle();
    }, 1800);
  }

  function reset() {
    endPointer(true);
    clearActivity();
    stopIdle();
    mode = "idle";
    updateControls();
    savePreference(character, mode);
    face(1);
    moveTo({ x: 0, y: 0 }, 380);
    setPose(MODES[mode].pose);
    announce("Back in my little spot.", MODES[mode].status);
    if (caption) caption.textContent = defaultCaption;
    scheduleIdle();
  }

  function stopIdle() {
    window.clearTimeout(idleTimer);
    idleTimer = 0;
  }

  function scheduleIdle() {
    stopIdle();
    if (disposed || reducedMotion.matches || document.hidden || !stageVisible || pointer || mode === "break") return;
    idleTimer = window.setTimeout(() => {
      if (pointer || timers.size || motion) { scheduleIdle(); return; }
      idleCount += 1;
      const pose = idleCount % 4 === 0 ? "curious" : "blink";
      setPose(pose);
      idleTimer = window.setTimeout(() => {
        setPose(MODES[mode].pose);
        scheduleIdle();
      }, pose === "blink" ? 150 : 900);
    }, 5000 + (idleCount % 3) * 1100);
  }

  function endPointer(cancelled = false) {
    if (!pointer) return;
    const finished = pointer;
    pointer = null;
    pet.removeAttribute("data-dragging");
    if (bubble) bubble.style.opacity = "";
    try { if (pet.hasPointerCapture?.(finished.id)) pet.releasePointerCapture(finished.id); } catch {}
    if (finished.dragged) {
      suppressClickUntil = performance.now() + 300;
      clearActivity();
      moveTo({ x: position.x, y: 0 }, cancelled ? 180 : 320);
      setPose(cancelled ? MODES[mode].pose : "happy");
      if (!cancelled) announce("Right where you want me.", `${CHARACTERS[character]} has a new spot`);
      later(() => { setPose(MODES[mode].pose); scheduleIdle(); }, cancelled ? 200 : 700);
    } else {
      setPose(MODES[mode].pose);
      scheduleIdle();
    }
    if (caption) caption.textContent = defaultCaption;
  }

  listen(pet, "pointerdown", (event) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    clearActivity();
    stopIdle();
    pet.focus({ preventScroll: true });
    pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, origin: { ...position }, dragged: false };
    try { pet.setPointerCapture(event.pointerId); } catch {}
  });

  listen(pet, "pointermove", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (!pointer.dragged && Math.hypot(dx, dy) < 5) return;
    event.preventDefault();
    if (!pointer.dragged) {
      pointer.dragged = true;
      pet.dataset.dragging = "true";
      if (bubble) bubble.style.opacity = "0";
      setPose("lifted");
      if (caption) caption.textContent = "Let go to settle your pet into its new spot.";
    }
    setPosition({ x: pointer.origin.x + dx, y: pointer.origin.y + dy });
    if (Math.abs(dx) > 10) face(dx);
  });

  listen(pet, "pointerup", (event) => { if (event.pointerId === pointer?.id) endPointer(); });
  listen(pet, "pointercancel", (event) => { if (event.pointerId === pointer?.id) endPointer(true); });
  listen(pet, "lostpointercapture", (event) => { if (event.pointerId === pointer?.id) endPointer(true); });
  listen(pet, "dragstart", (event) => event.preventDefault());
  listen(pet, "click", (event) => {
    if (event.detail !== 0 && performance.now() < suppressClickUntil) return;
    petCompanion();
  });

  listen(pet, "keydown", (event) => {
    if (event.key === "Home") { event.preventDefault(); reset(); return; }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!Object.hasOwn(directions, event.key)) return;
    event.preventDefault();
    endPointer(true);
    clearActivity();
    stopIdle();
    const [dx, dy] = directions[event.key];
    const step = event.shiftKey ? 40 : 20;
    if (dx) face(dx);
    setPosition({ x: position.x + dx * step, y: position.y + dy * step });
    setPose(dy ? "lifted" : "walkA");
    const destination = event.key.slice(5).toLowerCase();
    announce(`A little to the ${destination}.`, `${CHARACTERS[character]} moved ${destination}`);
    later(() => { setPose(MODES[mode].pose); scheduleIdle(); }, 450);
  });

  listen(stage, "pointermove", (event) => {
    if (pointer || timers.size || mode === "break" || event.pointerType === "touch" || reducedMotion.matches) return;
    const now = performance.now();
    if (now - lastPointerResponse < 400) return;
    lastPointerResponse = now;
    const rect = pet.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    if (Math.abs(dx) > 25 && Math.hypot(dx, dy) < 190) face(dx);
  });

  characterButtons.forEach((button) => listen(button, "click", () => {
    const next = button.dataset.character;
    if (!Object.hasOwn(CHARACTERS, next)) return;
    endPointer(true);
    clearActivity();
    stopIdle();
    character = next;
    updateControls();
    setPose(MODES[mode].pose);
    announce(`${CHARACTERS[character]} is here to keep you company.`);
    savePreference(character, mode);
    loadPose(character, "blink");
    loadPose(character, "happy");
    if (!stageVisible) {
      pet.focus({ preventScroll: true });
      stage.scrollIntoView?.({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "center" });
    }
    scheduleIdle();
  }));

  modeButtons.forEach((button) => listen(button, "click", () => {
    const next = button.dataset.mode;
    if (!Object.hasOwn(MODES, next)) return;
    endPointer(true);
    clearActivity();
    stopIdle();
    mode = next;
    updateControls();
    setPose(MODES[mode].pose);
    announce(MODES[mode].message);
    savePreference(character, mode);
    scheduleIdle();
  }));

  actionButtons.forEach((button) => listen(button, "click", () => {
    const action = { pet: petCompanion, play, reset }[button.dataset.action];
    action?.();
  }));

  function pause() {
    stopIdle();
    endPointer(true);
    clearActivity();
    setPose(MODES[mode].pose);
  }

  listen(document, "visibilitychange", () => document.hidden ? pause() : scheduleIdle());
  listen(window, "pagehide", pause);
  listen(window, "pageshow", scheduleIdle);
  const onMotionChange = () => { pause(); scheduleIdle(); };
  reducedMotion.addEventListener?.("change", onMotionChange);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    cancelMotion();
    setPosition(position);
  }) : null;
  resizeObserver?.observe(stage);
  resizeObserver?.observe(pet);
  if (!resizeObserver) listen(window, "resize", () => setPosition(position));
  const visibilityObserver = typeof IntersectionObserver === "function" ? new IntersectionObserver(([entry]) => {
    stageVisible = entry.isIntersecting;
    if (stageVisible) scheduleIdle(); else pause();
  }, { threshold: 0.12 }) : null;
  visibilityObserver?.observe(stage);

  pet.style.touchAction = "none";
  image.draggable = false;
  status?.setAttribute("aria-live", "off");
  if (item) { item.hidden = true; item.setAttribute("aria-hidden", "true"); }
  updateControls();
  setPosition(position);
  setPose(currentPose);
  loadPose(character, "blink");
  loadPose(character, "happy");
  scheduleIdle();

  return () => {
    disposed = true;
    poseGeneration += 1;
    stopIdle();
    endPointer(true);
    clearActivity();
    controller.abort();
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    reducedMotion.removeEventListener?.("change", onMotionChange);
  };
}

function initNavigation() {
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (!toggle || !links) return;
  function setOpen(open) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    links.dataset.open = String(open);
    document.documentElement.classList.toggle("nav-is-open", open);
  }
  setOpen(false);
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  links.addEventListener("click", (event) => { if (event.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus({ preventScroll: true });
    }
  });
  document.addEventListener("click", (event) => {
    if (!links.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  const wideLayout = window.matchMedia?.("(min-width: 768px)");
  wideLayout?.addEventListener("change", (event) => { if (event.matches) setOpen(false); });

  const anchors = [...links.querySelectorAll('a[href^="#"]')].filter((anchor) => anchor.hash.length > 1);
  if (typeof IntersectionObserver !== "function" || !anchors.length) return;
  const visible = new Map();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0));
    const active = [...visible].filter(([, ratio]) => ratio > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
    anchors.forEach((anchor) => {
      if (anchor.hash === `#${active}`) anchor.setAttribute("aria-current", "location");
      else anchor.removeAttribute("aria-current");
    });
  }, { rootMargin: "-16% 0px -55% 0px", threshold: [0, 0.1, 0.25, 0.5, 1] });
  anchors.forEach((anchor) => {
    const section = document.getElementById(decodeURIComponent(anchor.hash.slice(1)));
    if (section) observer.observe(section);
  });
}

function initRhythm() {
  const form = document.getElementById("rhythm-form");
  const focus = document.getElementById("focus-length");
  const rest = document.getElementById("break-length");
  const summary = document.getElementById("rhythm-summary");
  if (!form || !focus || !rest) return;
  focus.disabled = false;
  rest.disabled = false;
  const focusValue = document.getElementById("focus-length-value");
  const breakValue = document.getElementById("break-length-value");
  focusValue?.setAttribute("aria-live", "off");
  breakValue?.setAttribute("aria-live", "off");
  function update() {
    const focusMinutes = Number(focus.value);
    const breakMinutes = Number(rest.value);
    if (focusValue) focusValue.textContent = `${focusMinutes} min`;
    if (breakValue) breakValue.textContent = `${breakMinutes} min`;
    focus.setAttribute("aria-valuetext", `${focusMinutes} minutes of focus`);
    rest.setAttribute("aria-valuetext", `${breakMinutes} minutes of rest`);
    if (summary) summary.textContent = `${focusMinutes} minutes of focus, then ${breakMinutes} minutes to recharge. A preview of your rhythm; set it in nudge when you’re ready.`;
    form.style.setProperty("--focus-share", `${focusMinutes / (focusMinutes + breakMinutes) * 100}%`);
    form.dataset.focusMinutes = String(focusMinutes);
    form.dataset.breakMinutes = String(breakMinutes);
  }
  focus.addEventListener("input", update);
  rest.addEventListener("input", update);
  form.addEventListener("submit", (event) => event.preventDefault());
  update();
}

function initReveals() {
  if (reducedMotion.matches || typeof IntersectionObserver !== "function") return;
  const animations = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      entry.target.dataset.revealed = "true";
      const animation = entry.target.animate?.([
        { opacity: 0, transform: "translateY(22px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 620, easing: "cubic-bezier(.22,1,.36,1)" });
      if (animation) {
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
      }
    });
  }, { rootMargin: "0px 0px -35px 0px", threshold: 0.08 });
  document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
  function cancel() {
    animations.forEach((animation) => animation.cancel());
    animations.clear();
  }
  reducedMotion.addEventListener?.("change", (event) => {
    if (event.matches) { observer.disconnect(); cancel(); }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancel(); });
  window.addEventListener("pagehide", cancel);
}

function initParallax() {
  const groups = new Map();
  document.querySelectorAll("[data-parallax]").forEach((element) => {
    const area = element.closest("[data-parallax-area]") || element.closest("#pet-playground") || element.parentElement;
    if (!area) return;
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(element);
  });
  groups.forEach((elements, area) => {
    let frame = 0;
    let coordinates = null;
    function reset() {
      cancelAnimationFrame(frame);
      frame = 0;
      coordinates = null;
      elements.forEach((element) => { element.style.translate = "0px 0px"; });
    }
    area.addEventListener("pointermove", (event) => {
      if (reducedMotion.matches || event.pointerType === "touch" || event.buttons) return;
      coordinates = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!coordinates) return;
        const rect = area.getBoundingClientRect();
        const x = clamp((coordinates.x - rect.left) / rect.width - 0.5, -0.5, 0.5);
        const y = clamp((coordinates.y - rect.top) / rect.height - 0.5, -0.5, 0.5);
        elements.forEach((element) => {
          const strength = clamp(Number(element.dataset.parallax) || 7, -20, 20);
          element.style.translate = `${x * strength}px ${y * strength}px`;
        });
      });
    }, { passive: true });
    area.addEventListener("pointerleave", reset);
    window.addEventListener("pagehide", reset);
    document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); });
    reducedMotion.addEventListener?.("change", reset);
  });
}

function initSite() {
  document.documentElement.classList.add("enhanced");
  initPlayground();
  initNavigation();
  initRhythm();
  initReveals();
  initParallax();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initSite, { once: true });
else initSite();
