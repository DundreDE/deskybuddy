const fields = ['autostart', 'mouseLook', 'typingDetection', 'musicDetection', 'afkDetection', 'multiMonitorFollow', 'hideFullscreen', 'alwaysDay'];
const rangeFields = ['idleIntervalSec'];
const characters = ['crab', 'avocado', 'citrus', 'bee'];
let beeCollarColor = '#8fd6ff';

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
  characters.forEach((value) => {
    const el = document.getElementById(`character-${value}`);
    if (el) el.checked = value === character;
  });
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
  const checked = document.querySelector('input[name="character"]:checked');
  settings.character = checked ? checked.value : 'crab';
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

  characters.forEach((value) => {
    const el = document.getElementById(`character-${value}`);
    if (el) el.addEventListener('change', () => window.settingsAPI.saveSettings(readForm()));
  });

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
