// Minimalist control panel. Thin grey borders, monospace, sectioned.
// Clicks dispatch through the shared ACTIONS table from main.js so the
// keyboard and panel agree on state.

const SECTIONS = [
  { title: 'view', items: [
    { key: 'b', label: 'bounds box', flag: 'boundsBox' },
    { key: 'q', label: 'follow one',  flag: 'followOne' },
    { key: '0', label: 'reset camera' },
  ] },
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
];

const STYLE = `
#panel {
  position: fixed; top: 50px; right: 16px;
  font: 11px/1.55 ui-monospace, monospace;
  color: #888;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid #2a2a2a;
  min-width: 188px;
  user-select: none;
  z-index: 10;
}
#panel .section { padding: 5px 10px 6px; }
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
`;

export function setupPanel({ actions, isOn }) {
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

    for (const item of section.items) {
      const row = document.createElement('div');
      row.className = 'row' + (item.flag ? '' : ' action');
      row.dataset.key = item.key;

      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = item.keyDisplay ?? item.key;
      row.appendChild(k);

      const label = document.createElement('span');
      label.className = 'l';
      label.textContent = item.label;
      row.appendChild(label);

      const s = document.createElement('span');
      s.className = 's';
      s.textContent = '○';
      row.appendChild(s);

      row.onclick = () => actions[item.key]?.();
      sec.appendChild(row);

      if (item.flag) rowsByFlag.set(item.flag, { row, s });
    }
    panel.appendChild(sec);
  }

  document.body.appendChild(panel);

  // Refresh indicators. Cheap enough to run every animation frame, but a
  // setInterval is plenty.
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
