(function () {
  "use strict";

  const MAX_SIDE = 4096;
  const DEBOUNCE_MS = 80;

  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const fileNameEl = document.getElementById("fileName");
  const watermarkText = document.getElementById("watermarkText");
  const watermarkMode = document.getElementById("watermarkMode");
  const opacityRange = document.getElementById("opacityRange");
  const opacityOut = document.getElementById("opacityOut");
  const fontScaleRange = document.getElementById("fontScaleRange");
  const fontScaleOut = document.getElementById("fontScaleOut");
  const angleRange = document.getElementById("angleRange");
  const angleOut = document.getElementById("angleOut");
  const spacingRange = document.getElementById("spacingRange");
  const spacingOut = document.getElementById("spacingOut");
  const spacingField = document.getElementById("spacingField");
  const downloadPng = document.getElementById("downloadPng");
  const downloadJpeg = document.getElementById("downloadJpeg");
  const canvas = document.getElementById("preview");
  const previewPlaceholder = document.getElementById("previewPlaceholder");

  /** @type {HTMLImageElement | null} */
  let sourceImage = null;
  let objectUrl = null;
  let debounceTimer = null;

  const ctx = canvas.getContext("2d");

  function scaleDimensions(w, h) {
    if (w <= MAX_SIDE && h <= MAX_SIDE) {
      return { width: w, height: h };
    }
    const scale = MAX_SIDE / Math.max(w, h);
    return {
      width: Math.round(w * scale),
      height: Math.round(h * scale),
    };
  }

  function isAcceptedImage(file) {
    return /^image\/(jpeg|png|webp|gif)$/i.test(file.type);
  }

  function loadFile(file) {
    if (!file || !isAcceptedImage(file)) {
      return;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      sourceImage = img;
      fileNameEl.textContent = file.name;
      fileNameEl.hidden = false;
      previewPlaceholder.hidden = true;
      downloadPng.disabled = false;
      downloadJpeg.disabled = false;
      scheduleDraw();
    };
    img.onerror = function () {
      sourceImage = null;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      fileNameEl.textContent = "Gagal memuat gambar.";
      fileNameEl.hidden = false;
    };
    img.src = objectUrl;
  }

  function scheduleDraw() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      draw();
    }, DEBOUNCE_MS);
  }

  function drawWatermarkTiled(ctx2, w, h, text, opacity, fontSize, angleDeg, spacing) {
    const line = text.replace(/\r?\n/g, " ").trim() || " ";
    const rad = (angleDeg * Math.PI) / 180;
    ctx2.save();
    ctx2.globalAlpha = opacity;
    ctx2.font = `${fontSize}px system-ui, sans-serif`;
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.lineJoin = "round";
    ctx2.lineWidth = Math.max(1, fontSize * 0.08);

    const measure = ctx2.measureText(line);
    const textW = measure.width;
    const step = Math.max(spacing, textW * 0.35 + fontSize);

    ctx2.translate(w / 2, h / 2);
    ctx2.rotate(rad);

    const extent = Math.sqrt(w * w + h * h) + step * 2;
    const n = Math.ceil(extent / step) + 2;
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const x = i * step;
        const y = j * step;
        ctx2.strokeStyle = "#000000";
        ctx2.fillStyle = "#ffffff";
        ctx2.strokeText(line, x, y);
        ctx2.fillText(line, x, y);
      }
    }
    ctx2.restore();
  }

  function drawWatermarkCenter(ctx2, w, h, text, opacity, fontSize, angleDeg) {
    const lines = text.split(/\r?\n/).map(function (s) {
      return s.trim();
    }).filter(Boolean);
    if (lines.length === 0) {
      lines.push(" ");
    }
    const rad = (angleDeg * Math.PI) / 180;
    const lineHeight = fontSize * 1.25;
    ctx2.save();
    ctx2.globalAlpha = opacity;
    ctx2.font = `${fontSize}px system-ui, sans-serif`;
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.lineJoin = "round";
    ctx2.lineWidth = Math.max(1, fontSize * 0.08);
    ctx2.translate(w / 2, h / 2);
    ctx2.rotate(rad);
    const totalH = (lines.length - 1) * lineHeight;
    const startY = -totalH / 2;
    lines.forEach(function (line, i) {
      const y = startY + i * lineHeight;
      ctx2.strokeStyle = "#000000";
      ctx2.fillStyle = "#ffffff";
      ctx2.strokeText(line, 0, y);
      ctx2.fillText(line, 0, y);
    });
    ctx2.restore();
  }

  function draw() {
    if (!sourceImage || !sourceImage.complete) {
      return;
    }
    const sw = sourceImage.naturalWidth;
    const sh = sourceImage.naturalHeight;
    const dim = scaleDimensions(sw, sh);
    const w = dim.width;
    const h = dim.height;

    canvas.width = w;
    canvas.height = h;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sourceImage, 0, 0, w, h);

    const text = watermarkText.value;
    const mode = watermarkMode.value;
    const opacity = parseFloat(opacityRange.value);
    const fontScale = parseFloat(fontScaleRange.value);
    const angleDeg = parseFloat(angleRange.value);
    const spacing = parseInt(spacingRange.value, 10);
    const fontSize = Math.max(10, Math.round(w * fontScale));

    if (mode === "tiled") {
      drawWatermarkTiled(ctx, w, h, text, opacity, fontSize, angleDeg, spacing);
    } else {
      drawWatermarkCenter(ctx, w, h, text, opacity, fontSize, angleDeg);
    }
  }

  function triggerDownload(mime, quality) {
    if (!sourceImage) {
      return;
    }
    draw();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `watermark-${stamp}.${mime === "image/png" ? "png" : "jpg"}`;

    if (mime === "image/jpeg") {
      canvas.toBlob(
        function (blob) {
          if (!blob) {
            return;
          }
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = name;
          a.click();
          URL.revokeObjectURL(a.href);
        },
        mime,
        quality
      );
    } else {
      canvas.toBlob(function (blob) {
        if (!blob) {
          return;
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      }, mime);
    }
  }

  function updateOutputs() {
    opacityOut.textContent = parseFloat(opacityRange.value).toFixed(2);
    const fs = parseFloat(fontScaleRange.value);
    fontScaleOut.textContent = `${Math.round(fs * 1000) / 10}%`;
    angleOut.textContent = angleRange.value;
    spacingOut.textContent = spacingRange.value;
  }

  function syncSpacingVisibility() {
    const tiled = watermarkMode.value === "tiled";
    spacingField.hidden = !tiled;
    spacingField.style.display = tiled ? "" : "none";
  }

  // Events
  fileInput.addEventListener("change", function () {
    const f = fileInput.files && fileInput.files[0];
    if (f) {
      loadFile(f);
    }
  });

  dropzone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", function () {
    dropzone.classList.remove("dragover");
  });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) {
      loadFile(f);
    }
  });

  ["input", "change"].forEach(function (evt) {
    watermarkText.addEventListener(evt, scheduleDraw);
    watermarkMode.addEventListener(evt, function () {
      syncSpacingVisibility();
      scheduleDraw();
    });
    opacityRange.addEventListener(evt, function () {
      updateOutputs();
      scheduleDraw();
    });
    fontScaleRange.addEventListener(evt, function () {
      updateOutputs();
      scheduleDraw();
    });
    angleRange.addEventListener(evt, function () {
      updateOutputs();
      scheduleDraw();
    });
    spacingRange.addEventListener(evt, function () {
      updateOutputs();
      scheduleDraw();
    });
  });

  downloadPng.addEventListener("click", function () {
    triggerDownload("image/png");
  });
  downloadJpeg.addEventListener("click", function () {
    triggerDownload("image/jpeg", 0.92);
  });

  updateOutputs();
  syncSpacingVisibility();
})();
