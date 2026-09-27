const STATES = {
  idle: { frames: ['assets/pet-idle-1.png', 'assets/pet-idle-2.png'], phrase: "Hey, I'm here if you need a break.", energy: 5, label: 'resting' },
  work: { frames: ['assets/pet-work-1.png', 'assets/pet-work-2.png'], phrase: 'One thing at a time. You have this.', energy: 3, label: 'working' },
  nudge: { frames: ['assets/pet-nudge-1.png', 'assets/pet-nudge-2.png'], phrase: 'Time to stretch your legs?', energy: 1, label: 'nudging' },
  sleep: { frames: ['assets/pet-sleep-1.png', 'assets/pet-sleep-2.png'], phrase: 'Rest looks good on you.', energy: 4, label: 'sleeping' },
};
const pet = document.querySelector('#preview-pet');
const bubble = document.querySelector('#preview-bubble');
const meter = document.querySelector('#preview-energy');
const buttons = document.querySelectorAll('[data-state]');
let current = 'idle';
let frame = 0;
for (const state of Object.values(STATES)) for (const src of state.frames) { const img = new Image(); img.src = src; }
function render(state) {
  current = state; frame = 0;
  const data = STATES[state];
  pet.src = data.frames[0]; pet.alt = `Nudge panda ${data.label}`;
  bubble.textContent = data.phrase;
  meter.innerHTML = '';
  meter.setAttribute('aria-label', `${data.energy} of 5 energy`);
  for (let i = 0; i < 5; i++) { const cell = document.createElement('span'); cell.className = i < data.energy ? 'filled' : ''; meter.appendChild(cell); }
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === state)));
}
buttons.forEach(button => button.addEventListener('click', () => render(button.dataset.state)));
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  setInterval(() => { frame = (frame + 1) % 2; pet.src = STATES[current].frames[frame]; }, 650);
}
render('idle');
document.querySelector('#preview-clock').textContent = new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
