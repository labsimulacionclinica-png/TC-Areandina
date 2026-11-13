// Tutorial guiado e interactivo: resalta una zona de la app, explica qué hacer y,
// en los pasos con `done`, espera a que el usuario lo haga antes de avanzar.
//
// Paso: { target?: selector | () => Element, title, text: string | () => string,
//         done?: () => boolean, failIf?: () => boolean, failText?, onRetry?, onEnter? }

const DONE_KEY = 'opentc-tour-done';

export function tourWasSeen() {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* sin almacenamiento */ }
}

export class Tour {
  constructor(steps) {
    this.steps = steps;
    this.index = -1;
    this.timer = null;
    this.spot = Object.assign(document.createElement('div'), { className: 'tour-spot' });
    this.pop = Object.assign(document.createElement('div'), { className: 'tour-pop' });
    this.pop.setAttribute('role', 'dialog');
    this.pop.setAttribute('aria-live', 'polite');
    this.onKey = (e) => { if (e.key === 'Escape') this.stop(); };
  }

  get active() { return this.index >= 0; }

  start() {
    // Se abre solo una vez de forma automática; después, con el botón «Tutorial».
    markSeen();
    document.body.append(this.spot, this.pop);
    document.addEventListener('keydown', this.onKey);
    this.go(0);
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop(completed = false) {
    clearInterval(this.timer);
    document.removeEventListener('keydown', this.onKey);
    this.spot.remove();
    this.pop.remove();
    this.index = -1;
    this.onStop?.(completed);
  }

  go(i) {
    this.index = i;
    const step = this.steps[i];
    step.onEnter?.();
    this.lastHtml = '';
    this.scrolled = false;
    this.tick();
  }

  next() {
    if (this.index >= this.steps.length - 1) this.stop(true);
    else this.go(this.index + 1);
  }

  target() {
    const t = this.steps[this.index].target;
    const el = typeof t === 'function' ? t() : t ? document.querySelector(t) : null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { el, r } : null;
  }

  // Se ejecuta cada 250 ms: comprueba si el paso se cumplió y recoloca el resaltado
  // (la app vuelve a dibujar paneles y el objetivo puede cambiar de sitio).
  tick() {
    if (!this.active) return;
    const step = this.steps[this.index];
    if (step.done?.()) { this.next(); return; }
    const failed = step.failIf?.();
    const n = this.steps.length;
    const html = `
      <div class="tour-head"><span class="tour-n">${this.index + 1}/${n}</span><b>${step.title}</b>
        <button class="tour-x" data-t="close" aria-label="Cerrar el tutorial">×</button></div>
      <div class="tour-text">${typeof step.text === 'function' ? step.text() : step.text}</div>
      ${failed ? `<div class="tour-fail">${step.failText}</div>` : ''}
      <div class="tour-actions">
        ${this.index > 0 ? '<button data-t="prev">Anterior</button>' : '<button data-t="close">Ahora no</button>'}
        ${failed && step.onRetry ? '<button data-t="retry">Reintentar</button>' : ''}
        ${step.done ? `<span class="tour-wait">${failed ? '' : 'Esperando a que lo haga…'}</span><button data-t="next" class="ghost">Saltar paso</button>`
          : `<button data-t="next" class="primary">${this.index === n - 1 ? 'Terminar' : this.index === 0 ? 'Empezar' : 'Siguiente'}</button>`}
      </div>`;
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.pop.innerHTML = html;
      for (const b of this.pop.querySelectorAll('[data-t]')) {
        b.addEventListener('click', () => {
          const a = b.dataset.t;
          if (a === 'close') this.stop();
          else if (a === 'prev') this.go(this.index - 1);
          else if (a === 'retry') { step.onRetry(); this.lastHtml = ''; }
          else this.next();
        });
      }
    }
    this.place();
  }

  place() {
    const t = this.target();
    const pop = this.pop, pad = 6, gap = 12;
    const vw = innerWidth, vh = innerHeight;
    if (!t) {
      this.spot.hidden = true;
      pop.classList.add('center');
      pop.style.left = pop.style.top = '';
      return;
    }
    if (!this.scrolled) {
      this.scrolled = true;
      if (t.r.top < 0 || t.r.bottom > vh) t.el.scrollIntoView({ block: 'center' });
    }
    const r = t.el.getBoundingClientRect();
    this.spot.hidden = false;
    Object.assign(this.spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    pop.classList.remove('center');
    if (vw < 700) { pop.style.left = pop.style.top = ''; return; } // en móvil va fijo abajo (CSS)
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    // Preferencia: debajo, encima, a la derecha, a la izquierda; si nada cabe, centrado.
    const options = [
      [r.left, r.bottom + gap], [r.left, r.top - ph - gap],
      [r.right + gap, r.top], [r.left - pw - gap, r.top],
    ];
    const fits = ([x, y]) => y >= 8 && y + ph <= vh - 8 && x + pw >= 0;
    let [x, y] = options.find(fits) || [(vw - pw) / 2, (vh - ph) / 2];
    x = Math.max(8, Math.min(x, vw - pw - 8));
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
  }
}
