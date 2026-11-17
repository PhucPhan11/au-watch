// History charts (browser). Data: GET /api/history?range=… (column arrays, t in epoch ms).
(() => {
  const RANGES = ['24h', '7d', '30d', '1y', '5y'];
  const TZ = 'Asia/Ho_Chi_Minh';
  const params = new URLSearchParams(location.search);
  let range = RANGES.includes(params.get('range')) ? params.get('range') : '24h';
  let gapMode = params.get('gap') === 'pct' ? 'pct' : 'abs';
  const FX_CCYS = ['usd', 'chf', 'jpy'];
  let fxCcy = FX_CCYS.includes(params.get('fx')) ? params.get('fx') : 'usd';
  let fxRange = RANGES.includes(params.get('fxrange')) ? params.get('fxrange') : '24h'; // FX chart's own range
  let fxData = null;
  // Silver block: its own range and gap unit.
  let agRange = RANGES.includes(params.get('agrange')) ? params.get('agrange') : '24h';
  let agGapMode = params.get('aggap') === 'pct' ? 'pct' : 'abs';
  let agData = null;
  let agPlots = [];
  let data = null;
  let charts = [];
  let fxPlot = null;

  const $ = (id) => document.getElementById(id);
  const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
  const short = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  const pct2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  const fmt = (opts) => new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, ...opts });
  const timeFmt = {
    '24h': fmt({ hour: '2-digit', minute: '2-digit' }),
    '7d': fmt({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    '30d': fmt({ day: '2-digit', month: '2-digit' }),
    '1y': fmt({ day: '2-digit', month: '2-digit', year: '2-digit' }),
    // vi-VN renders month+year as "tháng 05, 2022", too wide for axis ticks → "05/2022".
    '5y': (() => {
      const f = fmt({ month: '2-digit', year: 'numeric' });
      return { format: (d) => { const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value])); return `${p.month}/${p.year}`; } };
    })(),
  };
  const fullTime = fmt({ hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

  const sign = (v) => (v > 0 ? '+' : '');
  const legendVnd = (u, v) => (v == null ? '—' : `${vnd.format(Math.round(v))} đ`);
  const legendGapVnd = (u, v) => (v == null ? '—' : `${sign(v)}${vnd.format(Math.round(v))} đ`);
  const legendPct = (u, v) => (v == null ? '—' : `${sign(v)}${pct2.format(v)}%`);
  const axisMillions = (u, splits) => splits.map((v) => `${short.format(v / 1e6)} tr`);
  const axisPct = (u, splits) => splits.map((v) => `${pct1.format(v)}%`);

  // One request per range per page load, shared by the gold and FX charts (the page reloads every 5 min).
  const requests = new Map();
  function getHistory(r) {
    if (!requests.has(r)) {
      const p = fetch(`/api/history?range=${r}`).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
      p.catch(() => requests.delete(r)); // allow a retry on the next click
      requests.set(r, p);
    }
    return requests.get(r);
  }

  function baseOpts(height, r = range) {
    return {
      width: $('history').clientWidth,
      height,
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), TZ),
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: true } },
      series: [{ label: 'Thời gian', value: (u, ts) => (ts == null ? '—' : fullTime.format(ts * 1e3)) }],
      axes: [
        { values: (u, splits) => splits.map((s) => timeFmt[r].format(s * 1e3)) },
        { size: 64 },
      ],
    };
  }

  function priceChart(t) {
    const opts = baseOpts(chartHeight());
    opts.series.push(
      { label: 'SJC mua vào', stroke: '#d4a017', width: 1, dash: [4, 4], value: legendVnd },
      { label: 'SJC bán ra', stroke: '#a66f00', width: 2, value: legendVnd },
      { label: 'Nhẫn PNJ bán ra', stroke: '#1f6feb', width: 2, value: legendVnd },
      { label: 'Thế giới quy đổi', stroke: '#444', width: 2, value: legendVnd },
    );
    opts.bands = [{ series: [2, 1], fill: 'rgba(212, 160, 23, 0.15)' }];
    opts.axes[1].values = axisMillions;
    const d = [t, data.sjc_buy, data.sjc_sell, data.ring_sell, data.world_vnd_luong];
    return new uPlot(opts, d, $('chart-price'));
  }

  function gapChart(t) {
    const opts = baseOpts(chartHeight());
    const isPct = gapMode === 'pct';
    const value = isPct ? legendPct : legendGapVnd;
    opts.series.push(
      { label: 'SJC', stroke: '#a66f00', width: 2, value },
      { label: 'Nhẫn PNJ', stroke: '#1f6feb', width: 2, value },
    );
    opts.axes[1].values = isPct ? axisPct : axisMillions;
    const d = isPct ? [t, data.gap_sjc_pct, data.gap_ring_pct] : [t, data.gap_sjc_abs, data.gap_ring_abs];
    return new uPlot(opts, d, $('chart-gap'));
  }

  // Exchange rate (đồng per 1 unit): transfer buy (dashed) and sell, with the spread as a band.
  function fxChart(t) {
    const opts = baseOpts(chartHeight(), fxRange);
    const digits = fxCcy === 'jpy' ? 2 : 0;
    const nf = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const value = (u, v) => (v == null ? '—' : `${nf.format(v)} đ`);
    opts.series.push(
      { label: 'Mua chuyển khoản', stroke: '#2e8b57', width: 1, dash: [4, 4], value },
      { label: 'Bán ra', stroke: '#1d6b3f', width: 2, value },
    );
    opts.bands = [{ series: [2, 1], fill: 'rgba(46, 139, 87, 0.12)' }];
    opts.axes[1].values = (u, splits) => splits.map((v) => nf.format(v));
    opts.axes[1].size = 72;
    return new uPlot(opts, [t, fxData[`${fxCcy}_buy`], fxData[`${fxCcy}_sell`]], $('chart-fx'));
  }

  function destroyFx() {
    fxPlot?.destroy();
    fxPlot = null;
  }

  function fxMessage(text) {
    $('chart-fx').hidden = text != null;
    $('fx-empty').hidden = text == null;
    if (text != null) $('fx-empty').textContent = text;
  }

  function drawFx() {
    destroyFx();
    if (!fxData?.fx_enough) {
      fxMessage('Chưa đủ dữ liệu tỷ giá cho khoảng thời gian này.');
      return;
    }
    fxMessage(null);
    fxPlot = fxChart(fxData.t.map((ms) => ms / 1e3));
  }

  // --- Silver: Phú Quý buy/sell band + converted world silver; gap vs world ---
  function agPriceChart(t) {
    const opts = baseOpts(chartHeight(), agRange);
    opts.series.push(
      { label: 'Phú Quý mua vào', stroke: '#8a94a6', width: 1, dash: [4, 4], value: legendVnd },
      { label: 'Phú Quý bán ra', stroke: '#4a5568', width: 2, value: legendVnd },
      { label: 'Bạc thế giới quy đổi', stroke: '#111', width: 2, value: legendVnd },
    );
    opts.bands = [{ series: [2, 1], fill: 'rgba(138, 148, 166, 0.18)' }];
    opts.axes[1].values = (u, splits) => splits.map((v) => `${short.format(v / 1e6)} tr`);
    return new uPlot(opts, [t, agData.silver_buy, agData.silver_sell, agData.world_xag_vnd_luong], $('chart-ag-price'));
  }

  function agGapChart(t) {
    const opts = baseOpts(chartHeight(), agRange);
    const isPct = agGapMode === 'pct';
    opts.series.push({ label: 'Bạc miếng Phú Quý', stroke: '#4a5568', width: 2, value: isPct ? legendPct : legendGapVnd });
    opts.axes[1].values = isPct ? axisPct : (u, splits) => splits.map((v) => `${vnd.format(v)}`);
    opts.axes[1].size = 80;
    return new uPlot(opts, [t, isPct ? agData.gap_silver_pct : agData.gap_silver_abs], $('chart-ag-gap'));
  }

  function destroyAg() {
    agPlots.forEach((c) => c.destroy());
    agPlots = [];
  }

  function agMessage(text) {
    $('ag-charts').hidden = text != null;
    $('ag-empty').hidden = text == null;
    if (text != null) $('ag-empty').textContent = text;
  }

  function drawAgGap(t) {
    const hasGap = agData.gap_silver_abs.filter((v) => v != null).length >= 2; // one point draws no line
    $('chart-ag-gap').hidden = !hasGap;
    $('ag-gap-empty').hidden = hasGap;
    if (!hasGap) {
      $('ag-gap-empty').textContent = 'Chưa có dữ liệu giá bạc trong nước cho khoảng thời gian này (giá Phú Quý được ghi từ khi ứng dụng chạy).';
      return null;
    }
    return agGapChart(t);
  }

  function drawAg() {
    destroyAg();
    if (!agData?.silver_enough) {
      agMessage('Chưa đủ dữ liệu giá bạc cho khoảng thời gian này.');
      return;
    }
    agMessage(null);
    const t = agData.t.map((ms) => ms / 1e3);
    agPlots = [agPriceChart(t), drawAgGap(t)].filter(Boolean);
  }

  async function loadAg() {
    syncButtons();
    try {
      agData = await getHistory(agRange);
      drawAg();
    } catch {
      destroyAg();
      agMessage('Không tải được dữ liệu giá bạc.');
    }
  }

  async function loadFx() {
    syncButtons();
    try {
      fxData = await getHistory(fxRange);
      drawFx();
    } catch {
      destroyFx();
      fxMessage('Không tải được dữ liệu tỷ giá.');
    }
  }

  const chartHeight = () => (window.innerWidth < 480 ? 220 : 280);

  function destroy() {
    charts.forEach((c) => c.destroy());
    charts = [];
  }

  function draw() {
    destroy();
    $('partial').hidden = true;
    if (!data.enough) {
      $('charts').hidden = true;
      $('empty').hidden = false;
      $('empty').textContent = data.first_recorded == null
        ? 'Chưa có dữ liệu lịch sử nào được ghi. Biểu đồ sẽ xuất hiện sau vài lần cập nhật.'
        : `Chưa đủ dữ liệu cho khoảng thời gian này — đã ghi từ ${fullTime.format(data.first_recorded)}.`;
      return;
    }
    $('empty').hidden = true;
    $('charts').hidden = false;
    if (data.first_recorded > data.from) {
      $('partial').hidden = false;
      $('partial').textContent = `Dữ liệu bắt đầu từ ${fullTime.format(data.first_recorded)}.`;
    }
    const t = data.t.map((ms) => ms / 1e3);
    charts = [priceChart(t), gapChart(t)];
  }

  function syncButtons() {
    document.querySelectorAll('#range button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
    document.querySelectorAll('#gap-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === gapMode)));
    document.querySelectorAll('#fx-ccy button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ccy === fxCcy)));
    document.querySelectorAll('#fx-range button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === fxRange)));
    document.querySelectorAll('#ag-range button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === agRange)));
    document.querySelectorAll('#ag-gap-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === agGapMode)));
  }

  function syncUrl() {
    const p = new URLSearchParams(location.search);
    p.set('range', range);
    if (gapMode === 'pct') p.set('gap', 'pct'); else p.delete('gap');
    if (fxCcy !== 'usd') p.set('fx', fxCcy); else p.delete('fx');
    if (fxRange !== '24h') p.set('fxrange', fxRange); else p.delete('fxrange');
    if (agRange !== '24h') p.set('agrange', agRange); else p.delete('agrange');
    if (agGapMode === 'pct') p.set('aggap', 'pct'); else p.delete('aggap');
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }

  async function load() {
    syncButtons();
    try {
      data = await getHistory(range);
      draw();
    } catch (err) {
      destroy();
      $('charts').hidden = true;
      $('empty').hidden = false;
      $('empty').textContent = 'Không tải được dữ liệu lịch sử.';
    }
  }

  $('range').addEventListener('click', (e) => {
    const r = e.target.closest('button')?.dataset.range;
    if (!r || r === range) return;
    range = r;
    syncUrl();
    load();
  });

  $('gap-mode').addEventListener('click', (e) => {
    const m = e.target.closest('button')?.dataset.mode;
    if (!m || m === gapMode) return;
    gapMode = m;
    syncUrl();
    syncButtons();
    if (data?.enough) {
      charts[1].destroy();
      charts[1] = gapChart(data.t.map((ms) => ms / 1e3));
    }
  });

  $('fx-ccy').addEventListener('click', (e) => {
    const c = e.target.closest('button')?.dataset.ccy;
    if (!c || c === fxCcy) return;
    fxCcy = c;
    syncUrl();
    syncButtons();
    if (fxData) drawFx();
  });

  $('ag-range').addEventListener('click', (e) => {
    const r = e.target.closest('button')?.dataset.range;
    if (!r || r === agRange) return;
    agRange = r;
    syncUrl();
    loadAg();
  });

  $('ag-gap-mode').addEventListener('click', (e) => {
    const m = e.target.closest('button')?.dataset.mode;
    if (!m || m === agGapMode) return;
    agGapMode = m;
    syncUrl();
    syncButtons();
    if (agData?.silver_enough) drawAg();
  });

  $('fx-range').addEventListener('click', (e) => {
    const r = e.target.closest('button')?.dataset.range;
    if (!r || r === fxRange) return;
    fxRange = r;
    syncUrl();
    loadFx();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const size = { width: $('history').clientWidth, height: chartHeight() };
      charts.forEach((c) => c.setSize(size));
      fxPlot?.setSize(size);
      agPlots.forEach((c) => c.setSize(size));
    }, 150);
  });

  load();
  loadFx();
  loadAg();
})();
