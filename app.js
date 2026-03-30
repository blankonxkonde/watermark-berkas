(function () {
  "use strict";

  const MAX_SIDE = 4096;
  const DEBOUNCE_MS = 80;
  const PDFJS_WORKER =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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
  const downloadBtn = document.getElementById("downloadBtn");
  const downloadHint = document.getElementById("downloadHint");
  const canvas = document.getElementById("preview");
  const previewPlaceholder = document.getElementById("previewPlaceholder");

  /** @type {HTMLImageElement | null} */
  let sourceImage = null;
  let objectUrl = null;
  /** @type {string} */
  let fileKind = "";
  /** @type {string} */
  let sourceMime = "";
  /** @type {any} */
  let pdfDocument = null;
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

  function isPdfFile(file) {
    return (
      file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")
    );
  }

  function clearImageSource() {
    sourceImage = null;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function clearPdfSource() {
    pdfDocument = null;
  }

  function loadImageFile(file) {
    clearPdfSource();
    clearImageSource();
    objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      sourceImage = img;
      fileKind = "image";
      sourceMime = file.type || "image/png";
      fileNameEl.textContent = file.name;
      fileNameEl.hidden = false;
      previewPlaceholder.hidden = true;
      downloadBtn.disabled = false;
      updateDownloadUi();
      scheduleDraw();
    };
    img.onerror = function () {
      clearImageSource();
      fileKind = "";
      fileNameEl.textContent = "Gagal memuat gambar.";
      fileNameEl.hidden = false;
      downloadBtn.disabled = true;
      updateDownloadUi();
    };
    img.src = objectUrl;
  }

  function loadPdfFile(file) {
    clearImageSource();
    clearPdfSource();
    fileKind = "";
    sourceMime = "";

    if (typeof pdfjsLib === "undefined") {
      fileNameEl.textContent =
        "Pustaka PDF.js tidak dimuat — periksa koneksi atau izin skrip CDN.";
      fileNameEl.hidden = false;
      downloadBtn.disabled = true;
      updateDownloadUi();
      return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

    const run = file.arrayBuffer().then(function (buf) {
      return pdfjsLib.getDocument({ data: buf }).promise;
    });

    run.then(
      function (doc) {
        pdfDocument = doc;
        fileKind = "pdf";
        sourceMime = "application/pdf";
        fileNameEl.textContent =
          file.name + " (" + doc.numPages + " halaman)";
        fileNameEl.hidden = false;
        previewPlaceholder.hidden = true;
        downloadBtn.disabled = false;
        updateDownloadUi();
        scheduleDraw();
      },
      function () {
        fileNameEl.textContent = "Gagal membaca PDF.";
        fileNameEl.hidden = false;
        downloadBtn.disabled = true;
        updateDownloadUi();
      }
    );
  }

  function loadFile(file) {
    if (!file) {
      return;
    }
    if (isPdfFile(file)) {
      loadPdfFile(file);
    } else if (isAcceptedImage(file)) {
      loadImageFile(file);
    } else {
      fileNameEl.textContent =
        "Format tidak didukung. Gunakan gambar (JPEG/PNG/WebP/GIF) atau PDF.";
      fileNameEl.hidden = false;
      downloadBtn.disabled = true;
    }
  }

  function scheduleDraw() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      drawAsync().catch(function (err) {
        console.error(err);
      });
    }, DEBOUNCE_MS);
  }

  /**
   * @param {number} pageNum
   */
  function renderPdfPageToCanvas(pageNum) {
    if (!pdfDocument) {
      return Promise.reject(new Error("No PDF"));
    }
    return pdfDocument.getPage(pageNum).then(function (page) {
      const base = page.getViewport({ scale: 1 });
      const fitScale = Math.min(
        MAX_SIDE / base.width,
        MAX_SIDE / base.height,
        1
      );
      const viewport = page.getViewport({ scale: fitScale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const task = page.render({
        canvasContext: ctx,
        viewport: viewport,
      });
      return task.promise;
    });
  }

  function applyWatermarkParams() {
    const w = canvas.width;
    const h = canvas.height;
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

  function drawImageWithWatermark() {
    if (!sourceImage || !sourceImage.complete) {
      return;
    }
    const sw = sourceImage.naturalWidth;
    const sh = sourceImage.naturalHeight;
    const dim = scaleDimensions(sw, sh);
    canvas.width = dim.width;
    canvas.height = dim.height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sourceImage, 0, 0, dim.width, dim.height);
    applyWatermarkParams();
  }

  function drawAsync() {
    if (fileKind === "pdf" && pdfDocument) {
      return renderPdfPageToCanvas(1).then(function () {
        applyWatermarkParams();
      });
    }
    if (fileKind === "image" && sourceImage && sourceImage.complete) {
      drawImageWithWatermark();
      return Promise.resolve();
    }
    return Promise.resolve();
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
    const lines = text
      .split(/\r?\n/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
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

  function saveBlob(blob, stamp, ext) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "watermark-" + stamp + "." + ext;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadImageMatchingMime() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const mime = sourceMime || "image/png";

    function done(blob, ext) {
      if (!blob) {
        return;
      }
      saveBlob(blob, stamp, ext);
    }

    if (mime === "image/jpeg") {
      canvas.toBlob(
        function (b) {
          done(b, "jpg");
        },
        "image/jpeg",
        0.92
      );
    } else if (mime === "image/png") {
      canvas.toBlob(function (b) {
        done(b, "png");
      }, "image/png");
    } else if (mime === "image/webp") {
      canvas.toBlob(
        function (b) {
          if (b) {
            done(b, "webp");
          } else {
            canvas.toBlob(function (b2) {
              done(b2, "png");
            }, "image/png");
          }
        },
        "image/webp",
        0.92
      );
    } else {
      canvas.toBlob(function (b) {
        done(b, "png");
      }, "image/png");
    }
  }

  function downloadPdfAllPages() {
    if (!pdfDocument) {
      return;
    }
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      window.alert("jsPDF tidak dimuat — periksa koneksi atau izin skrip CDN.");
      return;
    }

    const jsPDF = window.jspdf.jsPDF;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const prevLabel = downloadBtn.textContent;
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Memproses…";

    const chain = (function loop(i, doc) {
      if (i > pdfDocument.numPages) {
        if (doc) {
          doc.save("watermark-" + stamp + ".pdf");
        }
        return Promise.resolve();
      }
      return renderPdfPageToCanvas(i).then(function () {
        applyWatermarkParams();
        const w = canvas.width;
        const h = canvas.height;
        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        let nextDoc = doc;
        if (!nextDoc) {
          nextDoc = new jsPDF({
            unit: "px",
            format: [w, h],
            orientation: w > h ? "l" : "p",
            compress: true,
          });
        } else {
          nextDoc.addPage([w, h], w > h ? "l" : "p");
        }
        nextDoc.addImage(imgData, "JPEG", 0, 0, w, h, undefined, "FAST");
        return loop(i + 1, nextDoc);
      });
    })(1, null);

    chain.then(
      function () {
        downloadBtn.disabled = false;
        downloadBtn.textContent = prevLabel;
      },
      function (err) {
        console.error(err);
        downloadBtn.disabled = false;
        downloadBtn.textContent = prevLabel;
        window.alert("Gagal membuat PDF.");
      }
    );
  }

  function triggerDownload() {
    if (fileKind === "pdf" && pdfDocument) {
      downloadPdfAllPages();
      return;
    }
    if (fileKind === "image" && sourceImage) {
      drawImageWithWatermark();
      downloadImageMatchingMime();
    }
  }

  function updateDownloadUi() {
    if (fileKind === "pdf") {
      downloadBtn.textContent = "Unduh PDF";
      downloadHint.hidden = false;
      downloadHint.textContent =
        "Keluaran berformat PDF (semua halaman). Isi halaman menjadi gambar, bukan teks yang bisa disalin.";
    } else if (fileKind === "image") {
      downloadHint.hidden = true;
      const mime = sourceMime || "";
      if (mime === "image/jpeg") {
        downloadBtn.textContent = "Unduh JPEG";
      } else if (mime === "image/png") {
        downloadBtn.textContent = "Unduh PNG";
      } else if (mime === "image/webp") {
        downloadBtn.textContent = "Unduh WebP";
      } else {
        downloadBtn.textContent = "Unduh PNG";
      }
    } else {
      downloadBtn.textContent = "Unduh hasil";
      downloadHint.hidden = true;
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

  downloadBtn.addEventListener("click", function () {
    triggerDownload();
  });

  updateOutputs();
  syncSpacingVisibility();
})();
