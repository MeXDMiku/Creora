import { useAtom, useSetAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { getCollectionPrivate, setCollectionPrivate } from '../lib/collections';
import { computeDatabaseOutput } from '../lib/databaseOutput';
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName } from '../state/atoms';
import { recalculateAllFormulas } from '../lib/bindingEngine';

export default function DatabaseBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId));
  const triggerSave = useSetAtom(triggerSaveAtom);

  /**
   * Per-visitor rows. The switch is NOT part of the page's saved state: it
   * lives in the database, because a flag stored in the page is a flag the
   * server never sees, and a privacy setting the server never sees is not a
   * privacy setting. Read once when the block is selected.
   */
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPrivacyBusy(true);
    getCollectionPrivate(blockId).then((result) => {
      if (cancelled) return;
      setIsPrivate(result.value);
      setPrivacyError(result.error);
      setPrivacyBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [blockId]);

  const togglePrivate = async (next: boolean) => {
    setPrivacyBusy(true);
    // Shown immediately, corrected if the server disagrees. A checkbox that
    // waits on a round trip feels broken; one that lies does not get corrected.
    setIsPrivate(next);
    const result = await setCollectionPrivate(blockId, next);
    setIsPrivate(result.value);
    setPrivacyError(result.error);
    setPrivacyBusy(false);
  };

  const columns = runtimeState?.columns || [];
  const rows = runtimeState?.rows || [];
  const outputMode = runtimeState?.outputMode || 'row_count';

  const handleUpdateColumns = (newCols: typeof columns) => {
    // When columns are updated, map existing rows to align keys if name changes or types change
    const updatedRows: { id: string; [key: string]: any }[] = rows.map(row => {
      const updatedRowData: { id: string; [key: string]: any } = { id: row.id };
      newCols.forEach(col => {
        // Find if old column existed
        const oldCol = columns.find(c => c.name === col.name);
        if (oldCol) {
          updatedRowData[col.name] = row[col.name];
        } else {
          // Initialize with default
          if (col.type === 'number') updatedRowData[col.name] = 0;
          else if (col.type === 'boolean') updatedRowData[col.name] = false;
          else updatedRowData[col.name] = '';
        }
      });
      return updatedRowData;
    });

    // Make sure outputMode is still valid
    let nextOutputMode = outputMode;
    if (outputMode !== 'row_count' && !newCols.some(c => c.name === outputMode)) {
      nextOutputMode = 'row_count';
    }

    // Re-evaluate output value
    let nextValue = 0;
    nextValue = computeDatabaseOutput(updatedRows, { ...runtimeState, outputMode: nextOutputMode });

    setRuntimeState(prev => ({
      ...prev,
      columns: newCols,
      rows: updatedRows,
      outputMode: nextOutputMode,
      value: nextValue
    }));
    triggerSave(prev => prev + 1);
    recalculateAllFormulas(null); // Recalculate bindings in background
  };

  const handleAddColumn = () => {
    // Find unique default column name
    let colIndex = columns.length + 1;
    let colName = `Column ${colIndex}`;
    while (columns.some(c => c.name === colName)) {
      colIndex++;
      colName = `Column ${colIndex}`;
    }

    const newCols = [...columns, { name: colName, type: 'text' as const }];
    handleUpdateColumns(newCols);
  };

  const handleRenameColumn = (index: number, newName: string) => {
    if (newName.trim() === '') return;
    const oldName = columns[index].name;

    const newCols = columns.map((c, i) => {
      if (i === index) {
        return { ...c, name: newName };
      }
      return c;
    });

    // Rename keys in rows
    const updatedRows: { id: string; [key: string]: any }[] = rows.map(row => {
      const { [oldName]: oldVal, ...rest } = row;
      return { ...rest, [newName]: oldVal } as { id: string; [key: string]: any };
    });

    // Update outputMode if it matched oldName
    let nextOutputMode = outputMode;
    if (outputMode === oldName) {
      nextOutputMode = newName;
    }

    // Re-evaluate output value
    let nextValue = 0;
    nextValue = computeDatabaseOutput(updatedRows, { ...runtimeState, outputMode: nextOutputMode });

    setRuntimeState(prev => ({
      ...prev,
      columns: newCols,
      rows: updatedRows,
      outputMode: nextOutputMode,
      value: nextValue
    }));
    triggerSave(prev => prev + 1);
    recalculateAllFormulas(null);
  };

  const handleChangeColumnType = (index: number, newType: 'text' | 'number' | 'boolean') => {
    const colName = columns[index].name;
    const newCols = columns.map((c, i) => {
      if (i === index) {
        return { ...c, type: newType };
      }
      return c;
    });

    // Cast types in rows
    const updatedRows: { id: string; [key: string]: any }[] = rows.map(row => {
      let val = row[colName];
      if (newType === 'number') {
        const parsed = Number(val);
        val = isNaN(parsed) ? 0 : parsed;
      } else if (newType === 'boolean') {
        val = !!val;
      } else {
        val = String(val === undefined || val === null ? '' : val);
      }
      return { ...row, [colName]: val };
    });

    // Re-evaluate output value
    let nextValue = 0;
    nextValue = computeDatabaseOutput(updatedRows, runtimeState);

    setRuntimeState(prev => ({
      ...prev,
      columns: newCols,
      rows: updatedRows,
      value: nextValue
    }));
    triggerSave(prev => prev + 1);
    recalculateAllFormulas(null);
  };

  const handleDeleteColumn = (index: number) => {
    const colName = columns[index].name;
    const newCols = columns.filter((_, i) => i !== index);

    // Delete keys in rows
    const updatedRows: { id: string; [key: string]: any }[] = rows.map(row => {
      const { [colName]: _, ...rest } = row;
      return rest as { id: string; [key: string]: any };
    });

    // Check if outputMode was this column
    let nextOutputMode = outputMode;
    if (outputMode === colName) {
      nextOutputMode = 'row_count';
    }

    // Re-evaluate output value
    let nextValue = 0;
    nextValue = computeDatabaseOutput(updatedRows, { ...runtimeState, outputMode: nextOutputMode });

    setRuntimeState(prev => ({
      ...prev,
      columns: newCols,
      rows: updatedRows,
      outputMode: nextOutputMode,
      value: nextValue
    }));
    triggerSave(prev => prev + 1);
    recalculateAllFormulas(null);
  };

  const handleSelectOutputMode = (mode: string) => {
    // Re-evaluate output value
    let nextValue = 0;
    nextValue = computeDatabaseOutput(rows, { ...runtimeState, outputMode: mode });

    setRuntimeState(prev => ({
      ...prev,
      outputMode: mode,
      value: nextValue
    }));
    triggerSave(prev => prev + 1);
    recalculateAllFormulas(null);
  };

  const controlLabelStyle = { display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 500, color: '#475569' };
  const inputStyle = { display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' as const, background: '#f8fafc', color: '#0f172a', outline: 'none', fontSize: '13px' };

  return (
    <div>
      {/* Who can see these rows. First, because it is the question with the
          worst consequences if it is answered wrongly. */}
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '10px',
          marginBottom: '12px',
          background: '#f8fafc',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={isPrivate}
            disabled={privacyBusy}
            onChange={(e) => void togglePrivate(e.target.checked)}
            style={{ marginTop: '3px' }}
          />
          <span>
            Each visitor only sees their own rows
            <span style={{ display: 'block', fontSize: '11px', color: '#64748b', lineHeight: 1.4, marginTop: '2px' }}>
              For carts, orders and saved things. The server enforces this, not
              the page, so the other rows are not simply hidden - they are never
              sent. You still see everything, because it is your page.
            </span>
          </span>
        </label>

        {isPrivate && !privacyError && (
          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, marginTop: '8px' }}>
            A visitor is one browser. Clearing site data, or opening the page on
            a phone instead of a laptop, is a different visitor with an empty
            list. Real accounts for visitors are next.
          </div>
        )}

        {privacyError && (
          <div style={{ fontSize: '11px', color: '#b91c1c', lineHeight: 1.4, marginTop: '8px' }}>
            {privacyError}
          </div>
        )}
      </div>

      {/* Block Name */}
      <label style={controlLabelStyle}>
        Block Name
        <input
          type="text"
          value={runtimeState?.blockName || ''}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, blockName: e.target.value }));
            triggerSave(prev => prev + 1);
          }}
          placeholder={getBlockTypeDisplayName('databaseBlock')}
          style={inputStyle}
        />
      </label>

      {/* Column Definitions */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
          Define Columns
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {columns.map((col, idx) => (
            <div key={col.name} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="text"
                value={col.name}
                onChange={(e) => handleRenameColumn(idx, e.target.value)}
                style={{ flex: 2, padding: '4px 6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none' }}
              />
              <select
                value={col.type}
                onChange={(e) => handleChangeColumnType(idx, e.target.value as any)}
                style={{ flex: 1.5, padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none' }}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
              </select>
              <button
                onClick={() => handleDeleteColumn(idx)}
                style={{
                  background: '#fee2e2',
                  color: '#ef4444',
                  border: 'none',
                  borderRadius: '4px',
                  width: '24px',
                  height: '24px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Delete Column"
              >
                -
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAddColumn}
          style={{
            width: '100%',
            padding: '6px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#475569',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'center',
            outline: 'none'
          }}
        >
          + Add Column
        </button>
      </div>

      {/* Output Mode Selector */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
        <label style={controlLabelStyle}>
          Port Output Type / Value
          <select
            value={outputMode}
            onChange={(e) => handleSelectOutputMode(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="row_count">How many rows (count)</option>
            <option value="sum">Sum of a column</option>
            <option value="average">Average of a column</option>
            <option value="lowest">Lowest in a column</option>
            <option value="highest">Highest in a column</option>
            {columns.map(col => (
              <option key={col.name} value={col.name}>
                {col.name} ({col.type === 'number' ? '#' : col.type === 'boolean' ? '?' : 'T'}) (last row)
              </option>
            ))}
          </select>
        </label>

        {['sum', 'average', 'lowest', 'highest'].includes(outputMode) && (
          <label style={controlLabelStyle}>
            …of which column
            <select
              value={runtimeState.outputColumn || ''}
              onChange={(e) => { setRuntimeState(prev => ({ ...prev, outputColumn: e.target.value })); triggerSave(prev => prev + 1) }}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Pick a column</option>
              {columns.filter(c => c.type === 'number').map(col => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </label>
        )}

        {/* "How many videos did THIS person upload" is a count with a condition.
            One optional filter turns every mode above into a per-something answer. */}
        <label style={controlLabelStyle}>
          Only count rows where…
          <select
            value={runtimeState.filterColumn || ''}
            onChange={(e) => { setRuntimeState(prev => ({ ...prev, filterColumn: e.target.value })); triggerSave(prev => prev + 1) }}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Every row (no filter)</option>
            {columns.map(col => (
              <option key={col.name} value={col.name}>{col.name}</option>
            ))}
          </select>
        </label>

        {runtimeState.filterColumn && (
          <label style={controlLabelStyle}>
            …equals
            <input
              type="text"
              value={runtimeState.filterValue || ''}
              onChange={(e) => { setRuntimeState(prev => ({ ...prev, filterValue: e.target.value })); triggerSave(prev => prev + 1) }}
              placeholder="e.g. aridaman@example.com"
              style={inputStyle}
            />
          </label>
        )}
      </div>

      {/* Visual Styles */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
          Visual Styling
        </span>

        <label style={controlLabelStyle}>
          Background Color
          <input
            type="color"
            value={runtimeState?.backgroundColor || '#ffffff'}
            onChange={(e) => {
              setRuntimeState(prev => ({ ...prev, backgroundColor: e.target.value }));
              triggerSave(prev => prev + 1);
            }}
            style={{ display: 'block', marginTop: '4px', width: '100%' }}
          />
        </label>

        <label style={controlLabelStyle}>
          Border Radius: {runtimeState?.borderRadius ?? 8}px
          <input
            type="range"
            min="0"
            max="24"
            value={runtimeState?.borderRadius ?? 8}
            onInput={(e) => {
              setRuntimeState(prev => ({
                ...prev,
                borderRadius: Number((e.target as HTMLInputElement).value),
              }));
              triggerSave(prev => prev + 1);
            }}
            style={{ display: 'block', marginTop: '4px', width: '100%' }}
          />
        </label>

        <label style={controlLabelStyle}>
          Opacity: {runtimeState?.opacity ?? 100}%
          <input
            type="range"
            min="0"
            max="100"
            value={runtimeState?.opacity ?? 100}
            onInput={(e) => {
              setRuntimeState(prev => ({
                ...prev,
                opacity: Number((e.target as HTMLInputElement).value),
              }));
              triggerSave(prev => prev + 1);
            }}
            style={{ display: 'block', marginTop: '4px', width: '100%' }}
          />
        </label>

        <label style={controlLabelStyle}>
          Width (px)
          <input
            type="number"
            placeholder="400"
            value={runtimeState?.width !== undefined ? runtimeState.width : ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : Number(e.target.value);
              setRuntimeState(prev => ({ ...prev, width: val }));
              triggerSave(prev => prev + 1);
            }}
            style={inputStyle}
          />
        </label>

        <label style={controlLabelStyle}>
          Font Size (px)
          <input
            type="number"
            placeholder="13"
            value={runtimeState?.fontSize !== undefined ? runtimeState.fontSize : ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : Number(e.target.value);
              setRuntimeState(prev => ({ ...prev, fontSize: val }));
              triggerSave(prev => prev + 1);
            }}
            style={inputStyle}
          />
        </label>

        <label style={controlLabelStyle}>
          Text Color
          <input
            type="color"
            value={runtimeState?.textColor || '#0f172a'}
            onChange={(e) => {
              setRuntimeState(prev => ({ ...prev, textColor: e.target.value }));
              triggerSave(prev => prev + 1);
            }}
            style={{ display: 'block', marginTop: '4px', width: '100%' }}
          />
        </label>
      </div>
    </div>
  );
}
