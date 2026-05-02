import React, { useState, useCallback, useEffect, useRef } from 'react';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';
import axios from 'axios';
import FlowBuilder from './components/FlowBuilder';
import NodeConfigPanel from './components/NodeConfigPanel';
import GlobalConfigPanel from './components/GlobalConfigPanel';
import ResponseViewer from './components/ResponseViewer';

const STORAGE_KEY = 'wfb_state_v2';

function topoSort(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const inDegree = Object.fromEntries(ids.map((id) => [id, 0]));
  const adj      = Object.fromEntries(ids.map((id) => [id, []]));
  for (const e of edges || []) {
    if (adj[e.source] !== undefined) adj[e.source].push(e.target);
    if (inDegree[e.target] !== undefined) inDegree[e.target]++;
  }
  const queue = ids.filter((id) => inDegree[id] === 0);
  const order = [];
  while (queue.length) {
    const curr = queue.shift();
    order.push(curr);
    for (const next of adj[curr]) { if (--inDegree[next] === 0) queue.push(next); }
  }
  return order;
}

function evalCondition(expression, results) {
  if (!expression?.trim()) return true;
  try {
    // eslint-disable-next-line no-new-func
    return !!new Function('results', `"use strict"; return (${expression})`)(results);
  } catch (_) {
    return true; // on syntax/runtime error, default to running the node
  }
}

function makeWorkflow(name) {
  return { id: `wf_${Date.now()}_${Math.random().toString(36).slice(2)}`, name, nodes: [], edges: [], mappings: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

const PANEL_TABS = ['Config', 'Node', 'Results'];

export default function App() {
  const persisted = React.useRef(loadState());
  const p = persisted.current;

  const initial = p?.workflows?.length ? p.workflows : [makeWorkflow('Workflow 1')];
  const [workflows, setWorkflows] = useState(initial);
  const [activeWfId, setActiveWfId] = useState(p?.activeWfId || initial[0].id);
  const [globalConfig, setGlobalConfig] = useState(p?.globalConfig || { baseUrl: '' });
  const [viewports, setViewports] = useState(p?.viewports || {});
  const [results, setResults] = useState({});       // { [wfId]: { [nodeId]: result } }
  const [nodeStatuses, setNodeStatuses] = useState({}); // { [wfId]: { [nodeId]: 'pending'|'running'|'waiting'|'done'|'error' } }
  const [running, setRunning] = useState(false);
  const [runningNodes, setRunningNodes] = useState(new Set());
  const [pendingInput, setPendingInput] = useState(null); // { prompt, fieldName } — set while paused waiting for user
  const [userInputValue, setUserInputValue] = useState('');
  const inputResolverRef = useRef(null);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [rightTab, setRightTab] = useState('Config');
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const rightPanelWidthRef = useRef(380);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const [editingWfId, setEditingWfId] = useState(null);
  const [editingWfName, setEditingWfName] = useState('');
  const [tabMenuId, setTabMenuId] = useState(null); // which tab's ⋯ menu is open

  // ── Derived active-workflow slices ─────────────────────────────────────────
  const activeWorkflow = workflows.find((w) => w.id === activeWfId) || workflows[0];
  const activeNodes    = activeWorkflow?.nodes    || [];
  const activeEdges    = activeWorkflow?.edges    || [];
  const activeMappings = activeWorkflow?.mappings || [];
  const activeResults  = results[activeWfId]      || null;

  useEffect(() => { rightPanelWidthRef.current = rightPanelWidth; }, [rightPanelWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ workflows, activeWfId, globalConfig, viewports }));
    } catch (_) {}
  }, [workflows, activeWfId, globalConfig, viewports]);

  // ── Resize panel ───────────────────────────────────────────────────────────
  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = rightPanelWidthRef.current;
    const onMouseMove = (mv) => {
      const delta = resizeStartX.current - mv.clientX;
      setRightPanelWidth(Math.max(260, Math.min(800, resizeStartWidth.current + delta)));
    };
    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // ── ReactFlow change handlers (scoped to active workflow) ──────────────────
  const patchWorkflow = useCallback((wfId, updater) => {
    setWorkflows((wfs) => wfs.map((wf) => wf.id === wfId ? { ...wf, ...updater(wf) } : wf));
  }, []);

  const onNodesChange = useCallback((changes) => {
    patchWorkflow(activeWfId, (wf) => ({ nodes: applyNodeChanges(changes, wf.nodes) }));
  }, [activeWfId, patchWorkflow]);

  const onEdgesChange = useCallback((changes) => {
    patchWorkflow(activeWfId, (wf) => ({ edges: applyEdgeChanges(changes, wf.edges) }));
  }, [activeWfId, patchWorkflow]);

  const setNodes = useCallback((updater) => {
    patchWorkflow(activeWfId, (wf) => ({ nodes: typeof updater === 'function' ? updater(wf.nodes) : updater }));
  }, [activeWfId, patchWorkflow]);

  const setEdges = useCallback((updater) => {
    patchWorkflow(activeWfId, (wf) => ({ edges: typeof updater === 'function' ? updater(wf.edges) : updater }));
  }, [activeWfId, patchWorkflow]);

  const setMappings = useCallback((updater) => {
    patchWorkflow(activeWfId, (wf) => ({ mappings: typeof updater === 'function' ? updater(wf.mappings) : updater }));
  }, [activeWfId, patchWorkflow]);

  // ── Workflow tab management ────────────────────────────────────────────────
  const addWorkflow = () => {
    const wf = makeWorkflow(`Workflow ${workflows.length + 1}`);
    setWorkflows((wfs) => [...wfs, wf]);
    setActiveWfId(wf.id);
    setSelectedNode(null);
  };

  const removeWorkflow = (wfId) => {
    setWorkflows((wfs) => {
      const remaining = wfs.filter((w) => w.id !== wfId);
      if (remaining.length === 0) {
        const fresh = makeWorkflow('Workflow 1');
        setActiveWfId(fresh.id);
        return [fresh];
      }
      if (activeWfId === wfId) {
        setActiveWfId(remaining[0].id);
        setSelectedNode(null);
      }
      return remaining;
    });
    setResults((prev) => { const r = { ...prev }; delete r[wfId]; return r; });
  };

  const switchWorkflow = (wfId) => {
    if (wfId === activeWfId) return;
    setActiveWfId(wfId);
    setSelectedNode(null);
  };

  const startRename = (wf, e) => {
    e.stopPropagation();
    setEditingWfId(wf.id);
    setEditingWfName(wf.name);
  };

  // Close tab menu when clicking elsewhere
  React.useEffect(() => {
    if (!tabMenuId) return;
    const handler = () => setTabMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [tabMenuId]);

  const exportSingleWorkflow = (wf) => {
    const payload = { type: 'workflow', name: wf.name, nodes: wf.nodes, edges: wf.edges, mappings: wf.mappings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${wf.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const duplicateWorkflow = (wf) => {
    const dup = {
      ...makeWorkflow(`${wf.name} (copy)`),
      nodes: wf.nodes.map((n) => ({ ...n })),
      edges: wf.edges.map((e) => ({ ...e })),
      mappings: [...wf.mappings],
    };
    setWorkflows((wfs) => [...wfs, dup]);
    setActiveWfId(dup.id);
    setSelectedNode(null);
  };

  const importSingleWorkflow = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        let wf;
        if (parsed.nodes || parsed.type === 'workflow') {
          // Single-workflow format (new or legacy)
          wf = makeWorkflow(parsed.name || file.name.replace(/\.json$/i, ''));
          wf.nodes    = parsed.nodes    || [];
          wf.edges    = parsed.edges    || [];
          wf.mappings = parsed.mappings || [];
        } else if (parsed.workflows?.length) {
          // Multi-workflow export — import each as its own tab
          const added = parsed.workflows.map((w) => {
            const nw = makeWorkflow(w.name || 'Imported');
            nw.nodes    = w.nodes    || [];
            nw.edges    = w.edges    || [];
            nw.mappings = w.mappings || [];
            return nw;
          });
          setWorkflows((wfs) => [...wfs, ...added]);
          setActiveWfId(added[added.length - 1].id);
          setSelectedNode(null);
          return;
        } else {
          setError('Invalid workflow file');
          return;
        }
        setWorkflows((wfs) => [...wfs, wf]);
        setActiveWfId(wf.id);
        setSelectedNode(null);
      } catch (_) { setError('Invalid workflow file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const commitRename = () => {
    if (editingWfId && editingWfName.trim()) {
      setWorkflows((wfs) => wfs.map((wf) => wf.id === editingWfId ? { ...wf, name: editingWfName.trim() } : wf));
    }
    setEditingWfId(null);
  };

  // ── Node select / update ───────────────────────────────────────────────────
  const handleNodeSelect = useCallback((node) => {
    setSelectedNode(node);
    if (node) setRightTab('Node');
  }, []);

  const handleUpdateNode = useCallback((nodeId, newData) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: newData } : n));
    setSelectedNode((prev) => prev?.id === nodeId ? { ...prev, data: newData } : prev);
  }, [setNodes]);

  // ── Run full workflow (node-by-node for live progress) ────────────────────
  const runWorkflow = useCallback(async (wfId) => {
    const targetId = wfId || activeWfId;
    const wf = workflows.find((w) => w.id === targetId);
    if (!wf || wf.nodes.length === 0) { setError('Add at least one node to the canvas.'); return; }

    const order   = topoSort(wf.nodes, wf.edges);
    const nodeMap = Object.fromEntries(wf.nodes.map((n) => [n.id, n]));

    // Reset all to pending
    setNodeStatuses((prev) => ({
      ...prev,
      [targetId]: Object.fromEntries(order.map((id) => [id, 'pending'])),
    }));
    setResults((prev) => ({ ...prev, [targetId]: null }));
    setRunning(true);
    setError('');

    const wfResults = {};

    for (const nodeId of order) {
      const node = nodeMap[nodeId];
      if (!node) continue;

      // ── Condition check — skip node if expression is falsy ──────────────
      if (node.data?.condition?.trim()) {
        const shouldRun = evalCondition(node.data.condition, wfResults);
        if (!shouldRun) {
          wfResults[nodeId] = { skipped: true };
          setNodeStatuses((prev) => ({
            ...prev,
            [targetId]: { ...prev[targetId], [nodeId]: 'skipped' },
          }));
          setResults((prev) => ({ ...prev, [targetId]: { ...wfResults } }));
          continue;
        }
      }

      // ── Input node: pause and wait for user ─────────────────────────────
      if (node.type === 'inputNode') {
        setNodeStatuses((prev) => ({
          ...prev,
          [targetId]: { ...prev[targetId], [nodeId]: 'waiting' },
        }));
        const value = await new Promise((resolve) => {
          inputResolverRef.current = resolve;
          setUserInputValue('');
          setPendingInput({ prompt: node.data.prompt, fieldName: node.data.fieldName || 'value' });
        });
        setPendingInput(null);
        if (value === null) {
          // User cancelled — stop the workflow
          setNodeStatuses((prev) => ({
            ...prev,
            [targetId]: { ...prev[targetId], [nodeId]: 'error' },
          }));
          setError('Workflow cancelled by user.');
          setRunning(false);
          return;
        }
        const fieldName = node.data.fieldName || 'value';
        wfResults[nodeId] = { data: { value, [fieldName]: value } };
        setNodeStatuses((prev) => ({
          ...prev,
          [targetId]: { ...prev[targetId], [nodeId]: 'done' },
        }));
        setResults((prev) => ({ ...prev, [targetId]: { ...wfResults } }));
        continue;
      }

      setNodeStatuses((prev) => ({
        ...prev,
        [targetId]: { ...prev[targetId], [nodeId]: 'running' },
      }));
      setRunningNodes((prev) => new Set([...prev, nodeId]));

      try {
        const res = await axios.post('/execute-node', {
          node: {
            id: node.id, type: node.type,
            request: node.data.request || { method: 'GET', url: '/', headers: {}, body: {} },
            iteration: node.data.iteration,
            transform: node.data.transform,
          },
          globalConfig,
          mappings: wf.mappings,
          results: wfResults,
        });
        wfResults[nodeId] = res.data.result;
        setNodeStatuses((prev) => ({
          ...prev,
          [targetId]: { ...prev[targetId], [nodeId]: 'done' },
        }));
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        wfResults[nodeId] = { error: errMsg };
        setNodeStatuses((prev) => ({
          ...prev,
          [targetId]: { ...prev[targetId], [nodeId]: 'error' },
        }));
        setError(`"${node.data?.label || nodeId}" failed: ${errMsg}`);
      } finally {
        setRunningNodes((prev) => { const s = new Set(prev); s.delete(nodeId); return s; });
      }

      setResults((prev) => ({ ...prev, [targetId]: { ...wfResults } }));
    }

    setRunning(false);
    setRightTab('Results');
  }, [workflows, activeWfId, globalConfig]);

  // ── Run single node ────────────────────────────────────────────────────────
  const handleRunNode = useCallback(async (nodeId) => {
    const wf = workflows.find((w) => w.id === activeWfId);
    const node = wf?.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setRunningNodes((prev) => new Set([...prev, nodeId]));
    setError('');
    try {
      const res = await axios.post('/execute-node', {
        node: {
          id: node.id, type: node.type,
          request: node.data.request || { method: 'GET', url: '/', headers: {}, body: {} },
          iteration: node.data.iteration,
          transform: node.data.transform,
        },
        globalConfig,
        mappings: wf.mappings,
        results: results[activeWfId] || {},
      });
      setResults((prev) => ({
        ...prev,
        [activeWfId]: { ...(prev[activeWfId] || {}), [nodeId]: res.data.result },
      }));
      setRightTab('Results');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunningNodes((prev) => { const s = new Set(prev); s.delete(nodeId); return s; });
    }
  }, [workflows, activeWfId, globalConfig, results]);

  // ── User input modal handlers ──────────────────────────────────────────────
  const submitUserInput = () => {
    if (inputResolverRef.current) {
      inputResolverRef.current(userInputValue);
      inputResolverRef.current = null;
    }
  };

  const cancelUserInput = () => {
    if (inputResolverRef.current) {
      inputResolverRef.current(null);
      inputResolverRef.current = null;
    }
  };

  // ── Export / Import ────────────────────────────────────────────────────────
  const exportWorkflows = () => {
    const blob = new Blob([JSON.stringify({ globalConfig, workflows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'workflows.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const importWorkflows = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.globalConfig) setGlobalConfig(parsed.globalConfig);
        if (parsed.workflows) {
          setWorkflows(parsed.workflows);
          setActiveWfId(parsed.workflows[0]?.id);
        } else {
          // Legacy single-workflow format
          const wf = makeWorkflow('Imported');
          wf.nodes    = parsed.nodes    || [];
          wf.edges    = parsed.edges    || [];
          wf.mappings = parsed.mappings || [];
          setWorkflows([wf]);
          setActiveWfId(wf.id);
        }
        setSelectedNode(null);
        setResults({});
      } catch (_) { setError('Invalid workflow file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app-layout">
      <div className="app-header">
        <h4>⚡ API Workflow Builder</h4>
        <div style={{ flex: 1 }} />
        <label className="btn-sm-dark" style={{ cursor: 'pointer' }}>
          Import
          <input type="file" accept=".json" onChange={importWorkflows} style={{ display: 'none' }} />
        </label>
        <button className="btn-sm-dark" onClick={exportWorkflows}>Export</button>
        <button className="btn-run" onClick={() => runWorkflow(activeWfId)} disabled={running}>
          {running
            ? <span><span className="spinner-border spinner-border-sm me-2" role="status" />Running...</span>
            : '▶ Run Workflow'}
        </button>
      </div>

      {/* Workflow tabs */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#0a0c12', borderBottom: '1px solid #2d3148',
        padding: '0 8px', gap: 1, flexShrink: 0,
        position: 'relative', zIndex: 50, overflow: 'visible',
      }}>
        {workflows.map((wf) => (
          <div
            key={wf.id}
            onClick={() => switchWorkflow(wf.id)}
            style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 10px', cursor: 'pointer',
              borderBottom: `2px solid ${wf.id === activeWfId ? '#7c3aed' : 'transparent'}`,
              color: wf.id === activeWfId ? '#c4c9e2' : '#64748b',
              fontSize: '0.8rem', whiteSpace: 'nowrap', userSelect: 'none',
              transition: 'color 0.15s',
            }}
          >
            {editingWfId === wf.id ? (
              <input
                className="dark-input"
                style={{ fontSize: '0.8rem', padding: '1px 4px', width: 120 }}
                value={editingWfName}
                autoFocus
                onChange={(e) => setEditingWfName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingWfId(null); }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span onDoubleClick={(e) => startRename(wf, e)}>{wf.name}</span>
            )}

            {/* ⋯ tab menu */}
            <span
              onClick={(e) => { e.stopPropagation(); setTabMenuId(tabMenuId === wf.id ? null : wf.id); }}
              style={{ color: '#475569', fontSize: '0.75rem', padding: '1px 3px', borderRadius: 2, lineHeight: 1, cursor: 'pointer' }}
              title="Workflow options"
            >⋯</span>

            {tabMenuId === wf.id && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 200,
                  background: '#1a1d27', border: '1px solid #3d4166',
                  borderRadius: 6, overflow: 'hidden', minWidth: 150,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 2,
                }}
              >
                {[
                  { label: '✎ Rename',    action: () => { startRename(wf, { stopPropagation: () => {} }); setTabMenuId(null); } },
                  { label: '⬇ Export',    action: () => { exportSingleWorkflow(wf); setTabMenuId(null); } },
                  { label: '⧉ Duplicate', action: () => { duplicateWorkflow(wf); setTabMenuId(null); } },
                  ...(workflows.length > 1 ? [{ label: '✕ Delete', action: () => { removeWorkflow(wf.id); setTabMenuId(null); }, danger: true }] : []),
                ].map(({ label, action, danger }) => (
                  <button
                    key={label}
                    onClick={action}
                    style={{
                      display: 'block', width: '100%', padding: '8px 14px',
                      background: 'transparent', border: 'none', textAlign: 'left',
                      color: danger ? '#f87171' : '#c4c9e2', fontSize: '0.8rem', cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#262a3d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >{label}</button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* New workflow + Import workflow buttons */}
        <button
          onClick={addWorkflow}
          title="New workflow"
          style={{ padding: '4px 10px', background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
        >+</button>
        <label
          title="Import workflow from file"
          style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1, display: 'flex', alignItems: 'center' }}
        >
          ⬆
          <input type="file" accept=".json" onChange={importSingleWorkflow} style={{ display: 'none' }} />
        </label>
      </div>

      {error && (
        <div style={{
          background: '#450a0a', borderBottom: '1px solid #7f1d1d', color: '#fca5a5',
          padding: '8px 20px', fontSize: '0.82rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
        }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'Consolas, monospace', flex: 1 }}>{error}</pre>
          <span style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => setError('')}>✕</span>
        </div>
      )}

      <div className="app-body">
        <FlowBuilder
          key={activeWfId}
          nodes={activeNodes}
          edges={activeEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          setNodes={setNodes}
          setEdges={setEdges}
          onNodeSelect={handleNodeSelect}
          selectedNodeId={selectedNode?.id}
          defaultViewport={viewports[activeWfId]}
          onViewportChange={(vp) => setViewports((prev) => ({ ...prev, [activeWfId]: vp }))}
          results={activeResults}
          onRunNode={handleRunNode}
          runningNodes={runningNodes}
          running={running}
          onRunWorkflow={() => runWorkflow(activeWfId)}
          nodeStatuses={nodeStatuses[activeWfId] || {}}
        />

        <div className="resize-handle" onMouseDown={handleResizeMouseDown} />

        <div className="right-panel" style={{ width: rightPanelWidth }}>
          <div className="right-panel-tabs">
            {PANEL_TABS.map((t) => (
              <button key={t} className={rightTab === t ? 'active' : ''} onClick={() => setRightTab(t)}>
                {t}
                {t === 'Results' && activeResults && (
                  <span style={{ marginLeft: 4, background: '#7c3aed', borderRadius: 8, padding: '0 5px', fontSize: '0.65rem' }}>
                    {Object.keys(activeResults).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="right-panel-body">
            {rightTab === 'Config' && <GlobalConfigPanel globalConfig={globalConfig} onChange={setGlobalConfig} />}
            {rightTab === 'Node' && (
              <NodeConfigPanel
                node={selectedNode}
                nodes={activeNodes}
                mappings={activeMappings}
                results={activeResults}
                onUpdateNode={handleUpdateNode}
                onUpdateMappings={setMappings}
              />
            )}
            {rightTab === 'Results' && <ResponseViewer results={activeResults} nodes={activeNodes} />}
          </div>
        </div>
      </div>

      {/* User input modal — shown when an inputNode is reached during workflow run */}
      {pendingInput && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1d27', border: '1px solid #0ea5e9',
            borderRadius: 12, padding: 28, minWidth: 360, maxWidth: 500,
            boxShadow: '0 0 40px rgba(14,165,233,0.2), 0 20px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: '1.1rem' }}>⌨</span>
              <span style={{ fontSize: '0.7rem', color: '#0ea5e9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                Workflow paused — user input required
              </span>
            </div>
            <div style={{ color: '#c4c9e2', fontSize: '0.92rem', marginBottom: 16, lineHeight: 1.5 }}>
              {pendingInput.prompt || 'Enter a value to continue the workflow'}
            </div>
            <input
              className="dark-input"
              autoFocus
              value={userInputValue}
              onChange={(e) => setUserInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitUserInput(); if (e.key === 'Escape') cancelUserInput(); }}
              placeholder={pendingInput.fieldName}
              style={{ marginBottom: 16, fontSize: '1rem' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-sm-dark" onClick={cancelUserInput}>Cancel workflow</button>
              <button className="btn-run" onClick={submitUserInput} disabled={!userInputValue.trim()}>
                Continue →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
