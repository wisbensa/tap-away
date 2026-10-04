(() => {
  'use strict';
  // Color slots pair with the validated polygons in each skin package.
  // These ornaments are deliberately flat and frontal; their saved orientation
  // does not turn them into moving characters or alter their ground coordinate.
  const colors = Object.freeze({
    front_statue: [
      'shadeColor',
      'bodyColor',
      'shadeColor',
      'bodyColor',
      'accentColor',
      'detailColor',
      'detailColor',
      'shadeColor',
    ],
    leaf_statue: [
      'accentColor',
      'accentColor',
      'shadeColor',
      'shadeColor',
      'shadeColor',
      'bodyColor',
      'bodyColor',
      'detailColor',
      'detailColor',
      'detailColor',
      'detailColor',
    ],
    dressed_tree: [
      'bodyColor',
      'shadeColor',
      'shadeColor',
      'shadeColor',
      'accentColor',
      'bodyColor',
      'detailColor',
      'detailColor',
    ],
    front_bird: [
      'detailColor',
      'detailColor',
      'bodyColor',
      'shadeColor',
      'shadeColor',
      'bodyColor',
      'accentColor',
      'detailColor',
      'detailColor',
      'accentColor',
    ],
    giant_flower: [
      'bodyColor',
      'bodyColor',
      'bodyColor',
      'accentColor',
      'accentColor',
      'accentColor',
      'accentColor',
      'accentColor',
      'detailColor',
      'shadeColor',
      'shadeColor',
      'shadeColor',
    ],
    symmetric_tree: [
      'bodyColor',
      'bodyColor',
      'shadeColor',
      'shadeColor',
      'shadeColor',
      'shadeColor',
      'accentColor',
      'detailColor',
      'detailColor',
      'shadeColor',
    ],
  });
  function objectFor(type, skin) {
    return Object.hasOwn(colors, type)
      ? skin?.objects?.[type] || globalThis.TapSkin?.current?.objects?.[type]
      : null;
  }
  function bounds(type, skin = globalThis.TapSkin?.current) {
    const object = objectFor(type, skin);
    if (!object) return null;
    const points = object.shapes.flat();
    return {
      left: Math.min(-18, ...points.map((p) => p.x)),
      right: Math.max(18, ...points.map((p) => p.x)),
      top: Math.min(-2, ...points.map((p) => p.y)),
      bottom: Math.max(5, ...points.map((p) => p.y)),
    };
  }
  function draw(ctx, type, x, y, scale, skin = globalThis.TapSkin?.current) {
    const object = objectFor(type, skin);
    if (!object) return false;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = skin?.shadows?.object || globalThis.TapSkin.current.shadows.object;
    ctx.beginPath();
    ctx.ellipse(2, 1.5, 16, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    object.shapes.forEach((shape, index) => {
      ctx.fillStyle = object[colors[type][index]];
      ctx.beginPath();
      shape.forEach((point, i) =>
        i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
      );
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
    return true;
  }
  globalThis.TapScenery = Object.freeze({ draw, bounds });
})();
