'use strict';

const STOCK_META = [
  { name: '恒邦股份', code: '002237', position: '3000 股', term: '长期', sector: '贵金属', tag: '重仓', color: '#b7791f' },
  { name: '沃格光电', code: '603773', position: '200 股', term: '长期', sector: '光电显示', tag: '持仓', color: '#2467a8' },
  { name: '福瑞医科', code: '301272', position: '100 股', term: '长期', sector: '医疗健康', tag: '持仓', color: '#17855c' },
  { name: '京东方', code: '000725', position: '100 股', term: '短期', sector: '面板', tag: '短线', color: '#c2342e' },
];

const SERIES_COLORS = ['#c2342e', '#b7791f', '#2467a8', '#17855c'];
const LS_REPORTS = 'a-share-daily-platform-reports-v1';
const LS_REVIEWS = 'a-share-daily-platform-reviews-v1';
const LS_NOTES = 'a-share-daily-platform-notes-v1';

const state = {
  reports: [],
  reviews: [],
  notes: {},
  source: 'local',
  currentDate: null,
  currentView: 'overview',
  draftScore: 3,
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  state.reviews = loadReviews();
  state.notes = loadNotes();
  document.getElementById('importDate').value = todayStr();
  updateImportFilename();
  bindEvents();
  refreshData(true);
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });

  document.getElementById('refreshBtn').addEventListener('click', () => refreshData(true));
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('addBtn').addEventListener('click', () => switchView('import'));

  document.getElementById('dateSelect').addEventListener('change', (event) => {
    state.currentDate = event.target.value;
    renderAll();
  });
  document.getElementById('prevDay').addEventListener('click', () => stepDate(1));
  document.getElementById('nextDay').addEventListener('click', () => stepDate(-1));
  document.getElementById('todayBtn').addEventListener('click', goToLatest);

  document.getElementById('saveNoteBtn').addEventListener('click', saveQuickNote);

  document.getElementById('historySearch').addEventListener('input', renderHistory);
  document.getElementById('historyList').addEventListener('click', handleHistoryClick);

  document.getElementById('fileInput').addEventListener('change', handleFileInput);
  document.getElementById('importDate').addEventListener('change', updateImportFilename);
  document.getElementById('previewBtn').addEventListener('click', renderParsePreview);
  document.getElementById('saveReportBtn').addEventListener('click', saveReport);

  document.getElementById('addReviewBtn').addEventListener('click', addReview);
  document.getElementById('reviewList').addEventListener('click', handleReviewListClick);
}

async function refreshData(showToast) {
  setSource('连接中');
  const forceStatic = new URLSearchParams(window.location.search).get('source') === 'static';
  if (!forceStatic) {
    try {
      const { res, data } = await fetchJSON('api/reports', { cache: 'no-store' });
      if (!res.ok || !data.ok) {
        throw new Error('api unavailable');
      }
      state.reports = data.reports.map((item) => ({
        ...item,
        parsed: parseReport(item.content, item.date),
      }));
      state.source = 'folder';
      if (showToast) {
        toast('已从 reports/ 文件夹读取日报');
      }
      renderAll();
      return;
    } catch (error) {
      // Fall through to static data when the local server is unavailable.
    }
  }

  try {
    const { res, data } = await fetchJSON('data/reports.json', { cache: 'no-store' });
    if (!res.ok || !data.ok || !Array.isArray(data.reports)) {
      throw new Error('static data unavailable');
    }
    state.reports = data.reports.map((item) => ({
      ...item,
      parsed: parseReport(item.content, item.date),
    }));
    state.source = 'static';
    if (showToast) {
      toast('已从静态部署数据读取日报');
    }
  } catch (error) {
    state.source = 'local';
    state.reports = loadLocalReports();
    if (showToast) {
      toast('本地服务未连接，已切换到浏览器本地模式');
    }
  }
  renderAll();
}

async function fetchJSON(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    const data = await res.json();
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

function renderAll() {
  renderSource();
  renderDateOptions();
  renderTopbarTitle();
  renderOverview();
  renderHistory();
  renderReview();
}

function renderSource() {
  const dot = document.getElementById('sourceDot');
  const label = document.getElementById('sourceLabel');
  if (state.source === 'folder') {
    dot.className = 'source-dot online';
    label.textContent = '本地 reports/ 文件夹';
  } else if (state.source === 'static') {
    dot.className = 'source-dot static';
    label.textContent = '静态部署 reports.json';
  } else {
    dot.className = 'source-dot local';
    label.textContent = '浏览器本地存储';
  }
}

function renderDateOptions() {
  const dates = sortedDates();
  const select = document.getElementById('dateSelect');
  select.innerHTML = '';
  if (!dates.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '暂无日报';
    select.appendChild(option);
    state.currentDate = null;
    return;
  }
  if (!state.currentDate || !dates.includes(state.currentDate)) {
    state.currentDate = dates[0];
  }
  dates.forEach((date) => {
    const option = document.createElement('option');
    option.value = date;
    option.textContent = date;
    select.appendChild(option);
  });
  select.value = state.currentDate;
}

function renderTopbarTitle() {
  const titles = {
    overview: '日报总览',
    history: '历史日报',
    import: '导入日报',
    review: '复盘与趋势',
  };
  const report = getCurrentReport();
  document.getElementById('viewTitle').textContent = titles[state.currentView] || '日报总览';
  document.getElementById('viewSubtitle').textContent = report
    ? `${report.date} · ${report.title}`
    : '暂无日报，请先导入或添加';
}

function renderOverview() {
  const report = getCurrentReport();
  const content = document.getElementById('overviewContent');
  const empty = document.getElementById('emptyOverview');
  const dateLabel = document.getElementById('overviewDateLabel');

  if (!report) {
    content.classList.add('hidden');
    empty.classList.remove('hidden');
    dateLabel.textContent = '';
    return;
  }

  content.classList.remove('hidden');
  empty.classList.add('hidden');
  dateLabel.textContent = `${report.date} ${weekday(report.date)}`;

  const parsed = report.parsed || parseReport(report.content, report.date);
  const market = parsed.market || {};
  const sh = market.shIndex;
  const holdings = (parsed.holdings || []).filter(Boolean);
  const upCount = holdings.filter((item) => parsePct(item.change) > 0).length;
  const alerts = parsed.alerts || [];

  const kpis = [
    {
      label: '上证指数',
      value: sh && sh.value != null ? formatNumber(sh.value) : '—',
      delta: sh && sh.change ? sh.change : '暂无数据',
      tone: sh && sh.change ? toneClass(sh.change) : '',
    },
    {
      label: '北向资金',
      value: market.northbound && market.northbound.amount ? `${market.northbound.amount}亿` : '—',
      delta: market.northbound ? market.northbound.direction : '暂无数据',
    },
    {
      label: '持仓状态',
      value: `${upCount}涨/${holdings.length - upCount}跌`,
      delta: `${holdings.length} 只个股`,
    },
    {
      label: '异常波动',
      value: `${alerts.length} 项`,
      delta: alerts.length ? '需要留意' : '无',
      tone: alerts.length ? 'up' : '',
    },
  ];

  document.getElementById('kpiGrid').innerHTML = kpis
    .map(
      (item) => `
        <div class="kpi-card">
          <span class="kpi-label">${esc(item.label)}</span>
          <strong class="kpi-value ${item.tone || ''}">${esc(item.value)}</strong>
          <span class="kpi-delta">${esc(item.delta)}</span>
        </div>`
    )
    .join('');

  const indexCards = [
    { name: '上证指数', item: market.shIndex },
    { name: '深证成指', item: market.szIndex },
    { name: '创业板指', item: market.cybIndex },
  ].map(({ name, item }) => {
    if (!item) {
      return marketCell(name, '暂无', '暂无数据');
    }
    const sub = [item.change, item.turnover ? `成交 ${item.turnover}亿` : ''].filter(Boolean).join(' · ');
    return marketCell(name, item.value != null ? formatNumber(item.value) : '暂无', sub || '暂无数据');
  });

  const north = market.northbound;
  indexCards.push(
    marketCell(
      '北向资金',
      north && north.amount ? `${north.amount}亿` : '暂无',
      north ? north.direction : '暂无数据'
    )
  );
  document.getElementById('marketGrid').innerHTML = indexCards.join('');
  document.getElementById('marketTone').textContent = market.tone || '暂无市场主线描述';

  const sectorMap = new Map((parsed.sectors || []).map((item) => [item.name, item]));
  document.getElementById('holdingGrid').innerHTML = STOCK_META.map((meta) =>
    renderHoldingCard(meta, getHolding(report, meta.name), sectorMap)
  ).join('');

  renderSectors(parsed.sectors || []);
  renderTomorrow(parsed.tomorrow || []);
  document.getElementById('rotationSignal').textContent = parsed.signal || '暂无明确轮动信号';
  document.getElementById('quickNote').value = state.notes[report.date] || '';
  document.getElementById('reviewDateLabel').textContent = report.date;
}

function marketCell(name, value, sub) {
  return `
    <div class="market-cell">
      <span class="market-name">${esc(name)}</span>
      <strong>${esc(value)}</strong>
      <div class="market-sub"><span>${esc(sub)}</span></div>
    </div>`;
}

function renderHoldingCard(meta, data, sectorMap) {
  if (!data) {
    return `
      <article class="holding-card" style="--hold-color:${meta.color}">
        <div class="holding-head">
          <div>
            <h3>${esc(meta.name)}</h3>
            <span class="stock-code">${esc(meta.code)} · ${esc(meta.term)} · ${esc(meta.position)}</span>
          </div>
          <span class="stock-badge">${esc(meta.tag)}</span>
        </div>
        <div class="holding-note"><span class="muted">本日报未解析到该股数据</span></div>
      </article>`;
  }

  const metrics = [
    ['收盘价', data.price],
    ['涨跌幅', data.change],
    ['板块涨幅', sectorMap && sectorMap.get(meta.sector) ? sectorMap.get(meta.sector).change : ''],
    ['成交额', data.turnover],
    ['换手率', data.turnoverRate],
    ['5日线', data.ma5],
    ['20日线', data.ma20],
    ['60日线', data.ma60],
    ['支撑位', data.support],
    ['压力位', data.resistance],
    ['MACD', data.macd],
    ['KDJ', data.kdj],
    ['资金流向', data.flow],
  ];

  const notes = [];
  if (data.maTrend) notes.push(`均线：${data.maTrend}`);
  const sectorChange = sectorMap && sectorMap.get(meta.sector) ? sectorMap.get(meta.sector).change : '';
  if (data.sector) notes.push(`板块：${sectorChange ? `${sectorChange}；` : ''}${data.sector}`);
  if (data.stage) notes.push(`阶段：${data.stage}`);
  if (data.news && data.news !== '无') notes.push(`公告：${data.news}`);
  const warnings = data.alerts && data.alerts.length ? data.alerts.join('；') : '';
  const hasWarning = Boolean(data.warning || warnings);

  return `
    <article class="holding-card ${hasWarning ? 'has-warning' : ''}" style="--hold-color:${meta.color}">
      <div class="holding-head">
        <div>
          <h3>${esc(meta.name)}</h3>
          <span class="stock-code">${esc(meta.code)} · ${esc(meta.term)} · ${esc(meta.position)}</span>
        </div>
        <span class="stock-badge ${meta.tag === '重仓' ? 'heavy' : ''}">${esc(meta.tag)}</span>
      </div>
      <div class="holding-price">
        <strong>${esc(data.price || '—')}</strong>
        <span class="${data.change ? toneClass(data.change) : ''}">${esc(data.change || '—')}</span>
      </div>
      <div class="metric-grid">
        ${metrics.map(([label, value]) => metricItem(label, value)).join('')}
      </div>
      <div class="holding-note">
        ${data.recommendation ? `<div class="action-line">操作参考：${esc(data.recommendation)}</div>` : ''}
        ${notes.map((note) => `<div>${esc(note)}</div>`).join('')}
        ${data.risk && data.risk !== '无' ? `<div>风险：${esc(data.risk)}</div>` : ''}
      </div>
      ${hasWarning ? `<div class="warning-strip">⚠️ ${esc(warnings || data.risk || '日报标注异动')}</div>` : ''}
    </article>`;
}

function metricItem(label, value) {
  return `
    <div class="metric-item">
      <span>${esc(label)}</span>
      <strong>${esc(value || '—')}</strong>
    </div>`;
}

function renderSectors(sectors) {
  const chart = document.getElementById('sectorChart');
  if (!sectors.length) {
    chart.innerHTML = '<div class="empty-inline">暂无板块数据</div>';
    return;
  }
  const maxAbs = Math.max(1, ...sectors.map((item) => Math.abs(parsePct(item.change))));
  const sorted = sectors.slice().sort((a, b) => {
    const rankA = Number(a.rank) || 999;
    const rankB = Number(b.rank) || 999;
    return rankA - rankB;
  });
  const header = `
    <div class="sector-row sector-header">
      <span>板块</span>
      <span>涨跌幅</span>
      <span>排名</span>
    </div>`;
  chart.innerHTML = header + sorted
    .map((item) => {
      const value = parsePct(item.change);
      const width = Math.min(100, (Math.abs(value) / maxAbs) * 100);
      const tone = toneClass(value);
      return `
        <div class="sector-row">
          <div class="sector-label"><span>${esc(item.name)}</span><strong class="${tone}">${esc(item.change)}</strong></div>
          <div class="sector-bar"><span class="bar-fill ${tone}" style="width:${width.toFixed(1)}%"></span></div>
          <span class="sector-rank">第${esc(item.rank || '—')}名</span>
        </div>`;
    })
    .join('');
}

function renderTomorrow(items) {
  const list = document.getElementById('tomorrowList');
  list.innerHTML = items.length
    ? items.map((item) => `<li>${esc(item)}</li>`).join('')
    : '<li>暂无明日关注</li>';
}

function renderHistory() {
  const keyword = document.getElementById('historySearch').value.trim().toLowerCase();
  const filtered = state.reports.filter((report) =>
    `${report.title} ${report.date} ${report.content}`.toLowerCase().includes(keyword)
  );
  document.getElementById('reportCount').textContent = `${filtered.length} 份日报`;
  document.getElementById('historyList').innerHTML = filtered
    .map((report) => {
      const parsed = report.parsed || parseReport(report.content, report.date);
      const holdings = (parsed.holdings || []).filter(Boolean);
      const upCount = holdings.filter((item) => parsePct(item.change) > 0).length;
      const summary = `${holdings.length}只持仓 · ${upCount}涨/${holdings.length - upCount}跌 · ${(parsed.alerts || []).length}项异动`;
      const sampleBadge = parsed.isSample ? '<span class="sample-badge">示例</span>' : '';
      return `
        <article class="history-item">
          <div class="history-date">
            <strong>${esc(report.date)}</strong>
            <span>${weekday(report.date)}</span>
          </div>
          <div class="history-main">
            <div class="history-title">${esc(report.title)}${sampleBadge}</div>
            <div class="history-meta">${esc(summary)} · ${esc(report.filename || '')}</div>
          </div>
          <div class="history-actions">
            <button type="button" class="btn small" data-action="view" data-date="${esc(report.date)}">查看</button>
            <button type="button" class="btn small danger" data-action="delete" data-date="${esc(report.date)}">删除</button>
          </div>
        </article>`;
    })
    .join('') || '<div class="empty-inline">没有匹配的日报</div>';
}

function handleHistoryClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const date = button.dataset.date;
  if (button.dataset.action === 'view') {
    state.currentDate = date;
    switchView('overview');
    renderAll();
    return;
  }
  if (button.dataset.action === 'delete') {
    const report = state.reports.find((item) => item.date === date);
    if (report && window.confirm(`删除 ${date} 的日报？`)) {
      deleteReport(report);
    }
  }
}

async function deleteReport(report) {
  const filename = report.filename || `${report.date}.md`;
  if (state.source === 'folder') {
    try {
      const { res, data } = await fetchJSON(`api/reports/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '删除失败');
      }
      await refreshData(false);
      toast('日报已删除');
    } catch (error) {
      toast('删除失败：' + error.message);
    }
    return;
  }
  state.reports = state.reports.filter((item) => item.date !== report.date);
  saveLocalReports();
  renderAll();
  toast('日报已删除');
}

function renderReview() {
  const dates = sortedDates();
  const options = dates.length ? dates : [todayStr()];
  document.getElementById('reviewDate').innerHTML = options
    .map(
      (date) =>
        `<option value="${esc(date)}" ${date === (state.currentDate || options[0]) ? 'selected' : ''}>${esc(date)}</option>`
    )
    .join('');
  document.getElementById('reviewStock').innerHTML = STOCK_META.map(
    (meta) => `<option value="${esc(meta.name)}">${esc(meta.name)}</option>`
  ).join('');
  bindScoreButtons();
  renderReviewSummary();
  renderTrendChart();
  renderReviewList();
}

function bindScoreButtons() {
  const group = document.getElementById('scoreButtons');
  group.innerHTML = [1, 2, 3, 4, 5]
    .map(
      (score) =>
        `<button type="button" class="score-btn ${state.draftScore === score ? 'is-selected' : ''}" data-score="${score}">${score}</button>`
    )
    .join('');
  group.querySelectorAll('.score-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.draftScore = Number(button.dataset.score);
      bindScoreButtons();
    });
  });
}

function renderReviewSummary() {
  const cards = STOCK_META.map((meta) => {
    const latest = getLatestHolding(meta.name);
    const first = getFirstHolding(meta.name);
    const latestPrice = latest && parseFloat(latest.price);
    const firstPrice = first && parseFloat(first.price);
    const periodChange =
      isFinite(latestPrice) && isFinite(firstPrice) && firstPrice
        ? `${(((latestPrice - firstPrice) / firstPrice) * 100).toFixed(1)}%`
        : '—';
    const reviews = state.reviews.filter((item) => item.stock === meta.name);
    const averageScore = reviews.length
      ? (reviews.reduce((sum, item) => sum + Number(item.score), 0) / reviews.length).toFixed(1)
      : '—';
    return `
      <div class="review-stock-card">
        <div class="stock-title">
          <h3>${esc(meta.name)}</h3>
          <span class="muted">${esc(meta.term)}</span>
        </div>
        <div class="price-line">
          <strong>${latest ? esc(latest.price) : '—'}</strong>
          <span class="${latest && latest.change ? toneClass(latest.change) : ''}">${latest && latest.change ? esc(latest.change) : ''}</span>
        </div>
        <div class="period-line">区间 ${esc(periodChange)} · 复盘 ${reviews.length}次 · 均分 ${esc(averageScore)}</div>
      </div>`;
  }).join('');
  document.getElementById('reviewSummaryGrid').innerHTML = cards;
}

function renderTrendChart() {
  const container = document.getElementById('trendChart');
  const reports = state.reports.slice().sort((a, b) => a.date.localeCompare(b.date));
  const dates = reports.map((report) => report.date);
  if (!dates.length) {
    container.innerHTML = '<div class="empty-inline">暂无趋势数据</div>';
    return;
  }

  const series = STOCK_META.map((meta, index) => ({
    name: meta.name,
    color: SERIES_COLORS[index],
    points: dates.map((date) => {
      const report = reports.find((item) => item.date === date);
      const holding = getHolding(report, meta.name);
      const value = holding && parseFloat(holding.price);
      return isFinite(value) ? value : null;
    }),
  }));

  const allValues = series.flatMap((item) => item.points).filter((value) => value !== null);
  if (!allValues.length) {
    container.innerHTML = '<div class="empty-inline">暂无收盘价数据</div>';
    return;
  }

  const width = 760;
  const height = 280;
  const padL = 54;
  const padR = 96;
  const padT = 18;
  const padB = 36;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;
  const x = (index) => padL + (dates.length === 1 ? 0 : (index * (width - padL - padR)) / (dates.length - 1));
  const y = (value) => padT + ((max - value) / span) * (height - padT - padB);

  const parts = [];
  [min, (min + max) / 2, max].forEach((value) => {
    const lineY = y(value);
    parts.push(
      `<line x1="${padL}" y1="${lineY.toFixed(1)}" x2="${width - padR}" y2="${lineY.toFixed(1)}" stroke="#dce2e9" stroke-width="1"/>`,
      `<text x="${padL - 8}" y="${(lineY + 4).toFixed(1)}" text-anchor="end" class="chart-label">${value.toFixed(2)}</text>`
    );
  });

  const tickDates = dates.length <= 5 ? dates : [dates[0], dates[Math.floor((dates.length - 1) / 2)], dates[dates.length - 1]];
  tickDates.forEach((date) => {
    const index = dates.indexOf(date);
    parts.push(
      `<text x="${x(index).toFixed(1)}" y="${height - padB + 20}" text-anchor="middle" class="chart-label">${esc(date.slice(5))}</text>`
    );
  });

  series.forEach((item) => {
    const points = item.points
      .map((value, index) => (value === null ? null : { x: x(index), y: y(value) }))
      .filter(Boolean);
    if (!points.length) return;
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    parts.push(
      `<path d="${path}" fill="none" stroke="${item.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    );
    const last = points[points.length - 1];
    const lastValue = item.points.filter((value) => value !== null).pop();
    parts.push(
      `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.5" fill="${item.color}"/>`,
      `<text x="${width - padR + 8}" y="${(last.y + 4).toFixed(1)}" class="chart-label" style="fill:${item.color}">${esc(item.name)} ${lastValue.toFixed(2)}</text>`
    );
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="持仓收盘价趋势">
      <title>持仓收盘价趋势</title>
      <desc>${dates.length} 个交易日的四只持仓收盘价折线</desc>
      ${parts.join('')}
    </svg>`;
}

function renderReviewList() {
  const items = state.reviews.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  document.getElementById('reviewCount').textContent = `${items.length} 条记录`;
  document.getElementById('reviewList').innerHTML = items
    .map(
      (item) => `
        <div class="review-item">
          <div class="review-item-main">
            <strong>${esc(item.date)} · ${esc(item.stock)}</strong>
            <span>评分 ${esc(item.score)}/5</span>
          </div>
          ${item.note ? `<p>${esc(item.note)}</p>` : ''}
          <button type="button" class="btn small danger" data-review-delete="${item.id}">删除</button>
        </div>`
    )
    .join('') || '<div class="empty-inline">暂无复盘记录</div>';
}

function handleReviewListClick(event) {
  const button = event.target.closest('[data-review-delete]');
  if (!button) return;
  state.reviews = state.reviews.filter((item) => String(item.id) !== button.dataset.reviewDelete);
  saveReviews();
  renderReview();
  toast('复盘记录已删除');
}

function addReview() {
  const date = document.getElementById('reviewDate').value;
  const stock = document.getElementById('reviewStock').value;
  const note = document.getElementById('reviewNote').value.trim();
  if (!date || !stock) return;
  state.reviews.push({
    id: Date.now(),
    date,
    stock,
    score: state.draftScore,
    note,
    createdAt: new Date().toISOString(),
  });
  saveReviews();
  document.getElementById('reviewNote').value = '';
  renderReview();
  toast('复盘已记录');
}

function handleFileInput() {
  const file = document.getElementById('fileInput').files[0];
  if (!file) return;
  file.text().then((text) => {
    document.getElementById('importText').value = text;
    const match = file.name.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      document.getElementById('importDate').value = match[1];
    }
    updateImportFilename();
    renderParsePreview();
  });
}

function updateImportFilename() {
  const date = document.getElementById('importDate').value || extractDateFromText(document.getElementById('importText').value) || todayStr();
  document.getElementById('importFilename').value = `${date}.md`;
}

function renderParsePreview() {
  const text = document.getElementById('importText').value.trim();
  const preview = document.getElementById('parsePreview');
  const status = document.getElementById('parseStatus');
  if (!text) {
    status.textContent = '等待内容';
    preview.innerHTML = '<div class="empty-inline">尚未解析</div>';
    return;
  }

  const date = document.getElementById('importDate').value || extractDateFromText(text) || todayStr();
  const parsed = parseReport(text, date);
  const holdings = (parsed.holdings || []).filter(Boolean);
  const marketCount = [parsed.market.shIndex, parsed.market.szIndex, parsed.market.cybIndex].filter(Boolean).length;
  const missing = STOCK_META.filter((meta) => !holdings.some((item) => item.name === meta.name));
  const problems = [];
  if (marketCount < 3) problems.push('大盘指数');
  if (missing.length) problems.push(`个股：${missing.map((item) => item.name).join('、')}`);
  status.textContent = problems.length ? `可解析，缺 ${problems.join('；')}` : '解析完成';

  const indexLines = [parsed.market.shIndex, parsed.market.szIndex, parsed.market.cybIndex]
    .filter(Boolean)
    .map((item) => `<p>${esc(item.name)} ${esc(item.value || '—')} ${esc(item.change || '')} 成交${esc(item.turnover || '—')}亿</p>`)
    .join('');
  const holdingLines = holdings
    .map((item) => `<p>${esc(item.name)} ${esc(item.price || '—')} ${esc(item.change || '')} · ${esc(item.stage || '阶段未解析')}</p>`)
    .join('');
  const sectorLines = (parsed.sectors || [])
    .map((item) => `<p>${esc(item.name)} ${esc(item.change || '—')} 第${esc(item.rank || '—')}名</p>`)
    .join('');

  preview.innerHTML = `
    <div class="preview-header">
      <strong>${esc(parsed.title || '未命名日报')}</strong>
      <span>${esc(parsed.date)}</span>
    </div>
    <div class="preview-summary">
      <span class="chip">${holdings.length}/4 个股</span>
      <span class="chip">${(parsed.alerts || []).length} 项异动</span>
      <span class="chip">${(parsed.tomorrow || []).length} 条明日关注</span>
      <span class="chip">${marketCount}/3 指数</span>
    </div>
    <div class="preview-block"><h4>大盘</h4>${indexLines || '<p>未解析</p>'}</div>
    <div class="preview-block"><h4>个股</h4>${holdingLines || '<p>未解析</p>'}</div>
    <div class="preview-block"><h4>板块</h4>${sectorLines || '<p>未解析</p>'}</div>
  `;
}

async function saveReport() {
  const content = document.getElementById('importText').value.trim();
  const date = document.getElementById('importDate').value || extractDateFromText(content) || todayStr();
  if (!content) {
    toast('请先粘贴日报内容');
    return;
  }
  const filename = `${date}.md`;
  const exists = state.reports.some((report) => report.date === date);
  if (exists && !window.confirm(`日期 ${date} 已有日报，是否覆盖？`)) {
    return;
  }

  if (state.source === 'folder') {
    try {
      const { res, data } = await fetchJSON('api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      });
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '保存失败');
      }
      await refreshData(false);
      state.currentDate = date;
      switchView('overview');
      renderAll();
      toast('日报已保存到 reports/');
    } catch (error) {
      toast('保存失败：' + error.message);
    }
    return;
  }

  state.reports = [
    ...state.reports.filter((report) => report.date !== date),
    {
      date,
      filename,
      title: extractTitle(content),
      content,
      parsed: parseReport(content, date),
    },
  ];
  state.reports.sort((a, b) => b.date.localeCompare(a.date));
  saveLocalReports();
  state.currentDate = date;
  switchView('overview');
  renderAll();
  toast('日报已保存到本地');
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    source: state.source,
    reports: state.reports.map((report) => ({
      date: report.date,
      filename: report.filename,
      title: report.title,
      content: report.content,
    })),
    reviews: state.reviews,
    notes: state.notes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `a-share-report-backup-${todayStr()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast('备份已导出');
}

function saveQuickNote() {
  const report = getCurrentReport();
  if (!report) return;
  state.notes[report.date] = document.getElementById('quickNote').value;
  saveNotes();
  document.getElementById('noteSavedAt').textContent = `已保存 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  toast('笔记已保存');
}

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach((section) => {
    section.classList.toggle('is-active', section.id === `view-${view}`);
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  renderTopbarTitle();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function stepDate(direction) {
  const dates = sortedDates();
  if (!dates.length) return;
  const index = dates.indexOf(state.currentDate);
  const next = index + direction;
  state.currentDate = dates[Math.min(dates.length - 1, Math.max(0, next))];
  renderAll();
}

function goToLatest() {
  const today = todayStr();
  const dates = sortedDates();
  state.currentDate = state.reports.some((report) => report.date === today) ? today : dates[0] || today;
  renderAll();
}

function getCurrentReport() {
  return state.reports.find((report) => report.date === state.currentDate) || state.reports[0] || null;
}

function getHolding(report, name) {
  if (!report) return null;
  const parsed = report.parsed || parseReport(report.content, report.date);
  return ((parsed.holdings || []).find((item) => item && item.name === name)) || null;
}

function getLatestHolding(name) {
  const report = state.reports.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  return getHolding(report, name);
}

function getFirstHolding(name) {
  const report = state.reports.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
  return getHolding(report, name);
}

function sortedDates() {
  return [...new Set(state.reports.map((report) => report.date))].sort((a, b) => b.localeCompare(a));
}

function loadLocalReports() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_REPORTS) || '[]');
    return stored.map((report) => ({
      ...report,
      parsed: report.parsed || parseReport(report.content, report.date),
    }));
  } catch (error) {
    return [];
  }
}

function saveLocalReports() {
  localStorage.setItem(
    LS_REPORTS,
    JSON.stringify(
      state.reports.map((report) => ({
        date: report.date,
        filename: report.filename,
        title: report.title,
        content: report.content,
      }))
    )
  );
}

function loadReviews() {
  try {
    return JSON.parse(localStorage.getItem(LS_REVIEWS) || '[]');
  } catch (error) {
    return [];
  }
}

function saveReviews() {
  localStorage.setItem(LS_REVIEWS, JSON.stringify(state.reviews));
}

function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(LS_NOTES) || '{}');
  } catch (error) {
    return {};
  }
}

function saveNotes() {
  localStorage.setItem(LS_NOTES, JSON.stringify(state.notes));
}

function setSource(text) {
  document.getElementById('sourceLabel').textContent = text;
}

function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2200);
}

function parseReport(raw, fallbackDate) {
  const content = String(raw || '').replace(/^\uFEFF/, '');
  const date = extractDateFromText(content) || fallbackDate || todayStr();
  const title = extractTitle(content);
  const sections = splitSections(content);
  const market = parseMarket(sections.market || content);
  const holdings = STOCK_META.map((meta) => parseHolding(sections.stocks || content, meta));
  const sectors = parseSectors(sections.sectors || '');
  const tomorrow = parseTomorrow(sections.tomorrow || '');
  const alerts = holdings.flatMap((holding) => (holding && holding.alerts ? holding.alerts : []));
  return {
    date,
    title,
    market,
    holdings,
    sectors,
    tomorrow,
    signal: extractField(sections.sectors || '', '轮动信号'),
    alerts,
    isSample: /示例|sample/i.test(title + content.slice(0, 120)),
  };
}

function splitSections(content) {
  const sections = { market: '', stocks: '', sectors: '', tomorrow: '' };
  const rules = [
    { key: 'market', pattern: /一\s*[、.．]\s*.*(?:大盘|市场)/ },
    { key: 'stocks', pattern: /二\s*[、.．]\s*.*(?:个股|持仓)/ },
    { key: 'sectors', pattern: /三\s*[、.．]\s*.*(?:板块)/ },
    { key: 'tomorrow', pattern: /四\s*[、.．]\s*.*(?:明日|关注)/ },
  ];
  let current = '';
  content.split('\n').forEach((line) => {
    const rule = rules.find((item) => item.pattern.test(line));
    if (rule) {
      current = rule.key;
      sections[current] += line + '\n';
    } else if (current) {
      sections[current] += line + '\n';
    }
  });
  return sections;
}

function parseMarket(text) {
  const indexes = [
    ['shIndex', '上证指数'],
    ['szIndex', '深证成指'],
    ['cybIndex', '创业板指'],
  ];
  const market = { shIndex: null, szIndex: null, cybIndex: null, northbound: null, tone: '' };
  indexes.forEach(([key, name]) => {
    market[key] = parseIndexLine(text, name);
  });
  market.northbound = parseNorthbound(text);
  market.tone = extractField(text, /(?:市场主线|情绪判断|主线|情绪)/) || '';
  return market;
}

function parseIndexLine(text, name) {
  const line = findLine(text, name);
  if (!line) return null;
  const pctMatch = line.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  const turnoverMatch = line.match(/成交额[^\d]*(\d+(?:\.\d+)?)\s*(?:亿|万元)?/);
  const numbers = (line.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const pctValue = pctMatch ? parseFloat(pctMatch[1]) : null;
  const value = numbers.find((number) => pctValue === null || Math.abs(number - pctValue) > 0.0001) || null;
  return {
    name,
    value: value === null ? null : String(value),
    change: pctMatch ? pctMatch[1] : '',
    turnover: turnoverMatch ? turnoverMatch[1] : '',
  };
}

function parseNorthbound(text) {
  const line = findLine(text, '北向');
  if (!line) return null;
  const numbers = line.match(/-?\d+(?:\.\d+)?/g);
  const amount = numbers && numbers.length ? numbers[0] : '';
  const direction = line.includes('净流出') ? '净流出' : line.includes('净流入') ? '净流入' : '';
  return { amount, direction };
}

function parseHolding(text, meta) {
  const block = extractStockBlock(text, meta.name);
  if (!block) return null;
  const change = extractField(block, '涨跌幅');
  const volumeRatioText = extractField(block, '量比');
  const volumeRatio = parseFloat(volumeRatioText) || 0;
  const alerts = [];
  if (Math.abs(parsePct(change)) >= 5) {
    alerts.push(`${change} 异常波动`);
  }
  if (volumeRatio >= 2) {
    alerts.push(`量比 ${volumeRatioText}`);
  }
  if (/⚠️/.test(block)) {
    alerts.push('⚠️ 日报标注异动');
  }
  const risk = extractField(block, '风险提示') || extractField(block, '风险');
  return {
    name: meta.name,
    price: extractField(block, '收盘价'),
    change,
    turnover: extractField(block, '成交额'),
    turnoverRate: extractField(block, '换手率'),
    ma5: extractField(block, '5日均线') || extractField(block, '5日线'),
    ma20: extractField(block, '20日均线') || extractField(block, '20日线'),
    ma60: extractField(block, '60日均线') || extractField(block, '60日线'),
    maTrend: extractField(block, '均线关系'),
    support: extractField(block, '支撑位'),
    resistance: extractField(block, '压力位'),
    macd: extractField(block, 'MACD'),
    kdj: extractField(block, 'KDJ'),
    flow: extractField(block, '资金流向'),
    recommendation: extractField(block, '操作建议'),
    stage: extractField(block, '阶段判断'),
    sector: extractField(block, '板块表现'),
    news: extractField(block, '重大事项') || extractField(block, '公告'),
    risk,
    warning: /⚠️|异常|警惕|风险/.test(block) && !/风险提示：无/.test(block),
    alerts,
    raw: block,
  };
}

function extractStockBlock(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex(
    (line) =>
      line.includes(name) &&
      /[*#（(【]|持仓|长期|短期|^\s*[-•]/.test(line)
  );
  if (start === -1) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (STOCK_META.some((meta) => meta.name !== name && line.includes(meta.name)) || /^#{1,4}\s*[一二三四五六]/.test(line)) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function parseSectors(text) {
  const names = ['贵金属', '光电显示', '医疗健康', '面板'];
  const sectors = [];
  const seen = new Set();
  text.split('\n').forEach((line) => {
    const name = names.find((item) => line.includes(item) && !seen.has(item));
    if (!name) return;
    seen.add(name);
    const pctMatch = line.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    const rankMatch = line.match(/第\s*(\d+)/);
    sectors.push({
      name,
      change: pctMatch ? pctMatch[1] : '',
      rank: rankMatch ? rankMatch[1] : '',
    });
  });
  return sectors;
}

function parseTomorrow(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s*/.test(line))
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

function extractField(text, label) {
  let regex;
  if (label instanceof RegExp) {
    regex = new RegExp(label.source + '\\s*[：:，,]?\\s*([^\\n,，;；]+)');
  } else {
    regex = new RegExp(escapeRegExp(label) + '\\s*[：:]?\\s*([^\\n,，;；]+)');
  }
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function findLine(text, keyword) {
  return text
    .split('\n')
    .find((line) => (keyword instanceof RegExp ? keyword.test(line) : line.includes(keyword))) || '';
}

function extractTitle(content) {
  const line = content
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('#'));
  return line ? line.replace(/^#+\s*/, '').trim() : '未命名日报';
}

function extractDateFromText(content) {
  const match = String(content || '').match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})/);
  return match ? `${match[1]}-${pad(match[2])}-${pad(match[3])}` : '';
}

function parsePct(text) {
  const match = String(text || '').match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  return match ? parseFloat(match[1]) : 0;
}

function formatNumber(value) {
  const number = parseFloat(value);
  return isFinite(number) ? number.toFixed(2) : String(value || '—');
}

function toneClass(value) {
  const number = parseFloat(value);
  if (!isFinite(number) || number === 0) return '';
  return number > 0 ? 'up' : 'down';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function weekday(date) {
  const week = ['日', '一', '二', '三', '四', '五', '六'];
  return `周${week[new Date(`${date}T00:00:00`).getDay()]}`;
}

function todayStr() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}
