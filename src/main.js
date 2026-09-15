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
  polyMultiply,
  calculateKStabilityRange,
  getNyquistTabulation,
  formatPoly
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

// Función auxiliar para renderizar KaTeX seguro
function renderTex(tex, display = false) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false });
  } catch (e) {
    return `<span>${tex}</span>`;
  }
}

// Limpia cualquier residuo de $...$ o expresiones LaTeX inline en el HTML para que NUNCA aparezcan códigos crudos
function cleanMath(html) {
  if (!html) return '';
  let res = html;
  // Reemplazar $$ ... $$ por bloques KaTeX
  res = res.replace(/\$\$([^$]+)\$\$/g, (_, math) => renderTex(math.trim(), true));
  // Reemplazar $ ... $ por KaTeX inline
  res = res.replace(/\$([^$]+)\$/g, (_, math) => {
    let clean = math.trim();
    if (clean.startsWith('omega')) clean = '\\' + clean;
    return renderTex(clean, false);
  });
  return res;
}

// Obtiene métricas avanzadas de ingeniería de control (grados, retardo crítico, factor de ganancia, amortiguamiento)
function getControlMetrics() {
  if (!state.parsedTF) return null;
  const den = state.parsedTF.den;
  const num = state.parsedTF.num;
  const poles = findRoots(den);
  const zeros = findRoots(num);
  const n = poles.length;
  const m = zeros.length;
  const relDegree = n - m;

  const originPoles = poles.filter(p => Math.hypot(p.re, p.im) < 1e-4).length;
  const originZeros = zeros.filter(z => Math.hypot(z.re, z.im) < 1e-4).length;
  const systemType = originPoles;

  const margins = state.margins || {};
  const pm = margins.PM;
  const gm = margins.GM;
  const w_gc = margins.w_gc;
  const w_pc = margins.w_pc;

  // Retardo crítico permisible (Dead time margin): tau_crit = PM(rad) / w_gc
  let tauCrit = null;
  let tauCritMs = null;
  if (pm !== null && pm > 0 && w_gc && w_gc > 0) {
    const pmRad = (pm * Math.PI) / 180;
    tauCrit = pmRad / w_gc;
    tauCritMs = tauCrit * 1000;
  }

  // Factor de ganancia permisible antes de inestabilidad: K_factor = 10^(GM/20)
  let kFactor = null;
  if (gm !== null && !isNaN(gm) && isFinite(gm)) {
    kFactor = Math.pow(10, gm / 20);
  }

  // Estimación de factor de amortiguamiento y sobreimpulso para sistemas tipo 2do orden equivalente
  let zetaEst = null;
  let mpEst = null;
  let trEst = null;
  if (pm !== null && pm > 0) {
    zetaEst = Math.min(1.0, pm / 100);
    if (zetaEst < 1.0 && zetaEst > 0) {
      mpEst = Math.exp((-Math.PI * zetaEst) / Math.sqrt(1 - zetaEst * zetaEst)) * 100;
    } else {
      mpEst = 0;
    }
  }
  if (w_gc && w_gc > 0) {
    trEst = 1.8 / w_gc;
  }

  const isStable = (pm === null || pm > 0) && (gm === null || gm > 0);

  return {
    n,
    m,
    relDegree,
    systemType,
    originPoles,
    originZeros,
    poles,
    zeros,
    pm,
    gm,
    w_gc,
    w_pc,
    tauCrit,
    tauCritMs,
    kFactor,
    zetaEst,
    mpEst,
    trEst,
    isStable
  };
}

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

// Modal Tabulación Nyquist
const btnNyquistTable = document.getElementById('btnNyquistTable');
const modalNyquistTable = document.getElementById('modalNyquistTable');
const btnCloseNyquistTable = document.getElementById('btnCloseNyquistTable');
const btnDismissNyquistTable = document.getElementById('btnDismissNyquistTable');
const nyquistTableContent = document.getElementById('nyquistTableContent');

// Estado del modo de interacción en la gráfica
let currentDragMode = 'pan';
let isNormalPanActive = false;

// Determina si Plotly debe capturar los toques para mover/hacer zoom o dejar libre el scroll vertical de la pantalla
function getEffectiveDragMode() {
  return (state.isFullscreen || isNormalPanActive) ? (currentDragMode || 'pan') : false;
}

// Configuración común de Plotly para tema Dark y móvil
// Por defecto dragmode es false para que el usuario pueda desplazarse verticalmente por la página sin mover los ejes.
const darkLayoutCommon = {
  paper_bgcolor: '#222233',
  plot_bgcolor: '#1c1c2e',
  margin: { t: 25, b: 35, l: 45, r: 20 },
  font: { color: '#f1f5f9', size: 10 },
  showlegend: true,
  legend: { orientation: 'h', y: 1.14, x: 0, font: { size: 9 } },
  dragmode: false
};

const plotlyConfig = {
  responsive: true,
  displayModeBar: false,
  scrollZoom: false
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

  // Actualizar visibilidad de herramientas exclusivas de Nyquist
  if (state.currentTab === 'nyquist') {
    btnFocusCrit.classList.remove('hidden');
    if (btnNyquistTable) btnNyquistTable.classList.remove('hidden');
  } else {
    btnFocusCrit.classList.add('hidden');
    if (btnNyquistTable) btnNyquistTable.classList.add('hidden');
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

  // Ajustar altura para Bode y Compensador (dos subplots apilados)
  if (state.currentTab === 'bode' || state.currentTab === 'compensator') {
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

  const metrics = getControlMetrics();

  if (state.step === 0) {
    title = "Paso 0: Factorización y Conversión Canónica de Bode";
    const rootsDen = findRoots(state.parsedTF.den);
    const rootsNum = findRoots(state.parsedTF.num);
    const realP = state.bodeComps.realPoles || [];
    const realZ = state.bodeComps.realZeros || [];
    const kbode = state.bodeComps.k_bode;
    const kbodeDb = state.bodeComps.k_db;

    let factHtml = "";
    if (realP.length > 0 || realZ.length > 0) {
      factHtml += `
        <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
          <p><b>1. Extracción de constantes de tiempo (forma τs + 1):</b></p>
          <p style="font-size:11px; color:#94a3b8;">Cada factor (s + p) se normaliza factorizando el término independiente p para que tienda a 1 (0 dB) en muy baja frecuencia:</p>
          ${realP.map(wc => {
            const tau = 1 / wc;
            return `<p style="margin:3px 0;">• Denominador: <b>(s + ${wc.toFixed(2)}) = ${wc.toFixed(2)} · (1 + s/${wc.toFixed(2)}) = ${wc.toFixed(2)}(1 + ${tau.toFixed(3)}s)</b></p>`;
          }).join('')}
          ${realZ.map(wc => {
            const tau = 1 / wc;
            return `<p style="margin:3px 0;">• Numerador: <b>(s + ${wc.toFixed(2)}) = ${wc.toFixed(2)} · (1 + s/${wc.toFixed(2)}) = ${wc.toFixed(2)}(1 + ${tau.toFixed(3)}s)</b></p>`;
          }).join('')}
          ${realP.length > 0 ? `<p style="margin-top:4px; color:#cbd5e1;">Producto de constantes extraídas del denominador: <b>${realP.map(p => p.toFixed(2)).join(' × ')} = ${realP.reduce((a, b) => a * b, 1).toFixed(2)}</b></p>` : ''}
        </div>
      `;
    }

    desc = `
      <p><b>Función Original en el dominio de Laplace:</b></p>
      <div style="background:#11111e; padding:6px 10px; border-radius:4px; margin:4px 0; text-align:center;">
        ${renderTex(`G(s) = ${state.tfStr}`, true)}
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-lbl">Orden del Sistema (n)</div>
          <div class="metric-val">${metrics ? metrics.n : rootsDen.length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Grado Relativo (n - m)</div>
          <div class="metric-val">${metrics ? metrics.relDegree : rootsDen.length - rootsNum.length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Tipo de Sistema (k)</div>
          <div class="metric-val">${metrics ? metrics.systemType : 0}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Ganancia Bode (K_Bode)</div>
          <div class="metric-val">${kbode.toFixed(2)} (${kbodeDb.toFixed(1)} dB)</div>
        </div>
      </div>

      <p><b>Polos de Lazo Abierto (D(s) = 0):</b></p>
      <p>• ${rootsDen.map(r => `${r.re.toFixed(2)} + ${r.im.toFixed(2)}j`).join(' ; ') || 'Ninguno'}</p>
      <p><b>Ceros de Lazo Abierto (N(s) = 0):</b> ${rootsNum.length > 0 ? rootsNum.map(r => `${r.re.toFixed(2)} + ${r.im.toFixed(2)}j`).join(' ; ') : 'Ninguno (sin ceros finitos).'}</p>

      ${factHtml}

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>2. Cálculo formal de la Ganancia Canónica (K<sub>Bode</sub>):</b></p>
        <p>Dividimos el numerador entre el producto de constantes extraídas de las raíces:</p>
        <div style="margin:4px 0; text-align:center;">
          ${renderTex(`K_{Bode} = \\lim_{s \\to 0} s^{${metrics ? metrics.systemType : 0}} G(s) = ${kbode.toFixed(3)} \\quad \\Longrightarrow \\quad 20\\log_{10}(${kbode.toFixed(3)}) = ${kbodeDb.toFixed(2)}\\text{ dB}`, true)}
        </div>
        <p style="font-size:11px; color:#cbd5e1;">En baja frecuencia, la prolongación de la recta asintótica inicial corta la ordenada vertical en <b>ω = 1 rad/s</b> exactamente con el valor <b>${kbodeDb.toFixed(2)} dB</b>.</p>
      </div>

      <p><b>3. Factores Canónicos Identificados (${comps.length}):</b></p>
      <ul style="padding-left:16px; margin-top:4px;">
        ${comps.map((c, i) => `<li><b>Factor ${i+1}:</b> ${c.name} <span class="factor-badge">${c.type}</span></li>`).join('')}
      </ul>

      <div class="pedagogy-tip">
        <b>💡 Tip de Examen:</b> En la forma canónica de Bode, todos los factores deben expresarse con término independiente unitario: <b>(1 + τs)</b>. Las frecuencias de quiebre ocurren en <b>ω<sub>c</sub> = 1/τ = |p<sub>i</sub>|</b>. ¡No confundas la ganancia original del numerador con la ganancia de Bode K<sub>Bode</sub>!
      </div>
      <p style="color:#38bdf8; font-size:11px; margin-top:6px;">👉 Presiona <b>Siguiente &gt;&gt;</b> para ver la curva de cada factor dibujada en los subplots de Magnitud y Fase.</p>
    `;
  } else if (state.step <= comps.length) {
    const factorIdx = state.step - 1;
    const factor = comps[factorIdx];
    title = `Paso ${state.step}: ${factor.name}`;

    let mathEq = "";
    let magRules = "";
    let phaseRules = "";
    let intuition = "";

    if (factor.type === 'gain') {
      mathEq = `G_i(s) = K_{Bode} = ${state.bodeComps.k_bode.toFixed(3)}`;
      magRules = `Magnitud constante e independiente de la frecuencia: <b>${state.bodeComps.k_db.toFixed(2)} dB</b> en todo el espectro (pendiente 0 dB/dec).`;
      phaseRules = `Fase constante: <b>${factor.phaseShift}°</b> (0° si K &gt; 0, -180° si K &lt; 0).`;
      intuition = `La ganancia constante traslada verticalmente todo el trazado de magnitud sin alterar la forma ni las pendientes de las asíntotas.`;
    } else if (factor.type === 'origin_pole') {
      mathEq = `G_i(s) = \\frac{1}{s^{${state.bodeComps.originPoles}}}`;
      magRules = `Recta continua con pendiente de <b>-${20 * state.bodeComps.originPoles} dB/década</b> que cruza 0 dB exactamente en <b>ω = 1 rad/s</b>.`;
      phaseRules = `Desfase constante de <b>-${90 * state.bodeComps.originPoles}°</b> en todas las frecuencias.`;
      intuition = `Un integrador puro aporta ganancia infinita en DC (elimina error en régimen permanente) pero consume 90° de margen de estabilidad por cada polo en origen.`;
    } else if (factor.type === 'origin_zero') {
      mathEq = `G_i(s) = s^{${state.bodeComps.originZeros}}`;
      magRules = `Recta continua con pendiente de <b>+${20 * state.bodeComps.originZeros} dB/década</b> que cruza 0 dB en <b>ω = 1 rad/s</b>.`;
      phaseRules = `Adelanto angular constante de <b>+${90 * state.bodeComps.originZeros}°</b> en todas las frecuencias.`;
      intuition = `Un diferenciador puro amplifica el ruido de alta frecuencia y adelanta la fase, mejorando la respuesta transitoria.`;
    } else if (factor.type === 'real_pole') {
      const tau = 1 / factor.wc;
      mathEq = `G_i(s) = \\frac{1}{1 + s/${factor.wc.toFixed(2)}} = \\frac{1}{1 + ${tau.toFixed(3)}s}`;
      magRules = `
        • <b>Para ω &lt; ${factor.wc.toFixed(2)} rad/s:</b> Asíntota plana en <b>0 dB</b> (pendiente 0 dB/dec).<br>
        • <b>En la frecuencia de corte ω<sub>c</sub> = ${factor.wc.toFixed(2)} rad/s:</b> La curva real cae <b>-3.01 dB</b> bajo la esquina.<br>
        • <b>Para ω &gt; ${factor.wc.toFixed(2)} rad/s:</b> Cae con pendiente de <b>-20 dB/década</b>.
      `;
      phaseRules = `
        • <b>Para ω ≤ ${(factor.wc/10).toFixed(2)} rad/s:</b> Fase ≈ 0°.<br>
        • <b>En ω<sub>c</sub> = ${factor.wc.toFixed(2)} rad/s:</b> Fase exactamente igual a <b>-45°</b>.<br>
        • <b>Para ω ≥ ${(factor.wc*10).toFixed(2)} rad/s:</b> Fase tiende asintóticamente a <b>-90°</b>.<br>
        • <b>Zona de transición [0.1ω<sub>c</sub> , 10ω<sub>c</sub>]:</b> Pendiente de fase de <b>-45°/década</b>.
      `;
      intuition = `Comportamiento de filtro pasa-bajos de 1er orden. Atenúa señales de alta frecuencia y añade atraso temporal a la respuesta.`;
    } else if (factor.type === 'real_zero') {
      const tau = 1 / factor.wc;
      mathEq = `G_i(s) = 1 + \\frac{s}{${factor.wc.toFixed(2)}} = 1 + ${tau.toFixed(3)}s`;
      magRules = `
        • <b>Para ω &lt; ${factor.wc.toFixed(2)} rad/s:</b> Asíntota plana en <b>0 dB</b>.<br>
        • <b>En ω<sub>c</sub> = ${factor.wc.toFixed(2)} rad/s:</b> La curva real sube <b>+3.01 dB</b> sobre la esquina.<br>
        • <b>Para ω &gt; ${factor.wc.toFixed(2)} rad/s:</b> Sube con pendiente de <b>+20 dB/década</b>.
      `;
      phaseRules = `
        • <b>Para ω ≤ ${(factor.wc/10).toFixed(2)} rad/s:</b> Fase ≈ 0°.<br>
        • <b>En ω<sub>c</sub> = ${factor.wc.toFixed(2)} rad/s:</b> Adelanto de fase de <b>+45°</b>.<br>
        • <b>Para ω ≥ ${(factor.wc*10).toFixed(2)} rad/s:</b> Adelanto angular asintótico de <b>+90°</b>.
      `;
      intuition = `Comportamiento de red de adelanto. Ayuda a frenar oscilaciones y mejorar el margen de fase.`;
    } else if (factor.type === 'complex_pole') {
      mathEq = `G_i(s) = \\frac{1}{1 + 2\\zeta(s/\\omega_n) + (s/\\omega_n)^2}`;
      magRules = `
        • <b>Para ω &lt; ω<sub>n</sub>:</b> Asíntota horizontal en <b>0 dB</b>.<br>
        • <b>Para ω &gt; ω<sub>n</sub>:</b> Cae con pendiente de <b>-40 dB/década</b>.<br>
        • <b>Cerca de ω<sub>n</sub>:</b> Aparece un pico de resonancia si el coeficiente de amortiguamiento ζ &lt; 0.707.
      `;
      phaseRules = `
        • Pasa de <b>0°</b> en baja frecuencia a <b>-180°</b> en alta frecuencia.<br>
        • En la frecuencia natural <b>ω = ω<sub>n</sub></b>, la fase es exactamente <b>-90°</b>.
      `;
      intuition = `Par oscilatorio subamortiguado. Cuanto menor sea ζ, mayor será el pico resonante en frecuencia y las oscilaciones temporales.`;
    }

    desc = `
      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>Ecuación Canónica del Factor:</b></p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(mathEq, true)}
        </div>
        <p style="color:#cbd5e1; font-size:11px;">${factor.desc}</p>
      </div>

      <div style="background:#11111e; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>📐 Regla Asintótica en Magnitud (Subplot Superior):</b></p>
        <div style="font-size:11px; line-height:1.5; color:#cbd5e1;">${magRules}</div>
      </div>

      <div style="background:#11111e; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>📐 Regla Asintótica en Fase (Subplot Inferior):</b></p>
        <div style="font-size:11px; line-height:1.5; color:#cbd5e1;">${phaseRules}</div>
      </div>

      <div class="pedagogy-tip">
        <b>⚙️ Significado Físico:</b> ${intuition}
      </div>
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
    title = `Paso ${state.step}: Suma Asintótica Total e Intervalos de Frecuencia`;
    const intervals = state.bodeComps.intervals || [];

    desc = `
      <p>En el diagrama de Bode, gracias a la escala logarítmica, multiplicar factores equivale a <b>sumar algebraicamente</b> sus magnitudes en dB y sus fases en grados:</p>
      <div style="text-align:center; margin:4px 0; background:#11111e; padding:6px; border-radius:4px;">
        ${renderTex(`20\\log_{10}|G(j\\omega)| = \\sum_{i} 20\\log_{10}|G_i(j\\omega)| \\quad , \\quad \\angle G(j\\omega) = \\sum_{i} \\angle G_i(j\\omega)`, true)}
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-lbl">Pendiente Inicial (Baja Frec)</div>
          <div class="metric-val" style="color:${metrics && metrics.systemType > 0 ? '#38bdf8' : '#4ade80'};">${metrics ? (-20 * metrics.systemType) : 0} dB/dec</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Pendiente Final (Alta Frec)</div>
          <div class="metric-val" style="color:#f87171;">${metrics ? (-20 * metrics.relDegree) : 0} dB/dec</div>
        </div>
      </div>

      <p><b>Tabla de Intervalos de Frecuencia y Pendientes:</b></p>
      <table class="sol-table" style="margin:6px 0;">
        <thead>
          <tr>
            <th>Intervalo de Frecuencia</th>
            <th>Factores que Entran</th>
            <th>Pendiente Neta</th>
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

      <div class="pedagogy-tip">
        <b>💡 Regla Mnemotécnica de Bode:</b> Cada polo simple quiebra la recta hacia abajo sumando <b>-20 dB/dec</b> a la pendiente previa a partir de su frecuencia de corte. Cada cero quiebra hacia arriba sumando <b>+20 dB/dec</b>. La pendiente se mantiene constante entre quiebres consecutivos.
      </div>
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
    title = `Paso ${state.step}: Curva Real vs. Aproximación Asintótica y Correcciones`;
    desc = `
      <div style="display:flex; gap:12px; margin-bottom:6px;">
        <span style="color:#00e5ff; font-weight:bold;">— Curva Real Exacta</span>
        <span style="color:#94a3b8; font-weight:bold;">- - Asíntota Lineal</span>
      </div>
      <p>La aproximación asintótica lineal es muy precisa lejos de las esquinas, pero en las inmediaciones de cada corte <b>ω<sub>c</sub></b> existe una discrepancia conocida como <b>error de esquina</b>:</p>

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>Tabla de Corrección de Errores para Polos Simples:</b></p>
        <table class="sol-table" style="margin:4px 0;">
          <thead>
            <tr>
              <th>Frecuencia Relativa</th>
              <th>Error en Magnitud</th>
              <th>Fase Real vs Asintótica</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>En el quiebre (ω = ω<sub>c</sub>)</b></td>
              <td style="color:#f87171;"><b>-3.01 dB</b> (Curva real pasa por debajo)</td>
              <td><b>-45°</b> (Coincide exactamente)</td>
            </tr>
            <tr>
              <td><b>Una octava (0.5ω<sub>c</sub> o 2ω<sub>c</sub>)</b></td>
              <td style="color:#fbbf24;"><b>-0.97 dB</b> (≈ -1 dB)</td>
              <td>Diferencia de ≈ ±5.7°</td>
            </tr>
            <tr>
              <td><b>Una década (0.1ω<sub>c</sub> o 10ω<sub>c</sub>)</b></td>
              <td style="color:#4ade80;"><b>-0.04 dB</b> (Despreciable)</td>
              <td>Diferencia de &lt; 5°</td>
            </tr>
          </tbody>
        </table>
        <div style="text-align:center; margin-top:4px;">
          ${renderTex(`|G(j\\omega_c)|_{real} = \\frac{1}{\\sqrt{1 + 1^2}} = \\frac{1}{\\sqrt{2}} \\approx -3.01\\text{ dB}`, true)}
        </div>
      </div>

      <div class="pedagogy-tip">
        <b>💡 Cómo dibujar a mano en papel semilogarítmico:</b> Traza primero las líneas asintóticas con regla. En cada ω<sub>c</sub> marca un punto a -3 dB (o +3 dB si es cero). A 0.5ω<sub>c</sub> y 2ω<sub>c</sub> marca puntos a -1 dB. Une los puntos con una curva suave redondeada.
      </div>
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
    title = `Paso Final: Cruces de Frecuencia y Márgenes de Estabilidad`;
    const pm = state.margins.PM;
    const gm = state.margins.GM;
    const w_gc = state.margins.w_gc;
    const w_pc = state.margins.w_pc;
    const isStable = (pm === null || pm > 0) && (gm === null || gm > 0);

    desc = `
      <p>Los cruces de frecuencia definen la robustez y estabilidad del lazo cerrado:</p>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-lbl">Cruce Ganancia (ω_cg)</div>
          <div class="metric-val">${w_gc ? w_gc.toFixed(3) + ' rad/s' : 'No cruza'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Margen de Fase (MF)</div>
          <div class="metric-val" style="color:${pm !== null && pm > 0 ? '#4ade80' : '#f87171'}">${pm !== null ? pm.toFixed(1) + '°' : '∞'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Cruce Fase (ω_cp)</div>
          <div class="metric-val">${w_pc ? w_pc.toFixed(3) + ' rad/s' : 'No cruza'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Margen Ganancia (MG)</div>
          <div class="metric-val" style="color:${gm !== null && gm > 0 ? '#4ade80' : '#f87171'}">${gm !== null ? gm.toFixed(1) + ' dB' : '∞'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Retardo Crítico Permisible</div>
          <div class="metric-val" style="color:#a78bfa;">${metrics && metrics.tauCritMs ? metrics.tauCritMs.toFixed(1) + ' ms' : (metrics && metrics.tauCrit ? metrics.tauCrit.toFixed(3) + ' s' : '—')}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Factor Ganancia Máx</div>
          <div class="metric-val" style="color:#38bdf8;">${metrics && metrics.kFactor ? metrics.kFactor.toFixed(2) + 'x' : '—'}</div>
        </div>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>Deducción Matemática de Cruces:</b></p>
        <div style="margin:4px 0; text-align:center;">
          ${renderTex(`|G(j\\omega_{cg})| = 1 \\ (0\\text{ dB}) \\quad \\Longrightarrow \\quad MF = 180^\\circ + \\angle G(j\\omega_{cg}) = ${pm !== null ? pm.toFixed(2) + '^\\circ' : '\\infty'}`, true)}
        </div>
        <div style="margin:4px 0; text-align:center;">
          ${renderTex(`\\angle G(j\\omega_{cp}) = -180^\\circ \\quad \\Longrightarrow \\quad MG = -20\\log_{10}|G(j\\omega_{cp})| = ${gm !== null ? gm.toFixed(2) + '\\text{ dB}' : '\\infty'}`, true)}
        </div>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>Estimación de Parámetros Temporales (Modelo de 2do Orden):</b></p>
        <p>• Coeficiente de amortiguamiento estimado: <b>ζ ≈ MF / 100 = ${metrics && metrics.zetaEst ? metrics.zetaEst.toFixed(2) : '—'}</b></p>
        <p>• Sobreimpulso esperado: <b>M<sub>p</sub> ≈ ${metrics && metrics.mpEst !== null ? metrics.mpEst.toFixed(1) + '%' : '—'}</b></p>
        <p>• Tiempo de subida estimado: <b>t<sub>r</sub> ≈ 1.8 / ω<sub>cg</sub> = ${metrics && metrics.trEst ? metrics.trEst.toFixed(3) + ' s' : '—'}</b></p>
      </div>

      <p><b>Veredicto de Estabilidad en Lazo Cerrado:</b></p>
      <p class="badge ${isStable ? 'badge-success' : 'badge-danger'}">${isStable ? '✅ Lazo Cerrado ESTABLE (MF > 0 y MG > 0)' : '❌ Lazo Cerrado INESTABLE o MARGINAL'}</p>
      
      <div class="pedagogy-tip">
        <b>🎯 Criterio de Diseño Industrial:</b> Para un control óptimo se recomienda <b>MF entre 45° y 60°</b> y <b>MG entre 6 dB y 12 dB</b>. Si el margen de fase es bajo, el sistema oscilará excesivamente; puedes corregirlo diseñando un <b>Compensador de Adelanto</b> en la pestaña correspondiente.
      </div>
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
  explanationBody.innerHTML = cleanMath(desc);

  const layout = {
    ...darkLayoutCommon,
    dragmode: getEffectiveDragMode(),
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
    name: 'Punto Crítico -1+j0',
    text: ['-1+j0'],
    textposition: 'top left',
    marker: { color: '#ef4444', size: 12, symbol: 'x', line: { width: 3 } }
  });

  const denRoots = findRoots(state.parsedTF.den);
  const P = denRoots.filter(r => r.re > 1e-5).length;
  const kStability = calculateKStabilityRange(state.parsedTF.num, state.parsedTF.den, state.margins);
  const N = 0; // Conteo neto de rodeos horarios para sistemas de fase mínima estables
  const Z = N + P;
  const metrics = getControlMetrics();

  if (state.step === 0) {
    title = "Paso 0: Principio de Cauchy, Tipo de Sistema y Contorno de Nyquist";
    const sysType = metrics ? metrics.systemType : 0;
    const relDeg = metrics ? metrics.relDegree : 1;
    const typeDesc = sysType === 0
      ? `Tipo 0: Sin integradores en lazo abierto. La curva de Nyquist <b>arranca en un punto finito</b> en el eje real al aumentar ω desde 0⁺ (no desde el infinito).`
      : sysType === 1
      ? `Tipo 1: Un polo en el origen (s = 0). La curva de Nyquist sale desde <b>∞ con ángulo −90°</b>. El semicírculo infinitesimal ε·e<sup>jθ</sup> se mapea en un arco de radio infinito que barre −90° hacia 0°.`
      : sysType === 2
      ? `Tipo 2: Dos polos en el origen. La curva de Nyquist sale desde <b>∞ con ángulo −180°</b>. El mapa del contorno en el origen es un arco de radio infinito que barre de −180° hasta 0°.`
      : `Tipo ${sysType}: La curva arranca desde ∞ con ángulo −${sysType * 90}°.`;

    desc = `
      <p>El criterio de Nyquist es una aplicación del <b>Principio del Argumento de Cauchy</b> para evaluar la estabilidad absoluta en lazo cerrado sin necesidad de factorizar el polinomio característico:</p>

      <div style="background:#11111e; padding:8px; border-radius:6px; margin:6px 0; text-align:center;">
        ${renderTex('Z = N + P', true)}
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-lbl">Tipo de Sistema</div>
          <div class="metric-val" style="color:#a78bfa;">${sysType}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Grado Relativo (n-m)</div>
          <div class="metric-val" style="color:#ffd700;">${relDeg}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Polos Inestables Abierto (P)</div>
          <div class="metric-val" style="color:${P === 0 ? '#4ade80' : '#f87171'}">${P}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Condición de Estabilidad</div>
          <div class="metric-val" style="color:#00e5ff;">N = ${-P} (Z = 0)</div>
        </div>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>📐 Tipo de Sistema y Comportamiento en ω → 0⁺:</b></p>
        <p style="font-size:12px; margin-top:4px;">${typeDesc}</p>
        <p style="font-size:11px; color:#94a3b8; margin-top:3px;">El contorno de Nyquist incluye: eje imaginario positivo (ω: 0⁺ → +∞), semicírculo a ∞ sentido horario (+∞ → −∞), eje imaginario negativo (−∞ → 0⁻). El mapeo de toda la frontera del semiplano derecho da lugar a la trayectoria polar completa.</p>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>📐 Comportamiento en ω → ∞:</b></p>
        <p style="font-size:12px; margin-top:4px;">El grado relativo r = n − m = ${relDeg} determina el ángulo de llegada al origen:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`\\angle G(j\\omega) \\xrightarrow{\\omega\\to\\infty} -${relDeg} \\times 90^\\circ = -${relDeg * 90}^\\circ`, true)}
        </div>
        <p style="font-size:11px; color:#94a3b8;">Para dibujar a mano: el trazo parte de ${sysType === 0 ? 'un punto finito en el eje real' : `∞ con ángulo −${sysType * 90}°`} y termina en el origen con ángulo −${relDeg * 90}°.</p>
      </div>

      ${state.parsedTF.hasK ? `
        <div style="background:rgba(245, 158, 11, 0.12); border:1px solid #f59e0b; padding:8px; border-radius:6px; margin:6px 0;">
          <b style="color:#fbbf24;">🔍 Parámetro de Ganancia K detectado:</b>
          <p style="font-size:11px; margin-top:2px;">La gráfica nominal se muestra para <b>K = 1</b>. Escalar K equivale a ampliar/contraer toda la trayectoria polar proporcionalmente.</p>
          <p style="font-size:12px; margin-top:4px;">Rango de estabilidad para K: <b style="color:#4ade80;">${kStability.kRangeStr}</b></p>
        </div>
      ` : `
        <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
          <b>⚖️ Rango de Estabilidad para Ganancia K:</b>
          <p style="font-size:12px; margin-top:3px;">Condición para estabilidad: <b style="color:#4ade80;">${kStability.kRangeStr}</b></p>
        </div>
      `}

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>📌 Definición de Variables del Criterio:</b></p>
        <p style="margin-top:4px;">• <b>P:</b> Polos de lazo abierto en el semiplano derecho (Re > 0). Este sistema: <b>P = ${P}</b>.</p>
        <p>• <b>N:</b> Número de rodeos netos en sentido <i>horario</i> al punto crítico <b>−1 + j0</b>. Antihorario cuenta negativo.</p>
        <p>• <b>Z:</b> Polos inestables de lazo cerrado. Se necesita <b>Z = 0</b> para estabilidad asintótica.</p>
        <p style="margin-top:4px; color:#94a3b8; font-size:11px;">Para que Z = 0 con P = ${P}: se necesita N = ${-P} (${P === 0 ? 'la curva no debe rodear el punto -1' : `la curva debe rodear el punto -1 en sentido ANTIHORARIO ${P} veces`}).</p>
      </div>

      <div class="pedagogy-tip">
        <b>💡 Estrategia de Examen:</b> Para resolver Nyquist a mano:<br>
        1. Determinar Tipo de Sistema → punto de arranque.<br>
        2. Calcular polos/ceros → ángulo de fase a baja y alta frecuencia.<br>
        3. Encontrar ω<sub>cp</sub> igualando Im{G(jω)} = 0 → calcular K<sub>crit</sub> = 1/|Re{G(jω<sub>cp</sub>)}|.<br>
        4. Contar rodeos N → concluir Z = N + P.
      </div>
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
      const relDeg = metrics ? metrics.relDegree : 1;
      const sysType = metrics ? metrics.systemType : 0;
      const wCp = state.margins && state.margins.w_pc ? state.margins.w_pc.toFixed(4) : '—';
      const xCp = state.margins && state.margins.intersect_x != null ? state.margins.intersect_x.toFixed(4) : '—';
      const kCrit = kStability.kCrit ? kStability.kCrit.toFixed(4) : '∞';

      title = "Paso 1: Trazo Polar y Deducción Analítica de K_crit";
      desc = `
        <p>Mapeo del eje imaginario positivo <b>s = jω</b> desde <b>ω = 0<sup>+</sup> hasta +∞</b>:</p>
        <p>• Cada punto en la curva representa el vector complejo <b>G(jω) = |G(jω)| e<sup>j∠G(jω)</sup></b>.</p>
        <p>• La flecha <b style="color:#ffd700">DORADA</b> indica el sentido de avance al aumentar ω.</p>
        <p>• Al crecer ω → +∞: magnitud → 0 con ángulo asintótico <b>−${relDeg * 90}°</b> (grado relativo r = ${relDeg}).</p>

        <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
          <p><b>📐 Deducción Analítica de ω<sub>cp</sub> y K<sub>crit</sub> (Procedimiento de Examen):</b></p>
          <p style="font-size:11px; margin-top:4px; color:#94a3b8;">La frecuencia de cruce de fase ω<sub>cp</sub> es donde la curva corta el eje real negativo, es decir donde la parte imaginaria se anula:</p>
          <div style="text-align:center; margin:4px 0;">
            ${renderTex('\\text{Im}\\{G(j\\omega_{cp})\\} = 0 \\quad \\Rightarrow \\quad \\text{resolver para } \\omega_{cp}', true)}
          </div>
          <p style="font-size:11px; color:#94a3b8; margin-top:3px;">Una vez hallado ω<sub>cp</sub>, se evalúa la parte real:</p>
          <div style="text-align:center; margin:4px 0;">
            ${renderTex('x_{cp} = \\text{Re}\\{G(j\\omega_{cp})\\}', true)}
          </div>
          <p style="font-size:11px; color:#94a3b8; margin-top:3px;">La ganancia crítica es la ganancia K que lleva ese punto exactamente al punto crítico −1:</p>
          <div style="text-align:center; margin:4px 0;">
            ${renderTex('K \\cdot x_{cp} = -1 \\quad \\Rightarrow \\quad K_{crit} = \\frac{1}{|x_{cp}|}', true)}
          </div>
          <div class="metric-grid" style="margin-top:6px;">
            <div class="metric-card">
              <div class="metric-lbl">ω<sub>cp</sub> (rad/s)</div>
              <div class="metric-val" style="color:#ffd700;">${wCp}</div>
            </div>
            <div class="metric-card">
              <div class="metric-lbl">x<sub>cp</sub> = Re{G(jω<sub>cp</sub>)}</div>
              <div class="metric-val" style="color:#f87171;">${xCp}</div>
            </div>
            <div class="metric-card">
              <div class="metric-lbl">K<sub>crit</sub> = 1/|x<sub>cp</sub>|</div>
              <div class="metric-val" style="color:#4ade80;">${kCrit}</div>
            </div>
            <div class="metric-card">
              <div class="metric-lbl">Estabilidad</div>
              <div class="metric-val" style="color:#00e5ff;">${kStability.kRangeStr}</div>
            </div>
          </div>
        </div>

        <div style="text-align:center; margin:8px 0;">
          <button id="btnOpenTableInline" class="btn-primary" style="font-size:11px; padding:6px 12px; background:#059669;">📋 Ver Tabulación de Puntos para Dibujo a Mano</button>
        </div>

        <div class="pedagogy-tip">
          <b>💡 Cómo trazar Nyquist a mano en examen:</b><br>
          1. Calcula |G(jω)| y ∠G(jω) para al menos 5 frecuencias (tabla de tabulación).<br>
          2. Usa coordenadas polares → Cartesianas: Re = |G|·cos(∠G), Im = |G|·sin(∠G).<br>
          3. Marca los puntos en el plano complejo y únelos con curva suave.<br>
          4. Traza el reflejo (parte inferior) por simetría respecto al eje real.<br>
          5. Verifica si la curva rodea el punto −1 para concluir estabilidad.
        </div>
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
      title = "Paso 2: Simetría Conjugada para Frecuencias Negativas (ω < 0)";
      desc = `
        <p>Dado que la función de transferencia tiene coeficientes reales, satisface la <b>propiedad de simetría hermitiana</b>:</p>
        <div style="background:#11111e; padding:6px; border-radius:4px; margin:4px 0; text-align:center;">
          ${renderTex('G(-j\\omega) = G(j\\omega)^* = \\text{Re}[G(j\\omega)] - j\\text{Im}[G(j\\omega)]', true)}
        </div>
        <p>• La parte real es una función <b>par</b> y la parte imaginaria es <b>impar</b>.</p>
        <p>• Gráficamente, el recorrido para frecuencias negativas es la <b>imagen especular exacta</b> (reflejo sobre el eje horizontal real).</p>
        <p>• La flecha <b style="color:#ffa726">NARANJA</b> muestra que el recorrido viene desde -∞ hacia 0<sup>-</sup>.</p>
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
      title = "Paso 3: Círculo Unitario e Interpretación de Márgenes";
      desc = `
        <p>El círculo punteado tiene radio <b>|G(jω)| = 1.0 (0 dB)</b>:</p>
        
        <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
          <p><b>1. Margen de Fase (MF) en el Plano Polar:</b></p>
          <p>Se mide en el punto de corte con el círculo unitario (frecuencia <b>ω<sub>cg</sub> = ${metrics && metrics.w_gc ? metrics.w_gc.toFixed(2) + ' rad/s' : '—'}</b>). Es el ángulo desde el rayo real negativo (-180°) hasta el vector:</p>
          <p>• <b>MF = ${metrics && metrics.pm !== null ? metrics.pm.toFixed(1) + '°' : '∞'}</b></p>
        </div>

        <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
          <p><b>2. Margen de Ganancia (MG) en el Plano Polar:</b></p>
          <p>Se mide en el cruce con el eje real negativo (frecuencia <b>ω<sub>cp</sub> = ${metrics && metrics.w_pc ? metrics.w_pc.toFixed(2) + ' rad/s' : '—'}</b>). Si corta en el punto -a, entonces MG = 1/a:</p>
          <p>• <b>MG = ${metrics && metrics.gm !== null ? metrics.gm.toFixed(1) + ' dB' : '∞'}</b></p>
        </div>

        <div class="pedagogy-tip">
          <b>🎯 Vector 1 + G(jω):</b> La distancia más corta desde la trayectoria de Nyquist hasta el punto crítico <b>-1+j0</b> representa el pico de resonancia de la función de sensibilidad inversa 1/|S(jω)|. Cuanto más alejada pase la curva del punto -1, más robusto será el lazo cerrado.
        </div>
      `;
    }
  }

  if (state.step >= 4) {
    title = "Paso Final: Criterio de Estabilidad Absoluta de Nyquist";
    const isStable = Z === 0;

    desc = `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-lbl">Polos Lazo Abierto (P)</div>
          <div class="metric-val">${P}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Rodeos Horarios a -1 (N)</div>
          <div class="metric-val">${N}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Polos Inestables Cerrado (Z)</div>
          <div class="metric-val" style="color:${isStable ? '#4ade80' : '#f87171'}">${Z}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Estado del Sistema</div>
          <div class="metric-val" style="color:${isStable ? '#4ade80' : '#f87171'}">${isStable ? 'ESTABLE' : 'INESTABLE'}</div>
        </div>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:6px;">
        <h4 style="color:#ffd700; margin-bottom:4px;">⚖️ Rango Crítico de Ganancia K para Estabilidad:</h4>
        <p>• Condición de Estabilidad: <b style="color:#4ade80; font-size:13px;">${kStability.kRangeStr}</b></p>
        <p style="font-size:11px; color:#cbd5e1; margin-top:3px;">${kStability.verdict}</p>
        ${kStability.kCrit ? `<p style="font-size:11px; color:#38bdf8; margin-top:2px;">Ganancia Crítica: <b>K_crit = ${kStability.kCrit.toFixed(3)}</b> | Frecuencia de oscilación: <b>ω_cp = ${kStability.w_pc.toFixed(3)} rad/s</b></p>` : ''}
      </div>

      <div style="text-align:center; margin:8px 0;">
        <button id="btnOpenTableInline" class="btn-primary" style="font-size:11px; padding:6px 12px; background:#059669;">📋 Ver Tabulación de Puntos para Dibujo</button>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:6px;">
        <p><b>Balance de Polos según Cauchy:</b></p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`Z = N + P = ${N} + ${P} = ${Z}`, true)}
        </div>
        <p style="font-size:11px; color:#cbd5e1;">Como Z = ${Z}, ${isStable ? 'no existen polos en el semiplano derecho para el sistema en lazo cerrado.' : 'el lazo cerrado posee ' + Z + ' polo(s) inestable(s).'}</p>
      </div>

      <p class="badge ${isStable ? 'badge-success' : 'badge-danger'}">${isStable ? '✅ Sistema ESTABLE en Lazo Cerrado (Z = 0)' : '❌ Sistema INESTABLE en Lazo Cerrado (Z > 0)'}</p>
      <p style="color:#94a3b8; font-size:11px; margin-top:4px;">💡 Presiona <b>🎯 Centrar en -1</b> para inspeccionar la cercanía de la curva al punto crítico.</p>
    `;
  }

  explanationTitle.textContent = title;
  explanationBody.innerHTML = cleanMath(desc);

  // Hook up inline tabulation button if present in the card
  const btnInline = document.getElementById('btnOpenTableInline');
  if (btnInline) {
    btnInline.addEventListener('click', () => {
      populateNyquistTableModal();
      modalNyquistTable.classList.remove('hidden');
    });
  }

  // Viewport inteligente enfocado en el rango relevante para evitar aplanamiento
  const layout = {
    ...darkLayoutCommon,
    dragmode: getEffectiveDragMode(),
    xaxis: { title: 'Parte Real', gridcolor: '#33334d', zerolinecolor: '#ffffff', range: [-2.4, 1.4] },
    yaxis: { title: 'Parte Imaginaria', gridcolor: '#33334d', zerolinecolor: '#ffffff', range: [-1.8, 1.8] }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// ==========================================
// 3. LUGAR DE LAS RAÍCES (ROOT LOCUS)
// ==========================================
function renderLocusPlot() {
  state.maxSteps = 3;
  stepCounter.textContent = `Paso ${state.step} de ${state.maxSteps}`;
  btnPrevStep.disabled = state.step === 0;
  btnNextStep.disabled = state.step === state.maxSteps;

  const traces = [];
  const poles = findRoots(state.parsedTF.den);
  const zeros = findRoots(state.parsedTF.num);
  const n = poles.length;
  const m = zeros.length;
  const numAsymptotes = n - m;

  // Polos base (K = 0)
  if (poles.length > 0) {
    traces.push({
      x: poles.map(p => p.re),
      y: poles.map(p => p.im),
      mode: 'markers',
      type: 'scatter',
      name: 'Polos (K=0)',
      marker: { color: '#ef4444', size: 10, symbol: 'x', line: { width: 2.5 } }
    });
  }

  // Ceros base (K = infinito)
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

  // Dibujar ramas si el paso >= 1
  if (state.step >= 1) {
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
  }

  // Centroide y ángulos de asíntotas
  let sigmaA = 0;
  let sumP = 0;
  let sumZ = 0;
  if (numAsymptotes > 0) {
    sumP = poles.reduce((acc, p) => acc + p.re, 0);
    sumZ = zeros.reduce((acc, z) => acc + z.re, 0);
    sigmaA = (sumP - sumZ) / numAsymptotes;

    // Dibujar asíntotas si el paso >= 1
    for (let k = 0; k < numAsymptotes; k++) {
      const th = ((2 * k + 1) * Math.PI) / numAsymptotes;
      const L = 10;
      traces.push({
        x: [sigmaA, sigmaA + L * Math.cos(th)],
        y: [0, L * Math.sin(th)],
        mode: 'lines',
        type: 'scatter',
        name: `Asíntota θ_${k}`,
        line: { color: '#64748b', dash: 'dash', width: 1.2 },
        hoverinfo: 'none'
      });
    }
  }

  let title = "";
  let desc = "";

  if (state.step === 0) {
    title = "Paso 0: Polos, Ceros y Segmentos en el Eje Real";
    desc = `
      <p>El Lugar de las Raíces traza la trayectoria de los polos en lazo cerrado <b>1 + K·G(s) = 0</b> cuando la ganancia <b>K</b> varía desde 0 hasta +∞:</p>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-lbl">Polos Lazo Abierto (n)</div>
          <div class="metric-val" style="color:#ef4444;">${n}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Ceros Lazo Abierto (m)</div>
          <div class="metric-val" style="color:#3b82f6;">${m}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Ramas al Infinito (n - m)</div>
          <div class="metric-val">${numAsymptotes}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Puntos Iniciales (K=0)</div>
          <div class="metric-val" style="color:#ef4444;">Polos (X)</div>
        </div>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>📐 Regla del Eje Real de Evans:</b></p>
        <p>Un punto sobre el eje real pertenece al lugar de las raíces si y sólo si el número total de polos y ceros reales a su derecha es <b>IMPAR</b>.</p>
      </div>

      <div class="pedagogy-tip">
        <b>💡 Tip de Examen:</b> Siempre comienza ubicando los polos con una <b>'X'</b> y los ceros con una <b>'O'</b>. Sombrea los tramos del eje real donde la cuenta acumulada de singularidades a la derecha sea 1, 3, 5...
      </div>
    `;
  } else if (state.step === 1) {
    title = "Paso 1: Ramas hacia el Infinito y Centroide de Asíntotas";
    const asympDeg = numAsymptotes > 0 ? Array.from({ length: numAsymptotes }, (_, k) => (((2 * k + 1) * 180) / numAsymptotes).toFixed(1) + '°').join(', ') : 'No aplica';

    desc = `
      <p>Cuando K → ∞, <b>${m}</b> ramas terminan en los ceros finitos y <b>${numAsymptotes}</b> ramas escapan hacia el infinito guiadas por asíntotas lineales:</p>

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>1. Centroide de las Asíntotas (σ<sub>a</sub>):</b></p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`\\sigma_a = \\frac{\\sum \\text{Re}(p_i) - \\sum \\text{Re}(z_i)}{n - m} = \\frac{(${sumP.toFixed(2)}) - (${sumZ.toFixed(2)})}{${numAsymptotes}} = ${sigmaA.toFixed(3)}`, true)}
        </div>
        <p>Es el punto del eje real donde intersectan todas las líneas asintóticas.</p>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>2. Ángulos de Partida de las Asíntotas (θ<sub>k</sub>):</b></p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`\\theta_k = \\frac{(2k + 1)180^\\circ}{n - m} \\quad \\Longrightarrow \\quad \\theta = [${asympDeg}]`, true)}
        </div>
      </div>

      <div class="pedagogy-tip">
        <b>💡 Simetría:</b> El Lugar de las Raíces siempre es simétrico respecto al eje real, ya que las raíces complejas siempre vienen en pares conjugados.
      </div>
    `;
  } else if (state.step === 2) {
    title = "Paso 2: Puntos de Ruptura y Confluencia (Breakaway / Break-in)";
    desc = `
      <p>Cuando dos ramas en el eje real viajan la una hacia la otra al aumentar K, deben chocar y salir al plano complejo como raíces complejas conjugadas:</p>

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>Condición Analítica de Ruptura:</b></p>
        <p>De la ecuación característica <b>1 + K·G(s) = 0</b>, despejamos K:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex('K = -\\frac{D(s)}{N(s)} \\quad \\Longrightarrow \\quad \\frac{dK}{ds} = 0', true)}
        </div>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex('N(s)D\'(s) - D(s)N\'(s) = 0', true)}
        </div>
        <p style="font-size:11px; color:#cbd5e1;">Las soluciones de esta ecuación que caen en un segmento válido del eje real corresponden a los puntos de ruptura (ángulo de salida de <b>±90°</b> para dos ramas).</p>
      </div>

      <div class="pedagogy-tip">
        <b>⚙️ Interpretación Dinámica:</b> A partir del punto de ruptura, el sistema pasa de ser sobreamortiguado (raíces reales distintas) a subamortiguado (raíces complejas con oscilaciones).
      </div>
    `;
  } else {
    title = "Paso Final: Cruce del Eje Imaginario y Margen de Ganancia K";
    desc = `
      <p>El eje imaginario (<b>Re(s) = 0</b>) separa la región de estabilidad asintótica de la inestabilidad:</p>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-lbl">Semiplano Izquierdo (Re &lt; 0)</div>
          <div class="metric-val" style="color:#4ade80;">Estable</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Semiplano Derecho (Re &gt; 0)</div>
          <div class="metric-val" style="color:#f87171;">Inestable</div>
        </div>
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin:6px 0;">
        <p><b>Determinación del Cruce con el Eje jω:</b></p>
        <p>Se evalúa la condición de Routh-Hurwitz o se sustituye <b>s = jω</b> en la ecuación característica:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex('1 + K_{crit} G(j\\omega_{crit}) = 0', true)}
        </div>
        <p>• Si las ramas nunca cruzan hacia el semiplano derecho, el sistema es <b>estable para cualquier K &gt; 0</b>.</p>
        <p>• Si las ramas cruzan en ω<sub>crit</sub>, ese valor define la ganancia máxima antes de entrar en oscilación sostenida.</p>
      </div>

      <div class="pedagogy-tip">
        <b>🎯 Control Práctico:</b> Al mover la ganancia K, los polos se mueven a lo largo de las ramas. Diseñar un controlador proporcional consiste en elegir un K tal que los polos dominantes ofrezcan el amortiguamiento deseado (ζ = cos θ).
      </div>
    `;
  }

  explanationTitle.textContent = title;
  explanationBody.innerHTML = cleanMath(desc);

  const layout = {
    ...darkLayoutCommon,
    dragmode: getEffectiveDragMode(),
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
  const wMin = state.wList[0];
  const wMax = state.wList[state.wList.length - 1];

  const traces = [
    // Subplot 1: Magnitud (dB)
    {
      x: [wMin, wMax],
      y: [0, 0],
      xaxis: 'x',
      yaxis: 'y',
      name: '0 dB',
      line: { color: '#ffffff', width: 0.9, dash: 'dot' }
    },
    {
      x: state.wList,
      y: res.baseResp.mag,
      xaxis: 'x',
      yaxis: 'y',
      name: 'Mag Original G(s)',
      line: { color: '#94a3b8', dash: 'dash', width: 1.8 }
    },
    {
      x: state.wList,
      y: res.compResp.mag,
      xaxis: 'x',
      yaxis: 'y',
      name: 'Mag Compensado G·C(s)',
      line: { color: '#00e5ff', width: 2.5 }
    },

    // Subplot 2: Fase (grados)
    {
      x: [wMin, wMax],
      y: [-180, -180],
      xaxis: 'x2',
      yaxis: 'y2',
      name: '-180°',
      line: { color: '#ef4444', dash: 'dash', width: 1.0 }
    },
    {
      x: state.wList,
      y: res.baseResp.phase,
      xaxis: 'x2',
      yaxis: 'y2',
      name: 'Fase Original G(s)',
      line: { color: '#f59e0b', dash: 'dash', width: 1.8 }
    },
    {
      x: state.wList,
      y: res.compResp.phase,
      xaxis: 'x2',
      yaxis: 'y2',
      name: 'Fase Compensado G·C(s)',
      line: { color: '#ffd700', width: 2.2 }
    }
  ];

  explanationTitle.textContent = `Diseño de Compensador en Frecuencia (${compTypeSelect.value})`;

  const compDesc = `
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-lbl">Margen Fase Original</div>
        <div class="metric-val" style="color:#94a3b8;">${res.baseMargins.PM ? res.baseMargins.PM.toFixed(1) + '°' : '∞'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-lbl">Margen Fase Compensado</div>
        <div class="metric-val" style="color:#00e5ff;">${res.compMargins.PM ? res.compMargins.PM.toFixed(1) + '°' : '∞'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-lbl">Cruce Ganancia Original</div>
        <div class="metric-val" style="color:#94a3b8;">${res.baseMargins.w_gc ? res.baseMargins.w_gc.toFixed(2) + ' rad/s' : '—'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-lbl">Cruce Ganancia Nuevo</div>
        <div class="metric-val" style="color:#38bdf8;">${res.compMargins.w_gc ? res.compMargins.w_gc.toFixed(2) + ' rad/s' : '—'}</div>
      </div>
    </div>

    <div style="background:#171728; padding:8px; border-radius:6px; margin-bottom:8px;">
      <p><b>Procedimiento de Síntesis y Parámetros Calculados:</b></p>
      <div style="font-size:11px; line-height:1.6; color:#cbd5e1;">
        ${res.explanation.map(exp => `<p style="margin:2px 0;">• ${exp}</p>`).join('')}
      </div>
    </div>

    <div class="pedagogy-tip">
      <b>💡 Efecto en el Dominio Temporal:</b> Un compensador de <b>Adelanto (Lead)</b> aumenta el ancho de banda y la velocidad de respuesta reduciendo el sobreimpulso. Un compensador de <b>Atraso (Lag)</b> eleva la ganancia en baja frecuencia para reducir el error de estado estacionario sin comprometer la estabilidad.
    </div>
    <p style="color:#a78bfa; font-size:11px; margin-top:4px;">👉 Navega a la pestaña <b>Temporal</b> para visualizar la comparación de la respuesta al escalón.</p>
  `;

  explanationBody.innerHTML = cleanMath(compDesc);

  const layout = {
    ...darkLayoutCommon,
    dragmode: getEffectiveDragMode(),
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
  explanationBody.innerHTML = cleanMath(bodyHtml);

  const layout = {
    ...darkLayoutCommon,
    dragmode: getEffectiveDragMode(),
    xaxis: { title: 'Tiempo t (segundos)', gridcolor: '#33334d' },
    yaxis: { title: 'Amplitud y(t)', gridcolor: '#33334d' }
  };

  Plotly.newPlot(plotContainer, traces, layout, plotlyConfig);
}

// ==========================================
// CONTROLES AVANZADOS DE NAVEGACIÓN Y ZOOM
// ==========================================

// Centrar en -1 (Nyquist)
btnFocusCrit.addEventListener('click', () => {
  Plotly.relayout(plotContainer, {
    'xaxis.range': [-2.2, 1.2],
    'yaxis.range': [-1.6, 1.6]
  });
});

// Generador de la solución matemática completa paso a paso
function populateFullSolutionModal() {
  if (!state.parsedTF) return;

  const num = state.parsedTF.num;
  const den = state.parsedTF.den;
  const poles = findRoots(den);
  const zeros = findRoots(num);
  const comps = state.bodeComps ? state.bodeComps.components : [];
  const margins = state.margins || {};
  const kbode = state.bodeComps ? state.bodeComps.k_bode : 1;
  const kbodeDb = state.bodeComps ? state.bodeComps.k_db : 0;
  const realP = state.bodeComps ? state.bodeComps.realPoles : [];
  const realZ = state.bodeComps ? state.bodeComps.realZeros : [];
  const originP = state.bodeComps ? state.bodeComps.originPoles : 0;
  const originZ = state.bodeComps ? state.bodeComps.originZeros : 0;
  const intervals = state.bodeComps ? state.bodeComps.intervals : [];
  const metrics = getControlMetrics();

  const isStable = (margins.PM === null || margins.PM > 0) && (margins.GM === null || margins.GM > 0);

  let html = `
    <!-- 1. Modelo Matemático y Raíces -->
    <div class="sol-section">
      <h3>📐 1. Modelo Matemático, Clasificación y Raíces</h3>
      <p>Función de transferencia de lazo abierto en el plano complejo de Laplace:</p>
      <div class="sol-formula-box">
        ${renderTex(`G(s) = ${state.tfStr}`, true)}
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-lbl">Orden del Sistema (n)</div>
          <div class="metric-val">${poles.length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Ceros Finitos (m)</div>
          <div class="metric-val">${zeros.length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Grado Relativo (n - m)</div>
          <div class="metric-val">${poles.length - zeros.length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Tipo de Sistema (k)</div>
          <div class="metric-val">${originP}</div>
        </div>
      </div>

      <p><b>A. Polos de Lazo Abierto (Raíces de D(s) = 0):</b></p>
      <div class="sol-formula-box">
        ${poles.map((p, i) => {
          let tipo = "Polo real simple";
          if (Math.abs(p.re) < 1e-5 && Math.abs(p.im) < 1e-5) tipo = "Polo en el origen (Integrador puro)";
          else if (Math.abs(p.im) > 1e-5) tipo = "Polo complejo conjugado oscilatorio";
          else if (p.re > 1e-5) tipo = "Polo inestable (Semiplano derecho)";
          return `<div>• ${renderTex(`p_{${i+1}} = ${p.re.toFixed(3)}${p.im >= 0 ? '+' : ''}${p.im.toFixed(3)}j`)} &nbsp; <small style="color:#94a3b8;">(${tipo})</small></div>`;
        }).join('')}
      </div>

      <p><b>B. Ceros de Lazo Abierto (Raíces de N(s) = 0):</b></p>
      <div class="sol-formula-box">
        ${zeros.length > 0 ? zeros.map((z, i) => `<div>• ${renderTex(`z_{${i+1}} = ${z.re.toFixed(3)}${z.im >= 0 ? '+' : ''}${z.im.toFixed(3)}j`)}</div>`).join('') : '<i>Ninguno (el numerador es una ganancia constante pura sin ceros finitos).</i>'}
      </div>
    </div>

    <!-- 2. Conversión a la Forma Canónica de Bode Paso a Paso -->
    <div class="sol-section">
      <h3>📊 2. Conversión a la Forma Canónica de Bode (Paso a Paso)</h3>
      <p>Para construir el trazado de Bode, se expresa cada factor en la forma estándar de constante de tiempo unitaria <b>(1 + τs)</b> o <b>(1 + s/ω<sub>c</sub>)</b>:</p>
      
      <div style="background:#11111e; padding:8px 12px; border-radius:6px; margin:6px 0;">
        <p><b>Paso A: Factorización de términos independientes</b></p>
        ${realP.map(wc => `<p style="margin:4px 0;">• Denominador: <b>(s + ${wc.toFixed(2)}) = ${wc.toFixed(2)} · (1 + s/${wc.toFixed(2)}) = ${wc.toFixed(2)}(1 + ${(1/wc).toFixed(3)}s)</b></p>`).join('')}
        ${realZ.map(wc => `<p style="margin:4px 0;">• Numerador: <b>(s + ${wc.toFixed(2)}) = ${wc.toFixed(2)} · (1 + s/${wc.toFixed(2)}) = ${wc.toFixed(2)}(1 + ${(1/wc).toFixed(3)}s)</b></p>`).join('')}
      </div>

      <div style="background:#11111e; padding:8px 12px; border-radius:6px; margin:6px 0;">
        <p><b>Paso B: Deducción formal de la Ganancia Canónica (K<sub>Bode</sub>)</b></p>
        <p>Dividimos el término constante del numerador entre el producto de constantes extraídas:</p>
        <div style="margin:6px 0; text-align:center;">
          ${renderTex(`K_{Bode} = \\lim_{s \\to 0} s^{${originP - originZ}} G(s) = ${kbode.toFixed(3)}`, true)}
        </div>
        <div style="margin:6px 0; text-align:center;">
          ${renderTex(`K_{dB} = 20\\log_{10}(K_{Bode}) = 20\\log_{10}(${kbode.toFixed(3)}) = ${kbodeDb.toFixed(2)}\\text{ dB}`, true)}
        </div>
        <p style="color:#a78bfa; font-size:11px;">En baja frecuencia, la prolongación de la recta asintótica inicial corta la línea de <b>ω = 1 rad/s</b> exactamente en <b>${kbodeDb.toFixed(2)} dB</b>.</p>
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
      <h3>📈 3. Trazado Asintótico Detallado por Intervalos de Frecuencia</h3>
      <p>En el diagrama de Bode, la curva total de magnitud es la suma acumulada de las pendientes generadas al atravesar cada frecuencia de corte <b>ω<sub>c</sub></b>:</p>
      <table class="sol-table">
        <thead>
          <tr>
            <th>Intervalo de Frecuencia</th>
            <th>Factores que Entran en Juego</th>
            <th>Pendiente Neta Resultante</th>
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
      <div class="pedagogy-tip">
        <b>💡 Comportamiento Asintótico Global:</b> La pendiente en muy baja frecuencia es de <b>${-20 * originP} dB/dec</b> (determinada por los integradores en el origen), y la pendiente final en alta frecuencia es de <b>${-20 * (poles.length - zeros.length)} dB/dec</b> (determinada por el grado relativo n - m).
      </div>
    </div>

    <!-- 4. Deducción Analítica de Cruces y Márgenes -->
    <div class="sol-section">
      <h3>🎯 4. Cruces, Márgenes y Métricas Avanzadas de Desempeño</h3>
      
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-lbl">Cruce Ganancia (ω_cg)</div>
          <div class="metric-val">${margins.w_gc ? margins.w_gc.toFixed(3) + ' rad/s' : 'No cruza'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Margen de Fase (MF)</div>
          <div class="metric-val" style="color:${margins.PM !== null && margins.PM > 0 ? '#4ade80' : '#f87171'}">${margins.PM !== null ? margins.PM.toFixed(1) + '°' : '∞'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Cruce de Fase (ω_cp)</div>
          <div class="metric-val">${margins.w_pc ? margins.w_pc.toFixed(3) + ' rad/s' : 'No cruza'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Margen de Ganancia (MG)</div>
          <div class="metric-val" style="color:${margins.GM !== null && margins.GM > 0 ? '#4ade80' : '#f87171'}">${margins.GM !== null ? margins.GM.toFixed(1) + ' dB' : '∞'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Retardo Crítico (τ_crit)</div>
          <div class="metric-val" style="color:#a78bfa;">${metrics && metrics.tauCritMs ? metrics.tauCritMs.toFixed(1) + ' ms' : (metrics && metrics.tauCrit ? metrics.tauCrit.toFixed(3) + ' s' : '—')}</div>
        </div>
        <div class="metric-card">
          <div class="metric-lbl">Factor Ganancia Máx</div>
          <div class="metric-val" style="color:#38bdf8;">${metrics && metrics.kFactor ? metrics.kFactor.toFixed(2) + 'x' : '—'}</div>
        </div>
      </div>

      <div style="background:#11111e; padding:8px 12px; border-radius:6px; margin-bottom:8px;">
        <p><b>A. Frecuencia de Cruce de Ganancia (ω<sub>cg</sub>) y Margen de Fase (MF):</b></p>
        <p>Se resuelve la ecuación de módulo unitario |G(jω)| = 1 (0 dB):</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`|G(j\\omega_{cg})| = 1 \\quad \\Longrightarrow \\quad \\omega_{cg} \\approx ${margins.w_gc ? margins.w_gc.toFixed(3) : '\\infty'}\\text{ rad/s}`, true)}
        </div>
        <p>Se evalúa la fase en dicha frecuencia:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`MF = 180^\\circ + \\angle G(j\\omega_{cg}) = ${margins.PM !== null ? margins.PM.toFixed(2) : '\\infty'}^\\circ`, true)}
        </div>
      </div>

      <div style="background:#11111e; padding:8px 12px; border-radius:6px; margin-bottom:8px;">
        <p><b>B. Frecuencia de Cruce de Fase (ω<sub>cp</sub>) y Margen de Ganancia (MG):</b></p>
        <p>Se resuelve la ecuación de fase ∠G(jω) = -180°:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`\\angle G(j\\omega_{cp}) = -180^\\circ \\quad \\Longrightarrow \\quad \\omega_{cp} \\approx ${margins.w_pc ? margins.w_pc.toFixed(3) : '\\infty'}\\text{ rad/s}`, true)}
        </div>
        <p>Se evalúa la atenuación en decibelios:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`MG = -20\\log_{10}|G(j\\omega_{cp})| = ${margins.GM !== null ? margins.GM.toFixed(2) : '\\infty'}\\text{ dB}`, true)}
        </div>
      </div>

      <div style="background:#11111e; padding:8px 12px; border-radius:6px; margin-bottom:8px;">
        <p><b>C. Retardo Crítico Permisible (Margen de Tiempo Muerto):</b></p>
        <p>Cantidad máxima de retardo de transporte e<sup>-sτ</sup> que el lazo tolera antes de oscilar:</p>
        <div style="text-align:center; margin:4px 0;">
          ${renderTex(`\\tau_{crit} = \\frac{MF_{\\text{rad}}}{\\omega_{cg}} = \\frac{${margins.PM !== null ? ((margins.PM * Math.PI)/180).toFixed(3) : '0'}}{${margins.w_gc ? margins.w_gc.toFixed(3) : '1'}} \\approx ${metrics && metrics.tauCrit ? metrics.tauCrit.toFixed(4) + '\\text{ s}' : '—'}`, true)}
        </div>
      </div>

      <p><b>Diagnóstico de Estabilidad en Lazo Cerrado:</b></p>
      <p class="badge ${isStable ? 'badge-success' : 'badge-danger'}">
        ${isStable ? '✅ SISTEMA ESTABLE (Margen de Fase y Ganancia Positivos)' : '❌ SISTEMA INESTABLE O CRÍTICO'}
      </p>
    </div>

    <!-- 5. Criterio de Estabilidad de Nyquist -->
    <div class="sol-section">
      <h3>🌀 5. Análisis Completo de Estabilidad de Nyquist</h3>
      <p>Fórmula de Cauchy para lazo cerrado basada en el principio del argumento:</p>
      <div class="sol-formula-box" style="text-align:center;">
        ${renderTex('Z = N + P', true)}
      </div>
      <p>• <b>P (Polos abiertos inestables Re > 0):</b> ${poles.filter(p => p.re > 1e-5).length}</p>
      <p>• <b>N (Rodeos horarios netos al punto crítico -1+j0):</b> 0</p>
      <p>• <b>Z (Polos inestables de lazo cerrado):</b> <b style="color:${poles.filter(p => p.re > 1e-5).length === 0 ? '#4ade80' : '#f87171'}">${poles.filter(p => p.re > 1e-5).length}</b></p>
      <p><b>Conclusión:</b> ${poles.filter(p => p.re > 1e-5).length === 0 ? '<span class="badge badge-success">ESTABLE</span> No existen raíces de lazo cerrado en el semiplano derecho.' : '<span class="badge badge-danger">INESTABLE</span> Existen raíces en el semiplano derecho.'}</p>
    </div>

    <!-- 6. Reglas del Lugar de las Raíces -->
    <div class="sol-section">
      <h3>🎯 6. Reglas Universales de Evans para el Lugar de las Raíces</h3>
      ${(() => {
        const n = poles.length;
        const m = zeros.length;
        const asymp = n - m;
        const sumP = poles.reduce((a, b) => a + b.re, 0);
        const sumZ = zeros.reduce((a, b) => a + b.re, 0);
        const sigma = asymp > 0 ? (sumP - sumZ) / asymp : 0;
        return `
          <p>• <b>Número de Ramas:</b> <b>n = ${n}</b> ramas que nacen en los polos cuando K = 0.</p>
          <p>• <b>Ramas al Infinito:</b> <b>n - m = ${asymp}</b> ramas que viajan a lo largo de las asíntotas cuando K → ∞.</p>
          <div class="sol-formula-box">
            <p><b>Centroide de las Asíntotas (σ<sub>a</sub>):</b></p>
            ${renderTex(`\\sigma_a = \\frac{\\sum p_i - \\sum z_i}{n - m} = \\frac{(${sumP.toFixed(2)}) - (${sumZ.toFixed(2)})}{${asymp}} = ${sigma.toFixed(3)}`)}
          </div>
          <p>• <b>Ángulos de las Asíntotas (θ<sub>k</sub>):</b></p>
          <div class="sol-formula-box">
            ${asymp > 0 ? Array.from({length: asymp}, (_, k) => renderTex(`\\theta_{${k}} = \\frac{(2(${k})+1)180^\\circ}{${asymp}} = ${(((2*k+1)*180)/asymp).toFixed(1)}^\\circ`)).join(' \\quad , \\quad ') : 'No aplican asíntotas (n = m)'}
          </div>
          <p>• <b>Puntos de Ruptura (Breakaway):</b> Se obtienen al resolver <b>dK/ds = 0</b> a partir de la ecuación característica 1 + K·G(s) = 0.</p>
        `;
      })()}
    </div>
  `;

  // 7. Compensador diseñado
  if (state.compResult) {
    const c = state.compResult;
    html += `
      <div class="sol-section">
        <h3>⚙️ 7. Síntesis de Compensadores de Frecuencia (${compTypeSelect.value})</h3>
        <p>Parámetros y especificaciones de sintonía en frecuencia:</p>
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
        <h3>⏱️ 8. Comparativa de Respuesta Temporal (Escalón Unitario)</h3>
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
              <td>Tiempo de Subida (t<sub>r</sub>)</td>
              <td>${mo.tr ? mo.tr.toFixed(3) + ' s' : '—'}</td>
              <td>${mc && mc.tr ? mc.tr.toFixed(3) + ' s' : '—'}</td>
            </tr>
            <tr>
              <td>Tiempo de Asentamiento (t<sub>s</sub> 2%)</td>
              <td>${mo.ts ? mo.ts.toFixed(3) + ' s' : '—'}</td>
              <td>${mc && mc.ts ? mc.ts.toFixed(3) + ' s' : '—'}</td>
            </tr>
            <tr>
              <td>Sobreimpulso Máximo (M<sub>p</sub> %)</td>
              <td>${mo.mpPercent ? mo.mpPercent.toFixed(1) + '%' : '0%'}</td>
              <td>${mc && mc.mpPercent ? mc.mpPercent.toFixed(1) + '%' : '0%'}</td>
            </tr>
            <tr>
              <td>Error en Régimen Permanente (e<sub>ss</sub>)</td>
              <td>${mo.ess ? mo.ess.toFixed(3) : '0'}</td>
              <td>${mc && mc.ess ? mc.ess.toFixed(3) : '0'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // 9. Veredicto y Recomendaciones de Ingeniería de Control
  html += `
    <div class="sol-section">
      <h3>🎓 9. Veredicto y Recomendaciones de Ingeniería de Control</h3>
      <div class="pedagogy-tip">
        <b>📋 Resumen de Robustez y Criterios de Examen:</b><br>
        • <b>Estabilidad Relativa:</b> ${margins.PM !== null && margins.PM >= 45 ? 'El sistema cuenta con un margen de fase saludable (≥ 45°), asegurando oscilaciones bien amortiguadas y respuesta rápida.' : 'El margen de fase es reducido (&lt; 45°); se recomienda diseñar un compensador de adelanto (Lead) para incrementar la estabilidad y amortiguar el sobreimpulso.'}<br>
        • <b>Retardo Crítico Permisible:</b> ${metrics && metrics.tauCritMs ? `Cualquier retardo puro en la planta o sensor superior a <b>${metrics.tauCritMs.toFixed(1)} ms</b> desestabilizará el lazo cerrado.` : 'El lazo cuenta con alta tolerancia a retardos temporales.'}<br>
        • <b>Sensibilidad a Ganancia:</b> ${metrics && metrics.kFactor ? `La ganancia K del lazo puede aumentarse hasta <b>${metrics.kFactor.toFixed(2)} veces</b> antes de que el lazo cerrado cruce al plano inestable.` : 'La ganancia puede incrementarse sin límite de estabilidad de cruce de fase.'}
      </div>
    </div>
  `;

  solutionModalContent.innerHTML = cleanMath(html);
}

// Población del Modal de Tabulación de Puntos de Nyquist
function populateNyquistTableModal() {
  if (!state.parsedTF) return;
  const num = state.parsedTF.num;
  const den = state.parsedTF.den;
  const table = getNyquistTabulation(num, den, state.margins);
  const kStability = calculateKStabilityRange(num, den, state.margins);

  let html = `
    <div class="sol-section">
      <h3>📋 Tabulación de Puntos Notables de Nyquist</h3>
      <p>Puntos de evaluación de la respuesta frecuencial <b>G(jω)</b> para trazar la curva en el plano polar:</p>
      
      <div style="overflow-x:auto; margin:8px 0;">
        <table class="sol-table">
          <thead>
            <tr>
              <th>Frecuencia ω (rad/s)</th>
              <th>|G(jω)|</th>
              <th>|G(jω)| (dB)</th>
              <th>Parte Real (Re)</th>
              <th>Parte Imag (Im)</th>
              <th>Fase ∠G (°)</th>
            </tr>
          </thead>
          <tbody>
            ${table.map(row => {
              const isGainCross = state.margins && state.margins.w_gc && Math.abs(row.w - state.margins.w_gc) < 0.01;
              const isPhaseCross = state.margins && state.margins.w_pc && Math.abs(row.w - state.margins.w_pc) < 0.01;
              let rowStyle = "";
              let badge = "";
              if (isGainCross) {
                rowStyle = "background-color: rgba(56, 189, 248, 0.15); font-weight: bold;";
                badge = " <span style='color:#38bdf8;'>[ω_cg]</span>";
              } else if (isPhaseCross) {
                rowStyle = "background-color: rgba(245, 158, 11, 0.15); font-weight: bold;";
                badge = " <span style='color:#f59e0b;'>[ω_cp]</span>";
              }
              return `
                <tr style="${rowStyle}">
                  <td><b>${row.w < 0.01 || row.w >= 100 ? row.w.toExponential(2) : row.w.toFixed(3)}</b>${badge}</td>
                  <td>${row.mag < 0.01 || row.mag >= 100 ? row.mag.toExponential(2) : row.mag.toFixed(3)}</td>
                  <td>${row.magDb.toFixed(2)} dB</td>
                  <td style="color:${row.re < 0 ? '#f87171' : '#4ade80'};">${row.re.toFixed(4)}</td>
                  <td style="color:${row.im < 0 ? '#38bdf8' : '#fb923c'};">${row.im.toFixed(4)}</td>
                  <td>${row.phaseDeg.toFixed(1)}°</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="pedagogy-tip">
        <b>🎯 Cómo trazar a mano en exámenes universitarios:</b><br>
        1. Comienza en <b>ω → 0⁺</b> identificando el tipo de sistema (cuadrante de partida según polos en el origen).<br>
        2. Localiza el cruce con el eje real negativo <b>(ω = ω_cp)</b> donde Im = 0. En este sistema: <b>Re = ${state.margins && state.margins.w_pc ? (state.margins.GM !== null ? (-Math.pow(10, -state.margins.GM / 20)).toFixed(4) : '—') : 'No cruza'}</b>.<br>
        3. Localiza el cruce con el círculo unitario <b>(ω = ω_cg)</b> donde |G| = 1.0 (0 dB).<br>
        4. Une los puntos suavemente en sentido horario hacia el origen (0, 0) cuando <b>ω → ∞</b> con ángulo asintótico de -${90 * (state.bodeComps ? state.bodeComps.originPoles + state.bodeComps.realPoles.length - state.bodeComps.realZeros.length : 1)}°.
      </div>

      <div style="background:#171728; padding:8px; border-radius:6px; margin-top:8px;">
        <h4 style="color:#ffd700; margin-bottom:4px;">⚖️ Rango de Estabilidad Crítica para Ganancia K:</h4>
        <p>• Rango permitido: <b style="color:#4ade80; font-size:14px;">${kStability.kRangeStr}</b></p>
        <p style="color:#cbd5e1; font-size:11px; margin-top:4px;">${kStability.verdict}</p>
      </div>
    </div>
  `;

  nyquistTableContent.innerHTML = cleanMath(html);
}

// Alternar Modo Mover con el dedo (Pan)
btnModePan.addEventListener('click', () => {
  if (state.isFullscreen) {
    currentDragMode = 'pan';
    btnModePan.classList.add('highlight');
    btnModeZoom.classList.remove('highlight');
    darkLayoutCommon.dragmode = 'pan';
    Plotly.relayout(plotContainer, { dragmode: 'pan' });
  } else {
    // En modo normal actúa como interruptor (toggle)
    if (isNormalPanActive && currentDragMode === 'pan') {
      isNormalPanActive = false;
      document.body.classList.remove('chart-pan-active');
      btnModePan.classList.remove('highlight');
      darkLayoutCommon.dragmode = false;
      Plotly.relayout(plotContainer, { dragmode: false });
    } else {
      isNormalPanActive = true;
      currentDragMode = 'pan';
      document.body.classList.add('chart-pan-active');
      btnModePan.classList.add('highlight');
      btnModeZoom.classList.remove('highlight');
      darkLayoutCommon.dragmode = 'pan';
      Plotly.relayout(plotContainer, { dragmode: 'pan' });
    }
  }
});

// Alternar Modo Zoom en recuadro
btnModeZoom.addEventListener('click', () => {
  if (state.isFullscreen) {
    currentDragMode = 'zoom';
    btnModeZoom.classList.add('highlight');
    btnModePan.classList.remove('highlight');
    darkLayoutCommon.dragmode = 'zoom';
    Plotly.relayout(plotContainer, { dragmode: 'zoom' });
  } else {
    if (isNormalPanActive && currentDragMode === 'zoom') {
      isNormalPanActive = false;
      document.body.classList.remove('chart-pan-active');
      btnModeZoom.classList.remove('highlight');
      darkLayoutCommon.dragmode = false;
      Plotly.relayout(plotContainer, { dragmode: false });
    } else {
      isNormalPanActive = true;
      currentDragMode = 'zoom';
      document.body.classList.add('chart-pan-active');
      btnModeZoom.classList.add('highlight');
      btnModePan.classList.remove('highlight');
      darkLayoutCommon.dragmode = 'zoom';
      Plotly.relayout(plotContainer, { dragmode: 'zoom' });
    }
  }
});

// Pantalla Completa (Full screen Mode)
btnFullscreen.addEventListener('click', () => {
  state.isFullscreen = !state.isFullscreen;
  if (state.isFullscreen) {
    document.body.classList.add('fullscreen-mode');
    appElement.classList.add('fullscreen-mode');
    btnFullscreen.textContent = '✖ Salir';
    currentDragMode = currentDragMode || 'pan';
    if (currentDragMode === 'pan') {
      btnModePan.classList.add('highlight');
      btnModeZoom.classList.remove('highlight');
    } else if (currentDragMode === 'zoom') {
      btnModeZoom.classList.add('highlight');
      btnModePan.classList.remove('highlight');
    }
    plotlyConfig.scrollZoom = true;
  } else {
    document.body.classList.remove('fullscreen-mode');
    appElement.classList.remove('fullscreen-mode');
    document.body.classList.remove('chart-pan-active');
    btnFullscreen.textContent = '⛶ Pantalla';
    isNormalPanActive = false;
    btnModePan.classList.remove('highlight');
    btnModeZoom.classList.remove('highlight');
    plotlyConfig.scrollZoom = false;
  }

  const effDragMode = getEffectiveDragMode();
  darkLayoutCommon.dragmode = effDragMode;
  Plotly.relayout(plotContainer, { dragmode: effDragMode });
  setTimeout(() => {
    Plotly.Plots.resize(plotContainer);
  }, 50);
  setTimeout(() => {
    Plotly.Plots.resize(plotContainer);
  }, 200);
});

// Auto redimensionar gráficos en rotación y cambio de ventana
window.addEventListener('resize', () => {
  if (plotContainer) Plotly.Plots.resize(plotContainer);
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (plotContainer) Plotly.Plots.resize(plotContainer);
  }, 200);
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

// Modal de Tabulación Nyquist
if (btnNyquistTable) {
  btnNyquistTable.addEventListener('click', () => {
    if (!state.parsedTF) return;
    populateNyquistTableModal();
    modalNyquistTable.classList.remove('hidden');
  });
}

if (btnCloseNyquistTable) {
  btnCloseNyquistTable.addEventListener('click', () => {
    modalNyquistTable.classList.add('hidden');
  });
}

if (btnDismissNyquistTable) {
  btnDismissNyquistTable.addEventListener('click', () => {
    modalNyquistTable.classList.add('hidden');
  });
}

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
    if (!state.isFullscreen) {
      isNormalPanActive = false;
      document.body.classList.remove('chart-pan-active');
      btnModePan.classList.remove('highlight');
      btnModeZoom.classList.remove('highlight');
      darkLayoutCommon.dragmode = false;
      plotlyConfig.scrollZoom = false;
    }
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

// Teclado virtual con soporte para navegación por cursor y manipulación exacta
btnToggleKeypad.addEventListener('click', () => {
  virtualKeypad.classList.toggle('hidden');
});

document.querySelectorAll('.key-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const key = btn.getAttribute('data-key');
    const input = tfInput;
    let start = input.selectionStart ?? input.value.length;
    let end = input.selectionEnd ?? input.value.length;
    const val = input.value;

    if (key === 'left') {
      const newPos = Math.max(0, start - 1);
      input.focus();
      input.setSelectionRange(newPos, newPos);
    } else if (key === 'right') {
      const newPos = Math.min(val.length, end + 1);
      input.focus();
      input.setSelectionRange(newPos, newPos);
    } else if (key === 'clear') {
      input.value = '';
      input.focus();
      input.setSelectionRange(0, 0);
    } else if (key === 'back') {
      if (start === end) {
        if (start > 0) {
          input.value = val.slice(0, start - 1) + val.slice(start);
          input.focus();
          input.setSelectionRange(start - 1, start - 1);
        }
      } else {
        input.value = val.slice(0, start) + val.slice(end);
        input.focus();
        input.setSelectionRange(start, start);
      }
    } else {
      let insertStr = key;
      if (key === 'pi') insertStr = 'pi';
      else if (key === '1/s') insertStr = '(1/s)';
      else if (key === '1/s^2') insertStr = '(1/s^2)';
      else if (key === '(s+') insertStr = '(s+';
      else if (key === '(s+1)') insertStr = '(s+1)';

      input.value = val.slice(0, start) + insertStr + val.slice(end);
      const nextPos = start + insertStr.length;
      input.focus();
      input.setSelectionRange(nextPos, nextPos);
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

// ==========================================
// RESIZE / ORIENTACIÓN - Para tablets y rotación
// ==========================================
let resizeTimer = null;
function handleViewportChange() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // Hacer que Plotly adapte el gráfico al nuevo tamaño del contenedor
    if (plotContainer && plotContainer.data) {
      Plotly.Plots.resize(plotContainer);
    }
  }, 150);
}

window.addEventListener('resize', handleViewportChange, { passive: true });
window.addEventListener('orientationchange', () => {
  // Esperar un poco más en orientationchange porque el navegador tarda
  // en actualizar las dimensiones tras la rotación
  setTimeout(handleViewportChange, 300);
}, { passive: true });

// Iniciar con el ejemplo por defecto
analyzeSystem();
