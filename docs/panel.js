// Minimalist control panel. Thin grey borders, monospace, sectioned.
// Each section has a clickable title that collapses/expands it. There is
// a master header at the top that collapses the whole panel; on touch
// devices it starts collapsed so the controls don't cover the canvas.

import { loopConfig, SIZES, loopStats, durationFrames } from './loop.js';
import { lorenzParams, LORENZ_DEFAULTS } from './lorenz.js';

// Sections are built lazily so the loop section can pull callbacks
// (size change, config change) from main.js. Everything else is static.
function buildSections({
  onSizeChange = () => {}, onConfigChange = () => {}, attractors = [],
  scene = null,
} = {}) {
  return [
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
    // Scene composition: how many attractors, their colour palette, and
    // the range of trail lengths for the wash of grey ones. Heavy to
    // change (regenerates + pre-warms every attractor), so the count /
    // trail sliders only re-run on release (onCommit).
    ...(scene ? [{ title: 'scene', collapsed: true, items: [
      {
        type: 'slider', label: 'count',
        get: () => scene.config.numAttractors,
        set: v => { scene.config.numAttractors = v; },
        min: 5, max: 300, step: 1,
        format: v => `${v}`,
        default: scene.defaults.numAttractors,
        onCommit: scene.onRebuild,
      },
      {
        type: 'slider', label: 't min',
        get: () => scene.config.trailMin,
        set: v => { scene.config.trailMin = v; },
        min: 10, max: 2000, step: 10,
        format: v => `${v}`,
        default: scene.defaults.trailMin,
        onCommit: scene.onRebuild,
      },
      {
        type: 'slider', label: 't max',
        get: () => scene.config.trailMax,
        set: v => { scene.config.trailMax = v; },
        min: 50, max: 5000, step: 50,
        format: v => `${v}`,
        default: scene.defaults.trailMax,
        onCommit: scene.onRebuild,
      },
      {
        type: 'cycler', label: 'colors',
        options: scene.colorSchemes,
        get: () => scene.config.colorScheme,
        set: i => { scene.config.colorScheme = i; },
        format: s => s.label,
        onChange: scene.onRebuild,
      },
    ] }] : []),
    // The classic Lorenz equation coefficients. Defaults (10, 28, 8/3)
    // give the butterfly; nudging them creates other shapes / fixed points.
    { title: 'lorenz', collapsed: true, items: [
      {
        type: 'slider', label: 'σ',
        get: () => lorenzParams.sigma, set: v => { lorenzParams.sigma = v; },
        min: 0, max: 30, step: 0.1,
        format: v => v.toFixed(1),
        default: LORENZ_DEFAULTS.sigma,
        onChange: onConfigChange,
      },
      {
        type: 'slider', label: 'ρ',
        get: () => lorenzParams.rho, set: v => { lorenzParams.rho = v; },
        min: 0, max: 50, step: 0.1,
        format: v => v.toFixed(1),
        default: LORENZ_DEFAULTS.rho,
        onChange: onConfigChange,
      },
      {
        type: 'slider', label: 'β',
        get: () => lorenzParams.beta, set: v => { lorenzParams.beta = v; },
        min: 0, max: 6, step: 0.01,
        format: v => v.toFixed(2),
        default: LORENZ_DEFAULTS.beta,
        onChange: onConfigChange,
      },
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
      {
        type: 'cycler', label: 'size',
        options: SIZES,
        get: () => loopConfig.sizeIndex,
        set: (i) => { loopConfig.sizeIndex = i; },
        format: (s) => s.label,
        onChange: onSizeChange,
      },
      {
        type: 'slider', label: 'dur',
        get: () => loopConfig.duration,
        set: (v) => { loopConfig.duration = v; },
        min: 1, max: 20, step: 1,
        format: (v) => `${v}s`,
        onChange: onConfigChange,
      },
      {
        type: 'slider', label: 'fade',
        get: () => loopConfig.fadeFraction,
        set: (v) => { loopConfig.fadeFraction = v; },
        min: 0.01, max: 0.5, step: 0.01,
        // Shown as % of each attractor's trail length.
        format: (v) => `${Math.round(v * 100)}%`,
        onChange: onConfigChange,
      },
      {
        type: 'slider', label: 'spin',
        get: () => loopConfig.spin, set: v => { loopConfig.spin = v; },
        min: 0, max: 5, step: 1,
        format: v => `${v}×`,
        default: 0,
      },
      {
        type: 'slider', label: 'wobble',
        get: () => loopConfig.wobble, set: v => { loopConfig.wobble = v; },
        min: 0, max: 45, step: 1,
        format: v => `${v}°`,
        default: 0,
      },
      { key: 'L', label: 'preview loop',    flag: 'loopPreview' },
      { key: 'S', label: 'staggered fades', flag: 'staggered' },
      { record: true, label: 'record video', flag: 'recording' },
      {
        type: 'info', label: 'phase fade',
        get: () => {
          const s = loopStats(attractors, durationFrames());
          return `${s.phase} / ${s.total}`;
        },
      },
      {
        type: 'info', label: 'whole fade',
        get: () => {
          const s = loopStats(attractors, durationFrames());
          return `${s.natural} / ${s.total}`;
        },
      },
    ] },
  ];
}

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
  grid-template-columns: 14px 32px 1fr 30px 14px;
  align-items: center;
  gap: 6px;
  padding: 0 0 1px;
}
#panel .knob .reset {
  cursor: pointer;
  color: #555;
  font-size: 11px;
  text-align: center;
  visibility: hidden;
}
#panel .knob .reset:hover { color: #ddd; }
#panel .knob.dirty .reset { visibility: visible; }
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

#panel .cycler {
  display: grid;
  grid-template-columns: 14px 32px 12px 1fr 12px;
  align-items: center;
  gap: 6px;
  padding: 0 0 1px;
}
#panel .cycler .cycler-label { color: #666; font-size: 9.5px; }
#panel .cycler .cycler-value {
  color: #999; font-size: 9.5px; text-align: center; cursor: pointer;
}
#panel .cycler .cycler-value:hover { color: #ddd; }
#panel .cycler .cycler-arrow {
  color: #555; cursor: pointer; text-align: center; font-size: 12px;
}
#panel .cycler .cycler-arrow:hover { color: #ddd; }

#panel .info {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 0 0 1px;
  color: #777;
}
#panel .info .info-label { color: #666; font-size: 9.5px; }
#panel .info .info-value { color: #aaa; font-size: 9.5px; text-align: right; }

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
  #panel .cycler {
    padding: 8px 0;
    grid-template-columns: 22px 42px 22px 1fr 22px;
    min-height: 32px;
  }
  #panel .cycler .cycler-label { font-size: 13px; }
  #panel .cycler .cycler-value { font-size: 13px; }
  #panel .cycler .cycler-arrow { font-size: 18px; }
}
`;

export function setupPanel({ actions, isOn, canvas, knobs = {}, loop = {}, scene = null }) {
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
  const refreshHooks = [];

  // A range slider tied to either a uniform (knob.uniform) or to an
  // arbitrary JS getter/setter (knob.get / knob.set). Used both for the
  // shader-uniform knobs in `knobs` and for the loop config sliders.
  function makeKnobRow(knob) {
    const row = document.createElement('div');
    row.className = 'knob';
    row.appendChild(document.createElement('span'));

    const label = document.createElement('span');
    label.className = 'knob-label';
    label.textContent = knob.label ?? '';
    row.appendChild(label);

    const get = knob.uniform ? () => knob.uniform.value : knob.get;
    const set = knob.uniform ? (v) => { knob.uniform.value = v; } : knob.set;
    const fmt = knob.format ?? ((v) => Number(v).toFixed(2));

    const input = document.createElement('input');
    input.type = 'range';
    input.min = knob.min;
    input.max = knob.max;
    input.step = knob.step;
    input.value = get();
    row.appendChild(input);

    const valueLabel = document.createElement('span');
    valueLabel.className = 'value';
    valueLabel.textContent = fmt(get());
    input.oninput = () => {
      set(parseFloat(input.value));
      valueLabel.textContent = fmt(get());
      knob.onChange?.();
    };
    // `change` fires on release (after the user lets go). Used for
    // expensive operations like scene regeneration where we don't want
    // to re-run every pixel of slider drag.
    input.onchange = () => { knob.onCommit?.(); };
    row.appendChild(valueLabel);

    // Optional reset-to-default 'x'. Only shown when the slider is off
    // its default value, so the panel doesn't get visual noise from
    // every knob having an always-on dismiss button.
    const reset = document.createElement('span');
    reset.className = 'reset';
    reset.textContent = '×';
    if (knob.default !== undefined) {
      reset.onclick = () => {
        set(knob.default);
        input.value = knob.default;
        valueLabel.textContent = fmt(knob.default);
        knob.onChange?.();
      };
    }
    row.appendChild(reset);

    refreshHooks.push(() => {
      const v = get();
      if (parseFloat(input.value) !== v) input.value = v;
      const txt = fmt(v);
      if (valueLabel.textContent !== txt) valueLabel.textContent = txt;
      if (knob.default !== undefined) {
        const dirty = Math.abs(v - knob.default) > (knob.step ?? 0) / 2;
        row.classList.toggle('dirty', dirty);
      }
    });
    return row;
  }

  // ‹ value › cycler for picking from a small set of options (e.g. the
  // recording size). Clicking the value itself also advances by one,
  // wrapping at the ends — handy on touch where the arrows are small.
  function makeCyclerRow(item) {
    const row = document.createElement('div');
    row.className = 'cycler';
    row.appendChild(document.createElement('span'));

    const label = document.createElement('span');
    label.className = 'cycler-label';
    label.textContent = item.label ?? '';
    row.appendChild(label);

    const prev = document.createElement('span');
    prev.className = 'cycler-arrow';
    prev.textContent = '‹';
    row.appendChild(prev);

    const valueLabel = document.createElement('span');
    valueLabel.className = 'cycler-value';
    row.appendChild(valueLabel);

    const next = document.createElement('span');
    next.className = 'cycler-arrow';
    next.textContent = '›';
    row.appendChild(next);

    const update = () => {
      const i = item.get();
      const opt = item.options[i];
      valueLabel.textContent = item.format ? item.format(opt) : String(opt);
    };
    const step = (dir) => {
      const n = item.options.length;
      item.set((item.get() + dir + n) % n);
      update();
      item.onChange?.();
    };
    prev.onclick = () => step(-1);
    next.onclick = () => step(+1);
    valueLabel.onclick = () => step(+1);

    update();
    refreshHooks.push(update);
    return row;
  }

  const sections = buildSections({ ...loop, scene });
  for (const section of sections) {
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
        if (item.type === 'slider') {
          rows.appendChild(makeKnobRow(item));
          continue;
        }
        if (item.type === 'cycler') {
          rows.appendChild(makeCyclerRow(item));
          continue;
        }
        if (item.type === 'info') {
          const row = document.createElement('div');
          row.className = 'info';
          row.appendChild(document.createElement('span'));
          const label = document.createElement('span');
          label.className = 'info-label';
          label.textContent = item.label ?? '';
          row.appendChild(label);
          const value = document.createElement('span');
          value.className = 'info-value';
          value.textContent = item.get();
          refreshHooks.push(() => {
            const txt = item.get();
            if (value.textContent !== txt) value.textContent = txt;
          });
          row.appendChild(value);
          rows.appendChild(row);
          continue;
        }

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
    for (const fn of refreshHooks) fn();
  }
  refresh();
  setInterval(refresh, 100);
}
