import React, { useCallback, useContext, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  Handle,
  Position,
  useReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from 'reactflow';

const FlowCtx = React.createContext(null);

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];

let nodeCounter = 1;

function makeNewNode(method, position) {
  return {
    id: `node_${Date.now()}`,
    type: 'apiNode',
    position,
    data: {
      label: `${method} ${nodeCounter++}`,
      method,
      request: { method, url: '/', headers: {}, body: {} },
    },
  };
}

function ApiNode({ id, data }) {
  const { deleteElements, setNodes, getNode } = useReactFlow();
  const ctx = useContext(FlowCtx);
  const method = data.method || 'GET';

  const canRun = ctx?.canRunNode(id) ?? false;
  const isRunning = ctx?.runningNodes?.has(id) ?? false;
  const status = ctx?.nodeStatuses?.[id];

  const handleDelete = (e) => {
    e.stopPropagation();
    deleteElements({ nodes: [{ id }] });
  };

  const handleClone = (e) => {
    e.stopPropagation();
    const source = getNode(id);
    if (!source) return;
    const cloned = {
      ...source,
      id: `node_${Date.now()}`,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      data: { ...source.data, label: `${source.data.label} (copy)` },
      selected: false,
    };
    setNodes((nds) => [...nds, cloned]);
  };

  const handleRun = (e) => {
    e.stopPropagation();
    if (canRun && !isRunning) ctx.onRunNode(id);
  };

  return (
    <div className="node-card" style={{ position: 'relative', ...nodeStatusStyle(status) }}>
      <Handle type="target" position={Position.Left} style={{ background: '#7c3aed', border: 'none', width: 10, height: 10 }} />
      <div className="node-card-header">
        <span className={`method-badge method-${method}`}>{method}</span>
        <span className="node-label">{data.label || 'Untitled'}</span>
        <div className="node-actions">
          <button
            onClick={handleRun}
            className={`node-run-btn${canRun ? ' can-run' : ''}`}
            title={canRun ? 'Run this node' : 'Run dependency nodes first'}
            disabled={!canRun || isRunning}
          >
            {isRunning ? '…' : '▶'}
          </button>
          <button onClick={handleClone} className="node-delete-btn" title="Clone node">⧉</button>
          <button onClick={handleDelete} className="node-delete-btn" title="Remove node">✕</button>
        </div>
      </div>
      <div className="node-url">{data.request?.url || '/'}</div>
      <Handle type="source" position={Position.Right} style={{ background: '#7c3aed', border: 'none', width: 10, height: 10 }} />
    </div>
  );
}

function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd }) {
  const { deleteElements } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ stroke: '#7c3aed', ...style }} />
      {/* Wide invisible stroke for easier hover targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
      />
      {hovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              onClick={() => deleteElements({ edges: [{ id }] })}
              title="Remove connection"
              style={{
                background: '#450a0a', border: '1px solid #7f1d1d', color: '#f87171',
                borderRadius: '50%', width: 18, height: 18, fontSize: '0.6rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function TransformNode({ id, data }) {
  const { deleteElements, setNodes, getNode } = useReactFlow();
  const ctx = useContext(FlowCtx);
  const canRun = ctx?.canRunNode(id) ?? false;
  const isRunning = ctx?.runningNodes?.has(id) ?? false;
  const status = ctx?.nodeStatuses?.[id];

  return (
    <div className="node-card" style={{ position: 'relative', ...nodeStatusStyle(status) }}>
      <Handle type="target" position={Position.Left} style={{ background: '#7c3aed', border: 'none', width: 10, height: 10 }} />
      <div className="node-card-header">
        <span className="method-badge" style={{ background: '#0f766e', color: '#99f6e4', fontFamily: 'monospace' }}>fx</span>
        <span className="node-label">{data.label || 'Transform'}</span>
        <div className="node-actions">
          <button
            onClick={(e) => { e.stopPropagation(); if (canRun && !isRunning) ctx.onRunNode(id); }}
            className={`node-run-btn${canRun ? ' can-run' : ''}`}
            title={canRun ? 'Run this node' : 'Run dependency nodes first'}
            disabled={!canRun || isRunning}
          >{isRunning ? '…' : '▶'}</button>
          <button onClick={(e) => { e.stopPropagation(); const s = getNode(id); if (s) setNodes((nds) => [...nds, { ...s, id: `node_${Date.now()}`, position: { x: s.position.x + 40, y: s.position.y + 40 }, data: { ...s.data, label: `${s.data.label} (copy)` }, selected: false }]); }} className="node-delete-btn" title="Clone node">⧉</button>
          <button onClick={(e) => { e.stopPropagation(); deleteElements({ nodes: [{ id }] }); }} className="node-delete-btn" title="Remove node">✕</button>
        </div>
      </div>
      <div className="node-url" style={{ color: '#5eead4', fontStyle: 'italic' }}>{data.transform ? 'Custom script' : 'No script yet'}</div>
      <Handle type="source" position={Position.Right} style={{ background: '#7c3aed', border: 'none', width: 10, height: 10 }} />
    </div>
  );
}

function makeTransformNode(position) {
  return {
    id: `node_${Date.now()}`,
    type: 'transformNode',
    position,
    data: { label: `Transform ${nodeCounter++}`, transform: '' },
  };
}

function StartNode({ id, data }) {
  const { deleteElements } = useReactFlow();
  const ctx = useContext(FlowCtx);
  const isRunning = ctx?.running ?? false;
  const status = ctx?.nodeStatuses?.[id];

  return (
    <div className="node-card" style={{ position: 'relative', ...nodeStatusStyle(status) }}>
      <div className="node-card-header">
        <span className="method-badge" style={{ background: '#15803d', color: '#86efac', fontWeight: 700, letterSpacing: 1 }}>START</span>
        <span className="node-label">{data.label || 'Start'}</span>
        <div className="node-actions">
          <button
            onClick={(e) => { e.stopPropagation(); ctx?.onRunWorkflow?.(); }}
            className="node-run-btn can-run"
            title="Run entire workflow"
            disabled={isRunning}
          >{isRunning ? '…' : '▶'}</button>
          <button onClick={(e) => { e.stopPropagation(); deleteElements({ nodes: [{ id }] }); }} className="node-delete-btn" title="Remove node">✕</button>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#15803d', border: 'none', width: 10, height: 10 }} />
    </div>
  );
}

function makeStartNode(position) {
  return {
    id: `node_${Date.now()}`,
    type: 'startNode',
    position,
    data: { label: 'Start' },
  };
}

function InputNode({ id, data }) {
  const { deleteElements } = useReactFlow();
  const ctx = useContext(FlowCtx);
  const status = ctx?.nodeStatuses?.[id];

  return (
    <div className="node-card" style={{ position: 'relative', ...nodeStatusStyle(status) }}>
      <Handle type="target" position={Position.Left} style={{ background: '#0ea5e9', border: 'none', width: 10, height: 10 }} />
      <div className="node-card-header">
        <span className="method-badge" style={{ background: '#0c4a6e', color: '#7dd3fc' }}>⌨</span>
        <span className="node-label">{data.label || 'User Input'}</span>
        <div className="node-actions">
          <button onClick={(e) => { e.stopPropagation(); deleteElements({ nodes: [{ id }] }); }} className="node-delete-btn" title="Remove node">✕</button>
        </div>
      </div>
      <div className="node-url" style={{ color: '#7dd3fc', fontStyle: 'italic' }}>
        {data.prompt || 'No prompt configured'}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#0ea5e9', border: 'none', width: 10, height: 10 }} />
    </div>
  );
}

function makeInputNode(position) {
  return {
    id: `node_${Date.now()}`,
    type: 'inputNode',
    position,
    data: { label: `Input ${nodeCounter++}`, prompt: '', fieldName: 'value' },
  };
}

const NODE_TYPES = { apiNode: ApiNode, transformNode: TransformNode, startNode: StartNode, inputNode: InputNode };
const EDGE_TYPES = { deletable: DeletableEdge };

function AddNodeButton({ onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close picker when clicking outside
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'absolute', top: 16, left: 16, zIndex: 10 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: open ? '#6d28d9' : '#7c3aed',
          border: 'none', color: 'white', fontSize: '1rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(124,58,237,0.5)',
          transition: 'background 0.15s, transform 0.15s',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
        title="Add node"
      >
        +
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, left: 0,
          background: '#1a1d27', border: '1px solid #3d4166',
          borderRadius: 8, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          minWidth: 130,
        }}>
          {METHODS.map((m) => (
            <button
              key={m}
              onClick={() => { onAdd(m); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 14px',
                background: 'transparent', border: 'none',
                cursor: 'pointer', color: '#c4c9e2', fontSize: '0.82rem',
                textAlign: 'left', transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#262a3d'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span className={`method-badge method-${m}`}>{m}</span>
              Request
            </button>
          ))}
          <div style={{ borderTop: '1px solid #2d3148', margin: '4px 0' }} />
          <button
            onClick={() => { onAdd('Transform'); setOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 14px',
              background: 'transparent', border: 'none',
              cursor: 'pointer', color: '#c4c9e2', fontSize: '0.82rem',
              textAlign: 'left', transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#262a3d'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span className="method-badge" style={{ background: '#0f766e', color: '#99f6e4', fontFamily: 'monospace' }}>fx</span>
            Transform
          </button>
          <button
            onClick={() => { onAdd('Start'); setOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 14px',
              background: 'transparent', border: 'none',
              cursor: 'pointer', color: '#c4c9e2', fontSize: '0.82rem',
              textAlign: 'left', transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#262a3d'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span className="method-badge" style={{ background: '#15803d', color: '#86efac', fontWeight: 700 }}>START</span>
            Start
          </button>
          <button
            onClick={() => { onAdd('Input'); setOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 14px',
              background: 'transparent', border: 'none',
              cursor: 'pointer', color: '#c4c9e2', fontSize: '0.82rem',
              textAlign: 'left', transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#262a3d'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span className="method-badge" style={{ background: '#0c4a6e', color: '#7dd3fc' }}>⌨</span>
            User Input
          </button>
        </div>
      )}
    </div>
  );
}

function nodeStatusStyle(status) {
  if (status === 'running') return { border: '2px solid #f59e0b', boxShadow: '0 0 12px rgba(245,158,11,0.45)' };
  if (status === 'waiting') return { border: '2px solid #0ea5e9', boxShadow: '0 0 14px rgba(14,165,233,0.5)' };
  if (status === 'done')    return { border: '2px solid #22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.35)' };
  if (status === 'error')   return { border: '2px solid #ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.35)' };
  if (status === 'pending') return { opacity: 0.5 };
  if (status === 'skipped') return { opacity: 0.4, border: '2px dashed #475569' };
  return {};
}

export default function FlowBuilder({ nodes, edges, onNodesChange, onEdgesChange, onNodeSelect, selectedNodeId, setNodes, setEdges, defaultViewport, onViewportChange, results, onRunNode, runningNodes, running, onRunWorkflow, nodeStatuses }) {
  const [rfInstance, setRfInstance] = useState(null);

  // Keep refs current so clipboard handlers never read stale closures
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  React.useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  React.useEffect(() => { edgesRef.current = edges; }, [edges]);

  const clipboardRef = useRef({ nodes: [], edges: [] });

  // Ctrl+A / Cmd+A — select all
  // Ctrl+C / Cmd+C — copy selected nodes (+internal edges)
  // Ctrl+X / Cmd+X — cut selected nodes
  // Ctrl+V / Cmd+V — paste with new IDs at +40/+40 offset
  React.useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === 'a') {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        return;
      }

      if (e.key === 'c' || e.key === 'x') {
        const sel = nodesRef.current.filter((n) => n.selected);
        if (!sel.length) return;
        e.preventDefault();
        const selIds = new Set(sel.map((n) => n.id));
        clipboardRef.current = {
          nodes: sel,
          edges: edgesRef.current.filter((ed) => selIds.has(ed.source) && selIds.has(ed.target)),
        };
        if (e.key === 'x') {
          setNodes((nds) => nds.filter((n) => !selIds.has(n.id)));
          setEdges((eds) => eds.filter((ed) => !selIds.has(ed.source) && !selIds.has(ed.target)));
        }
        return;
      }

      if (e.key === 'v') {
        const { nodes: cbNodes, edges: cbEdges } = clipboardRef.current;
        if (!cbNodes.length) return;
        e.preventDefault();
        const stamp = Date.now();
        const idMap = {};
        const newNodes = cbNodes.map((n, i) => {
          const newId = `node_${stamp}_${i}`;
          idMap[n.id] = newId;
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 40, y: n.position.y + 40 },
            selected: true,
            data: { ...n.data },
          };
        });
        const newEdges = cbEdges
          .map((ed, i) => ({
            ...ed,
            id: `edge_${stamp}_${i}`,
            source: idMap[ed.source],
            target: idMap[ed.target],
            type: 'deletable',
          }))
          .filter((ed) => ed.source && ed.target);
        setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
        setEdges((eds) => [...eds, ...newEdges]);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setNodes, setEdges]);

  const canRunNode = useCallback((nodeId) => {
    const depIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);
    return depIds.every((depId) => results && results[depId] !== undefined);
  }, [edges, results]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'deletable', animated: true }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_e, node) => onNodeSelect(node), [onNodeSelect]);
  const onPaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect]);

  const handleAddNode = useCallback((method) => {
    if (!rfInstance) return;
    // Place new node in the center of the current viewport
    const { x, y, zoom } = rfInstance.getViewport();
    const canvasEl = document.querySelector('.canvas-area');
    const w = canvasEl?.clientWidth ?? 800;
    const h = canvasEl?.clientHeight ?? 600;
    // Convert canvas center to flow coordinates
    const position = rfInstance.screenToFlowPosition({
      x: canvasEl?.getBoundingClientRect().left + w / 2 + (Math.random() - 0.5) * 80,
      y: canvasEl?.getBoundingClientRect().top  + h / 2 + (Math.random() - 0.5) * 80,
    });
    if (method === 'Transform') {
      setNodes((nds) => [...nds, makeTransformNode(position)]);
    } else if (method === 'Start') {
      setNodes((nds) => [...nds, makeStartNode(position)]);
    } else if (method === 'Input') {
      setNodes((nds) => [...nds, makeInputNode(position)]);
    } else {
      setNodes((nds) => [...nds, makeNewNode(method, position)]);
    }
  }, [rfInstance, setNodes]);

  return (
    <FlowCtx.Provider value={{ onRunNode, runningNodes, canRunNode, running, onRunWorkflow, nodeStatuses }}>
    <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
      <AddNodeButton onAdd={handleAddNode} />

      <button
        onClick={() => setNodes((nds) => nds.map((n) => ({ ...n, selected: true })))}
        title="Select all nodes (Ctrl+A) — then drag any node to move all"
        style={{
          position: 'absolute', top: 60, left: 16, zIndex: 10,
          width: 36, height: 36, borderRadius: '50%',
          background: '#1a1d27', border: '1px solid #3d4166',
          color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#262a3d'; e.currentTarget.style.color = '#c4c9e2'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#1a1d27'; e.currentTarget.style.color = '#94a3b8'; }}
      >⊞</button>

      <div className="canvas-area" style={{ height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges.map((e) => ({ ...e, type: 'deletable' }))}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setRfInstance}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onMoveEnd={(_, vp) => onViewportChange(vp)}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          {...(defaultViewport ? { defaultViewport } : { fitView: true })}
          deleteKeyCode="Delete"
        >
          <Background color="#2d3148" gap={24} size={1} />
          <Controls style={{ bottom: 16, left: 16, top: 'auto' }} />
          <MiniMap nodeColor="#262a3d" maskColor="rgba(15,17,23,0.8)" />
        </ReactFlow>
      </div>
    </div>
    </FlowCtx.Provider>
  );
}
