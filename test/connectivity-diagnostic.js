(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HighwayConnectivityDiagnostic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = { endpointToleranceMetres: 25, junctionRadiusMetres: 1500 };

  function haversine(a, b) {
    const rad = Math.PI / 180;
    const lat1 = Number(a[1]) * rad, lat2 = Number(b[1]) * rad;
    const dLat = lat2 - lat1, dLon = (Number(b[0]) - Number(a[0])) * rad;
    const q = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  }

  function pathsOf(geometry) {
    if (!geometry) return [];
    if (geometry.type === "LineString") return [geometry.coordinates || []];
    if (geometry.type === "MultiLineString") return geometry.coordinates || [];
    return [];
  }

  function featuresOf(data) {
    if (Array.isArray(data)) return data;
    if (data && data.type === "FeatureCollection") return data.features || [];
    return data ? [data] : [];
  }

  function normalRef(value) {
    return String(value || "").toUpperCase().replace(/\\s+/g, "");
  }

  function pointToPath(point, path) {
    let nearest = Infinity;
    for (const coord of path) nearest = Math.min(nearest, haversine(point, coord));
    return nearest;
  }

  function analyse(data, junctionPoints, requestedRef, options) {
    const settings = Object.assign({}, DEFAULTS, options || {});
    const refs = (Array.isArray(requestedRef) ? requestedRef : [requestedRef]).map(normalRef);
    const ways = [];
    featuresOf(data).forEach((feature, index) => {
      if (!feature || !feature.geometry) return;
      const props = feature.properties || {};
      const highway = String(props.highway || "").toLowerCase();
      if (highway !== "motorway" && highway !== "motorway_link") return;
      pathsOf(feature.geometry).forEach((coordinates, pathIndex) => {
        if (!Array.isArray(coordinates) || coordinates.length < 2) return;
        ways.push({
          id: String(feature.id !== undefined ? feature.id : (props["@id"] || "way-" + index)) + (pathsOf(feature.geometry).length > 1 ? ":" + pathIndex : ""),
          highway, ref: String(props.ref || ""), name: String(props.name || ""),
          destination: String(props.destination || ""),
          destinationRef: String(props["destination:ref"] || props.destination_ref || ""),
          coordinates, properties: props,
          start: coordinates[0], end: coordinates[coordinates.length - 1]
        });
      });
    });

    const points = (junctionPoints || []).filter(p => Array.isArray(p) && p.length >= 2);
    const mainlineSeeds = ways.filter(way => way.highway === "motorway" &&
      refs.some(ref => ref && normalRef(way.ref).split(";").map(normalRef).includes(ref)) &&
      points.some(point => pointToPath(point, way.coordinates) <= settings.junctionRadiusMetres));

    const reached = new Set(mainlineSeeds.map(way => way.id));
    const queue = mainlineSeeds.slice();
    const links = ways.filter(way => way.highway === "motorway_link");
    while (queue.length) {
      const current = queue.shift();
      ways.forEach(candidate => {
        if (reached.has(candidate.id)) return;
        const touching = [
          haversine(current.start, candidate.start), haversine(current.start, candidate.end),
          haversine(current.end, candidate.start), haversine(current.end, candidate.end)
        ].some(distance => distance <= settings.endpointToleranceMetres);
        if (touching) { reached.add(candidate.id); queue.push(candidate); }
      });
    }

    const nearbyLinks = links.filter(link => points.some(point =>
      pointToPath(point, link.coordinates) <= settings.junctionRadiusMetres));
    const branches = nearbyLinks.map(link => ({
      id: link.id, highway: link.highway, ref: link.ref,
      destinationRef: link.destinationRef, destination: link.destination,
      name: link.name, connected: reached.has(link.id),
      classification: reached.has(link.id)
        ? (normalRef(link.ref) && refs.includes(normalRef(link.ref)) ? "requested-motorway branch" : "connected cross-reference branch")
        : "nearby but not connected"
    })).sort((a, b) => a.id.localeCompare(b.id));

    return {
      requestedRefs: refs, endpointToleranceMetres: settings.endpointToleranceMetres,
      junctionRadiusMetres: settings.junctionRadiusMetres,
      seedMainlineIds: mainlineSeeds.map(way => way.id),
      connectedWayIds: Array.from(reached).sort(),
      branches,
      summary: {
        connected: branches.filter(branch => branch.connected).length,
        unconnected: branches.filter(branch => !branch.connected).length,
        refs: Array.from(new Set(branches.filter(branch => branch.connected)
          .flatMap(branch => [branch.ref, branch.destinationRef]).filter(Boolean))).sort()
      }
    };
  }

  return { analyse, defaults: Object.assign({}, DEFAULTS) };
});
