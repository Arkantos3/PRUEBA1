import { useState } from 'react';

type HistoryEntry = {
  id: string;
  weight: number;
  savedAt: string;
};

type Person = {
  id: string;
  name: string;
  currentWeight: number;
  history: HistoryEntry[];
};

type PersonDetailProps = {
  person: Person;
  onBack: () => void;
  onDeleteEntry: (personId: string, entryId: string) => void;
  onUpdateEntry: (personId: string, entryId: string, weight: number, date: string) => void;
};

const maxChartEntries = 80;
const chartWidth = 420;
const chartHeight = 140;
const chartPadding = 14;

function getPersonThemeClass(personId: string) {
  return `personTheme personTheme-${personId}`;
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

function getDateKey(value: string) {
  return formatDateInputValue(new Date(value));
}

function parseWeight(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getChartData(history: HistoryEntry[]) {
  const recentHistory = history.slice(0, maxChartEntries);

  if (recentHistory.length < 2) {
    return [];
  }

  const orderedHistory = [...recentHistory].reverse();
  const weights = orderedHistory.map((entry) => entry.weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const weightRange = maxWeight - minWeight || 1;

  return orderedHistory.map((entry, index) => {
      const x =
        chartPadding +
        (index * (chartWidth - chartPadding * 2)) / (orderedHistory.length - 1);
      const y =
        chartHeight -
        chartPadding -
        ((entry.weight - minWeight) / weightRange) * (chartHeight - chartPadding * 2);

      return {
        ...entry,
        x,
        y
      };
    });
}

function getChartPoints(history: ReturnType<typeof getChartData>) {
  return history.map((entry) => `${entry.x},${entry.y}`).join(' ');
}

export function PersonDetail({
  person,
  onBack,
  onDeleteEntry,
  onUpdateEntry
}: PersonDetailProps) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState('');
  const [editingDate, setEditingDate] = useState('');
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const chartData = getChartData(person.history);
  const hoveredEntry = chartData.find((entry) => entry.id === hoveredEntryId) ?? null;
  const todayDate = formatDateInputValue(new Date());

  const startEditing = (entry: HistoryEntry) => {
    setEditingEntryId(entry.id);
    setEditingWeight(entry.weight.toFixed(1));
    setEditingDate(getDateKey(entry.savedAt));
  };

  const cancelEditing = () => {
    setEditingEntryId(null);
    setEditingWeight('');
    setEditingDate('');
  };

  const saveEditing = (entryId: string) => {
    const nextWeight = parseWeight(editingWeight);

    if (nextWeight === null || nextWeight < 0 || editingDate === '') {
      return;
    }

    onUpdateEntry(person.id, entryId, nextWeight, editingDate);
    cancelEditing();
  };

  return (
    <main className="app">
      <section className={`detailHeader ${getPersonThemeClass(person.id)}`}>
        <div>
          <button type="button" className="backButton" onClick={onBack}>
            Volver
          </button>
          <p className="eyebrow">Detalle de persona</p>
          <h1 className="detailPersonName">{person.name}</h1>
          <div className={`currentWeightCard ${getPersonThemeClass(person.id)}`}>
            <span>Peso actual</span>
            <strong>{person.currentWeight.toFixed(1)} kg</strong>
          </div>
        </div>
      </section>

      <section className={`detailCard ${getPersonThemeClass(person.id)}`}>
        <div className="chart">
          <h3>Evolucion</h3>

          {chartData.length < 2 ? (
            <p className="chartEmpty">Sin datos suficientes.</p>
          ) : (
            <div className="chartWrapper">
              <svg
                viewBox="0 0 420 140"
                className="detailChartSvg"
                role="img"
                aria-label={`Evolucion del peso de ${person.name}`}
              >
                <line x1="14" y1="126" x2="406" y2="126" className="chartAxis" />
                <polyline
                  fill="none"
                  points={getChartPoints(chartData)}
                  className="chartLine"
                />
                {hoveredEntry ? (
                  <>
                    <line
                      x1={hoveredEntry.x}
                      y1="14"
                      x2={hoveredEntry.x}
                      y2="126"
                      className="chartGuide"
                    />
                    <circle
                      cx={hoveredEntry.x}
                      cy={hoveredEntry.y}
                      r="4.5"
                      className="chartHighlight"
                    />
                  </>
                ) : null}
                {chartData.map((entry) => (
                  <circle
                    key={entry.id}
                    cx={entry.x}
                    cy={entry.y}
                    r="10"
                    className="chartHoverArea"
                    onMouseEnter={() => setHoveredEntryId(entry.id)}
                    onMouseLeave={() => setHoveredEntryId((current) => (current === entry.id ? null : current))}
                  />
                ))}
              </svg>

              {hoveredEntry ? (
                <div
                  className="chartTooltip"
                  style={{
                    left: `${(hoveredEntry.x / chartWidth) * 100}%`,
                    top: `${Math.max(12, hoveredEntry.y - 10)}px`
                  }}
                >
                  <strong>{hoveredEntry.weight.toFixed(1)} kg</strong>
                  <span>{formatDate(hoveredEntry.savedAt)}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="history">
          <h3>Historial completo</h3>

          {person.history.length === 0 ? (
            <p className="historyEmpty">Todavia no hay registros.</p>
          ) : (
            <ul className="historyList detailHistoryList">
              {person.history.map((entry) => (
                <li key={entry.id} className="historyItem detailHistoryItem">
                  {editingEntryId === entry.id ? (
                    <div className="editRow">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editingWeight}
                        onChange={(event) => setEditingWeight(event.target.value)}
                      />
                      <input
                        type="date"
                        max={todayDate}
                        value={editingDate}
                        onChange={(event) => setEditingDate(event.target.value)}
                      />
                      <button type="button" className="smallButton" onClick={() => saveEditing(entry.id)}>
                        Guardar
                      </button>
                      <button type="button" className="smallButton secondaryButton" onClick={cancelEditing}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <strong>{entry.weight.toFixed(1)} kg</strong>
                        <span>{formatDate(entry.savedAt)}</span>
                      </div>

                      <div className="historyActions">
                        <button
                          type="button"
                          className="smallButton secondaryButton"
                          onClick={() => startEditing(entry)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="smallButton deleteButton"
                          onClick={() => onDeleteEntry(person.id, entry.id)}
                        >
                          Borrar
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
