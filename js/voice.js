// Voz del tomógrafo y del técnico (Web Speech API): instrucciones respiratorias y avisos al paciente.
// Se activa en «Ajustes». Si el navegador no tiene síntesis de voz, no hace nada.
const KEY = 'opentc-voice';
const LANG = { es: 'es-ES', en: 'en-US', pt: 'pt-BR' };

const PHRASES = {
  breathIn: { es: 'Inspire profundo… y no respire.', en: 'Breathe in… and hold your breath.', pt: 'Inspire fundo… e prenda a respiração.' },
  breathOut: { es: 'Puede respirar.', en: 'You may breathe.', pt: 'Pode respirar.' },
  stayStill: { es: 'No se mueva, por favor.', en: 'Please keep still.', pt: 'Não se mexa, por favor.' },
  contrast: { es: 'Va a sentir calor por el cuerpo; es normal.', en: 'You will feel warm; that is normal.', pt: 'Vai sentir calor pelo corpo; é normal.' },
  tableMoves: { es: 'La camilla se va a mover.', en: 'The table is going to move.', pt: 'A mesa vai se mover.' },
  finished: { es: 'Terminamos. Lo hizo muy bien.', en: 'We are done. You did very well.', pt: 'Terminamos. Você foi muito bem.' },
};

export const voice = {
  get enabled() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
  set enabled(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* sin almacenamiento */ } },
  available: typeof window !== 'undefined' && 'speechSynthesis' in window,
  lang() { return document.documentElement.lang || 'es'; },
  say(key, { wait = false } = {}) {
    if (!this.enabled || !this.available) return Promise.resolve();
    const l = this.lang(), text = PHRASES[key]?.[l] || PHRASES[key]?.es || key;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG[l] || 'es-ES';
    const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith(u.lang.slice(0, 2)));
    if (v) u.voice = v;
    u.rate = 0.95;
    return new Promise((resolve) => {
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
      if (!wait) resolve();
      setTimeout(resolve, 6000); // por si el navegador no avisa del final
    });
  },
};
