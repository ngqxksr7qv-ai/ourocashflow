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
  syncFilters: false,
  timelineViewMode: 'grouped', // 'grouped' | 'expanded'
  tableView: 'monthly',
  timelineItemsPerPage: 50,
  timelineCurrentPage: 1,
  entriesItemsPerPage: 50,
  entriesCurrentPage: 1,
  entriesSearchTerm: '',
  entryDisplayMode: 'grouped', // 'grouped' | 'date_sorted'
  timelineViewMode: 'grouped', // 'grouped' | 'expanded'
  showTimelineNotes: false,
  // Scenario planning support
  activeScenarioId: 'base',
  scenarios: [
    {
      id: 'base',
      name: 'Base Scenario',
      isBase: true,
      entries: [
        { id: 1, date: '2026-01-02', description: 'Daily Sales', type: 'revenue', amount: 1200, frequency: 'daily' },
        { id: 2, date: '2026-01-05', description: 'Inventory Restock', type: 'expense', amount: 8500, frequency: 'once' },
        { id: 3, date: '2026-01-10', description: 'Payroll', type: 'expense', amount: 6200, frequency: 'every2weeks' },
        { id: 4, date: '2026-01-15', description: 'Rent', type: 'expense', amount: 4500, frequency: 'monthly' },
        { id: 5, date: '2026-01-15', description: 'Utilities', type: 'expense', amount: 850, frequency: 'monthly' },
        { id: 6, date: '2026-01-20', description: 'Debt Payment', type: 'expense', amount: 2200, frequency: 'monthly' },
      ]
    }
  ],
  // Legacy entries field - kept for backwards compatibility during migration
  entries: []
};

let editingEntryId = null;
let selectedEntries = new Set();
let setupComplete = false;
let hasUnsavedChanges = false;

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

// ==================== SCENARIO HELPERS ====================

// Get the active scenario object
function getActiveScenario() {
  return state.scenarios.find(s => s.id === state.activeScenarioId) || state.scenarios[0];
}

// Get entries for the active scenario (used throughout the app)
function getActiveEntries() {
  const scenario = getActiveScenario();
  return scenario ? scenario.entries : [];
}

// Set entries for the active scenario
function setActiveEntries(entries) {
  const scenario = getActiveScenario();
  if (scenario) {
    scenario.entries = entries;
  }
}

// Check if we're viewing an alternative (non-base) scenario
function isAlternativeScenario() {
  return state.activeScenarioId !== 'base';
}

// Generate a unique scenario ID
function generateScenarioId() {
  return 'scenario-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Get the next entry ID for the current scenario
function getNextEntryId() {
  const entries = getActiveEntries();
  if (entries.length === 0) return 1;
  return Math.max(...entries.map(e => e.id)) + 1;
}

// Switch to a different scenario
function switchScenario(scenarioId) {
  const scenario = state.scenarios.find(s => s.id === scenarioId);
  if (scenario) {
    state.activeScenarioId = scenarioId;
    state.entriesCurrentPage = 1;
    state.timelineCurrentPage = 1;
    saveState();
    render();
    renderScenarioSelector();
    updateScenarioBanners();
  }
}

// Create a new scenario
function createScenario(name, duplicateBase = true) {
  const newId = generateScenarioId();
  let entries = [];

  if (duplicateBase) {
    // Deep clone entries from the base scenario
    const baseScenario = state.scenarios.find(s => s.id === 'base');
    if (baseScenario && baseScenario.entries) {
      entries = JSON.parse(JSON.stringify(baseScenario.entries));
    }
  }

  const newScenario = {
    id: newId,
    name: name,
    isBase: false,
    entries: entries
  };

  state.scenarios.push(newScenario);
  state.activeScenarioId = newId;
  saveState();
  render();
  renderScenarioSelector();
  updateScenarioBanners();

  return newScenario;
}

// Rename a scenario
function renameScenario(scenarioId, newName) {
  const scenario = state.scenarios.find(s => s.id === scenarioId);
  if (scenario && !scenario.isBase) {
    scenario.name = newName;
    saveState();
    renderScenarioSelector();
  }
}

// Delete a scenario
function deleteScenario(scenarioId) {
  const scenario = state.scenarios.find(s => s.id === scenarioId);
  if (!scenario || scenario.isBase) return; // Can't delete base scenario

  // Remove the scenario
  state.scenarios = state.scenarios.filter(s => s.id !== scenarioId);

  // If we deleted the active scenario, switch to base
  if (state.activeScenarioId === scenarioId) {
    state.activeScenarioId = 'base';
  }

  saveState();
  render();
  renderScenarioSelector();
  updateScenarioBanners();
}

// Render the scenario selector dropdown
function renderScenarioSelector() {
  const container = document.getElementById('scenarioSelectorContainer');
  if (!container) return;

  const activeScenario = getActiveScenario();
  const isAlt = isAlternativeScenario();

  const scenarioOptions = state.scenarios.map(s =>
    `<option value="${s.id}" ${s.id === state.activeScenarioId ? 'selected' : ''}>${s.name}</option>`
  ).join('');

  container.innerHTML = `
    <div class="scenario-selector ${isAlt ? 'scenario-alt-active' : ''}">
      <div class="scenario-selector-label">
        <span class="scenario-icon">${isAlt ? '🔮' : '📊'}</span>
        <span>Scenario:</span>
      </div>
      <select id="scenarioDropdown" onchange="switchScenario(this.value)">
        ${scenarioOptions}
      </select>
      <button class="btn btn-sm btn-secondary scenario-new-btn" onclick="showCreateScenarioModal()">+ New</button>
      ${isAlt ? `
        <button class="btn btn-sm btn-secondary scenario-edit-btn" onclick="showEditScenarioModal()">Edit</button>
      ` : ''}
    </div>
  `;
}

// Show the create scenario modal
function showCreateScenarioModal() {
  const modal = document.createElement('div');
  modal.id = 'scenarioModal';
  modal.className = 'scenario-modal';

  modal.innerHTML = `
    <div class="scenario-dialog">
      <div class="scenario-dialog-title">Create New Scenario</div>
      <div class="scenario-dialog-desc">
        Scenarios let you explore "what-if" situations without affecting your base forecast.
      </div>
      <div class="input-group" style="margin-bottom: 16px;">
        <label>Scenario Name</label>
        <input type="text" class="input" id="newScenarioName" placeholder="e.g., New Hire, Expansion Plan" autofocus>
      </div>
      <div class="scenario-options">
        <div class="scenario-option selected" onclick="selectScenarioOption(this, 'duplicate')">
          <div class="scenario-option-radio"></div>
          <div class="scenario-option-content">
            <div class="scenario-option-title">Start from Base (Recommended)</div>
            <div class="scenario-option-desc">Copy all projection items from your Base Scenario as a starting point.</div>
          </div>
        </div>
        <div class="scenario-option" onclick="selectScenarioOption(this, 'blank')">
          <div class="scenario-option-radio"></div>
          <div class="scenario-option-content">
            <div class="scenario-option-title">Start Blank</div>
            <div class="scenario-option-desc">Begin with no projection items. Not recommended for most use cases.</div>
          </div>
        </div>
      </div>
      <div id="blankScenarioWarning" class="scenario-warning hidden">
        <span class="scenario-warning-icon">⚠️</span>
        <span>A blank scenario won't show meaningful forecasts until you add projection items.</span>
      </div>
      <div class="confirm-buttons">
        <button class="btn btn-secondary" onclick="hideScenarioModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmCreateScenario()">Create Scenario</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById('newScenarioName').focus();

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideScenarioModal();
  });

  // Store selected option
  modal.dataset.option = 'duplicate';
}

// Select scenario creation option
function selectScenarioOption(element, option) {
  document.querySelectorAll('.scenario-option').forEach(el => el.classList.remove('selected'));
  element.classList.add('selected');

  const modal = document.getElementById('scenarioModal');
  if (modal) modal.dataset.option = option;

  const warning = document.getElementById('blankScenarioWarning');
  if (warning) {
    warning.classList.toggle('hidden', option !== 'blank');
  }
}

// Confirm and create the scenario
function confirmCreateScenario() {
  const nameInput = document.getElementById('newScenarioName');
  const name = nameInput.value.trim();

  if (!name) {
    nameInput.style.borderColor = 'var(--accent-coral)';
    nameInput.focus();
    return;
  }

  const modal = document.getElementById('scenarioModal');
  const duplicateBase = modal.dataset.option !== 'blank';

  createScenario(name, duplicateBase);
  hideScenarioModal();
}

// Show the edit scenario modal
function showEditScenarioModal() {
  const scenario = getActiveScenario();
  if (!scenario || scenario.isBase) return;

  const modal = document.createElement('div');
  modal.id = 'scenarioModal';
  modal.className = 'scenario-modal';

  modal.innerHTML = `
    <div class="scenario-dialog">
      <div class="scenario-dialog-title">Edit Scenario</div>
      <div class="input-group" style="margin-bottom: 20px;">
        <label>Scenario Name</label>
        <input type="text" class="input" id="editScenarioName" value="${scenario.name}">
      </div>
      <div class="scenario-edit-actions">
        <button class="btn btn-danger" onclick="confirmDeleteScenario('${scenario.id}')">Delete Scenario</button>
      </div>
      <div class="confirm-buttons">
        <button class="btn btn-secondary" onclick="hideScenarioModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmRenameScenario('${scenario.id}')">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById('editScenarioName').focus();

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideScenarioModal();
  });
}

// Confirm rename
function confirmRenameScenario(scenarioId) {
  const nameInput = document.getElementById('editScenarioName');
  const name = nameInput.value.trim();

  if (!name) {
    nameInput.style.borderColor = 'var(--accent-coral)';
    nameInput.focus();
    return;
  }

  renameScenario(scenarioId, name);
  hideScenarioModal();
}

// Confirm delete scenario
function confirmDeleteScenario(scenarioId) {
  const scenario = state.scenarios.find(s => s.id === scenarioId);
  if (!scenario) return;

  hideScenarioModal();

  showConfirmModal(
    'Delete Scenario?',
    `Are you sure you want to delete "${scenario.name}"? This will remove all projection items in this scenario. This action cannot be undone.`,
    () => {
      deleteScenario(scenarioId);
      hideConfirmModal();
    }
  );
}

// Hide scenario modal
function hideScenarioModal() {
  const modal = document.getElementById('scenarioModal');
  if (modal) modal.remove();
}

// Update scenario warning banners
function updateScenarioBanners() {
  const dashboardBanner = document.getElementById('scenarioWarningBanner');
  const dashboardIndicator = document.getElementById('dashboardScenarioIndicator');
  const dashboardScenarioName = document.getElementById('dashboardScenarioName');
  const isAlt = isAlternativeScenario();
  const scenario = getActiveScenario();

  // Update main warning banner
  if (dashboardBanner) {
    if (isAlt && scenario) {
      dashboardBanner.classList.remove('hidden');
      dashboardBanner.querySelector('.scenario-banner-name').textContent = scenario.name;
    } else {
      dashboardBanner.classList.add('hidden');
    }
  }

  // Update dashboard title indicator
  if (dashboardIndicator && dashboardScenarioName) {
    if (isAlt && scenario) {
      dashboardIndicator.classList.remove('hidden');
      dashboardScenarioName.textContent = scenario.name;
    } else {
      dashboardIndicator.classList.add('hidden');
    }
  }
}

// Migrate legacy state (entries array) to scenarios format
function migrateToScenarios() {
  // Check if we already have scenarios properly set up
  if (state.scenarios && state.scenarios.length > 0 && state.scenarios[0].entries) {
    // Already migrated, just ensure entries references active scenario
    return;
  }

  // Check if we have legacy entries to migrate
  if (state.entries && state.entries.length > 0 && (!state.scenarios || state.scenarios.length === 0 || !state.scenarios[0].entries || state.scenarios[0].entries.length === 0)) {
    // Migrate: create base scenario with existing entries
    state.scenarios = [
      {
        id: 'base',
        name: 'Base Scenario',
        isBase: true,
        entries: JSON.parse(JSON.stringify(state.entries))
      }
    ];
    state.activeScenarioId = 'base';
    // Clear legacy entries
    state.entries = [];
    saveState();
  }

  // Ensure we have at least the base scenario
  if (!state.scenarios || state.scenarios.length === 0) {
    state.scenarios = [
      {
        id: 'base',
        name: 'Base Scenario',
        isBase: true,
        entries: []
      }
    ];
    state.activeScenarioId = 'base';
  }
}

// ==================== CALCULATED ENTRY HELPERS ====================

// Check if an entry is a calculated entry
function isCalculatedEntry(entry) {
  return entry.calculationType && !entry.manualOverride;
}

// Check if an entry has calculation config (even if overridden)
function hasCalculationConfig(entry) {
  return !!entry.calculationType;
}

// Get source entries for a calculated entry
function getSourceEntries(entry) {
  if (!entry.calculationType) return [];

  const entries = getActiveEntries();
  if (entry.sourceMode === 'all_of_type' && entry.sourceType) {
    return entries.filter(e =>
      e.type === entry.sourceType && !hasCalculationConfig(e)
    );
  }

  if (entry.sourceEntryIds && entry.sourceEntryIds.length > 0) {
    return entries.filter(e => entry.sourceEntryIds.includes(e.id));
  }

  return [];
}

// Get entries that can be used as sources (non-calculated entries only)
function getAvailableSourceEntries(excludeId = null) {
  return getActiveEntries().filter(e =>
    !hasCalculationConfig(e) && e.id !== excludeId
  );
}

// Validate a calculated entry's source references
function validateCalculatedEntry(entry) {
  const errors = [];

  if (!entry.calculationType) return errors;

  // Must have source configuration
  if (entry.sourceMode === 'all_of_type') {
    if (!entry.sourceType) {
      errors.push('Please select a type to calculate from');
    }
  } else {
    if (!entry.sourceEntryIds || entry.sourceEntryIds.length === 0) {
      errors.push('Please select at least one source item');
    } else {
      // Check if all sources still exist
      const sourceEntries = getSourceEntries(entry);
      if (sourceEntries.length === 0) {
        errors.push('Source item(s) no longer exist');
      } else if (sourceEntries.length < entry.sourceEntryIds.length) {
        errors.push('Some source items no longer exist');
      }

      // Check for calculated sources (not allowed)
      const calculatedSources = sourceEntries.filter(e => hasCalculationConfig(e));
      if (calculatedSources.length > 0) {
        errors.push('Cannot calculate from another calculated item');
      }
    }
  }

  // Must have calculation value
  if (!entry.calculationValue || entry.calculationValue <= 0) {
    errors.push('Please enter a valid calculation value');
  }

  return errors;
}

// Check if an entry has orphaned source references
function hasOrphanedSources(entry) {
  if (!entry.calculationType || entry.sourceMode === 'all_of_type') return false;
  if (!entry.sourceEntryIds || entry.sourceEntryIds.length === 0) return true;

  const existingIds = new Set(getActiveEntries().map(e => e.id));
  return entry.sourceEntryIds.some(id => !existingIds.has(id));
}

// Get description of calculation for display
function getCalculationDescription(entry) {
  if (!entry.calculationType) return '';

  const sources = getSourceEntries(entry);
  let sourceDesc = '';

  if (entry.sourceMode === 'all_of_type') {
    const typeLabels = {
      'revenue': 'all income',
      'expense': 'all expenses',
      'loc_draw': 'all LOC draws',
      'loc_paydown': 'all LOC paydowns'
    };
    sourceDesc = typeLabels[entry.sourceType] || entry.sourceType;
  } else if (sources.length === 1) {
    sourceDesc = `"${sources[0].description}"`;
  } else if (sources.length > 1) {
    sourceDesc = `${sources.length} items`;
  } else {
    sourceDesc = 'missing source';
  }

  if (entry.calculationType === 'percentage') {
    return `${entry.calculationValue}% of ${sourceDesc}`;
  } else if (entry.calculationType === 'fixed') {
    return `${formatCurrency(entry.calculationValue)} per occurrence of ${sourceDesc}`;
  } else if (entry.calculationType === 'balance_percentage') {
    return `${entry.calculationValue}% APR on LOC balance`;
  }

  return '';
}

// ==================== PERSISTENCE ====================
function saveState() {
  localStorage.setItem('cashFlowPlannerState', JSON.stringify(state));
}

// ==================== UNSAVED CHANGES TRACKING ====================

function markUnsavedChanges() {
  hasUnsavedChanges = true;
  updateUnsavedIndicator();
}

function clearUnsavedChanges() {
  hasUnsavedChanges = false;
  updateUnsavedIndicator();
}

function updateUnsavedIndicator() {
  const indicator = document.getElementById('unsavedChangesIndicator');
  const exportReminder = document.querySelector('.export-reminder');

  if (indicator) {
    if (hasUnsavedChanges) {
      indicator.classList.remove('hidden');
      if (exportReminder) {
        exportReminder.classList.add('has-unsaved-changes');
      }
    } else {
      indicator.classList.add('hidden');
      if (exportReminder) {
        exportReminder.classList.remove('has-unsaved-changes');
      }
    }
  }
}

// Warn user before leaving with unsaved changes
window.addEventListener('beforeunload', function(e) {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

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

    // Restore sync filters checkbox
    if (state.syncFilters) {
      document.getElementById('syncFiltersCheckbox').checked = true;
    }

    // Restore timeline view mode
    if (state.timelineViewMode) {
      document.getElementById('timelineViewMode').value = state.timelineViewMode;
    }
  }
}

function exportData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Include date and time in filename (format: cashflow-YYYY-MM-DD-HHmmss_UTC-X.json)
  // Use local time with UTC offset for clarity when comparing backups across timezones
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  // Get UTC offset (getTimezoneOffset returns minutes with inverted sign)
  const offsetMinutes = now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetSign = offsetMinutes > 0 ? '-' : '+';
  const timestamp = `${year}-${month}-${day}-${hours}${minutes}${seconds}_UTC${offsetSign}${offsetHours}`;
  a.download = 'cashflow-' + timestamp + '.json';
  a.click();
  URL.revokeObjectURL(url);
  clearUnsavedChanges();
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

// Expand a single non-calculated entry into its occurrences
function expandSingleEntry(entry, startDate, endDate) {
  const expanded = [];

  if (entry.frequency === 'once') {
    const entryDate = new Date(entry.date + 'T12:00:00');
    if (entryDate >= startDate && entryDate <= endDate) {
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

      if (currentDate >= startDate) {
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

  return expanded;
}

// Calculate the amount for a calculated entry based on source occurrences
function calculateEntryAmount(calcEntry, sourceOccurrences, periodStart, periodEnd) {
  if (calcEntry.manualOverride && calcEntry.amount !== null) {
    return calcEntry.amount;
  }

  if (calcEntry.calculationType === 'percentage') {
    const total = sourceOccurrences.reduce((sum, occ) => sum + occ.amount, 0);
    return Math.round(total * (calcEntry.calculationValue / 100) * 100) / 100;
  } else if (calcEntry.calculationType === 'fixed') {
    return Math.round(sourceOccurrences.length * calcEntry.calculationValue * 100) / 100;
  }

  return 0;
}

// Get the display amount for a calculated entry in the Projection Items list
// This computes a representative amount based on source entries' base amounts
function getCalculatedDisplayAmount(calcEntry) {
  if (calcEntry.manualOverride && calcEntry.amount !== null) {
    return calcEntry.amount;
  }

  if (!calcEntry.calculationType) return 0;

  // Get source entries
  const entries = getActiveEntries();
  let sourceEntries = [];

  if (calcEntry.sourceMode === 'all_of_type') {
    sourceEntries = entries.filter(e => e.type === calcEntry.sourceType && !hasCalculationConfig(e));
  } else if (calcEntry.sourceEntryIds && calcEntry.sourceEntryIds.length > 0) {
    sourceEntries = entries.filter(e => calcEntry.sourceEntryIds.includes(e.id));
  }

  if (sourceEntries.length === 0) return 0;

  if (calcEntry.calculationType === 'percentage') {
    // Sum of source entries' base amounts * percentage
    const total = sourceEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    return Math.round(total * (calcEntry.calculationValue / 100) * 100) / 100;
  } else if (calcEntry.calculationType === 'fixed') {
    // Fixed amount per source entry
    return Math.round(sourceEntries.length * calcEntry.calculationValue * 100) / 100;
  } else if (calcEntry.calculationType === 'balance_percentage') {
    // For LOC interest, show estimated monthly interest on current balance
    const monthlyRate = (calcEntry.calculationValue || 0) / 100 / 12;
    return Math.round(state.locBalance * monthlyRate * 100) / 100;
  }

  return 0;
}

// Get source occurrences for a date based on the source period setting
function getSourceOccurrencesForDate(calcEntry, baseExpanded, targetDate, startDate, endDate) {
  const entries = getActiveEntries();
  const sourceEntryIds = calcEntry.sourceMode === 'all_of_type'
    ? entries.filter(e => e.type === calcEntry.sourceType && !hasCalculationConfig(e)).map(e => e.id)
    : (calcEntry.sourceEntryIds || []);

  const targetDateObj = new Date(targetDate + 'T12:00:00');
  let periodStart, periodEnd;

  switch (calcEntry.sourcePeriod || 'same_day') {
    case 'same_day':
      periodStart = periodEnd = targetDate;
      break;

    case 'same_week':
      const weekStart = new Date(targetDateObj);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      periodStart = weekStart.toISOString().split('T')[0];
      periodEnd = weekEnd.toISOString().split('T')[0];
      break;

    case 'same_month':
      const monthStart = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), 1);
      const monthEnd = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth() + 1, 0);
      periodStart = monthStart.toISOString().split('T')[0];
      periodEnd = monthEnd.toISOString().split('T')[0];
      break;

    case 'rolling_days':
      const days = calcEntry.sourcePeriodDays || 30;
      const rollStart = new Date(targetDateObj);
      rollStart.setDate(rollStart.getDate() - days);
      periodStart = rollStart.toISOString().split('T')[0];
      periodEnd = targetDate;
      break;

    default:
      periodStart = periodEnd = targetDate;
  }

  return baseExpanded.filter(occ =>
    sourceEntryIds.includes(occ.originalId) &&
    occ.date >= periodStart &&
    occ.date <= periodEnd
  );
}

// Expand LOC interest entries (balance_percentage type)
function expandLOCInterestEntry(calcEntry, baseExpanded, startDate, endDate) {
  const expanded = [];

  if (calcEntry.manualOverride && calcEntry.amount !== null) {
    // If manually overridden, create a single entry on the start date
    expanded.push({
      ...calcEntry,
      date: startDate.toISOString().split('T')[0],
      originalId: calcEntry.id,
      id: calcEntry.id + '-' + startDate.toISOString().split('T')[0]
    });
    return expanded;
  }

  const period = calcEntry.sourcePeriod || 'same_month';
  const periodTiming = calcEntry.periodTiming || 'end';
  const locBalanceType = calcEntry.locBalanceType || 'average';
  const apr = calcEntry.calculationValue || 0;

  // Calculate LOC balance changes from base expanded entries
  function getLOCBalanceAtDate(targetDate, baseExpanded) {
    let balance = state.locBalance;
    const targetStr = targetDate.toISOString().split('T')[0];

    baseExpanded.forEach(entry => {
      if (entry.date <= targetStr) {
        if (entry.type === 'loc_draw') {
          balance += entry.amount;
        } else if (entry.type === 'loc_paydown') {
          balance -= entry.amount;
        }
      }
    });

    return Math.max(0, balance); // No negative interest
  }

  // Get period boundaries within the forecast range
  const periods = [];
  let current = new Date(startDate);

  if (period === 'same_month') {
    // Move to first day of month
    current.setDate(1);
    while (current <= endDate) {
      const monthStart = new Date(current);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

      if (monthEnd >= startDate && monthStart <= endDate) {
        const entryDate = periodTiming === 'end' ? monthEnd : monthStart;
        if (entryDate >= startDate && entryDate <= endDate) {
          periods.push({
            start: monthStart,
            end: monthEnd,
            entryDate: entryDate,
            daysInPeriod: monthEnd.getDate()
          });
        }
      }
      current.setMonth(current.getMonth() + 1);
    }
  } else if (period === 'same_week') {
    // Move to Sunday
    current.setDate(current.getDate() - current.getDay());
    while (current <= endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);

      if (weekEnd >= startDate && weekStart <= endDate) {
        const entryDate = periodTiming === 'end' ? weekEnd : weekStart;
        if (entryDate >= startDate && entryDate <= endDate) {
          periods.push({
            start: weekStart,
            end: weekEnd,
            entryDate: entryDate,
            daysInPeriod: 7
          });
        }
      }
      current.setDate(current.getDate() + 7);
    }
  }

  // Calculate interest for each period
  periods.forEach(p => {
    let periodBalance;

    if (locBalanceType === 'average') {
      // Calculate average daily balance for the period
      let totalBalance = 0;
      let daysCounted = 0;
      const checkDate = new Date(p.start);

      while (checkDate <= p.end && checkDate <= endDate) {
        if (checkDate >= startDate) {
          totalBalance += getLOCBalanceAtDate(checkDate, baseExpanded);
          daysCounted++;
        }
        checkDate.setDate(checkDate.getDate() + 1);
      }

      periodBalance = daysCounted > 0 ? totalBalance / daysCounted : 0;
    } else {
      // Use balance at end of period
      periodBalance = getLOCBalanceAtDate(p.end, baseExpanded);
    }

    // No interest if balance is zero or negative
    if (periodBalance <= 0) return;

    // Convert APR to period rate
    let periodRate;
    if (period === 'same_month') {
      periodRate = apr / 12 / 100; // Monthly rate
    } else if (period === 'same_week') {
      periodRate = apr / 52 / 100; // Weekly rate
    } else {
      periodRate = apr / 365 / 100 * p.daysInPeriod; // Daily rate * days
    }

    const interestAmount = Math.round(periodBalance * periodRate * 100) / 100;

    if (interestAmount > 0) {
      const dateStr = p.entryDate.toISOString().split('T')[0];
      expanded.push({
        ...calcEntry,
        date: dateStr,
        amount: interestAmount,
        originalId: calcEntry.id,
        id: calcEntry.id + '-' + dateStr,
        calculatedFrom: ['loc_balance'],
        sourceAmount: periodBalance,
        periodRate: periodRate,
        apr: apr
      });
    }
  });

  return expanded;
}

// Expand schedule-driven calculated entries based on entry's own frequency
function expandScheduleDrivenCalculatedEntry(calcEntry, baseExpanded, startDate, endDate, sourceEntryIds) {
  const expanded = [];
  const sourcePeriod = calcEntry.sourcePeriod || 'previous_month';

  // First, expand the entry based on its own frequency (like a regular entry)
  let currentDate = new Date(calcEntry.date + 'T12:00:00');
  let occurrenceCount = 0;
  const maxOccurrences = calcEntry.endOccurrences || Infinity;
  const endByDate = calcEntry.endDate ? new Date(calcEntry.endDate + 'T12:00:00') : null;
  const frequency = calcEntry.frequency || 'monthly';

  // For one-time entries, just create one occurrence
  if (frequency === 'once') {
    if (currentDate >= startDate && currentDate <= endDate) {
      const sourceOccurrences = getSourceOccurrencesForScheduledDate(
        calcEntry, baseExpanded, currentDate, sourceEntryIds, sourcePeriod
      );

      if (sourceOccurrences.length > 0) {
        const amount = calculateEntryAmount(calcEntry, sourceOccurrences, null, null);
        expanded.push({
          ...calcEntry,
          date: currentDate.toISOString().split('T')[0],
          amount: amount,
          originalId: calcEntry.id,
          id: calcEntry.id + '-' + currentDate.toISOString(),
          calculatedFrom: sourceOccurrences.map(o => o.originalId),
          sourceAmount: sourceOccurrences.reduce((sum, o) => sum + o.amount, 0)
        });
      }
    }
    return expanded;
  }

  // For recurring entries, expand based on frequency
  while (currentDate <= endDate) {
    if (endByDate && currentDate > endByDate) break;
    if (occurrenceCount >= maxOccurrences) break;

    if (currentDate >= startDate) {
      // Get source occurrences for the lookback period
      const sourceOccurrences = getSourceOccurrencesForScheduledDate(
        calcEntry, baseExpanded, currentDate, sourceEntryIds, sourcePeriod
      );

      // Only create entry if there are source occurrences (or allow zero for schedule-driven)
      const amount = calculateEntryAmount(calcEntry, sourceOccurrences, null, null);

      expanded.push({
        ...calcEntry,
        date: currentDate.toISOString().split('T')[0],
        amount: amount,
        originalId: calcEntry.id,
        id: calcEntry.id + '-' + currentDate.toISOString(),
        calculatedFrom: sourceOccurrences.map(o => o.originalId),
        sourceAmount: sourceOccurrences.reduce((sum, o) => sum + o.amount, 0)
      });
    }

    occurrenceCount++;
    const nextDate = getNextOccurrence(currentDate, frequency);
    if (!nextDate) break;
    currentDate = nextDate;
  }

  return expanded;
}

// Get source occurrences for a schedule-driven calculated entry
function getSourceOccurrencesForScheduledDate(calcEntry, baseExpanded, occurrenceDate, sourceEntryIds, sourcePeriod) {
  const sourceOccurrences = [];
  const sourcePeriodDays = calcEntry.sourcePeriodDays || 30;

  // Calculate the lookback period based on sourcePeriod
  let periodStart, periodEnd;

  if (sourcePeriod === 'previous_month') {
    // Previous calendar month
    periodEnd = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), 0); // Last day of previous month
    periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1); // First day of previous month
  } else if (sourcePeriod === 'previous_week') {
    // Previous calendar week (Sun-Sat)
    const dayOfWeek = occurrenceDate.getDay();
    periodEnd = new Date(occurrenceDate);
    periodEnd.setDate(occurrenceDate.getDate() - dayOfWeek - 1); // Last Saturday
    periodStart = new Date(periodEnd);
    periodStart.setDate(periodEnd.getDate() - 6); // Previous Sunday
  } else if (sourcePeriod === 'same_month') {
    // Current month up to occurrence date
    periodStart = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), 1);
    periodEnd = new Date(occurrenceDate);
  } else if (sourcePeriod === 'same_week') {
    // Current week up to occurrence date (Sun-Sat)
    const dayOfWeek = occurrenceDate.getDay();
    periodStart = new Date(occurrenceDate);
    periodStart.setDate(occurrenceDate.getDate() - dayOfWeek); // This Sunday
    periodEnd = new Date(occurrenceDate);
  } else if (sourcePeriod === 'rolling_days') {
    // Rolling N days lookback
    periodEnd = new Date(occurrenceDate);
    periodStart = new Date(occurrenceDate);
    periodStart.setDate(occurrenceDate.getDate() - sourcePeriodDays);
  } else {
    // Default to previous month
    periodEnd = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), 0);
    periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
  }

  // Normalize times for comparison
  periodStart.setHours(0, 0, 0, 0);
  periodEnd.setHours(23, 59, 59, 999);

  // Find all source occurrences within the period
  baseExpanded.forEach(occ => {
    if (!sourceEntryIds.includes(occ.originalId)) return;

    const occDate = new Date(occ.date + 'T12:00:00');
    if (occDate >= periodStart && occDate <= periodEnd) {
      sourceOccurrences.push(occ);
    }
  });

  return sourceOccurrences;
}

// Expand calculated entries based on their source occurrences
function expandCalculatedEntry(calcEntry, baseExpanded, startDate, endDate) {
  const expanded = [];

  // Handle LOC interest separately
  if (calcEntry.calculationType === 'balance_percentage') {
    return expandLOCInterestEntry(calcEntry, baseExpanded, startDate, endDate);
  }

  // Skip if entry has orphaned sources or validation errors
  if (hasOrphanedSources(calcEntry)) return expanded;
  const errors = validateCalculatedEntry(calcEntry);
  if (errors.length > 0) return expanded;

  // Get all source entry IDs
  const entries = getActiveEntries();
  const sourceEntryIds = calcEntry.sourceMode === 'all_of_type'
    ? entries.filter(e => e.type === calcEntry.sourceType && !hasCalculationConfig(e)).map(e => e.id)
    : (calcEntry.sourceEntryIds || []);

  const sourcePeriod = calcEntry.sourcePeriod || 'same_day';
  const dateOffset = calcEntry.dateOffset || 0;
  const timingMode = calcEntry.timingMode || 'source_driven';

  // Handle schedule-driven timing: expand based on entry's own frequency
  if (timingMode === 'schedule_driven') {
    return expandScheduleDrivenCalculatedEntry(calcEntry, baseExpanded, startDate, endDate, sourceEntryIds);
  }

  // For same_month and same_week, create ONE entry per period at the end of the period
  if (sourcePeriod === 'same_month' || sourcePeriod === 'same_week') {
    // Find all periods that have source occurrences
    const periodsWithSources = new Map(); // key: period identifier, value: { periodEnd, sourceOccurrences }

    baseExpanded.forEach(occ => {
      if (!sourceEntryIds.includes(occ.originalId)) return;

      const occDate = new Date(occ.date + 'T12:00:00');
      let periodKey, periodEnd;

      if (sourcePeriod === 'same_month') {
        periodKey = `${occDate.getFullYear()}-${occDate.getMonth()}`;
        periodEnd = new Date(occDate.getFullYear(), occDate.getMonth() + 1, 0);
      } else { // same_week
        // Get the Sunday of this week as the period key
        const weekStart = new Date(occDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
        periodEnd = new Date(weekStart);
        periodEnd.setDate(periodEnd.getDate() + 6);
      }

      if (!periodsWithSources.has(periodKey)) {
        periodsWithSources.set(periodKey, { periodEnd, sourceOccurrences: [] });
      }
      periodsWithSources.get(periodKey).sourceOccurrences.push(occ);
    });

    // Create one entry per period at the period end (plus offset)
    periodsWithSources.forEach(({ periodEnd, sourceOccurrences }) => {
      // Apply date offset to the period end date
      const entryDate = new Date(periodEnd);
      entryDate.setDate(entryDate.getDate() + dateOffset);
      const entryDateStr = entryDate.toISOString().split('T')[0];

      // Only include if within forecast range
      if (entryDate < startDate || entryDate > endDate) return;
      if (sourceOccurrences.length === 0) return;

      const amount = calculateEntryAmount(calcEntry, sourceOccurrences, null, null);

      expanded.push({
        ...calcEntry,
        date: entryDateStr,
        amount: amount,
        originalId: calcEntry.id,
        id: calcEntry.id + '-' + entryDateStr,
        calculatedFrom: sourceOccurrences.map(o => o.originalId),
        sourceAmount: sourceOccurrences.reduce((sum, o) => sum + o.amount, 0)
      });
    });

    return expanded;
  }

  // For same_day and rolling_days, create an entry for each source occurrence date
  const sourceDates = new Set();
  baseExpanded.forEach(occ => {
    if (sourceEntryIds.includes(occ.originalId)) {
      // Apply date offset
      const offsetDate = new Date(occ.date + 'T12:00:00');
      offsetDate.setDate(offsetDate.getDate() + dateOffset);
      const offsetDateStr = offsetDate.toISOString().split('T')[0];

      // Only include if within forecast range
      if (offsetDate >= startDate && offsetDate <= endDate) {
        sourceDates.add(offsetDateStr);
      }
    }
  });

  // For each unique date, create a calculated entry
  sourceDates.forEach(dateStr => {
    // Get source date (before offset) for looking up source amounts
    const calcDate = new Date(dateStr + 'T12:00:00');
    const sourceDate = new Date(calcDate);
    sourceDate.setDate(sourceDate.getDate() - dateOffset);
    const sourceDateStr = sourceDate.toISOString().split('T')[0];

    // Get source occurrences for this period
    const sourceOccurrences = getSourceOccurrencesForDate(
      calcEntry, baseExpanded, sourceDateStr, startDate, endDate
    );

    if (sourceOccurrences.length === 0) return;

    const amount = calculateEntryAmount(calcEntry, sourceOccurrences, null, null);

    expanded.push({
      ...calcEntry,
      date: dateStr,
      amount: amount,
      originalId: calcEntry.id,
      id: calcEntry.id + '-' + dateStr,
      calculatedFrom: sourceOccurrences.map(o => o.originalId),
      sourceAmount: sourceOccurrences.reduce((sum, o) => sum + o.amount, 0)
    });
  });

  return expanded;
}

function expandEntries(entryList, daysToForecast = 30, customStartDate = null, customEndDate = null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Use custom dates if provided, otherwise use today + daysToForecast
  const startDate = customStartDate ? new Date(customStartDate + 'T00:00:00') : today;
  startDate.setHours(0, 0, 0, 0);

  let endDate;
  if (customEndDate) {
    endDate = new Date(customEndDate + 'T00:00:00');
  } else {
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysToForecast);
  }
  endDate.setHours(0, 0, 0, 0);

  // PASS 1: Expand all non-calculated entries
  const baseExpanded = [];
  entryList.filter(e => !isCalculatedEntry(e)).forEach(entry => {
    baseExpanded.push(...expandSingleEntry(entry, startDate, endDate));
  });

  // PASS 2: Expand calculated entries using base expanded data
  const calculatedExpanded = [];
  entryList.filter(e => isCalculatedEntry(e)).forEach(entry => {
    calculatedExpanded.push(...expandCalculatedEntry(entry, baseExpanded, startDate, endDate));
  });

  // Combine and sort by date
  const allExpanded = [...baseExpanded, ...calculatedExpanded];
  return allExpanded.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calculateForecast(daysToForecast = 30, customStartDate = null, customEndDate = null) {
  const expandedEntries = expandEntries(getActiveEntries(), daysToForecast, customStartDate, customEndDate);
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

  // Determine forecast date range
  const forecastStart = customStartDate ? new Date(customStartDate + 'T00:00:00') : today;
  forecastStart.setHours(0, 0, 0, 0);

  let forecastEnd;
  if (customEndDate) {
    forecastEnd = new Date(customEndDate + 'T00:00:00');
  } else {
    forecastEnd = new Date(forecastStart);
    forecastEnd.setDate(forecastEnd.getDate() + daysToForecast);
  }

  const totalDays = Math.ceil((forecastEnd - forecastStart) / (1000 * 60 * 60 * 24));

  const dailyForecast = [];

  for (let i = 0; i <= totalDays; i++) {
    const date = new Date(forecastStart);
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
  // Calculate dashboard forecast with optional custom date range
  const dashboardForecast = calculateForecast(
    state.metricsTimeframe,
    state.metricsCustomStart,
    state.metricsCustomEnd
  );

  // Calculate timeline forecast with optional custom date range
  const timelineForecast = calculateForecast(
    state.timeRange,
    state.timelineCustomStart,
    state.timelineCustomEnd
  );

  renderScenarioSelector();
  updateScenarioBanners();
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
  const isExpanded = state.timelineViewMode === 'expanded';

  // Update view mode dropdown
  const viewModeSelect = document.getElementById('timelineViewMode');
  if (viewModeSelect) {
    viewModeSelect.value = state.timelineViewMode || 'grouped';
  }

  // Show/hide notes toggle button based on view mode
  const toggleNotesBtn = document.getElementById('toggleNotesBtn');
  if (toggleNotesBtn) {
    if (state.timelineViewMode === 'expanded') {
      toggleNotesBtn.classList.remove('hidden');
      const btnText = document.getElementById('toggleNotesBtnText');
      if (btnText) {
        btnText.textContent = state.showTimelineNotes ? 'Hide Notes' : 'Show Notes';
      }
    } else {
      toggleNotesBtn.classList.add('hidden');
    }
  }

  // Column headers - different based on view mode
  const headerHtml = isExpanded ? `
    <div class="forecast-header forecast-header-expanded">
      <div>Date</div>
      <div>Description</div>
      <div>Type</div>
      <div style="text-align: right;">Amount</div>
      <div style="text-align: right;">Balance</div>
    </div>
  ` : `
    <div class="forecast-header">
      <div>Date</div>
      <div>Transactions</div>
      <div style="text-align: right;">Cash In/Out</div>
      <div style="text-align: right;">Projected Balance</div>
    </div>
  `;

  let html = '';
  let totalItems = 0;
  let paginatedItems = [];

  if (isExpanded) {
    // Expanded view: flatten all entries into individual rows
    const allEntries = [];
    daysWithEntries.forEach(day => {
      day.entries.forEach(entry => {
        allEntries.push({
          date: day.date,
          entry: entry,
          dayBalance: day.balance
        });
      });
    });

    totalItems = allEntries.length;
    const itemsPerPage = state.timelineItemsPerPage;
    const currentPage = state.timelineCurrentPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    paginatedItems = allEntries.slice(startIndex, endIndex);

    html = paginatedItems.map(item => {
      const entry = item.entry;
      let colorClass = '';
      let prefix = '';
      let label = entry.description;
      let calcContext = '';
      let typeLabel = '';

      if (entry.type === 'revenue') {
        colorClass = 'positive';
        prefix = '+';
        typeLabel = 'Income';
      } else if (entry.type === 'expense') {
        colorClass = 'negative';
        prefix = '-';
        typeLabel = 'Expense';
      } else if (entry.type === 'loc_draw') {
        colorClass = '';
        prefix = '+';
        label = `🏦 ${entry.description}`;
        typeLabel = 'LOC Draw';
      } else if (entry.type === 'loc_paydown') {
        colorClass = '';
        prefix = '-';
        label = `🏦 ${entry.description}`;
        typeLabel = 'LOC Paydown';
      }

      // Add calculation context for calculated entries
      if (entry.calculatedFrom && entry.calculationType === 'percentage') {
        calcContext = ` <span style="font-size: 11px; color: var(--accent-blue);">(${entry.calculationValue}%)</span>`;
      }

      // Notes display
      let notesHtml = '';
      if (state.showTimelineNotes && entry.notes) {
        notesHtml = `<div class="timeline-entry-notes">${escapeHtml(entry.notes)}</div>`;
      }

      // Notes indicator (shown when notes are hidden but entry has notes)
      let notesIndicator = '';
      if (!state.showTimelineNotes && entry.notes) {
        notesIndicator = `<span class="timeline-notes-indicator" title="${escapeHtml(entry.notes)}">📝</span>`;
      }

      return `
        <div class="forecast-row forecast-row-expanded">
          <div class="entry-date">${formatDate(item.date)}</div>
          <div class="entry-desc-expanded">
            <span>${label}${calcContext}${notesIndicator}</span>
            ${notesHtml}
          </div>
          <div class="entry-type ${entry.type}">${typeLabel}</div>
          <div class="entry-amount ${colorClass}" style="${entry.type.startsWith('loc') ? 'color: #7c3aed;' : ''}">${prefix}${formatCurrency(entry.amount)}</div>
          <div class="entry-amount" style="color: ${getStatusColor(item.dayBalance)};">${formatCurrency(item.dayBalance)}</div>
        </div>
      `;
    }).join('');

    updateTimelinePagination(totalItems, state.timelineCurrentPage, totalPages, 'items');
  } else {
    // Grouped view: original behavior
    totalItems = daysWithEntries.length;
    const itemsPerPage = state.timelineItemsPerPage;
    const currentPage = state.timelineCurrentPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedDays = daysWithEntries.slice(startIndex, endIndex);

    html = paginatedDays.map(day => {
      const entriesHtml = day.entries.map(entry => {
        let colorClass = '';
        let prefix = '';
        let label = entry.description;
        let calcContext = '';
        let notesIndicator = '';

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

        // Add calculation context for calculated entries
        if (entry.calculatedFrom && entry.calculationType === 'percentage') {
          calcContext = ` <span style="font-size: 11px; color: var(--accent-blue);">(${entry.calculationValue}%)</span>`;
        }

        // Add notes indicator if entry has notes (in grouped view, only show indicator)
        if (entry.notes) {
          notesIndicator = `<span class="timeline-notes-indicator" title="${escapeHtml(entry.notes)}">📝</span>`;
        }

        return `
          <span class="forecast-entry ${entry.type}">
            <span class="${colorClass}" style="${entry.type.startsWith('loc') ? 'color: #7c3aed;' : ''}">${prefix}${formatCurrency(entry.amount)}</span>
            <span style="color: var(--text-secondary);">${label}${calcContext}${notesIndicator}</span>
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

    updateTimelinePagination(totalItems, state.timelineCurrentPage, Math.ceil(totalItems / state.timelineItemsPerPage), 'days');
  }

  const forecastContent = (isExpanded ? paginatedItems.length : totalItems) > 0
    ? headerHtml + html
    : '<p style="color: var(--text-muted); padding: 24px; text-align: center;">No transactions in this period</p>';
  document.getElementById('forecastList').innerHTML = forecastContent;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function toggleTimelineNotes() {
  state.showTimelineNotes = !state.showTimelineNotes;
  saveState();
  render();
}

function updateTimelinePagination(totalItems, currentPage, totalPages, itemType = 'days') {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * state.timelineItemsPerPage + 1;
  const endItem = Math.min(currentPage * state.timelineItemsPerPage, totalItems);

  document.getElementById('timelinePaginationInfo').textContent =
    totalItems > 0 ? `Showing ${startItem}-${endItem} of ${totalItems} ${itemType}` : 'No items to display';

  document.getElementById('timelinePrevBtn').disabled = currentPage === 1;
  document.getElementById('timelineNextBtn').disabled = currentPage >= totalPages || totalPages === 0;
  document.getElementById('timelineItemsPerPage').value = state.timelineItemsPerPage;
}

function changeTimelinePage(delta) {
  state.timelineCurrentPage = Math.max(1, state.timelineCurrentPage + delta);
  saveState();
  render();
}

function updateTimelineItemsPerPage() {
  state.timelineItemsPerPage = parseInt(document.getElementById('timelineItemsPerPage').value);
  state.timelineCurrentPage = 1;
  saveState();
  render();
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

        // Format date range label
        const startDateStr = weekStart.toISOString().split('T')[0];
        const endDateStr = weekEnd.toISOString().split('T')[0];
        const dateRangeLabel = `${formatDate(startDateStr)} - ${formatDate(endDateStr)}`;

        periods.push({
          label: dateRangeLabel,
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
  // Set display mode dropdown value
  const displayModeSelect = document.getElementById('entryDisplayMode');
  if (displayModeSelect) {
    displayModeSelect.value = state.entryDisplayMode || 'grouped';
  }

  // Set search input value
  const searchInput = document.getElementById('entriesSearchInput');
  if (searchInput && searchInput.value !== state.entriesSearchTerm) {
    searchInput.value = state.entriesSearchTerm || '';
  }

  let sortedEntryData = getSortedEntriesForDisplay();

  // Filter by search term
  const searchTerm = (state.entriesSearchTerm || '').toLowerCase().trim();
  if (searchTerm) {
    const typeLabelsForSearch = {
      'revenue': 'income',
      'expense': 'expense',
      'loc_draw': 'loc draw',
      'loc_paydown': 'loc paydown'
    };
    sortedEntryData = sortedEntryData.filter(({ entry }) => {
      const descMatch = entry.description.toLowerCase().includes(searchTerm);
      const typeMatch = typeLabelsForSearch[entry.type]?.toLowerCase().includes(searchTerm);
      return descMatch || typeMatch;
    });
  }

  const existingIds = new Set(getActiveEntries().map(e => e.id));
  selectedEntries = new Set([...selectedEntries].filter(id => existingIds.has(id)));

  // Pagination
  const itemsPerPage = state.entriesItemsPerPage;
  const currentPage = state.entriesCurrentPage;
  const totalItems = sortedEntryData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEntryData = sortedEntryData.slice(startIndex, endIndex);

  const paginatedEntries = paginatedEntryData.map(d => d.entry);
  const allSelected = paginatedEntries.length > 0 && paginatedEntries.every(e => selectedEntries.has(e.id));
  const someSelected = selectedEntries.size > 0;

  const batchActionsHtml = someSelected ? `
    <div class="batch-actions">
      <span class="batch-actions-text">${selectedEntries.size} item${selectedEntries.size > 1 ? 's' : ''} selected</span>
      <button class="btn btn-danger btn-sm" onclick="confirmBatchDelete()">Delete Selected</button>
      <button class="btn btn-secondary btn-sm" onclick="clearSelection()">Clear</button>
    </div>
  ` : '';

  const headerHtml = paginatedEntries.length > 0 ? `
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

  const entriesHtml = paginatedEntryData.map(({ entry, isChild }) => {
    const freqLabel = frequencyLabels[entry.frequency] || entry.frequency;
    const isSelected = selectedEntries.has(entry.id);
    const childClass = isChild ? 'child-entry' : '';
    let endLabel = '';
    if (entry.frequency !== 'once') {
      if (entry.endDate) {
        endLabel = `<span class="entry-badge end-condition">Until ${formatDate(entry.endDate)}</span>`;
      } else if (entry.endOccurrences) {
        endLabel = `<span class="entry-badge end-condition">${entry.endOccurrences}×</span>`;
      }
    }

    // Calculation indicator
    let calcIndicator = '';
    if (hasCalculationConfig(entry)) {
      const calcDesc = getCalculationDescription(entry);
      const isOrphaned = hasOrphanedSources(entry);

      if (isOrphaned) {
        calcIndicator = `<span class="orphaned-warning" title="Source item missing">⚠ Missing source</span><button class="btn btn-link fix-link-btn" onclick="event.stopPropagation(); editEntry(${entry.id})">Fix</button>`;
      } else if (entry.manualOverride) {
        calcIndicator = `<span class="calc-indicator" title="${calcDesc}"><span class="calc-indicator-icon">📊</span> ${calcDesc}</span><span class="override-indicator" title="Using manual override">overridden</span>`;
      } else {
        calcIndicator = `<span class="calc-indicator" title="${calcDesc}"><span class="calc-indicator-icon">📊</span> ${calcDesc}</span>`;
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

    // For calculated entries, compute and display the calculated amount
    let amountDisplay = '';
    if (hasCalculationConfig(entry) && !entry.manualOverride) {
      const calculatedAmount = getCalculatedDisplayAmount(entry);
      amountDisplay = `${amountPrefix}${formatCurrency(calculatedAmount)}`;
    } else {
      amountDisplay = `${amountPrefix}${formatCurrency(entry.amount)}`;
    }

    return `
      <div class="entry-row ${isSelected ? 'selected' : ''} ${childClass}">
        <div class="checkbox-wrapper">
          <div class="checkbox ${isSelected ? 'checked' : ''}" onclick="toggleEntrySelection(${entry.id})"></div>
        </div>
        <div class="entry-date">${formatDate(entry.date)}</div>
        <div class="entry-desc">
          ${entry.type.startsWith('loc') ? '🏦 ' : ''}${entry.description}
          ${endLabel}
          ${calcIndicator}
        </div>
        <div class="entry-type ${entry.type}">${typeLabels[entry.type]}</div>
        <div style="font-size: 12px; color: var(--text-secondary);">${entry.frequency !== 'once' ? freqLabel : '—'}</div>
        <div class="entry-amount ${amountClass}" style="${amountStyle}">
          ${amountDisplay}
        </div>
        <div class="action-buttons">
          <button class="btn-action btn-action-secondary" onclick="duplicateEntry(${entry.id})" title="Duplicate">Copy</button>
          <button class="btn-action btn-action-secondary" onclick="editEntry(${entry.id})">Edit</button>
          <button class="btn-action btn-action-danger" onclick="confirmSingleDelete(${entry.id})">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  let emptyMessage = '';
  if (!entriesHtml) {
    if (searchTerm) {
      emptyMessage = `<p style="color: var(--text-muted); padding: 24px; text-align: center;">No items match "${state.entriesSearchTerm}". <a href="javascript:clearEntriesSearch()" style="color: var(--primary-color);">Clear search</a></p>`;
    } else {
      emptyMessage = '<p style="color: var(--text-muted); padding: 24px; text-align: center;">No items yet. Add your first income or expense above!</p>';
    }
  }
  document.getElementById('entriesList').innerHTML = batchActionsHtml + headerHtml + (entriesHtml || emptyMessage);

  // Update pagination info and buttons
  updateEntriesPagination(totalItems, currentPage, totalPages);
}

function updateEntriesPagination(totalItems, currentPage, totalPages) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * state.entriesItemsPerPage + 1;
  const endItem = Math.min(currentPage * state.entriesItemsPerPage, totalItems);

  document.getElementById('entriesPaginationInfo').textContent =
    totalItems > 0 ? `Showing ${startItem}-${endItem} of ${totalItems} items` : 'No items to display';

  document.getElementById('entriesPrevBtn').disabled = currentPage === 1;
  document.getElementById('entriesNextBtn').disabled = currentPage >= totalPages || totalPages === 0;
  document.getElementById('entriesItemsPerPage').value = state.entriesItemsPerPage;
}

function changeEntriesPage(delta) {
  state.entriesCurrentPage = Math.max(1, state.entriesCurrentPage + delta);
  saveState();
  render();
}

function filterEntries() {
  const searchInput = document.getElementById('entriesSearchInput');
  state.entriesSearchTerm = searchInput ? searchInput.value : '';
  state.entriesCurrentPage = 1; // Reset to first page when searching
  saveState();
  renderEntries();
}

function clearEntriesSearch() {
  state.entriesSearchTerm = '';
  state.entriesCurrentPage = 1;
  const searchInput = document.getElementById('entriesSearchInput');
  if (searchInput) {
    searchInput.value = '';
  }
  saveState();
  renderEntries();
}

function updateEntriesItemsPerPage() {
  state.entriesItemsPerPage = parseInt(document.getElementById('entriesItemsPerPage').value);
  state.entriesCurrentPage = 1;
  saveState();
  render();
}

function changeEntryDisplayMode() {
  state.entryDisplayMode = document.getElementById('entryDisplayMode').value;
  saveState();
  renderEntries();
}

// Sort entries for grouped display - sources first, then their calculated children
function getSortedEntriesForDisplay() {
  const entries = [...getActiveEntries()];

  if (state.entryDisplayMode === 'grouped') {
    // Build a map of source -> calculated entries
    const sourceToCalc = new Map();
    const nonCalcEntries = [];
    const calcEntries = [];

    entries.forEach(entry => {
      if (hasCalculationConfig(entry)) {
        calcEntries.push(entry);
      } else {
        nonCalcEntries.push(entry);
      }
    });

    // Sort non-calculated entries by date
    nonCalcEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Group calculated entries by their sources
    calcEntries.forEach(calc => {
      const sourceIds = calc.sourceEntryIds || [];
      if (sourceIds.length > 0) {
        const primarySourceId = sourceIds[0]; // Use first source as primary
        if (!sourceToCalc.has(primarySourceId)) {
          sourceToCalc.set(primarySourceId, []);
        }
        sourceToCalc.get(primarySourceId).push(calc);
      } else if (calc.sourceMode === 'all_of_type') {
        // For all_of_type, group under first matching entry
        const matchingSource = nonCalcEntries.find(e => e.type === calc.sourceType);
        if (matchingSource) {
          if (!sourceToCalc.has(matchingSource.id)) {
            sourceToCalc.set(matchingSource.id, []);
          }
          sourceToCalc.get(matchingSource.id).push(calc);
        } else {
          nonCalcEntries.push(calc); // No source, add to end
        }
      }
    });

    // Build final sorted list with children after parents
    const result = [];
    const addedCalcIds = new Set();

    nonCalcEntries.forEach(entry => {
      result.push({ entry, isChild: false });

      // Add any calculated entries that depend on this source
      const children = sourceToCalc.get(entry.id) || [];
      children.forEach(child => {
        if (!addedCalcIds.has(child.id)) {
          result.push({ entry: child, isChild: true });
          addedCalcIds.add(child.id);
        }
      });
    });

    // Add any orphaned calculated entries
    calcEntries.forEach(calc => {
      if (!addedCalcIds.has(calc.id)) {
        result.push({ entry: calc, isChild: false });
      }
    });

    return result;
  } else {
    // Date sorted - simple sort
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    return entries.map(entry => ({ entry, isChild: false }));
  }
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
  markUnsavedChanges();
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

    // Sync to timeline if enabled
    if (state.syncFilters) {
      syncDashboardToTimeline();
    }

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

    // Sync to timeline if enabled
    if (state.syncFilters) {
      syncDashboardToTimeline();
    }

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

    // Sync to dashboard if enabled
    if (state.syncFilters) {
      syncTimelineToDashboard();
    }

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

    // Sync to dashboard if enabled
    if (state.syncFilters) {
      syncTimelineToDashboard();
    }

    saveState();
    render();
  }
}

function toggleSyncFilters() {
  state.syncFilters = document.getElementById('syncFiltersCheckbox').checked;

  if (state.syncFilters) {
    // When enabling sync, copy dashboard settings to timeline
    syncDashboardToTimeline();
  }

  saveState();
  render();
}

function updateTimelineViewMode() {
  state.timelineViewMode = document.getElementById('timelineViewMode').value;
  state.timelineCurrentPage = 1; // Reset to first page when changing view mode
  saveState();
  render();
}

function syncDashboardToTimeline() {
  const metricsSelect = document.getElementById('metricsTimeframe');
  const timelineSelect = document.getElementById('timelineTimeframe');
  const timelineCustomRange = document.getElementById('timelineCustomDateRange');

  // Copy dashboard settings to timeline
  timelineSelect.value = metricsSelect.value;

  if (metricsSelect.value === 'custom') {
    timelineCustomRange.style.display = 'flex';
    document.getElementById('timelineStartDate').value = state.metricsCustomStart;
    document.getElementById('timelineEndDate').value = state.metricsCustomEnd;
    state.timelineCustomStart = state.metricsCustomStart;
    state.timelineCustomEnd = state.metricsCustomEnd;
  } else {
    timelineCustomRange.style.display = 'none';
    state.timelineCustomStart = null;
    state.timelineCustomEnd = null;
  }

  state.timeRange = state.metricsTimeframe;
}

function syncTimelineToDashboard() {
  const metricsSelect = document.getElementById('metricsTimeframe');
  const timelineSelect = document.getElementById('timelineTimeframe');
  const customRange = document.getElementById('customDateRange');

  // Copy timeline settings to dashboard
  metricsSelect.value = timelineSelect.value;

  if (timelineSelect.value === 'custom') {
    customRange.style.display = 'flex';
    document.getElementById('metricsStartDate').value = state.timelineCustomStart;
    document.getElementById('metricsEndDate').value = state.timelineCustomEnd;
    state.metricsCustomStart = state.timelineCustomStart;
    state.metricsCustomEnd = state.timelineCustomEnd;
  } else {
    customRange.style.display = 'none';
    state.metricsCustomStart = null;
    state.metricsCustomEnd = null;
  }

  state.metricsTimeframe = state.timeRange;
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
  document.getElementById('newNotes').value = '';
  document.getElementById('formTitle').textContent = 'Add New Entry';
  document.getElementById('formSubmitBtn').textContent = 'Add to Forecast';
  document.getElementById('cancelEditBtn').classList.add('hidden');
  editingEntryId = null;
  toggleEndCondition();
  resetCalculationForm();
}

function editEntry(id) {
  const entry = getActiveEntries().find(e => e.id === id);
  if (!entry) return;

  editingEntryId = id;

  const form = document.getElementById('addForm');
  form.classList.remove('hidden');

  document.getElementById('newDate').value = entry.date;
  document.getElementById('newDesc').value = entry.description;
  document.getElementById('newType').value = entry.type;
  document.getElementById('newRecurring').value = entry.frequency;
  document.getElementById('newNotes').value = entry.notes || '';

  // Set calculation form data (handles amount and calculation settings)
  setCalculationFormData(entry);

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
  const frequency = document.getElementById('newRecurring').value;
  const notes = document.getElementById('newNotes').value.trim();

  // Get calculation/amount data
  const calcData = getCalculationFormData();

  // Validate required fields
  if (!date || !desc) {
    alert('Please fill in date and description');
    return;
  }

  // Validate amount for manual entries
  const isCalculated = document.querySelector('input[name="amountType"]:checked').value === 'calculated';
  if (!isCalculated && !calcData.amount) {
    alert('Please enter an amount');
    return;
  }

  // Validate calculated entry settings
  if (isCalculated) {
    if (!calcData.calculationValue || calcData.calculationValue <= 0) {
      alert('Please enter a valid calculation percentage or value');
      return;
    }

    if (calcData.sourceMode === 'selected' && calcData.sourceEntryIds.length === 0) {
      alert('Please select at least one source item');
      return;
    }
  }

  const entryData = {
    date,
    description: desc,
    type,
    frequency,
    notes: notes || null,
    ...calcData
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

  const scenario = getActiveScenario();
  if (editingEntryId !== null) {
    const index = scenario.entries.findIndex(e => e.id === editingEntryId);
    if (index !== -1) {
      scenario.entries[index] = { ...entryData, id: editingEntryId };
    }
  } else {
    scenario.entries.push({ ...entryData, id: Date.now() });
  }

  saveState();
  markUnsavedChanges();
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

// ==================== CALCULATION UI FUNCTIONS ====================

// Track selected source IDs for multi-select
let selectedSourceIds = new Set();

function toggleAmountType() {
  const isCalculated = document.querySelector('input[name="amountType"]:checked').value === 'calculated';
  const manualGroup = document.getElementById('manualAmountGroup');
  const calcSettings = document.getElementById('calculationSettings');

  if (isCalculated) {
    manualGroup.classList.add('hidden');
    calcSettings.classList.remove('hidden');
    populateSourceItemsList();
    toggleCalcType(); // Initialize calc type visibility
  } else {
    manualGroup.classList.remove('hidden');
    calcSettings.classList.add('hidden');
  }
}

function toggleCalcType() {
  const calcType = document.getElementById('calcType').value;
  const sourceModeGroup = document.getElementById('sourceModeGroup');
  const sourceSelectionGroup = document.getElementById('sourceSelectionGroup');
  const sourceTypeGroup = document.getElementById('sourceTypeGroup');
  const locInterestSettings = document.getElementById('locInterestSettings');
  const sourcePeriodRow = document.getElementById('sourcePeriod').closest('.form-grid');
  const calcTypeHelp = document.getElementById('calcTypeHelp');
  const timingModeGroup = document.getElementById('timingModeGroup');

  if (calcType === 'balance_percentage') {
    // Hide source-based settings, show LOC interest settings
    sourceModeGroup.classList.add('hidden');
    sourceSelectionGroup.classList.add('hidden');
    sourceTypeGroup.classList.add('hidden');
    locInterestSettings.classList.remove('hidden');
    // Hide timing mode for LOC interest (it has its own timing mechanism)
    if (timingModeGroup) timingModeGroup.classList.add('hidden');

    // Update placeholder for APR
    document.getElementById('calcValue').placeholder = '8.0';

    // Update help text
    if (calcTypeHelp) {
      calcTypeHelp.textContent = 'Enter the annual percentage rate (APR). Interest will be calculated based on your LOC balance.';
    }

    // For LOC interest, show only monthly/weekly time period options
    const sourcePeriod = document.getElementById('sourcePeriod');
    sourcePeriod.innerHTML = `
      <option value="same_month">Monthly</option>
      <option value="same_week">Weekly</option>
    `;
    toggleSourcePeriod();
  } else {
    // Show source-based settings, hide LOC interest settings
    sourceModeGroup.classList.remove('hidden');
    locInterestSettings.classList.add('hidden');
    // Show timing mode for source-based calculations
    if (timingModeGroup) timingModeGroup.classList.remove('hidden');
    toggleSourceMode(); // Restore proper source mode visibility

    // Update placeholder
    document.getElementById('calcValue').placeholder = calcType === 'fixed' ? '0.30' : '2.9';

    // Update help text
    if (calcTypeHelp) {
      if (calcType === 'percentage') {
        calcTypeHelp.textContent = '';
      } else if (calcType === 'fixed') {
        calcTypeHelp.textContent = 'Fixed amount charged for each occurrence of the source item(s).';
      }
    }

    // Reset timing mode to source-driven and restore appropriate options
    const timingMode = document.getElementById('timingMode');
    if (timingMode) {
      timingMode.value = 'source_driven';
      toggleTimingMode();
    } else {
      // Fallback if timingMode element doesn't exist
      const sourcePeriod = document.getElementById('sourcePeriod');
      const currentValue = sourcePeriod.value;
      sourcePeriod.innerHTML = `
        <option value="same_day">Same day</option>
        <option value="same_week">Same week</option>
        <option value="same_month">Same month</option>
        <option value="rolling_days">Rolling days</option>
      `;
      if (['same_day', 'same_week', 'same_month', 'rolling_days'].includes(currentValue)) {
        sourcePeriod.value = currentValue;
      }
      toggleSourcePeriod();
    }
  }
}

function toggleSourceMode() {
  const mode = document.getElementById('sourceMode').value;
  const selectionGroup = document.getElementById('sourceSelectionGroup');
  const typeGroup = document.getElementById('sourceTypeGroup');

  if (mode === 'all_of_type') {
    selectionGroup.classList.add('hidden');
    typeGroup.classList.remove('hidden');
  } else {
    selectionGroup.classList.remove('hidden');
    typeGroup.classList.add('hidden');
    populateSourceItemsList();
  }
}

function toggleSourcePeriod() {
  const period = document.getElementById('sourcePeriod').value;
  const rollingGroup = document.getElementById('rollingDaysGroup');
  const helpText = document.getElementById('sourcePeriodHelp');
  const timingMode = document.getElementById('timingMode')?.value || 'source_driven';

  if (period === 'rolling_days') {
    rollingGroup.classList.remove('hidden');
  } else {
    rollingGroup.classList.add('hidden');
  }

  // Update help text based on selection and timing mode
  let helpTexts;
  if (timingMode === 'schedule_driven') {
    helpTexts = {
      'previous_month': 'Aggregates all source amounts from the previous calendar month. Example: Monthly sales tax calculated on the 15th based on last month\'s income.',
      'previous_week': 'Aggregates all source amounts from the previous calendar week (Sun-Sat). Example: Weekly report fee based on last week\'s transactions.',
      'same_month': 'Aggregates all source amounts from the current calendar month up to this date.',
      'same_week': 'Aggregates all source amounts from the current calendar week up to this date.',
      'rolling_days': 'Aggregates source amounts from the past N days before each occurrence.'
    };
  } else {
    helpTexts = {
      'same_day': 'Creates a calculated entry each day the source item(s) occur. Example: Daily CC fees on daily sales. To calculate the interest payment on a loan, enter the number of days after loan taken out that the interest is due in the Date offset field.',
      'same_week': 'Sums all source amounts in the same calendar week (Sun-Sat). Example: Weekly processing fee on all week\'s sales.',
      'same_month': 'Sums all source amounts in the same calendar month. Example: Monthly fee based on total monthly revenue.',
      'rolling_days': 'Sums source amounts from the past N days. Example: 30-day rolling average fee.'
    };
  }

  if (helpText) {
    helpText.textContent = helpTexts[period] || '';
  }
}

function toggleTimingMode() {
  const timingMode = document.getElementById('timingMode').value;
  const sourcePeriod = document.getElementById('sourcePeriod');
  const sourcePeriodLabel = document.getElementById('sourcePeriodLabel');
  const dateOffsetGroup = document.getElementById('dateOffsetGroup');
  const timingModeHelp = document.getElementById('timingModeHelp');
  const currentValue = sourcePeriod.value;

  if (timingMode === 'schedule_driven') {
    // Schedule-driven: use previous periods, show relevant options
    sourcePeriodLabel.textContent = 'Aggregate from';
    sourcePeriod.innerHTML = `
      <option value="previous_month">Previous month</option>
      <option value="previous_week">Previous week</option>
      <option value="same_month">Current month (to date)</option>
      <option value="same_week">Current week (to date)</option>
      <option value="rolling_days">Rolling days</option>
    `;
    // Default to previous_month for schedule-driven
    if (['same_day', 'same_week', 'same_month'].includes(currentValue)) {
      sourcePeriod.value = 'previous_month';
    } else if (currentValue === 'rolling_days') {
      sourcePeriod.value = 'rolling_days';
    }
    // Hide date offset for schedule-driven (frequency/date controls timing)
    dateOffsetGroup.classList.add('hidden');
    timingModeHelp.textContent = 'The calculated entry will appear on your chosen frequency schedule (set above). It will aggregate source amounts from the selected period.';
  } else {
    // Source-driven: use same periods, show relevant options
    sourcePeriodLabel.textContent = 'Time period';
    sourcePeriod.innerHTML = `
      <option value="same_day">Same day</option>
      <option value="same_week">Same week</option>
      <option value="same_month">Same month</option>
      <option value="rolling_days">Rolling days</option>
    `;
    // Restore to same_day or keep rolling_days
    if (['previous_month', 'same_month'].includes(currentValue)) {
      sourcePeriod.value = 'same_month';
    } else if (['previous_week', 'same_week'].includes(currentValue)) {
      sourcePeriod.value = 'same_week';
    } else if (currentValue === 'rolling_days') {
      sourcePeriod.value = 'rolling_days';
    } else {
      sourcePeriod.value = 'same_day';
    }
    // Show date offset for source-driven
    dateOffsetGroup.classList.remove('hidden');
    timingModeHelp.textContent = 'Source-driven: calculates each time source items occur. Schedule-driven: calculates on your chosen frequency, aggregating from previous period.';
  }

  toggleSourcePeriod();
}

function populateSourceItemsList(searchTerm = null) {
  const container = document.getElementById('sourceItemsList');
  const searchInput = document.getElementById('sourceSearchInput');
  const availableSources = getAvailableSourceEntries(editingEntryId);

  // Use provided searchTerm or get from input
  const filterTerm = searchTerm !== null ? searchTerm : (searchInput ? searchInput.value : '');

  if (availableSources.length === 0) {
    container.innerHTML = '<div class="no-source-items">No items available. Add some regular entries first.</div>';
    return;
  }

  // Filter by search term
  const filteredSources = filterTerm
    ? availableSources.filter(entry =>
        entry.description.toLowerCase().includes(filterTerm.toLowerCase()))
    : availableSources;

  if (filteredSources.length === 0) {
    container.innerHTML = '<div class="no-source-items">No matching items found.</div>';
    return;
  }

  const typeLabels = {
    'revenue': 'Income',
    'expense': 'Expense',
    'loc_draw': 'LOC Draw',
    'loc_paydown': 'LOC Paydown'
  };

  const html = filteredSources.map(entry => {
    const isSelected = selectedSourceIds.has(entry.id);
    const freqLabel = frequencyLabels[entry.frequency] || entry.frequency;
    const dateLabel = entry.frequency === 'once'
      ? formatDate(entry.date)
      : `starts ${formatDate(entry.date)}`;

    return `
      <div class="source-item ${isSelected ? 'selected' : ''}" onclick="toggleSourceItem(${entry.id})">
        <div class="source-item-checkbox"></div>
        <div class="source-item-info">
          <div class="source-item-name">${entry.description}</div>
          <div class="source-item-details">${typeLabels[entry.type] || entry.type} · ${freqLabel} · ${dateLabel}</div>
        </div>
        <div class="source-item-amount">${formatCurrency(entry.amount)}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

function filterSourceItems() {
  const searchTerm = document.getElementById('sourceSearchInput').value;
  populateSourceItemsList(searchTerm);
}

function toggleSourceItem(id) {
  if (selectedSourceIds.has(id)) {
    selectedSourceIds.delete(id);
  } else {
    selectedSourceIds.add(id);
  }
  populateSourceItemsList();
}

function getCalculationFormData() {
  const isCalculated = document.querySelector('input[name="amountType"]:checked').value === 'calculated';

  if (!isCalculated) {
    return {
      amount: parseFloat(document.getElementById('newAmount').value) || 0,
      calculationType: null,
      calculationValue: null,
      sourceMode: null,
      sourceEntryIds: [],
      sourceType: null,
      sourcePeriod: null,
      sourcePeriodDays: null,
      dateOffset: 0,
      manualOverride: false,
      locBalanceType: null,
      periodTiming: null,
      timingMode: null
    };
  }

  const calcType = document.getElementById('calcType').value;
  const sourceMode = document.getElementById('sourceMode').value;
  const useOverride = document.getElementById('useManualOverride').checked;
  const overrideAmount = parseFloat(document.getElementById('overrideAmount').value) || null;

  // Get timing mode (defaults to source_driven for backwards compatibility)
  const timingMode = document.getElementById('timingMode')?.value || 'source_driven';

  // Base fields for all calculation types
  const data = {
    amount: useOverride ? overrideAmount : null,
    calculationType: calcType,
    calculationValue: parseFloat(document.getElementById('calcValue').value) || 0,
    sourcePeriod: document.getElementById('sourcePeriod').value,
    sourcePeriodDays: document.getElementById('sourcePeriod').value === 'rolling_days'
      ? parseInt(document.getElementById('sourcePeriodDays').value) || 30
      : null,
    dateOffset: parseInt(document.getElementById('dateOffset').value) || 0,
    manualOverride: useOverride,
    timingMode: timingMode
  };

  // LOC balance percentage specific fields
  if (calcType === 'balance_percentage') {
    data.sourceMode = null;
    data.sourceEntryIds = [];
    data.sourceType = null;
    data.locBalanceType = document.getElementById('locBalanceType').value;
    data.periodTiming = document.getElementById('periodTiming').value;
  } else {
    // Source-based calculation fields
    data.sourceMode = sourceMode;
    data.sourceEntryIds = sourceMode === 'selected' ? Array.from(selectedSourceIds) : [];
    data.sourceType = sourceMode === 'all_of_type' ? document.getElementById('sourceType').value : null;
    data.locBalanceType = null;
    data.periodTiming = null;
  }

  return data;
}

function setCalculationFormData(entry) {
  if (hasCalculationConfig(entry)) {
    // Set to calculated mode
    document.querySelector('input[name="amountType"][value="calculated"]').checked = true;
    toggleAmountType();

    document.getElementById('calcType').value = entry.calculationType || 'percentage';
    toggleCalcType(); // Set up visibility based on calc type

    document.getElementById('calcValue').value = entry.calculationValue || '';

    // Handle LOC balance percentage type
    if (entry.calculationType === 'balance_percentage') {
      document.getElementById('locBalanceType').value = entry.locBalanceType || 'average';
      document.getElementById('periodTiming').value = entry.periodTiming || 'end';
    } else {
      // Handle source-based calculation types
      document.getElementById('sourceMode').value = entry.sourceMode || 'selected';
      toggleSourceMode();

      if (entry.sourceMode === 'all_of_type') {
        document.getElementById('sourceType').value = entry.sourceType || 'revenue';
      } else {
        selectedSourceIds = new Set(entry.sourceEntryIds || []);
        populateSourceItemsList();
      }
    }

    // Set timing mode first, which updates the sourcePeriod options
    const timingMode = entry.timingMode || 'source_driven';
    document.getElementById('timingMode').value = timingMode;
    toggleTimingMode();

    // Now set the sourcePeriod value (after toggleTimingMode has set up the options)
    document.getElementById('sourcePeriod').value = entry.sourcePeriod || (timingMode === 'schedule_driven' ? 'previous_month' : 'same_day');
    toggleSourcePeriod();

    if (entry.sourcePeriod === 'rolling_days') {
      document.getElementById('sourcePeriodDays').value = entry.sourcePeriodDays || 30;
    }

    document.getElementById('dateOffset').value = entry.dateOffset || 0;

    // Show override section when editing
    showOverrideSection(entry);

    // Handle manual override
    if (entry.manualOverride && entry.amount !== null) {
      document.getElementById('useManualOverride').checked = true;
      document.getElementById('overrideAmountGroup').classList.remove('hidden');
      document.getElementById('overrideAmount').value = entry.amount;
    }
  } else {
    // Set to manual mode
    document.querySelector('input[name="amountType"][value="manual"]').checked = true;
    toggleAmountType();
    document.getElementById('newAmount').value = entry.amount || '';
    hideOverrideSection();
  }
}

function showOverrideSection(entry) {
  const section = document.getElementById('manualOverrideSection');
  section.classList.remove('hidden');

  // Calculate and show the preview amount
  updateCalculatedPreview(entry);
}

function hideOverrideSection() {
  const section = document.getElementById('manualOverrideSection');
  section.classList.add('hidden');
  document.getElementById('useManualOverride').checked = false;
  document.getElementById('overrideAmountGroup').classList.add('hidden');
  document.getElementById('overrideAmount').value = '';
}

function updateCalculatedPreview(entry) {
  const preview = document.getElementById('calculatedPreview');

  if (!entry || !hasCalculationConfig(entry)) {
    preview.textContent = '';
    return;
  }

  // Get source amounts to calculate what the value would be
  const sources = getSourceEntries(entry);
  if (sources.length === 0) {
    preview.textContent = '(no source data)';
    return;
  }

  // Calculate based on sources' amounts
  const totalSourceAmount = sources.reduce((sum, s) => sum + (s.amount || 0), 0);

  let calculatedAmount = 0;
  if (entry.calculationType === 'percentage') {
    calculatedAmount = Math.round(totalSourceAmount * (entry.calculationValue / 100) * 100) / 100;
  } else if (entry.calculationType === 'fixed') {
    calculatedAmount = entry.calculationValue;
  }

  if (entry.manualOverride) {
    preview.innerHTML = `Calculated would be: <strong>${formatCurrency(calculatedAmount)}</strong>`;
  } else {
    preview.innerHTML = `Calculates to: <strong>${formatCurrency(calculatedAmount)}</strong> per occurrence`;
  }
}

function toggleManualOverride() {
  const isOverride = document.getElementById('useManualOverride').checked;
  const overrideGroup = document.getElementById('overrideAmountGroup');

  if (isOverride) {
    overrideGroup.classList.remove('hidden');
    // Pre-fill with the calculated amount if available
    const preview = document.getElementById('calculatedPreview');
    const match = preview.textContent.match(/\$[\d,]+/);
    if (match) {
      const amount = parseFloat(match[0].replace(/[$,]/g, ''));
      document.getElementById('overrideAmount').value = amount || '';
    }
  } else {
    overrideGroup.classList.add('hidden');
    document.getElementById('overrideAmount').value = '';
  }
}

function resetCalculationForm() {
  document.querySelector('input[name="amountType"][value="manual"]').checked = true;
  toggleAmountType();
  document.getElementById('calcValue').value = '';
  document.getElementById('calcType').value = 'percentage';
  document.getElementById('sourceMode').value = 'selected';
  document.getElementById('sourceType').value = 'revenue';
  // Reset timing mode to source-driven
  const timingMode = document.getElementById('timingMode');
  if (timingMode) timingMode.value = 'source_driven';
  document.getElementById('sourcePeriod').value = 'same_day';
  document.getElementById('sourcePeriodDays').value = '30';
  document.getElementById('dateOffset').value = '0';
  document.getElementById('sourceSearchInput').value = '';
  // Reset LOC interest fields
  document.getElementById('locBalanceType').value = 'average';
  document.getElementById('periodTiming').value = 'end';
  selectedSourceIds.clear();
  toggleSourceMode();
  if (timingMode) toggleTimingMode();
  toggleSourcePeriod();
  toggleCalcType();
  hideOverrideSection();
}

function deleteEntry(id) {
  const scenario = getActiveScenario();
  scenario.entries = scenario.entries.filter(e => e.id !== id);
  selectedEntries.delete(id);
  saveState();
  markUnsavedChanges();
  render();
}

function duplicateEntry(id) {
  const scenario = getActiveScenario();
  const entry = scenario.entries.find(e => e.id === id);
  if (!entry) return;

  // Create a copy with a new ID and "(Copy)" suffix
  const newEntry = {
    ...entry,
    id: Date.now(),
    description: entry.description + ' (Copy)'
  };

  scenario.entries.push(newEntry);
  saveState();
  markUnsavedChanges();
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
  const allIds = getActiveEntries().map(e => e.id);
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
  const entry = getActiveEntries().find(e => e.id === id);
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
  const scenario = getActiveScenario();
  scenario.entries = scenario.entries.filter(e => !selectedEntries.has(e.id));
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
      // Create a completely empty state (no sample data)
      const emptyState = {
        currentCash: 0,
        locLimit: 0,
        locBalance: 0,
        timeRange: 30,
        timelineCustomStart: null,
        timelineCustomEnd: null,
        metricsTimeframe: 90,
        metricsCustomStart: null,
        metricsCustomEnd: null,
        syncFilters: false,
        tableView: 'monthly',
        timelineItemsPerPage: 50,
        timelineCurrentPage: 1,
        entriesItemsPerPage: 50,
        entriesCurrentPage: 1,
        entryDisplayMode: 'grouped',
        activeScenarioId: 'base',
        scenarios: [
          {
            id: 'base',
            name: 'Base Scenario',
            isBase: true,
            entries: []
          }
        ],
        entries: []
      };

      // Save empty state so it persists after reload
      localStorage.setItem('cashFlowPlannerState', JSON.stringify(emptyState));
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

  getActiveEntries().forEach(entry => {
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

  const scenario = getActiveScenario();
  scenario.entries = scenario.entries
    .filter(e => !deletedIds.has(e.id))
    .map(e => rollForwardMap.get(e.id) || e);

  saveState();
  render();
  hideCleanupModal();
}

// ==================== SPREADSHEET IMPORT/EXPORT ====================

// State for import process
let importState = {
  currentStep: 1,
  fileData: null,
  headers: [],
  rows: [],
  columnMapping: {},
  parsedEntries: [],
  duplicates: [],
  pendingImport: null
};

// Show export modal
function showSpreadsheetExportModal() {
  const modal = document.getElementById('spreadsheetExportModal');
  modal.classList.remove('hidden');

  // Populate scenario dropdown
  const scenarioSelect = document.getElementById('exportScenario');
  scenarioSelect.innerHTML = state.scenarios.map(s =>
    `<option value="${s.id}" ${s.id === state.activeScenarioId ? 'selected' : ''}>${s.name}</option>`
  ).join('');

  // Set default date range (today to 2 years from now)
  const today = new Date();
  const twoYearsLater = new Date(today);
  twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);

  document.getElementById('exportStartDate').value = today.toISOString().split('T')[0];
  document.getElementById('exportEndDate').value = twoYearsLater.toISOString().split('T')[0];

  // Add event listeners for preview updates
  scenarioSelect.onchange = updateExportPreview;
  document.getElementById('exportStartDate').onchange = updateExportPreview;
  document.getElementById('exportEndDate').onchange = updateExportPreview;

  updateExportPreview();
}

function hideSpreadsheetExportModal() {
  document.getElementById('spreadsheetExportModal').classList.add('hidden');
}

// Update export preview with stats
function updateExportPreview() {
  const scenarioId = document.getElementById('exportScenario').value;
  const startDate = document.getElementById('exportStartDate').value;
  const endDate = document.getElementById('exportEndDate').value;

  if (!startDate || !endDate) {
    document.getElementById('exportPreviewStats').innerHTML = 'Please select a date range';
    return;
  }

  const scenario = state.scenarios.find(s => s.id === scenarioId);
  if (!scenario) return;

  // Generate preview data
  const exportData = generateExportData(scenario, startDate, endDate);

  const revenueCount = exportData.filter(r => r.type === 'revenue').length;
  const expenseCount = exportData.filter(r => r.type === 'expense').length;
  const locCount = exportData.filter(r => r.type === 'loc_draw' || r.type === 'loc_paydown').length;
  const calculatedCount = exportData.filter(r => r.isCalculated).length;

  document.getElementById('exportPreviewStats').innerHTML = `
    <div class="stat-row">
      <span class="stat-label">Total Entries</span>
      <span class="stat-value">${exportData.length}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Income Entries</span>
      <span class="stat-value">${revenueCount}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Expense Entries</span>
      <span class="stat-value">${expenseCount}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">LOC Entries</span>
      <span class="stat-value">${locCount}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Calculated Entries</span>
      <span class="stat-value">${calculatedCount}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Starting Cash</span>
      <span class="stat-value">${formatCurrency(state.currentCash)}</span>
    </div>
  `;
}

// Generate export data with expanded entries
function generateExportData(scenario, startDateStr, endDateStr) {
  const startDate = new Date(startDateStr + 'T00:00:00');
  const endDate = new Date(endDateStr + 'T23:59:59');
  const twoYearsFromStart = new Date(startDate);
  twoYearsFromStart.setFullYear(twoYearsFromStart.getFullYear() + 2);

  const entries = scenario.entries || [];
  const expandedEntries = [];

  // Expand all entries
  entries.forEach(entry => {
    if (entry.frequency === 'once') {
      const entryDate = new Date(entry.date + 'T12:00:00');
      if (entryDate >= startDate && entryDate <= endDate) {
        expandedEntries.push({
          ...entry,
          isCalculated: !!entry.calculationType
        });
      }
    } else {
      // Recurring entry - expand occurrences
      let currentDate = new Date(entry.date + 'T12:00:00');
      let occurrenceCount = 0;
      const maxOccurrences = entry.endOccurrences || Infinity;

      // For entries without end date, use 2 years from start or original end date
      let effectiveEndDate = endDate;
      if (entry.endDate) {
        effectiveEndDate = new Date(entry.endDate + 'T23:59:59');
        if (effectiveEndDate > endDate) effectiveEndDate = endDate;
      } else {
        // No end date - cap at 2 years from entry start or export end, whichever is sooner
        const twoYearsFromEntry = new Date(entry.date + 'T12:00:00');
        twoYearsFromEntry.setFullYear(twoYearsFromEntry.getFullYear() + 2);
        effectiveEndDate = twoYearsFromEntry < endDate ? twoYearsFromEntry : endDate;
      }

      while (currentDate <= effectiveEndDate && occurrenceCount < maxOccurrences) {
        if (currentDate >= startDate) {
          expandedEntries.push({
            ...entry,
            date: currentDate.toISOString().split('T')[0],
            frequency: 'once', // Convert to one-time in export
            originalFrequency: entry.frequency,
            isCalculated: !!entry.calculationType,
            endDate: null,
            endOccurrences: null
          });
        }
        occurrenceCount++;
        const nextDate = getNextOccurrence(currentDate, entry.frequency);
        if (!nextDate) break;
        currentDate = nextDate;
      }
    }
  });

  // Sort by date
  expandedEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

  return expandedEntries;
}

// Execute export
function executeSpreadsheetExport() {
  const scenarioId = document.getElementById('exportScenario').value;
  const startDate = document.getElementById('exportStartDate').value;
  const endDate = document.getElementById('exportEndDate').value;
  const format = document.getElementById('exportFormat').value;

  const scenario = state.scenarios.find(s => s.id === scenarioId);
  if (!scenario) {
    alert('Please select a scenario');
    return;
  }

  const exportData = generateExportData(scenario, startDate, endDate);

  // Calculate running balance
  let runningBalance = state.currentCash;
  let runningLocBalance = state.locBalance;

  const exportRows = exportData.map(entry => {
    let amount = entry.amount || 0;

    // For calculated entries, we need to calculate the amount
    // (In a simplified export, we'll use the stored amount or 0)
    if (entry.isCalculated && entry.amount === null) {
      amount = 0; // Calculated entries without override will show 0
    }

    // Update running balance based on type
    if (entry.type === 'revenue') {
      runningBalance += amount;
    } else if (entry.type === 'expense') {
      runningBalance -= amount;
    } else if (entry.type === 'loc_draw') {
      runningBalance += amount;
      runningLocBalance += amount;
    } else if (entry.type === 'loc_paydown') {
      runningBalance -= amount;
      runningLocBalance -= amount;
    }

    return {
      Date: entry.date,
      Description: entry.description,
      Type: formatExportType(entry.type),
      Amount: amount,
      'Running Balance': Math.round(runningBalance * 100) / 100,
      'LOC Balance': Math.round(runningLocBalance * 100) / 100,
      'Is Calculated': entry.isCalculated ? 'Yes' : 'No',
      'Original Frequency': entry.originalFrequency ? frequencyLabels[entry.originalFrequency] : 'One-time'
    };
  });

  if (format === 'csv') {
    downloadCSV(exportRows, scenario.name);
  } else {
    downloadXLSX(exportRows, scenario.name);
  }

  hideSpreadsheetExportModal();
  clearUnsavedChanges();
}

function formatExportType(type) {
  const typeMap = {
    'revenue': 'Income',
    'expense': 'Expense',
    'loc_draw': 'LOC Draw',
    'loc_paydown': 'LOC Paydown'
  };
  return typeMap[type] || type;
}

// CSV Export
function downloadCSV(data, scenarioName) {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      let val = row[h];
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().split('T')[0];
  a.download = `cashflow-${scenarioName.replace(/\s+/g, '-')}-${timestamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// XLSX Export (simple implementation without external library)
function downloadXLSX(data, scenarioName) {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Build XML for xlsx (simplified - creates a basic Excel XML file)
  const headers = Object.keys(data[0]);

  let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xmlContent += '<?mso-application progid="Excel.Sheet"?>\n';
  xmlContent += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xmlContent += '  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
  xmlContent += '  <Styles>\n';
  xmlContent += '    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E8E4E0" ss:Pattern="Solid"/></Style>\n';
  xmlContent += '    <Style ss:ID="Currency"><NumberFormat ss:Format="&quot;$&quot;#,##0.00"/></Style>\n';
  xmlContent += '    <Style ss:ID="Date"><NumberFormat ss:Format="yyyy-mm-dd"/></Style>\n';
  xmlContent += '  </Styles>\n';
  xmlContent += '  <Worksheet ss:Name="Cash Flow">\n';
  xmlContent += '    <Table>\n';

  // Header row
  xmlContent += '      <Row>\n';
  headers.forEach(h => {
    xmlContent += `        <Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>\n`;
  });
  xmlContent += '      </Row>\n';

  // Data rows
  data.forEach(row => {
    xmlContent += '      <Row>\n';
    headers.forEach(h => {
      const val = row[h];
      if (typeof val === 'number') {
        const style = (h.includes('Balance') || h === 'Amount') ? ' ss:StyleID="Currency"' : '';
        xmlContent += `        <Cell${style}><Data ss:Type="Number">${val}</Data></Cell>\n`;
      } else {
        xmlContent += `        <Cell><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>\n`;
      }
    });
    xmlContent += '      </Row>\n';
  });

  xmlContent += '    </Table>\n';
  xmlContent += '  </Worksheet>\n';
  xmlContent += '</Workbook>';

  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().split('T')[0];
  a.download = `cashflow-${scenarioName.replace(/\s+/g, '-')}-${timestamp}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
}

// ==================== IMPORT FUNCTIONS ====================

function showSpreadsheetImportModal() {
  // Reset import state
  importState = {
    currentStep: 1,
    fileData: null,
    headers: [],
    rows: [],
    columnMapping: {},
    parsedEntries: [],
    duplicates: [],
    pendingImport: null
  };

  const modal = document.getElementById('spreadsheetImportModal');
  modal.classList.remove('hidden');

  // Populate target scenario dropdown
  const scenarioSelect = document.getElementById('importTargetScenario');
  scenarioSelect.innerHTML = state.scenarios.map(s =>
    `<option value="${s.id}" ${s.id === state.activeScenarioId ? 'selected' : ''}>${s.name}</option>`
  ).join('');

  // Show step 1, hide others
  updateImportStepVisibility();
  updateImportButtons();

  // Reset file input
  document.getElementById('spreadsheetFile').value = '';
  document.getElementById('selectedFileName').classList.add('hidden');

  // Setup drag and drop
  setupDragAndDrop();
}

function hideSpreadsheetImportModal() {
  document.getElementById('spreadsheetImportModal').classList.add('hidden');
  importState = {
    currentStep: 1,
    fileData: null,
    headers: [],
    rows: [],
    columnMapping: {},
    parsedEntries: [],
    duplicates: [],
    pendingImport: null
  };
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('fileDropZone');

  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  };

  dropZone.ondragleave = () => {
    dropZone.classList.remove('drag-over');
  };

  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processImportFile(files[0]);
    }
  };
}

function handleSpreadsheetFile(event) {
  const file = event.target.files[0];
  if (file) {
    processImportFile(file);
  }
}

function processImportFile(file) {
  const fileName = file.name.toLowerCase();

  if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
    alert('Please select a CSV or Excel file');
    return;
  }

  // Show selected file
  document.getElementById('selectedFileName').innerHTML = `
    <span class="selected-file-icon">📄</span>
    <span class="selected-file-name">${file.name}</span>
    <button class="selected-file-remove" onclick="removeSelectedFile()">×</button>
  `;
  document.getElementById('selectedFileName').classList.remove('hidden');

  const reader = new FileReader();

  if (fileName.endsWith('.csv')) {
    reader.onload = (e) => {
      parseCSV(e.target.result);
    };
    reader.readAsText(file);
  } else {
    reader.onload = (e) => {
      parseXLSX(e.target.result);
    };
    reader.readAsText(file);
  }
}

function removeSelectedFile() {
  document.getElementById('spreadsheetFile').value = '';
  document.getElementById('selectedFileName').classList.add('hidden');
  importState.fileData = null;
  importState.headers = [];
  importState.rows = [];
}

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    alert('CSV file must have at least a header row and one data row');
    return;
  }

  // Parse header
  importState.headers = parseCSVLine(lines[0]);

  // Parse data rows
  importState.rows = lines.slice(1).map(line => parseCSVLine(line)).filter(row => row.some(cell => cell.trim()));

  importState.fileData = content;

  // Auto-detect column mapping
  autoDetectColumnMapping();
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

function parseXLSX(content) {
  // Simple XML parsing for Excel XML format
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');

    const rows = doc.querySelectorAll('Row');
    if (rows.length < 2) {
      alert('Excel file must have at least a header row and one data row');
      return;
    }

    // Parse header
    const headerCells = rows[0].querySelectorAll('Cell Data');
    importState.headers = Array.from(headerCells).map(cell => cell.textContent.trim());

    // Parse data rows
    importState.rows = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('Cell Data');
      const rowData = Array.from(cells).map(cell => cell.textContent.trim());
      if (rowData.some(cell => cell)) {
        importState.rows.push(rowData);
      }
    }

    importState.fileData = content;
    autoDetectColumnMapping();
  } catch (e) {
    // Fallback: try parsing as CSV (some .xls files are actually CSV)
    parseCSV(content);
  }
}

function autoDetectColumnMapping() {
  const mapping = {
    date: -1,
    description: -1,
    type: -1,
    amount: -1
  };

  importState.headers.forEach((header, index) => {
    const h = header.toLowerCase();
    if (h.includes('date') && mapping.date === -1) mapping.date = index;
    if ((h.includes('description') || h.includes('desc') || h.includes('name') || h.includes('memo')) && mapping.description === -1) mapping.description = index;
    if ((h.includes('type') || h.includes('category')) && mapping.type === -1) mapping.type = index;
    if ((h.includes('amount') || h.includes('value') || h.includes('total')) && mapping.amount === -1) mapping.amount = index;
  });

  importState.columnMapping = mapping;
}

function updateImportStepVisibility() {
  document.getElementById('importStep1').classList.toggle('hidden', importState.currentStep !== 1);
  document.getElementById('importStep2').classList.toggle('hidden', importState.currentStep !== 2);
  document.getElementById('importStep3').classList.toggle('hidden', importState.currentStep !== 3);
}

function updateImportButtons() {
  const backBtn = document.getElementById('importBackBtn');
  const nextBtn = document.getElementById('importNextBtn');

  backBtn.classList.toggle('hidden', importState.currentStep === 1);

  if (importState.currentStep === 3) {
    nextBtn.textContent = 'Import';
  } else {
    nextBtn.textContent = 'Next';
  }
}

function importStepNext() {
  if (importState.currentStep === 1) {
    // Validate file is selected
    if (!importState.headers.length) {
      alert('Please select a file first');
      return;
    }
    importState.currentStep = 2;
    renderColumnMapping();
    renderImportPreview();
  } else if (importState.currentStep === 2) {
    // Validate column mapping
    if (importState.columnMapping.date === -1 || importState.columnMapping.description === -1) {
      alert('Please map the Date and Description columns');
      return;
    }
    importState.currentStep = 3;
    parseEntriesFromMapping();
    renderImportSummary();
  } else if (importState.currentStep === 3) {
    executeImport();
  }

  updateImportStepVisibility();
  updateImportButtons();
}

function importStepBack() {
  if (importState.currentStep > 1) {
    importState.currentStep--;
    updateImportStepVisibility();
    updateImportButtons();
  }
}

function renderColumnMapping() {
  const container = document.getElementById('columnMappingArea');
  const fields = [
    { key: 'date', label: 'Date', required: true },
    { key: 'description', label: 'Description', required: true },
    { key: 'type', label: 'Type', required: false },
    { key: 'amount', label: 'Amount', required: false }
  ];

  container.innerHTML = fields.map(field => {
    const options = ['<option value="-1">-- Skip --</option>'];
    importState.headers.forEach((h, i) => {
      const selected = importState.columnMapping[field.key] === i ? 'selected' : '';
      options.push(`<option value="${i}" ${selected}>${h}</option>`);
    });

    return `
      <div class="mapping-item">
        <div class="mapping-label ${field.required ? 'required' : ''}">${field.label}</div>
        <select class="mapping-select" onchange="updateColumnMapping('${field.key}', this.value)">
          ${options.join('')}
        </select>
      </div>
    `;
  }).join('');
}

function updateColumnMapping(field, value) {
  importState.columnMapping[field] = parseInt(value);
  renderImportPreview();
}

function renderImportPreview() {
  const container = document.getElementById('importPreviewTable');
  const previewRows = importState.rows.slice(0, 5);

  if (previewRows.length === 0) {
    container.innerHTML = '<p>No data to preview</p>';
    return;
  }

  let html = '<table class="preview-table"><thead><tr>';
  importState.headers.forEach(h => {
    html += `<th>${escapeHtml(h)}</th>`;
  });
  html += '</tr></thead><tbody>';

  previewRows.forEach(row => {
    html += '<tr>';
    row.forEach((cell, i) => {
      html += `<td>${escapeHtml(cell || '')}</td>`;
    });
    // Pad with empty cells if row is shorter than headers
    for (let i = row.length; i < importState.headers.length; i++) {
      html += '<td></td>';
    }
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function parseEntriesFromMapping() {
  const { date, description, type, amount } = importState.columnMapping;

  importState.parsedEntries = importState.rows.map((row, index) => {
    const dateVal = date >= 0 ? row[date] : null;
    const descVal = description >= 0 ? row[description] : 'Imported Entry';
    const typeVal = type >= 0 ? row[type] : 'expense';
    const amountVal = amount >= 0 ? row[amount] : 0;

    // Parse date
    let parsedDate = parseImportDate(dateVal);
    if (!parsedDate) {
      parsedDate = new Date().toISOString().split('T')[0];
    }

    // Parse type
    let parsedType = parseImportType(typeVal);

    // Parse amount
    let parsedAmount = parseImportAmount(amountVal);

    return {
      id: Date.now() + index,
      date: parsedDate,
      description: descVal || 'Imported Entry',
      type: parsedType,
      amount: Math.abs(parsedAmount),
      frequency: 'once'
    };
  }).filter(entry => entry.date && entry.description);
}

function parseImportDate(dateStr) {
  if (!dateStr) return null;

  // Try various date formats
  const formats = [
    // ISO format
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // US format
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
    // European format
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/
  ];

  // Try ISO first
  let match = dateStr.match(formats[0]);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  // Try US format MM/DD/YYYY
  match = dateStr.match(formats[1]);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }

  // Try US format MM/DD/YY
  match = dateStr.match(formats[2]);
  if (match) {
    const year = parseInt(match[3]) > 50 ? '19' + match[3] : '20' + match[3];
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }

  // Fallback: try Date constructor
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}

  return null;
}

function parseImportType(typeStr) {
  if (!typeStr) return 'expense';

  const t = typeStr.toLowerCase().trim();

  if (t.includes('income') || t.includes('revenue') || t.includes('credit') || t === 'in') {
    return 'revenue';
  }
  if (t.includes('loc draw') || t.includes('draw') || t.includes('borrow')) {
    return 'loc_draw';
  }
  if (t.includes('loc pay') || t.includes('paydown') || t.includes('repay')) {
    return 'loc_paydown';
  }

  return 'expense';
}

function parseImportAmount(amountStr) {
  if (!amountStr) return 0;
  if (typeof amountStr === 'number') return amountStr;

  // Remove currency symbols, commas, spaces
  const cleaned = String(amountStr).replace(/[$,\s]/g, '').replace(/[()]/g, '-');
  const num = parseFloat(cleaned);

  return isNaN(num) ? 0 : num;
}

function renderImportSummary() {
  const container = document.getElementById('importSummary');
  const entries = importState.parsedEntries;

  const revenueCount = entries.filter(e => e.type === 'revenue').length;
  const expenseCount = entries.filter(e => e.type === 'expense').length;
  const locCount = entries.filter(e => e.type === 'loc_draw' || e.type === 'loc_paydown').length;

  const totalRevenue = entries.filter(e => e.type === 'revenue').reduce((sum, e) => sum + e.amount, 0);
  const totalExpense = entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);

  container.innerHTML = `
    <div class="import-summary-title">Import Summary</div>
    <div class="import-summary-stats">
      <div class="summary-stat">
        <div class="summary-stat-value">${entries.length}</div>
        <div class="summary-stat-label">Total Entries</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-value">${revenueCount}</div>
        <div class="summary-stat-label">Income</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-value">${expenseCount}</div>
        <div class="summary-stat-label">Expenses</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-value">${locCount}</div>
        <div class="summary-stat-label">LOC</div>
      </div>
    </div>
    <div style="margin-top: 16px; font-size: 14px; color: var(--text-secondary);">
      <div>Total Income: <strong style="color: var(--accent-green);">${formatCurrency(totalRevenue)}</strong></div>
      <div>Total Expenses: <strong style="color: var(--accent-coral);">${formatCurrency(totalExpense)}</strong></div>
    </div>
  `;
}

function executeImport() {
  const targetScenarioId = document.getElementById('importTargetScenario').value;
  const importMode = document.getElementById('importMode').value;

  const scenario = state.scenarios.find(s => s.id === targetScenarioId);
  if (!scenario) {
    alert('Please select a target scenario');
    return;
  }

  // Check for duplicates (same description + date)
  const existingEntries = scenario.entries || [];
  const duplicates = [];

  if (importMode === 'append') {
    importState.parsedEntries.forEach(newEntry => {
      const existing = existingEntries.find(e =>
        e.description.toLowerCase() === newEntry.description.toLowerCase() &&
        e.date === newEntry.date
      );
      if (existing) {
        duplicates.push({
          existing,
          new: newEntry
        });
      }
    });
  }

  if (duplicates.length > 0) {
    // Show duplicate handling modal
    importState.duplicates = duplicates;
    importState.pendingImport = {
      scenarioId: targetScenarioId,
      mode: importMode,
      entries: importState.parsedEntries
    };
    showDuplicateHandlingModal();
  } else {
    // No duplicates, proceed with import
    finalizeImport(targetScenarioId, importMode, importState.parsedEntries);
  }
}

function showDuplicateHandlingModal() {
  const modal = document.getElementById('duplicateHandlingModal');
  modal.classList.remove('hidden');

  document.getElementById('duplicateWarningText').innerHTML =
    `<strong>${importState.duplicates.length} duplicate entries</strong> were found (same description and date). How would you like to handle them?`;

  const list = document.getElementById('duplicateList');
  list.innerHTML = importState.duplicates.slice(0, 10).map(d => `
    <div class="duplicate-item">
      <span class="duplicate-item-name">${escapeHtml(d.new.description)}</span>
      <span class="duplicate-item-date">${d.new.date}</span>
    </div>
  `).join('') + (importState.duplicates.length > 10 ? `<div class="duplicate-item" style="color: var(--text-muted); font-style: italic;">...and ${importState.duplicates.length - 10} more</div>` : '');
}

function hideDuplicateHandlingModal() {
  document.getElementById('duplicateHandlingModal').classList.add('hidden');
}

function handleDuplicates(action) {
  const pending = importState.pendingImport;
  if (!pending) return;

  const scenario = state.scenarios.find(s => s.id === pending.scenarioId);
  if (!scenario) return;

  let entriesToImport = pending.entries;

  if (action === 'skip') {
    // Skip duplicates
    const dupKeys = new Set(importState.duplicates.map(d => `${d.new.description.toLowerCase()}-${d.new.date}`));
    entriesToImport = entriesToImport.filter(e =>
      !dupKeys.has(`${e.description.toLowerCase()}-${e.date}`)
    );
  } else if (action === 'replace') {
    // Remove existing duplicates first
    const dupKeys = new Set(importState.duplicates.map(d => `${d.existing.description.toLowerCase()}-${d.existing.date}`));
    scenario.entries = scenario.entries.filter(e =>
      !dupKeys.has(`${e.description.toLowerCase()}-${e.date}`)
    );
  }
  // action === 'keep' means keep both, so just add all

  finalizeImport(pending.scenarioId, pending.mode, entriesToImport);
  hideDuplicateHandlingModal();
}

function finalizeImport(scenarioId, mode, entries) {
  const scenario = state.scenarios.find(s => s.id === scenarioId);
  if (!scenario) return;

  // Assign new IDs to entries
  let nextId = Date.now();
  entries = entries.map(e => ({
    ...e,
    id: nextId++
  }));

  if (mode === 'replace') {
    scenario.entries = entries;
  } else {
    scenario.entries = [...scenario.entries, ...entries];
  }

  saveState();
  markUnsavedChanges();
  render();
  hideSpreadsheetImportModal();

  alert(`Successfully imported ${entries.length} entries!`);
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', function() {
  loadState();
  migrateToScenarios();
  checkSetupStatus();
  render();
});
