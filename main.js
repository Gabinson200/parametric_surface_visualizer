// main.js — ES module

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// --- Global state ---

let scene, camera, renderer, controls;
let currentMesh = null;

let drawCanvas = null;
let drawCtx = null;
let drawPoints = [];
let isDrawing = false;

const statusEl = () => document.getElementById("status-message");

// --- Example surfaces ---

const EXAMPLES = {
  sphere: {
    name: "Sphere",
    x: "cos(u) * cos(v)",
    y: "sin(u) * cos(v)",
    z: "sin(v)",
    uMin: "0",
    uMax: "2 * pi",
    vMin: "-pi / 2",
    vMax: "pi / 2",
    uSteps: 60,
    vSteps: 30,
  },
  torus: {
    name: "Torus",
    x: "(1 + 0.35 * cos(v)) * cos(u)",
    y: "(1 + 0.35 * cos(v)) * sin(u)",
    z: "0.35 * sin(v)",
    uMin: "0",
    uMax: "2 * pi",
    vMin: "0",
    vMax: "2 * pi",
    uSteps: 80,
    vSteps: 40,
  },
  cylinder: {
    name: "Cylinder",
    x: "cos(u)",
    y: "sin(u)",
    z: "v",
    uMin: "0",
    uMax: "2 * pi",
    vMin: "-1",
    vMax: "1",
    uSteps: 50,
    vSteps: 20,
  },
  mobius: {
    name: "Möbius strip",
    x: "(1 + (v / 2) * cos(u / 2)) * cos(u)",
    y: "(1 + (v / 2) * cos(u / 2)) * sin(u)",
    z: "(v / 2) * sin(u / 2)",
    uMin: "0",
    uMax: "2 * pi",
    vMin: "-1",
    vMax: "1",
    uSteps: 120,
    vSteps: 20,
  },
  saddle: {
    name: "Saddle",
    x: "u",
    y: "v",
    z: "u * u - v * v",
    uMin: "-1.5",
    uMax: "1.5",
    vMin: "-1.5",
    vMax: "1.5",
    uSteps: 45,
    vSteps: 45,
  },
  heart: {
    name: "Heart",
    // classic parametric heart curve, extruded slightly in v
    x: "16 * sin(u)^3",
    y: "13 * cos(u) - 5 * cos(2*u) - 2 * cos(3*u) - cos(4*u)",
    z: "0.15 * v",
    uMin: "0",
    uMax: "2 * pi",
    vMin: "-1",
    vMax: "1",
    uSteps: 400,
    vSteps: 6,
  },
};

// --- Three.js setup ---

function initThree() {
  const container = document.getElementById("viewer");
  const width = container.clientWidth;
  const height = container.clientHeight || 1;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 200);
  camera.position.set(0, 0, 6);
  scene.add(camera);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(3, 4, 5);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x6b21a8, 0.5);
  fillLight.position.set(-4, -2, -3);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);

  const axes = new THREE.AxesHelper(1.2);
  axes.material.depthTest = false;
  axes.renderOrder = 2;
  scene.add(axes);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 0.8;

  window.addEventListener("resize", onWindowResize);
  animate();
}

function onWindowResize() {
  const container = document.getElementById("viewer");
  const width = container.clientWidth;
  const height = container.clientHeight || 1;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// --- Expression parsing helpers ---

function compileExpression(exprRaw) {
  if (!exprRaw || !exprRaw.trim()) {
    throw new Error("Expression is empty.");
  }

  let expr = exprRaw.trim();

  // ^ -> **
  expr = expr.replace(/\^/g, "**");

  // pi / PI -> Math.PI
  expr = expr.replace(/\bpi\b/gi, "Math.PI");

  const funcs = [
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "sinh",
    "cosh",
    "tanh",
    "exp",
    "log",
    "sqrt",
    "abs",
    "floor",
    "ceil",
    "round",
    "pow",
    "min",
    "max",
  ];

  funcs.forEach((fn) => {
    const re = new RegExp("\\b" + fn + "\\b", "g");
    expr = expr.replace(re, "Math." + fn);
  });

  let f;
  try {
    f = new Function("u", "v", `return ${expr};`);
    f(0, 0);
  } catch (e) {
    throw new Error("Could not parse expression: " + e.message);
  }
  return f;
}

// numeric-only expressions for bounds (uses same pi/sin/cos treatment)
function evalNumericExpression(exprRaw) {
  if (!exprRaw || !exprRaw.trim()) {
    throw new Error("Parameter bound expression is empty.");
  }

  let expr = exprRaw.trim();
  expr = expr.replace(/\^/g, "**");
  expr = expr.replace(/\bpi\b/gi, "Math.PI");

  const funcs = [
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "sinh",
    "cosh",
    "tanh",
    "exp",
    "log",
    "sqrt",
    "abs",
    "floor",
    "ceil",
    "round",
    "pow",
    "min",
    "max",
  ];
  funcs.forEach((fn) => {
    const re = new RegExp("\\b" + fn + "\\b", "g");
    expr = expr.replace(re, "Math." + fn);
  });

  try {
    const f = new Function(`return (${expr});`);
    const val = f();
    if (!isFinite(val)) {
      throw new Error(`Expression "${exprRaw}" evaluated to non-finite value.`);
    }
    return Number(val);
  } catch (e) {
    throw new Error(`Could not parse bound "${exprRaw}": ${e.message}`);
  }
}

function showStatus(msg, type = "ok") {
  const el = statusEl();
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("ok", "error");
  if (type) el.classList.add(type);
}

// --- Parametric surface building ---

function buildSurface() {
  const xExpr = document.getElementById("expr-x").value;
  const yExpr = document.getElementById("expr-y").value;
  const zExpr = document.getElementById("expr-z").value;

  const uMinStr = document.getElementById("u-min").value;
  const uMaxStr = document.getElementById("u-max").value;
  const vMinStr = document.getElementById("v-min").value;
  const vMaxStr = document.getElementById("v-max").value;

  const uStepsStr = document.getElementById("u-steps").value;
  const vStepsStr = document.getElementById("v-steps").value;

  const wireframe = document.getElementById("wireframe-toggle").checked;

  let uMin, uMax, vMin, vMax;
  let uSteps, vSteps;

  try {
    uMin = evalNumericExpression(uMinStr);
    uMax = evalNumericExpression(uMaxStr);
    vMin = evalNumericExpression(vMinStr);
    vMax = evalNumericExpression(vMaxStr);

    if (!isFinite(uMin) || !isFinite(uMax) || !isFinite(vMin) || !isFinite(vMax)) {
      throw new Error("Parameter bounds must evaluate to finite numbers.");
    }
    if (uMax <= uMin || vMax <= vMin) {
      throw new Error("Max bounds must be greater than min bounds.");
    }

    uSteps = parseInt(uStepsStr, 10);
    vSteps = parseInt(vStepsStr, 10);

    if (!Number.isInteger(uSteps) || uSteps < 4) {
      throw new Error("u steps must be an integer ≥ 4.");
    }
    if (!Number.isInteger(vSteps) || vSteps < 4) {
      throw new Error("v steps must be an integer ≥ 4.");
    }

    if (uSteps * vSteps > 50000) {
      throw new Error("Grid too dense (uSteps * vSteps > 50k). Reduce resolution.");
    }
  } catch (e) {
    showStatus(e.message, "error");
    return;
  }

  let fx, fy, fz;
  try {
    fx = compileExpression(xExpr);
    fy = compileExpression(yExpr);
    fz = compileExpression(zExpr);
  } catch (e) {
    showStatus(e.message, "error");
    return;
  }

  const uCount = uSteps + 1;
  const vCount = vSteps + 1;
  const positions = new Float32Array(uCount * vCount * 3);

  let pIndex = 0;
  for (let i = 0; i < uCount; i++) {
    const u = uMin + ((uMax - uMin) * i) / uSteps;
    for (let j = 0; j < vCount; j++) {
      const v = vMin + ((vMax - vMin) * j) / vSteps;
      let x, y, z;
      try {
        x = fx(u, v);
        y = fy(u, v);
        z = fz(u, v);
      } catch (e) {
        showStatus(
          `Error evaluating at (u, v) = (${u.toFixed(3)}, ${v.toFixed(
            3
          )}): ${e.message}`,
          "error"
        );
        return;
      }
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
        showStatus(
          `Non-finite value at (u, v) = (${u.toFixed(3)}, ${v.toFixed(3)}).`,
          "error"
        );
        return;
      }

      positions[pIndex++] = x;
      positions[pIndex++] = y;
      positions[pIndex++] = z;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const indices = [];
  for (let i = 0; i < uSteps; i++) {
    for (let j = 0; j < vSteps; j++) {
      const a = i * vCount + j;
      const b = (i + 1) * vCount + j;
      const c = (i + 1) * vCount + (j + 1);
      const d = i * vCount + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color: 0x60a5fa,
    metalness: 0.15,
    roughness: 0.45,
    side: THREE.DoubleSide,
    wireframe: wireframe,
  });

  const mesh = new THREE.Mesh(geometry, material);

  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.geometry.dispose();
    currentMesh.material.dispose();
  }
  currentMesh = mesh;
  scene.add(mesh);

  const bs = geometry.boundingSphere;
  if (bs) {
    const r = bs.radius || 1;
    controls.target.copy(bs.center);

    const offset = r * 2.8;
    camera.position.set(
      bs.center.x + offset,
      bs.center.y + offset * 0.4,
      bs.center.z + offset
    );

    camera.near = r / 50 || 0.01;
    camera.far = r * 40 || 200;
    camera.updateProjectionMatrix();
  }

  showStatus("Surface updated ✔", "ok");
}

// --- Presets (save / load & examples) ---

function applyPresetToUI(preset) {
  if (!preset) return;

  if (preset.name) {
    const nameInput = document.getElementById("preset-name");
    if (nameInput) nameInput.value = preset.name;
  }

  document.getElementById("expr-x").value = preset.x || "";
  document.getElementById("expr-y").value = preset.y || "";
  document.getElementById("expr-z").value = preset.z || "";

  document.getElementById("u-min").value = preset.uMin ?? "";
  document.getElementById("u-max").value = preset.uMax ?? "";
  document.getElementById("v-min").value = preset.vMin ?? "";
  document.getElementById("v-max").value = preset.vMax ?? "";

  if (preset.uSteps != null) {
    document.getElementById("u-steps").value = preset.uSteps;
  }
  if (preset.vSteps != null) {
    document.getElementById("v-steps").value = preset.vSteps;
  }
}

function applyExample(key) {
  if (key === "custom") {
    showStatus("Custom mode: your existing equations are preserved.", "ok");
    return;
  }

  const ex = EXAMPLES[key];
  if (!ex) return;

  applyPresetToUI(ex);
  buildSurface();
}

function collectPresetFromUI() {
  const name =
    document.getElementById("preset-name").value.trim() || "My surface";

  const uSteps = parseInt(document.getElementById("u-steps").value, 10);
  const vSteps = parseInt(document.getElementById("v-steps").value, 10);

  return {
    type: "paramSurfacePreset",
    version: 1,
    name,
    x: document.getElementById("expr-x").value,
    y: document.getElementById("expr-y").value,
    z: document.getElementById("expr-z").value,
    uMin: document.getElementById("u-min").value,
    uMax: document.getElementById("u-max").value,
    vMin: document.getElementById("v-min").value,
    vMax: document.getElementById("v-max").value,
    uSteps: Number.isFinite(uSteps) ? uSteps : undefined,
    vSteps: Number.isFinite(vSteps) ? vSteps : undefined,
  };
}

function handleSavePreset() {
  try {
    const preset = collectPresetFromUI();
    const json = JSON.stringify(preset, null, 2);

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const slug =
      (preset.name || "surface")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "surface";

    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus(`Preset "${preset.name}" downloaded.`, "ok");
  } catch (e) {
    showStatus("Failed to save preset: " + (e.message || e), "error");
  }
}

function handleLoadPreset(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const data = JSON.parse(text);

      if (!data || typeof data !== "object") {
        throw new Error("File does not contain a valid preset object.");
      }

      let preset = data;
      if (Array.isArray(data.presets) && data.presets.length > 0) {
        preset = data.presets[0];
      }

      applyPresetToUI(preset);
      buildSurface();

      showStatus(`Loaded preset "${preset.name || file.name}".`, "ok");
    } catch (err) {
      showStatus("Could not read preset file: " + err.message, "error");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

// --- Fourier drawing section ---

function clearDrawCanvas() {
  if (!drawCtx || !drawCanvas) return;
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawCtx.fillStyle = "#020617";
  drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawCtx.strokeStyle = "rgba(148,163,184,0.5)";
  drawCtx.lineWidth = 1;
  drawCtx.strokeRect(0.5, 0.5, drawCanvas.width - 1, drawCanvas.height - 1);
}

function setupFourierDrawing() {
  drawCanvas = document.getElementById("draw-canvas");
  if (!drawCanvas) return;
  drawCtx = drawCanvas.getContext("2d");
  clearDrawCanvas();

  const getPos = (evt) => {
    const rect = drawCanvas.getBoundingClientRect();
    let clientX, clientY;
    if (evt.touches && evt.touches.length > 0) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    } else {
      clientX = evt.clientX;
      clientY = evt.clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const start = (evt) => {
    evt.preventDefault();
    isDrawing = true;
    drawPoints = [];
    const p = getPos(evt);
    drawPoints.push(p);
    drawCtx.beginPath();
    drawCtx.strokeStyle = "#e5e7eb";
    drawCtx.lineWidth = 2;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.moveTo(p.x, p.y);
  };

  const move = (evt) => {
    if (!isDrawing) return;
    evt.preventDefault();
    const p = getPos(evt);
    const last = drawPoints[drawPoints.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy < 1) return; // avoid too dense points
    drawPoints.push(p);
    drawCtx.lineTo(p.x, p.y);
    drawCtx.stroke();
  };

  const end = (evt) => {
    if (!isDrawing) return;
    evt.preventDefault();
    isDrawing = false;
    drawCtx.closePath();
  };

  drawCanvas.addEventListener("mousedown", start);
  drawCanvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  drawCanvas.addEventListener("touchstart", start, { passive: false });
  drawCanvas.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend", end);
}

function computeFourierCoeffs(vals, maxK) {
  const N = vals.length;
  const a = new Array(maxK + 1).fill(0);
  const b = new Array(maxK + 1).fill(0);
  let sum0 = 0;

  for (let n = 0; n < N; n++) {
    const t = (2 * Math.PI * n) / N;
    const v = vals[n];
    sum0 += v;
    for (let k = 1; k <= maxK; k++) {
      a[k] += v * Math.cos(k * t);
      b[k] += v * Math.sin(k * t);
    }
  }

  const a0 = (2 / N) * sum0;
  for (let k = 1; k <= maxK; k++) {
    a[k] = (2 / N) * a[k];
    b[k] = (2 / N) * b[k];
  }
  return { a0, a, b, K: maxK };
}

function buildFourierEquation(coeffs, paramName) {
  const { a0, a, b, K } = coeffs;
  const eps = 1e-4;
  let expr = "";
  let first = true;

  const addTerm = (coeff, baseStr) => {
    if (Math.abs(coeff) < eps) return;
    const absC = Math.abs(coeff);
    const cStr = absC.toFixed(4);
    if (first) {
      expr += (coeff < 0 ? "-" : "") + cStr + (baseStr ? `*${baseStr}` : "");
      first = false;
    } else {
      expr += coeff < 0 ? " - " : " + ";
      expr += cStr + (baseStr ? `*${baseStr}` : "");
    }
  };

  addTerm(a0 / 2, "");
  for (let k = 1; k <= K; k++) {
    addTerm(a[k], `cos(${k}*${paramName})`);
    addTerm(b[k], `sin(${k}*${paramName})`);
  }

  if (first) return "0";
  return expr;
}

function fourierSeriesEval(coeffs, t) {
  const { a0, a, b, K } = coeffs;
  let v = a0 / 2;
  for (let k = 1; k <= K; k++) {
    v += a[k] * Math.cos(k * t) + b[k] * Math.sin(k * t);
  }
  return v;
}

function redrawFourierApprox(coeffsX, coeffsY) {
  if (!drawCtx || !drawCanvas) return;

  clearDrawCanvas();

  // draw original stroke (light)
  if (drawPoints.length > 1) {
    drawCtx.save();
    drawCtx.strokeStyle = "#9ca3af";
    drawCtx.lineWidth = 1.5;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.beginPath();
    drawCtx.moveTo(drawPoints[0].x, drawPoints[0].y);
    for (let i = 1; i < drawPoints.length; i++) {
      drawCtx.lineTo(drawPoints[i].x, drawPoints[i].y);
    }
    drawCtx.stroke();
    drawCtx.restore();
  }

  // draw Fourier approximation
  const w = drawCanvas.width;
  const h = drawCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) / 2;

  drawCtx.save();
  drawCtx.strokeStyle = "#60a5fa";
  drawCtx.lineWidth = 1.5;
  drawCtx.beginPath();

  const steps = 400;
  for (let i = 0; i <= steps; i++) {
    const t = (2 * Math.PI * i) / steps;
    const x = fourierSeriesEval(coeffsX, t);
    const y = fourierSeriesEval(coeffsY, t);
    const px = cx + x * scale;
    const py = cy - y * scale;
    if (i === 0) drawCtx.moveTo(px, py);
    else drawCtx.lineTo(px, py);
  }
  drawCtx.stroke();
  drawCtx.restore();
}

function handleFourierCompute() {
  if (!drawPoints || drawPoints.length < 16) {
    showStatus("Draw a curve in the canvas first (at least ~16 points).", "error");
    return;
  }

  const termsInput = document.getElementById("fourier-terms");
  let K = parseInt(termsInput.value, 10);
  if (!Number.isFinite(K) || K < 1) K = 5;
  if (K > 60) K = 60;
  termsInput.value = K;

  const N = drawPoints.length;
  const xs = new Array(N);
  const ys = new Array(N);

  const w = drawCanvas.width;
  const h = drawCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) / 2;

  for (let n = 0; n < N; n++) {
    const p = drawPoints[n];
    xs[n] = (p.x - cx) / scale;
    ys[n] = (cy - p.y) / scale; // flip y to make up positive
  }

  const coeffsX = computeFourierCoeffs(xs, K);
  const coeffsY = computeFourierCoeffs(ys, K);

  const eqX = buildFourierEquation(coeffsX, "u");
  const eqY = buildFourierEquation(coeffsY, "u");

  document.getElementById("fourier-x-output").value = eqX;
  document.getElementById("fourier-y-output").value = eqY;

  redrawFourierApprox(coeffsX, coeffsY);
  showStatus(`Fourier approximation computed with K=${K} terms.`, "ok");
}

function handleFourierClear() {
  drawPoints = [];
  clearDrawCanvas();
  document.getElementById("fourier-x-output").value = "";
  document.getElementById("fourier-y-output").value = "";
  showStatus("Drawing cleared.", "ok");
}

// --- UI wiring ---

function setupUI() {
  const exampleSelect = document.getElementById("example-select");
  exampleSelect.addEventListener("change", (e) =>
    applyExample(e.target.value)
  );

  document
    .getElementById("plot-button")
    .addEventListener("click", () => buildSurface());

  document
    .getElementById("wireframe-toggle")
    .addEventListener("change", () => {
      if (currentMesh) buildSurface();
    });

  // save / load preset
  const saveBtn = document.getElementById("save-preset-button");
  if (saveBtn) saveBtn.addEventListener("click", handleSavePreset);

  const loadInput = document.getElementById("load-preset-input");
  if (loadInput) loadInput.addEventListener("change", handleLoadPreset);

  // Fourier buttons
  const fourierComputeBtn = document.getElementById("fourier-compute");
  if (fourierComputeBtn)
    fourierComputeBtn.addEventListener("click", handleFourierCompute);

  const fourierClearBtn = document.getElementById("fourier-clear");
  if (fourierClearBtn)
    fourierClearBtn.addEventListener("click", handleFourierClear);

  const fourierToVisBtn = document.getElementById("fourier-to-visualizer");
  if (fourierToVisBtn)
    fourierToVisBtn.addEventListener("click", () => {
      const eqX = document
        .getElementById("fourier-x-output")
        .value.trim();
      const eqY = document
        .getElementById("fourier-y-output")
        .value.trim();
      if (!eqX || !eqY) {
        showStatus("Compute a Fourier approximation first.", "error");
        return;
      }

      document.getElementById("expr-x").value = eqX;
      document.getElementById("expr-y").value = eqY;
      document.getElementById("expr-z").value = "0.1 * v";

      document.getElementById("u-min").value = "0";
      document.getElementById("u-max").value = "2 * pi";
      document.getElementById("v-min").value = "-1";
      document.getElementById("v-max").value = "1";

      buildSurface();
      showStatus("Fourier curve sent to visualizer (as a thin ribbon).", "ok");
    });

  // Enter in core fields triggers plot
  ["expr-x", "expr-y", "expr-z", "u-min", "u-max", "v-min", "v-max"].forEach(
    (id) => {
      const el = document.getElementById(id);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          buildSurface();
        }
      });
    }
  );
}

// --- Init ---

window.addEventListener("DOMContentLoaded", () => {
  initThree();
  setupUI();
  setupFourierDrawing();
  applyExample("sphere");
});
