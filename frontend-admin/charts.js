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
  // กราฟเส้นที่มีจุดเยอะเกินไป (เช่น "รายวัน 30 วันล่าสุด") แปะป้ายตัวเลขไว้ทุกจุดแล้วอ่านไม่ออกเพราะทับกันเอง
  // เกินจำนวนนี้ไม่แปะป้ายถาวรอีกต่อไป — ดูค่าที่แน่นอนได้จาก tooltip ตอนเอาเมาส์ไปชี้แทน
  var DENSE_LINE_LIMIT_ = 14;

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
        ctx.font = 'bold 12px "Sarabun", sans-serif';
        ctx.fillStyle = '#1f2937';
        chart.data.datasets.forEach(function (dataset, di) {
          var meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          if (chart.config.type === 'line' && meta.data.length > DENSE_LINE_LIMIT_) return;
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
              // จุด/แท่งที่อยู่ใกล้ขอบซ้าย-ขวาของกราฟ (เช่น จุดแรก/จุดสุดท้าย) ป้ายที่ centered ตามปกติจะยื่น
              // ไปทับแกน Y (ตัวเลขสเกลด้านซ้าย) หรือล้นออกนอกกรอบด้านขวา — ขยับการจัดวางให้ชิดขอบที่ใกล้แทน
              var edge = 28;
              if (pos.x - chart.chartArea.left < edge) ctx.textAlign = 'left';
              else if (chart.chartArea.right - pos.x < edge) ctx.textAlign = 'right';
              else ctx.textAlign = 'center';
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

  /**
   * กันปัญหา canvas สูงขึ้นเรื่อยๆ ไม่หยุดตอนสลับแท็บ/resize — ต้องมี wrapper สูงคงที่เสมอเมื่อใช้ maintainAspectRatio:false
   * ไม่ต้องกำหนด height เป็นตัวเลข px ในไฟล์หน้าแต่ละหน้าอีกต่อไป (เดิมเป็นสาเหตุที่ขนาดกราฟกับกรอบการ์ด
   * ไม่สัมพันธ์กัน เพราะแต่ละหน้าเดาเลขคนละค่า) — เติม class "chart-wrap" ให้ wrapper อัตโนมัติเสมอ แล้วปล่อยให้
   * admin.css (clamp ตามความกว้างจอ) เป็นคนคุมความสูงแทนเป็นค่ามาตรฐานเดียวกันทั้งระบบ
   * explicitHeight (optional): บังคับความสูงเองแทน class ด้านบน — ใช้เฉพาะกราฟแท่งแนวนอนที่จำนวนแท่งไม่คงที่
   * (เช่น Top 10 สินค้า) ต้องขยายความสูงตามจำนวนแท่งจริง กันแท่ง/ป้ายตัวเลขบีบจนทับกัน
   */
  function lockHeight_(canvas, explicitHeight) {
    var parent = canvas.parentElement;
    if (!parent) return;
    parent.classList.add('chart-wrap');
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.style.width = '100%';
    parent.style.overflow = 'hidden'; // กันกราฟ (หรือ label ของกราฟ) ล้นออกนอกกรอบการ์ดในทุกกรณี
    if (explicitHeight) parent.style.height = explicitHeight + 'px';
    else parent.style.removeProperty('height'); // ปล่อยให้ .chart-wrap (CSS) คุมความสูงแทน
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

  function lineDatasets_(datasets) {
    return datasets.map(function (d, i) { return Object.assign({ borderColor: PALETTE[i % PALETTE.length], backgroundColor: PALETTE[i % PALETTE.length] + '22', borderWidth: 2, pointRadius: 3, pointBackgroundColor: PALETTE[i % PALETTE.length], tension: .3, fill: true }, d); });
  }

  /**
   * รีเฟรชอัตโนมัติทุก 30 วินาที (Dashboard/Live Dashboard) เรียกฟังก์ชันนี้ซ้ำด้วย canvasId เดิมตลอด —
   * ถ้ากราฟประเภทเดิมมีอยู่แล้ว อัปเดตข้อมูลแล้วเรียก .update() แทนการ destroy+สร้างใหม่ทุกครั้ง
   * (ทำลาย instance เดิม, parse ตัวเลือกใหม่ทั้งหมด, รีเซ็ต animation) เร็วขึ้นและไม่กระพริบ
   */
  function line(canvasId, labels, datasets) {
    var ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;
    lockHeight_(ctx);
    // existing.canvas !== ctx เกิดตอนออกจากหน้านี้แล้วกลับมาใหม่ (DOM ถูกรื้อสร้างใหม่ id ซ้ำเดิม) ต้อง
    // สร้าง Chart ใหม่ผูกกับ canvas element ปัจจุบันเท่านั้น .update() กับของเก่าที่หลุดจาก DOM ไปแล้วไม่ได้
    var existing = instances[canvasId];
    if (existing && existing.config.type === 'line' && existing.canvas === ctx) {
      existing.data.labels = labels;
      existing.data.datasets = lineDatasets_(datasets);
      existing.options.plugins.legend.display = datasets.length > 1;
      existing.update();
      return;
    }
    destroy(canvasId);
    registerDataLabelPlugin_();
    registerBgPlugin_();
    var opts = baseOptions_({
      scales: {
        y: { beginAtZero: true, grid: { color: GRID_COLOR_, drawTicks: false }, border: { display: false }, ticks: { callback: function (v) { return fmtVal_(v); } } },
        x: { grid: { color: GRID_COLOR_, drawTicks: false }, border: { display: false } }
      }
    });
    opts.plugins.legend.display = datasets.length > 1;
    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: lineDatasets_(datasets) },
      options: opts
    });
  }

  function barDatasets_(datasets) {
    return datasets.map(function (d, i) { return Object.assign({ backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 4, maxBarThickness: 48 }, d); });
  }

  function bar(canvasId, labels, datasets, horizontal) {
    var ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;
    // แนวนอน (เช่น Top 10 สินค้า) ยิ่งมีแท่งเยอะยิ่งต้องการความสูงมากขึ้นตามสัดส่วน — กันป้ายตัวเลข/ชื่อแท่งทับกัน
    // แนวตั้ง (รายเดือน/รายปี) จำนวนแท่งค่อนข้างคงที่อยู่แล้ว ใช้ความสูงมาตรฐานจาก .chart-wrap (CSS) แทน
    // เรียกทุกครั้งแม้ตอน update (ไม่ใช่แค่สร้างใหม่) เพราะจำนวนแท่งเปลี่ยนได้ระหว่างรีเฟรช
    lockHeight_(ctx, horizontal ? Math.max(200, labels.length * 44 + 48) : null);
    // existing.canvas !== ctx เกิดตอนออกจากหน้านี้แล้วกลับมาใหม่ (DOM ถูกรื้อสร้างใหม่ id ซ้ำเดิม) ต้องสร้าง
    // Chart ใหม่ผูกกับ canvas element ปัจจุบันเท่านั้น — indexAxis (แนวตั้ง/แนวนอน) เปลี่ยนโครงสร้างสเกล
    // ทั้งหมดก็ต้องสร้างใหม่เช่นกัน อัปเดตแบบ in-place ได้เฉพาะตอน canvas เดิม + แนวเดิมเท่านั้น
    var existing = instances[canvasId];
    if (existing && existing.config.type === 'bar' && existing.canvas === ctx && existing.options.indexAxis === (horizontal ? 'y' : 'x')) {
      existing.data.labels = labels;
      existing.data.datasets = barDatasets_(datasets);
      existing.options.plugins.legend.display = datasets.length > 1;
      existing.update();
      return;
    }
    destroy(canvasId);
    registerDataLabelPlugin_();
    registerBgPlugin_();
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
      data: { labels: labels, datasets: barDatasets_(datasets) },
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
