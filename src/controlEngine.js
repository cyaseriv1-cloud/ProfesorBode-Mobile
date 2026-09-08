// controlEngine.js - Motor matemático completo de Control Clásico para ProfesorBode Mobile

/**
 * Operaciones con polinomios
 */
export function polyMultiply(p1, p2) {
    const res = new Array(p1.length + p2.length - 1).fill(0);
    for (let i = 0; i < p1.length; i++) {
        for (let j = 0; j < p2.length; j++) {
            res[i + j] += p1[i] * p2[j];
        }
    }
    return res;
}

export function polyAdd(p1, p2) {
    const maxLen = Math.max(p1.length, p2.length);
    const res = new Array(maxLen).fill(0);
    const offset1 = maxLen - p1.length;
    const offset2 = maxLen - p2.length;
    for (let i = 0; i < p1.length; i++) res[i + offset1] += p1[i];
    for (let i = 0; i < p2.length; i++) res[i + offset2] += p2[i];
    return res;
}

export function polyEvalComplex(p, re, im) {
    let resRe = 0;
    let resIm = 0;
    for (let i = 0; i < p.length; i++) {
        const coeff = p[i];
        const nextRe = resRe * re - resIm * im + coeff;
        const nextIm = resRe * im + resIm * re;
        resRe = nextRe;
        resIm = nextIm;
    }
    return { re: resRe, im: resIm };
}

/**
 * Cálculo de raíces de polinomios reales mediante el método Durand-Kerner
 */
export function findRoots(poly) {
    let p = [...poly];
    while (p.length > 1 && Math.abs(p[0]) < 1e-12) p.shift();
    const n = p.length - 1;
    if (n <= 0) return [];
    
    // Normalizar coeficiente principal a 1
    const a0 = p[0];
    const normPoly = p.map(c => c / a0);
    
    if (n === 1) {
        return [{ re: -normPoly[1], im: 0 }];
    }
    if (n === 2) {
        const b = normPoly[1];
        const c = normPoly[2];
        const disc = b * b - 4 * c;
        if (disc >= 0) {
            return [
                { re: (-b + Math.sqrt(disc)) / 2, im: 0 },
                { re: (-b - Math.sqrt(disc)) / 2, im: 0 }
            ];
        } else {
            return [
                { re: -b / 2, im: Math.sqrt(-disc) / 2 },
                { re: -b / 2, im: -Math.sqrt(-disc) / 2 }
            ];
        }
    }

    // Inicialización de Durand-Kerner con puntos en círculo complejo
    let roots = [];
    const R = 0.4 + Math.max(...normPoly.map(Math.abs));
    for (let k = 0; k < n; k++) {
        const angle = (2 * Math.PI * k + 0.4) / n;
        roots.push({
            re: Math.pow(R, k / n) * Math.cos(angle),
            im: Math.pow(R, k / n) * Math.sin(angle)
        });
    }

    // Iteraciones
    for (let iter = 0; iter < 100; iter++) {
        let maxChange = 0;
        for (let i = 0; i < n; i++) {
            const f = polyEvalComplex(normPoly, roots[i].re, roots[i].im);
            let denomRe = 1;
            let denomIm = 0;
            for (let j = 0; j < n; j++) {
                if (i !== j) {
                    const dRe = roots[i].re - roots[j].re;
                    const dIm = roots[i].im - roots[j].im;
                    const nRe = denomRe * dRe - denomIm * dIm;
                    const nIm = denomRe * dIm + denomIm * dRe;
                    denomRe = nRe;
                    denomIm = nIm;
                }
            }
            const denMag2 = denomRe * denomRe + denomIm * denomIm;
            if (denMag2 > 1e-24) {
                const deltaRe = (f.re * denomRe + f.im * denomIm) / denMag2;
                const deltaIm = (f.im * denomRe - f.re * denomIm) / denMag2;
                roots[i].re -= deltaRe;
                roots[i].im -= deltaIm;
                const change = Math.hypot(deltaRe, deltaIm);
                if (change > maxChange) maxChange = change;
            }
        }
        if (maxChange < 1e-8) break;
    }
    
    // Limpiar partes imaginarias espurias
    return roots.map(r => ({
        re: Math.abs(r.re) < 1e-10 ? 0 : r.re,
        im: Math.abs(r.im) < 1e-10 ? 0 : r.im
    }));
}

/**
 * Parser de funciones de transferencia clásicas
 * Soporta formatos:
 * "10/(s*(s+2)*(s+4))", "1/(s+1)", "10/(s^2+2*s+10)", "(s-2)/((s+1)*(s+3))"
 */
export function parseTransferFunction(str) {
    let clean = str.replace(/\s+/g, '');
    let parts = clean.split('/');
    if (parts.length > 2) {
        throw new Error("Formato inválido: sólo se permite una barra '/' principal.");
    }
    let numStr = parts[0] || "1";
    let denStr = parts[1] || "1";

    function parsePolynomial(expr) {
        expr = expr.replace(/^\((.*)\)$/, '$1'); // quitar parentesis envolventes si existen
        
        // Multiplicación de factores tipo (s+a)*(s+b) o s*(s+2)
        // Detectar si contiene factores multiplicados con '*'
        let factors = [];
        let curr = '';
        let depth = 0;
        for (let i = 0; i < expr.length; i++) {
            const ch = expr[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            if (ch === '*' && depth === 0) {
                factors.push(curr);
                curr = '';
            } else {
                curr += ch;
            }
        }
        if (curr) factors.push(curr);

        if (factors.length > 1) {
            let resPoly = [1];
            for (let f of factors) {
                resPoly = polyMultiply(resPoly, parsePolynomial(f));
            }
            return resPoly;
        }

        // Si es un término simple o suma de términos como s^2+2*s+10 o s+2 o 10 o s
        let sExpr = factors[0].replace(/^\((.*)\)$/, '$1');
        
        // Si es simplemente un número
        if (!sExpr.includes('s')) {
            let val = parseFloat(sExpr);
            return [isNaN(val) ? 1 : val];
        }
        
        // Si es s^n
        if (sExpr === 's') return [1, 0];
        if (sExpr === 's^2') return [1, 0, 0];
        if (sExpr === 's^3') return [1, 0, 0, 0];

        // Parseador general de términos polinomiales: a*s^n + b*s + c
        sExpr = sExpr.replace(/-/g, '+-');
        let terms = sExpr.split('+').filter(t => t.length > 0);
        let maxDeg = 0;
        let termMap = {};

        for (let t of terms) {
            t = t.trim();
            if (!t) continue;
            let deg = 0;
            let coeff = 1;

            if (t.includes('s')) {
                if (t.includes('s^')) {
                    let p = t.split('s^');
                    deg = parseInt(p[1]);
                    let cStr = p[0].replace('*', '');
                    if (cStr === '' || cStr === '+') coeff = 1;
                    else if (cStr === '-') coeff = -1;
                    else coeff = parseFloat(cStr);
                } else {
                    deg = 1;
                    let cStr = t.replace('*s', '').replace('s', '');
                    if (cStr === '' || cStr === '+') coeff = 1;
                    else if (cStr === '-') coeff = -1;
                    else coeff = parseFloat(cStr);
                }
            } else {
                deg = 0;
                coeff = parseFloat(t);
            }
            if (isNaN(coeff)) coeff = 0;
            if (deg > maxDeg) maxDeg = deg;
            termMap[deg] = (termMap[deg] || 0) + coeff;
        }

        let poly = [];
        for (let d = maxDeg; d >= 0; d--) {
            poly.push(termMap[d] || 0);
        }
        return poly.length > 0 ? poly : [1];
    }

    const num = parsePolynomial(numStr);
    const den = parsePolynomial(denStr);
    return { num, den, numStr, denStr };
}

/**
 * Evaluación de respuesta en frecuencia H(jw)
 */
export function evaluateFreqResponse(num, den, wList) {
    const mag = [];
    const phase = [];
    const real = [];
    const imag = [];

    for (let w of wList) {
        const numEval = polyEvalComplex(num, 0, w);
        const denEval = polyEvalComplex(den, 0, w);

        const denMag2 = denEval.re * denEval.re + denEval.im * denEval.im;
        if (denMag2 === 0) {
            mag.push(-120);
            phase.push(-90);
            real.push(0);
            imag.push(0);
            continue;
        }

        const hRe = (numEval.re * denEval.re + numEval.im * denEval.im) / denMag2;
        const hIm = (numEval.im * denEval.re - numEval.re * denEval.im) / denMag2;

        const m = Math.hypot(hRe, hIm);
        const mDb = 20 * Math.log10(Math.max(m, 1e-12));
        const pRad = Math.atan2(hIm, hRe);

        mag.push(mDb);
        phase.push(pRad);
        real.push(hRe);
        imag.push(hIm);
    }

    // Desenvolvimiento de fase (Phase Unwrap) continuo
    const unwrappedPhaseDeg = [];
    let currentOffset = 0;
    for (let i = 0; i < phase.length; i++) {
        if (i > 0) {
            let diff = phase[i] - phase[i - 1];
            if (diff > Math.PI) currentOffset -= 2 * Math.PI;
            else if (diff < -Math.PI) currentOffset += 2 * Math.PI;
        }
        unwrappedPhaseDeg.push((phase[i] + currentOffset) * (180 / Math.PI));
    }

    return { mag, phase: unwrappedPhaseDeg, real, imag };
}

/**
 * Cálculo de Márgenes de Fase y Ganancia
 */
export function calculateMargins(wList, mag, phase) {
    let w_gc = null; // Cruce de ganancia (0 dB)
    let PM = null;   // Margen de fase

    let w_pc = null; // Cruce de fase (-180 deg)
    let GM = null;   // Margen de ganancia

    // Buscar cruce de 0 dB
    for (let i = 0; i < mag.length - 1; i++) {
        if ((mag[i] >= 0 && mag[i + 1] <= 0) || (mag[i] <= 0 && mag[i + 1] >= 0)) {
            const fraction = -mag[i] / (mag[i + 1] - mag[i]);
            w_gc = wList[i] + fraction * (wList[i + 1] - wList[i]);
            const p_at_gc = phase[i] + fraction * (phase[i + 1] - phase[i]);
            PM = 180 + (p_at_gc % 360);
            if (PM > 180) PM -= 360;
            break;
        }
    }

    // Buscar cruce de -180°
    for (let i = 0; i < phase.length - 1; i++) {
        if ((phase[i] >= -180 && phase[i + 1] <= -180) || (phase[i] <= -180 && phase[i + 1] >= -180)) {
            const fraction = (-180 - phase[i]) / (phase[i + 1] - phase[i]);
            w_pc = wList[i] + fraction * (wList[i + 1] - wList[i]);
            const m_at_pc = mag[i] + fraction * (mag[i + 1] - mag[i]);
            GM = -m_at_pc;
            break;
        }
    }

    return { w_gc, PM, w_pc, GM };
}

/**
 * Simulación de Respuesta Temporal al Escalón (Lazo Cerrado) con RK4
 */
export function simulateStepResponse(num, den, tFinal = null, numPoints = 600) {
    // T(s) = num / (den + num) para realimentación unitaria H=1
    const clDen = polyAdd(den, num);
    const n = clDen.length - 1;
    const m = num.length - 1;

    if (n <= 0) {
        return { t: [0, 1], y: [0, 0], metrics: null };
    }

    // Normalizar
    const a0 = clDen[0];
    const a = clDen.map(c => c / a0);
    const bRaw = new Array(n + 1).fill(0);
    const offset = (n + 1) - num.length;
    for (let i = 0; i < num.length; i++) bRaw[i + offset] = num[i] / a0;

    const b0_coeff = bRaw[0];
    const b = bRaw.map(c => c - b0_coeff * a[bRaw.indexOf(c)]);

    // Estimar tiempo final basado en raíces si no se proporciona
    const roots = findRoots(clDen);
    let minReal = 1e9;
    let isUnstable = false;
    for (let r of roots) {
        if (r.re > 0) isUnstable = true;
        if (r.re < 0 && Math.abs(r.re) < minReal) minReal = Math.abs(r.re);
    }

    if (!tFinal) {
        if (isUnstable) tFinal = 5.0;
        else if (minReal < 1e5 && minReal > 1e-4) tFinal = Math.min(Math.max(5.0 / minReal, 2.0), 50.0);
        else tFinal = 10.0;
    }

    const dt = tFinal / (numPoints - 1);
    const t = [];
    const y = [];

    // Estado x de dimensión n
    let x = new Array(n).fill(0);

    function deriv(currX, uVal) {
        const dx = new Array(n).fill(0);
        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum -= a[n - i] * currX[i];
        }
        sum += uVal;

        for (let i = 0; i < n - 1; i++) {
            dx[i] = currX[i + 1];
        }
        dx[n - 1] = sum;
        return dx;
    }

    for (let step = 0; step < numPoints; step++) {
        const currT = step * dt;
        t.push(currT);

        // y = b1*x1 + b2*x2 + ... + b0*u
        let yVal = b0_coeff; // escalon u=1
        for (let i = 0; i < n; i++) {
            yVal += b[n - i] * x[i];
        }
        y.push(yVal);

        // RK4
        const k1 = deriv(x, 1.0);
        const x_k1 = x.map((xi, idx) => xi + 0.5 * dt * k1[idx]);
        const k2 = deriv(x_k1, 1.0);
        const x_k2 = x.map((xi, idx) => xi + 0.5 * dt * k2[idx]);
        const k3 = deriv(x_k2, 1.0);
        const x_k3 = x.map((xi, idx) => xi + dt * k3[idx]);
        const k4 = deriv(x_k3, 1.0);

        for (let i = 0; i < n; i++) {
            x[i] += (dt / 6.0) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
        }
    }

    // Cálculo de Métricas
    const yss = y[y.length - 1];
    const ess = Math.abs(1.0 - yss);
    let yMax = -1e9;
    let tPeak = 0;
    for (let i = 0; i < y.length; i++) {
        if (y[i] > yMax) {
            yMax = y[i];
            tPeak = t[i];
        }
    }

    const mp = (yss > 1e-4 && yMax > yss) ? ((yMax - yss) / yss) * 100 : 0;

    // Tiempo de subida tr (10% a 90%)
    let t10 = null, t90 = null;
    for (let i = 0; i < y.length; i++) {
        if (t10 === null && y[i] >= 0.1 * yss) t10 = t[i];
        if (t90 === null && y[i] >= 0.9 * yss) {
            t90 = t[i];
            break;
        }
    }
    const tr = (t10 !== null && t90 !== null) ? (t90 - t10) : null;

    // Tiempo de asentamiento ts al 2%
    let ts = null;
    for (let i = y.length - 1; i >= 0; i--) {
        if (Math.abs(y[i] - yss) > 0.02 * Math.abs(yss)) {
            ts = t[i];
            break;
        }
    }

    return {
        t, y,
        metrics: {
            yss,
            ess,
            yMax,
            tPeak,
            mpPercent: mp,
            tr,
            ts,
            isUnstable
        }
    };
}

/**
 * Diseñador de Compensadores (Lead, Lag, Lead-Lag)
 */
export function designCompensator(type, num, den, desiredPM, desiredKv = null, minGM = 10) {
    const wList = [];
    for (let exp = -2; exp <= 3; exp += 0.01) wList.push(Math.pow(10, exp));
    const baseResp = evaluateFreqResponse(num, den, wList);
    const baseMargins = calculateMargins(wList, baseResp.mag, baseResp.phase);

    let compNum = [1];
    let compDen = [1];
    let explanation = [];
    let Kc = 1.0;

    if (type === 'Lead') {
        const phiM_deg = Math.max(desiredPM - (baseMargins.PM || 0) + 6, 15);
        const phiM_rad = phiM_deg * Math.PI / 180;
        const alpha = (1 - Math.sin(phiM_rad)) / (1 + Math.sin(phiM_rad));
        const magTarget = -10 * Math.log10(1 / alpha);

        let bestW = 1.0;
        let minDiff = 1e9;
        for (let i = 0; i < wList.length; i++) {
            const diff = Math.abs(baseResp.mag[i] - magTarget);
            if (diff < minDiff) {
                minDiff = diff;
                bestW = wList[i];
            }
        }
        const T = 1.0 / (bestW * Math.sqrt(alpha));
        const z = 1.0 / T;
        const p = 1.0 / (alpha * T);
        Kc = 1.0 / Math.sqrt(alpha);

        compNum = [Kc, Kc * z];
        compDen = [1, p];

        explanation.push(`Aporte de fase necesario: φ_max = ${phiM_deg.toFixed(1)}°`);
        explanation.push(`Factor de atenuación: α = ${alpha.toFixed(4)}`);
        explanation.push(`Frecuencia de cruce elegida: ω_m = ${bestW.toFixed(3)} rad/s`);
        explanation.push(`Cero en s = -${z.toFixed(3)}, Polo en s = -${p.toFixed(3)}`);
        explanation.push(`Compensador C(s) = ${Kc.toFixed(3)} · (s + ${z.toFixed(3)}) / (s + ${p.toFixed(3)})`);

    } else if (type === 'Lag') {
        const targetPhase = -180 + desiredPM + 5;
        let bestW = 1.0;
        let minDiff = 1e9;
        for (let i = 0; i < wList.length; i++) {
            const diff = Math.abs(baseResp.phase[i] - targetPhase);
            if (diff < minDiff) {
                minDiff = diff;
                bestW = wList[i];
            }
        }
        const magAtW = baseResp.mag[wList.indexOf(bestW)];
        const beta = Math.pow(10, magAtW / 20);
        const z = bestW / 10;
        const p = z / beta;

        compNum = [1, z];
        compDen = [1, p];

        explanation.push(`Nueva frecuencia de cruce estimada: ω_c = ${bestW.toFixed(3)} rad/s`);
        explanation.push(`Atenuación requerida: β = ${beta.toFixed(3)}`);
        explanation.push(`Cero en s = -${z.toFixed(3)}, Polo en s = -${p.toFixed(4)}`);
        explanation.push(`Compensador C(s) = (s + ${z.toFixed(3)}) / (s + ${p.toFixed(4)})`);

    } else if (type === 'Lead-Lag') {
        // Combinado Lead-Lag
        const phiM_deg = Math.max((desiredPM - (baseMargins.PM || 0)) / 2 + 5, 20);
        const phiM_rad = phiM_deg * Math.PI / 180;
        const alpha = (1 - Math.sin(phiM_rad)) / (1 + Math.sin(phiM_rad));
        const beta = 1.0 / alpha;

        const wLead = 3.0;
        const zLead = wLead * Math.sqrt(alpha);
        const pLead = wLead / Math.sqrt(alpha);

        const wLag = 0.3;
        const zLag = wLag;
        const pLag = zLag / beta;

        const leadNum = [1, zLead];
        const leadDen = [1, pLead];
        const lagNum = [1, zLag];
        const lagDen = [1, pLag];

        compNum = polyMultiply(leadNum, lagNum);
        compDen = polyMultiply(leadDen, lagDen);

        explanation.push(`Etapa de Adelanto (Lead): Cero s=-${zLead.toFixed(3)}, Polo s=-${pLead.toFixed(3)}`);
        explanation.push(`Etapa de Retraso (Lag): Cero s=-${zLag.toFixed(3)}, Polo s=-${pLag.toFixed(4)}`);
        explanation.push(`Compensador Lead-Lag combinado diseñado con éxito.`);
    }

    const totalNum = polyMultiply(num, compNum);
    const totalDen = polyMultiply(den, compDen);
    const compResp = evaluateFreqResponse(totalNum, totalDen, wList);
    const compMargins = calculateMargins(wList, compResp.mag, compResp.phase);

    return {
        compNum, compDen,
        totalNum, totalDen,
        wList,
        baseResp, baseMargins,
        compResp, compMargins,
        explanation
    };
}

/**
 * Descomposición en componentes individuales para trazado de Bode paso a paso
 */
export function getBodeComponents(num, den, wList) {
    const numRoots = findRoots(num);
    const denRoots = findRoots(den);

    let originPoles = 0;
    let originZeros = 0;
    const realPoles = [];
    const realZeros = [];
    const complexPoles = [];
    const complexZeros = [];

    denRoots.forEach(r => {
        const mag = Math.hypot(r.re, r.im);
        if (mag < 1e-5) originPoles++;
        else if (Math.abs(r.im) > 1e-5) complexPoles.push(r);
        else realPoles.push(Math.abs(r.re));
    });

    numRoots.forEach(r => {
        const mag = Math.hypot(r.re, r.im);
        if (mag < 1e-5) originZeros++;
        else if (Math.abs(r.im) > 1e-5) complexZeros.push(r);
        else realZeros.push(Math.abs(r.re));
    });

    realPoles.sort((a, b) => a - b);
    realZeros.sort((a, b) => a - b);

    // Ganancia en forma estándar de Bode: K_bode = lim_{s->0} s^(originPoles - originZeros) * G(s)
    const numConst = num[num.length - 1 - originZeros] || 1;
    const denConst = den[den.length - 1 - originPoles] || 1;
    const kBode = numConst / denConst;
    const k_db = 20 * Math.log10(Math.max(Math.abs(kBode), 1e-8));

    const components = [];

    // 1. Ganancia
    const gainMag = wList.map(() => k_db);
    const gainPhase = wList.map(() => kBode >= 0 ? 0 : -180);
    components.push({
        type: 'gain',
        name: `Ganancia K = ${kBode.toFixed(2)}`,
        desc: `Ganancia estática K = ${kBode.toFixed(2)} (${k_db.toFixed(2)} dB). Aporta una magnitud plana en todo el gráfico y desfase de ${gainPhase[0]}°.`,
        mag: gainMag,
        phase: gainPhase,
        slope: 0,
        phaseShift: gainPhase[0]
    });

    // 2. Polo en el origen
    if (originPoles > 0) {
        const pMag = wList.map(w => -20 * originPoles * Math.log10(w));
        const pPhase = wList.map(() => -90 * originPoles);
        components.push({
            type: 'origin_pole',
            name: originPoles === 1 ? 'Polo en el origen (1/s)' : `Polo en el origen múltiple (1/s^${originPoles})`,
            desc: `Integrador puro: pendiente de -${20 * originPoles} dB/década que cruza 0 dB en ω = 1 rad/s y desfase constante de -${90 * originPoles}°.`,
            mag: pMag,
            phase: pPhase,
            slope: -20 * originPoles,
            phaseShift: -90 * originPoles
        });
    }

    // 3. Cero en el origen
    if (originZeros > 0) {
        const zMag = wList.map(w => 20 * originZeros * Math.log10(w));
        const zPhase = wList.map(() => 90 * originZeros);
        components.push({
            type: 'origin_zero',
            name: originZeros === 1 ? 'Cero en el origen (s)' : `Cero en el origen (s^${originZeros})`,
            desc: `Derivador puro: pendiente de +${20 * originZeros} dB/década que cruza 0 dB en ω = 1 rad/s y adelanto constante de +${90 * originZeros}°.`,
            mag: zMag,
            phase: zPhase,
            slope: 20 * originZeros,
            phaseShift: 90 * originZeros
        });
    }

    // 4. Polos simples reales
    realPoles.forEach(wc => {
        const pMag = wList.map(w => w <= wc ? 0 : -20 * Math.log10(w / wc));
        const pPhase = wList.map(w => {
            if (w <= wc / 10) return 0;
            if (w >= 10 * wc) return -90;
            return -45 * (1 + Math.log10(w / wc));
        });
        components.push({
            type: 'real_pole',
            name: `Polo simple en ω = ${wc.toFixed(2)} rad/s`,
            desc: `Filtro pasa-bajos con quiebre en ω_c = ${wc.toFixed(2)} rad/s. Plano en 0 dB para ω < ${wc.toFixed(2)}, luego cae a -20 dB/década. Fase: 0° (baja frec) pasando por -45° en ω_c hasta -90° (alta frec).`,
            mag: pMag,
            phase: pPhase,
            wc,
            slope: -20,
            phaseShift: -90
        });
    });

    // 5. Ceros simples reales
    realZeros.forEach(wc => {
        const zMag = wList.map(w => w <= wc ? 0 : 20 * Math.log10(w / wc));
        const zPhase = wList.map(w => {
            if (w <= wc / 10) return 0;
            if (w >= 10 * wc) return 90;
            return 45 * (1 + Math.log10(w / wc));
        });
        components.push({
            type: 'real_zero',
            name: `Cero simple en ω = ${wc.toFixed(2)} rad/s`,
            desc: `Filtro pasa-altos con quiebre en ω_c = ${wc.toFixed(2)} rad/s. Plano en 0 dB para ω < ${wc.toFixed(2)}, luego sube a +20 dB/década. Fase: 0° pasando por +45° en ω_c hasta +90°.`,
            mag: zMag,
            phase: zPhase,
            wc,
            slope: 20,
            phaseShift: 90
        });
    });

    // 6. Polos complejos conjugados
    const uniqueComplexPoles = [];
    for (let i = 0; i < complexPoles.length; i += 2) {
        const cp = complexPoles[i];
        const wn = Math.hypot(cp.re, cp.im);
        const zeta = wn > 0 ? -cp.re / wn : 0;
        uniqueComplexPoles.push({ wn, zeta });
        const pMag = wList.map(w => w <= wn ? 0 : -40 * Math.log10(w / wn));
        const pPhase = wList.map(w => {
            if (w <= wn / 10) return 0;
            if (w >= 10 * wn) return -180;
            return -90 * (1 + Math.log10(w / wn));
        });
        components.push({
            type: 'complex_pole',
            name: `Polos complejos en ωn = ${wn.toFixed(2)} (ζ = ${zeta.toFixed(2)})`,
            desc: `Par oscilatorio con ωn = ${wn.toFixed(2)} rad/s y amortiguamiento ζ = ${zeta.toFixed(2)}. Cae a -40 dB/década para ω > ωn. Desfase de 0° a -180° (-90° en ωn).`,
            mag: pMag,
            phase: pPhase,
            wc: wn,
            slope: -40,
            phaseShift: -180
        });
    }

    // Cálculo de pendientes por tramos de frecuencia
    let runningSlope = (originZeros - originPoles) * 20;
    const allEvents = [];
    realPoles.forEach(wc => allEvents.push({ wc, delta: -20, desc: `Polo en ω = ${wc.toFixed(2)} rad/s (-20 dB/dec)` }));
    realZeros.forEach(wc => allEvents.push({ wc, delta: 20, desc: `Cero en ω = ${wc.toFixed(2)} rad/s (+20 dB/dec)` }));
    uniqueComplexPoles.forEach(cp => allEvents.push({ wc: cp.wn, delta: -40, desc: `Polos complejos en ωn = ${cp.wn.toFixed(2)} rad/s (-40 dB/dec)` }));
    allEvents.sort((a, b) => a.wc - b.wc);

    const intervals = [];
    let prevW = 0;
    for (let ev of allEvents) {
        intervals.push({
            fromW: prevW,
            toW: ev.wc,
            slope: runningSlope,
            label: prevW === 0 ? `ω < ${ev.wc.toFixed(2)} rad/s` : `${prevW.toFixed(2)} ≤ ω < ${ev.wc.toFixed(2)} rad/s`,
            activeFactor: ev.desc
        });
        runningSlope += ev.delta;
        prevW = ev.wc;
    }
    intervals.push({
        fromW: prevW,
        toW: Infinity,
        slope: runningSlope,
        label: prevW === 0 ? `Todas las frecuencias` : `ω ≥ ${prevW.toFixed(2)} rad/s`,
        activeFactor: 'Alta frecuencia'
    });

    // Curva asintótica total sumando componentes
    const totalAsympMag = new Array(wList.length).fill(0);
    const totalAsympPhase = new Array(wList.length).fill(0);
    components.forEach(c => {
        for (let i = 0; i < wList.length; i++) {
            totalAsympMag[i] += c.mag[i];
            totalAsympPhase[i] += c.phase[i];
        }
    });

    return {
        components,
        totalAsympMag,
        totalAsympPhase,
        kBode,
        k_bode: kBode,
        k_db,
        originPoles,
        originZeros,
        realPoles,
        realZeros,
        complexPoles: uniqueComplexPoles,
        intervals
    };
}

