// main.js - Lógica completa de UI interactiva, controles avanzados y explicaciones para ProfesorBode Mobile
import Plotly from 'plotly.js-dist-min';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  parseTransferFunction,
  evaluateFreqResponse,
  calculateMargins,
  simulateStepResponse,
  findRoots,
  designCompensator,
  getBodeComponents,
  polyAdd,
  polyMultiply
} from './controlEngine.js';

// Estado global de la aplicación
const state = {
  currentTab: 'bode', // 'bode', 'nyquist', 'locus', 'compensator', 'step'
  step: 0,
  maxSteps: 4,
  tfStr: '10/(s*(s+2)*(s+4))',
  parsedTF: null,
  bodeComps: null,
  wList: [],
  freqResp: null,
  margins: null,
  compResult: null,
  stepRespOrig: null,
  stepRespComp: null,
  isFullscreen: false,
  isExpandedCard: false
};

// Generar rejilla de frecuencias logarítmica
function generateFreqGrid() {
  const w = [];
  for (let exp = -2; exp <= 3; exp += 0.01) {
    w.push(Math.pow(10, exp));
  }
  return w;
}

state.wList = generateFreqGrid();

// Elementos del DOM
const appElement = document.getElementById('app');
const tfInput = document.getElementById('tfInput');
const btnAnalyze = document.getElementById('btnAnalyze');
const exampleSelect = document.getElementById('exampleSelect');
const btnToggleKeypad = document.getElementById('btnToggleKeypad');
const virtualKeypad = document.getElementById('virtualKeypad');
const plotContainer = document.getElementById('plotContainer');
const stepControls = document.getElementById('stepControls');
const btnPrevStep = document.getElementById('btnPrevStep');
const btnNextStep = document.getElementById('btnNextStep');
const stepCounter = document.getElementById('stepCounter');
const explanationCard = document.getElementById('explanationCard');
const explanationTitle = document.getElementById('explanationTitle');
const explanationBody = document.getElementById('explanationBody');
const btnToggleExpand = document.getElementById('btnToggleExpand');
const compSettingsPanel = document.getElementById('compSettingsPanel');
const compTypeSelect = document.getElementById('compTypeSelect');
const inputDesiredPM = document.getElementById('inputDesiredPM');
const inputDesiredKv = document.getElementById('inputDesiredKv');
const btnCalculateComp = document.getElementById('btnCalculateComp');

// Controles Avanzados de Gráfica
const btnFullscreen = document.getElementById('btnFullscreen');
const btnFocusCrit = document.getElementById('btnFocusCrit');
const btnModePan = document.getElementById('btnModePan');
const btnModeZoom = document.getElementById('btnModeZoom');
const btnResetView = document.getElementById('btnResetView');

// Modal Acerca de
const modalAbout = document.getElementById('modalAbout');
const btnAbout = document.getElementById('btnAbout');
const btnCloseAbout = document.getElementById('btnCloseAbout');
const btnDismissAbout = document.getElementById('btnDismissAbout');
const navButtons = document.querySelectorAll('.bottom-nav .nav-item');

// Modal Solución Completa
const btnFullSolution = document.getElementById('btnFullSolution');
const modalSolution = document.getElementById('modalSolution');
const btnCloseSolution = document.getElementById('btnCloseSolution');
const btnDismissSolution = document.getElementById('btnDismissSolution');
const solutionModalContent = document.getElementById('solutionModalContent');

// Estado del modo de interacción en la gráfica (por defecto: 'pan' para mover con el dedo)
let currentDragMode = 'pan';

// Configuración común de Plotly para tema Dark y móvil
const darkLayoutCommon = {
  paper_bgcolor: '#222233',
  plot_bgcolor: '#1c1c2e',
  margin: { t: 25, b: 35, l: 45, r: 20 },
  font: { color: '#f1f5f9', size: 10 },
  showlegend: true,
  legend: { orientation: 'h', y: 1.14, x: 0, font: { size: 9 } },
  dragmode: 'pan'
};

const plotlyConfig = {
  responsive: true,
  displayModeBar: false,
  scrollZoom: true
};

// Análisis de la función ingresada
function analyzeSystem() {
  const str = tfInput.value.trim();
  if (!str) return;
  state.tfStr = str;

  try {
    state.parsedTF = parseTransferFunction(str);
    state.bodeComps = getBodeComponents(state.parsedTF.num, state.parsedTF.den, state.wList);
    state.freqResp = evaluateFreqResponse(state.parsedTF.num, state.parsedTF.den, state.wList);
    state.margins = calculateMargins(state.wList, state.freqResp.mag, state.freqResp.phase);
    state.stepRespOrig = simulateStepResponse(state.parsedTF.num, state.parsedTF.den);
    
    // Auto diseñar un compensador base si no existe
    state.compResult = designCompensator('Lead-Lag', state.parsedTF.num, state.parsedTF.den, 45);
    state.stepRespComp = simulateStepResponse(state.compResult.totalNum, state.compResult.totalDen);

    state.step = 0;
    renderCurrentTab();
  } catch (err) {
    alert("Error al procesar la ecuación:\n" + err.message);
  }
}

// Renderizado según la pestaña activa
function renderCurrentTab() {
  if (!state.parsedTF) return;

  // Actualizar visibilidad del botón 'Centrar en -1' sólo en Nyquist
  if (state.currentTab === 'nyquist') {
    btnFocusCrit.classList.remove('hidden');
  } else {
    btnFocusCrit.classList.add('hidden');
  }

  // Ajustar visibilidad de paneles auxiliares
  if (state.currentTab === 'compensator') {
    compSettingsPanel.classList.remove('hidden');
    stepControls.classList.add('hidden');
  } else if (state.currentTab === 'step') {
    compSettingsPanel.classList.add('hidden');
    stepControls.classList.add('hidden');
  } else {
    compSettingsPanel.classList.add('hidden');
    stepControls.classList.remove('hidden');
  }

  // Ajustar altura para Bode (dos subplots apilados)
  if (state.currentTab === 'bode') {
    plotContainer.classList.add('bode-plot');
  } else {
    plotContainer.classList.remove('bode-plot');
  }

  switch (state.currentTab) {
    case 'bode':
      renderBodePlot();
      break;
    case 'nyquist':
      renderNyquistPlot();
      break;
    case 'locus':
      renderLocusPlot();
      break;
    case 'compensator':
      renderCompensatorPlot();
      break;
    case 'step':
      renderStepPlot();
      break;
  }
}

// ==========================================
// 1. DIAGRAMA DE BODE (2 SUBPLOTS: MAGNITUD & FASE)
// ==========================================
function renderBodePlot() {
  const comps = state.bodeComps.components;
  // Pasos: 0 (Factorización y Canónica), 1..N (Factores individuales), N+1 (Asíntota Total), N+2 (Real vs Asíntota), N+3 (Márgenes)
  const totalBodeSteps = comps.length + 3;
  state.maxSteps = totalBodeSteps;

  stepCounter.textContent = `Paso ${state.step} de ${state.maxSteps}`;
  btnPrevStep.disabled = state.step === 0;
  btnNextStep.disabled = state.step === state.maxSteps;

  const traces = [];
  let title = "Diagrama de Bode";
  let desc = "";

  const wMin = state.wList[0];
  const wMax = state.wList[state.wList.length - 1];

  // Línea 0 dB siempre presente en el Subplot 1 (Magnitud)
  traces.push({
    x: [wMin, wMax],
    y: [0, 0],
    xaxis: 'x',
    yaxis: 'y',
    name: '0 dB',
    mode: 'lines',
    line: { color: '#94a3b8', dash: 'dash', width: 1.2 }
  });

  // Línea -180° siempre presente en el Subplot 2 (Fase)
  traces.push({
    x: [wMin, wMax],
    y: [-180, -180],
    xaxis: 'x2',
    yaxis: 'y2',
    name: '-180°',
    mode: 'lines',
    line: { color: '#ef4444', dash: 'dash', width: 1.2 }
  });

  if (state.step === 0) {
    title = "Paso 0: Factorización y Conversión Canónica de Bode";
    const rootsDen = findRoots(state.parsedTF.den);
    const rootsNum = findRoots(state.parsedTF.num);
    const realP = state.bodeComps.realPoles || [];
    const kbode = state.bodeComps.k_bode;
    const kbodeDb = state.bodeComps.k_db;

    let factHtml = "";
    if (realP.length > 0) {
      factHtml += `
        <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
          <p><b>1. Extracción de constantes de tiempo del denominador:</b></p>
          ${realP.map(wc => {
            const tau = 1 / wc;
            return `<p>• Factor $(s + ${wc.toFixed(2)}) = ${wc.toFixed(2)} \\cdot \\left(1 + \\frac{s}{${wc.toFixed(2)}}\\right) = ${wc.toFixed(2)}(1 + ${tau.toFixed(3)}s)$</p>`;
          }).join('')}
          <p style="margin-top:4px; color:#cbd5e1;">Producto de constantes extraídas: <b>${realP.map(p => p.toFixed(2)).join(' × ')} = ${realP.reduce((a, b) => a * b, 1).toFixed(2)}</b></p>
        </div>
      `;
    }

    desc = `
      <p><b>Función Original en el dominio de Laplace:</b></p>
      <div style="background:#11111e; padding:6px 10px; border-radius:4px; margin:4px 0;">
        ${renderTex(`G(s) = ${state.tfStr}`, true)}
      </div>
      <p><b>Polos de Lazo Abierto ($D(s)=0$):</b></p>
      <p>• ${rootsDen.map(r => `${r.re.toFixed(2)} + ${r.im.toFixed(2)}j`).join(' ; ') || 'Ninguno'}</p>
      <p><b>Ceros de Lazo Abierto ($N(s)=0$):</b> ${rootsNum.length > 0 ? rootsNum.map(r => `${r.re.toFixed(2)} + ${r.im.toFixed(2)}j`).join(' ; ') : 'Ninguno (sin ceros finitos).'}</p>

      ${factHtml}

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>2. Cálculo de la Ganancia de Bode ($K_{Bode}$):</b></p>
        <p>Dividimos el numerador entre el producto de constantes extraídas:</p>
        <div style="margin:4px 0; text-align:center;">
          ${renderTex(`K_{Bode} = ${kbode.toFixed(3)} \\quad \\Longrightarrow \\quad 20\\log_{10}(${kbode.toFixed(3)}) = ${kbodeDb.toFixed(2)}\\text{ dB}`)}
        </div>
        <p>Esta ganancia define el valor de magnitud en baja frecuencia donde la recta corta $\\omega = 1\\text{ rad/s}$.</p>
      </div>

      <p><b>3. Factores Canónicos Identificados (${comps.length}):</b></p>
      <ul style="padding-left:16px; margin-top:4px;">
        ${comps.map((c, i) => `<li><b>Factor ${i+1}:</b> ${c.name}</li>`).join('')}
      </ul>
      <p style="color:#38bdf8; font-size:11px; margin-top:6px;">👉 Presiona <b>Siguiente &gt;&gt;</b> para ver la curva de cada factor dibujada en los subplots de Magnitud y Fase.</p>
    `;
  } else if (state.step <= comps.length) {
    const factorIdx = state.step - 1;
    const factor = comps[factorIdx];
    title = `Paso ${state.step}: ${factor.name}`;

    desc = `
      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>Descripción del Factor:</b></p>
        <p>${factor.desc}</p>
      </div>
      <p><b>Comportamiento en la Gráfica:</b></p>
      <p>• <b>Magnitud (Subplot Superior):</b> ${factor.slope !== undefined ? `Pendiente de <b>${factor.slope > 0 ? '+' : ''}${factor.slope} dB/década</b>.` : 'Curva plana constante.'}</p>
      <p>• <b>Fase (Subplot Inferior):</b> ${factor.phaseShift !== undefined ? `Aporte angular final de <b>${factor.phaseShift}°</b>.` : 'Fase constante.'}</p>
    `;

    // Asíntota individual de Magnitud (arriba)
    traces.push({
      x: state.wList,
      y: factor.mag,
      xaxis: 'x',
      yaxis: 'y',
      name: `Mag: ${factor.name}`,
      mode: 'lines',
      line: { color: '#00e5ff', width: 2.5 }
    });

    // Asíntota individual de Fase (abajo)
    traces.push({
      x: state.wList,
      y: factor.phase,
      xaxis: 'x2',
      yaxis: 'y2',
      name: `Fase: ${factor.name}`,
      mode: 'lines',
      line: { color: '#ffd700', width: 2.2 }
    });
  } else if (state.step === comps.length + 1) {
    title = `Paso ${state.step}: Suma Asintótica Total e Intervalos`;
    const intervals = state.bodeComps.intervals || [];

    desc = `
      <p>En el diagrama de Bode, multiplicar factores equivale a <b>sumar algebraicamente</b> sus pendientes en dB y sus fases en grados.</p>
      <table class="sol-table" style="margin:6px 0;">
        <thead>
          <tr>
            <th>Intervalo de Frecuencia</th>
            <th>Factores Activos</th>
            <th>Pendiente Total</th>
          </tr>
        </thead>
        <tbody>
          ${intervals.map(iv => `
            <tr>
              <td><b>${iv.label}</b></td>
              <td>${iv.activeFactor}</td>
              <td><b style="color:${iv.slope < 0 ? '#38bdf8' : (iv.slope > 0 ? '#f59e0b' : '#4ade80')}">${iv.slope > 0 ? '+' : ''}${iv.slope} dB/dec</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="color:#cbd5e1; font-size:11px;">Observa cómo los quiebres en la gráfica de magnitud ocurren exactamente en las frecuencias de corte.</p>
    `;

    traces.push({
      x: state.wList,
      y: state.bodeComps.totalAsympMag,
      xaxis: 'x',
      yaxis: 'y',
      name: 'Asíntota Total (dB)',
      mode: 'lines',
      line: { color: '#38bdf8', width: 2.5 }
    });

    traces.push({
      x: state.wList,
      y: state.bodeComps.totalAsympPhase,
      xaxis: 'x2',
      yaxis: 'y2',
      name: 'Asíntota Fase (°)',
      mode: 'lines',
      line: { color: '#facc15', width: 2.2, dash: 'dash' }
    });
  } else if (state.step === comps.length + 2) {
    title = `Paso ${state.step}: Curva Real vs. Aproximación Asintótica`;
    desc = `
      <div style="display:flex; gap:12px; margin-bottom:6px;">
        <span style="color:#00e5ff; font-weight:bold;">— Curva Real Exacta</span>
        <span style="color:#94a3b8; font-weight:bold;">- - Asíntota Lineal</span>
      </div>
      <p><b>Comparación Asintótica vs Real:</b></p>
      <p>• <b>Magnitud:</b> Cerca de cada frecuencia de corte $\\omega_c$, la curva real se redondea suavemente (para un polo simple, la curva real pasa <b>3 dB por debajo</b> de la esquina asintótica).</p>
      <p>• <b>Fase:</b> La curva real transiciona continuamente entre 0°, -45° y -90° por polo sin esquinas bruscas.</p>
    `;

    // Asíntota (gris)
    traces.push({
      x: state.wList,
      y: state.bodeComps.totalAsympMag,
      xaxis: 'x',
      yaxis: 'y',
      name: 'Asíntota Mag',
      mode: 'lines',
      line: { color: '#64748b', dash: 'dash', width: 1.5 }
    });
    // Curva Real Mag (cian)
    traces.push({
      x: state.wList,
      y: state.freqResp.mag,
      xaxis: 'x',
      yaxis: 'y',
      name: 'Curva Real (dB)',
      mode: 'lines',
      line: { color: '#00e5ff', width: 2.5 }
    });

    // Asíntota Fase (gris)
    traces.push({
      x: state.wList,
      y: state.bodeComps.totalAsympPhase,
      xaxis: 'x2',
      yaxis: 'y2',
      name: 'Asíntota Fase',
      mode: 'lines',
      line: { color: '#64748b', dash: 'dash', width: 1.5 }
    });
    // Curva Real Fase (amarillo)
    traces.push({
      x: state.wList,
      y: state.freqResp.phase,
      xaxis: 'x2',
      yaxis: 'y2',
      name: 'Fase Real (°)',
      mode: 'lines',
      line: { color: '#ffd700', width: 2.2 }
    });
  } else {
    title = `Paso Final: Cálculo de Cruces y Márgenes de Estabilidad`;
    const pm = state.margins.PM;
    const gm = state.margins.GM;
    const w_gc = state.margins.w_gc;
    const w_pc = state.margins.w_pc;
    const isStable = (pm === null || pm > 0) && (gm === null || gm > 0);

    desc = `
      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>1. Frecuencia de Cruce de Ganancia ($\omega_{cg}$):</b></p>
        <p>Frecuencia donde la magnitud cruza $0\\text{ dB}$ ($|G(j\\omega)| = 1$):</p>
        <p>• $\\omega_{cg} = <b>${w_gc ? w_gc.toFixed(3) + ' rad/s' : 'No cruza 0 dB'}</b></p>
        <p><b>Margen de Fase (MF):</b> Distancia angular a $-180^\\circ$ en $\\omega_{cg}$:</p>
        <div style="margin:2px 0;">
          ${renderTex(`MF = 180^\\circ + \\angle G(j\\omega_{cg}) = ${pm !== null ? pm.toFixed(2) + '^\\circ' : '\\infty'}`)}
        </div>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>2. Frecuencia de Cruce de Fase ($\omega_{cp}$):</b></p>
        <p>Frecuencia donde la fase cruza $-180^\\circ$:</p>
        <p>• $\\omega_{cp} = <b>${w_pc ? w_pc.toFixed(3) + ' rad/s' : 'No cruza -180°'}</b></p>
        <p><b>Margen de Ganancia (MG):</b> Atenuación por debajo de $0\\text{ dB}$ en $\\omega_{cp}$:</p>
        <div style="margin:2px 0;">
          ${renderTex(`MG = -20\\log_{10}|G(j\\omega_{cp})| = ${gm !== null ? gm.toFixed(2) + '\\text{ dB}' : '\\infty'}`)}
        </div>
      </div>

      <p><b>Veredicto de Estabilidad en Lazo Cerrado:</b></p>
      <p class="badge ${isStable ? 'badge-success' : 'badge-danger'}">${isStable ? '✅ Lazo Cerrado ESTABLE (MF > 0 y MG > 0)' : '❌ Lazo Cerrado INESTABLE o MARGINAL'}</p>
      <p style="color:#94a3b8; font-size:11px; margin-top:4px;">💡 Un Margen de Fase entre 45° y 60° proporciona una respuesta transitoria rápida con bajo sobreimpulso.</p>
    `;

    // Curvas reales
    traces.push({
      x: state.wList,
      y: state.freqResp.mag,
      xaxis: 'x',
      yaxis: 'y',
      name: 'Magnitud (dB)',
      mode: 'lines',
      line: { color: '#00e5ff', width: 2.2 }
    });
    traces.push({
      x: state.wList,
      y: state.freqResp.phase,
      xaxis: 'x2',
      yaxis: 'y2',
      name: 'Fase (°)',
      mode: 'lines',
      line: { color: '#ffd700', width: 2.2 }
    });

    // Líneas verticales indicadoras de cruce
    if (w_gc) {
      traces.push({
        x: [w_gc, w_gc],
        y: [-60, 60],
        xaxis: 'x',
        yaxis: 'y',
        mode: 'lines',
        line: { color: '#38bdf8', dash: 'dot', width: 1.5 },
        name: `ω_cg = ${w_gc.toFixed(2)}`
      });
      traces.push({
        x: [w_gc, w_gc],
        y: [-270, 90],
        xaxis: 'x2',
        yaxis: 'y2',
        mode: 'lines',
        line: { color: '#38bdf8', dash: 'dot', width: 1.5 },
        showlegend: false
      });
    }

    if (w_pc) {
      traces.push({
        x: [w_pc, w_pc],
        y: [-60, 60],
        xaxis: 'x',
        yaxis: 'y',
        mode: 'lines',
        line: { color: '#f59e0b', dash: 'dot', width: 1.5 },
        name: `ω_cp = ${w_pc.toFixed(2)}`
      });
      traces.push({
        x: [w_pc, w_pc],
        y: [-270, 90],
        xaxis: 'x2',
        yaxis: 'y2',
        mode: 'lines',
        line: { color: '#f59e0b', dash: 'dot', width: 1.5 },
        showlegend: false
      });
    }
  }

  explanationTitle.textContent = title;
  explanationBody.innerHTML = desc;

  const layout = {
    ...darkLayoutCommon,
    dragmode: currentDragMode,
    margin: { t: 15, b: 35, l: 45, r: 15 },
    xaxis: {
      type: 'log',
      anchor: 'y',
      showticklabels: false,
      gridcolor: '#3d3d58',
      gridwidth: 1,
      minor: { showgrid: true, gridcolor: '#26263a', gridwidth: 0.8 }
    },
    yaxis: {
      domain: [0.55, 1.0],
      title: 'Magnitud (dB)',
      gridcolor: '#38384f',
      gridwidth: 1,
      zeroline: true,
      zerolinecolor: '#ffffff',
      zerolinewidth: 1
    },
    xaxis2: {
      type: 'log',
      anchor: 'y2',
      title: 'Frecuencia ω (rad/s)',
      gridcolor: '#3d3d58',
      gridwidth: 1,
      matches: 'x',
      minor: { showgrid: true, gridcolor: '#26263a', gridwidth: 0.8 }
    },
    yaxis2: {
      domain: [0.0, 0.45],
      title: 'Fase (grados)',
      gridcolor: '#38384f',
      gridwidth: 1,
      zeroline: true,
      zerolinecolor: '#ffffff',
      zerolinewidth: 1
    }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// ==========================================
// 2. DIAGRAMA DE NYQUIST (CON SMART VIEWPORT)
// ==========================================
function renderNyquistPlot() {
  state.maxSteps = 4;
  stepCounter.textContent = `Paso ${state.step} de ${state.maxSteps}`;
  btnPrevStep.disabled = state.step === 0;
  btnNextStep.disabled = state.step === state.maxSteps;

  const traces = [];
  let title = "Diagrama de Nyquist";
  let desc = "";

  // Filtro inteligente para evitar divergencia de polos en origen
  const rawRe = state.freqResp.real;
  const rawIm = state.freqResp.imag;
  const clampedRe = [];
  const clampedIm = [];
  for (let i = 0; i < rawRe.length; i++) {
    if (Math.abs(rawRe[i]) < 40 && Math.abs(rawIm[i]) < 40) {
      clampedRe.push(rawRe[i]);
      clampedIm.push(rawIm[i]);
    }
  }

  // Punto crítico -1+j0 (siempre visible con marcador claro)
  traces.push({
    x: [-1],
    y: [0],
    mode: 'markers+text',
    type: 'scatter',
    name: 'Punto -1+j0',
    text: ['-1+j0'],
    textposition: 'top left',
    marker: { color: '#ef4444', size: 11, symbol: 'x', line: { width: 3 } }
  });

  if (state.step === 0) {
    title = "Paso 0: Polos de Lazo Abierto y Preparación";
    const denRoots = findRoots(state.parsedTF.den);
    const P = denRoots.filter(r => r.re > 1e-5).length;
    desc = `
      <p>El criterio de Nyquist relaciona los rodeos al punto <b>-1+j0</b> con la estabilidad:</p>
      <p><b>Z = N + P</b></p>
      <p>• <b>P:</b> Número de polos inestables a lazo abierto (Re &gt; 0) = <b style="color:#00e5ff">${P}</b>.</p>
      <p>• <b>N:</b> Número de rodeos netos al punto crítico -1.</p>
      <p>• <b>Z:</b> Polos inestables a lazo cerrado (debe ser 0 para ser estable).</p>
    `;
  }

  if (state.step >= 1) {
    // Curva w > 0
    traces.push({
      x: clampedRe,
      y: clampedIm,
      mode: 'lines',
      type: 'scatter',
      name: 'Curva ω > 0',
      line: { color: '#00e5ff', width: 2.4 }
    });

    // Flecha DORADA direccional
    if (clampedRe.length > 20) {
      const mid = Math.floor(clampedRe.length / 2);
      traces.push({
        x: [clampedRe[mid]],
        y: [clampedIm[mid]],
        mode: 'markers',
        type: 'scatter',
        name: 'Sentido ω (>0)',
        marker: { color: '#ffd700', size: 10, symbol: 'triangle-down' }
      });
    }

    if (state.step === 1) {
      title = "Paso 1: Trazo Polar para Frecuencias Positivas (ω > 0)";
      desc = `
        <p>Muestra la trayectoria en el plano complejo cuando la frecuencia ω va desde 0 hasta +∞.</p>
        <p>La flecha <b style="color:#ffd700">DORADA</b> indica hacia dónde avanza la curva al crecer ω.</p>
      `;
    }
  }

  if (state.step >= 2) {
    // Reflejo w < 0
    traces.push({
      x: clampedRe,
      y: clampedIm.map(v => -v),
      mode: 'lines',
      type: 'scatter',
      name: 'Reflejo ω < 0',
      line: { color: '#00e5ff', dash: 'dash', width: 1.8 }
    });

    if (clampedRe.length > 20) {
      const mid = Math.floor(clampedRe.length / 2);
      traces.push({
        x: [clampedRe[mid]],
        y: [-clampedIm[mid]],
        mode: 'markers',
        type: 'scatter',
        name: 'Sentido ω (<0)',
        marker: { color: '#ffa726', size: 9, symbol: 'triangle-up' }
      });
    }

    if (state.step === 2) {
      title = "Paso 2: Reflejo para Frecuencias Negativas (ω < 0)";
      desc = `
        <p>Por ser una función real de transferencia, G(-jω) es el conjugado complejo de G(jω).</p>
        <p>Gráficamente es la imagen espejo respecto al eje horizontal real.</p>
      `;
    }
  }

  if (state.step >= 3) {
    // Círculo unitario
    const circleX = [], circleY = [];
    for (let th = 0; th <= 2 * Math.PI; th += 0.05) {
      circleX.push(Math.cos(th));
      circleY.push(Math.sin(th));
    }
    traces.push({
      x: circleX,
      y: circleY,
      mode: 'lines',
      type: 'scatter',
      name: 'Círculo Unitario (|GH|=1)',
      line: { color: '#64748b', dash: 'dot', width: 1 }
    });

    if (state.step === 3) {
      title = "Paso 3: Círculo Unitario y Márgenes";
      desc = `
        <p>El círculo punteado tiene radio = 1.0.</p>
        <p>El cruce de la curva con este círculo determina el <b>Margen de Fase</b>.</p>
        <p>El cruce con el eje real negativo determina el <b>Margen de Ganancia</b>.</p>
      `;
    }
  }

  if (state.step >= 4) {
    title = "Paso Final: Criterio de Estabilidad Absoluta";
    const denRoots = findRoots(state.parsedTF.den);
    const P = denRoots.filter(r => r.re > 1e-5).length;
    const N = 0; // Para funciones típicas estables
    const Z = N + P;

    desc = `
      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>Polos en Semi-plano Derecho (P):</b> ${P}</p>
        <p><b>Rodeos al punto -1+j0 (N):</b> ${N}</p>
        <p><b>Polos inestables a lazo cerrado (Z = N + P):</b> <b style="color:${Z === 0 ? '#4ade80' : '#f87171'}">${Z}</b></p>
      </div>
      <p class="badge ${Z === 0 ? 'badge-success' : 'badge-danger'}">${Z === 0 ? '✅ Sistema ESTABLE a lazo cerrado' : '❌ Sistema INESTABLE a lazo cerrado'}</p>
      <p style="color:#94a3b8; font-size:11px; margin-top:4px;">Usa el botón <b>🎯 Centrar en -1</b> para hacer zoom directo sobre el punto crítico.</p>
    `;
  }

  explanationTitle.textContent = title;
  explanationBody.innerHTML = desc;

  // Viewport inteligente enfocado en el rango relevante para evitar aplanamiento
  const layout = {
    ...darkLayoutCommon,
    xaxis: { title: 'Parte Real', gridcolor: '#33334d', zerolinecolor: '#ffffff', range: [-2.4, 1.4] },
    yaxis: { title: 'Parte Imaginaria', gridcolor: '#33334d', zerolinecolor: '#ffffff', range: [-1.8, 1.8] }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// ==========================================
// 3. LUGAR DE LAS RAÍCES (ROOT LOCUS)
// ==========================================
function renderLocusPlot() {
  state.maxSteps = 2;
  stepCounter.textContent = `Paso ${state.step} de ${state.maxSteps}`;
  btnPrevStep.disabled = state.step === 0;
  btnNextStep.disabled = state.step === state.maxSteps;

  const poles = findRoots(state.parsedTF.den);
  const zeros = findRoots(state.parsedTF.num);

  const traces = [];

  // Polos de lazo abierto (X)
  traces.push({
    x: poles.map(p => p.re),
    y: poles.map(p => p.im),
    mode: 'markers',
    type: 'scatter',
    name: 'Polos (K=0)',
    marker: { color: '#ef4444', size: 10, symbol: 'x', line: { width: 3 } }
  });

  // Ceros de lazo abierto (O)
  if (zeros.length > 0) {
    traces.push({
      x: zeros.map(z => z.re),
      y: zeros.map(z => z.im),
      mode: 'markers',
      type: 'scatter',
      name: 'Ceros (K=∞)',
      marker: { color: '#3b82f6', size: 9, symbol: 'circle-open', line: { width: 2 } }
    });
  }

  // Simulación de ramas para K variante
  const kVals = [];
  for (let exp = -2; exp <= 4; exp += 0.05) kVals.push(Math.pow(10, exp));

  const branchesX = Array.from({ length: poles.length }, () => []);
  const branchesY = Array.from({ length: poles.length }, () => []);

  for (let K of kVals) {
    const kNum = state.parsedTF.num.map(c => c * K);
    const clPoly = polyAdd(state.parsedTF.den, kNum);
    const clRoots = findRoots(clPoly);

    for (let i = 0; i < poles.length; i++) {
      if (clRoots[i]) {
        branchesX[i].push(clRoots[i].re);
        branchesY[i].push(clRoots[i].im);
      }
    }
  }

  for (let i = 0; i < poles.length; i++) {
    traces.push({
      x: branchesX[i],
      y: branchesY[i],
      mode: 'lines',
      type: 'scatter',
      name: `Rama ${i + 1}`,
      line: { width: 2 }
    });
  }

  // Centroide y asíntotas
  const n = poles.length;
  const m = zeros.length;
  const numAsymptotes = n - m;
  let sigmaA = 0;
  if (numAsymptotes > 0) {
    const sumP = poles.reduce((acc, p) => acc + p.re, 0);
    const sumZ = zeros.reduce((acc, z) => acc + z.re, 0);
    sigmaA = (sumP - sumZ) / numAsymptotes;
  }

  if (state.step === 0) {
    explanationTitle.textContent = "Paso 0: Polos, Ceros y Reglas del Lugar de Raíces";
    explanationBody.innerHTML = `
      <p><b>Número de Polos (n):</b> ${n} | <b>Número de Ceros (m):</b> ${m}</p>
      <p><b>Número de Ramas hacia el infinito (n - m):</b> ${numAsymptotes}</p>
      <p><b>Centroide de Asíntotas:</b> σ_a = <b>${sigmaA.toFixed(2)}</b></p>
      <p>Las ramas nacen en los polos (K=0) y mueren en los ceros o se van a ∞ a lo largo de las asíntotas.</p>
    `;
  } else {
    explanationTitle.textContent = "Paso Final: Análisis de Estabilidad con Ganancia K";
    explanationBody.innerHTML = `
      <p>El eje imaginario (x = 0) marca la frontera entre estabilidad e inestabilidad:</p>
      <p>• <b>Izquierda (Re &lt; 0):</b> Polos estables.</p>
      <p>• <b>Derecha (Re &gt; 0):</b> Polos inestables.</p>
      <p>Si todas las ramas siempre van hacia la izquierda, el sistema es estable para <b>cualquier ganancia positiva K</b>.</p>
    `;
  }

  const layout = {
    ...darkLayoutCommon,
    xaxis: { title: 'Eje Real (σ)', gridcolor: '#33334d', zerolinecolor: '#ffffff' },
    yaxis: { title: 'Eje Imag (jω)', gridcolor: '#33334d', zerolinecolor: '#ffffff' }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// ==========================================
// 4. COMPENSADORES (LEAD / LAG / LEAD-LAG)
// ==========================================
function renderCompensatorPlot() {
  if (!state.compResult) return;

  const res = state.compResult;
  const traces = [
    {
      x: state.wList,
      y: res.baseResp.mag,
      name: 'Original G(s)',
      line: { color: '#94a3b8', dash: 'dash', width: 1.8 }
    },
    {
      x: state.wList,
      y: res.compResp.mag,
      name: 'Compensado G·C(s)',
      line: { color: '#00e5ff', width: 2.5 }
    },
    {
      x: [state.wList[0], state.wList[state.wList.length - 1]],
      y: [0, 0],
      name: '0 dB',
      line: { color: '#ffffff', width: 0.8, dash: 'dot' }
    }
  ];

  explanationTitle.textContent = `Diseño de Compensador ${compTypeSelect.value}`;
  explanationBody.innerHTML = `
    <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:8px;">
      <div><b>Márgenes Originales:</b> MF = ${res.baseMargins.PM ? res.baseMargins.PM.toFixed(1) + '°' : 'Infinito'}</div>
      <div><b>Márgenes Compensados:</b> MF = <b style="color:#00e5ff">${res.compMargins.PM ? res.compMargins.PM.toFixed(1) + '°' : 'Infinito'}</b></div>
    </div>
    <div style="line-height:1.6;">
      ${res.explanation.map(exp => `<p>• ${exp}</p>`).join('')}
    </div>
    <p style="color:#a78bfa; font-size:11px; margin-top:6px;">💡 Puedes ir a la pestaña <b>Temporal</b> para comparar la respuesta al escalón antes y después.</p>
  `;

  const layout = {
    ...darkLayoutCommon,
    xaxis: { type: 'log', title: 'Frecuencia ω (rad/s)', gridcolor: '#33334d' },
    yaxis: { title: 'Magnitud (dB)', gridcolor: '#33334d' }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// ==========================================
// 5. RESPUESTA TEMPORAL AL ESCALÓN
// ==========================================
function renderStepPlot() {
  if (!state.stepRespOrig) return;

  const orig = state.stepRespOrig;
  const comp = state.stepRespComp;

  const traces = [
    {
      x: [0, orig.t[orig.t.length - 1]],
      y: [1, 1],
      name: 'Entrada r(t)=1',
      line: { color: '#ffffff', dash: 'dash', width: 1 }
    },
    {
      x: orig.t,
      y: orig.y,
      name: 'Lazo Cerrado Original',
      line: { color: '#ffa726', width: 2.2 }
    }
  ];

  if (comp) {
    traces.push({
      x: comp.t,
      y: comp.y,
      name: 'Lazo Cerrado Compensado',
      line: { color: '#00e5ff', width: 2.5 }
    });
  }

  const mo = orig.metrics;
  const mc = comp ? comp.metrics : null;

  explanationTitle.textContent = "Respuesta Temporal al Escalón Unitario";
  let bodyHtml = `
    <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:8px;">
      <p><b>Original:</b> Tr = ${mo.tr ? mo.tr.toFixed(3) + 's' : 'N/A'} | Ts(2%) = ${mo.ts ? mo.ts.toFixed(3) + 's' : 'N/A'} | Mp = ${mo.mpPercent.toFixed(1)}% | Ess = ${mo.ess.toFixed(3)}</p>
    </div>
  `;
  if (mc) {
    bodyHtml += `
      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:8px;">
        <p><b>Compensado:</b> Tr = ${mc.tr ? mc.tr.toFixed(3) + 's' : 'N/A'} | Ts(2%) = ${mc.ts ? mc.ts.toFixed(3) + 's' : 'N/A'} | Mp = ${mc.mpPercent.toFixed(1)}% | Ess = ${mc.ess.toFixed(3)}</p>
      </div>
      <div style="line-height:1.5;">
        ${mc.ts < mo.ts ? '✅ <b>Mayor rapidez:</b> Redujo el tiempo de establecimiento.<br/>' : ''}
        ${mc.mpPercent < mo.mpPercent ? '✅ <b>Mayor estabilidad:</b> Redujo las oscilaciones y el sobreimpulso.<br/>' : ''}
        ${mc.ess < mo.ess ? '✅ <b>Mayor precisión:</b> Menor error estacionario.' : ''}
      </div>
    `;
  }
  explanationBody.innerHTML = bodyHtml;

  const layout = {
    ...darkLayoutCommon,
    xaxis: { title: 'Tiempo t (segundos)', gridcolor: '#33334d' },
    yaxis: { title: 'Amplitud y(t)', gridcolor: '#33334d' }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// ==========================================
// CONTROLES AVANZADOS DE NAVEGACIÓN Y ZOOM
// ==========================================

// Modo Pantalla Completa
btnFullscreen.addEventListener('click', () => {
  state.isFullscreen = !state.isFullscreen;
  if (state.isFullscreen) {
    appElement.classList.add('fullscreen-mode');
    btnFullscreen.textContent = '✕ Salir Pantalla';
  } else {
    appElement.classList.remove('fullscreen-mode');
    btnFullscreen.textContent = '⛶ Pantalla Completa';
  }
  setTimeout(() => {
    Plotly.Plots.resize(plotContainer);
  }, 100);
});

// Centrar en -1 (Nyquist)
btnFocusCrit.addEventListener('click', () => {
  Plotly.relayout(plotContainer, {
    'xaxis.range': [-2.2, 1.2],
    'yaxis.range': [-1.6, 1.6]
  });
});
// Función auxiliar para renderizar KaTeX seguro
function renderTex(tex, display = false) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false });
  } catch (e) {
    return `<code>${tex}</code>`;
  }
}

// Generador de la solución matemática completa paso a paso
function populateFullSolutionModal() {
  if (!state.parsedTF) return;

  const num = state.parsedTF.num;
  const den = state.parsedTF.den;
  const poles = findRoots(den);
  const zeros = findRoots(num);
  const comps = state.bodeComps ? state.bodeComps.components : [];
  const margins = state.margins;
  const kbode = state.bodeComps ? state.bodeComps.k_bode : 1;
  const kbodeDb = state.bodeComps ? state.bodeComps.k_db : 0;
  const realP = state.bodeComps ? state.bodeComps.realPoles : [];
  const realZ = state.bodeComps ? state.bodeComps.realZeros : [];
  const originP = state.bodeComps ? state.bodeComps.originPoles : 0;
  const originZ = state.bodeComps ? state.bodeComps.originZeros : 0;
  const intervals = state.bodeComps ? state.bodeComps.intervals : [];

  let html = `
    <!-- 1. Función Original y Polos/Ceros -->
    <div class="sol-section">
      <h3>📐 1. Función de Transferencia y Raíces</h3>
      <p>Ecuación en el dominio de Laplace ingresada por el usuario:</p>
      <div class="sol-formula-box">
        ${renderTex(`G(s) = ${state.tfStr}`, true)}
      </div>

      <p><b>A. Polos de Lazo Abierto ($D(s) = 0$):</b></p>
      <p>Valores de $s$ que anulan el denominador y determinan los modos naturales:</p>
      <div class="sol-formula-box">
        ${poles.map((p, i) => {
          let tipo = "Polo real simple";
          if (Math.abs(p.re) < 1e-5 && Math.abs(p.im) < 1e-5) tipo = "Polo en el origen (Integrador)";
          else if (Math.abs(p.im) > 1e-5) tipo = "Polo complejo conjugado";
          return `<div>• ${renderTex(`p_{${i+1}} = ${p.re.toFixed(3)}${p.im >= 0 ? '+' : ''}${p.im.toFixed(3)}j`)} &nbsp; <small style="color:#94a3b8;">(${tipo})</small></div>`;
        }).join('')}
      </div>

      <p><b>B. Ceros de Lazo Abierto ($N(s) = 0$):</b></p>
      <p>Valores de $s$ que anulan la salida del sistema:</p>
      <div class="sol-formula-box">
        ${zeros.length > 0 ? zeros.map((z, i) => `<div>• ${renderTex(`z_{${i+1}} = ${z.re.toFixed(3)}${z.im >= 0 ? '+' : ''}${z.im.toFixed(3)}j`)}</div>`).join('') : '<i>Ninguno (el numerador es una ganancia constante).</i>'}
      </div>
    </div>

    <!-- 2. Conversión a la Forma Canónica de Bode Paso a Paso -->
    <div class="sol-section">
      <h3>📊 2. Conversión a la Forma Canónica de Bode (Paso a Paso)</h3>
      <p>Para construir el diagrama de Bode, se expresa cada factor en la forma de <b>constante de tiempo unitaria</b> $(1 + s\tau)$ o $(1 + s/\omega_c)$:</p>
      
      <div style="background:#11111e; padding:8px 12px; border-radius:6px; margin:6px 0;">
        <p><b>Paso A: Extracción de términos constantes</b></p>
        ${realP.map(wc => `<p style="margin:4px 0;">• $(s + ${wc.toFixed(2)}) = ${wc.toFixed(2)} \\cdot \\left(1 + \\frac{s}{${wc.toFixed(2)}}\\right) = ${wc.toFixed(2)}(1 + ${(1/wc).toFixed(3)}s)$</p>`).join('')}
        ${realZ.map(wc => `<p style="margin:4px 0;">• $(s + ${wc.toFixed(2)}) = ${wc.toFixed(2)} \\cdot \\left(1 + \\frac{s}{${wc.toFixed(2)}}\\right) = ${wc.toFixed(2)}(1 + ${(1/wc).toFixed(3)}s)$</p>`).join('')}
      </div>

      <div style="background:#11111e; padding:8px 12px; border-radius:6px; margin:6px 0;">
        <p><b>Paso B: Cálculo formal de la Ganancia de Bode ($K_{Bode}$)</b></p>
        <p>Dividimos el término constante del numerador entre las constantes extraídas:</p>
        <div style="margin:6px 0; text-align:center;">
          ${renderTex(`K_{Bode} = \\lim_{s \\to 0} s^{${originP - originZ}} G(s) = ${kbode.toFixed(3)}`, true)}
        </div>
        <div style="margin:6px 0; text-align:center;">
          ${renderTex(`K_{dB} = 20\\log_{10}(K_{Bode}) = 20\\log_{10}(${kbode.toFixed(3)}) = ${kbodeDb.toFixed(2)}\\text{ dB}`, true)}
        </div>
        <p style="color:#a78bfa; font-size:11px;">En $\\omega = 1\\text{ rad/s}$, la prolongación de la asíntota inicial de baja frecuencia pasa exactamente por <b>${kbodeDb.toFixed(2)} dB</b>.</p>
      </div>

      <p><b>Factores Canónicos Normalizados:</b></p>
      <table class="sol-table">
        <thead>
          <tr>
            <th>Factor</th>
            <th>Frecuencia ωc</th>
            <th>Pendiente en Mag</th>
            <th>Aporte en Fase</th>
          </tr>
        </thead>
        <tbody>
          ${comps.map((c) => `
            <tr>
              <td><b>${c.name}</b></td>
              <td>${c.wc ? `${c.wc.toFixed(2)} rad/s` : '—'}</td>
              <td>${c.slope !== undefined ? `${c.slope > 0 ? '+' : ''}${c.slope} dB/dec` : '0 dB/dec'}</td>
              <td>${c.phaseShift !== undefined ? `${c.phaseShift}°` : '0°'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- 3. Trazado Asintótico por Intervalos -->
    <div class="sol-section">
      <h3>📈 3. Tabla de Pendientes por Intervalos de Frecuencia</h3>
      <p>La curva asintótica de magnitud se construye acumulando algebraicamente las pendientes al cruzar cada frecuencia de corte $\\omega_c$:</p>
      <table class="sol-table">
        <thead>
          <tr>
            <th>Rango de Frecuencia</th>
            <th>Factores que Entran en Juego</th>
            <th>Pendiente Total Resultante</th>
          </tr>
        </thead>
        <tbody>
          ${intervals.map(iv => `
            <tr>
              <td><b>${iv.label}</b></td>
              <td>${iv.activeFactor}</td>
              <td><b style="color:${iv.slope < 0 ? '#38bdf8' : (iv.slope > 0 ? '#f59e0b' : '#4ade80')}">${iv.slope > 0 ? '+' : ''}${iv.slope} dB/década</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- 4. Deducción Analítica de Cruces y Márgenes -->
    <div class="sol-section">
      <h3>🎯 4. Frecuencias de Cruce y Márgenes de Estabilidad</h3>
      
      <div style="background:#11111e; padding:8px 12px; border-radius:6px; margin-bottom:8px;">
        <p><b>A. Cruce de Ganancia ($\omega_{cg}$) y Margen de Fase (MF):</b></p>
        <p>Se calcula la frecuencia donde la magnitud real es $0\\text{ dB}$ ($|G(j\\omega)| = 1$):</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`|G(j\\omega_{cg})| = 1 \\quad \\Longrightarrow \\quad \\omega_{cg} \\approx ${margins.w_gc ? margins.w_gc.toFixed(3) : '\\infty'}\\text{ rad/s}`)}
        </div>
        <p>Evaluamos la fase en esa frecuencia:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`MF = 180^\\circ + \\angle G(j\\omega_{cg}) = ${margins.PM !== null ? margins.PM.toFixed(2) : '\\infty'}^\\circ`)}
        </div>
      </div>

      <div style="background:#11111e; padding:8px 12px; border-radius:6px; margin-bottom:8px;">
        <p><b>B. Cruce de Fase ($\omega_{cp}$) y Margen de Ganancia (MG):</b></p>
        <p>Se calcula la frecuencia donde la fase real cruza $-180^\\circ$:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`\\angle G(j\\omega_{cp}) = -180^\\circ \\quad \\Longrightarrow \\quad \\omega_{cp} \\approx ${margins.w_pc ? margins.w_pc.toFixed(3) : '\\infty'}\\text{ rad/s}`)}
        </div>
        <p>Evaluamos la magnitud atenuada en decibelios:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`MG = -20\\log_{10}|G(j\\omega_{cp})| = ${margins.GM !== null ? margins.GM.toFixed(2) : '\\infty'}\\text{ dB}`)}
        </div>
      </div>

      <p><b>Diagnóstico de Estabilidad en Lazo Cerrado:</b></p>
      <p class="badge ${(margins.PM === null || margins.PM > 0) && (margins.GM === null || margins.GM > 0) ? 'badge-success' : 'badge-danger'}">
        ${(margins.PM === null || margins.PM > 0) && (margins.GM === null || margins.GM > 0) ? '✅ SISTEMA ESTABLE (Margen de Fase y Ganancia Positivos)' : '❌ SISTEMA INESTABLE O CRÍTICO'}
      </p>
    </div>

    <!-- 5. Criterio de Estabilidad de Nyquist -->
    <div class="sol-section">
      <h3>🌀 5. Criterio de Estabilidad de Nyquist</h3>
      <p>Fórmula de Cauchy para lazo cerrado:</p>
      <div class="sol-formula-box" style="text-align:center;">
        ${renderTex('Z = N + P', true)}
      </div>
      <p>• <b>P (Polos en semiplano derecho $Re > 0$):</b> ${poles.filter(p => p.re > 1e-5).length}</p>
      <p>• <b>N (Rodeos horarios netos al punto crítico $-1+j0$):</b> 0</p>
      <p>• <b>Z (Polos inestables de lazo cerrado):</b> <b style="color:${poles.filter(p => p.re > 1e-5).length === 0 ? '#4ade80' : '#f87171'}">${poles.filter(p => p.re > 1e-5).length}</b></p>
      <p><b>Conclusión:</b> ${poles.filter(p => p.re > 1e-5).length === 0 ? '<span class="badge badge-success">ESTABLE</span> No existen raíces de lazo cerrado en el semiplano derecho.' : '<span class="badge badge-danger">INESTABLE</span> Existen raíces en el semiplano derecho.'}</p>
    </div>

    <!-- 6. Reglas del Lugar de las Raíces -->
    <div class="sol-section">
      <h3>🎯 6. Reglas del Lugar Geométrico de Raíces</h3>
      ${(() => {
        const n = poles.length;
        const m = zeros.length;
        const asymp = n - m;
        const sumP = poles.reduce((a, b) => a + b.re, 0);
        const sumZ = zeros.reduce((a, b) => a + b.re, 0);
        const sigma = asymp > 0 ? (sumP - sumZ) / asymp : 0;
        return `
          <p>• Ramas totales ($n$ polos): <b>${n}</b></p>
          <p>• Ramas que van al infinito ($n - m$): <b>${asymp}</b></p>
          <div class="sol-formula-box">
            ${renderTex(`\\sigma_a = \\frac{\\sum p_i - \\sum z_i}{n - m} = \\frac{(${sumP.toFixed(2)}) - (${sumZ.toFixed(2)})}{${asymp}} = ${sigma.toFixed(3)}`)}
          </div>
          <p>• Ángulos de las asíntotas:</p>
          <div class="sol-formula-box">
            ${asymp > 0 ? Array.from({length: asymp}, (_, k) => renderTex(`\\theta_{${k}} = \\frac{(2(${k})+1)180^\\circ}{${asymp}} = ${(((2*k+1)*180)/asymp).toFixed(1)}^\\circ`)).join(' \\quad , \\quad ') : 'No aplican asíntotas (n = m)'}
          </div>
        `;
      })()}
    </div>
  `;

  // 7. Compensador diseñado
  if (state.compResult) {
    const c = state.compResult;
    html += `
      <div class="sol-section">
        <h3>⚙️ 7. Síntesis de Compensador (${compTypeSelect.value})</h3>
        <p>Valores de diseño para cumplir con las especificaciones de margen de fase:</p>
        <div class="sol-formula-box">
          ${c.explanation.map(e => `<p style="margin:2px 0;">• ${e}</p>`).join('')}
        </div>
        <p><b>Comparativa de Desempeño en Frecuencia:</b></p>
        <p>• Margen Original: <b>${c.baseMargins.PM ? c.baseMargins.PM.toFixed(1) + '°' : 'Infinito'}</b></p>
        <p>• Margen Compensado: <b style="color:#00e5ff">${c.compMargins.PM ? c.compMargins.PM.toFixed(1) + '°' : 'Infinito'}</b></p>
      </div>
    `;
  }

  // 8. Respuesta temporal
  if (state.stepRespOrig) {
    const mo = state.stepRespOrig.metrics;
    const mc = state.stepRespComp ? state.stepRespComp.metrics : null;
    html += `
      <div class="sol-section">
        <h3>⏱️ 8. Comparativa de Respuesta Temporal (Escalón)</h3>
        <table class="sol-table">
          <thead>
            <tr>
              <th>Parámetro Temporal</th>
              <th>Sin Compensar</th>
              <th>Con Compensador</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tiempo de Subida ($t_r$)</td>
              <td>${mo.tr ? mo.tr.toFixed(3) + 's' : '—'}</td>
              <td>${mc && mc.tr ? mc.tr.toFixed(3) + 's' : '—'}</td>
            </tr>
            <tr>
              <td>Tiempo de Asentamiento ($t_s$ 2%)</td>
              <td>${mo.ts ? mo.ts.toFixed(3) + 's' : '—'}</td>
              <td>${mc && mc.ts ? mc.ts.toFixed(3) + 's' : '—'}</td>
            </tr>
            <tr>
              <td>Sobreimpulso Máximo ($M_p\\%$)</td>
              <td>${mo.mpPercent ? mo.mpPercent.toFixed(1) + '%' : '0%'}</td>
              <td>${mc && mc.mpPercent ? mc.mpPercent.toFixed(1) + '%' : '0%'}</td>
            </tr>
            <tr>
              <td>Error de Régimen ($e_{ss}$)</td>
              <td>${mo.ess ? mo.ess.toFixed(3) : '0'}</td>
              <td>${mc && mc.ess ? mc.ess.toFixed(3) : '0'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  solutionModalContent.innerHTML = html;
}

// Alternar Modo Mover con el dedo (Pan)
btnModePan.addEventListener('click', () => {
  currentDragMode = 'pan';
  darkLayoutCommon.dragmode = 'pan';
  btnModePan.classList.add('highlight');
  btnModeZoom.classList.remove('highlight');
  Plotly.relayout(plotContainer, { dragmode: 'pan' });
});

// Alternar Modo Zoom en recuadro
btnModeZoom.addEventListener('click', () => {
  currentDragMode = 'zoom';
  darkLayoutCommon.dragmode = 'zoom';
  btnModeZoom.classList.add('highlight');
  btnModePan.classList.remove('highlight');
  Plotly.relayout(plotContainer, { dragmode: 'zoom' });
});

// Modal de Solución Completa
btnFullSolution.addEventListener('click', () => {
  if (!state.parsedTF) return;
  populateFullSolutionModal();
  modalSolution.classList.remove('hidden');
});

btnCloseSolution.addEventListener('click', () => {
  modalSolution.classList.add('hidden');
});

btnDismissSolution.addEventListener('click', () => {
  modalSolution.classList.add('hidden');
});

// Reset Vista
btnResetView.addEventListener('click', () => {
  renderCurrentTab();
});

// Expandir / Contraer tarjeta de explicación
btnToggleExpand.addEventListener('click', () => {
  state.isExpandedCard = !state.isExpandedCard;
  if (state.isExpandedCard) {
    explanationCard.classList.add('expanded');
    btnToggleExpand.textContent = '🔽 Contraer';
  } else {
    explanationCard.classList.remove('expanded');
    btnToggleExpand.textContent = '📖 Expandir';
  }
});

// Botones de paso a paso
btnPrevStep.addEventListener('click', () => {
  if (state.step > 0) {
    state.step--;
    renderCurrentTab();
  }
});

btnNextStep.addEventListener('click', () => {
  if (state.step < state.maxSteps) {
    state.step++;
    renderCurrentTab();
  }
});

// Navegación de pestañas inferior
navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    navButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentTab = btn.getAttribute('data-tab');
    state.step = 0;
    renderCurrentTab();
  });
});

// Botón Analizar
btnAnalyze.addEventListener('click', analyzeSystem);
tfInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') analyzeSystem();
});

// Ejemplos Rápidos
exampleSelect.addEventListener('change', (e) => {
  const val = e.target.value;
  if (val) {
    tfInput.value = val;
    analyzeSystem();
  }
});

// Teclado virtual
btnToggleKeypad.addEventListener('click', () => {
  virtualKeypad.classList.toggle('hidden');
});

document.querySelectorAll('.key-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-key');
    if (key === 'clear') {
      tfInput.value = '';
    } else if (key === 'back') {
      tfInput.value = tfInput.value.slice(0, -1);
    } else if (key === 'pi') {
      tfInput.value += 'pi';
    } else if (key === '1/s') {
      tfInput.value += '(1/s)';
    } else if (key === '1/s^2') {
      tfInput.value += '(1/s^2)';
    } else {
      tfInput.value += key;
    }
  });
});

// Botón Diseñar Compensador
btnCalculateComp.addEventListener('click', () => {
  const type = compTypeSelect.value;
  const pm = parseFloat(inputDesiredPM.value) || 45;
  const kv = parseFloat(inputDesiredKv.value) || null;

  try {
    state.compResult = designCompensator(type, state.parsedTF.num, state.parsedTF.den, pm, kv);
    state.stepRespComp = simulateStepResponse(state.compResult.totalNum, state.compResult.totalDen);
    renderCompensatorPlot();
  } catch (err) {
    alert("Error al diseñar compensador: " + err.message);
  }
});

// Modal Acerca de
btnAbout.addEventListener('click', () => modalAbout.classList.remove('hidden'));
btnCloseAbout.addEventListener('click', () => modalAbout.classList.add('hidden'));
btnDismissAbout.addEventListener('click', () => modalAbout.classList.add('hidden'));

// Iniciar con el ejemplo por defecto
analyzeSystem();
