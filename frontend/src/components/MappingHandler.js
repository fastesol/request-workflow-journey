/**
 * Mapping utilities — no string templates, no eval.
 * All mappings are structured objects with from/to paths.
 */

export function createMapping(fromNodeId, fromPath, toNodeId, toField) {
  return {
    id: `map_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from: { nodeId: fromNodeId, path: fromPath },
    to: { nodeId: toNodeId, field: toField },
  };
}

export function createCollectMapping(fromNodeId, arrayPath, fieldPath, toNodeId, paramName) {
  return {
    id: `map_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'collect',
    from: { nodeId: fromNodeId, arrayPath, fieldPath },
    to: { nodeId: toNodeId, paramName },
  };
}

export function createRandomMapping(fromNodeId, arrayPath, fieldPath, toNodeId, toField) {
  return {
    id: `map_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'random',
    from: { nodeId: fromNodeId, arrayPath, fieldPath },
    to: { nodeId: toNodeId, field: toField },
  };
}

export function removeMappingById(mappings, id) {
  return mappings.filter((m) => m.id !== id);
}

export function getMappingsForNode(mappings, nodeId) {
  return mappings.filter((m) => m.to.nodeId === nodeId);
}

/**
 * Flatten a JSON object into dotted-path entries for the tree UI.
 * e.g. { user: { id: 1 } } → [{ path: "data.user.id", value: 1, type: "number" }]
 */
export function flattenPaths(obj, prefix = 'data', result = []) {
  if (obj === null || obj === undefined) return result;

  if (Array.isArray(obj)) {
    result.push({ path: prefix, value: obj, type: 'array', isArray: true });
    obj.forEach((item, i) => flattenPaths(item, `${prefix}[${i}]`, result));
    return result;
  }

  if (typeof obj === 'object') {
    result.push({ path: prefix, value: obj, type: 'object' });
    for (const key of Object.keys(obj)) {
      flattenPaths(obj[key], `${prefix}.${key}`, result);
    }
    return result;
  }

  result.push({ path: prefix, value: obj, type: typeof obj });
  return result;
}

