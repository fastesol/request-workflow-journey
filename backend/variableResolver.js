const _ = require('lodash');

/**
 * Resolves all mappings for a node's request before execution.
 * Mappings are structured objects — no string templates, no eval.
 *
 * Supports:
 *  - Static mappings: from a previous node's response
 *  - Iteration variable injection via iterationItem
 */
function resolveMappings(request, mappings, results, iterationItem) {
  const resolved = _.cloneDeep(request);

  for (const mapping of mappings || []) {
    const { from, to } = mapping;

    if (mapping.type === 'random') {
      const sourceResult = results[from.nodeId];
      if (!sourceResult) continue;
      const sourceData = Array.isArray(sourceResult)
        ? sourceResult[sourceResult.length - 1]?.response
        : sourceResult;
      const arr = _.get(sourceData, from.arrayPath);
      if (!Array.isArray(arr) || arr.length === 0) continue;
      const randomItem = arr[Math.floor(Math.random() * arr.length)];
      const value = from.fieldPath ? _.get(randomItem, from.fieldPath) : randomItem;
      if (value === undefined) continue;
      if (to.field?.startsWith('queryParam.')) {
        const paramName = to.field.slice('queryParam.'.length);
        const urlBase = String(resolved.url ?? '');
        resolved.url = urlBase + (urlBase.includes('?') ? '&' : '?') + `${encodeURIComponent(paramName)}=${encodeURIComponent(value)}`;
      } else if (to.field?.startsWith('urlParam.')) {
        const varName = to.field.slice('urlParam.'.length);
        resolved.url = String(resolved.url ?? '').replace(
          new RegExp(`\\{\\{${varName}\\}\\}`, 'g'),
          encodeURIComponent(value)
        );
      } else {
        _.set(resolved, to.field, value);
      }
      continue;
    }

    if (mapping.type === 'collect') {
      const sourceResult = results[from.nodeId];
      if (!sourceResult) continue;
      const sourceData = Array.isArray(sourceResult)
        ? sourceResult[sourceResult.length - 1]?.response
        : sourceResult;
      const arr = _.get(sourceData, from.arrayPath);
      if (!Array.isArray(arr)) continue;
      const values = arr
        .map((item) => (from.fieldPath ? _.get(item, from.fieldPath) : item))
        .filter((v) => v != null);
      if (values.length === 0) continue;
      const qs = values.map((v) => `${to.paramName}[]=${encodeURIComponent(v)}`).join('&');
      const urlBase = String(resolved.url ?? '');
      resolved.url = urlBase + (urlBase.includes('?') ? '&' : '?') + qs;
      continue;
    }

    let value;

    if (from.nodeId === '__iteration__') {
      // Value comes from current iteration item
      value = iterationItem !== undefined
        ? (from.path ? _.get(iterationItem, from.path) : iterationItem)
        : undefined;
    } else {
      const sourceResult = results[from.nodeId];
      if (!sourceResult) continue;

      // sourceResult may be array (iterated) or single response object
      const sourceData = Array.isArray(sourceResult)
        ? sourceResult[sourceResult.length - 1]?.response
        : sourceResult;

      value = _.get(sourceData, from.path);
    }

    if (value === undefined) continue;

    if (to.field?.startsWith('queryParam.')) {
      const paramName = to.field.slice('queryParam.'.length);
      const urlBase = String(resolved.url ?? '');
      resolved.url = urlBase + (urlBase.includes('?') ? '&' : '?') + `${encodeURIComponent(paramName)}=${encodeURIComponent(value)}`;
    } else if (to.field?.startsWith('urlParam.')) {
      const varName = to.field.slice('urlParam.'.length);
      resolved.url = String(resolved.url ?? '').replace(
        new RegExp(`\\{\\{${varName}\\}\\}`, 'g'),
        encodeURIComponent(value)
      );
    } else {
      _.set(resolved, to.field, value);
    }
  }

  return resolved;
}

/**
 * Merges auth inject context (e.g. headers.Authorization) into every request.
 */
function injectAuth(request, injectContext) {
  if (!injectContext || Object.keys(injectContext).length === 0) return request;
  const merged = _.cloneDeep(request);
  _.merge(merged, injectContext);
  return merged;
}

/**
 * Replaces built-in dynamic variable placeholders with current values:
 *   {{$datetime}}  → ISO 8601 datetime (e.g. 2026-05-02T14:30:00.000Z)
 *   {{$timestamp}} → Unix epoch in milliseconds
 *   {{$isoDate}}   → Date only (e.g. 2026-05-02)
 *   {{$time}}      → Time only (e.g. 14:30:00)
 */
function resolveDynamicVars(request) {
  const now = new Date();
  const vars = {
    '$datetime':  now.toISOString(),
    '$timestamp': String(now.getTime()),
    '$isoDate':   now.toISOString().slice(0, 10),
    '$time':      now.toISOString().slice(11, 19),
  };

  function substituteString(str) {
    return str.replace(/\{\{(\$[^}]+)\}\}/g, (match, key) => vars[key] ?? match);
  }

  function substituteValue(val) {
    if (typeof val === 'string') return substituteString(val);
    if (Array.isArray(val)) return val.map(substituteValue);
    if (val !== null && typeof val === 'object') {
      const result = {};
      for (const [k, v] of Object.entries(val)) result[k] = substituteValue(v);
      return result;
    }
    return val;
  }

  const resolved = _.cloneDeep(request);
  if (typeof resolved.url === 'string') resolved.url = substituteString(resolved.url);
  if (resolved.headers) resolved.headers = substituteValue(resolved.headers);
  if (resolved.body !== undefined) resolved.body = substituteValue(resolved.body);
  return resolved;
}

module.exports = { resolveMappings, injectAuth, resolveDynamicVars };
