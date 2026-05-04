import React, { useState } from 'react';
import { createMapping, createCollectMapping, createRandomMapping, removeMappingById } from './MappingHandler';

// ─── Clickable JSON Tree ──────────────────────────────────────────────────────

function ClickableTree({ data, path = 'data', onSelect }) {
  const [collapsed, setCollapsed] = useState(path !== 'data');

  if (data === null || data === undefined)
    return <span className="json-null" style={{ cursor: 'pointer' }} onClick={() => onSelect(path)}>null</span>;
  if (typeof data === 'boolean')
    return <span className="json-bool" style={{ cursor: 'pointer' }} onClick={() => onSelect(path)}>{String(data)}</span>;
  if (typeof data === 'number')
    return <span className="json-number" style={{ cursor: 'pointer' }} onClick={() => onSelect(path)}>{data}</span>;
  if (typeof data === 'string')
    return <span className="json-string" style={{ cursor: 'pointer' }} onClick={() => onSelect(path)}>"{data}"</span>;

  if (Array.isArray(data)) {
    return (
      <span>
        <span className="json-expand" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▶' : '▼'} [{data.length}]</span>
        {!collapsed && (
          <div style={{ marginLeft: 14 }}>
            {data.slice(0, 5).map((item, i) => (
              <div key={i}>
                <span className="json-key" onClick={() => onSelect(`${path}[${i}]`)}>{i}: </span>
                <ClickableTree data={item} path={`${path}[${i}]`} onSelect={onSelect} />
              </div>
            ))}
            {data.length > 5 && <div style={{ color: '#475569', fontSize: '0.7rem' }}>…{data.length - 5} more</div>}
          </div>
        )}
      </span>
    );
  }

  if (typeof data === 'object') {
    return (
      <span>
        <span className="json-expand" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▶' : '▼'} {`{${Object.keys(data).length}}`}</span>
        {!collapsed && (
          <div style={{ marginLeft: 14 }}>
            {Object.keys(data).map((key) => (
              <div key={key} style={{ marginBottom: 1 }}>
                <span className="json-key" title={`${path}.${key}`} onClick={() => onSelect(`${path}.${key}`)}>{key}</span>
                <span style={{ color: '#475569' }}>: </span>
                <ClickableTree data={data[key]} path={`${path}.${key}`} onSelect={onSelect} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getValueAtPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
const BODY_METHODS = ['POST', 'PUT', 'PATCH'];

// ─── Mappings Tab ─────────────────────────────────────────────────────────────

function MappingsTab({ nodeId, nodes, mappings, onUpdateMappings, results, onConfigureIteration, currentIteration }) {
  const [form, setForm] = useState({ fromNodeId: '', fromPath: '', toField: '' });
  // array mode: 'single' | 'iterate' | 'collect'
  const [arrayMode, setArrayMode] = useState('single');
  // iterate state
  const [itemKey, setItemKey] = useState('');
  const [injectInto, setInjectInto] = useState('');
  const [stopPath, setStopPath] = useState('');
  const [stopCheck, setStopCheck] = useState('not-empty');
  const [storeAs, setStoreAs] = useState('');
  // collect state
  const [collectField, setCollectField] = useState('');
  const [collectParamName, setCollectParamName] = useState('');
  // random state
  const [randomField, setRandomField] = useState('');
  const [randomInjectInto, setRandomInjectInto] = useState('');
  // edit state
  const [editingId, setEditingId] = useState(null);

  const startEdit = (m) => {
    if (m.type === 'collect') {
      setForm({ fromNodeId: m.from.nodeId, fromPath: m.from.arrayPath, toField: '' });
      setArrayMode('collect');
      setCollectField(m.from.fieldPath || '');
      setCollectParamName(m.to.paramName || '');
      setRandomField('');
      setRandomInjectInto('');
    } else if (m.type === 'random') {
      setForm({ fromNodeId: m.from.nodeId, fromPath: m.from.arrayPath, toField: '' });
      setArrayMode('random');
      setRandomField(m.from.fieldPath || '');
      setRandomInjectInto(m.to.field || '');
      setCollectField('');
      setCollectParamName('');
    } else {
      setForm({ fromNodeId: m.from.nodeId, fromPath: m.from.path, toField: m.to.field });
      setArrayMode('single');
      setCollectField('');
      setCollectParamName('');
      setRandomField('');
      setRandomInjectInto('');
    }
    setEditingId(m.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ fromNodeId: '', fromPath: '', toField: '' });
    setArrayMode('single');
    setRandomField('');
    setRandomInjectInto('');
  };

  const nodeMappings = mappings.filter((m) => m.to.nodeId === nodeId);
  const otherNodes = nodes.filter((n) => n.id !== nodeId);

  const sourceResult = form.fromNodeId ? results?.[form.fromNodeId] : null;
  const sourceData = Array.isArray(sourceResult)
    ? sourceResult.find((r) => r.response)?.response
    : sourceResult;

  const selectedValue = sourceData ? getValueAtPath(sourceData, form.fromPath) : undefined;
  const selectedIsArray = Array.isArray(selectedValue);
  const firstItem = selectedIsArray && selectedValue.length > 0 ? selectedValue[0] : null;
  const itemKeys = firstItem && typeof firstItem === 'object' ? Object.keys(firstItem) : [];

  const selectPath = (path) => {
    setForm((f) => ({ ...f, fromPath: path }));
    setArrayMode('single');
    setItemKey('');
    setCollectField('');
  };

  const isFormValid = form.fromNodeId && form.fromPath.trim() && form.toField.trim();

  const addMapping = () => {
    if (!isFormValid) return;
    const m = createMapping(form.fromNodeId, form.fromPath.trim(), nodeId, form.toField.trim());
    if (editingId) {
      m.id = editingId;
      onUpdateMappings(mappings.map((x) => x.id === editingId ? m : x));
      setEditingId(null);
    } else {
      onUpdateMappings([...mappings, m]);
    }
    setForm((f) => ({ ...f, fromPath: '', toField: '' }));
  };

  const applyIteration = () => {
    const iterConfig = {
      source: { nodeId: form.fromNodeId, path: form.fromPath.trim() },
      itemPath: itemKey,
      mode: 'sequential',
      stopCondition: stopPath.trim() ? { path: stopPath.trim(), check: stopCheck } : undefined,
      storeAs: storeAs.trim() || undefined,
    };
    onConfigureIteration(iterConfig);

    // If user wants to inject the extracted value into a specific request field (beyond {{item}} in URL).
    // The path is left empty: iteration.itemPath already does the extraction, so the mapping
    // just forwards the resulting itemValue to the target request field.
    if (injectInto.trim()) {
      const m = createMapping('__iteration__', '', nodeId, injectInto.trim());
      onUpdateMappings([...mappings, m]);
    }

    setForm({ fromNodeId: form.fromNodeId, fromPath: '', toField: '' });
    setArrayMode('single');
    setItemKey('');
    setInjectInto('');
    setStopPath('');
    setStopCheck('not-empty');
    setStoreAs('');
  };

  const applyCollect = () => {
    const m = createCollectMapping(form.fromNodeId, form.fromPath.trim(), collectField, nodeId, collectParamName.trim());
    if (editingId) {
      m.id = editingId;
      onUpdateMappings(mappings.map((x) => x.id === editingId ? m : x));
      setEditingId(null);
    } else {
      onUpdateMappings([...mappings, m]);
    }
    setForm({ fromNodeId: form.fromNodeId, fromPath: '', toField: '' });
    setArrayMode('single');
    setCollectField('');
    setCollectParamName('');
  };

  const applyRandom = () => {
    const m = createRandomMapping(form.fromNodeId, form.fromPath.trim(), randomField, nodeId, randomInjectInto.trim());
    if (editingId) {
      m.id = editingId;
      onUpdateMappings(mappings.map((x) => x.id === editingId ? m : x));
      setEditingId(null);
    } else {
      onUpdateMappings([...mappings, m]);
    }
    setForm({ fromNodeId: form.fromNodeId, fromPath: '', toField: '' });
    setArrayMode('single');
    setRandomField('');
    setRandomInjectInto('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Active iteration badge */}
      {currentIteration && (
        <div style={{ background: '#1c1135', border: '1px solid #5b21b6', borderRadius: 6, padding: '8px 10px', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ color: '#a78bfa', fontWeight: 600 }}>⟳ Auto-iterate active</span>
            <button className="btn-danger-sm" onClick={() => onConfigureIteration(undefined)}>Remove</button>
          </div>
          <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>
            <div>Array: <span className="mapping-path">{currentIteration.source?.path}</span></div>
            {currentIteration.itemPath && <div>Key: <span className="mapping-path">{currentIteration.itemPath}</span></div>}
            {currentIteration.stopCondition?.path && (
              <div>Stop when <span className="mapping-path">{currentIteration.stopCondition.path}</span> is {currentIteration.stopCondition.check}</div>
            )}
            {currentIteration.storeAs && (
              <div>Store matched value as <span className="mapping-path">data.{currentIteration.storeAs}</span></div>
            )}
          </div>
        </div>
      )}

      {/* Add mapping / configure iteration form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#262a3d', borderRadius: 6, padding: 10, border: editingId ? '1px solid #5b21b6' : '1px solid transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.72rem', color: editingId ? '#a78bfa' : '#7c3aed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            {editingId ? 'Edit Mapping' : 'Add Mapping'}
          </div>
          {editingId && (
            <button className="btn-sm-dark" style={{ fontSize: '0.7rem', padding: '2px 8px' }} onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>

        {/* Source node */}
        <div>
          <label className="form-label-sm">From Node</label>
          <select
            className="dark-select"
            value={form.fromNodeId}
            onChange={(e) => setForm({ fromNodeId: e.target.value, fromPath: '', toField: '' })}
          >
            <option value="">Select source node...</option>
            {otherNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.data?.label || n.id}</option>
            ))}
          </select>
        </div>

        {/* Source path + inline tree */}
        {form.fromNodeId && (
          <div>
            <label className="form-label-sm">
              Source Path
              {sourceData && <span style={{ color: '#475569', textTransform: 'none', marginLeft: 4 }}>— click to select</span>}
            </label>
            <input
              className="dark-input"
              value={form.fromPath}
              onChange={(e) => selectPath(e.target.value)}
              placeholder="e.g. data.user.id"
              style={{ marginBottom: 6 }}
            />
            {sourceData ? (
              <div style={{ background: '#0f1117', border: '1px solid #2d3148', borderRadius: 5, padding: '6px 8px', maxHeight: 180, overflowY: 'auto' }} className="json-tree">
                <ClickableTree data={sourceData.data} path="data" onSelect={selectPath} />
              </div>
            ) : (
              <div style={{ color: '#475569', fontSize: '0.72rem', fontStyle: 'italic' }}>
                Run the workflow first to browse response fields.
              </div>
            )}
          </div>
        )}

        {/* Array detected */}
        {selectedIsArray && form.fromPath && (
          <div style={{ background: '#1a1d27', border: '1px solid #3d4166', borderRadius: 6, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 600 }}>
                Array · {selectedValue.length} items
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['single', 'Single value'], ['as-is', 'Whole array'], ['random', 'Random item'], ['iterate', 'Auto-iterate'], ['collect', 'Collect all']].map(([mode, label]) => (
                  <button
                    key={mode}
                    className="btn-sm-dark"
                    style={{ fontSize: '0.7rem', ...(arrayMode === mode ? { borderColor: '#7c3aed', color: '#a78bfa' } : {}) }}
                    onClick={() => setArrayMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {arrayMode === 'random' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label className="form-label-sm">Which field to pick from the random item?</label>
                  {itemKeys.length > 0 ? (
                    <select className="dark-select" value={randomField} onChange={(e) => setRandomField(e.target.value)}>
                      <option value="">— whole item —</option>
                      {itemKeys.map((k) => (
                        <option key={k} value={k}>
                          {k} — e.g. {JSON.stringify(firstItem[k])?.slice(0, 24)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="dark-input" value={randomField} onChange={(e) => setRandomField(e.target.value)} placeholder="field name, e.g. id" />
                  )}
                </div>
                <div>
                  <label className="form-label-sm">Inject into</label>
                  <input
                    className="dark-input"
                    value={randomInjectInto}
                    onChange={(e) => setRandomInjectInto(e.target.value)}
                    placeholder="body.userId · headers.X-Id · queryParam.x · urlParam.id"
                  />
                </div>
                <button
                  className="btn-run"
                  style={{ padding: '7px 12px' }}
                  disabled={!randomInjectInto.trim()}
                  onClick={applyRandom}
                >
                  ✓ Apply Random item
                </button>
              </div>
            )}

            {arrayMode === 'iterate' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Step 1: key to extract */}
                <div>
                  <label className="form-label-sm">1. Which key to pass per item?</label>
                  {itemKeys.length > 0 ? (
                    <select className="dark-select" value={itemKey} onChange={(e) => setItemKey(e.target.value)}>
                      <option value="">— whole item —</option>
                      {itemKeys.map((k) => (
                        <option key={k} value={k}>
                          {k} — e.g. {JSON.stringify(firstItem[k])?.slice(0, 24)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="dark-input" value={itemKey} onChange={(e) => setItemKey(e.target.value)} placeholder="field name, e.g. id" />
                  )}
                </div>

                {/* Step 2: where to inject */}
                <div>
                  <label className="form-label-sm">
                    2. Inject into request field
                    <span style={{ color: '#475569', textTransform: 'none', marginLeft: 4 }}>
                      (or use <span className="mapping-path">{'{{item}}'}</span> in the URL)
                    </span>
                  </label>
                  <input
                    className="dark-input"
                    value={injectInto}
                    onChange={(e) => setInjectInto(e.target.value)}
                    placeholder="body.cityId · headers.X-Id · queryParam.x · urlParam.id  (optional)"
                  />
                </div>

                {/* Step 3: stop condition */}
                <div>
                  <label className="form-label-sm">3. Stop when response has data at path</label>
                  <input
                    className="dark-input"
                    value={stopPath}
                    onChange={(e) => setStopPath(e.target.value)}
                    placeholder="e.g. data.cinemas  or  data.results"
                    style={{ marginBottom: 6 }}
                  />
                  <select className="dark-select" value={stopCheck} onChange={(e) => setStopCheck(e.target.value)}>
                    <option value="not-empty">is not empty (array has items / value is set)</option>
                    <option value="exists">exists (not null / undefined)</option>
                    <option value="truthy">is truthy</option>
                  </select>
                </div>

                {/* Step 4: store the matching item value */}
                <div>
                  <label className="form-label-sm">
                    4. Store matched value as
                    <span style={{ color: '#475569', textTransform: 'none', marginLeft: 4 }}>
                      (optional — exposed as <span className="mapping-path">data.&lt;name&gt;</span> in next nodes)
                    </span>
                  </label>
                  <input
                    className="dark-input"
                    value={storeAs}
                    onChange={(e) => setStoreAs(e.target.value)}
                    placeholder="e.g. matchedCityId"
                  />
                </div>

                <button
                  className="btn-run"
                  style={{ padding: '7px 12px' }}
                  disabled={!itemKey && itemKeys.length > 0}
                  onClick={applyIteration}
                >
                  ✓ Apply Auto-iterate
                </button>
              </div>
            )}

            {arrayMode === 'collect' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label className="form-label-sm">Which field to collect from each item?</label>
                  {itemKeys.length > 0 ? (
                    <select className="dark-select" value={collectField} onChange={(e) => setCollectField(e.target.value)}>
                      <option value="">— whole item —</option>
                      {itemKeys.map((k) => (
                        <option key={k} value={k}>
                          {k} — e.g. {JSON.stringify(firstItem[k])?.slice(0, 24)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="dark-input" value={collectField} onChange={(e) => setCollectField(e.target.value)} placeholder="field name, e.g. id" />
                  )}
                </div>
                <div>
                  <label className="form-label-sm">
                    Query param name
                    <span style={{ color: '#475569', textTransform: 'none', marginLeft: 4 }}>
                      — will become <span className="mapping-path">name[]=val1&name[]=val2</span>
                    </span>
                  </label>
                  <input
                    className="dark-input"
                    value={collectParamName}
                    onChange={(e) => setCollectParamName(e.target.value)}
                    placeholder="e.g. cinemaIds"
                  />
                </div>
                <button
                  className="btn-run"
                  style={{ padding: '7px 12px' }}
                  disabled={!collectParamName.trim()}
                  onClick={applyCollect}
                >
                  ✓ Apply Collect all
                </button>
              </div>
            )}

            {arrayMode === 'single' && (
              /* Single value — pick index */
              <div>
                <label className="form-label-sm">Use index</label>
                <input
                  className="dark-input"
                  type="number"
                  min="0"
                  value={form.fromPath.match(/\[(\d+)\]$/)?.[1] ?? '0'}
                  onChange={(e) => {
                    const base = form.fromPath.replace(/\[\d+\]$/, '');
                    selectPath(`${base}[${e.target.value}]`);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Normal inject-into (single value, or whole array as-is) */}
        {(!selectedIsArray || arrayMode === 'single' || arrayMode === 'as-is') && (
          <>
            <div>
              <label className="form-label-sm">Inject Into</label>
              <input
                className="dark-input"
                value={form.toField}
                onChange={(e) => setForm((f) => ({ ...f, toField: e.target.value }))}
                placeholder="body.userId · headers.X-Id · queryParam.city · urlParam.cityId"
                onKeyDown={(e) => e.key === 'Enter' && addMapping()}
              />
            </div>
            <button
              className="btn-run"
              style={{ padding: '6px 12px', opacity: isFormValid ? 1 : 0.4 }}
              disabled={!isFormValid}
              onClick={addMapping}
            >
              {editingId ? '✓ Update Mapping' : '+ Add Mapping'}
            </button>
          </>
        )}
      </div>

      {/* Active mappings */}
      {nodeMappings.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="form-label-sm">Active Mappings ({nodeMappings.length})</label>
          {nodeMappings.map((m) => (
            <div key={m.id} className="mapping-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1, overflow: 'hidden', fontSize: '0.75rem', lineHeight: 1.6 }}>
                {m.type === 'collect' ? (
                  <>
                    <div>
                      <span style={{ color: '#f97316', fontWeight: 600 }}>collect </span>
                      <span className="mapping-path">{nodes.find(n => n.id === m.from.nodeId)?.data?.label || m.from.nodeId}</span>
                      <span style={{ color: '#64748b' }}> › </span>
                      <span className="mapping-path">{m.from.arrayPath}</span>
                      {m.from.fieldPath && <><span style={{ color: '#64748b' }}>[*].</span><span className="mapping-path">{m.from.fieldPath}</span></>}
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>→ query </span>
                      <span className="mapping-path">{m.to.paramName}[]</span>
                    </div>
                  </>
                ) : m.type === 'random' ? (
                  <>
                    <div>
                      <span style={{ color: '#a78bfa', fontWeight: 600 }}>random </span>
                      <span className="mapping-path">{nodes.find(n => n.id === m.from.nodeId)?.data?.label || m.from.nodeId}</span>
                      <span style={{ color: '#64748b' }}> › </span>
                      <span className="mapping-path">{m.from.arrayPath}</span>
                      {m.from.fieldPath && <><span style={{ color: '#64748b' }}>[?].</span><span className="mapping-path">{m.from.fieldPath}</span></>}
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>→ </span>
                      <span className="mapping-path">{m.to.field}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span style={{ color: '#64748b' }}>from </span>
                      <span className="mapping-path">
                        {m.from.nodeId === '__iteration__' ? 'iteration' : (nodes.find(n => n.id === m.from.nodeId)?.data?.label || m.from.nodeId)}
                      </span>
                      {m.from.path && <><span style={{ color: '#64748b' }}> → </span><span className="mapping-path">{m.from.path}</span></>}
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>into </span>
                      <span className="mapping-path">{m.to.field}</span>
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  className="btn-sm-dark"
                  style={{ fontSize: '0.7rem', padding: '2px 7px', ...(editingId === m.id ? { borderColor: '#7c3aed', color: '#a78bfa' } : {}) }}
                  onClick={() => editingId === m.id ? cancelEdit() : startEdit(m)}
                >
                  ✎
                </button>
                <button className="btn-danger-sm" onClick={() => onUpdateMappings(removeMappingById(mappings, m.id))}>✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#475569', fontSize: '0.78rem', textAlign: 'center', padding: '8px 0' }}>
          No mappings yet.
        </div>
      )}
    </div>
  );
}

// ─── Transform Node Config ────────────────────────────────────────────────────

function TransformNodeConfig({ id, data, nodes, results, onUpdateNode }) {
  const otherNodes = nodes.filter((n) => n.id !== id);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label className="form-label-sm">Transform Script</label>
        <div style={{ color: '#475569', fontSize: 11, marginBottom: 6 }}>
          Function body with access to <span className="mapping-path">results</span> (all prior node responses) and <span className="mapping-path">_</span> (lodash). Use <span className="mapping-path">return</span> to output the result.
        </div>
        <textarea
          className="dark-textarea"
          style={{ fontFamily: 'Consolas, monospace', fontSize: 12, minHeight: 220 }}
          value={data.transform || ''}
          onChange={(e) => onUpdateNode(id, { ...data, transform: e.target.value })}
          placeholder={"// Access previous node responses via results['node_id'].data\n// Example:\nconst areas = results['node_1'].data.seatLayoutData.areas;\nreturn {\n  tickets: areas.map(area => ({\n    price: area.ticket.price,\n    ticketTypeCode: area.ticket.ticketTypeCode,\n    description: area.description,\n    seats: area.rows.flatMap(r => r.seats)\n      .filter(s => !s.isDisabled && s.seatStyle !== 'EMPTY')\n      .sort(() => Math.random() - 0.5)\n      .slice(0, 2)\n      .map(s => ({ seatsInGroup: [], position: s.position, isDisabled: false, seatStyle: s.seatStyle }))\n  }))\n};"}
          spellCheck={false}
        />
      </div>

      {otherNodes.length > 0 && (
        <div>
          <label className="form-label-sm">Available in results</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {otherNodes.map((n) => (
              <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                <span className="mapping-path" style={{ userSelect: 'all', cursor: 'text' }}>results['{n.id}'].data</span>
                <span style={{ color: '#475569' }}>{n.data.label}</span>
                {results?.[n.id] && !results[n.id].error && (
                  <span style={{ color: '#22c55e', fontSize: 10 }}>✓</span>
                )}
                {results?.[n.id]?.error && (
                  <span style={{ color: '#f87171', fontSize: 10 }}>✗</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Condition Section ────────────────────────────────────────────────────────

function ConditionSection({ data, onUpdate, results, otherNodes }) {
  const [open, setOpen] = useState(!!data.condition?.trim());

  let evalResult = null;
  if (open && data.condition?.trim() && results) {
    try {
      // eslint-disable-next-line no-new-func
      const val = new Function('results', `"use strict"; return (${data.condition})`)(results);
      evalResult = { ok: true, pass: !!val };
    } catch (e) {
      evalResult = { ok: false, error: e.message };
    }
  }

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', marginBottom: open ? 10 : 0 }}
      >
        <span style={{ color: '#475569', fontSize: '0.6rem' }}>{open ? '▼' : '▶'}</span>
        <span className="form-label-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>Run Condition</span>
        {data.condition?.trim() && (
          <span style={{ marginLeft: 'auto', background: '#1c1135', color: '#a78bfa', borderRadius: 8, padding: '0 5px', fontSize: '0.65rem' }}>
            active
          </span>
        )}
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: '#475569', fontSize: 11, lineHeight: 1.5 }}>
            Node executes only if this JS expression is truthy. Leave blank to always run.
          </div>
          <textarea
            className="dark-textarea"
            style={{ fontFamily: 'Consolas, monospace', fontSize: 12, minHeight: 72 }}
            value={data.condition || ''}
            onChange={(e) => onUpdate('condition', e.target.value)}
            placeholder={"// examples:\n!!results['node_id'].data\nresults['node_id'].data?.items?.length > 0"}
            spellCheck={false}
          />
          {evalResult && (
            <div style={{ fontSize: '0.72rem', color: evalResult.ok ? (evalResult.pass ? '#22c55e' : '#f97316') : '#f87171' }}>
              {evalResult.ok
                ? (evalResult.pass ? '✓ passes — node will run' : '✗ fails — node will be skipped')
                : `Error: ${evalResult.error}`}
            </div>
          )}
          {otherNodes?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label-sm">Available nodes</label>
              {otherNodes.map((n) => (
                <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                  <span className="mapping-path" style={{ userSelect: 'all', cursor: 'text' }}>results['{n.id}']</span>
                  <span style={{ color: '#475569' }}>{n.data?.label}</span>
                  {results?.[n.id] && !results[n.id].error && !results[n.id].skipped && <span style={{ color: '#22c55e', fontSize: 10 }}>✓</span>}
                  {results?.[n.id]?.skipped && <span style={{ color: '#64748b', fontSize: 10 }}>skipped</span>}
                </div>
              ))}
            </div>
          )}
          {data.condition?.trim() && (
            <button className="btn-danger-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onUpdate('condition', '')}>
              Clear condition
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function NodeConfigPanel({ node, nodes, mappings, results, onUpdateNode, onUpdateMappings }) {
  const [activeTab, setActiveTab] = useState('request');
  const [headersRaw, setHeadersRaw] = useState('{}');
  const [bodyRaw, setBodyRaw] = useState('{}');

  React.useEffect(() => {
    if (node && node.type !== 'transformNode') {
      setHeadersRaw(JSON.stringify(node.data.request?.headers || {}, null, 2));
      setBodyRaw(JSON.stringify(node.data.request?.body || {}, null, 2));
    }
  }, [node?.id]);

  if (!node) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <div style={{ fontSize: '1.5rem' }}>🖱️</div>
        <div>Select a node to configure it</div>
      </div>
    );
  }

  const { data, id } = node;

  const update = (field, value) => onUpdateNode(id, { ...data, [field]: value });

  if (node.type === 'inputNode') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #2d3148', flexShrink: 0 }}>
          <input
            className="dark-input"
            value={data.label || ''}
            onChange={(e) => update('label', e.target.value)}
            placeholder="Node label"
            style={{ fontWeight: 600 }}
          />
          <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#475569', fontFamily: 'Consolas, monospace', userSelect: 'all' }}>{id}</div>
        </div>
        <div className="right-panel-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="form-label-sm">Prompt shown to user</label>
              <input
                className="dark-input"
                value={data.prompt || ''}
                onChange={(e) => update('prompt', e.target.value)}
                placeholder="e.g. Enter the OTP sent to your mobile"
              />
            </div>
            <div>
              <label className="form-label-sm">Field name</label>
              <input
                className="dark-input"
                value={data.fieldName || ''}
                onChange={(e) => update('fieldName', e.target.value)}
                placeholder="e.g. otp"
              />
              <div style={{ marginTop: 4, color: '#475569', fontSize: 11 }}>
                Value available in next nodes as <span className="mapping-path">data.value</span> or <span className="mapping-path">data.[fieldName]</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: '10px 12px', borderTop: '1px solid #2d3148', flexShrink: 0 }}>
          <ConditionSection data={data} onUpdate={update} results={results} otherNodes={nodes.filter((n) => n.id !== id)} />
        </div>
      </div>
    );
  }

  if (node.type === 'startNode') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #2d3148', flexShrink: 0 }}>
          <input
            className="dark-input"
            value={data.label || ''}
            onChange={(e) => update('label', e.target.value)}
            placeholder="Node label"
            style={{ fontWeight: 600 }}
          />
          <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#475569', fontFamily: 'Consolas, monospace', userSelect: 'all' }}>{id}</div>
        </div>
        <div className="right-panel-body">
          <div style={{ color: '#475569', fontSize: '0.8rem', lineHeight: 1.6 }}>
            This is the workflow entry point. Connect it to the first node in your flow.<br /><br />
            Clicking <strong style={{ color: '#86efac' }}>▶</strong> on the Start node runs the entire workflow.
          </div>
        </div>
      </div>
    );
  }

  if (node.type === 'transformNode') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #2d3148', flexShrink: 0 }}>
          <input
            className="dark-input"
            value={data.label || ''}
            onChange={(e) => update('label', e.target.value)}
            placeholder="Node label"
            style={{ fontWeight: 600 }}
          />
          <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#475569', fontFamily: 'Consolas, monospace', userSelect: 'all' }}>{id}</div>
        </div>
        <div className="right-panel-body">
          <TransformNodeConfig id={id} data={data} nodes={nodes} results={results} onUpdateNode={onUpdateNode} />
        </div>
        <div style={{ padding: '10px 12px', borderTop: '1px solid #2d3148', flexShrink: 0 }}>
          <ConditionSection data={data} onUpdate={update} results={results} otherNodes={nodes.filter((n) => n.id !== id)} />
        </div>
      </div>
    );
  }

  const method = data.method || 'GET';
  const canSendBody = BODY_METHODS.includes(method);
  const updateRequest = (field, value) => onUpdateNode(id, { ...data, request: { ...data.request, [field]: value } });

  const handleBodyJson = (raw) => {
    try { updateRequest('body', JSON.parse(raw)); } catch (_) {}
  };

  const handleHeadersJson = (raw) => {
    try { updateRequest('headers', JSON.parse(raw)); } catch (_) {}
  };

  const nodeMappingCount = mappings.filter((m) => m.to.nodeId === id).length;
  const hasIteration = !!data.iteration;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #2d3148', flexShrink: 0 }}>
        <input
          className="dark-input"
          value={data.label || ''}
          onChange={(e) => update('label', e.target.value)}
          placeholder="Node label"
          style={{ fontWeight: 600 }}
        />
        <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#475569', fontFamily: 'Consolas, monospace', userSelect: 'all' }}>{id}</div>
      </div>

      <div className="right-panel-tabs">
        {['request', 'mappings'].map((t) => (
          <button key={t} className={activeTab === t ? 'active' : ''} onClick={() => setActiveTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'mappings' && (nodeMappingCount > 0 || hasIteration) && (
              <span style={{ marginLeft: 4, background: hasIteration ? '#5b21b6' : '#7c3aed', borderRadius: 8, padding: '0 5px', fontSize: '0.65rem' }}>
                {hasIteration ? '⟳' : nodeMappingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="right-panel-body">
        {activeTab === 'request' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="form-label-sm">Method</label>
              <select
                className="dark-select"
                value={method}
                onChange={(e) => { update('method', e.target.value); updateRequest('method', e.target.value); }}
              >
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label-sm">
                URL (relative)
                {hasIteration && <span style={{ color: '#475569', textTransform: 'none', marginLeft: 4 }}>— use <span className="mapping-path">{'{{item}}'}</span> for iteration value</span>}
              </label>
              <input
                className="dark-input"
                value={data.request?.url || ''}
                onChange={(e) => updateRequest('url', e.target.value)}
                placeholder="/endpoint"
              />
              <div style={{ marginTop: 4, color: '#475569', fontSize: 11 }}>
                Dynamic: <span className="mapping-path">{'{{$datetime}}'}</span> <span className="mapping-path">{'{{$timestamp}}'}</span> <span className="mapping-path">{'{{$isoDate}}'}</span> <span className="mapping-path">{'{{$time}}'}</span>
              </div>
            </div>

            <div>
              <label className="form-label-sm">Headers (JSON)</label>
              <textarea
                className="dark-textarea"
                value={headersRaw}
                onChange={(e) => setHeadersRaw(e.target.value)}
                onBlur={() => handleHeadersJson(headersRaw)}
                placeholder='{}'
              />
            </div>

            {canSendBody && (
              <div>
                <label className="form-label-sm">Body (JSON)</label>
                <textarea
                  className="dark-textarea"
                  value={bodyRaw}
                  onChange={(e) => setBodyRaw(e.target.value)}
                  onBlur={() => handleBodyJson(bodyRaw)}
                  placeholder='{}'
                />
                <div style={{ marginTop: 4, color: '#475569', fontSize: 11 }}>
                  Dynamic: <span className="mapping-path">{'{{$datetime}}'}</span> <span className="mapping-path">{'{{$timestamp}}'}</span> <span className="mapping-path">{'{{$isoDate}}'}</span> <span className="mapping-path">{'{{$time}}'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'mappings' && (
          <MappingsTab
            nodeId={id}
            nodes={nodes}
            mappings={mappings}
            results={results}
            onUpdateMappings={onUpdateMappings}
            onConfigureIteration={(iter) => update('iteration', iter)}
            currentIteration={data.iteration}
          />
        )}
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid #2d3148', flexShrink: 0 }}>
        <ConditionSection data={data} onUpdate={update} results={results} otherNodes={nodes.filter((n) => n.id !== id)} />
      </div>
    </div>
  );
}
