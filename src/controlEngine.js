// scratch/new_engine.js - Motor matemático completo de Control Clásico de Alta Precisión

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

export function polySub(p1, p2) {
    const negP2 = p2.map(c => -c);
    return polyAdd(p1, negP2);
}

export function polyPow(p, n) {
    if (n === 0) return [1];
    let res = [...p];
    for (let i = 1; i < n; i++) res = polyMultiply(res, p);
    return res;
}

export function cleanPoly(p) {
    let res = [...p];
    while (res.length > 1 && Math.abs(res[0]) < 1e-12) res.shift();
    return res;
}

export function formatPoly(poly) {
    if (!poly || poly.length === 0) return "0";
    const deg = poly.length - 1;
    let s = "";
    for (let i = 0; i <= deg; i++) {
        const c = poly[i];
        if (Math.abs(c) < 1e-9) continue;
        const p = deg - i;
        const sign = c < 0 ? "-" : (s.length > 0 ? "+" : "");
        const absC = Math.abs(c);
        let cStr = (absC === 1 && p > 0) ? "" : (Math.abs(absC - Math.round(absC)) < 1e-4 ? Math.round(absC).toString() : absC.toFixed(2));
        let pStr = p === 0 ? "" : (p === 1 ? "s" : `s^${p}`);
        let term = (cStr === "" && pStr !== "") ? pStr : `${cStr}${pStr}`;
        if (s.length === 0) {
            s += (c < 0 ? `-${term}` : term);
        } else {
            s += ` ${sign} ${term}`;
        }
    }
    return s || "0";
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
 * Cálculo de raíces de polinomios reales mediante método Aberth-Ehrlich con deflación en el origen
 */
export function findRoots(poly) {
    let p = [...poly];
    while (p.length > 1 && Math.abs(p[0]) < 1e-12) p.shift();
    if (p.length <= 1) return [];

    // Deflación de raíces en s = 0 (ceros al final del polinomio)
    const zeroRoots = [];
    while (p.length > 1 && Math.abs(p[p.length - 1]) < 1e-12) {
        p.pop();
        zeroRoots.push({ re: 0, im: 0 });
    }
    const n = p.length - 1;
    if (n === 0) return zeroRoots;

    const a0 = p[0];
    const norm = p.map(c => c / a0);

    if (n === 1) {
        return [{ re: -norm[1], im: 0 }, ...zeroRoots];
    }
    if (n === 2) {
        const b = norm[1];
        const c = norm[2];
        const disc = b * b - 4 * c;
        if (disc >= 0) {
            const s = Math.sqrt(disc);
            const r1 = (-b + (b >= 0 ? -s : s)) / 2;
            const r2 = (2 * c) / (-b + (b >= 0 ? -s : s));
            return [{ re: r1, im: 0 }, { re: r2, im: 0 }, ...zeroRoots];
        } else {
            return [
                { re: -b / 2, im: Math.sqrt(-disc) / 2 },
                { re: -b / 2, im: -Math.sqrt(-disc) / 2 },
                ...zeroRoots
            ];
        }
    }

    // Polinomio derivado normalizado
    const dNorm = [];
    for (let i = 0; i < n; i++) {
        dNorm.push(norm[i] * (n - i));
    }

    // Inicialización de Aberth-Ehrlich
    const roots = [];
    for (let k = 0; k < n; k++) {
        const theta = (2 * Math.PI * k + 0.7) / n;
        const r = 0.8 + 0.4 * (k / n);
        roots.push({
            re: r * Math.cos(theta),
            im: r * Math.sin(theta)
        });
    }

    // Iteración de Aberth-Ehrlich
    for (let iter = 0; iter < 120; iter++) {
        let maxDelta = 0;
        for (let i = 0; i < n; i++) {
            const zi = roots[i];
            const pVal = polyEvalComplex(norm, zi.re, zi.im);
            const dpVal = polyEvalComplex(dNorm, zi.re, zi.im);

            const dpMag2 = dpVal.re * dpVal.re + dpVal.im * dpVal.im;
            if (dpMag2 < 1e-28) continue;
            const nRe = (pVal.re * dpVal.re + pVal.im * dpVal.im) / dpMag2;
            const nIm = (pVal.im * dpVal.re - pVal.re * dpVal.im) / dpMag2;

            let sRe = 0;
            let sIm = 0;
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const dRe = zi.re - roots[j].re;
                const dIm = zi.im - roots[j].im;
                const dMag2 = dRe * dRe + dIm * dIm;
                if (dMag2 > 1e-28) {
                    sRe += dRe / dMag2;
                    sIm += -dIm / dMag2;
                }
            }

            const nsRe = nRe * sRe - nIm * sIm;
            const nsIm = nRe * sIm + nIm * sRe;
            const denRe = 1 - nsRe;
            const denIm = -nsIm;
            const denMag2 = denRe * denRe + denIm * denIm;

            let deltaRe = nRe;
            let deltaIm = nIm;
            if (denMag2 > 1e-12) {
                deltaRe = (nRe * denRe + nIm * denIm) / denMag2;
                deltaIm = (nIm * denRe - nRe * denIm) / denMag2;
            }

            zi.re -= deltaRe;
            zi.im -= deltaIm;

            const deltaMag = Math.hypot(deltaRe, deltaIm);
            if (deltaMag > maxDelta) maxDelta = deltaMag;
        }
        if (maxDelta < 1e-13) break;
    }

    return [...roots.map(r => ({
        re: Math.abs(r.re) < 1e-10 ? 0 : r.re,
        im: Math.abs(r.im) < 1e-10 ? 0 : r.im
    })), ...zeroRoots];
}

/**
 * Clasificación rigurosa de polos (LHP, RHP, sobre jw)
 */
export function poleStatus(coeffs) {
    let p = [...coeffs];
    while (p.length > 1 && Math.abs(p[0]) < 1e-12) p.shift();
    if (p.length <= 1) {
        return { status: 'singular', poles: [], rhp: 0, axis: 0 };
    }
    const roots = findRoots(p);
    let rhp = 0;
    let axis = 0;
    for (const r of roots) {
        const rMag = Math.hypot(r.re, r.im);
        const tol = 1e-7 * Math.max(1, rMag);
        if (r.re > tol) rhp++;
        else if (Math.abs(r.re) <= tol) axis++;
    }
    const status = rhp > 0 ? 'inestable' : (axis > 0 ? 'límite de estabilidad' : 'estable');
    return { status, poles: roots, rhp, axis };
}

/**
 * Información de estabilidad en lazo cerrado con realimentación unitaria T = L / (1 + L)
 */
export function closedLoopInfo(num, den) {
    const charPoly = polyAdd(den, num);
    const info = poleStatus(charPoly);
    if (num.length === den.length && Math.abs(num[0] + den[0]) <= 1e-12 * Math.max(Math.abs(den[0]), Math.abs(num[0]))) {
        info.status = 'singular';
    }
    info.charPoly = charPoly;
    return info;
}

/**
 * Parser de funciones de transferencia con soporte para K, s, pi y divisiones anidadas
 */
export function parseTransferFunction(str) {
    let s = str.replace(/\s+/g, "");
    if (!s) throw new Error("La función no puede estar vacía.");

    // Validar caracteres permitidos
    if (!/^[0-9a-zA-Z\+\-\*\/\^\(\)\.]+$/.test(s)) {
        throw new Error("Caracteres no válidos. Usa números, s, K, pi, paréntesis y operadores (+, -, *, /, ^).");
    }

    const hasK = /[kK]/.test(s);

    // Tokenizador
    const tokens = [];
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^' || c === '(' || c === ')') {
            tokens.push({ type: 'OP', val: c });
            i++;
        } else if (c === 's' || c === 'S') {
            tokens.push({ type: 'VAR_S', val: 's' });
            i++;
        } else if (c === 'k' || c === 'K') {
            tokens.push({ type: 'VAR_K', val: 'K' });
            i++;
        } else if (s.slice(i, i + 2).toLowerCase() === 'pi') {
            tokens.push({ type: 'NUM', val: Math.PI });
            i += 2;
        } else if (/[0-9.]/.test(c)) {
            let numStr = "";
            while (i < s.length && /[0-9.]/.test(s[i])) {
                numStr += s[i];
                i++;
            }
            tokens.push({ type: 'NUM', val: parseFloat(numStr) });
        } else {
            throw new Error(`Símbolo desconocido: '${c}'`);
        }
    }

    // Insertar multiplicación implícita
    const expanded = [];
    for (let j = 0; j < tokens.length; j++) {
        expanded.push(tokens[j]);
        if (j < tokens.length - 1) {
            const t1 = tokens[j];
            const t2 = tokens[j + 1];
            const t1CanEnd = (t1.type === 'NUM' || t1.type === 'VAR_S' || t1.type === 'VAR_K' || (t1.type === 'OP' && t1.val === ')'));
            const t2CanStart = (t2.type === 'NUM' || t2.type === 'VAR_S' || t2.type === 'VAR_K' || (t2.type === 'OP' && t2.val === '('));
            if (t1CanEnd && t2CanStart) {
                expanded.push({ type: 'OP', val: '*' });
            }
        }
    }

    let pos = 0;
    function peek() { return expanded[pos]; }
    function consume() { return expanded[pos++]; }

    function parseExpr() {
        let left = parseTerm();
        while (pos < expanded.length && (peek().type === 'OP' && (peek().val === '+' || peek().val === '-'))) {
            const op = consume().val;
            const right = parseTerm();
            if (op === '+') {
                left = {
                    num: polyAdd(polyMultiply(left.num, right.den), polyMultiply(right.num, left.den)),
                    den: polyMultiply(left.den, right.den)
                };
            } else {
                left = {
                    num: polySub(polyMultiply(left.num, right.den), polyMultiply(right.num, left.den)),
                    den: polyMultiply(left.den, right.den)
                };
            }
        }
        return left;
    }

    function parseTerm() {
        let left = parsePower();
        while (pos < expanded.length && (peek().type === 'OP' && (peek().val === '*' || peek().val === '/'))) {
            const op = consume().val;
            const right = parsePower();
            if (op === '*') {
                left = {
                    num: polyMultiply(left.num, right.num),
                    den: polyMultiply(left.den, right.den)
                };
            } else {
                left = {
                    num: polyMultiply(left.num, right.den),
                    den: polyMultiply(left.den, right.num)
                };
            }
        }
        return left;
    }

    function parsePower() {
        let base = parseFactor();
        if (pos < expanded.length && peek().type === 'OP' && peek().val === '^') {
            consume();
            let exponent = parseFactor();
            const powerVal = exponent.num[0] / (exponent.den[0] || 1);
            if (powerVal >= 0 && isFinite(powerVal) && Math.round(powerVal) === powerVal) {
                base = {
                    num: polyPow(base.num, powerVal),
                    den: polyPow(base.den, powerVal)
                };
            }
        }
        return base;
    }

    function parseFactor() {
        if (pos >= expanded.length) return { num: [1], den: [1] };
        let tok = peek();
        if (!tok) return { num: [1], den: [1] };

        if (tok.type === 'OP' && tok.val === '+') {
            consume();
            return parseFactor();
        }
        if (tok.type === 'OP' && tok.val === '-') {
            consume();
            let factor = parseFactor();
            return { num: factor.num.map(c => -c), den: factor.den };
        }
        if (tok.type === 'OP' && tok.val === '(') {
            consume();
            let expr = parseExpr();
            if (pos < expanded.length && peek() && peek().type === 'OP' && peek().val === ')') {
                consume();
            }
            return expr;
        }
        if (tok.type === 'NUM') {
            consume();
            return { num: [tok.val], den: [1] };
        }
        if (tok.type === 'VAR_S') {
            consume();
            return { num: [1, 0], den: [1] };
        }
        if (tok.type === 'VAR_K') {
            consume();
            return { num: [1], den: [1] }; // Base K = 1
        }
        consume();
        return { num: [1], den: [1] };
    }

    let rat = parseExpr();
    let num = cleanPoly(rat.num);
    let den = cleanPoly(rat.den);

    if (den.length === 0 || (den.length === 1 && den[0] === 0)) {
        throw new Error("División por cero en el modelo polinómico.");
    }

    // Normalizar signo del coeficiente principal del denominador
    if (den[0] < 0) {
        den = den.map(c => -c);
        num = num.map(c => -c);
    }

    if (num.length > den.length) {
        throw new Error("La función de transferencia debe ser propia: grado del numerador ≤ grado del denominador.");
    }
    if (den.length > 21) {
        throw new Error("Esta herramienta educativa admite funciones de transferencia hasta de orden 20.");
    }

    const numStr = formatPoly(num);
    const denStr = formatPoly(den);

    return {
        num,
        den,
        numStr,
        denStr,
        hasK,
        rawStr: str
    };
}

/**
 * Evaluación de respuesta en frecuencia con descomposición de fase por factores
 * Garantiza rama continua exacta sin saltos espurios ni aliasing, respetando signos RHP.
 */
export function bodeValues(num, den, wList) {
    const numRoots = findRoots(num);
    const denRoots = findRoots(den);

    const mag = [];
    const phase = [];
    const real = [];
    const imag = [];

    const a0 = num[0];
    const b0 = den[0];

    for (let idx = 0; idx < wList.length; idx++) {
        const w = wList[idx];
        const numEval = polyEvalComplex(num, 0, w);
        const denEval = polyEvalComplex(den, 0, w);
        const dMag2 = denEval.re * denEval.re + denEval.im * denEval.im;

        let hRe = 0, hIm = 0, mDb = -120;
        if (dMag2 > 1e-28) {
            hRe = (numEval.re * denEval.re + numEval.im * denEval.im) / dMag2;
            hIm = (numEval.im * denEval.re - numEval.re * denEval.im) / dMag2;
            const m = Math.hypot(hRe, hIm);
            mDb = 20 * Math.log10(Math.max(m, 1e-14));
        }

        let pDeg = 0;
        let gain = a0 / b0;

        for (const [roots, sign] of [[numRoots, 1], [denRoots, -1]]) {
            for (const r of roots) {
                const rMag = Math.hypot(r.re, r.im);
                if (rMag < 1e-12) {
                    pDeg += sign * 90;
                } else {
                    gain *= Math.pow(rMag, sign);
                    if (Math.abs(r.im) < 1e-8 * Math.max(1, rMag)) {
                        if (r.re > 0) gain *= -1;
                        pDeg += sign * (Math.atan2(-w / r.re, 1) * 180 / Math.PI);
                    } else if (r.im > 0) {
                        const wn = rMag;
                        const zeta = -r.re / wn;
                        const u = w / wn;
                        pDeg += sign * (Math.atan2(2 * zeta * u, 1 - u * u) * 180 / Math.PI);
                    }
                }
            }
        }
        if (gain < 0) pDeg -= 180;

        // Perfección a 16 dígitos combinando ángulo directo de Horner con el número de vueltas de los factores
        if (dMag2 > 1e-28 && isFinite(hRe) && isFinite(hIm)) {
            const directDeg = Math.atan2(hIm, hRe) * (180 / Math.PI);
            const k = Math.round((pDeg - directDeg) / 360);
            pDeg = directDeg + k * 360;
        }

        mag.push(mDb);
        phase.push(pDeg);
        real.push(hRe);
        imag.push(hIm);
    }

    return { mag, phase, real, imag };
}

export function evaluateFreqResponse(num, den, wList) {
    return bodeValues(num, den, wList);
}

/**
 * Búsqueda exacta de cruces mediante escaneo logarítmico + método de bisección de alta precisión
 */
function findCrossingRoots(fn, wMin = 1e-6, wMax = 1e7, numIntervals = 600) {
    const logMin = Math.log10(wMin);
    const logMax = Math.log10(wMax);
    const step = (logMax - logMin) / numIntervals;
    const crossings = [];

    let prevW = Math.pow(10, logMin);
    let prevVal = fn(prevW);

    for (let i = 1; i <= numIntervals; i++) {
        const currW = Math.pow(10, logMin + i * step);
        const currVal = fn(currW);

        if (isFinite(prevVal) && isFinite(currVal) && prevVal * currVal <= 0) {
            let a = prevW;
            let b = currW;
            let fa = prevVal;
            let fb = currVal;

            for (let iter = 0; iter < 50; iter++) {
                const mid = (a + b) / 2;
                const fmid = fn(mid);
                if (Math.abs(fmid) < 1e-14 || (b - a) / mid < 1e-13) {
                    crossings.push(mid);
                    break;
                }
                if (fa * fmid <= 0) {
                    b = mid;
                    fb = fmid;
                } else {
                    a = mid;
                    fa = fmid;
                }
            }
        }
        prevW = currW;
        prevVal = currVal;
    }

    const unique = [];
    for (const w of crossings) {
        if (!unique.some(u => Math.abs(u - w) / w < 1e-5)) {
            unique.push(w);
        }
    }
    return unique;
}

/**
 * Cálculo exacto de Márgenes de Estabilidad y Cruces Polinómicos
 * Retorna todos los cruces y selecciona los márgenes críticos
 */
export function calculateMargins(arg1, arg2, arg3) {
    let num, den;

    // Detectar si fue llamado con (wList, mag, phase) legacy o (num, den) nuevo
    if (Array.isArray(arg1) && Array.isArray(arg2) && arg1.length > 20 && !arg3) {
        num = arg1;
        den = arg2;
    } else if (Array.isArray(arg1) && Array.isArray(arg2) && arg3) {
        // Modo legacy: interpolación aproximada sobre malla
        return calculateLegacyMargins(arg1, arg2, arg3);
    } else {
        num = arg1;
        den = arg2;
    }

    if (!num || !den || num.length === 0 || den.length === 0) {
        return {
            w_pc: null, GM: null, GM_factor: null, intersect_x: null,
            w_gc: null, PM: null, phaseCrossings: [], gainCrossings: []
        };
    }

    // Cruces de fase: Im{H(jw)} = 0
    const imFn = (w) => {
        const n = polyEvalComplex(num, 0, w);
        const d = polyEvalComplex(den, 0, w);
        return n.im * d.re - n.re * d.im;
    };

    // Cruces de ganancia: |H(jw)| = 1
    const mag1Fn = (w) => {
        const n = polyEvalComplex(num, 0, w);
        const d = polyEvalComplex(den, 0, w);
        return (n.re * n.re + n.im * n.im) - (d.re * d.re + d.im * d.im);
    };

    const w_pc_list = findCrossingRoots(imFn);
    const w_gc_list = findCrossingRoots(mag1Fn);

    const phaseCrossings = [];
    for (const w of w_pc_list) {
        const resp = bodeValues(num, den, [w]);
        const x = resp.real[0];
        if (x < -1e-9) { // Cruce con el semieje real negativo (fase -180°)
            const gmFactor = -1 / x;
            const gmDb = 20 * Math.log10(gmFactor);
            phaseCrossings.push({ w, gm: gmFactor, gm_db: gmDb, x });
        }
    }

    const gainCrossings = [];
    for (const w of w_gc_list) {
        const resp = bodeValues(num, den, [w]);
        let pm = 180 + (resp.phase[0] % 360);
        if (pm > 180) pm -= 360;
        if (pm < -180) pm += 360;
        gainCrossings.push({ w, pm });
    }

    let primaryPC = null;
    if (phaseCrossings.length > 0) {
        primaryPC = phaseCrossings.reduce((min, c) => Math.abs(c.gm_db) < Math.abs(min.gm_db) ? c : min);
    }

    let primaryGC = null;
    if (gainCrossings.length > 0) {
        primaryGC = gainCrossings.reduce((min, c) => Math.abs(c.pm) < Math.abs(min.pm) ? c : min);
    }

    return {
        w_pc: primaryPC ? primaryPC.w : null,
        GM: primaryPC ? primaryPC.gm_db : null,
        GM_factor: primaryPC ? primaryPC.gm : null,
        intersect_x: primaryPC ? primaryPC.x : null,
        w_gc: primaryGC ? primaryGC.w : null,
        PM: primaryGC ? primaryGC.pm : null,
        phaseCrossings,
        gainCrossings
    };
}

function calculateLegacyMargins(wList, mag, phase) {
    let w_gc = null, PM = null, w_pc = null, GM = null;
    for (let i = 0; i < mag.length - 1; i++) {
        if ((mag[i] >= 0 && mag[i + 1] <= 0) || (mag[i] <= 0 && mag[i + 1] >= 0)) {
            const frac = -mag[i] / (mag[i + 1] - mag[i]);
            w_gc = wList[i] + frac * (wList[i + 1] - wList[i]);
            const p = phase[i] + frac * (phase[i + 1] - phase[i]);
            PM = 180 + (p % 360);
            if (PM > 180) PM -= 360;
            break;
        }
    }
    for (let i = 0; i < phase.length - 1; i++) {
        if ((phase[i] >= -180 && phase[i + 1] <= -180) || (phase[i] <= -180 && phase[i + 1] >= -180)) {
            const frac = (-180 - phase[i]) / (phase[i + 1] - phase[i]);
            w_pc = wList[i] + frac * (wList[i + 1] - wList[i]);
            const m = mag[i] + frac * (mag[i + 1] - mag[i]);
            GM = -m;
            break;
        }
    }
    return { w_gc, PM, w_pc, GM, phaseCrossings: [], gainCrossings: [] };
}

/**
 * Malla de frecuencia adaptativa y dinámica según polos, ceros y cruces
 */
export function frequencyGrid(num, den, margins = null, points = 1800) {
    const numRoots = findRoots(num);
    const denRoots = findRoots(den);
    const scales = [];

    for (const r of [...numRoots, ...denRoots]) {
        const mag = Math.hypot(r.re, r.im);
        if (mag > 1e-12) scales.push(mag);
    }

    if (margins) {
        for (const c of [...(margins.phaseCrossings || []), ...(margins.gainCrossings || [])]) {
            if (c.w > 0) scales.push(c.w);
        }
    }

    const lo = scales.length > 0 ? Math.min(0.01, Math.min(...scales) / 100) : 0.01;
    const hi = scales.length > 0 ? Math.max(100, Math.max(...scales) * 100) : 100;

    const boundedLo = Math.max(lo, 1e-6);
    const boundedHi = Math.min(hi, 1e7);

    const logLo = Math.log10(boundedLo);
    const logHi = Math.log10(boundedHi);
    const step = (logHi - logLo) / (points - 1);

    const w = [];
    for (let i = 0; i < points; i++) {
        w.push(Math.pow(10, logLo + i * step));
    }
    return w;
}

/**
 * Cálculo exacto de intervalos de estabilidad para K > 0 (Fronteras y balance de Cauchy Z = P + N)
 */
export function calculateKStabilityRange(num, den, margins = null) {
    const denRoots = findRoots(den);
    const P = denRoots.filter(r => r.re > 1e-7).length;
    const originPoles = denRoots.filter(r => Math.hypot(r.re, r.im) < 1e-7).length;

    const m = margins || calculateMargins(num, den);
    const candidates = [];

    for (const c of m.phaseCrossings) {
        if (c.x < -1e-9) {
            candidates.push({ k: -1 / c.x, w: c.w });
        }
    }

    // Raíz en s = 0: D(0) + K*N(0) = 0 => K = -D(0)/N(0)
    const num0 = num[num.length - 1];
    const den0 = den[den.length - 1];
    if (Math.abs(num0) > 1e-12) {
        const k0 = -den0 / num0;
        if (k0 > 1e-9) candidates.push({ k: k0, w: 0.0 });
    }

    // Pérdida de grado / lazo singular: K = -den[0]/num[0]
    if (num.length === den.length && Math.abs(num[0]) > 1e-12) {
        const kLead = -den[0] / num[0];
        if (kLead > 1e-9) candidates.push({ k: kLead, w: Infinity });
    }

    candidates.sort((a, b) => a.k - b.k);
    const boundaries = [];
    for (const cand of candidates) {
        if (cand.k > 0 && isFinite(cand.k)) {
            if (boundaries.length === 0 || Math.abs(cand.k - boundaries[boundaries.length - 1].k) / cand.k > 1e-6) {
                boundaries.push(cand);
            }
        }
    }

    const edges = [0.0, ...boundaries.map(b => b.k), Infinity];
    const intervals = [];
    for (let i = 0; i < edges.length - 1; i++) {
        const a = edges[i];
        const b = edges[i + 1];
        let sample;
        if (a === 0.0) {
            sample = isFinite(b) ? b / 2 : 1.0;
        } else if (!isFinite(b)) {
            sample = a * 2;
        } else {
            sample = Math.sqrt(a * b);
        }
        const scaledNum = num.map(c => c * sample);
        const cl = closedLoopInfo(scaledNum, den);
        if (cl.status === 'estable') {
            intervals.push([a, b]);
        }
    }

    // Lazo cerrado base K = 1
    const baseCL = closedLoopInfo(num, den);
    const isStableBase = (baseCL.status === 'estable');
    const Z = baseCL.rhp;
    const N = (baseCL.axis === 0 && baseCL.status !== 'singular') ? (Z - P) : null;

    const kRangeStr = intervals.length > 0
        ? intervals.map(([a, b]) => `${a === 0 ? '0' : a.toPrecision(4)} < K < ${isFinite(b) ? b.toPrecision(4) : '∞'}`).join(' ∪ ')
        : 'Sin intervalo de estabilidad asintótica para K > 0';

    const kCrit = boundaries.length > 0 ? boundaries[0].k : null;
    const w_pc = boundaries.length > 0 ? boundaries[0].w : null;

    let verdict = "";
    if (intervals.length > 0) {
        verdict = `Para estabilidad en lazo cerrado (Z = 0), la ganancia debe pertenecer al rango: ${kRangeStr}.`;
        if (kCrit) {
            verdict += ` En K_crit = ${kCrit.toFixed(3)}, el sistema oscila sostenidamente en la frecuencia ω = ${w_pc.toFixed(3)} rad/s.`;
        }
    } else {
        verdict = `El lazo cerrado no posee estabilidad asintótica para ningún valor de K > 0.`;
    }

    return {
        P,
        Z,
        N,
        originPoles,
        w_pc,
        kCrit,
        boundaries,
        intervals,
        kRangeStr,
        verdict,
        isStableBase
    };
}

/**
 * Tabla interactiva de tabulación de Nyquist para dibujo a mano y comprobación
 */
export function getNyquistTabulation(num, den, margins = null) {
    const table = [];
    const m = margins || calculateMargins(num, den);
    const grid = frequencyGrid(num, den, m, 400);

    const targetW = [];
    // Puntos característicos logarítmicos
    for (let i = 0; i < 9; i++) {
        const idx = Math.floor(i * (grid.length - 1) / 8);
        targetW.push(grid[idx]);
    }
    // Cruces exactos
    for (const c of [...(m.phaseCrossings || []), ...(m.gainCrossings || [])]) {
        if (c.w > 0) targetW.push(c.w);
    }
    targetW.sort((a, b) => a - b);

    const filtered = [];
    for (const w of targetW) {
        if (filtered.length === 0 || Math.abs(w - filtered[filtered.length - 1]) / w > 0.05) {
            filtered.push(w);
        }
    }

    for (const w of filtered) {
        const resp = bodeValues(num, den, [w]);
        const re = resp.real[0];
        const im = resp.imag[0];
        const magDb = resp.mag[0];
        const mag = Math.hypot(re, im);
        const phaseDeg = resp.phase[0];

        let tag = "";
        if (m.gainCrossings.some(c => Math.abs(c.w - w) / w < 0.01)) {
            tag = "Cruce |L|=1 (0 dB)";
        }
        if (m.phaseCrossings.some(c => Math.abs(c.w - w) / w < 0.01)) {
            tag = tag ? `${tag} / Cruce -180°` : "Cruce Fase -180°";
        }

        const label = tag ? `ω = ${w.toFixed(3)} rad/s [${tag}]` : `ω = ${w.toPrecision(3)} rad/s`;

        table.push({
            w,
            wLabel: label,
            mag,
            magDb,
            re,
            im,
            phaseDeg,
            tag
        });
    }

    return table;
}

/**
 * Simulación de Respuesta Temporal al Escalón con integración RK4 adaptativa y métricas exactas
 */
export function simulateStepResponse(num, den, tFinal = null, numPoints = 600) {
    const clDen = polyAdd(den, num);
    const info = poleStatus(clDen);

    const n = clDen.length - 1;
    if (n <= 0) {
        return { t: [0, 1], y: [0, 0], metrics: null, status: 'singular' };
    }

    const isStable = (info.status === 'estable');

    // Tiempo final adaptativo
    let tMax = tFinal;
    if (!tMax) {
        const slowPoles = info.poles.filter(p => p.re < -1e-7).map(p => -p.re);
        const unstablePoles = info.poles.filter(p => p.re > 1e-7).map(p => p.re);
        const oscFreqs = info.poles.map(p => Math.abs(p.im));
        const maxOsc = Math.max(0, ...oscFreqs);

        if (unstablePoles.length > 0) {
            tMax = 8.0 / Math.max(...unstablePoles);
        } else if (slowPoles.length > 0) {
            tMax = 12.0 / Math.min(...slowPoles);
            if (maxOsc > 0) {
                tMax = Math.max(tMax, 8.0 * 2 * Math.PI / maxOsc);
            }
        } else {
            tMax = maxOsc > 0 ? 10.0 * 2 * Math.PI / maxOsc : 10.0;
        }
        tMax = Math.max(0.5, Math.min(tMax, 5000.0));
    }

    const dtPlot = tMax / (numPoints - 1);

    // Forma canónica de control
    const a0 = clDen[0];
    const a = clDen.map(c => c / a0);
    const bRaw = new Array(n + 1).fill(0);
    const offset = (n + 1) - num.length;
    for (let i = 0; i < num.length; i++) bRaw[i + offset] = num[i] / a0;

    const b0_coeff = bRaw[0];
    const b = bRaw.map(c => c - b0_coeff * a[bRaw.indexOf(c)]);

    // Sub-pasos para estabilidad numérica de RK4 frente a sistemas rígidos (stiff)
    const maxPoleMag = Math.max(1, ...info.poles.map(p => Math.hypot(p.re, p.im)));
    const maxDtSub = Math.min(dtPlot, 2.2 / maxPoleMag);
    const subSteps = Math.min(100, Math.max(1, Math.ceil(dtPlot / maxDtSub)));
    const dt = dtPlot / subSteps;

    let x = new Array(n).fill(0);
    const t = [];
    const y = [];

    function deriv(currX, uVal) {
        const dx = new Array(n).fill(0);
        let sum = 0;
        for (let i = 0; i < n; i++) sum -= a[n - i] * currX[i];
        sum += uVal;
        for (let i = 0; i < n - 1; i++) dx[i] = currX[i + 1];
        dx[n - 1] = sum;
        return dx;
    }

    for (let step = 0; step < numPoints; step++) {
        const currT = step * dtPlot;
        t.push(currT);

        let yVal = b0_coeff * 1.0;
        for (let i = 0; i < n; i++) yVal += b[n - i] * x[i];
        y.push(yVal);

        for (let s = 0; s < subSteps; s++) {
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
    }

    if (!isStable || !y.every(v => isFinite(v))) {
        return {
            t, y,
            status: info.status,
            poles: info.poles,
            metrics: {
                yss: null,
                ess: null,
                yMax: null,
                tPeak: null,
                mpPercent: null,
                tr: null,
                ts: null,
                isUnstable: true,
                status: info.status
            }
        };
    }

    // Teorema del valor final analítico exacto T(0) = N(0) / D_cl(0)
    const yss = clDen[clDen.length - 1] !== 0 ? num[num.length - 1] / clDen[clDen.length - 1] : 0;
    const ess = Math.abs(1.0 - yss);

    let yMax = y[0];
    let tPeak = t[0];
    let maxNorm = -Infinity;
    for (let i = 0; i < y.length; i++) {
        const normVal = (yss !== 0) ? y[i] / yss : y[i];
        if (normVal > maxNorm) {
            maxNorm = normVal;
            yMax = y[i];
            tPeak = t[i];
        }
    }

    const mp = (Math.abs(yss) > 1e-12) ? Math.max(0, (maxNorm - 1.0) * 100) : 0;

    // Tr: cruce 10% a 90%
    let t10 = null, t90 = null;
    const yNorm = y.map(v => (yss !== 0) ? v / yss : v);
    for (let i = 0; i < yNorm.length - 1; i++) {
        if (t10 === null && yNorm[i] <= 0.1 && yNorm[i + 1] >= 0.1) {
            const frac = (0.1 - yNorm[i]) / (yNorm[i + 1] - yNorm[i]);
            t10 = t[i] + frac * (t[i + 1] - t[i]);
        }
        if (t90 === null && yNorm[i] <= 0.9 && yNorm[i + 1] >= 0.9) {
            const frac = (0.9 - yNorm[i]) / (yNorm[i + 1] - yNorm[i]);
            t90 = t[i] + frac * (t[i + 1] - t[i]);
            break;
        }
    }
    const tr = (t10 !== null && t90 !== null) ? (t90 - t10) : null;

    // Ts: banda del 2%
    let ts = null;
    for (let i = yNorm.length - 1; i >= 0; i--) {
        if (Math.abs(yNorm[i] - 1.0) > 0.02) {
            if (i < yNorm.length - 1) {
                const frac = (0.02 - Math.abs(yNorm[i + 1] - 1.0)) / (Math.abs(yNorm[i] - 1.0) - Math.abs(yNorm[i + 1] - 1.0));
                ts = t[i + 1] - frac * (t[i + 1] - t[i]);
            } else {
                ts = t[i];
            }
            break;
        }
    }
    if (ts === null) ts = 0;

    return {
        t, y,
        status: info.status,
        poles: info.poles,
        metrics: {
            yss, ess, yMax, tPeak, mpPercent: mp, tr, ts, isUnstable: false, status: info.status
        }
    };
}

/**
 * Diseñador Analítico de Compensadores con Verificación Rigurosa
 */
export function designCompensator(type, num, den, desiredPM, desiredKv = null, minGM = 10) {
    if (!isFinite(desiredPM) || desiredPM <= 0 || desiredPM >= 180) {
        throw new Error("El margen de fase deseado debe estar entre 0° y 180°.");
    }

    const ol = poleStatus(den);
    if (ol.rhp > 0) {
        throw new Error("El diseño interactivo de compensadores en frecuencia asume plantas estables en lazo abierto.");
    }

    const baseMargins = calculateMargins(num, den);
    const wGrid = frequencyGrid(num, den, baseMargins, 600);
    const baseResp = bodeValues(num, den, wGrid);

    let compNum = [1];
    let compDen = [1];
    const explanation = [];

    // Cálculo de Kv original: lim_{s->0} s G(s)
    let baseKv = null;
    if (den[den.length - 1] === 0 && den.length > 1) {
        const dReduced = den.slice(0, -1);
        baseKv = num[num.length - 1] / dReduced[dReduced.length - 1];
    }

    let gainScale = 1.0;
    if (desiredKv !== null && desiredKv > 0) {
        if (baseKv !== null && baseKv > 0) {
            gainScale = desiredKv / baseKv;
            explanation.push(`Ajuste de constante de error de velocidad: Kv_deseado / Kv_orig = ${gainScale.toFixed(2)}.`);
        }
    }

    if (type === 'Lead') {
        const phiM_deg = Math.max(desiredPM - (baseMargins.PM || 0) + 6, 12);
        const phiM_rad = phiM_deg * Math.PI / 180;
        const alpha = (1 - Math.sin(phiM_rad)) / (1 + Math.sin(phiM_rad));
        const magTarget = -10 * Math.log10(1 / alpha);

        let bestW = 1.0;
        let minDiff = 1e9;
        for (let i = 0; i < wGrid.length; i++) {
            const diff = Math.abs(baseResp.mag[i] - magTarget);
            if (diff < minDiff) {
                minDiff = diff;
                bestW = wGrid[i];
            }
        }
        const T = 1.0 / (bestW * Math.sqrt(alpha));
        const z = 1.0 / T;
        const p = 1.0 / (alpha * T);
        const Kc = gainScale / Math.sqrt(alpha);

        compNum = [Kc, Kc * z];
        compDen = [1, p];

        explanation.push(`Aporte de fase necesario: φ_max = ${phiM_deg.toFixed(1)}°`);
        explanation.push(`Parámetro de atenuación: α = ${alpha.toFixed(4)}`);
        explanation.push(`Nueva frecuencia de cruce: ω_m = ${bestW.toFixed(2)} rad/s`);
        explanation.push(`Cero en s = -${z.toFixed(2)}, Polo en s = -${p.toFixed(2)}`);
    } else if (type === 'Lag') {
        const phiTarget = -180 + desiredPM + 6;
        let bestW = 1.0;
        let minDiff = 1e9;
        for (let i = 0; i < wGrid.length; i++) {
            const diff = Math.abs(baseResp.phase[i] - phiTarget);
            if (diff < minDiff) {
                minDiff = diff;
                bestW = wGrid[i];
            }
        }
        const respAtBest = bodeValues(num, den, [bestW]);
        const magAtW = respAtBest.mag[0];
        const beta = Math.pow(10, magAtW / 20) * gainScale;
        const z = bestW / 10;
        const p = z / Math.max(beta, 1.2);

        compNum = [gainScale, gainScale * z];
        compDen = [1, p];

        explanation.push(`Frecuencia de cruce elegida: ω_c = ${bestW.toFixed(2)} rad/s`);
        explanation.push(`Atenuación requerida: β = ${beta.toFixed(2)}`);
        explanation.push(`Cero en s = -${z.toFixed(3)}, Polo en s = -${p.toFixed(4)}`);
    } else { // Lead-Lag
        const phiM_deg = Math.max((desiredPM - (baseMargins.PM || 0)) * 0.6 + 8, 15);
        const phiM_rad = phiM_deg * Math.PI / 180;
        const alpha = (1 - Math.sin(phiM_rad)) / (1 + Math.sin(phiM_rad));

        const wcLead = (baseMargins.w_gc || 2.0) * 1.5;
        const zLead = wcLead * Math.sqrt(alpha);
        const pLead = wcLead / Math.sqrt(alpha);
        const leadNum = [1 / Math.sqrt(alpha), (1 / Math.sqrt(alpha)) * zLead];
        const leadDen = [1, pLead];

        const zLag = zLead / 10;
        const pLag = zLag * alpha;
        const lagNum = [gainScale, gainScale * zLag];
        const lagDen = [1, pLag];

        compNum = polyMultiply(leadNum, lagNum);
        compDen = polyMultiply(leadDen, lagDen);

        explanation.push(`Etapa de Adelanto (Lead): Cero s = -${zLead.toFixed(3)}, Polo s = -${pLead.toFixed(3)}`);
        explanation.push(`Etapa de Retraso (Lag): Cero s = -${zLag.toFixed(3)}, Polo s = -${pLag.toFixed(4)}`);
        explanation.push(`Compensador Lead-Lag combinado diseñado con verificación de lazo cerrado.`);
    }

    const totalNum = polyMultiply(num, compNum);
    const totalDen = polyMultiply(den, compDen);

    const clComp = closedLoopInfo(totalNum, totalDen);
    if (clComp.status !== 'estable') {
        explanation.push(`⚠️ Advertencia: El lazo cerrado con el compensador requiere ajuste adicional de polos.`);
    }

    const compMargins = calculateMargins(totalNum, totalDen);
    const compResp = bodeValues(totalNum, totalDen, wGrid);

    return {
        compNum, compDen,
        totalNum, totalDen,
        wList: wGrid,
        baseResp, baseMargins,
        compResp, compMargins,
        clStatus: clComp.status,
        explanation
    };
}

/**
 * Descomposición en componentes canónicos de Bode
 * Incluye distinción rigurosa de factores en el semiplano derecho (RHP) y multiplicidades
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
        else realPoles.push({ val: Math.abs(r.re), rhp: r.re > 0, raw: r.re });
    });

    numRoots.forEach(r => {
        const mag = Math.hypot(r.re, r.im);
        if (mag < 1e-5) originZeros++;
        else if (Math.abs(r.im) > 1e-5) complexZeros.push(r);
        else realZeros.push({ val: Math.abs(r.re), rhp: r.re > 0, raw: r.re });
    });

    realPoles.sort((a, b) => a.val - b.val);
    realZeros.sort((a, b) => a.val - b.val);

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
        desc: `Ganancia estática K = ${kBode.toFixed(2)} (${k_db.toFixed(2)} dB). Aporta magnitud plana y desfase de ${gainPhase[0]}°.`,
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
            desc: `Integrador puro: pendiente de -${20 * originPoles} dB/dec que cruza 0 dB en ω = 1 rad/s y desfase constante de -${90 * originPoles}°.`,
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
            desc: `Derivador puro: pendiente de +${20 * originZeros} dB/dec que cruza 0 dB en ω = 1 rad/s y desfase constante de +${90 * originZeros}°.`,
            mag: zMag,
            phase: zPhase,
            slope: 20 * originZeros,
            phaseShift: 90 * originZeros
        });
    }

    // 4. Polos reales (respetando semiplano derecho si aplica)
    realPoles.forEach(pObj => {
        const wc = pObj.val;
        const rhp = pObj.rhp;
        const pMag = wList.map(w => w <= wc ? 0 : -20 * Math.log10(w / wc));
        const dir = rhp ? 1 : -1;
        const pPhase = wList.map(w => {
            if (w <= wc / 10) return 0;
            if (w >= 10 * wc) return dir * 90;
            return dir * 45 * (1 + Math.log10(w / wc));
        });
        components.push({
            type: 'real_pole',
            name: `Polo real en s = ${pObj.raw.toFixed(2)}${rhp ? ' (Semiplano derecho RHP)' : ''}`,
            desc: `Quiebre en ω_c = ${wc.toFixed(2)} rad/s. Cae a -20 dB/dec. Fase ${rhp ? 'asciende a +90° (no mínima)' : 'desciende a -90°'}.`,
            mag: pMag,
            phase: pPhase,
            wc,
            rhp,
            slope: -20,
            phaseShift: dir * 90
        });
    });

    // 5. Ceros reales (respetando semiplano derecho si aplica)
    realZeros.forEach(zObj => {
        const wc = zObj.val;
        const rhp = zObj.rhp;
        const zMag = wList.map(w => w <= wc ? 0 : 20 * Math.log10(w / wc));
        const dir = rhp ? -1 : 1;
        const zPhase = wList.map(w => {
            if (w <= wc / 10) return 0;
            if (w >= 10 * wc) return dir * 90;
            return dir * 45 * (1 + Math.log10(w / wc));
        });
        components.push({
            type: 'real_zero',
            name: `Cero real en s = ${zObj.raw.toFixed(2)}${rhp ? ' (Semiplano derecho RHP - Fase No Mínima)' : ''}`,
            desc: `Quiebre en ω_c = ${wc.toFixed(2)} rad/s. Sube a +20 dB/dec. Fase ${rhp ? 'cae a -90° (fase no mínima)' : 'sube a +90°'}.`,
            mag: zMag,
            phase: zPhase,
            wc,
            rhp,
            slope: 20,
            phaseShift: dir * 90
        });
    });

    // 6. Polos complejos conjugados
    const uniqueComplexPoles = [];
    for (let i = 0; i < complexPoles.length; i += 2) {
        const cp = complexPoles[i];
        const wn = Math.hypot(cp.re, cp.im);
        const zeta = wn > 0 ? -cp.re / wn : 0;
        uniqueComplexPoles.push({ wn, zeta, rhp: cp.re > 0 });
        const pMag = wList.map(w => w <= wn ? 0 : -40 * Math.log10(w / wn));
        const pPhase = wList.map(w => {
            if (w <= wn / 10) return 0;
            if (w >= 10 * wn) return -180;
            return -90 * (1 + Math.log10(w / wn));
        });
        components.push({
            type: 'complex_pole',
            name: `Polos complejos en ωn = ${wn.toFixed(2)} (ζ = ${zeta.toFixed(2)})`,
            desc: `Par oscilatorio con ωn = ${wn.toFixed(2)} rad/s y ζ = ${zeta.toFixed(2)}. Cae a -40 dB/dec para ω > ωn.`,
            mag: pMag,
            phase: pPhase,
            wc: wn,
            slope: -40,
            phaseShift: -180
        });
    }

    // Intervalos y pendientes asintóticas
    let runningSlope = (originZeros - originPoles) * 20;
    const allEvents = [];
    realPoles.forEach(p => allEvents.push({ wc: p.val, delta: -20, desc: `Polo en ω = ${p.val.toFixed(2)} rad/s (-20 dB/dec)` }));
    realZeros.forEach(z => allEvents.push({ wc: z.val, delta: 20, desc: `Cero en ω = ${z.val.toFixed(2)} rad/s (+20 dB/dec)` }));
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
        realPoles: realPoles.map(p => p.val),
        realZeros: realZeros.map(z => z.val),
        complexPoles: uniqueComplexPoles,
        intervals
    };
}
