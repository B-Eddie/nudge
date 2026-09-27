const STATES = {
  idle: { frames: ['assets/pet-idle-1.png', 'assets/pet-idle-2.png'], phrase: '', energy: 5, label: 'resting', status: 'READY WHEN YOU ARE' },
  work: { frames: ['assets/pet-work-1.png', 'assets/pet-work-2.png'], phrase: '', energy: 3, label: 'working', status: '25 MIN AT YOUR DESK' },
  nudge: { frames: ['assets/pet-nudge-1.png', 'assets/pet-nudge-2.png'], phrase: 'A little stretch? You have been working for 47 minutes.', energy: 1, label: 'reminding you to take a break', status: '47 MIN AT YOUR DESK' },
  sleep: { frames: ['assets/pet-sleep-1.png', 'assets/pet-sleep-2.png'], phrase: '', energy: 4, label: 'resting during a break', status: 'ON A BREAK' },
};
const pet = document.querySelector('#preview-pet');
const bubble = document.querySelector('#preview-bubble');
const buttons = document.querySelectorAll('[data-state]');
const meter = document.querySelector('#preview-energy');
const status = document.querySelector('#preview-status');
let current = 'nudge';
let frame = 0;
for (const state of Object.values(STATES)) for (const src of state.frames) { const img = new Image(); img.src = src; }
function render(state) {
  current = state; frame = 0;
  const data = STATES[state];
  pet.src = data.frames[0]; pet.alt = `Nudge panda ${data.label}`;
  bubble.textContent = data.phrase;
  bubble.hidden = !data.phrase;
  status.textContent = data.status;
  meter.setAttribute('aria-label', `Pet energy: ${data.energy} of 5`);
  meter.replaceChildren(...Array.from({length: 5}, (_, index) => { const cell = document.createElement('span'); if (index < data.energy) cell.className = 'filled'; return cell; }));
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === state)));
}
buttons.forEach(button => button.addEventListener('click', () => render(button.dataset.state)));
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  setInterval(() => { frame = (frame + 1) % 2; pet.src = STATES[current].frames[frame]; }, 650);
}
render('nudge');
document.querySelector('#preview-clock').textContent = new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
