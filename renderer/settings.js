const fields = ['autostart', 'mouseLook', 'typingDetection', 'musicDetection', 'afkDetection', 'multiMonitorFollow', 'hideFullscreen', 'alwaysDay'];
const rangeFields = ['idleIntervalSec'];
const CHARACTERS = [
  { value: 'crab', emoji: '🦀', name: 'Krabbe' },
  { value: 'avocado', emoji: '🥑', name: 'Avocado' },
  { value: 'citrus', emoji: '🍋', name: 'Zitrusscheibe' },
  { value: 'bee', emoji: '🐝', name: 'Biene' },
  { value: 'monkey', emoji: '🐒', name: 'Affe' },
  { value: 'toast', emoji: '🍞', name: 'Toast' },
  { value: 'kaktus', emoji: '🌵', name: 'Kaktus' },
  { value: 'wolke', emoji: '☁️', name: 'Wolke' },
  { value: 'croissant', emoji: '🥐', name: 'Croissant' },
  { value: 'pilz', emoji: '🍄', name: 'Fliegenpilz' },
];
let characterIndex = 0;
let beeCollarColor = '#8fd6ff';

function renderCharacter() {
  const current = CHARACTERS[characterIndex];
  const emojiEl = document.getElementById('characterEmoji');
  const nameEl = document.getElementById('characterName');
  if (emojiEl) emojiEl.textContent = current.emoji;
  if (nameEl) nameEl.textContent = current.name;
  const gearBtn = document.getElementById('beeGearBtn');
  if (gearBtn) gearBtn.classList.toggle('visible', current.value === 'bee');
  if (current.value !== 'bee') {
    const collarPicker = document.getElementById('collarPicker');
    if (collarPicker) collarPicker.classList.remove('visible');
  }
}

function updateIdleIntervalLabel(value) {
  const label = document.getElementById('idleIntervalLabel');
  if (label) label.textContent = `alle ~${value}s`;
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
  return settings;
}

async function init() {
  const settings = await window.settingsAPI.loadSettings();
  applyToForm(settings);

  const powerSaveEl = document.getElementById('powerSave');
  if (powerSaveEl) {
    powerSaveEl.checked = await window.settingsAPI.getPowerSave();
    powerSaveEl.addEventListener('change', () => window.settingsAPI.setPowerSave(powerSaveEl.checked));
    window.settingsAPI.onPowerSaveUpdate(({ enabled }) => { powerSaveEl.checked = enabled; });
  }

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
