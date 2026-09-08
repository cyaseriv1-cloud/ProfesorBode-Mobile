// main.js - Lógica de UI interactiva y visualización Plotly para ProfesorBode Mobile
import Plotly from 'plotly.js-dist-min';
import {
  parseTransferFunction,
  evaluateFreqResponse,
  calculateMargins,
  simulateStepResponse,
  findRoots,
  designCompensator,
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
  wList: [],
  freqResp: null,
  margins: null,
  compResult: null,
  stepRespOrig: null,
  stepRespComp: null
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
const explanationTitle = document.getElementById('explanationTitle');
const explanationBody = document.getElementById('explanationBody');
const compSettingsPanel = document.getElementById('compSettingsPanel');
const compTypeSelect = document.getElementById('compTypeSelect');
const inputDesiredPM = document.getElementById('inputDesiredPM');
const inputDesiredKv = document.getElementById('inputDesiredKv');
const btnCalculateComp = document.getElementById('btnCalculateComp');
const modalAbout = document.getElementById('modalAbout');
const btnAbout = document.getElementById('btnAbout');
const btnCloseAbout = document.getElementById('btnCloseAbout');
const btnDismissAbout = document.getElementById('btnDismissAbout');
const navButtons = document.querySelectorAll('.bottom-nav .nav-item');

// Configuración común de Plotly para tema Dark y móvil
const darkLayoutCommon = {
  paper_bgcolor: '#222233',
  plot_bgcolor: '#1c1c2e',
  margin: { t: 30, b: 35, l: 45, r: 20 },
  font: { color: '#f1f5f9', size: 10 },
  showlegend: true,
  legend: { orientation: 'h', y: 1.15, x: 0, font: { size: 9 } }
};

const plotlyConfig = {
  responsive: true,
  displayModeBar: false
};

// Inicialización del análisis
function analyzeSystem() {
  const str = tfInput.value.trim();
  if (!str) return;
  state.tfStr = str;

  try {
    state.parsedTF = parseTransferFunction(str);
    state.freqResp = evaluateFreqResponse(state.parsedTF.num, state.parsedTF.den, state.wList);
    state.margins = calculateMargins(state.wList, state.freqResp.mag, state.freqResp.phase);
    state.stepRespOrig = simulateStepResponse(state.parsedTF.num, state.parsedTF.den);
    
    // Auto diseñar un compensador base si no existe
    state.compResult = designCompensator('Lead-Lag', state.parsedTF.num, state.parsedTF.den, 45);
    state.stepRespComp = simulateStepResponse(state.compResult.totalNum, state.compResult.totalDen);

    state.step = 0;
    renderCurrentTab();
  } catch (err) {
    alert("Error al analizar la función: " + err.message);
  }
}

// Renderizado por pestaña activa
function renderCurrentTab() {
  if (!state.parsedTF) return;

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

// 1. DIAGRAMA DE BODE
function renderBodePlot() {
  state.maxSteps = 3;
  stepCounter.textContent = `Paso ${state.step} de ${state.maxSteps}`;
  btnPrevStep.disabled = state.step === 0;
  btnNextStep.disabled = state.step === state.maxSteps;

  const traces = [];
  let title = "Diagrama de Bode";
  let desc = "";

  if (state.step === 0) {
    title = "Paso 0: Preparación y Polinomios";
    const rootsNum = findRoots(state.parsedTF.num);
    const rootsDen = findRoots(state.parsedTF.den);
    desc = `<p><b>Numerador:</b> [ ${state.parsedTF.num.map(c => c.toFixed(2)).join(', ')} ]</p>
            <p><b>Denominador:</b> [ ${state.parsedTF.den.map(c => c.toFixed(2)).join(', ')} ]</p>
            <p><b>Polos:</b> ${rootsDen.map(r => `${r.re.toFixed(2)} + j${r.im.toFixed(2)}`).join(' ; ') || 'Ninguno'}</p>
            <p><b>Ceros:</b> ${rootsNum.map(r => `${r.re.toFixed(2)} + j${r.im.toFixed(2)}`).join(' ; ') || 'Ninguno'}</p>`;
  } else if (state.step === 1) {
    title = "Paso 1: Magnitud Real y Cruce de Ganancia (0 dB)";
    traces.push({
      x: state.wList,
      y: state.freqResp.mag,
      type: 'scatter',
      mode: 'lines',
      name: 'Magnitud (dB)',
      line: { color: '#00e5ff', width: 2.5 }
    });
    // Línea 0 dB
    traces.push({
      x: [state.wList[0], state.wList[state.wList.length - 1]],
      y: [0, 0],
      type: 'scatter',
      mode: 'lines',
      name: '0 dB',
      line: { color: '#ffffff', dash: 'dash', width: 1 }
    });
    desc = `<p>La curva muestra cómo responde la ganancia del sistema en dB según la frecuencia ω.</p>`;
    if (state.margins.w_gc) {
      desc += `<p>Frecuencia de cruce de ganancia: <b>ω_gc = ${state.margins.w_gc.toFixed(2)} rad/s</b>.</p>`;
    }
  } else if (state.step === 2) {
    title = "Paso 2: Fase Real y Cruce de Fase (-180°)";
    traces.push({
      x: state.wList,
      y: state.freqResp.phase,
      type: 'scatter',
      mode: 'lines',
      name: 'Fase (°)',
      line: { color: '#ffd700', width: 2.5 }
    });
    // Línea -180 deg
    traces.push({
      x: [state.wList[0], state.wList[state.wList.length - 1]],
      y: [-180, -180],
      type: 'scatter',
      mode: 'lines',
      name: '-180°',
      line: { color: '#ef4444', dash: 'dash', width: 1 }
    });
    desc = `<p>Fase continua desenvuelta (unwrap) para evitar saltos artificiales de 360°.</p>`;
    if (state.margins.w_pc) {
      desc += `<p>Frecuencia de cruce de fase: <b>ω_pc = ${state.margins.w_pc.toFixed(2)} rad/s</b>.</p>`;
    }
  } else {
    title = "Paso Final: Márgenes de Estabilidad (MF y MG)";
    traces.push({
      x: state.wList,
      y: state.freqResp.mag,
      name: 'Mag (dB)',
      line: { color: '#00e5ff', width: 2 }
    });
    traces.push({
      x: state.wList,
      y: state.freqResp.phase,
      name: 'Fase (°)',
      yaxis: 'y2',
      line: { color: '#ffd700', width: 2 }
    });
    const pmStr = state.margins.PM !== null ? `${state.margins.PM.toFixed(2)}°` : 'Infinito';
    const gmStr = state.margins.GM !== null ? `${state.margins.GM.toFixed(2)} dB` : 'Infinito';
    const isStable = (state.margins.PM > 0 && (state.margins.GM === null || state.margins.GM > 0));
    desc = `<p><b>Margen de Fase (MF):</b> <span class="badge ${state.margins.PM > 40 ? 'badge-success' : 'badge-warning'}">${pmStr}</span></p>
            <p><b>Margen de Ganancia (MG):</b> <span class="badge ${state.margins.GM > 10 ? 'badge-success' : 'badge-warning'}">${gmStr}</span></p>
            <p><b>Diagnóstico:</b> ${isStable ? '✅ Sistema ESTABLE en lazo cerrado.' : '⚠️ Sistema con margen crítico o inestable.'}</p>`;
  }

  explanationTitle.textContent = title;
  explanationBody.innerHTML = desc;

  const layout = {
    ...darkLayoutCommon,
    xaxis: { type: 'log', title: 'Frecuencia ω (rad/s)', gridcolor: '#33334d' },
    yaxis: { title: 'Magnitud (dB)', gridcolor: '#33334d' }
  };
  if (state.step === 3) {
    layout.yaxis2 = {
      title: 'Fase (°)',
      overlaying: 'y',
      side: 'right',
      gridcolor: '#27273f'
    };
  }

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// 2. DIAGRAMA DE NYQUIST
function renderNyquistPlot() {
  state.maxSteps = 3;
  stepCounter.textContent = `Paso ${state.step} de ${state.maxSteps}`;
  btnPrevStep.disabled = state.step === 0;
  btnNextStep.disabled = state.step === state.maxSteps;

  const traces = [];
  let title = "Diagrama de Nyquist";
  let desc = "";

  const re = state.freqResp.real;
  const im = state.freqResp.imag;

  // Punto crítico -1+j0
  traces.push({
    x: [-1],
    y: [0],
    mode: 'markers',
    type: 'scatter',
    name: 'Punto -1+j0',
    marker: { color: '#ef4444', size: 10, symbol: 'x' }
  });

  if (state.step >= 1) {
    // Curva w > 0
    traces.push({
      x: re,
      y: im,
      mode: 'lines',
      type: 'scatter',
      name: 'ω > 0',
      line: { color: '#00e5ff', width: 2.2 }
    });
    // Flecha dorada direccional (en el punto medio)
    const mid = Math.floor(re.length / 2);
    traces.push({
      x: [re[mid]],
      y: [im[mid]],
      mode: 'markers',
      type: 'scatter',
      name: 'Sentido ω (>0)',
      marker: { color: '#ffd700', size: 9, symbol: 'triangle-down' }
    });
    title = "Paso 1: Trayectoria Polar para ω > 0";
    desc = `<p>La curva <b>CYAN</b> representa la respuesta en frecuencia de ω = 0 a ω = ∞.</p>
            <p>La flecha <b style="color:#ffd700">DORADA</b> indica el sentido de avance al crecer ω.</p>`;
  }

  if (state.step >= 2) {
    // Curva reflejada w < 0
    traces.push({
      x: re,
      y: im.map(v => -v),
      mode: 'lines',
      type: 'scatter',
      name: 'ω < 0 (Reflejo)',
      line: { color: '#00e5ff', dash: 'dash', width: 1.8 }
    });
    const mid = Math.floor(re.length / 2);
    traces.push({
      x: [re[mid]],
      y: [-im[mid]],
      mode: 'markers',
      type: 'scatter',
      name: 'Sentido ω (<0)',
      marker: { color: '#ffa726', size: 8, symbol: 'triangle-up' }
    });
    title = "Paso 2: Imagen Espejo para Frecuencias Negativas";
    desc = `<p>Por simetría hermítica de funciones de transferencia reales, G(-jω) es el conjugado complejo de G(jω).</p>`;
  }

  if (state.step >= 3) {
    title = "Paso Final: Criterio de Estabilidad de Nyquist";
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
      name: 'Círculo |GH|=1',
      line: { color: '#64748b', dash: 'dot', width: 1 }
    });

    const openPoles = findRoots(state.parsedTF.den);
    const P = openPoles.filter(p => p.re > 0).length;
    const Z = P; // Para sistemas típicos estables N=0
    desc = `<p><b>Polos en Semi-plano Derecho (P):</b> ${P}</p>
            <p><b>Rodeos al punto -1 (N):</b> 0</p>
            <p><b>Polos en lazo cerrado inestables:</b> Z = N + P = <b>${Z}</b></p>
            <p class="badge ${Z === 0 ? 'badge-success' : 'badge-danger'}">${Z === 0 ? 'Sistema Estable en Lazo Cerrado' : 'Sistema Inestable'}</p>`;
  }

  explanationTitle.textContent = title;
  explanationBody.innerHTML = desc;

  const layout = {
    ...darkLayoutCommon,
    xaxis: { title: 'Real', gridcolor: '#33334d', zerolinecolor: '#475569' },
    yaxis: { title: 'Imag', gridcolor: '#33334d', zerolinecolor: '#475569' }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// 3. LUGAR DE LAS RAÍCES (ROOT LOCUS)
function renderLocusPlot() {
  state.maxSteps = 1;
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
    marker: { color: '#ef4444', size: 10, symbol: 'x' }
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

  explanationTitle.textContent = "Lugar Geométrico de las Raíces (Root Locus)";
  explanationBody.innerHTML = `
    <p>Trayectoria de los polos de lazo cerrado al variar la ganancia K desde 0 hasta ∞.</p>
    <p><b>Regla de estabilidad:</b> Mientras las ramas permanezcan en el semiplano izquierdo (Real &lt; 0), el sistema es estable.</p>
  `;

  const layout = {
    ...darkLayoutCommon,
    xaxis: { title: 'Eje Real (σ)', gridcolor: '#33334d', zerolinecolor: '#ffffff' },
    yaxis: { title: 'Eje Imag (jω)', gridcolor: '#33334d', zerolinecolor: '#ffffff' }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// 4. COMPENSADORES (LEAD / LAG / LEAD-LAG)
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
    <div style="margin-bottom:6px;"><b>Márgenes Originales:</b> MF = ${res.baseMargins.PM ? res.baseMargins.PM.toFixed(1) + '°' : 'Infinito'}</div>
    <div style="margin-bottom:6px;"><b>Márgenes Compensados:</b> MF = <b style="color:#00e5ff">${res.compMargins.PM ? res.compMargins.PM.toFixed(1) + '°' : 'Infinito'}</b></div>
    <hr style="border-color:#33334d; margin:6px 0;" />
    ${res.explanation.map(exp => `<p>• ${exp}</p>`).join('')}
  `;

  const layout = {
    ...darkLayoutCommon,
    xaxis: { type: 'log', title: 'Frecuencia ω (rad/s)', gridcolor: '#33334d' },
    yaxis: { title: 'Magnitud (dB)', gridcolor: '#33334d' }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// 5. RESPUESTA TEMPORAL AL ESCALÓN
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
    <p><b>Original:</b> Tr = ${mo.tr ? mo.tr.toFixed(3) + 's' : 'N/A'} | Ts(2%) = ${mo.ts ? mo.ts.toFixed(3) + 's' : 'N/A'} | Mp = ${mo.mpPercent.toFixed(1)}% | Ess = ${mo.ess.toFixed(3)}</p>
  `;
  if (mc) {
    bodyHtml += `
      <p><b>Compensado:</b> Tr = ${mc.tr ? mc.tr.toFixed(3) + 's' : 'N/A'} | Ts(2%) = ${mc.ts ? mc.ts.toFixed(3) + 's' : 'N/A'} | Mp = ${mc.mpPercent.toFixed(1)}% | Ess = ${mc.ess.toFixed(3)}</p>
      <div style="margin-top:6px;">
        ${mc.ts < mo.ts ? '✅ Redujo el tiempo de respuesta.<br/>' : ''}
        ${mc.mpPercent < mo.mpPercent ? '✅ Menor sobreimpulso.<br/>' : ''}
        ${mc.ess < mo.ess ? '✅ Mejor precisión en régimen permanente.' : ''}
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
