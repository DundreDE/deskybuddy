// Random idle-animation trigger + player. Picks an entry from BuddyIdlePool at randomized
// intervals and plays its hard-keyframed frames, as long as `canPlay()` says the Idle state
// is active and unblocked (Typing blocks; Listening does not — see state-machine.js). Runs
// entirely independently of the body sprite's own per-tick blink/leg-swing timers in
// renderer.js, and independently of the accessory layer (laptop/headphones stay wherever
// they already are while an idle animation plays underneath/around them).
(function () {
  const DEFAULT_AVG_GAP_SEC = 30;
  const MIN_AVG_GAP_SEC = 5;
  const MAX_AVG_GAP_SEC = 180;
  const DEFAULT_HOLD_MS = 400;

  function createIdleDirector({ pool, getCharacter, canPlay, getSprite, getCanvasEl, propMount, onSpeech, onParticle, avgGapSeconds }) {
    let gapTimer = null;
    let frameTimer = null;
    let playing = false;
    let paused = false;
    let currentPropEl = null;
    // The slider in settings sets an *average* gap; actual delay is randomized to +/-50%
    // around it so the pacing doesn't feel mechanical.
    let avgGapMs = clampAvgGap(avgGapSeconds) * 1000;

    function clampAvgGap(sec) {
      const n = Number(sec);
      if (!Number.isFinite(n)) return DEFAULT_AVG_GAP_SEC;
      return Math.min(MAX_AVG_GAP_SEC, Math.max(MIN_AVG_GAP_SEC, n));
    }

    function setAverageGapSeconds(sec) {
      avgGapMs = clampAvgGap(sec) * 1000;
      // Re-roll the pending wait against the new average right away, so dragging the
      // slider in settings feels responsive instead of waiting out the old interval first.
      if (!playing) scheduleNext();
    }

    function scheduleNext() {
      clearTimeout(gapTimer);
      if (paused) return;
      const delay = avgGapMs * 0.5 + Math.random() * avgGapMs;
      gapTimer = setTimeout(tryPlay, delay);
    }

    function tryPlay() {
      if (playing || paused || !canPlay()) {
        scheduleNext();
        return;
      }
      const character = getCharacter();
      const candidates = pool.filter((a) => !a.appliesTo || a.appliesTo.includes(character));
      if (!candidates.length) {
        scheduleNext();
        return;
      }
      play(candidates[Math.floor(Math.random() * candidates.length)]);
    }

    function setProp(name, pos) {
      if (currentPropEl) {
        currentPropEl.remove();
        currentPropEl = null;
      }
      if (!name || !window.BuddyProps) return;
      const el = window.BuddyProps.create(name);
      if (!el) return;
      el.classList.add(`prop-pos-${pos || 'hands'}`);
      propMount.appendChild(el);
      currentPropEl = el;
    }

    function applyTransformClass(canvasEl, name) {
      if (!canvasEl) return;
      Array.from(canvasEl.classList).forEach((c) => {
        if (c.startsWith('anim-')) canvasEl.classList.remove(c);
      });
      if (name) canvasEl.classList.add(name);
    }

    function resetVisuals() {
      const sprite = getSprite();
      applyTransformClass(getCanvasEl(), null);
      if (sprite && sprite.setPose) sprite.setPose(null);
      if (sprite && sprite.resetCore) sprite.resetCore();
      if (sprite && sprite.setMouthOpen) sprite.setMouthOpen(false);
      setProp(null, null);
    }

    function play(anim) {
      playing = true;
      resetVisuals();
      let i = 0;
      function step() {
        const sprite = getSprite();
        if (i >= anim.frames.length) {
          resetVisuals();
          playing = false;
          scheduleNext();
          return;
        }
        const f = anim.frames[i];
        if (f.transform !== undefined) applyTransformClass(getCanvasEl(), f.transform);
        if (f.pose !== undefined && sprite && sprite.setPose) sprite.setPose(f.pose);
        if (f.core !== undefined && sprite && sprite.setCore) sprite.setCore(f.core || {});
        if (f.prop !== undefined) setProp(f.prop, f.propPos);
        if (f.mouthOpen !== undefined && sprite && sprite.setMouthOpen) sprite.setMouthOpen(f.mouthOpen);
        if (f.blinking !== undefined && sprite && sprite.setBlinking) sprite.setBlinking(f.blinking);
        if (f.particle && onParticle) onParticle(f.particle, 1);
        if (i === 0 && anim.speech && onSpeech) onSpeech(anim.speech);
        i++;
        frameTimer = setTimeout(step, f.holdMs || DEFAULT_HOLD_MS);
      }
      step();
    }

    function interrupt() {
      clearTimeout(frameTimer);
      if (playing) {
        resetVisuals();
        playing = false;
        // Aborting mid-animation skips play()'s own end-of-animation scheduleNext() call
        // (i >= anim.frames.length never happens) — without this, no future idle animation
        // was ever scheduled again until something incidental (e.g. a settings save) called
        // setAverageGapSeconds and re-armed the gap timer as a side effect.
        scheduleNext();
      }
    }

    function pause() {
      paused = true;
      clearTimeout(gapTimer);
      interrupt();
    }

    function resume() {
      if (!paused) return;
      paused = false;
      scheduleNext();
    }

    return {
      start: scheduleNext,
      interrupt,
      pause,
      resume,
      isPlaying: () => playing,
      setAverageGapSeconds,
    };
  }

  window.BuddyIdleDirector = { create: createIdleDirector };
})();
