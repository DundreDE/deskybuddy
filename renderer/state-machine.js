// Explicit Typing / Listening / Idle state machine, per the desk-buddy spec.
// This tracks the context signals from main.js (typing, listening/media, afk)
// and their priority: only Typing blocks the idle-animation layer. Listening and Afk
// are "overlay" flags that layer visuals on top of whatever the idle-animation
// pool is already doing, instead of pre-empting it.
// It is intentionally separate from the pet/feed/sleep/drag/walk "action states"
// in renderer.js, which pre-empt everything (including Typing/Listening) the same
// way they always have.
(function () {
  const STATES = Object.freeze({ TYPING: 'TYPING', LISTENING: 'LISTENING', IDLE: 'IDLE' });

  function createBuddyStateMachine({ onChange } = {}) {
    let typing = false;
    let listening = false;
    let afk = false;

    function current() {
      if (typing) return STATES.TYPING;
      if (listening) return STATES.LISTENING;
      return STATES.IDLE;
    }

    function notify() {
      if (onChange) onChange({ state: current(), typing, listening, afk, idleBlocked: typing });
    }

    function makeOverlaySetter(get, set) {
      return (value) => {
        value = !!value;
        if (get() === value) return;
        set(value);
        notify();
      };
    }

    return {
      STATES,
      setTyping(value) {
        value = !!value;
        if (typing === value) return;
        typing = value;
        notify();
      },
      setListening: makeOverlaySetter(() => listening, (v) => { listening = v; }),
      setAfk: makeOverlaySetter(() => afk, (v) => { afk = v; }),
      isTyping: () => typing,
      isListening: () => listening,
      isAfk: () => afk,
      // Only Typing blocks the idle-animation layer; Listening/Afk layer on top of it.
      isIdleBlocked: () => typing,
      getState: current,
    };
  }

  window.BuddyStateMachine = { create: createBuddyStateMachine, STATES };
})();
