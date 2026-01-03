// ==================== STATE ====================
let state = {
  currentCash: 15000,
  locLimit: 50000,
  locBalance: 0,
  timeRange: 30,
  timelineCustomStart: null,
  timelineCustomEnd: null,
  metricsTimeframe: 90,
  metricsCustomStart: null,
  metricsCustomEnd: null,
  tableView: 'monthly',
  entries: [
    { id: 1, date: '2026-01-02', description: 'Daily Sales', type: 'revenue', amount: 1200, frequency: 'daily' },
    { id: 2, date: '2026-01-05', description: 'Inventory Restock', type: 'expense', amount: 8500, frequency: 'once' },
    { id: 3, date: '2026-01-10', description: 'Payroll', type: 'expense', amount: 6200, frequency: 'every2weeks' },
    { id: 4, date: '2026-01-15', description: 'Rent', type: 'expense', amount: 4500, frequency: 'monthly' },
    { id: 5, date: '2026-01-15', description: 'Utilities', type: 'expense', amount: 850, frequency: 'monthly' },
    { id: 6, date: '2026-01-20', description: 'Debt Payment', type: 'expense', amount: 2200, frequency: 'monthly' },
  ]
};

let editingEntryId = null;
let selectedEntries = new Set();
let setupComplete = false;

const frequencyLabels = {
  'once': 'One-time',
  'daily': 'Daily',
  'weekly': 'Weekly',
  'every2weeks': 'Every 2 wks',
  'every4weeks': 'Every 4 wks',
  'semimonthly': 'Semimonthly',
  'monthly': 'Monthly',
  'every2months': 'Every 2 mo',
  'quarterly': 'Quarterly',
  'every4months': 'Every 4 mo',
  'semiannual': 'Semiannual',
  'annual': 'Annual'
};

// ==================== PERSISTENCE ====================
function saveState() {
  localStorage.setItem('cashFlowPlannerState', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('cashFlowPlannerState');
  if (saved) {
    state = { ...state, ...JSON.parse(saved) };
    document.getElementById('currentCash').value = state.currentCash;
    document.getElementById('locLimit').value = state.locLimit;
    document.getElementById('locBalance').value = state.locBalance;

    // Restore metrics timeframe
    if (state.metricsCustomStart && state.metricsCustomEnd) {
      document.getElementById('metricsTimeframe').value = 'custom';
      document.getElementById('customDateRange').style.display = 'flex';
      document.getElementById('metricsStartDate').value = state.metricsCustomStart;
      document.getElementById('metricsEndDate').value = state.metricsCustomEnd;
    } else if (state.metricsTimeframe) {
      document.getElementById('metricsTimeframe').value = state.metricsTimeframe;
    }

    // Restore timeline timeframe
    if (state.timelineCustomStart && state.timelineCustomEnd) {
      document.getElementById('timelineTimeframe').value = 'custom';
      document.getElementById('timelineCustomDateRange').style.display = 'flex';
      document.getElementById('timelineStartDate').value = state.timelineCustomStart;
      document.getElementById('timelineEndDate').value = state.timelineCustomEnd;
    } else if (state.timeRange) {
      document.getElementById('timelineTimeframe').value = state.timeRange;
    }
  }
}

function exportData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cashflow-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      state = { ...state, ...imported };
      document.getElementById('currentCash').value = state.currentCash;
      document.getElementById('locLimit').value = state.locLimit;
      document.getElementById('locBalance').value = state.locBalance;
      saveState();
      render();
      alert('Data imported successfully!');
    } catch (err) {
      alert('Error importing file. Please check the format.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ==================== UTILITIES ====================
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateLong(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthYear(date) {
  return date.toLocaleDateString('en-US', { month: "short", year: '2-digit' }).toUpperCase();
}

function getStatusColor(balance) {
  if (balance < 0) return 'var(--accent-coral)';
  if (balance < 5000) return 'var(--accent-amber)';
  return 'var(--accent-green)';
}

function getStatusClass(balance) {
  if (balance < 0) return 'negative';
  if (balance < 5000) return 'warning';
  return 'positive';
}

// ==================== FORECASTING ====================
function getNextOccurrence(currentDate, frequency) {
  const next = new Date(currentDate);
  switch (frequency) {
    case 'daily': next.setDate(next.getDate() + 1); break;
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'every2weeks': next.setDate(next.getDate() + 14); break;
    case 'every4weeks': next.setDate(next.getDate() + 28); break;
    case 'semimonthly':
      if (next.getDate() < 15) {
        next.setDate(15);
      } else {
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
      }
      break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'every2months': next.setMonth(next.getMonth() + 2); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'every4months': next.setMonth(next.getMonth() + 4); break;
    case 'semiannual': next.setMonth(next.getMonth() + 6); break;
    case 'annual': next.setFullYear(next.getFullYear() + 1); break;
    default: return null;
  }
  return next;
}

function expandEntries(entries, daysToForecast = 30) {
  const expanded = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + daysToForecast);

  entries.forEach(entry => {
    if (entry.frequency === 'once') {
      const entryDate = new Date(entry.date + 'T12:00:00');
      if (entryDate >= today && entryDate <= endDate) {
        expanded.push({ ...entry, originalId: entry.id });
      }
    } else {
      let currentDate = new Date(entry.date + 'T12:00:00');
      let occurrenceCount = 0;
      const maxOccurrences = entry.endOccurrences || Infinity;
      const endByDate = entry.endDate ? new Date(entry.endDate + 'T12:00:00') : null;

      while (currentDate <= endDate) {
        if (endByDate && currentDate > endByDate) break;
        if (occurrenceCount >= maxOccurrences) break;

        if (currentDate >= today) {
          expanded.push({
            ...entry,
            date: currentDate.toISOString().split('T')[0],
            originalId: entry.id,
            id: entry.id + '-' + currentDate.toISOString()
          });
        }
        occurrenceCount++;
        const nextDate = getNextOccurrence(currentDate, entry.frequency);
        if (!nextDate) break;
        currentDate = nextDate;
      }
    }
  });

  return expanded.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calculateForecast(daysToForecast = 30) {
  const expandedEntries = expandEntries(state.entries, daysToForecast);
  let runningBalance = state.currentCash;
  let runningLocBalance = state.locBalance;
  let locDrawRequired = false;
  let locDrawDate = null;
  let locDrawAmount = 0;
  let minBalance = state.currentCash;
  let minBalanceDate = new Date().toISOString().split('T')[0];

  // Track upcoming LOC transactions (within 7 days)
  const upcomingLocTransactions = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysOut = new Date(today);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  const dailyForecast = [];

  for (let i = 0; i <= daysToForecast; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const dayEntries = expandedEntries.filter(e => e.date === dateStr);
    const dayRevenue = dayEntries.filter(e => e.type === 'revenue').reduce((sum, e) => sum + e.amount, 0);
    const dayExpenses = dayEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
    const dayLocDraws = dayEntries.filter(e => e.type === 'loc_draw').reduce((sum, e) => sum + e.amount, 0);
    const dayLocPaydowns = dayEntries.filter(e => e.type === 'loc_paydown').reduce((sum, e) => sum + e.amount, 0);

    // LOC Draw: increases cash, increases LOC balance (debt)
    // LOC Paydown: decreases cash, decreases LOC balance (debt)
    runningBalance += dayRevenue - dayExpenses + dayLocDraws - dayLocPaydowns;
    runningLocBalance += dayLocDraws - dayLocPaydowns;

    // Track upcoming LOC transactions for alerts
    if (date > today && date <= sevenDaysOut) {
      dayEntries.filter(e => e.type === 'loc_draw' || e.type === 'loc_paydown').forEach(e => {
        upcomingLocTransactions.push({
          date: dateStr,
          type: e.type,
          amount: e.amount,
          description: e.description
        });
      });
    }

    if (runningBalance < minBalance) {
      minBalance = runningBalance;
      minBalanceDate = dateStr;
    }

    if (runningBalance < 0 && !locDrawRequired) {
      locDrawRequired = true;
      locDrawDate = dateStr;
      locDrawAmount = Math.abs(runningBalance) + 5000;
    }

    dailyForecast.push({
      date: dateStr,
      revenue: dayRevenue,
      expenses: dayExpenses,
      locDraws: dayLocDraws,
      locPaydowns: dayLocPaydowns,
      balance: runningBalance,
      locBalance: runningLocBalance,
      entries: dayEntries
    });
  }

  const totalRevenue = expandedEntries.filter(e => e.type === 'revenue').reduce((sum, e) => sum + e.amount, 0);
  const totalExpenses = expandedEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
  const totalLocDraws = expandedEntries.filter(e => e.type === 'loc_draw').reduce((sum, e) => sum + e.amount, 0);
  const totalLocPaydowns = expandedEntries.filter(e => e.type === 'loc_paydown').reduce((sum, e) => sum + e.amount, 0);

  // Get projected LOC balance at end
  const projectedLocBalance = dailyForecast.length > 0 ? dailyForecast[dailyForecast.length - 1].locBalance : state.locBalance;

  return {
    dailyForecast,
    totalRevenue,
    totalExpenses,
    totalLocDraws,
    totalLocPaydowns,
    netCashFlow: totalRevenue - totalExpenses,
    endingBalance: runningBalance,
    projectedLocBalance,
    locDrawRequired,
    locDrawDate,
    locDrawAmount,
    minBalance,
    minBalanceDate,
    upcomingLocTransactions
  };
}

// ==================== RENDERING ====================
function render() {
  const dashboardForecast = calculateForecast(state.metricsTimeframe);
  const timelineForecast = calculateForecast(state.timeRange);
  renderMetrics(dashboardForecast);
  renderLOCAlert(dashboardForecast);
  renderChart(timelineForecast);
  renderForecast(timelineForecast);
  renderTableView();
  renderEntries();
  renderChecklist(dashboardForecast);
}

function renderMetrics(forecast) {
  const timeframeLabel = getMetricsTimeframeLabel();
  const locAvailable = state.locLimit - state.locBalance;
  const projectedLocAvailable = state.locLimit - forecast.projectedLocBalance;

  const html = `
    <div class="metric-card highlight">
      <div class="metric-label">Current Cash</div>
      <div class="metric-value">${formatCurrency(state.currentCash)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">${timeframeLabel} Income</div>
      <div class="metric-value positive">${formatCurrency(forecast.totalRevenue)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">${timeframeLabel} Expenses</div>
      <div class="metric-value negative">${formatCurrency(forecast.totalExpenses)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Projected Cash</div>
      <div class="metric-value ${getStatusClass(forecast.endingBalance)}">${formatCurrency(forecast.endingBalance)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Lowest Point</div>
      <div class="metric-value ${getStatusClass(forecast.minBalance)}">${formatCurrency(forecast.minBalance)}</div>
      <div class="metric-sub">on ${formatDate(forecast.minBalanceDate)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">LOC Available</div>
      <div class="metric-value">${formatCurrency(locAvailable)}</div>
      <div class="metric-sub">${forecast.projectedLocBalance !== state.locBalance ? `→ ${formatCurrency(projectedLocAvailable)} projected` : `of ${formatCurrency(state.locLimit)}`}</div>
    </div>
  `;
  document.getElementById('metricsGrid').innerHTML = html;
}

function renderLOCAlert(forecast) {
  // Main LOC draw needed alert
  const alertEl = document.getElementById('locAlert');
  const textEl = document.getElementById('locAlertText');
  if (forecast.locDrawRequired) {
    alertEl.classList.remove('hidden');
    textEl.innerHTML = `Your balance is projected to go negative on <strong>${formatDate(forecast.locDrawDate)}</strong>. Consider drawing <strong>${formatCurrency(forecast.locDrawAmount)}</strong> before then to stay in the clear.`;
  } else {
    alertEl.classList.add('hidden');
  }

  // Upcoming LOC transaction reminder
  const upcomingEl = document.getElementById('locUpcomingAlert');
  const upcomingTextEl = document.getElementById('locUpcomingText');
  if (forecast.upcomingLocTransactions.length > 0) {
    const transactions = forecast.upcomingLocTransactions;
    let message = '';
    if (transactions.length === 1) {
      const t = transactions[0];
      const action = t.type === 'loc_draw' ? 'draw' : 'paydown';
      message = `You have a planned LOC ${action} of <strong>${formatCurrency(t.amount)}</strong> scheduled for <strong>${formatDate(t.date)}</strong>. Don't forget to make this transfer!`;
    } else {
      message = `You have <strong>${transactions.length} LOC transactions</strong> scheduled in the next 7 days:<br>`;
      message += transactions.map(t => {
        const action = t.type === 'loc_draw' ? 'Draw' : 'Paydown';
        return `• ${action} ${formatCurrency(t.amount)} on ${formatDate(t.date)}`;
      }).join('<br>');
      message += '<br>Make sure to complete these transfers!';
    }
    upcomingEl.classList.remove('hidden');
    upcomingTextEl.innerHTML = message;
  } else {
    upcomingEl.classList.add('hidden');
  }
}

function renderChart(forecast) {
  const svg = document.getElementById('chartSvg');
  const scaleEl = document.getElementById('chartScale');
  const container = document.querySelector('.chart-svg-container');
  const balances = forecast.dailyForecast.map(d => d.balance);
  const maxBalance = Math.max(...balances, state.currentCash);
  const minBalanceVal = Math.min(...balances, 0);
  const range = maxBalance - minBalanceVal || 1;

  const scaleValues = [];
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const value = maxBalance - (range * i / steps);
    scaleValues.push(formatCurrency(Math.round(value)));
  }
  scaleEl.innerHTML = scaleValues.map(v => `<div>${v}</div>`).join('');

  const width = 800;
  const height = 160;
  const padding = 5;

  let pathD = '';
  const points = [];
  forecast.dailyForecast.forEach((day, i) => {
    const x = padding + (i / (forecast.dailyForecast.length - 1)) * (width - padding * 2);
    const y = padding + ((maxBalance - day.balance) / range) * (height - padding * 2);
    points.push({ x, y, date: day.date, balance: day.balance });
    pathD += (i === 0 ? 'M' : 'L') + ` ${x} ${y}`;
  });

  let gridLines = '';
  for (let i = 0; i <= 5; i++) {
    const y = padding + (i / 5) * (height - padding * 2);
    gridLines += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e8e4e0" stroke-width="1"/>`;
  }

  let zeroLine = '';
  if (minBalanceVal < 0) {
    const zeroY = padding + ((maxBalance - 0) / range) * (height - padding * 2);
    zeroLine = `<line x1="0" y1="${zeroY}" x2="${width}" y2="${zeroY}" stroke="var(--accent-coral)" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  }

  let areaPath = pathD + ` L ${points[points.length-1].x} ${height} L ${points[0].x} ${height} Z`;

  let hoverPoints = points.map((p, i) =>
    `<circle cx="${p.x}" cy="${p.y}" r="8" fill="transparent" data-index="${i}" class="hover-point" style="cursor: pointer;"/>`
  ).join('');

  svg.innerHTML = gridLines + zeroLine +
    `<path d="${areaPath}" fill="rgba(108, 158, 180, 0.1)"/>` +
    `<path d="${pathD}" fill="none" stroke="var(--accent-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    points.filter((_, i) => i % Math.ceil(points.length / 15) === 0 || i === points.length - 1).map(p =>
      `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent-blue)"/>`
    ).join('') +
    hoverPoints;

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const tooltip = document.getElementById('chartTooltip');
  const chartContainer = document.getElementById('chartContainer');

  svg.querySelectorAll('.hover-point').forEach((point, i) => {
    point.addEventListener('mouseenter', (e) => {
      const p = points[i];
      document.getElementById('tooltipDate').textContent = formatDateLong(p.date);
      document.getElementById('tooltipBalance').textContent = formatCurrency(p.balance);
      document.getElementById('tooltipBalance').style.color = getStatusColor(p.balance);
      tooltip.style.display = 'block';
    });

    point.addEventListener('mousemove', (e) => {
      const rect = chartContainer.getBoundingClientRect();
      let left = e.clientX - rect.left + 15;
      let top = e.clientY - rect.top - 30;
      if (left + 150 > rect.width) left = e.clientX - rect.left - 160;
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    });

    point.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}

function renderForecast(forecast) {
  const daysWithEntries = forecast.dailyForecast.filter(day => day.entries.length > 0);
  const html = daysWithEntries.map(day => {
    const entriesHtml = day.entries.map(entry => {
      let colorClass = '';
      let prefix = '';
      let label = entry.description;

      if (entry.type === 'revenue') {
        colorClass = 'positive';
        prefix = '+';
      } else if (entry.type === 'expense') {
        colorClass = 'negative';
        prefix = '-';
      } else if (entry.type === 'loc_draw') {
        colorClass = '';
        prefix = '+';
        label = `🏦 ${entry.description}`;
      } else if (entry.type === 'loc_paydown') {
        colorClass = '';
        prefix = '-';
        label = `🏦 ${entry.description}`;
      }

      return `
        <span class="forecast-entry ${entry.type}">
          <span class="${colorClass}" style="${entry.type.startsWith('loc') ? 'color: #7c3aed;' : ''}">${prefix}${formatCurrency(entry.amount)}</span>
          <span style="color: var(--text-secondary);">${label}</span>
        </span>
      `;
    }).join('');

    const netChange = day.revenue - day.expenses + day.locDraws - day.locPaydowns;
    return `
      <div class="forecast-row">
        <div class="entry-date">${formatDate(day.date)}</div>
        <div class="forecast-entries">${entriesHtml}</div>
        <div class="entry-amount ${netChange >= 0 ? 'positive' : 'negative'}">${netChange >= 0 ? '+' : ''}${formatCurrency(netChange)}</div>
        <div class="entry-amount" style="color: ${getStatusColor(day.balance)};">${formatCurrency(day.balance)}</div>
      </div>
    `;
  }).join('');
  document.getElementById('forecastList').innerHTML = html || '<p style="color: var(--text-muted); padding: 24px; text-align: center;">No transactions in this period</p>';
}

function renderTableView() {
  const forecast = calculateForecast(90);
  const periods = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (state.tableView === 'monthly') {
    const months = {};
    forecast.dailyForecast.forEach(day => {
      const d = new Date(day.date + 'T12:00:00');
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!months[key]) {
        months[key] = {
          label: formatMonthYear(d),
          revenue: 0,
          expenses: 0,
          locDraws: 0,
          locPaydowns: 0,
          openingBalance: null,
          closingBalance: 0,
          openingLocBalance: null,
          closingLocBalance: 0
        };
      }
      if (months[key].openingBalance === null) {
        months[key].openingBalance = day.balance - day.revenue + day.expenses - day.locDraws + day.locPaydowns;
        months[key].openingLocBalance = day.locBalance - day.locDraws + day.locPaydowns;
      }
      months[key].revenue += day.revenue;
      months[key].expenses += day.expenses;
      months[key].locDraws += day.locDraws;
      months[key].locPaydowns += day.locPaydowns;
      months[key].closingBalance = day.balance;
      months[key].closingLocBalance = day.locBalance;
    });
    Object.values(months).forEach(m => periods.push(m));
  } else {
    let weekStart = new Date(today);
    let weekNum = 1;
    while (weekStart <= new Date(today.getTime() + 90 * 86400000)) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekDays = forecast.dailyForecast.filter(day => {
        const d = new Date(day.date + 'T12:00:00');
        return d >= weekStart && d <= weekEnd;
      });

      if (weekDays.length > 0) {
        const revenue = weekDays.reduce((s, d) => s + d.revenue, 0);
        const expenses = weekDays.reduce((s, d) => s + d.expenses, 0);
        const locDraws = weekDays.reduce((s, d) => s + d.locDraws, 0);
        const locPaydowns = weekDays.reduce((s, d) => s + d.locPaydowns, 0);
        periods.push({
          label: `Week ${weekNum}`,
          revenue,
          expenses,
          locDraws,
          locPaydowns,
          openingBalance: weekDays[0].balance - weekDays[0].revenue + weekDays[0].expenses - weekDays[0].locDraws + weekDays[0].locPaydowns,
          closingBalance: weekDays[weekDays.length - 1].balance,
          openingLocBalance: weekDays[0].locBalance - weekDays[0].locDraws + weekDays[0].locPaydowns,
          closingLocBalance: weekDays[weekDays.length - 1].locBalance
        });
      }
      weekStart.setDate(weekStart.getDate() + 7);
      weekNum++;
    }
  }

  const headerCells = periods.map(p => `<th>${p.label}</th>`).join('');

  const openingRow = periods.map(p => {
    const val = p.openingBalance;
    return `<td class="${getStatusClass(val)}">${formatCurrency(val)}</td>`;
  }).join('');

  const revenueRow = periods.map(p =>
    `<td class="positive">${p.revenue > 0 ? formatCurrency(p.revenue) : '—'}</td>`
  ).join('');

  const expenseRow = periods.map(p =>
    `<td class="negative">${p.expenses > 0 ? formatCurrency(p.expenses) : '—'}</td>`
  ).join('');

  const locDrawRow = periods.map(p =>
    `<td style="color: #7c3aed;">${p.locDraws > 0 ? '+' + formatCurrency(p.locDraws) : '—'}</td>`
  ).join('');

  const locPaydownRow = periods.map(p =>
    `<td style="color: #2563eb;">${p.locPaydowns > 0 ? '-' + formatCurrency(p.locPaydowns) : '—'}</td>`
  ).join('');

  const netRow = periods.map(p => {
    const net = p.revenue - p.expenses + p.locDraws - p.locPaydowns;
    return `<td class="${net >= 0 ? 'positive' : 'negative'}">${formatCurrency(net)}</td>`;
  }).join('');

  const closingRow = periods.map(p => {
    const val = p.closingBalance;
    return `<td class="${getStatusClass(val)}" style="font-weight: 700;">${formatCurrency(val)}</td>`;
  }).join('');

  const locBalanceRow = periods.map(p => {
    return `<td style="color: #7c3aed;">${formatCurrency(p.closingLocBalance)}</td>`;
  }).join('');

  // Check if there are any LOC transactions
  const hasLocTransactions = periods.some(p => p.locDraws > 0 || p.locPaydowns > 0);

  const locRows = hasLocTransactions ? `
    <tr>
      <td class="row-label indent">LOC draws</td>
      ${locDrawRow}
    </tr>
    <tr>
      <td class="row-label indent">LOC paydowns</td>
      ${locPaydownRow}
    </tr>
  ` : '';

  const locBalanceRowHtml = hasLocTransactions ? `
    <tr>
      <td class="row-label">LOC balance</td>
      ${locBalanceRow}
    </tr>
  ` : '';

  const html = `
    <table class="cf-table">
      <thead>
        <tr>
          <th style="min-width: 150px;">Breakdown (USD)</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="row-label">Opening balance</td>
          ${openingRow}
        </tr>
        <tr>
          <td class="row-label indent">Total cash in</td>
          ${revenueRow}
        </tr>
        <tr>
          <td class="row-label indent">Total cash out</td>
          ${expenseRow}
        </tr>
        ${locRows}
        <tr>
          <td class="row-label">Net cash flow</td>
          ${netRow}
        </tr>
        <tr>
          <td class="row-label row-total">Closing balance</td>
          ${closingRow}
        </tr>
        ${locBalanceRowHtml}
      </tbody>
    </table>
  `;

  document.getElementById('tableView').innerHTML = html;
}

function renderEntries() {
  const sortedEntries = [...state.entries].sort((a, b) => new Date(a.date) - new Date(b.date));

  const existingIds = new Set(state.entries.map(e => e.id));
  selectedEntries = new Set([...selectedEntries].filter(id => existingIds.has(id)));

  const allSelected = sortedEntries.length > 0 && sortedEntries.every(e => selectedEntries.has(e.id));
  const someSelected = selectedEntries.size > 0;

  const batchActionsHtml = someSelected ? `
    <div class="batch-actions">
      <span class="batch-actions-text">${selectedEntries.size} item${selectedEntries.size > 1 ? 's' : ''} selected</span>
      <button class="btn btn-danger btn-sm" onclick="confirmBatchDelete()">Delete Selected</button>
      <button class="btn btn-secondary btn-sm" onclick="clearSelection()">Clear</button>
    </div>
  ` : '';

  const headerHtml = sortedEntries.length > 0 ? `
    <div class="entry-header">
      <div class="checkbox-wrapper">
        <div class="checkbox ${allSelected ? 'checked' : ''}" onclick="toggleSelectAll()"></div>
      </div>
      <div>Date</div>
      <div>Description</div>
      <div>Type</div>
      <div>Frequency</div>
      <div style="text-align: right;">Amount</div>
      <div style="text-align: right;">Actions</div>
    </div>
  ` : '';

  const typeLabels = {
    'revenue': 'income',
    'expense': 'expense',
    'loc_draw': 'LOC Draw',
    'loc_paydown': 'LOC Paydown'
  };

  const entriesHtml = sortedEntries.map(entry => {
    const freqLabel = frequencyLabels[entry.frequency] || entry.frequency;
    const isSelected = selectedEntries.has(entry.id);
    let endLabel = '';
    if (entry.frequency !== 'once') {
      if (entry.endDate) {
        endLabel = `<span class="entry-badge end-condition">Until ${formatDate(entry.endDate)}</span>`;
      } else if (entry.endOccurrences) {
        endLabel = `<span class="entry-badge end-condition">${entry.endOccurrences}×</span>`;
      }
    }

    // Determine amount display style
    let amountClass = '';
    let amountPrefix = '';
    if (entry.type === 'revenue' || entry.type === 'loc_draw') {
      amountClass = entry.type === 'revenue' ? 'positive' : '';
      amountPrefix = '+';
    } else {
      amountClass = entry.type === 'expense' ? 'negative' : '';
      amountPrefix = '-';
    }

    const amountStyle = entry.type.startsWith('loc') ? 'color: #7c3aed;' : '';

    return `
      <div class="entry-row ${isSelected ? 'selected' : ''}">
        <div class="checkbox-wrapper">
          <div class="checkbox ${isSelected ? 'checked' : ''}" onclick="toggleEntrySelection(${entry.id})"></div>
        </div>
        <div class="entry-date">${formatDate(entry.date)}</div>
        <div class="entry-desc">
          ${entry.type.startsWith('loc') ? '🏦 ' : ''}${entry.description}
          ${endLabel}
        </div>
        <div class="entry-type ${entry.type}">${typeLabels[entry.type]}</div>
        <div style="font-size: 12px; color: var(--text-secondary);">${entry.frequency !== 'once' ? freqLabel : '—'}</div>
        <div class="entry-amount ${amountClass}" style="${amountStyle}">
          ${amountPrefix}${formatCurrency(entry.amount)}
        </div>
        <div style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="editEntry(${entry.id})" style="margin-right: 4px;">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="confirmSingleDelete(${entry.id})">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('entriesList').innerHTML = batchActionsHtml + headerHtml + (entriesHtml || '<p style="color: var(--text-muted); padding: 24px; text-align: center;">No items yet. Add your first income or expense above!</p>');
}

function renderChecklist(forecast) {
  const locStatus = forecast.locDrawRequired
    ? `<div class="checklist-item alert-danger">
        <div class="checklist-icon" style="background: var(--accent-coral);">!</div>
        <div class="alert-content">
          <div class="alert-title">Credit line draw may be needed</div>
          <div class="alert-text">Consider drawing ${formatCurrency(forecast.locDrawAmount)} before ${formatDate(forecast.locDrawDate)} to stay positive.</div>
        </div>
      </div>`
    : `<div class="checklist-item alert-success">
        <div class="checklist-icon" style="background: var(--accent-green);">✓</div>
        <div class="alert-content">
          <div class="alert-title">Looking good!</div>
          <div class="alert-text">No credit line draw needed in this forecast period.</div>
        </div>
      </div>`;

  const html = `
    ${locStatus}
    <div class="checklist-item alert-warning">
      <div class="checklist-icon" style="background: var(--accent-amber);">⏱</div>
      <div class="alert-content">
        <div class="alert-title">Keep your records current</div>
        <div class="alert-text">Update daily: bills, sales, and any new expenses. Current data = accurate forecasts.</div>
      </div>
    </div>
    <div class="checklist-item alert-info">
      <div class="checklist-icon" style="background: var(--accent-blue);">👀</div>
      <div class="alert-content">
        <div class="alert-title">You know more than your books</div>
        <div class="alert-text">Add committed expenses here before they hit your accounting system—you have visibility they don't.</div>
      </div>
    </div>
  `;
  document.getElementById('checklistContent').innerHTML = html;
}

// ==================== ACTIONS ====================
function updateSettings() {
  state.currentCash = parseFloat(document.getElementById('currentCash').value) || 0;
  state.locLimit = parseFloat(document.getElementById('locLimit').value) || 0;
  state.locBalance = parseFloat(document.getElementById('locBalance').value) || 0;

  if (!setupComplete) dismissSetup();

  saveState();
  render();
}

function updateMetricsTimeframe() {
  const select = document.getElementById('metricsTimeframe');
  const customRange = document.getElementById('customDateRange');

  if (select.value === 'custom') {
    customRange.style.display = 'flex';
    // Set default custom range if not set
    if (!document.getElementById('metricsStartDate').value) {
      const today = new Date();
      const threeMonthsLater = new Date(today);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
      document.getElementById('metricsStartDate').value = today.toISOString().split('T')[0];
      document.getElementById('metricsEndDate').value = threeMonthsLater.toISOString().split('T')[0];
    }
    updateCustomDateRange();
  } else {
    customRange.style.display = 'none';
    state.metricsTimeframe = parseInt(select.value);
    state.metricsCustomStart = null;
    state.metricsCustomEnd = null;
    saveState();
    render();
  }
}

function updateCustomDateRange() {
  const startDate = document.getElementById('metricsStartDate').value;
  const endDate = document.getElementById('metricsEndDate').value;

  if (startDate && endDate) {
    state.metricsCustomStart = startDate;
    state.metricsCustomEnd = endDate;

    // Calculate days between dates for forecasting
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    state.metricsTimeframe = Math.max(1, days);

    saveState();
    render();
  }
}

function getMetricsTimeframeLabel() {
  const select = document.getElementById('metricsTimeframe');
  if (select.value === 'custom') {
    const start = document.getElementById('metricsStartDate').value;
    const end = document.getElementById('metricsEndDate').value;
    if (start && end) {
      return `${formatDate(start)} – ${formatDate(end)}`;
    }
    return 'Custom';
  }
  return select.options[select.selectedIndex].text;
}

function updateTimelineTimeframe() {
  const select = document.getElementById('timelineTimeframe');
  const customRange = document.getElementById('timelineCustomDateRange');

  if (select.value === 'custom') {
    customRange.style.display = 'flex';
    // Set default custom range if not set
    if (!document.getElementById('timelineStartDate').value) {
      const today = new Date();
      const threeMonthsLater = new Date(today);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
      document.getElementById('timelineStartDate').value = today.toISOString().split('T')[0];
      document.getElementById('timelineEndDate').value = threeMonthsLater.toISOString().split('T')[0];
    }
    updateTimelineCustomDateRange();
  } else {
    customRange.style.display = 'none';
    state.timeRange = parseInt(select.value);
    state.timelineCustomStart = null;
    state.timelineCustomEnd = null;
    saveState();
    render();
  }
}

function updateTimelineCustomDateRange() {
  const startDate = document.getElementById('timelineStartDate').value;
  const endDate = document.getElementById('timelineEndDate').value;

  if (startDate && endDate) {
    state.timelineCustomStart = startDate;
    state.timelineCustomEnd = endDate;

    // Calculate days between dates for forecasting
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    state.timeRange = Math.max(1, days);

    saveState();
    render();
  }
}

function setTableView(view) {
  state.tableView = view;
  document.querySelectorAll('#tableTab .view-toggle-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  renderTableView();
}

function showTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[id$="Tab"]').forEach(t => t.classList.add('hidden'));
  event.target.classList.add('active');
  document.getElementById(tabName + 'Tab').classList.remove('hidden');
}

function toggleAddForm() {
  const form = document.getElementById('addForm');
  if (editingEntryId !== null) {
    cancelEdit();
    return;
  }
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    resetForm();
  }
}

function resetForm() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('newDate').value = today;
  document.getElementById('newDesc').value = '';
  document.getElementById('newType').value = 'expense';
  document.getElementById('newAmount').value = '';
  document.getElementById('newRecurring').value = 'once';
  document.getElementById('endConditionType').value = 'never';
  document.getElementById('endDate').value = '';
  document.getElementById('endOccurrences').value = '';
  document.getElementById('formTitle').textContent = 'Add New Entry';
  document.getElementById('formSubmitBtn').textContent = 'Add to Forecast';
  document.getElementById('cancelEditBtn').classList.add('hidden');
  editingEntryId = null;
  toggleEndCondition();
}

function editEntry(id) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  editingEntryId = id;

  const form = document.getElementById('addForm');
  form.classList.remove('hidden');

  document.getElementById('newDate').value = entry.date;
  document.getElementById('newDesc').value = entry.description;
  document.getElementById('newType').value = entry.type;
  document.getElementById('newAmount').value = entry.amount;
  document.getElementById('newRecurring').value = entry.frequency;

  toggleEndCondition();
  if (entry.frequency !== 'once') {
    if (entry.endDate) {
      document.getElementById('endConditionType').value = 'date';
      toggleEndConditionInputs();
      document.getElementById('endDate').value = entry.endDate;
    } else if (entry.endOccurrences) {
      document.getElementById('endConditionType').value = 'occurrences';
      toggleEndConditionInputs();
      document.getElementById('endOccurrences').value = entry.endOccurrences;
    } else {
      document.getElementById('endConditionType').value = 'never';
      toggleEndConditionInputs();
    }
  }

  document.getElementById('formTitle').textContent = 'Edit Entry';
  document.getElementById('formSubmitBtn').textContent = 'Save Changes';
  document.getElementById('cancelEditBtn').classList.remove('hidden');

  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelEdit() {
  resetForm();
  document.getElementById('addForm').classList.add('hidden');
}

function submitEntry() {
  const date = document.getElementById('newDate').value;
  const desc = document.getElementById('newDesc').value;
  const type = document.getElementById('newType').value;
  const amount = parseFloat(document.getElementById('newAmount').value);
  const frequency = document.getElementById('newRecurring').value;

  if (!date || !desc || !amount) {
    alert('Please fill in all required fields');
    return;
  }

  const entryData = {
    date,
    description: desc,
    type,
    amount,
    frequency
  };

  if (frequency !== 'once') {
    const endCondType = document.getElementById('endConditionType').value;
    if (endCondType === 'date') {
      const endDate = document.getElementById('endDate').value;
      if (endDate) entryData.endDate = endDate;
    } else if (endCondType === 'occurrences') {
      const endOcc = parseInt(document.getElementById('endOccurrences').value);
      if (endOcc > 0) entryData.endOccurrences = endOcc;
    }
  }

  if (editingEntryId !== null) {
    const index = state.entries.findIndex(e => e.id === editingEntryId);
    if (index !== -1) {
      state.entries[index] = { ...entryData, id: editingEntryId };
    }
  } else {
    state.entries.push({ ...entryData, id: Date.now() });
  }

  saveState();
  render();
  resetForm();
  document.getElementById('addForm').classList.add('hidden');
}

function toggleEndCondition() {
  const freq = document.getElementById('newRecurring').value;
  const row = document.getElementById('endConditionRow');
  if (freq === 'once') {
    row.classList.add('hidden');
  } else {
    row.classList.remove('hidden');
    document.getElementById('endConditionType').value = 'never';
    toggleEndConditionInputs();
  }
}

function toggleEndConditionInputs() {
  const condType = document.getElementById('endConditionType').value;
  document.getElementById('endDateGroup').classList.add('hidden');
  document.getElementById('endOccurrencesGroup').classList.add('hidden');

  if (condType === 'date') {
    document.getElementById('endDateGroup').classList.remove('hidden');
  } else if (condType === 'occurrences') {
    document.getElementById('endOccurrencesGroup').classList.remove('hidden');
  }
}

function deleteEntry(id) {
  state.entries = state.entries.filter(e => e.id !== id);
  selectedEntries.delete(id);
  saveState();
  render();
}

function toggleEntrySelection(id) {
  if (selectedEntries.has(id)) {
    selectedEntries.delete(id);
  } else {
    selectedEntries.add(id);
  }
  renderEntries();
}

function toggleSelectAll() {
  const allIds = state.entries.map(e => e.id);
  const allSelected = allIds.every(id => selectedEntries.has(id));

  if (allSelected) {
    selectedEntries.clear();
  } else {
    allIds.forEach(id => selectedEntries.add(id));
  }
  renderEntries();
}

function clearSelection() {
  selectedEntries.clear();
  renderEntries();
}

function confirmSingleDelete(id) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  showConfirmModal(
    'Delete this item?',
    `Are you sure you want to remove "<strong>${entry.description}</strong>"?`,
    () => {
      deleteEntry(id);
      hideConfirmModal();
    }
  );
}

function confirmBatchDelete() {
  const count = selectedEntries.size;
  if (count === 0) return;

  showConfirmModal(
    `Delete ${count} item${count > 1 ? 's' : ''}?`,
    `This will remove <strong>${count} projection item${count > 1 ? 's' : ''}</strong> from your forecast.`,
    () => {
      executeBatchDelete();
      hideConfirmModal();
    }
  );
}

function executeBatchDelete() {
  state.entries = state.entries.filter(e => !selectedEntries.has(e.id));
  selectedEntries.clear();
  saveState();
  render();
}

function showConfirmModal(title, message, onConfirm) {
  const modal = document.createElement('div');
  modal.id = 'confirmModal';
  modal.className = 'confirm-modal';
  modal.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-title">${title}</div>
      <div class="confirm-message">${message}</div>
      <div class="confirm-buttons">
        <button class="btn btn-secondary" onclick="hideConfirmModal()">Cancel</button>
        <button class="btn btn-danger" id="confirmDeleteBtn">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('confirmDeleteBtn').onclick = onConfirm;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideConfirmModal();
  });
}

function hideConfirmModal() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.remove();
}

function checkSetupStatus() {
  setupComplete = localStorage.getItem('cashFlowSetupComplete') === 'true';
  updateSetupUI();
}

function dismissSetup() {
  setupComplete = true;
  localStorage.setItem('cashFlowSetupComplete', 'true');
  updateSetupUI();
}

function onCashInputFocus() {
  if (!setupComplete) dismissSetup();
}

function updateSetupUI() {
  const prompt = document.getElementById('setupPrompt');
  const cashGroup = document.getElementById('currentCashGroup');

  if (setupComplete) {
    prompt.classList.add('hidden');
    cashGroup.classList.remove('input-highlight');
  } else {
    prompt.classList.remove('hidden');
    cashGroup.classList.add('input-highlight');
  }
}

function confirmClearAll() {
  showConfirmModal(
    'Start fresh?',
    'This will remove all your data and reset the app. Make sure to export first if you want to keep anything!',
    () => {
      localStorage.removeItem('cashFlowPlannerState');
      localStorage.removeItem('cashFlowSetupComplete');
      hideConfirmModal();
      location.reload();
    }
  );
}

function analyzeCleanup() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const toDelete = [];
  const toRollForward = [];
  const unchanged = [];

  state.entries.forEach(entry => {
    const entryDate = new Date(entry.date + 'T12:00:00');

    if (entry.frequency === 'once') {
      // One-time: delete if more than 1 month old
      if (entryDate < oneMonthAgo) {
        toDelete.push({ ...entry, reason: 'One-time item over 1 month old' });
      } else {
        unchanged.push(entry);
      }
    } else {
      // Recurring: check if it's still active
      const endDate = entry.endDate ? new Date(entry.endDate + 'T12:00:00') : null;

      // If end date has passed, delete it
      if (endDate && endDate < oneMonthAgo) {
        toDelete.push({ ...entry, reason: 'Recurring item ended over 1 month ago' });
        return;
      }

      // Calculate how many occurrences have happened and the next occurrence date
      let currentDate = new Date(entry.date + 'T12:00:00');
      let occurrenceCount = 0;
      let nextOccurrence = null;

      while (currentDate < today) {
        occurrenceCount++;
        const next = getNextOccurrence(currentDate, entry.frequency);
        if (!next) break;

        // Check if we've exceeded the occurrence limit
        if (entry.endOccurrences && occurrenceCount >= entry.endOccurrences) {
          break;
        }

        // Check if we've passed the end date
        if (endDate && next > endDate) {
          break;
        }

        currentDate = next;
      }

      // Find next occurrence from today or later
      if (currentDate >= today) {
        nextOccurrence = currentDate;
      } else {
        const next = getNextOccurrence(currentDate, entry.frequency);
        if (next && (!endDate || next <= endDate)) {
          if (!entry.endOccurrences || occurrenceCount < entry.endOccurrences) {
            nextOccurrence = next;
            occurrenceCount++;
          }
        }
      }

      // If all occurrences used up or past end date, delete
      if (!nextOccurrence) {
        if (entryDate < oneMonthAgo) {
          toDelete.push({ ...entry, reason: 'Recurring item fully completed' });
        } else {
          unchanged.push(entry);
        }
        return;
      }

      // If entry date is more than 1 month old, roll forward
      if (entryDate < oneMonthAgo) {
        const remainingOccurrences = entry.endOccurrences
          ? entry.endOccurrences - occurrenceCount + 1
          : null;

        toRollForward.push({
          original: { ...entry },
          updated: {
            ...entry,
            date: nextOccurrence.toISOString().split('T')[0],
            endOccurrences: remainingOccurrences
          },
          occurrencesUsed: occurrenceCount - 1
        });
      } else {
        unchanged.push(entry);
      }
    }
  });

  return { toDelete, toRollForward, unchanged };
}

function previewCleanup() {
  const analysis = analyzeCleanup();
  const { toDelete, toRollForward } = analysis;

  const totalChanges = toDelete.length + toRollForward.length;

  if (totalChanges === 0) {
    showCleanupModal(
      '🧹 Nothing to Clean Up',
      'All your projection items are current. No old items to remove or update.',
      null,
      null,
      true
    );
    return;
  }

  // Build delete list HTML
  let deleteHtml = '';
  if (toDelete.length > 0) {
    const deleteItems = toDelete.map(item => `
      <div class="cleanup-item">
        <span class="cleanup-item-name">${item.description}</span>
        <span class="cleanup-item-detail">${formatDate(item.date)} · ${formatCurrency(item.amount)}</span>
      </div>
    `).join('');
    deleteHtml = `
      <div class="cleanup-section">
        <div class="cleanup-section-title">
          🗑️ Will be deleted
          <span class="cleanup-count">${toDelete.length}</span>
        </div>
        <div class="cleanup-list">${deleteItems}</div>
      </div>
    `;
  }

  // Build roll-forward list HTML
  let rollForwardHtml = '';
  if (toRollForward.length > 0) {
    const rollItems = toRollForward.map(item => {
      const occNote = item.original.endOccurrences
        ? ` · ${item.updated.endOccurrences} remaining`
        : '';
      return `
        <div class="cleanup-item">
          <span class="cleanup-item-name">${item.original.description}</span>
          <span class="cleanup-item-detail">${formatDate(item.original.date)} → ${formatDate(item.updated.date)}${occNote}</span>
        </div>
      `;
    }).join('');
    rollForwardHtml = `
      <div class="cleanup-section">
        <div class="cleanup-section-title">
          🔄 Will be updated
          <span class="cleanup-count">${toRollForward.length}</span>
        </div>
        <div class="cleanup-list">${rollItems}</div>
      </div>
    `;
  }

  const summaryHtml = `
    <div class="cleanup-summary">
      <strong>${totalChanges} item${totalChanges !== 1 ? 's' : ''}</strong> will be affected.
      A log file will be downloaded with details of all changes.
    </div>
  `;

  showCleanupModal(
    '🧹 Clean Up Old Items',
    'The following items are over 1 month old and will be cleaned up:',
    summaryHtml + deleteHtml + rollForwardHtml,
    () => executeCleanup(analysis),
    false
  );
}

function showCleanupModal(title, subtitle, content, onConfirm, isEmpty) {
  const modal = document.createElement('div');
  modal.id = 'cleanupModal';
  modal.className = 'cleanup-modal';

  const buttons = isEmpty
    ? `<button class="btn btn-primary" onclick="hideCleanupModal()">OK</button>`
    : `
      <button class="btn btn-secondary" onclick="hideCleanupModal()">Cancel</button>
      <button class="btn btn-primary" id="cleanupConfirmBtn">Clean Up & Download Log</button>
    `;

  modal.innerHTML = `
    <div class="cleanup-dialog">
      <div class="cleanup-title">${title}</div>
      <div class="cleanup-subtitle">${subtitle}</div>
      ${content || ''}
      <div class="confirm-buttons">
        ${buttons}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  if (onConfirm) {
    document.getElementById('cleanupConfirmBtn').onclick = onConfirm;
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideCleanupModal();
  });
}

function hideCleanupModal() {
  const modal = document.getElementById('cleanupModal');
  if (modal) modal.remove();
}

function executeCleanup(analysis) {
  const { toDelete, toRollForward, unchanged } = analysis;
  const timestamp = new Date().toISOString();

  // Generate log content
  let logContent = `CASH FLOW PLANNER - CLEANUP LOG\n`;
  logContent += `Generated: ${new Date().toLocaleString()}\n`;
  logContent += `${'='.repeat(50)}\n\n`;

  if (toDelete.length > 0) {
    logContent += `DELETED ITEMS (${toDelete.length})\n`;
    logContent += `${'-'.repeat(30)}\n`;
    toDelete.forEach(item => {
      logContent += `• ${item.description}\n`;
      logContent += `  Date: ${item.date}\n`;
      logContent += `  Type: ${item.type}\n`;
      logContent += `  Amount: ${formatCurrency(item.amount)}\n`;
      logContent += `  Frequency: ${frequencyLabels[item.frequency] || item.frequency}\n`;
      if (item.endDate) logContent += `  End Date: ${item.endDate}\n`;
      if (item.endOccurrences) logContent += `  Occurrences: ${item.endOccurrences}\n`;
      logContent += `  Reason: ${item.reason}\n\n`;
    });
  }

  if (toRollForward.length > 0) {
    logContent += `UPDATED ITEMS (${toRollForward.length})\n`;
    logContent += `${'-'.repeat(30)}\n`;
    toRollForward.forEach(item => {
      logContent += `• ${item.original.description}\n`;
      logContent += `  Previous Start: ${item.original.date}\n`;
      logContent += `  New Start: ${item.updated.date}\n`;
      logContent += `  Type: ${item.original.type}\n`;
      logContent += `  Amount: ${formatCurrency(item.original.amount)}\n`;
      logContent += `  Frequency: ${frequencyLabels[item.original.frequency] || item.original.frequency}\n`;
      if (item.original.endOccurrences) {
        logContent += `  Original Occurrences: ${item.original.endOccurrences}\n`;
        logContent += `  Remaining Occurrences: ${item.updated.endOccurrences}\n`;
      }
      logContent += `  Past Occurrences Cleared: ${item.occurrencesUsed}\n\n`;
    });
  }

  logContent += `\nSUMMARY\n`;
  logContent += `${'-'.repeat(30)}\n`;
  logContent += `Items deleted: ${toDelete.length}\n`;
  logContent += `Items updated: ${toRollForward.length}\n`;
  logContent += `Items unchanged: ${unchanged.length}\n`;

  // Download log file
  const blob = new Blob([logContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cleanup-log-${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  // Apply changes
  const deletedIds = new Set(toDelete.map(e => e.id));
  const rollForwardMap = new Map(toRollForward.map(e => [e.original.id, e.updated]));

  state.entries = state.entries
    .filter(e => !deletedIds.has(e.id))
    .map(e => rollForwardMap.get(e.id) || e);

  saveState();
  render();
  hideCleanupModal();
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', function() {
  loadState();
  checkSetupStatus();
  render();
});
