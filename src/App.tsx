import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { House, Mountain, Trophy } from 'lucide-react';
import { PersonDetail } from './PersonDetail';

type Person = {
  id: string;
  name: string;
  currentWeight: number;
  inputWeight: string;
  inputDate: string;
  history: HistoryEntry[];
};

type HistoryEntry = {
  id: string;
  weight: number;
  savedAt: string;
};

type SavedPerson = {
  currentWeight: number;
  history: HistoryEntry[];
  goal?: GoalConfig;
};

type ViewMode = 'summary' | 'detail' | 'monthly' | 'goals';
type BalanceViewMode = 'accumulated' | 'month';
type MonthlyReference = {
  monthKey: string;
  monthLabel: string;
  previousMonthLabel: string;
  ranking: MonthlyRankingItem[];
  payments: string[];
  transfers: MonthlyTransfer[];
};

type AvailableMonth = {
  key: string;
  label: string;
};

const firstSelectableMonth = new Date(2026, 0, 1);

type MonthlyRankingItem = {
  person: Person;
  baseWeight: number | null;
  currentWeight: number | null;
  difference: number | null;
  hasValidInitialWindow: boolean;
  hasValidClosingWindow: boolean;
  isLateEntry: boolean;
  isPenalized: boolean;
  closingWindowStarted: boolean;
  lastRecordedAt: string | null;
};

type MonthlyTransfer = {
  fromPersonId: string;
  toPersonId: string;
  amount: number;
  summary: string;
};

type PersonBalance = {
  person: Person;
  totalPaid: number;
  totalReceived: number;
  netBalance: number;
};

type GoalConfig = {
  startWeight: number;
  targetWeight: number;
};

type GoalProgressItem = {
  person: Person;
  startWeight: number;
  targetWeight: number;
  currentWeight: number;
  progress: number;
  mountainLeft: number;
  mountainBottom: number;
};

type MountainPoint = {
  x: number;
  y: number;
};

const initialPeople: Person[] = [
  { id: 'fran', name: 'Fran', currentWeight: 78.4, inputWeight: '78.4', inputDate: '', history: [] },
  { id: 'nuria', name: 'Nuria', currentWeight: 62.1, inputWeight: '62.1', inputDate: '', history: [] },
  { id: 'adolfo', name: 'Adolfo', currentWeight: 81.7, inputWeight: '81.7', inputDate: '', history: [] },
  { id: 'carmen', name: 'Carmen', currentWeight: 69.3, inputWeight: '69.3', inputDate: '', history: [] }
];

const defaultGoalConfigs: Record<string, GoalConfig> = {
  fran: { startWeight: 78.4, targetWeight: 73.4 },
  nuria: { startWeight: 62.1, targetWeight: 57.1 },
  adolfo: { startWeight: 81.7, targetWeight: 76.7 },
  carmen: { startWeight: 69.3, targetWeight: 64.3 }
};

const step = 0.1;
const storageKey = 'family-weight-storage';
const maxChartEntries = 10;
const firstWeekLimit = 7;
const repeatDelayMs = 360;
const repeatIntervalMs = 90;

function formatWeight(value: number) {
  return value.toFixed(1);
}

function parseWeight(value: string) {
  const parsed = Number.parseFloat(value.replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-ES');
}

function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateInputValue() {
  return formatDateInputValue(new Date());
}

function getDateKey(value: string) {
  return formatDateInputValue(new Date(value));
}

function createSavedAtFromDateInput(value: string) {
  return new Date(`${value}T12:00:00`).toISOString();
}

function sortHistory(history: HistoryEntry[]) {
  return [...history].sort(
    (left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime()
  );
}

function normalizeHistory(history: HistoryEntry[]) {
  const seenDates = new Set<string>();

  return sortHistory(history).filter((entry) => {
    const dateKey = getDateKey(entry.savedAt);

    if (seenDates.has(dateKey)) {
      return false;
    }

    seenDates.add(dateKey);
    return true;
  });
}

function getBaseWeight(personId: string) {
  const person = initialPeople.find((item) => item.id === personId);
  return person ? person.currentWeight : 0;
}

function getCurrentWeight(personId: string, history: HistoryEntry[]) {
  return history.length > 0 ? history[0].weight : getBaseWeight(personId);
}

function getChartPoints(history: HistoryEntry[]) {
  const recentHistory = history.slice(0, maxChartEntries);

  if (recentHistory.length < 2) {
    return '';
  }

  const chartWidth = 220;
  const chartHeight = 88;
  const padding = 10;
  const orderedHistory = [...recentHistory].reverse();
  const weights = orderedHistory.map((entry) => entry.weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const weightRange = maxWeight - minWeight || 1;

  return orderedHistory
    .map((entry, index) => {
      const x = padding + (index * (chartWidth - padding * 2)) / (orderedHistory.length - 1);
      const y =
        chartHeight -
        padding -
        ((entry.weight - minWeight) / weightRange) * (chartHeight - padding * 2);

      return `${x},${y}`;
    })
    .join(' ');
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function getMonthStartFromKey(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function getPreviousMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function isSameMonth(date: Date, monthStart: Date) {
  return (
    date.getFullYear() === monthStart.getFullYear() &&
    date.getMonth() === monthStart.getMonth()
  );
}

function getMonthLabel(date: Date) {
  const label = date.toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric'
  });

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getFirstEntryOfMonth(history: HistoryEntry[], monthStart: Date) {
  const monthEntries = history.filter((item) => isSameMonth(new Date(item.savedAt), monthStart));
  return monthEntries.length > 0 ? monthEntries[monthEntries.length - 1] : null;
}

function getLatestEntryBetween(history: HistoryEntry[], start: Date, end: Date) {
  return (
    history.find((item) => {
      const savedDate = new Date(item.savedAt);
      return savedDate >= start && savedDate <= end;
    }) ?? null
  );
}

function getFirstWeekCloseEnd(monthStart: Date) {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, firstWeekLimit, 23, 59, 59, 999);
}

function getClosingWindowStart(monthStart: Date) {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
}

function getLastRecordedAt(history: HistoryEntry[], cutoff?: Date) {
  const entry = cutoff
    ? history.find((item) => new Date(item.savedAt) <= cutoff)
    : history[0];

  return entry ? entry.savedAt : null;
}

function getSelectableMonths() {
  const months: AvailableMonth[] = [];
  const currentMonthStart = getMonthStart(new Date());
  const cursor = new Date(firstSelectableMonth);

  while (cursor <= currentMonthStart) {
    months.unshift({
      key: getMonthKey(cursor),
      label: getMonthLabel(cursor)
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function getPersonMonthlyClass(personId: string) {
  return `monthlyPerson monthlyPerson-${personId}`;
}

function getPersonThemeClass(personId: string) {
  return `personTheme personTheme-${personId}`;
}

function getMenuItemClass(currentView: ViewMode, itemView: ViewMode) {
  return `sideNavItem ${currentView === itemView ? 'sideNavItemActive' : ''}`.trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getGoalProgress(currentWeight: number, startWeight: number, targetWeight: number) {
  const totalChange = startWeight - targetWeight;

  if (totalChange === 0) {
    return currentWeight <= targetWeight ? 1 : 0;
  }

  return clamp((startWeight - currentWeight) / totalChange, 0, 1);
}

function getRouteLength(route: MountainPoint[]) {
  let total = 0;

  for (let index = 1; index < route.length; index += 1) {
    const previousPoint = route[index - 1];
    const currentPoint = route[index];
    total += Math.hypot(currentPoint.x - previousPoint.x, currentPoint.y - previousPoint.y);
  }

  return total;
}

function getPointOnRoute(route: MountainPoint[], progress: number) {
  const targetDistance = getRouteLength(route) * clamp(progress, 0, 1);
  let travelledDistance = 0;

  for (let index = 1; index < route.length; index += 1) {
    const previousPoint = route[index - 1];
    const currentPoint = route[index];
    const segmentLength = Math.hypot(currentPoint.x - previousPoint.x, currentPoint.y - previousPoint.y);

    if (travelledDistance + segmentLength >= targetDistance) {
      const segmentProgress =
        segmentLength === 0 ? 0 : (targetDistance - travelledDistance) / segmentLength;

      return {
        x: previousPoint.x + (currentPoint.x - previousPoint.x) * segmentProgress,
        y: previousPoint.y + (currentPoint.y - previousPoint.y) * segmentProgress
      };
    }

    travelledDistance += segmentLength;
  }

  return route[route.length - 1];
}

function getMonthlyClassification(people: Person[], selectedMonthKey: string): MonthlyReference {
  const currentMonthStart = getMonthStartFromKey(selectedMonthKey);
  const nextMonthStart = getClosingWindowStart(currentMonthStart);
  const closeDeadline = getFirstWeekCloseEnd(currentMonthStart);
  const evaluationEnd =
    new Date() < closeDeadline ? new Date() : closeDeadline;
  const closingWindowStarted = evaluationEnd >= nextMonthStart;
  const ranking: MonthlyRankingItem[] = [];
  const transfers: MonthlyTransfer[] = [];

  people.forEach((person) => {
    const baseEntry = getFirstEntryOfMonth(person.history, currentMonthStart);
    const hasValidInitialWindow =
      baseEntry !== null && new Date(baseEntry.savedAt).getDate() <= firstWeekLimit;
    const isLateEntry =
      baseEntry !== null && new Date(baseEntry.savedAt).getDate() > firstWeekLimit;
    const hasValidClosingWindow =
      getLatestEntryBetween(person.history, nextMonthStart, closeDeadline) !== null;
    const latestEntry =
      baseEntry !== null
        ? getLatestEntryBetween(person.history, new Date(baseEntry.savedAt), evaluationEnd)
        : null;
    const difference =
      baseEntry !== null && latestEntry !== null
        ? latestEntry.weight - baseEntry.weight
        : null;
    const isPenalized =
      baseEntry === null ||
      !hasValidInitialWindow ||
      (closingWindowStarted && !hasValidClosingWindow);

    ranking.push({
      person,
      baseWeight: baseEntry?.weight ?? null,
      currentWeight: latestEntry?.weight ?? null,
      difference,
      hasValidInitialWindow,
      hasValidClosingWindow,
      isLateEntry,
      isPenalized,
      closingWindowStarted,
      lastRecordedAt: getLastRecordedAt(person.history, closeDeadline)
    });
  });

  ranking.sort((left, right) => {
    if (left.isPenalized !== right.isPenalized) {
      return left.isPenalized ? 1 : -1;
    }

    if (!left.isPenalized && !right.isPenalized) {
      return (left.difference ?? 0) - (right.difference ?? 0);
    }

    if (left.lastRecordedAt && right.lastRecordedAt) {
      const lastRecordedDifference =
        new Date(right.lastRecordedAt).getTime() - new Date(left.lastRecordedAt).getTime();

      if (lastRecordedDifference !== 0) {
        return lastRecordedDifference;
      }
    }

    if (left.lastRecordedAt) {
      return -1;
    }

    if (right.lastRecordedAt) {
      return 1;
    }

    if (left.difference !== right.difference) {
      return (left.difference ?? 0) - (right.difference ?? 0);
    }

    return left.person.name.localeCompare(right.person.name);
  });

  const payments: string[] = [];

  const hasCompetitionData = ranking.some((item) => item.baseWeight !== null);

  if (hasCompetitionData && ranking.length >= 2) {
    const first = ranking[0];
    const last = ranking[ranking.length - 1];
    const summary = `${last.person.name} paga 30 € a ${first.person.name}.`;
    payments.push(summary);
    transfers.push({
      fromPersonId: last.person.id,
      toPersonId: first.person.id,
      amount: 30,
      summary
    });
  }

  if (hasCompetitionData && ranking.length >= 4) {
    const second = ranking[1];
    const penultimate = ranking[ranking.length - 2];
    const summary = `${penultimate.person.name} paga 15 € a ${second.person.name}.`;
    payments.push(summary);
    transfers.push({
      fromPersonId: penultimate.person.id,
      toPersonId: second.person.id,
      amount: 15,
      summary
    });
  }

  return {
    monthKey: selectedMonthKey,
    monthLabel: getMonthLabel(currentMonthStart),
    previousMonthLabel: getMonthLabel(nextMonthStart),
    ranking,
    payments,
    transfers
  };
}

function getAccumulatedBalances(people: Person[], months: AvailableMonth[]) {
  const transfers: MonthlyTransfer[] = [];

  months.forEach((month) => {
    const monthlyClassification = getMonthlyClassification(people, month.key);
    transfers.push(...monthlyClassification.transfers);
  });

  return getBalancesFromTransfers(people, transfers);
}

function getBalancesFromTransfers(people: Person[], transfers: MonthlyTransfer[]) {
  const totals = people.reduce<Record<string, PersonBalance>>((result, person) => {
    result[person.id] = {
      person,
      totalPaid: 0,
      totalReceived: 0,
      netBalance: 0
    };

    return result;
  }, {});

  transfers.forEach((transfer) => {
    totals[transfer.fromPersonId].totalPaid += transfer.amount;
    totals[transfer.toPersonId].totalReceived += transfer.amount;
  });

  return people
    .map((person) => {
    const totalsForPerson = totals[person.id];

    return {
      ...totalsForPerson,
      netBalance: totalsForPerson.totalReceived - totalsForPerson.totalPaid
    };
    })
    .sort((left, right) => right.netBalance - left.netBalance);
}

function getMonthlyBalances(people: Person[], monthKey: string) {
  return getBalancesFromTransfers(people, getMonthlyClassification(people, monthKey).transfers);
}

function isValidGoalConfig(value: unknown): value is GoalConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const goal = value as Record<string, unknown>;

  return (
    typeof goal.startWeight === 'number' &&
    Number.isFinite(goal.startWeight) &&
    typeof goal.targetWeight === 'number' &&
    Number.isFinite(goal.targetWeight)
  );
}

function getGoalProgressItems(people: Person[], goalConfigs: Record<string, GoalConfig>) {
  const climbRoute: MountainPoint[] = [
    { x: 12, y: 0 },
    { x: 18, y: 10 },
    { x: 24, y: 20 },
    { x: 30, y: 32 },
    { x: 35, y: 46 },
    { x: 40, y: 58 },
    { x: 44, y: 70 },
    { x: 47, y: 84 },
    { x: 50, y: 100 }
  ];
  const lateralOffsets = [-5, -1.5, 1.5, 5];

  return people.map((person, index) => {
    const goalConfig = goalConfigs[person.id] ?? defaultGoalConfigs[person.id] ?? {
      startWeight: person.currentWeight,
      targetWeight: person.currentWeight
    };
    const progress = getGoalProgress(
      person.currentWeight,
      goalConfig.startWeight,
      goalConfig.targetWeight
    );
    const position = getPointOnRoute(climbRoute, progress);
    const lateralOffset = lateralOffsets[index] ?? 0;

    return {
      person,
      startWeight: goalConfig.startWeight,
      targetWeight: goalConfig.targetWeight,
      currentWeight: person.currentWeight,
      progress,
      mountainLeft: clamp(position.x + lateralOffset, 10, 90),
      mountainBottom: position.y
    };
  });
}

function isValidHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  return (
    typeof entry.id === 'string' &&
    typeof entry.weight === 'number' &&
    Number.isFinite(entry.weight) &&
    entry.weight >= 0 &&
    typeof entry.savedAt === 'string'
  );
}

function savePeople(nextPeople: Person[], goalConfigs: Record<string, GoalConfig>) {
  const savedPeople = nextPeople.reduce<Record<string, SavedPerson>>((result, person) => {
    result[person.id] = {
      currentWeight: person.currentWeight,
      history: person.history,
      goal: goalConfigs[person.id] ?? defaultGoalConfigs[person.id]
    };

    return result;
  }, {});

  localStorage.setItem(storageKey, JSON.stringify(savedPeople));
}

function loadPeople() {
  const savedValue = localStorage.getItem(storageKey);

  if (!savedValue) {
    return initialPeople.map((person) => ({
      ...person,
      inputDate: getTodayDateInputValue()
    }));
  }

  try {
    const savedPeople = JSON.parse(savedValue) as Record<string, unknown>;

    return initialPeople.map((person) => {
      const savedPerson = savedPeople[person.id];

      if (typeof savedPerson === 'number' && Number.isFinite(savedPerson) && savedPerson >= 0) {
        return {
          ...person,
          currentWeight: savedPerson,
          inputWeight: formatWeight(savedPerson),
          inputDate: getTodayDateInputValue()
        };
      }

      if (typeof savedPerson !== 'object' || savedPerson === null) {
        return person;
      }

      const currentWeight = (savedPerson as Record<string, unknown>).currentWeight;
      const history = (savedPerson as Record<string, unknown>).history;
      const validHistory = Array.isArray(history)
        ? normalizeHistory(history.filter(isValidHistoryEntry))
        : [];
      const nextWeight =
        validHistory.length > 0 ? getCurrentWeight(person.id, validHistory) : currentWeight;

      if (
        typeof currentWeight !== 'number' ||
        !Number.isFinite(currentWeight) ||
        currentWeight < 0
      ) {
        return person;
      }

      return {
        ...person,
        currentWeight: nextWeight,
        inputWeight: formatWeight(nextWeight),
        inputDate: getTodayDateInputValue(),
        history: validHistory
      };
    });
  } catch {
    return initialPeople.map((person) => ({
      ...person,
      inputDate: getTodayDateInputValue()
    }));
  }
}

function loadGoalConfigs() {
  const savedValue = localStorage.getItem(storageKey);

  if (!savedValue) {
    return defaultGoalConfigs;
  }

  try {
    const savedPeople = JSON.parse(savedValue) as Record<string, unknown>;

    return initialPeople.reduce<Record<string, GoalConfig>>((result, person) => {
      const savedPerson = savedPeople[person.id];

      if (typeof savedPerson === 'object' && savedPerson !== null) {
        const goal = (savedPerson as Record<string, unknown>).goal;

        if (isValidGoalConfig(goal)) {
          result[person.id] = goal;
          return result;
        }
      }

      result[person.id] = defaultGoalConfigs[person.id];
      return result;
    }, {});
  } catch {
    return defaultGoalConfigs;
  }
}

export default function App() {
  const [people, setPeople] = useState(loadPeople);
  const [goalConfigs, setGoalConfigs] = useState(loadGoalConfigs);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [editingGoalPersonId, setEditingGoalPersonId] = useState<string | null>(null);
  const [editingGoalWeight, setEditingGoalWeight] = useState('');
  const [hoveredGoalPersonId, setHoveredGoalPersonId] = useState<string | null>(null);
  const [balanceViewMode, setBalanceViewMode] = useState<BalanceViewMode>('accumulated');
  const repeatTimeoutRef = useRef<number | null>(null);
  const repeatIntervalRef = useRef<number | null>(null);
  const weightInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const selectedPerson = people.find((person) => person.id === selectedPersonId) ?? null;
  const availableMonths = getSelectableMonths();
  const [selectedMonthKey, setSelectedMonthKey] = useState(availableMonths[0]?.key ?? '');

  useEffect(() => {
    if (availableMonths.length === 0) {
      if (selectedMonthKey !== '') {
        setSelectedMonthKey('');
      }

      return;
    }

    const monthExists = availableMonths.some((month) => month.key === selectedMonthKey);

    if (!monthExists) {
      setSelectedMonthKey(availableMonths[0].key);
    }
  }, [availableMonths, selectedMonthKey]);

  const monthlyClassification =
    selectedMonthKey !== '' ? getMonthlyClassification(people, selectedMonthKey) : null;
  const accumulatedBalances = getAccumulatedBalances(people, availableMonths);
  const monthlyBalances =
    selectedMonthKey !== '' ? getMonthlyBalances(people, selectedMonthKey) : [];
  const goalProgressItems = getGoalProgressItems(people, goalConfigs);
  const hoveredGoalItem =
    goalProgressItems.find((item) => item.person.id === hoveredGoalPersonId) ?? null;

  const changeInput = (id: string, value: string) => {
    setPeople((current) =>
      current.map((person) =>
        person.id === id ? { ...person, inputWeight: value } : person
      )
    );
  };

  const changeInputDate = (id: string, value: string) => {
    setPeople((current) =>
      current.map((person) =>
        person.id === id ? { ...person, inputDate: value } : person
      )
    );
  };

  const changeByStep = (id: string, amount: number) => {
    setPeople((current) =>
      current.map((person) => {
        if (person.id !== id) {
          return person;
        }

        const baseValue = parseWeight(person.inputWeight) ?? person.currentWeight;
        const nextValue = Math.max(0, baseValue + amount);

        return {
          ...person,
          inputWeight: formatWeight(nextValue)
        };
      })
    );
  };

  const stopStepRepeat = () => {
    if (repeatTimeoutRef.current !== null) {
      window.clearTimeout(repeatTimeoutRef.current);
      repeatTimeoutRef.current = null;
    }

    if (repeatIntervalRef.current !== null) {
      window.clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  };

  const startStepRepeat = (id: string, amount: number) => {
    stopStepRepeat();
    changeByStep(id, amount);

    repeatTimeoutRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(() => {
        changeByStep(id, amount);
      }, repeatIntervalMs);
    }, repeatDelayMs);
  };

  useEffect(() => {
    const stopRepeat = () => stopStepRepeat();

    window.addEventListener('pointerup', stopRepeat);
    window.addEventListener('pointercancel', stopRepeat);

    return () => {
      window.removeEventListener('pointerup', stopRepeat);
      window.removeEventListener('pointercancel', stopRepeat);
      stopStepRepeat();
    };
  }, []);

  const saveWeight = (id: string) => {
    setPeople((current) => {
      const nextPeople = current.map((person) => {
        if (person.id !== id) {
          return person;
        }

        const visibleInputValue =
          weightInputRefs.current[id]?.value ?? person.inputWeight;
        const normalizedInputValue = visibleInputValue.replace(',', '.').trim();
        const nextValue = parseWeight(normalizedInputValue);

        if (nextValue === null) {
          return person;
        }

        const selectedDate = person.inputDate || getTodayDateInputValue();
        const matchingEntry = person.history.find(
          (entry) => getDateKey(entry.savedAt) === selectedDate
        );
        const entry: HistoryEntry = matchingEntry
          ? {
              ...matchingEntry,
              weight: nextValue,
              savedAt: createSavedAtFromDateInput(selectedDate)
            }
          : {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              weight: nextValue,
              savedAt: createSavedAtFromDateInput(selectedDate)
            };

        const nextHistory = normalizeHistory([
          ...person.history.filter(
            (historyEntry) => getDateKey(historyEntry.savedAt) !== selectedDate
          ),
          entry
        ]);
        const nextCurrentWeight = getCurrentWeight(person.id, nextHistory);

        return {
          ...person,
          currentWeight: nextCurrentWeight,
          inputWeight: normalizedInputValue,
          inputDate: getTodayDateInputValue(),
          history: nextHistory
        };
      });

      savePeople(nextPeople, goalConfigs);
      return nextPeople;
    });
  };

  const deleteHistoryEntry = (personId: string, entryId: string) => {
    setPeople((current) => {
      const nextPeople = current.map((person) => {
        if (person.id !== personId) {
          return person;
        }

        const nextHistory = person.history.filter((entry) => entry.id !== entryId);
        const nextCurrentWeight = getCurrentWeight(person.id, nextHistory);

        return {
          ...person,
          currentWeight: nextCurrentWeight,
          inputWeight: formatWeight(nextCurrentWeight),
          history: nextHistory
        };
      });

      savePeople(nextPeople, goalConfigs);
      return nextPeople;
    });
  };

  const updateHistoryEntry = (personId: string, entryId: string, weight: number, date: string) => {
    setPeople((current) => {
      const nextPeople = current.map((person) => {
        if (person.id !== personId) {
          return person;
        }

        const nextEntry = person.history.find((entry) => entry.id === entryId);

        if (!nextEntry) {
          return person;
        }

        const normalizedSavedAt = createSavedAtFromDateInput(date);
        const nextHistory = normalizeHistory(
          person.history
            .filter(
              (entry) =>
                entry.id !== entryId &&
                getDateKey(entry.savedAt) !== date
            )
            .concat({
              ...nextEntry,
              weight,
              savedAt: normalizedSavedAt
            })
        );
        const nextCurrentWeight = getCurrentWeight(person.id, nextHistory);

        return {
          ...person,
          currentWeight: nextCurrentWeight,
          inputWeight: formatWeight(nextCurrentWeight),
          inputDate: getTodayDateInputValue(),
          history: nextHistory
        };
      });

      savePeople(nextPeople, goalConfigs);
      return nextPeople;
    });
  };

  const startEditingGoal = (personId: string) => {
    const goalConfig = goalConfigs[personId] ?? defaultGoalConfigs[personId];
    setEditingGoalPersonId(personId);
    setEditingGoalWeight(formatWeight(goalConfig.targetWeight));
  };

  const cancelEditingGoal = () => {
    setEditingGoalPersonId(null);
    setEditingGoalWeight('');
  };

  const saveGoal = (personId: string) => {
    const nextTargetWeight = parseWeight(editingGoalWeight);
    const person = people.find((item) => item.id === personId);

    if (nextTargetWeight === null || !person) {
      return;
    }

    const nextGoalConfigs = {
      ...goalConfigs,
      [personId]: {
        startWeight: person.currentWeight,
        targetWeight: nextTargetWeight
      }
    };

    setGoalConfigs(nextGoalConfigs);
    savePeople(people, nextGoalConfigs);
    cancelEditingGoal();
  };

  const openDetail = (personId: string) => {
    setSelectedPersonId(personId);
    setViewMode('detail');
  };

  const openMonthlyView = () => {
    setSelectedPersonId(null);
    setViewMode('monthly');
  };

  const openSummaryView = () => {
    setSelectedPersonId(null);
    setViewMode('summary');
  };

  const openGoalsView = () => {
    setSelectedPersonId(null);
    setViewMode('goals');
  };

  const closeDetail = () => {
    setViewMode('summary');
    setSelectedPersonId(null);
  };

  let content = null;

  if (viewMode === 'detail' && selectedPerson) {
    content = (
      <PersonDetail
        person={selectedPerson}
        onBack={closeDetail}
        onDeleteEntry={deleteHistoryEntry}
        onUpdateEntry={updateHistoryEntry}
      />
    );
  } else if (viewMode === 'monthly') {
    content = (
      <main className="app">
        <section className="detailHeader">
          <div>
            <div className="monthlyTitleRow">
              <h1>Clasificación mensual</h1>
              <details className="monthlyHelp">
                <summary aria-label="Mostrar ayuda de la clasificación mensual">i</summary>
                <div className="monthlyHelpTooltip">
                  La base del mes es el primer peso registrado en {monthlyClassification?.monthLabel ?? 'el mes seleccionado'}.
                  Quien entra entre el dia 1 y el 7 compite en condiciones normales; quien entra mas tarde sigue apareciendo,
                  pero queda penalizado y su cambio se muestra en gris. Cuando llega la ventana de cierre, del 1 al 7 de {monthlyClassification?.previousMonthLabel ?? 'el mes siguiente'},
                  tambien se penaliza a quien no registre en ese plazo. Entre personas penalizadas, queda por delante quien haya registrado mas recientemente.
                </div>
              </details>
            </div>
            <div className="monthSelector">
              <label htmlFor="monthly-select">Mes analizado</label>
              <select
                id="monthly-select"
                value={selectedMonthKey}
                onChange={(event) => setSelectedMonthKey(event.target.value)}
              >
                {availableMonths.map((month) => (
                  <option key={month.key} value={month.key}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            {monthlyClassification ? (
              <p className="description">
                Consulta el ranking y los pagos del mes seleccionado.
              </p>
            ) : (
              <p className="description">
                Todavia no hay meses registrados en el historial.
              </p>
            )}
          </div>
        </section>

        <section className="monthlyCard">
          <div className="monthlyCardHeader">
            <div className="monthlyCardTitleRow">
              <h2>{monthlyClassification ? monthlyClassification.monthLabel : 'Sin datos'}</h2>
              {monthlyClassification ? (
                <span className="monthlyStatusBadge">
                  {monthlyClassification.ranking[0]?.closingWindowStarted ? 'Cierre pendiente' : 'Mes en curso'}
                </span>
              ) : null}
            </div>
          </div>

          <div className="monthlyBody">
            <div className="monthlySection">
              <h3>Ranking</h3>

              {!monthlyClassification || monthlyClassification.ranking.length === 0 ? (
                <p className="monthlyEmpty">Todavia no hay datos suficientes para clasificar.</p>
              ) : (
                <ul className="monthlyList">
                  {monthlyClassification.ranking.map((item, index) => (
                    <li
                      key={item.person.id}
                      className={`monthlyItem ${getPersonMonthlyClass(item.person.id)} ${item.isPenalized ? 'monthlyItemMuted' : ''}`.trim()}
                    >
                      <div>
                        <strong>
                          {index + 1}. {item.person.name}
                        </strong>
                        {item.baseWeight !== null && item.currentWeight !== null ? (
                          <span>
                            Base: {item.baseWeight.toFixed(1)} kg {'->'} Ahora: {item.currentWeight.toFixed(1)} kg
                          </span>
                        ) : (
                          <span>
                            Sin registro en {monthlyClassification.monthLabel}. Ultimo registro:{' '}
                            {item.lastRecordedAt ? formatDate(item.lastRecordedAt) : 'nunca'}
                          </span>
                        )}
                        {item.baseWeight !== null ? (
                          <span className="monthlyStatus">
                            {item.isLateEntry
                              ? 'Entrada tardia: fuera de la ventana inicial.'
                              : !item.hasValidInitialWindow
                                ? 'Sin registro inicial valido.'
                                : item.closingWindowStarted && !item.hasValidClosingWindow
                                  ? `Pendiente o sin cierre valido del 1 al 7 de ${monthlyClassification.previousMonthLabel}.`
                                  : 'Cumple las ventanas competitivas.'}
                          </span>
                        ) : null}
                      </div>
                      {item.difference !== null ? (
                        <strong
                          className={
                            item.isLateEntry
                              ? 'trendLate'
                              : (item.difference ?? 0) < 0
                              ? 'trendLoss'
                              : (item.difference ?? 0) > 0
                                ? 'trendGain'
                                : 'trendSame'
                          }
                        >
                          {(item.difference ?? 0) > 0 ? '+' : ''}
                          {(item.difference ?? 0).toFixed(1)} kg
                        </strong>
                      ) : (
                        <strong className="trendSame">Sin base mensual</strong>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="monthlySection monthlyPaymentsSection">
              <div className="monthlyPaymentsHeader">
                <h3>Pagos provisionales</h3>
                <p>
                  Estimacion segun la clasificacion actual del mes. El cierre definitivo depende de la
                  ventana final del 1 al 7 del mes siguiente.
                </p>
              </div>

              {!monthlyClassification || monthlyClassification.payments.length === 0 ? (
                <div className="monthlyEmptyState">
                  <strong>Aun no hay pagos provisionales</strong>
                  <p>
                    Cuando el ranking mensual tenga suficiente informacion, aqui apareceran los pagos
                    estimados de ese mes.
                  </p>
                </div>
              ) : (
                <ul className="monthlyList">
                  {monthlyClassification.payments.map((payment) => (
                    <li key={payment} className="monthlyItem paymentItem">
                      <span>{payment}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="balanceCard">
          <div className="balanceCardHeader">
            <div className="balanceTitleRow">
              <div className="balanceTitleSlot">
                <h3>Balance de pagos</h3>
              </div>

              <div className="balanceCenterSlot">
                {balanceViewMode === 'month' ? (
                  <div className="balanceMonthSelector">
                    <select
                      aria-label="Seleccionar mes del balance"
                      id="balance-month-select"
                      value={selectedMonthKey}
                      onChange={(event) => setSelectedMonthKey(event.target.value)}
                    >
                      {availableMonths.map((month) => (
                        <option key={month.key} value={month.key}>
                          {month.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="balanceControls">
                <div className="balanceToggle" role="tablist" aria-label="Modo de balance">
                  <button
                    type="button"
                    className={balanceViewMode === 'accumulated' ? 'balanceToggleButton active' : 'balanceToggleButton'}
                    onClick={() => setBalanceViewMode('accumulated')}
                  >
                    Acumulado
                  </button>
                  <button
                    type="button"
                    className={balanceViewMode === 'month' ? 'balanceToggleButton active' : 'balanceToggleButton'}
                    onClick={() => setBalanceViewMode('month')}
                  >
                    Mes
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ul className="balanceList">
            {(balanceViewMode === 'accumulated' ? accumulatedBalances : monthlyBalances).map((item) => (
              <li key={item.person.id} className="balanceListItem">
                <div>
                  <strong>{item.person.name}</strong>
                  <span>Total pagado: {item.totalPaid.toFixed(0)} €</span>
                  <span>Total cobrado: {item.totalReceived.toFixed(0)} €</span>
                </div>
                <strong
                  className={
                    item.netBalance > 0
                      ? 'balancePositive'
                      : item.netBalance < 0
                        ? 'balanceNegative'
                        : 'balanceNeutral'
                  }
                >
                  Balance: {item.netBalance > 0 ? '+' : ''}
                  {item.netBalance.toFixed(0)} €
                </strong>
              </li>
            ))}
          </ul>
        </section>
      </main>
    );
  } else if (viewMode === 'goals') {
    content = (
      <main className="app goalsPage">
        <section className="detailHeader">
          <div>
            <h1>OBJETIVOS</h1>
          </div>
        </section>

        <section className="goalsCard">
          <div className="mountainScene">
            <div className="mountainBackdrop" />
            <div className="mountainGuides" aria-hidden="true">
              <span className="mountainGuide mountainGuideTop">100%</span>
              <span className="mountainGuide mountainGuideMiddle">50%</span>
              <span className="mountainGuide mountainGuideBase">0%</span>
            </div>
            <div className="mountainShape">
              <svg
                viewBox="0 0 100 100"
                className="mountainTrail"
                aria-hidden="true"
                preserveAspectRatio="none"
              >
                <path
                  d="M 12 100 L 18 90 L 24 80 L 30 68 L 35 54 L 40 42 L 44 30 L 47 16 L 50 0"
                  className="mountainTrailBase"
                />
                <path
                  d="M 12 100 L 18 90 L 24 80 L 30 68 L 35 54 L 40 42 L 44 30 L 47 16 L 50 0"
                  className="mountainTrailLine"
                />
              </svg>
            </div>
            <div className="goalMarkerLayer">
              {goalProgressItems.map((item) => (
                <div
                  key={item.person.id}
                  className="goalMarkerSlot"
                  style={{
                    left: `${item.mountainLeft}%`,
                    bottom: `${item.mountainBottom}%`
                  }}
                >
                  <div
                    className={`goalMarker ${getPersonThemeClass(item.person.id)}`}
                    onMouseEnter={() => setHoveredGoalPersonId(item.person.id)}
                    onMouseLeave={() =>
                        setHoveredGoalPersonId((current) =>
                          current === item.person.id ? null : current
                        )
                    }
                  >
                    <span>{item.person.name.slice(0, 1)}</span>
                  </div>
                </div>
              ))}
            </div>

            {hoveredGoalItem ? (
              <div
                className="goalTooltip"
                style={{
                  left: `clamp(76px, ${hoveredGoalItem.mountainLeft}%, calc(100% - 76px))`,
                  bottom: `calc(${hoveredGoalItem.mountainBottom}% + 72px)`
                }}
              >
                <strong>{hoveredGoalItem.person.name}</strong>
                <span>Actual: {hoveredGoalItem.currentWeight.toFixed(1)} kg</span>
                <span>Objetivo: {hoveredGoalItem.targetWeight.toFixed(1)} kg</span>
                <span>Progreso: {Math.round(hoveredGoalItem.progress * 100)}%</span>
              </div>
            ) : null}
          </div>

          <div className="goalsGrid">
            {goalProgressItems.map((item) => (
              <article
                key={item.person.id}
                className={`goalCard ${getPersonThemeClass(item.person.id)}`}
              >
                <div className="goalCardHeader">
                  <h3>{item.person.name}</h3>
                  <strong>{Math.round(item.progress * 100)}%</strong>
                </div>

                <div className="goalStats">
                  <span>Actual: {item.currentWeight.toFixed(1)} kg</span>
                  <span>Objetivo: {item.targetWeight.toFixed(1)} kg</span>
                </div>

                <details className="goalMeta">
                  <summary>Ver detalle</summary>
                  <span>Inicio del objetivo: {item.startWeight.toFixed(1)} kg</span>
                </details>

                {editingGoalPersonId === item.person.id ? (
                  <div className="goalEditRow">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editingGoalWeight}
                      onChange={(event) => setEditingGoalWeight(event.target.value)}
                    />
                    <button type="button" className="smallButton" onClick={() => saveGoal(item.person.id)}>
                      Guardar
                    </button>
                    <button type="button" className="smallButton secondaryButton" onClick={cancelEditingGoal}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="goalEditButton"
                    onClick={() => startEditingGoal(item.person.id)}
                  >
                    Editar objetivo
                  </button>
                )}

                <div className="goalProgressBar">
                  <div
                    className="goalProgressFill"
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  } else {
    content = (
      <main className="app">
        <section className="header">
          <div>
            <h1>BASKAL</h1>
            <p className="description">Familia Ballestin Simon</p>
          </div>
        </section>

        <section className="grid">
          {people.map((person) => (
            <article
              key={person.id}
              className={`card ${getPersonThemeClass(person.id)}`}
            >
              <div className="cardHeader">
                <h2>{person.name}</h2>
                <p>
                  <span>Peso actual:</span> {person.currentWeight.toFixed(1)} kg
                </p>
              </div>

              <div className="controls">
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    startStepRepeat(person.id, -step);
                  }}
                  onPointerUp={stopStepRepeat}
                  onPointerLeave={stopStepRepeat}
                  onPointerCancel={stopStepRepeat}
                  onBlur={stopStepRepeat}
                >
                  -
                </button>

                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={person.inputWeight}
                  ref={(element) => {
                    weightInputRefs.current[person.id] = element;
                  }}
                  onChange={(event) => changeInput(person.id, event.target.value)}
                />

                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    startStepRepeat(person.id, step);
                  }}
                  onPointerUp={stopStepRepeat}
                  onPointerLeave={stopStepRepeat}
                  onPointerCancel={stopStepRepeat}
                  onBlur={stopStepRepeat}
                >
                  +
                </button>
              </div>

              <input
                type="date"
                max={getTodayDateInputValue()}
                value={person.inputDate}
                className="dateInput"
                onChange={(event) => changeInputDate(person.id, event.target.value)}
              />

              <button
                type="button"
                className="saveButton"
                onClick={() => saveWeight(person.id)}
              >
                Registrar peso
              </button>

              <button
                type="button"
                className="detailButton"
                onClick={() => openDetail(person.id)}
              >
                Ver historial
              </button>
            </article>
          ))}
        </section>
      </main>
    );
  }

  return (
    <div className="appShell">
      <aside className="sideNav" aria-label="Navegacion principal">
        <button type="button" className={getMenuItemClass(viewMode, 'summary')} onClick={openSummaryView}>
          <span className="sideNavIcon" aria-hidden="true"><House size={42} strokeWidth={2.1} /></span>
          <span className="sideNavLabel">Inicio</span>
        </button>
        <button type="button" className={getMenuItemClass(viewMode, 'monthly')} onClick={openMonthlyView}>
          <span className="sideNavIcon" aria-hidden="true"><Trophy size={42} strokeWidth={2.1} /></span>
          <span className="sideNavLabel">Clasificacion</span>
        </button>
        <button type="button" className={getMenuItemClass(viewMode, 'goals')} onClick={openGoalsView}>
          <span className="sideNavIcon" aria-hidden="true"><Mountain size={42} strokeWidth={2.1} /></span>
          <span className="sideNavLabel">Objetivos</span>
        </button>
      </aside>

      <div className="appContent">{content}</div>
    </div>
  );
}



