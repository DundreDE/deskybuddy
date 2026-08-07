const fields = ['autostart', 'mouseLook', 'typingDetection', 'musicDetection', 'afkDetection', 'multiMonitorFollow', 'hideFullscreen', 'alwaysDay', 'statsDecay', 'moodAffectsAnimations'];
const rangeFields = ['idleIntervalSec'];
const CHARACTERS = [
  { value: 'crab', emoji: '🦀' },
  { value: 'avocado', emoji: '🥑' },
  { value: 'citrus', emoji: '🍋' },
  { value: 'bee', emoji: '🐝' },
  { value: 'monkey', emoji: '🐒' },
  { value: 'toast', emoji: '🍞' },
  { value: 'kaktus', emoji: '🌵' },
  { value: 'wolke', emoji: '☁️' },
  { value: 'croissant', emoji: '🥐' },
  { value: 'pilz', emoji: '🍄' },
];
let characterIndex = 0;
let beeCollarColor = '#8fd6ff';
let currentStrings = null; // { onboarding, tray, settings: {...}, character: {...} } — see i18n/*.json

// Dotted-path lookup with {placeholder} interpolation, e.g. t('settings.idle.intervalLabel', { seconds: 30 }).
function t(key, vars) {
  const dict = currentStrings || {};
  let value = key.split('.').reduce((obj, part) => (obj && obj[part] !== undefined ? obj[part] : undefined), dict);
  if (value === undefined) return key;
  if (vars) for (const [k, v] of Object.entries(vars)) value = value.replace(`{${k}}`, v);
  return value;
}

function applyTranslations() {
  if (!currentStrings) return;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.dataset.i18nTitle)); });
  renderCharacter();
  updateIdleIntervalLabel(document.getElementById('idleIntervalSec').value);
}

function renderCharacter() {
  const current = CHARACTERS[characterIndex];
  const emojiEl = document.getElementById('characterEmoji');
  const nameEl = document.getElementById('characterName');
  if (emojiEl) emojiEl.textContent = current.emoji;
  if (nameEl) nameEl.textContent = t(`character.${current.value}`);
  const gearBtn = document.getElementById('beeGearBtn');
  if (gearBtn) gearBtn.classList.toggle('visible', current.value === 'bee');
  if (current.value !== 'bee') {
    const collarPicker = document.getElementById('collarPicker');
    if (collarPicker) collarPicker.classList.remove('visible');
  }
}

function updateIdleIntervalLabel(value) {
  const label = document.getElementById('idleIntervalLabel');
  if (label) label.textContent = t('settings.idle.intervalLabel', { seconds: value });
}

function applyToForm(settings) {
  fields.forEach((key) => {
    const el = document.getElementById(key);
    if (el) el.checked = !!settings[key];
  });
  rangeFields.forEach((key) => {
    const el = document.getElementById(key);
    if (el && settings[key] !== undefined) el.value = settings[key];
  });
  updateIdleIntervalLabel(document.getElementById('idleIntervalSec').value);
  const warning = document.getElementById('autostartWarning');
  if (warning) warning.classList.toggle('visible', !!settings.autostart && !!settings.autostartBlockedByOS);
  const character = settings.character || 'crab';
  const idx = CHARACTERS.findIndex((c) => c.value === character);
  characterIndex = idx >= 0 ? idx : 0;
  renderCharacter();
  beeCollarColor = settings.beeCollarColor || beeCollarColor;
  document.querySelectorAll('.collar-swatch').forEach((el) => {
    el.classList.toggle('selected', el.dataset.color === beeCollarColor);
  });
  const languageEl = document.getElementById('language');
  if (languageEl) languageEl.value = settings.language || 'auto';
}

function readForm() {
  const settings = {};
  fields.forEach((key) => {
    const el = document.getElementById(key);
    if (el) settings[key] = el.checked;
  });
  rangeFields.forEach((key) => {
    const el = document.getElementById(key);
    if (el) settings[key] = Number(el.value);
  });
  settings.character = CHARACTERS[characterIndex].value;
  settings.beeCollarColor = beeCollarColor;
  const languageEl = document.getElementById('language');
  if (languageEl) settings.language = languageEl.value;
  return settings;
}

async function init() {
  const { strings } = await window.settingsAPI.loadStrings();
  currentStrings = strings;
  applyTranslations();
  window.settingsAPI.onLanguageUpdate(({ strings: updated }) => {
    currentStrings = updated;
    applyTranslations();
  });

  const settings = await window.settingsAPI.loadSettings();
  applyToForm(settings);

  const powerSaveEl = document.getElementById('powerSave');
  if (powerSaveEl) {
    powerSaveEl.checked = await window.settingsAPI.getPowerSave();
    powerSaveEl.addEventListener('change', () => window.settingsAPI.setPowerSave(powerSaveEl.checked));
    window.settingsAPI.onPowerSaveUpdate(({ enabled }) => { powerSaveEl.checked = enabled; });
  }

  const languageEl = document.getElementById('language');
  if (languageEl) languageEl.addEventListener('change', () => window.settingsAPI.saveSettings(readForm()));

  fields.forEach((key) => {
    const el = document.getElementById(key);
    if (el) el.addEventListener('change', () => window.settingsAPI.saveSettings(readForm()));
  });

  rangeFields.forEach((key) => {
    const el = document.getElementById(key);
    if (!el) return;
    el.addEventListener('input', () => updateIdleIntervalLabel(el.value));
    el.addEventListener('change', () => window.settingsAPI.saveSettings(readForm()));
  });

  const prevBtn = document.getElementById('characterPrev');
  const nextBtn = document.getElementById('characterNext');
  const stepCharacter = (delta) => {
    characterIndex = (characterIndex + delta + CHARACTERS.length) % CHARACTERS.length;
    renderCharacter();
    window.settingsAPI.saveSettings(readForm());
  };
  if (prevBtn) prevBtn.addEventListener('click', () => stepCharacter(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => stepCharacter(1));

  const gearBtn = document.getElementById('beeGearBtn');
  const collarPicker = document.getElementById('collarPicker');
  if (gearBtn && collarPicker) {
    gearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      collarPicker.classList.toggle('visible');
    });
  }
  document.querySelectorAll('.collar-swatch').forEach((el) => {
    el.addEventListener('click', () => {
      beeCollarColor = el.dataset.color;
      document.querySelectorAll('.collar-swatch').forEach((s) => s.classList.toggle('selected', s === el));
      window.settingsAPI.saveSettings(readForm());
    });
  });

  window.settingsAPI.onSettingsUpdated((settings) => applyToForm(settings));
}

document.addEventListener('DOMContentLoaded', init);
