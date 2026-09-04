const CONFIG = {
  UPLOAD_WEBHOOK: "https://dailyastroinfo.app.n8n.cloud/webhook/manana-rindo-subir-fotos-v5",
  ANALYZE_WEBHOOK: "https://dailyastroinfo.app.n8n.cloud/webhook/manana-rindo-analizar-v7",
  CHECKOUT_WEBHOOK: "https://dailyastroinfo.app.n8n.cloud/webhook/manana-rindo-crear-checkout-prod-v1",
  MAX_FILES: 30,
  UPLOAD_BATCH: 4,
  TARGET_IMAGE_MB: 1.7,
  UPLOAD_MAX_SIDE: 2200
};

const PRODUCTS = {
  entender: { label: "Entender el tema", price: 350 },
  practicar: { label: "Practicar", price: 350 },
  completo: { label: "Entender + practicar", price: 600 }
};

const demoCopy = {
  resumen: `<div class="demo-item"><h4>1. La Tierra primitiva</h4><p>Las condiciones iniciales del planeta permitieron que sustancias simples comenzaran a combinarse.</p></div><div class="demo-item"><h4>2. Primeras moléculas orgánicas</h4><p>Distintas hipótesis explican cómo pudieron formarse los compuestos necesarios para la vida.</p></div><div class="demo-item"><h4>3. De moléculas a células</h4><p>El paso decisivo fue la aparición de estructuras capaces de organizarse y reproducirse.</p></div>`,
  prioridades: `<div class="demo-priority"><b>ALTA</b><div><strong>Experimento de Miller</strong><p>Entender qué intentó demostrar y cuáles fueron sus resultados.</p></div></div><div class="demo-priority"><b>ALTA</b><div><strong>Hipótesis de Oparin</strong><p>Relacionar atmósfera primitiva, energía y moléculas orgánicas.</p></div></div><div class="demo-priority"><b>MEDIA</b><div><strong>Primeras células</strong><p>Diferenciar las principales evidencias.</p></div></div>`,
  practica: `<div class="demo-question"><small>PREGUNTA 1 · DESARROLLO</small><h4>¿Qué demostró el experimento de Miller?</h4><p>Explicalo relacionando las condiciones utilizadas con la Tierra primitiva.</p></div><div class="demo-question" style="margin-top:10px"><small>PREGUNTA 2 · OPCIÓN MÚLTIPLE</small><h4>¿Qué apareció primero?</h4><p>A. Células complejas &nbsp; B. Moléculas orgánicas &nbsp; C. Plantas</p></div>`,
  plan: `<div class="demo-plan"><b>20 min</b><div><strong>Entender la secuencia</strong><p>Tierra primitiva → moléculas → primeras células.</p></div></div><div class="demo-plan"><b>25 min</b><div><strong>Fijar los experimentos</strong><p>Oparin, Miller y Fox.</p></div></div><div class="demo-plan"><b>15 min</b><div><strong>Practicar sin mirar</strong><p>Responder las preguntas y revisar errores.</p></div></div>`
};

const state = {
  view: "upload",
  files: [],
  analysis: null,
  uploadedFiles: [],
  orderId: null,
  analysisOrderId: null,
  checkoutPending: false,
  pack: "completo",
  materia: "",
  level: "Secundaria",
  time: "2 horas",
  date: ""
};

const appView = document.querySelector("#appView");
const appShell = document.querySelector("#appShell");
const progressButtons = [...document.querySelectorAll(".app-progress button")];
const views = ["upload", "analysis", "choose", "checkout"];
let previewUrls = [];

function track(name, params = {}) {
  try {
    if (typeof window.gtag === "function") window.gtag("event", name, { ...params, transport_type: "beacon" });
  } catch {}
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\bNo se genera(?:rá)? el pack(?: de estudio)? (?:todavía|aún|en esta etapa)\.?/gi, "")
    .replace(/\bTodavía no se genera(?:rá)? el pack(?: de estudio)?\.?/gi, "")
    .replace(/\bEn esta etapa no se genera(?:rá)? el pack(?: de estudio)?\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function money(value) {
  return `$${Number(value).toLocaleString("es-AR")}`;
}

function makeOrderId() {
  return crypto.randomUUID ? crypto.randomUUID() : `mr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function randomHex(bytes = 16) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map(value => value.toString(16).padStart(2, "0")).join("");
}

function setDefaultDate() {
  const future = new Date();
  future.setDate(future.getDate() + 3);
  state.date = future.toISOString().slice(0, 10);
}

function updateProgress(view) {
  const current = views.indexOf(view);
  progressButtons.forEach((button, index) => {
    button.classList.toggle("active", index === current);
    button.classList.toggle("done", current >= 0 && index < current);
    button.disabled = current < 0 || index > current || index === 3;
  });
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

let scrollAnimationFrame = null;

function scrollToElement(element, block = "start", onComplete) {
  if (!element) return;
  if (scrollAnimationFrame && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(scrollAnimationFrame);
  const run = () => {
    const start = window.scrollY;
    const bounds = element.getBoundingClientRect();
    const offset = block === "start" ? 16 : 0;
    const rawTarget = block === "center"
      ? start + bounds.top - (window.innerHeight - Math.min(bounds.height, window.innerHeight)) / 2
      : start + bounds.top - offset;
    const maxTarget = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const target = Math.min(maxTarget, Math.max(0, rawTarget));
    const distance = target - start;
    const finish = () => {
      scrollAnimationFrame = null;
      onComplete?.();
    };

    if (prefersReducedMotion() || Math.abs(distance) < 2 || typeof window.requestAnimationFrame !== "function") {
      window.scrollTo(0, target);
      finish();
      return;
    }

    const duration = Math.min(520, Math.max(260, Math.abs(distance) * .12));
    const startedAt = performance.now();
    const animate = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo(0, start + distance * eased);
      if (progress < 1) scrollAnimationFrame = window.requestAnimationFrame(animate);
      else finish();
    };
    scrollAnimationFrame = window.requestAnimationFrame(animate);
  };
  if (typeof window.requestAnimationFrame === "function") scrollAnimationFrame = window.requestAnimationFrame(run);
  else setTimeout(run, 0);
}

function scrollToAppStart({ focus = true } = {}) {
  scrollToElement(appShell, "start", () => {
    if (focus) appShell.focus({ preventScroll: true });
  });
}

function goToApp() {
  scrollToAppStart();
}

function resetRemoteState() {
  state.analysis = null;
  state.uploadedFiles = [];
  state.orderId = null;
  state.analysisOrderId = null;
}

function revokePreviewUrls() {
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
}

function fileThumb(file, index) {
  const url = URL.createObjectURL(file);
  previewUrls.push(url);
  return `<div class="selected-thumb"><img src="${url}" alt="Vista previa de ${escapeHtml(file.name)}"><span>Foto ${index + 1}</span><button type="button" class="remove-photo" data-remove-photo="${index}" aria-label="Quitar ${escapeHtml(file.name)}">×</button></div>`;
}

function renderNotice(message, type = "error") {
  return `<div class="app-notice ${type}" role="alert">${message}</div>`;
}

function selectFiles(files) {
  const allFiles = [...files];
  const images = allFiles.filter(file => file.type.startsWith("image/"));
  if (images.length !== allFiles.length) {
    appView.insertAdjacentHTML("afterbegin", renderNotice("Sólo podemos procesar archivos de imagen."));
    return;
  }
  if (images.length > CONFIG.MAX_FILES) {
    appView.insertAdjacentHTML("afterbegin", renderNotice(`Podés subir hasta ${CONFIG.MAX_FILES} fotos.`));
    return;
  }
  state.files = images;
  resetRemoteState();
  track("photos_selected", { files_total: images.length });
  renderUpload();
}

function renderUpload(message = "", { scroll = false } = {}) {
  state.view = "upload";
  updateProgress("upload");
  revokePreviewUrls();
  appView.className = "app-view";
  appView.innerHTML = `
    ${message ? renderNotice(message) : ""}
    <h3>Subí tus apuntes como estén.</h3>
    <p>Fotos de celular, hojas manuscritas, libros o ejercicios. No hace falta ordenar nada.</p>
    <label class="drop-zone" id="dropZone">
      <input id="fileInput" type="file" accept="image/*" multiple>
      <span><span class="drop-icon">＋</span><strong>Elegí fotos o arrastralas acá</strong><small>JPG, PNG y fotos del celular · hasta 30 imágenes</small></span>
    </label>
    ${state.files.length ? `<div class="photo-count">${state.files.length} de ${CONFIG.MAX_FILES} fotos</div><div class="selected-files">${state.files.slice(0, 8).map(fileThumb).join("")}${state.files.length > 8 ? `<div class="more-photos">+${state.files.length - 8}<small>fotos más</small></div>` : ""}</div>` : ""}
    <div class="privacy-inline">Tus fotos se eliminan dentro de las 24 horas y nunca se usan para entrenar modelos. <a href="privacidad.html">Cómo cuidamos tus datos</a>.</div>
    <div class="app-actions"><button class="button button-primary" id="analyzeButton" ${state.files.length ? "" : "disabled"}>Analizar mis apuntes gratis <span>→</span></button></div>`;

  const input = document.querySelector("#fileInput");
  const drop = document.querySelector("#dropZone");
  input.addEventListener("change", event => selectFiles(event.target.files));
  ["dragenter", "dragover"].forEach(type => drop.addEventListener(type, event => {
    event.preventDefault();
    drop.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach(type => drop.addEventListener(type, event => {
    event.preventDefault();
    drop.classList.remove("dragging");
  }));
  drop.addEventListener("drop", event => selectFiles(event.dataTransfer.files));
  document.querySelectorAll("[data-remove-photo]").forEach(button => button.addEventListener("click", () => {
    state.files.splice(Number(button.dataset.removePhoto), 1);
    resetRemoteState();
    renderUpload();
  }));
  document.querySelector("#analyzeButton").addEventListener("click", analyzeNotes);
  if (scroll) scrollToAppStart();
}

function renderLoading(title, text) {
  state.view = "loading";
  updateProgress("loading");
  appView.className = "analysis-loading";
  appView.innerHTML = `<div class="loading-copy"><div class="loading-orbit"></div><h3 id="loadingTitle">${escapeHtml(title)}</h3><p id="loadingText">${escapeHtml(text)}</p><div class="loading-bar"><i id="loadingFill"></i></div><strong class="loading-percent" id="loadingPercent">0%</strong></div>`;
  scrollToAppStart();
}

function setLoading(percent, title, text) {
  const fill = document.querySelector("#loadingFill");
  if (!fill) return;
  fill.style.width = `${percent}%`;
  document.querySelector("#loadingPercent").textContent = `${Math.round(percent)}%`;
  document.querySelector("#loadingTitle").textContent = title;
  document.querySelector("#loadingText").textContent = text;
}

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function compressPhoto(file) {
  let source;
  try { source = await fileDataUrl(file); }
  catch { throw new Error(`No pudimos abrir ${file.name}.`); }

  let image;
  try { image = await loadImage(source); }
  catch { throw new Error(`El navegador no pudo leer ${file.name}. Probá usando una foto JPG o PNG.`); }

  let maxSide = CONFIG.UPLOAD_MAX_SIDE;
  let quality = 0.84;
  let blob = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
    blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error(`No pudimos optimizar ${file.name}.`);
    if (blob.size / 1048576 <= CONFIG.TARGET_IMAGE_MB) break;
    if (quality > 0.68) quality -= 0.08;
    else maxSide = Math.max(1450, Math.round(maxSide * 0.84));
  }
  return { name: `${file.name.replace(/\.[^.]+$/, "")}.jpg`, mime: "image/jpeg", data_url: await blobDataUrl(blob) };
}

async function parseJsonResponse(response, fallback) {
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error(fallback); }
  if (!response.ok || data.ok === false) throw new Error(data.error || data.message || fallback);
  return data;
}

async function sendUploadBatch(batch, batchIndex, uploadOrderId) {
  const response = await fetch(CONFIG.UPLOAD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ client_version: "mr-web-prod-v1", order_id: uploadOrderId, batch_index: batchIndex, files: batch.map(file => ({ name: file.name, mime: file.mime, data_url: file.data_url })) })
  });
  const data = await parseJsonResponse(response, "No pudimos subir las fotos. Intentá nuevamente.");
  if (!Array.isArray(data.files) || data.files.length !== batch.length) throw new Error("No recibimos todas las fotos. Intentá nuevamente.");
  return data.files;
}

async function uploadPhotos(uploadOrderId) {
  const references = [];
  let batch = [];
  let batchIndex = 0;
  for (let index = 0; index < state.files.length; index += 1) {
    setLoading(5 + (index / state.files.length) * 42, "Preparando tus fotos…", `Optimizando foto ${index + 1} de ${state.files.length}.`);
    batch.push(await compressPhoto(state.files[index]));
    if (batch.length === CONFIG.UPLOAD_BATCH || index === state.files.length - 1) {
      setLoading(12 + (index / state.files.length) * 43, "Subiendo tus apuntes…", "La transferencia puede tardar unos segundos.");
      references.push(...await sendUploadBatch(batch, batchIndex, uploadOrderId));
      batch = [];
      batchIndex += 1;
    }
  }
  return references;
}

async function analyzeNotes() {
  if (!state.files.length) return;
  track("analysis_started", { files_count: state.files.length });
  renderLoading("Preparando tus fotos…", "Las optimizamos para que el análisis sea más rápido.");
  const uploadOrderId = makeOrderId();
  state.orderId = uploadOrderId;
  try {
    const references = await uploadPhotos(uploadOrderId);
    if (state.orderId !== uploadOrderId) throw new Error("Las fotos cambiaron. Volvé a analizarlas.");
    state.uploadedFiles = references;
    setLoading(68, "Leyendo tus apuntes…", "Estamos detectando temas, títulos y ejercicios.");
    const response = await fetch(CONFIG.ANALYZE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ client_version: "mr-web-prod-v1", order_id: uploadOrderId, submitted_at: new Date().toISOString(), materia: "", nivel: "", tiempo_estudio: "", fecha_examen: "", files: references })
    });
    setLoading(88, "Agrupando los temas…", "Ya casi está lista la revisión.");
    const data = await parseJsonResponse(response, "No pudimos analizar el material. Intentá nuevamente.");
    if (state.orderId !== uploadOrderId) throw new Error("Las fotos cambiaron. Volvé a analizarlas.");
    state.analysis = data.analysis || data;
    state.analysisOrderId = uploadOrderId;
    state.materia = cleanText(state.analysis.materia_detectada || "");
    setLoading(100, "Análisis listo", `${references.length} fotos procesadas.`);
    track("analysis_completed", { files_count: references.length, status: String(state.analysis.status || ""), can_generate: state.analysis.puede_generar_pack !== false, recommendation: String(state.analysis.recomendacion || "") });
    setTimeout(renderAnalysis, 350);
  } catch (error) {
    resetRemoteState();
    renderUpload(`<strong>No pudimos completar el análisis.</strong><br>${escapeHtml(error.message)}`, { scroll: true });
  }
}

function usefulWarnings(warnings) {
  const seen = new Set();
  return (Array.isArray(warnings) ? warnings : []).map(cleanText).filter(Boolean).filter(warning => {
    const lower = warning.toLowerCase();
    if ((lower.includes("coincide") || lower.includes("coinciden")) && !lower.includes("no coincide") && !lower.includes("no coinciden")) return false;
    if (lower.includes("materia declarada") && lower.includes("correct")) return false;
    return true;
  }).filter(warning => {
    const key = warning.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getTopicMarkup(topic) {
  const title = cleanText(topic?.titulo || topic);
  const detail = cleanText(topic?.detalle || "");
  if (!title) return "";
  return `<div class="topic-row"><strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</div>`;
}

function qualityLabel(analysis) {
  const value = analysis?.calidad?.legibilidad ?? analysis?.legibilidad ?? "";
  if (typeof value === "number") return `${Math.round(value <= 1 ? value * 100 : value)}% legible`;
  return String(value).trim() ? escapeHtml(value) : "Material legible";
}

function renderAnalysis() {
  state.view = "analysis";
  updateProgress("analysis");
  const analysis = state.analysis || {};
  const canContinue = analysis.puede_generar_pack !== false && !["ilegible", "no_es_material_de_estudio"].includes(analysis.status);
  const topics = (Array.isArray(analysis.temas) ? analysis.temas : []).map(getTopicMarkup).join("");
  const warnings = usefulWarnings(analysis.advertencias);
  const summary = cleanText(analysis.resumen_material || analysis.mensaje || "Hay suficiente información para preparar tu material de estudio.");
  state.pack = PRODUCTS[analysis.recomendacion] ? analysis.recomendacion : "completo";
  appView.className = "app-view";
  appView.innerHTML = `
    <div class="analysis-hero ${canContinue ? "" : "analysis-problem"}"><span class="analysis-ok">${canContinue ? "✓" : "!"}</span><div><h3>${canContinue ? "Entendimos tus apuntes" : "Necesitamos fotos más claras"}</h3><p>${escapeHtml(cleanText(analysis.mensaje) || (canContinue ? "Pudimos leer y ordenar el material." : "No hay suficiente información legible para continuar."))}</p></div>${canContinue ? `<span class="quality-pill">${qualityLabel(analysis)}</span>` : ""}</div>
    ${canContinue ? `<div class="analysis-summary"><strong>${escapeHtml(state.materia || "Materia detectada")}</strong><p>${escapeHtml(summary)}</p></div>` : ""}
    <div class="topic-list">${topics || `<div class="topic-row"><strong>No pudimos separar los temas con seguridad.</strong><span>Probá con fotos más cercanas y sin sombras.</span></div>`}</div>
    ${warnings.length ? `<div class="app-notice warning"><strong>Antes de seguir</strong><ul>${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>` : ""}
    ${canContinue ? `<p><strong>Ahora adaptemos el material a vos.</strong></p><div class="form-grid"><div class="field field-wide"><label for="subject">Materia</label><input id="subject" type="text" maxlength="80" value="${escapeHtml(state.materia)}" placeholder="Ej.: Biología"></div><div class="field"><label for="level">Nivel</label><select id="level"><option>Primaria</option><option>Secundaria</option><option>Terciario</option><option>Universidad</option><option>Otro</option></select></div><div class="field"><label for="time">Tiempo disponible</label><select id="time"><option>30 minutos</option><option>1 hora</option><option>2 horas</option><option>3 horas</option><option>Más de 3 horas</option></select></div><div class="field field-wide"><label for="date">¿Cuándo rendís?</label><input id="date" type="date" min="${new Date().toISOString().slice(0, 10)}"></div></div>` : ""}
    <div class="app-actions"><button class="button button-ghost" id="backUpload">${canContinue ? "Cambiar fotos" : "Subir otras fotos"}</button>${canContinue ? `<button class="button button-primary" id="continueChoose">Ver Packs <span>→</span></button>` : ""}</div>`;

  document.querySelector("#backUpload").addEventListener("click", () => renderUpload("", { scroll: true }));
  scrollToAppStart();
  if (!canContinue) return;
  document.querySelector("#level").value = state.level;
  document.querySelector("#time").value = state.time;
  document.querySelector("#date").value = state.date;
  document.querySelector("#continueChoose").addEventListener("click", () => {
    state.materia = document.querySelector("#subject").value.trim();
    state.level = document.querySelector("#level").value;
    state.time = document.querySelector("#time").value;
    state.date = document.querySelector("#date").value;
    if (!state.materia || !state.level || !state.time || !state.date) {
      appView.querySelector(".form-error")?.remove();
      document.querySelector(".form-grid").insertAdjacentHTML("afterend", `<div class="app-notice error form-error">Completá materia, nivel, tiempo y fecha para continuar.</div>`);
      return;
    }
    renderChoose();
  });
}

function renderChoose() {
  state.view = "choose";
  updateProgress("choose");
  const choices = [["entender", "Entender el tema", "Resumen, explicación y prioridades", "$350"], ["practicar", "Practicar", "15 ejercicios con pistas y soluciones", "$350"], ["completo", "Entender + practicar", "El material completo y un plan de estudio", "$600"]];
  const recommended = PRODUCTS[state.analysis?.recomendacion] ? state.analysis.recomendacion : "completo";
  appView.className = "app-view";
  appView.innerHTML = `
    <h3>¿Cómo querés prepararte?</h3><p>Elegí el tipo de ayuda que más te sirve para este examen.</p>
    <div class="study-context"><span>${escapeHtml(state.materia)}</span><span>${escapeHtml(state.level)}</span><span>${escapeHtml(state.time)}</span></div>
    <div class="pack-choice-grid">${choices.map(([id, name, description, price]) => `<button class="pack-choice ${state.pack === id ? "selected" : ""}" data-pack="${id}" aria-pressed="${state.pack === id}">${recommended === id ? `<span class="choice-badge">RECOMENDADO</span>` : ""}<strong>${name}</strong><small>${description}</small><b>${price}</b></button>`).join("")}</div>
    ${cleanText(state.analysis?.motivo_recomendacion) ? `<div class="recommend-reason"><strong>Nuestra recomendación:</strong> ${escapeHtml(cleanText(state.analysis.motivo_recomendacion))}</div>` : ""}
    <div class="checkout-note"><strong>Pago único con Mercado Pago.</strong> No hay suscripción. Después del pago preparamos tu Pack y te llevamos directamente al material.</div>
    <label class="legal-check"><input type="checkbox" id="legalAccept"> <span>Acepto los <a href="terminos.html" target="_blank" rel="noopener">Términos</a> y leí la <a href="privacidad.html" target="_blank" rel="noopener">Política de privacidad</a>.</span></label>
    <div id="checkoutError"></div>
    <div class="app-actions"><button class="button button-ghost" id="backAnalysis">Atrás</button><button class="button button-primary" id="checkoutButton">Ir a pagar ${money(PRODUCTS[state.pack].price)} <span>→</span></button></div>`;
  document.querySelectorAll("[data-pack]").forEach(button => button.addEventListener("click", () => {
    state.pack = button.dataset.pack;
    track("pack_selected", { pack_type: state.pack, value: PRODUCTS[state.pack].price, currency: "ARS" });
    document.querySelectorAll("[data-pack]").forEach(choice => {
      const selected = choice.dataset.pack === state.pack;
      choice.classList.toggle("selected", selected);
      choice.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    document.querySelector("#checkoutButton").innerHTML = `Ir a pagar ${money(PRODUCTS[state.pack].price)} <span>→</span>`;
  }));
  document.querySelector("#backAnalysis").addEventListener("click", renderAnalysis);
  document.querySelector("#checkoutButton").addEventListener("click", startCheckout);
  scrollToAppStart();
}

async function startCheckout() {
  if (state.checkoutPending) return;
  const errorArea = document.querySelector("#checkoutError");
  if (!document.querySelector("#legalAccept").checked) {
    errorArea.innerHTML = renderNotice("Necesitamos que aceptes los Términos y la Política de privacidad para continuar.");
    scrollToElement(document.querySelector(".legal-check"), "center");
    return;
  }
  if (!state.analysis || !state.orderId || state.analysisOrderId !== state.orderId || state.uploadedFiles.length !== state.files.length) {
    errorArea.innerHTML = renderNotice("Las fotos cambiaron o venció el análisis. Volvé a analizarlas para continuar.");
    return;
  }
  const button = document.querySelector("#checkoutButton");
  const product = PRODUCTS[state.pack];
  state.checkoutPending = true;
  button.disabled = true;
  document.querySelectorAll(".pack-choice, #backAnalysis").forEach(control => { control.disabled = true; });
  button.textContent = "Conectando con Mercado Pago…";
  errorArea.innerHTML = "";
  try {
    const payload = {
      client_version: "mr-web-prod-v1",
      mp_mode: "production",
      order_id: state.orderId,
      pack_id: `mrp_${randomHex(12)}`,
      access_token: randomHex(32),
      tipo_pack: state.pack,
      materia: state.materia,
      nivel: state.level,
      tiempo_estudio: state.time,
      fecha_examen: state.date,
      analysis: state.analysis,
      lastAnalysis: state.analysis,
      files: state.uploadedFiles
    };
    const response = await fetch(CONFIG.CHECKOUT_WEBHOOK, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(payload) });
    const data = await parseJsonResponse(response, "No pudimos iniciar el pago. Intentá nuevamente.");
    if (!data.checkout_url) throw new Error("Mercado Pago no devolvió un enlace de pago.");
    track("checkout_started", { pack_type: state.pack, value: product.price, currency: "ARS", materia: state.materia, nivel: state.level });
    track("begin_checkout", { currency: "ARS", value: product.price, items: [{ item_id: `manana-rindo-${state.pack}`, item_name: product.label, price: product.price, quantity: 1 }] });
    window.location.assign(data.checkout_url);
  } catch (error) {
    state.checkoutPending = false;
    errorArea.innerHTML = renderNotice(`<strong>No pudimos abrir Mercado Pago.</strong><br>${escapeHtml(error.message)}`);
    button.disabled = false;
    document.querySelectorAll(".pack-choice, #backAnalysis").forEach(control => { control.disabled = false; });
    button.innerHTML = `Ir a pagar ${money(product.price)} <span>→</span>`;
    scrollToElement(errorArea, "center");
  }
}

window.addEventListener("pageshow", () => {
  state.checkoutPending = false;
  const button = document.querySelector("#checkoutButton");
  if (!button) return;
  button.disabled = false;
  document.querySelectorAll(".pack-choice, #backAnalysis").forEach(control => { control.disabled = false; });
  button.innerHTML = `Ir a pagar ${money(PRODUCTS[state.pack].price)} <span>→</span>`;
});

document.querySelectorAll("[data-start]").forEach(button => button.addEventListener("click", () => {
  if (button.closest(".price-card")) {
    const text = button.textContent.toLowerCase();
    state.pack = text.includes("completo") ? "completo" : text.includes("practicar") ? "practicar" : "entender";
  }
  goToApp();
}));

document.querySelectorAll('a[href^="#"]:not(.skip-link)').forEach(link => link.addEventListener("click", event => {
  const hash = link.getAttribute("href");
  const target = hash ? document.querySelector(hash) : null;
  if (!target) return;
  event.preventDefault();
  if (window.location.hash !== hash) window.history.pushState(null, "", hash);
  scrollToElement(target);
}));

document.querySelectorAll("[data-demo-tab]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-demo-tab]").forEach(tab => {
    const active = tab === button;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelector("#demoTabContent").innerHTML = demoCopy[button.dataset.demoTab];
}));

progressButtons.forEach(button => button.addEventListener("click", () => {
  if (button.disabled) return;
  const target = button.dataset.jump;
  if (target === "upload") renderUpload("", { scroll: true });
  if (target === "analysis" && state.analysis) renderAnalysis();
  if (target === "choose" && state.analysis) renderChoose();
}));

document.querySelector("#demoTabContent").innerHTML = demoCopy.resumen;
setDefaultDate();
renderUpload();

