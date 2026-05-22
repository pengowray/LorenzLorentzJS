// Minimalist control panel. Thin grey borders, monospace, sectioned.
// Toggle rows dispatch through the shared ACTIONS table from main.js so the
// keyboard and panel agree on state. Knob rows are bound to shared uniforms
// and update the rendered visual directly.

const SECTIONS = [
  { title: 'view', items: [
    { key: 'b', label: 'bounds box', flag: 'boundsBox' },
    { key: 'q', label: 'follow one',  flag: 'followOne' },
    { key: '0', label: 'reset camera' },
  ] },
  { title: 'camera', items: [
    { key: '1' }, { key: '2' }, { key: '3' },
    { key: '4' }, { key: '5' }, { key: '6' },
    { key: '7' }, { key: '8' }, { key: '9' },
  ], grid: true },
  { title: 'effects', items: [
    { key: 'f', label: 'fade tail',   flag: 'fadeOn' },
    { key: 'v', label: 'velocity col',flag: 'velColor' },
    { key: 'n', label: 'speedup',     flag: 'speedup' },
    { key: 'x', label: 'squiggle',    flag: 'squiggle' },
    { key: 'm', label: 'doodle',      flag: 'doodle' },
    { key: ',', label: 'stripes',     flag: 'stripes' },
  ] },
  { title: 'lorentz', items: [
    { key: '.', label: 'bedhair',     flag: 'bedhair' },
    { key: ';', label: 'beam',        flag: 'beam' },
    { key: "'", label: 'delay',       flag: 'delay' },
  ] },
  { title: 'sim', items: [
    { key: ' ', label: 'pause',       flag: 'paused', keyDisplay: '⎵' },
    { key: 'r', label: 'reset trails' },
    { key: 'g', label: 'save png' },
    { key: 'S', label: 'staggered seams', flag: 'staggered' },
    { record: true, label: 'record loop', flag: 'recording' },
  ] },
];

const STYLE = `
#panel {
  position: fixed; top: 50px; right: 16px;
  font: 10.5px/1.5 ui-monospace, monospace;
  color: #888;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid #2a2a2a;
  min-width: 188px;
  user-select: none;
  z-index: 10;
}
#panel .section { padding: 4px 10px 5px; }
#panel .section + .section { border-top: 1px solid #1f1f1f; }
#panel .title {
  color: #999;
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 3px;
}
#panel .row {
  display: grid;
  grid-template-columns: 14px 1fr 14px;
  align-items: center;
  cursor: pointer;
  padding: 1px 0;
  gap: 6px;
}
#panel .row:hover { color: #ddd; }
#panel .row .k { color: #555; font-size: 10px; text-align: center; }
#panel .row:hover .k { color: #999; }
#panel .row .s { text-align: center; color: #555; font-size: 11px; }
#panel .row.on .s { color: #ddd; }
#panel .row.action .s { visibility: hidden; }
#panel .row.record .s { color: #c66; }
#panel .knob {
  display: grid;
  grid-template-columns: 1fr 80px 32px;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}
#panel .knob input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  background: #333;
  outline: none;
  cursor: pointer;
}
#panel .knob input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 8px; height: 8px;
  background: #888; border-radius: 50%; cursor: pointer;
}
#panel .knob input[type="range"]::-moz-range-thumb {
  width: 8px; height: 8px;
  background: #888; border: none; border-radius: 50%; cursor: pointer;
}
#panel .knob input[type="range"]:hover::-webkit-slider-thumb { background: #ddd; }
#panel .knob input[type="range"]:hover::-moz-range-thumb { background: #ddd; }
#panel .knob .value { color: #888; text-align: right; font-size: 10px; }
#panel .camgrid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 3px;
}
#panel .cambtn {
  text-align: center;
  border: 1px solid #2a2a2a;
  padding: 2px 0;
  cursor: pointer;
  color: #888;
  font-size: 10px;
}
#panel .cambtn:hover { color: #ddd; border-color: #555; }
#panel .progress {
  height: 2px; background: #c66;
  position: absolute; bottom: -1px; left: 0;
  transition: width 0.05s linear;
}
`;

export function setupPanel({ actions, isOn, canvas, knobs = [], recordingState }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'panel';

  const rowsByFlag = new Map();

  for (const section of SECTIONS) {
    const sec = document.createElement('div');
    sec.className = 'section';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = section.title;
    sec.appendChild(title);

    if (section.grid) {
      const grid = document.createElement('div');
      grid.className = 'camgrid';
      for (const item of section.items) {
        const btn = document.createElement('div');
        btn.className = 'cambtn';
        btn.textContent = item.key;
        btn.onclick = () => actions[item.key]?.();
        grid.appendChild(btn);
      }
      sec.appendChild(grid);
    } else {
      for (const item of section.items) {
        const row = document.createElement('div');
        row.className = 'row'
          + (item.flag ? '' : ' action')
          + (item.record ? ' record' : '');

        const k = document.createElement('span');
        k.className = 'k';
        k.textContent = item.keyDisplay ?? (item.key ?? '');
        row.appendChild(k);

        const label = document.createElement('span');
        label.className = 'l';
        label.textContent = item.label;
        row.appendChild(label);

        const s = document.createElement('span');
        s.className = 's';
        s.textContent = item.record ? '●' : '○';
        row.appendChild(s);

        row.onclick = () => {
          if (item.record) actions['R']?.();
          else actions[item.key]?.();
        };
        sec.appendChild(row);
        if (item.flag) rowsByFlag.set(item.flag, { row, s });
      }
    }
    panel.appendChild(sec);
  }

  // Knobs section
  if (knobs.length) {
    const sec = document.createElement('div');
    sec.className = 'section';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'knobs';
    sec.appendChild(title);
    for (const knob of knobs) {
      const row = document.createElement('div');
      row.className = 'knob';
      const label = document.createElement('span');
      label.textContent = knob.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = knob.min;
      input.max = knob.max;
      input.step = knob.step;
      input.value = knob.uniform.value;
      const valueLabel = document.createElement('span');
      valueLabel.className = 'value';
      const fmt = () => knob.uniform.value.toFixed(2);
      valueLabel.textContent = fmt();
      input.oninput = () => {
        knob.uniform.value = parseFloat(input.value);
        valueLabel.textContent = fmt();
      };
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(valueLabel);
      sec.appendChild(row);
    }
    panel.appendChild(sec);
  }

  // Forward wheel events to the canvas so scroll-to-zoom still works while
  // the cursor is over the panel.
  if (canvas) {
    panel.addEventListener('wheel', (e) => {
      const ev = new WheelEvent('wheel', {
        deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2,
        bubbles: false, cancelable: true,
      });
      canvas.dispatchEvent(ev);
      e.preventDefault();
    }, { passive: false });
  }

  document.body.appendChild(panel);

  function refresh() {
    for (const [flag, { row, s }] of rowsByFlag) {
      const on = !!isOn(flag);
      row.classList.toggle('on', on);
      s.textContent = on ? '●' : '○';
    }
  }
  refresh();
  setInterval(refresh, 100);
}
