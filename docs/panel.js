// Minimalist control panel. Thin grey borders, monospace, sectioned.
// Each section has a clickable title that collapses/expands it. There is
// a master header at the top that collapses the whole panel; on touch
// devices it starts collapsed so the controls don't cover the canvas.

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
  ] },
  // Loop / recording is collapsed by default. Most sessions won't touch it
  // and unfolding it explicitly keeps the recording UI from cluttering the
  // common-use panel.
  { title: 'loop', collapsed: true, items: [
    { key: 'S', label: 'staggered fades', flag: 'staggered' },
    { record: true, label: 'record video', flag: 'recording' },
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
#panel .head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 10px;
  border-bottom: 1px solid #1f1f1f;
  cursor: pointer;
  color: #aaa;
  font-size: 9.5px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
#panel .head:hover { color: #ddd; }
#panel .head .chev { color: #666; }
#panel.collapsed .body { display: none; }
#panel.collapsed .head { border-bottom: none; }
#panel .body { max-height: calc(100vh - 60px); overflow-y: auto; }

#panel .section { padding: 4px 10px 5px; }
#panel .section + .section { border-top: 1px solid #1f1f1f; }
#panel .title {
  color: #999;
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 3px;
  cursor: pointer;
  display: flex; justify-content: space-between; align-items: center;
}
#panel .title:hover { color: #ddd; }
#panel .title .chev { color: #555; font-size: 8px; }
#panel .section.collapsed .body-rows,
#panel .section.collapsed .camgrid { display: none; }
#panel .section.collapsed .title { margin-bottom: 0; }

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
  grid-template-columns: 14px 32px 1fr 30px;
  align-items: center;
  gap: 6px;
  padding: 0 0 1px;
}
#panel .knob .knob-label { color: #666; font-size: 9.5px; }
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
#panel .knob .value { color: #777; text-align: right; font-size: 9.5px; }

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

/* Mobile / touch devices: bigger touch targets, larger font, and a much
   more obvious master header so the open/close button is impossible to miss. */
@media (max-width: 768px), (pointer: coarse) {
  #panel {
    font-size: 15px;
    line-height: 1.7;
    min-width: 240px;
    top: 8px; right: 8px;
  }
  /* Big chunky header bar that doubles as the open/close button. */
  #panel .head {
    font-size: 14px;
    padding: 14px 16px;
    background: rgba(40, 40, 40, 0.85);
    letter-spacing: 2px;
  }
  #panel .head .chev { font-size: 16px; }
  /* When collapsed, the panel IS just the header — make sure it stays
     tappable and visible. */
  #panel.collapsed { min-width: 140px; }

  #panel .title { font-size: 12px; padding: 4px 0; }
  #panel .title .chev { font-size: 11px; }
  #panel .row {
    padding: 10px 0;
    grid-template-columns: 22px 1fr 22px;
    min-height: 32px;
  }
  #panel .row .k { font-size: 13px; }
  #panel .row .s { font-size: 16px; }
  #panel .cambtn { padding: 12px 0; font-size: 15px; min-height: 36px; }
  #panel .knob {
    padding: 8px 0;
    grid-template-columns: 22px 42px 1fr 44px;
    min-height: 32px;
  }
  #panel .knob .knob-label { font-size: 13px; }
  #panel .knob .value { font-size: 13px; }
  #panel .knob input[type="range"] { height: 6px; }
  #panel .knob input[type="range"]::-webkit-slider-thumb { width: 20px; height: 20px; }
  #panel .knob input[type="range"]::-moz-range-thumb { width: 20px; height: 20px; }
}
`;

export function setupPanel({ actions, isOn, canvas, knobs = {} }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'panel';

  // Master header: clicking collapses/expands the whole body. On touch
  // devices we render this as a thick tappable button (hamburger + label).
  const head = document.createElement('div');
  head.className = 'head';
  const headLabel = document.createElement('span');
  headLabel.textContent = 'controls';
  const headChev = document.createElement('span');
  headChev.className = 'chev';
  headChev.textContent = '▾';
  head.append(headLabel, headChev);
  panel.append(head);

  const body = document.createElement('div');
  body.className = 'body';
  panel.append(body);

  head.onclick = () => {
    const collapsed = panel.classList.toggle('collapsed');
    headChev.textContent = collapsed ? '▸' : '▾';
  };

  const rowsByFlag = new Map();

  function makeKnobRow(knob) {
    const row = document.createElement('div');
    row.className = 'knob';
    row.appendChild(document.createElement('span'));

    const label = document.createElement('span');
    label.className = 'knob-label';
    label.textContent = knob.label ?? '';
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = knob.min;
    input.max = knob.max;
    input.step = knob.step;
    input.value = knob.uniform.value;
    row.appendChild(input);

    const valueLabel = document.createElement('span');
    valueLabel.className = 'value';
    const fmt = () => knob.uniform.value.toFixed(2);
    valueLabel.textContent = fmt();
    input.oninput = () => {
      knob.uniform.value = parseFloat(input.value);
      valueLabel.textContent = fmt();
    };
    row.appendChild(valueLabel);
    return row;
  }

  for (const section of SECTIONS) {
    const sec = document.createElement('div');
    sec.className = 'section';
    if (section.collapsed) sec.classList.add('collapsed');

    const title = document.createElement('div');
    title.className = 'title';
    const titleText = document.createElement('span');
    titleText.textContent = section.title;
    const titleChev = document.createElement('span');
    titleChev.className = 'chev';
    titleChev.textContent = section.collapsed ? '▸' : '▾';
    title.append(titleText, titleChev);
    title.onclick = () => {
      const collapsed = sec.classList.toggle('collapsed');
      titleChev.textContent = collapsed ? '▸' : '▾';
    };
    sec.append(title);

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
      const rows = document.createElement('div');
      rows.className = 'body-rows';
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
        rows.appendChild(row);
        if (item.flag) rowsByFlag.set(item.flag, { row, s });

        if (item.flag && knobs[item.flag]) {
          rows.appendChild(makeKnobRow(knobs[item.flag]));
        }
      }
      sec.appendChild(rows);
    }
    body.appendChild(sec);
  }

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

  // Start collapsed on touch devices so the controls don't sit on top of
  // the canvas until the user opts in.
  const isTouch = window.matchMedia('(pointer: coarse)').matches
    || window.innerWidth < 768;
  if (isTouch) {
    panel.classList.add('collapsed');
    headChev.textContent = '▸';
  }

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
