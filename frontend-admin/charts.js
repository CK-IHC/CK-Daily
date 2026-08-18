/**
 * charts.js — ตัวช่วยเรียก Chart.js (โหลดจาก CDN ใน admin.html)
 * มาตรฐานกลาง: สูงคงที่ (กัน canvas โตไม่หยุดตอนสลับหน้า/resize), data label แสดงค่าบนกราฟทุกแท่ง/จุดเสมอ
 */
var Charts = (function () {
  var instances = {};
  var PALETTE = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];
  var pluginRegistered = false;
  var bgPluginRegistered = false;
  var GRID_COLOR_ = '#eef0f3';
  var PLOT_BG_ = '#fafafb';

  function fmtVal_(v) {
    if (v === null || v === undefined || v === '') return '';
    var n = Number(v);
    return isNaN(n) ? String(v) : n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }

  /** วาดค่าไว้เหนือแท่ง/จุดของทุกกราฟ (bar แนวตั้ง, bar แนวนอน, line) — ไม่พึ่ง plugin ภายนอกเพิ่มเติมจาก CDN */
  function registerDataLabelPlugin_() {
    if (pluginRegistered || !window.Chart) return;
    Chart.register({
      id: 'ckDataLabels',
      afterDatasetsDraw: function (chart) {
        if (chart.config.type === 'doughnut' || chart.config.type === 'pie') return;
        var ctx = chart.ctx;
        var horizontal = chart.options && chart.options.indexAxis === 'y';
        ctx.save();
        ctx.font = 'bold 11px "Sarabun", sans-serif';
        ctx.fillStyle = '#1f2937';
        chart.data.datasets.forEach(function (dataset, di) {
          var meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach(function (el, i) {
            var raw = dataset.data[i];
            var label = fmtVal_(raw);
            if (!label) return;
            var pos = el.tooltipPosition ? el.tooltipPosition() : el.getCenterPoint();
            if (horizontal) {
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, pos.x + 6, pos.y);
            } else {
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(label, pos.x, pos.y - 6);
            }
          });
        });
        ctx.restore();
      }
    });
    pluginRegistered = true;
  }

  /** วาดพื้นหลังโซนกราฟ (chartArea) เป็นสี่เหลี่ยมมุมโค้งสีอ่อน ให้ทุกกราฟมีกรอบพื้นหลังสม่ำเสมอกัน */
  function registerBgPlugin_() {
    if (bgPluginRegistered || !window.Chart) return;
    Chart.register({
      id: 'ckPlotBg',
      beforeDraw: function (chart) {
        if (chart.config.type === 'doughnut' || chart.config.type === 'pie') return;
        var area = chart.chartArea;
        if (!area) return;
        var ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = PLOT_BG_;
        var r = 8;
        var x = area.left, y = area.top, w = area.right - area.left, h = area.bottom - area.top;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    });
    bgPluginRegistered = true;
  }

  function destroy(canvasId) { if (instances[canvasId]) { instances[canvasId].destroy(); delete instances[canvasId]; } }

  /** กันปัญหา canvas สูงขึ้นเรื่อยๆ ไม่หยุดตอนสลับแท็บ/resize — ต้องมี wrapper สูงคงที่เสมอเมื่อใช้ maintainAspectRatio:false */
  function lockHeight_(canvas) {
    var parent = canvas.parentElement;
    if (!parent) return;
    var h = parseInt(canvas.getAttribute('height'), 10) || 260;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.style.height = h + 'px';
    parent.style.width = '100%';
    parent.style.overflow = 'hidden'; // กันกราฟ (หรือ label ของกราฟ) ล้นออกนอกกรอบการ์ดในทุกกรณี
  }

  // ระยะขอบรอบโซนกราฟเท่ากันทั้ง 4 ด้าน ให้พื้นหลัง/แกนดูสมมาตร ไม่เอียงไปด้านใดด้านหนึ่ง
  var PLOT_PADDING_ = { top: 22, right: 18, bottom: 10, left: 10 };

  function baseOptions_(extra) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: PLOT_PADDING_ },
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: { label: function (c) { return (c.dataset.label ? c.dataset.label + ': ' : '') + fmtVal_(c.parsed.y !== undefined ? c.parsed.y : c.parsed.x); } }
        }
      }
    }, extra);
  }

  function line(canvasId, labels, datasets) {
    destroy(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;
    registerDataLabelPlugin_();
    registerBgPlugin_();
    lockHeight_(ctx);
    var opts = baseOptions_({
      scales: {
        y: { beginAtZero: true, grid: { color: GRID_COLOR_, drawTicks: false }, border: { display: false }, ticks: { callback: function (v) { return fmtVal_(v); } } },
        x: { grid: { color: GRID_COLOR_, drawTicks: false }, border: { display: false } }
      }
    });
    opts.plugins.legend.display = datasets.length > 1;
    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets.map(function (d, i) { return Object.assign({ borderColor: PALETTE[i % PALETTE.length], backgroundColor: PALETTE[i % PALETTE.length] + '22', borderWidth: 2, pointRadius: 3, pointBackgroundColor: PALETTE[i % PALETTE.length], tension: .3, fill: true }, d); }) },
      options: opts
    });
  }

  function bar(canvasId, labels, datasets, horizontal) {
    destroy(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;
    registerDataLabelPlugin_();
    registerBgPlugin_();
    lockHeight_(ctx);
    var opts = baseOptions_({
      indexAxis: horizontal ? 'y' : 'x',
      layout: { padding: Object.assign({}, PLOT_PADDING_, horizontal ? { right: 44 } : {}) },
      scales: {
        x: horizontal
          ? { beginAtZero: true, grid: { color: GRID_COLOR_, drawTicks: false }, border: { display: false }, ticks: { callback: function (v) { return fmtVal_(v); } } }
          : { grid: { color: GRID_COLOR_, drawTicks: false }, border: { display: false } },
        y: horizontal
          ? { grid: { color: GRID_COLOR_, drawTicks: false }, border: { display: false } }
          : { beginAtZero: true, grid: { color: GRID_COLOR_, drawTicks: false }, border: { display: false }, ticks: { callback: function (v) { return fmtVal_(v); } } }
      }
    });
    opts.plugins.legend.display = datasets.length > 1;
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels, datasets: datasets.map(function (d, i) { return Object.assign({ backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 4, maxBarThickness: 48 }, d); }) },
      options: opts
    });
  }

  function doughnut(canvasId, labels, data) {
    destroy(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;
    lockHeight_(ctx);
    instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: data, backgroundColor: PALETTE }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
  }

  return { line: line, bar: bar, doughnut: doughnut, destroy: destroy };
})();
