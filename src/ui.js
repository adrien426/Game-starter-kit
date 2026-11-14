// Thin layer over the HTML overlays defined in index.html.
const $ = (id) => document.getElementById(id);

export const UI = {
  show(screen) {
    for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== screen;
    $('hud').hidden = screen !== null;
    document.body.classList.toggle('in-game', screen === null);
  },
  loading(progress) { $('load-bar').style.width = `${Math.round(progress * 100)}%`; },
  score(home, away) { $('score-home').textContent = home; $('score-away').textContent = away; },
  clock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    $('clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
  charge(t) { $('charge').style.transform = `scaleX(${t})`; $('charge-wrap').classList.toggle('active', t > 0); },
  banner(text) {
    const b = $('banner');
    b.textContent = text;
    b.hidden = !text;
  },
  result(home, away) {
    $('result-title').textContent = home > away ? 'Victoire !' : home < away ? 'Défaite' : 'Match nul';
    $('result-score').textContent = `${home} – ${away}`;
  },
  on(id, fn) { $(id).addEventListener('click', fn); },
};
