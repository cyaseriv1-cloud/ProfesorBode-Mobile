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
// 1. DIAGRAMA DE BODE (FACTOR POR FACTOR)
// ==========================================
function renderBodePlot() {
  const comps = state.bodeComps.components;
  // Pasos: 0 (Análisis inicial), 1..N (Factores individuales), N+1 (Asíntota Total), N+2 (Real vs Asíntota), N+3 (Márgenes)
  const totalBodeSteps = comps.length + 3;
  state.maxSteps = totalBodeSteps;

  stepCounter.textContent = `Paso ${state.step} de ${state.maxSteps}`;
  btnPrevStep.disabled = state.step === 0;
  btnNextStep.disabled = state.step === state.maxSteps;

  const traces = [];
  let title = "Diagrama de Bode";
  let desc = "";

  if (state.step === 0) {
    title = "Paso 0: Análisis Inicial de Factores";
    const rootsDen = findRoots(state.parsedTF.den);
    const rootsNum = findRoots(state.parsedTF.num);
    desc = `
      <p><b>Función Original:</b> <code>${state.tfStr}</code></p>
      <p><b>Polos de Lazo Abierto:</b> ${rootsDen.map(r => `${r.re.toFixed(2)} + j${r.im.toFixed(2)}`).join(' ; ') || 'Ninguno'}</p>
      <p><b>Ceros de Lazo Abierto:</b> ${rootsNum.map(r => `${r.re.toFixed(2)} + j${r.im.toFixed(2)}`).join(' ; ') || 'Ninguno'}</p>
      <p><b>Factores identificados (${comps.length}):</b></p>
      <ul style="padding-left:16px; margin-top:4px;">
        ${comps.map((c, i) => `<li><b>Factor ${i+1}:</b> ${c.name}</li>`).join('')}
      </ul>
    `;
    // Gráfica de previsualización 0 dB
    traces.push({
      x: [state.wList[0], state.wList[state.wList.length - 1]],
      y: [0, 0],
      name: 'Eje 0 dB',
      line: { color: '#ffffff', dash: 'dash', width: 1 }
    });
  } else if (state.step <= comps.length) {
    // Paso de Factor Individual
    const factorIdx = state.step - 1;
    const factor = comps[factorIdx];
    title = `Paso ${state.step}: ${factor.name}`;
    desc = `
      <p><b>Efecto del factor en Magnitud y Fase:</b></p>
      <p>${factor.desc}</p>
      <p style="color:#a78bfa; margin-top:4px;"><b>Asíntota:</b> Traza recta que aproxima el comportamiento en alta y baja frecuencia.</p>
    `;

    // Asíntota individual de Magnitud
    traces.push({
      x: state.wList,
      y: factor.mag,
      name: `Mag: ${factor.name}`,
      line: { color: '#00e5ff', width: 2.5 }
    });
    // Asíntota individual de Fase
    traces.push({
      x: state.wList,
      y: factor.phase,
      name: `Fase: ${factor.name}`,
      yaxis: 'y2',
      line: { color: '#ffd700', width: 2, dash: 'dot' }
    });
  } else if (state.step === comps.length + 1) {
    // Asíntota Total Acumulada
    title = `Paso ${state.step}: Trazado Asintótico Total`;
    desc = `
      <p>Se suman algebraicamente las contribuciones en dB de todos los factores para obtener la <b>asíntota total</b>.</p>
      <p>Observa cómo los quiebres ocurren en las frecuencias de corte de los polos y ceros.</p>
    `;
    traces.push({
      x: state.wList,
      y: state.bodeComps.totalAsympMag,
      name: 'Asíntota Total (dB)',
      line: { color: '#38bdf8', width: 2.5 }
    });
    traces.push({
      x: state.wList,
      y: state.bodeComps.totalAsympPhase,
      name: 'Asíntota Fase (°)',
      yaxis: 'y2',
      line: { color: '#facc15', width: 2, dash: 'dash' }
    });
  } else if (state.step === comps.length + 2) {
    // Curva Real vs Asíntota
    title = `Paso ${state.step}: Curva Real vs. Asíntotas`;
    desc = `
      <p>Comparamos la <b>curva exacta</b> (en azul cian continuo) con la aproximación asintótica (en líneas discontinuas).</p>
      <p>La máxima diferencia ocurre típicamente en las esquinas de corte (3 dB en polos simples).</p>
    `;
    traces.push({
      x: state.wList,
      y: state.bodeComps.totalAsympMag,
      name: 'Asíntota Total',
      line: { color: '#64748b', dash: 'dash', width: 1.5 }
    });
    traces.push({
      x: state.wList,
      y: state.freqResp.mag,
      name: 'Curva Real (dB)',
      line: { color: '#00e5ff', width: 2.5 }
    });
    traces.push({
      x: state.wList,
      y: state.freqResp.phase,
      name: 'Fase Real (°)',
      yaxis: 'y2',
      line: { color: '#ffd700', width: 2.2 }
    });
  } else {
    // Paso Final: Márgenes
    title = `Paso Final: Márgenes de Fase y Ganancia`;
    traces.push({
      x: state.wList,
      y: state.freqResp.mag,
      name: 'Magnitud (dB)',
      line: { color: '#00e5ff', width: 2.2 }
    });
    traces.push({
      x: state.wList,
      y: state.freqResp.phase,
      name: 'Fase (°)',
      yaxis: 'y2',
      line: { color: '#ffd700', width: 2.2 }
    });

    // Líneas de referencia 0 dB y -180°
    traces.push({
      x: [state.wList[0], state.wList[state.wList.length - 1]],
      y: [0, 0],
      name: '0 dB',
      line: { color: '#ffffff', dash: 'dash', width: 1 }
    });

    const pm = state.margins.PM;
    const gm = state.margins.GM;
    const pmStr = pm !== null ? `${pm.toFixed(2)}°` : 'Infinito';
    const gmStr = gm !== null ? `${gm.toFixed(2)} dB` : 'Infinito';
    const isStable = (pm === null || pm > 0) && (gm === null || gm > 0);

    desc = `
      <p><b>Margen de Fase (MF):</b> <span class="badge ${pm > 45 ? 'badge-success' : 'badge-warning'}">${pmStr}</span> (donde |GH| = 0 dB)</p>
      <p><b>Margen de Ganancia (MG):</b> <span class="badge ${gm > 10 ? 'badge-success' : 'badge-warning'}">${gmStr}</span> (donde Fase = -180°)</p>
      <p><b>Diagnóstico de Estabilidad:</b> ${isStable ? '✅ El sistema en lazo cerrado es <b>ESTABLE</b>.' : '❌ El sistema en lazo cerrado es <b>INESTABLE</b> o marginal.'}</p>
      <p style="color:#94a3b8; font-size:11px; margin-top:4px;">💡 Un MF entre 45° y 60° suele garantizar un buen equilibrio entre rapidez y sobreimpulso.</p>
    `;
  }

  explanationTitle.textContent = title;
  explanationBody.innerHTML = desc;

  const layout = {
    ...darkLayoutCommon,
    xaxis: { type: 'log', title: 'Frecuencia ω (rad/s)', gridcolor: '#33334d' },
    yaxis: { title: 'Magnitud (dB)', gridcolor: '#33334d' }
  };
  if (state.step > 0) {
    layout.yaxis2 = {
      title: 'Fase (°)',
      overlaying: 'y',
      side: 'right',
      gridcolor: '#27273f'
    };
  }

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

  let html = `
    <!-- 1. Función de Transferencia Original -->
    <div class="sol-section">
      <h3>📐 1. Función de Transferencia Analizada</h3>
      <p>Ecuación ingresada en el dominio de Laplace:</p>
      <div class="sol-formula-box">
        ${renderTex(`G(s) = ${state.tfStr}`, true)}
      </div>
      <p><b>Polos de lazo abierto (${poles.length}):</b></p>
      <div class="sol-formula-box">
        ${poles.map((p, i) => renderTex(`p_{${i+1}} = ${p.re.toFixed(3)}${p.im >= 0 ? '+' : ''}${p.im.toFixed(3)}j`)).join(' \\quad , \\quad ')}
      </div>
      <p><b>Ceros de lazo abierto (${zeros.length}):</b></p>
      <div class="sol-formula-box">
        ${zeros.length > 0 ? zeros.map((z, i) => renderTex(`z_{${i+1}} = ${z.re.toFixed(3)}${z.im >= 0 ? '+' : ''}${z.im.toFixed(3)}j`)).join(' \\quad , \\quad ') : 'Ninguno (sin ceros finitos)'}
      </div>
    </div>

    <!-- 2. Forma Canónica de Bode -->
    <div class="sol-section">
      <h3>📊 2. Forma Canónica de Bode y Factores</h3>
      <p>Se normalizan los factores al formato constante unitaria ${renderTex('(1 + s\\tau)')}:</p>
      <div class="sol-formula-box">
        ${renderTex(`K_{Bode} = ${kbode.toFixed(3)} \\quad \\Longrightarrow \\quad 20\\log_{10}(K_{Bode}) = ${kbodeDb.toFixed(2)}\\text{ dB}`)}
      </div>
      <table class="sol-table">
        <thead>
          <tr>
            <th>Factor</th>
            <th>Frecuencia ωc</th>
            <th>Pendiente Mag</th>
            <th>Aporte Fase</th>
          </tr>
        </thead>
        <tbody>
          ${comps.map((c) => `
            <tr>
              <td><b>${c.name}</b></td>
              <td>${c.wc ? `${c.wc.toFixed(3)} rad/s` : '—'}</td>
              <td>${c.slope !== undefined ? `${c.slope > 0 ? '+' : ''}${c.slope} dB/dec` : '—'}</td>
              <td>${c.phaseShift !== undefined ? `${c.phaseShift}°` : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- 3. Márgenes de Estabilidad en Frecuencia (Bode) -->
    <div class="sol-section">
      <h3>📈 3. Márgenes de Estabilidad (Bode)</h3>
      <div class="sol-formula-box">
        ${renderTex(`\\omega_{cg} = ${margins.w_pm ? margins.w_pm.toFixed(3) : '\\infty'}\\text{ rad/s} \\quad \\implies \\quad MF = ${margins.PM !== null ? margins.PM.toFixed(2) : '\\infty'}^\\circ`)}
      </div>
      <div class="sol-formula-box">
        ${renderTex(`\\omega_{cp} = ${margins.w_gm ? margins.w_gm.toFixed(3) : '\\infty'}\\text{ rad/s} \\quad \\implies \\quad MG = ${margins.GM !== null ? margins.GM.toFixed(2) : '\\infty'}\\text{ dB}`)}
      </div>
      <p><b>Diagnóstico de Lazo Cerrado:</b> ${(margins.PM === null || margins.PM > 0) && (margins.GM === null || margins.GM > 0) ? '<span class="badge badge-success">ESTABLE</span> Margen de fase y ganancia positivos.' : '<span class="badge badge-danger">INESTABLE</span> Cruza el límite de estabilidad.'}</p>
    </div>

    <!-- 4. Criterio de Nyquist -->
    <div class="sol-section">
      <h3>🌀 4. Criterio de Estabilidad de Nyquist</h3>
      <p>Relación fundamental de Cauchy aplicada al contorno de Nyquist:</p>
      <div class="sol-formula-box">
        ${renderTex('Z = N + P', true)}
      </div>
      <p>• <b>P (Polos en semiplano derecho Re > 0):</b> ${poles.filter(p => p.re > 1e-5).length}</p>
      <p>• <b>N (Rodeos horarios al punto -1 + j0):</b> 0</p>
      <p>• <b>Z (Polos inestables de lazo cerrado):</b> <b style="color:${poles.filter(p => p.re > 1e-5).length === 0 ? '#4ade80' : '#f87171'}">${poles.filter(p => p.re > 1e-5).length}</b></p>
      <p><b>Conclusión Nyquist:</b> ${poles.filter(p => p.re > 1e-5).length === 0 ? '<span class="badge badge-success">ESTABLE</span> No hay polos cerrados inestables.' : '<span class="badge badge-danger">INESTABLE</span> Existen polos en el semiplano derecho.'}</p>
    </div>

    <!-- 5. Lugar Geométrico de las Raíces -->
    <div class="sol-section">
      <h3>🎯 5. Reglas del Lugar Geométrico de Raíces</h3>
      ${(() => {
        const n = poles.length;
        const m = zeros.length;
        const asymp = n - m;
        const sumP = poles.reduce((a, b) => a + b.re, 0);
        const sumZ = zeros.reduce((a, b) => a + b.re, 0);
        const sigma = asymp > 0 ? (sumP - sumZ) / asymp : 0;
        return `
          <p>• Ramas totales: <b>${n}</b></p>
          <p>• Ramas hacia el infinito: <b>${asymp}</b></p>
          <div class="sol-formula-box">
            ${renderTex(`\\sigma_a = \\frac{\\sum p_i - \\sum z_i}{n - m} = \\frac{(${sumP.toFixed(2)}) - (${sumZ.toFixed(2)})}{${asymp}} = ${sigma.toFixed(3)}`)}
          </div>
          <p>• Ángulos de asíntotas:</p>
          <div class="sol-formula-box">
            ${asymp > 0 ? Array.from({length: asymp}, (_, k) => renderTex(`\\theta_{${k}} = \\frac{(2(${k})+1)180^\\circ}{${asymp}} = ${(((2*k+1)*180)/asymp).toFixed(1)}^\\circ`)).join(' \\quad , \\quad ') : 'No aplican asíntotas (n = m)'}
          </div>
        `;
      })()}
    </div>
  `;

  // Si hay compensador calculado, añadir sección
  if (state.compResult) {
    const c = state.compResult;
    html += `
      <div class="sol-section">
        <h3>⚙️ 6. Síntesis de Compensador (${compTypeSelect.value})</h3>
        <p>Parámetros calculados para cumplir especificación de margen de fase:</p>
        <div class="sol-formula-box">
          ${c.explanation.map(e => `<p style="margin:2px 0;">• ${e}</p>`).join('')}
        </div>
        <p><b>Comparativa de Márgenes:</b></p>
        <p>• Original: MF = <b>${c.baseMargins.PM ? c.baseMargins.PM.toFixed(1) + '°' : 'Infinito'}</b></p>
        <p>• Compensado: MF = <b style="color:#00e5ff">${c.compMargins.PM ? c.compMargins.PM.toFixed(1) + '°' : 'Infinito'}</b></p>
      </div>
    `;
  }

  // Respuesta temporal
  if (state.stepRespOrig) {
    const mo = state.stepRespOrig.metrics;
    const mc = state.stepRespComp ? state.stepRespComp.metrics : null;
    html += `
      <div class="sol-section">
        <h3>⏱️ 7. Respuesta Temporal al Escalón</h3>
        <table class="sol-table">
          <thead>
            <tr>
              <th>Parámetro</th>
              <th>Original</th>
              <th>Compensado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tiempo de Subida (Tr)</td>
              <td>${mo.tr ? mo.tr.toFixed(3) + 's' : '—'}</td>
              <td>${mc && mc.tr ? mc.tr.toFixed(3) + 's' : '—'}</td>
            </tr>
            <tr>
              <td>Tiempo de Asentamiento 2% (Ts)</td>
              <td>${mo.ts ? mo.ts.toFixed(3) + 's' : '—'}</td>
              <td>${mc && mc.ts ? mc.ts.toFixed(3) + 's' : '—'}</td>
            </tr>
            <tr>
              <td>Sobreimpulso Máximo (Mp%)</td>
              <td>${mo.mpPercent ? mo.mpPercent.toFixed(1) + '%' : '0%'}</td>
              <td>${mc && mc.mpPercent ? mc.mpPercent.toFixed(1) + '%' : '0%'}</td>
            </tr>
            <tr>
              <td>Error Estacionario (Ess)</td>
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
