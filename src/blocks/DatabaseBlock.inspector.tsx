import { useAtom, useSetAtom, useStore } from 'jotai';
import { useEffect, useState } from 'react';
import { getCollectionPrivate, setCollectionPrivate } from '../lib/collections';
import { computeDatabaseOutput } from '../lib/databaseOutput';
import { isoDate, COLUMN_TYPE_LABELS } from '../lib/rows';
import { rulesToMigration, ruleWarnings, RULE_OPERATIONS } from '../lib/rules';
import type { ColumnType } from '../types/creora';
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName } from '../state/atoms';
import { recalculateAllFormulas } from '../lib/bindingEngine';

export default function DatabaseBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId));
  const triggerSave = useSetAtom(triggerSaveAtom);
  /**
   * The real store.
   *
   * All five column handlers called `recalculateAllFormulas(null)`, whose first
   * line is `store.get(...)`. So every add, rename, retype, delete and output
   * mode change threw `Cannot read properties of null` -- and, quietly worse,
   * skipped the recalculation entirely, so a Number Display counting rows or
   * summing a column did not move until something unrelated triggered one.
   */
  const store = useStore();

  /**
   * Per-visitor rows. The switch is NOT part of the page's saved state: it
   * lives in the database, because a flag stored in the page is a flag the
   * server never sees, and a privacy setting the server never sees is not a
   * privacy setting. Read once when the block is selected.
   */
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(true);
  const [ruleNote, setRuleNote] = useState<string | null>(null);

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
    recalculateAllFormulas(store); // Recalculate bindings in background
  };

  const handleAddColumn = () => {
    // Find unique default column name
    let colIndex = columns.length + 1;
    let colName = `Column ${colIndex}`;
    while (columns.some(c => c.name === colName)) {
      colIndex++;
      colName = `Column ${colIndex}`;
    }

    const newCols = [...columns, { name: colName, type: 'text' as ColumnType }];
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
    recalculateAllFormulas(store);
  };

  const handleChangeColumnType = (index: number, newType: ColumnType) => {
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
      } else if (newType === 'date') {
        // Whatever was typed, read once and stored as ISO. Anything unreadable
        // becomes blank rather than today -- see isoDate; a booking silently
        // dated now is worse than one left empty.
        val = isoDate(val);
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
    recalculateAllFormulas(store);
  };

  /**
   * Mark a column as used-once, or stop.
   *
   * This only records the builder's intention. The rule is ENFORCED in the
   * database (migration 0008), because a check the browser does before writing
   * is not a rule: two visitors submitting the same value in the same second
   * would both look, both find it free, and both get it. Recording it here and
   * enforcing it there is the same split as collection privacy in 0004.
   *
   * No back-fill of existing rows. Turning this on for a column that already
   * holds duplicates does not delete anything -- the builder decides what to do
   * about the rows they already have, and new writes are refused from now on.
   */
  const handleToggleColumnUnique = (index: number, used: boolean) => {
    const newCols = columns.map((c, i) => (i === index ? { ...c, unique: used } : c));
    setRuntimeState(prev => ({ ...prev, columns: newCols }));
    triggerSave(prev => prev + 1);
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
    recalculateAllFormulas(store);
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
    recalculateAllFormulas(store);
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
            <div key={col.name}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                {/*
                  From the shared record, so adding a column type cannot leave
                  the dropdown behind -- which would ship a type nobody can pick.
                */}
                {Object.entries(COLUMN_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
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
            {/*
              "Used once" is enforced in the DATABASE, not here -- see migration
              0008. A checkbox that only asked the browser to look before writing
              would be no protection at all: two visitors submitting the same
              slot in the same second would both look, both find it free, and
              both get it. That is the failure it exists to stop, merely made
              harder to reproduce.
            */}
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#475569', margin: '2px 0 8px 2px' }}
            >
              <input
                type="checkbox"
                checked={!!(col as any).unique}
                onChange={(e) => handleToggleColumnUnique(idx, e.target.checked)}
              />
              Used once — no two rows may share this value
            </label>
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
                {col.name} ({col.type === 'number' ? '#' : col.type === 'boolean' ? '?' : col.type === 'date' ? '\u1F4C5'.slice(0,0) + 'D' : 'T'}) (last row)
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

        {/*
          WHO MAY DO WHAT. Four sentences, in the same language as a filter.
          Written here and enforced in the DATABASE -- the button below turns
          them into a migration, and until that is run they are only written.
          The block says which, because that gap is the one place in this
          product where something can be said and not yet be true.
        */}
        <div style={{ border: '1px solid #fecaca', background: '#fff7f7', borderRadius: '6px', padding: '10px', marginBottom: '12px' }}>
          <div style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#b91c1c', marginBottom: '2px' }}>
            Who may
          </div>
          <div style={{ fontSize: '11px', color: '#7f1d1d', lineHeight: 1.4, marginBottom: '8px' }}>
            <code>anybody</code>, <code>nobody</code>, <code>signed in</code>, or a
            sentence like <code>{'{{Owner}} == Me'}</code>. Also <code>MyRole</code> and{' '}
            <code>MyEmail</code>. Blank means <b>nobody</b>, which is the safe default.
          </div>
          {RULE_OPERATIONS.map((op) => (
            <label key={op} style={{ display: 'block', marginBottom: '6px', fontSize: '12px' }}>
              {op === 'read' ? 'read' : op === 'insert' ? 'add' : op === 'update' ? 'change' : 'remove'}
              <input
                type="text"
                value={(runtimeState?.rules as any)?.[op] || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setRuntimeState(prev => ({ ...prev, rules: { ...(prev as any)?.rules, [op]: v } }));
                  triggerSave(prev => prev + 1);
                }}
                placeholder={op === 'read' ? 'anybody' : '{{Owner}} == Me'}
                style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }}
              />
            </label>
          ))}
          {ruleWarnings(runtimeState?.blockName || 'this table', (runtimeState?.rules as any) || {}, columns).map((w, i) => (
            <div key={i} style={{ fontSize: '11px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '6px 8px', marginTop: '6px', lineHeight: 1.4 }}>
              {w}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              try {
                const sql = rulesToMigration(runtimeState?.blockName || 'table', (runtimeState?.rules as any) || {});
                navigator.clipboard?.writeText(sql);
                setRuleNote('Copied. Supabase → SQL Editor → paste → Run. Until you do, these rules are written and NOT running.');
              } catch (err: any) {
                setRuleNote(err?.message || 'Those rules could not be turned into a migration.');
              }
            }}
            style={{ marginTop: '8px', width: '100%', padding: '7px', borderRadius: '5px', border: '1px solid #b91c1c', background: '#fff', color: '#b91c1c', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
          >
            Copy the migration that makes these real
          </button>
          {ruleNote && (
            <div style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '6px', lineHeight: 1.4 }}>{ruleNote}</div>
          )}
        </div>

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
