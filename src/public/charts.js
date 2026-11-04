// History charts (browser). Data: GET /api/history?range=… (column arrays, t in epoch ms).
(() => {
  const RANGES = ['24h', '7d', '30d', '1y'];
  const TZ = 'Asia/Ho_Chi_Minh';
  const params = new URLSearchParams(location.search);
  let range = RANGES.includes(params.get('range')) ? params.get('range') : '24h';
  let gapMode = params.get('gap') === 'pct' ? 'pct' : 'abs';
  let data = null;
  let charts = [];

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
  };
  const fullTime = fmt({ hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

  const sign = (v) => (v > 0 ? '+' : '');
  const legendVnd = (u, v) => (v == null ? '—' : `${vnd.format(Math.round(v))} đ`);
  const legendGapVnd = (u, v) => (v == null ? '—' : `${sign(v)}${vnd.format(Math.round(v))} đ`);
  const legendPct = (u, v) => (v == null ? '—' : `${sign(v)}${pct2.format(v)}%`);
  const axisMillions = (u, splits) => splits.map((v) => `${short.format(v / 1e6)} tr`);
  const axisPct = (u, splits) => splits.map((v) => `${pct1.format(v)}%`);

  function baseOpts(height) {
    return {
      width: $('history').clientWidth,
      height,
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), TZ),
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: true } },
      series: [{ label: 'Thời gian', value: (u, ts) => (ts == null ? '—' : fullTime.format(ts * 1e3)) }],
      axes: [
        { values: (u, splits) => splits.map((s) => timeFmt[range].format(s * 1e3)) },
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
  }

  function syncUrl() {
    const p = new URLSearchParams(location.search);
    p.set('range', range);
    if (gapMode === 'pct') p.set('gap', 'pct'); else p.delete('gap');
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }

  async function load() {
    syncButtons();
    try {
      const res = await fetch(`/api/history?range=${range}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
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

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const size = { width: $('history').clientWidth, height: chartHeight() };
      charts.forEach((c) => c.setSize(size));
    }, 150);
  });

  load();
})();
