"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { analyse } = require("./connectivity-diagnostic.js");

function way(id, highway, ref, coordinates, extra) {
  return { type: "Feature", id, properties: Object.assign({ highway, ref }, extra),
    geometry: { type: "LineString", coordinates } };
}

test("traces connected links across M60, M602 and M62 refs using endpoints", () => {
  const data = { type: "FeatureCollection", features: [
    way("m60", "motorway", "M60", [[-2.36, 53.48], [-2.35, 53.48]]),
    way("ramp-a", "motorway_link", "M60", [[-2.35, 53.48], [-2.34, 53.48]]),
    way("ramp-b", "motorway_link", "M602", [[-2.34, 53.48], [-2.33, 53.48]], { destination: "Manchester" }),
    way("ramp-c", "motorway_link", "M62", [[-2.33, 53.48], [-2.32, 53.48]], { "destination:ref": "M62" }),
    way("nearby", "motorway_link", "M60", [[-2.36, 53.481], [-2.35, 53.481]])
  ] };
  const report = analyse(data, [[-2.35, 53.48]], "M60", { junctionRadiusMetres: 1500 });
  assert.deepEqual(report.seedMainlineIds, ["m60"]);
  assert.equal(report.branches.find(x => x.id === "ramp-b").connected, true);
  assert.equal(report.branches.find(x => x.id === "ramp-c").connected, true);
  assert.equal(report.branches.find(x => x.id === "nearby").connected, false);
  assert.deepEqual(report.summary.refs, ["M60", "M602", "M62"]);
});

test("joins small endpoint gaps only within tolerance", () => {
  const data = { type: "FeatureCollection", features: [
    way("m60", "motorway", "M60", [[-2.36, 53.48], [-2.35, 53.48]]),
    way("gap", "motorway_link", "M602", [[-2.3499, 53.48], [-2.34, 53.48]])
  ] };
  assert.equal(analyse(data, [[-2.35, 53.48]], "M60", { endpointToleranceMetres: 10 }).branches[0].connected, true);
  assert.equal(analyse(data, [[-2.35, 53.48]], "M60", { endpointToleranceMetres: 5 }).branches[0].connected, false);
});

test("does not seed a distant or differently referenced mainline", () => {
  const data = { type: "FeatureCollection", features: [
    way("other", "motorway", "M62", [[-2.36, 53.48], [-2.35, 53.48]]),
    way("link", "motorway_link", "M602", [[-2.35, 53.48], [-2.34, 53.48]])
  ] };
  const report = analyse(data, [[-2.35, 53.48]], "M60");
  assert.deepEqual(report.seedMainlineIds, []);
  assert.equal(report.branches[0].connected, false);
});
