(() => {
  'use strict';
  const FORMAT_VERSION = 1;
  const SELECTION_KEY = 'tap-away.dev.skin';
  const available = Object.freeze([
    Object.freeze({ id: 'default', label: '標準' }),
    Object.freeze({ id: 'contrast', label: '配色比較（開発用）' }),
    Object.freeze({ id: 'night-garden', label: '夜の庭' }),
  ]);
  const terrainIds = ['grass', 'tree', 'rock', 'mine'];
  const assetIds = new Set([
    ...terrainIds,
    'city',
    'tower',
    'spring',
    'ruins',
    'stone_arch',
    'seated_statue',
    'long_statue',
    'paired_statue',
    'front_statue',
    'leaf_statue',
    'dressed_tree',
    'front_bird',
    'giant_flower',
    'symmetric_tree',
  ]);
  const uiVariables = Object.freeze({
    textColor: '--tap-text-color',
    surfaceColor: '--tap-surface-color',
    borderColor: '--tap-border-color',
    hoverColor: '--tap-hover-color',
    backdropColor: '--tap-backdrop-color',
    noticeTextColor: '--tap-notice-text-color',
    noticeSurfaceColor: '--tap-notice-surface-color',
    mapColor: '--tap-map-color',
  });
  // This small built-in drawing remains usable when even the standard package is unavailable.
  const builtin = {
    formatVersion: 1,
    id: 'default',
    label: '標準',
    palette: {
      hidden: { h: 48, s: 16, l: 34 },
      preview: {
        grass: { h: 85, s: 13, l: 46 },
        tree: { h: 105, s: 13, l: 46 },
        rock: { h: 55, s: 13, l: 46 },
        mine: { h: 32, s: 13, l: 46 },
      },
      opened: {
        grass: { h: 82, s: 30, l: 69 },
        tree: { h: 99, s: 26, l: 67 },
        rock: { h: 48, s: 29, l: 73 },
        mine: { h: 40, s: 32, l: 69 },
      },
    },
    objects: {
      tree: {
        trunkColor: '#6d5736',
        leafColor: '#365e43',
        shadeColor: '#688341',
        detailColor: '#c6c18399',
        shapes: [
          [
            { x: -2, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: -38 },
            { x: -2, y: -38 },
          ],
          [
            { x: 0, y: -13 },
            { x: -13, y: -12 },
            { x: -23, y: -20 },
            { x: -25, y: -32 },
            { x: -19, y: -42 },
            { x: -9, y: -46 },
            { x: -4, y: -58 },
            { x: 3, y: -63 },
            { x: 12, y: -56 },
            { x: 14, y: -44 },
            { x: 22, y: -39 },
            { x: 24, y: -27 },
            { x: 17, y: -17 },
            { x: 7, y: -15 },
          ],
          [
            { x: 1, y: -11 },
            { x: 4, y: -25 },
            { x: 15, y: -39 },
            { x: 27, y: -43 },
            { x: 28, y: -31 },
            { x: 22, y: -19 },
            { x: 12, y: -11 },
            { x: 5, y: -9 },
          ],
        ],
      },
      rock: {
        faceColor: '#c3b789',
        shadeColor: '#948560',
        lineColor: '#716b49',
        shapes: [
          [
            { x: -13, y: 0 },
            { x: -9, y: -15 },
            { x: 3, y: -23 },
            { x: 15, y: -10 },
            { x: 12, y: 3 },
          ],
          [
            { x: 3, y: -23 },
            { x: 15, y: -10 },
            { x: 12, y: 3 },
            { x: 0, y: -4 },
          ],
        ],
      },
      mine: {
        shadeColor: '#98774e',
        entranceColor: '#292b25',
        timberColor: '#c4a06a',
        shapes: [
          [
            { x: -19, y: 2 },
            { x: -17, y: -15 },
            { x: -10, y: -25 },
            { x: 6, y: -28 },
            { x: 17, y: -16 },
            { x: 20, y: 2 },
          ],
          [
            { x: -10, y: 2 },
            { x: -10, y: -16 },
            { x: -6, y: -20 },
            { x: 7, y: -20 },
            { x: 11, y: -16 },
            { x: 11, y: 2 },
          ],
          [
            { x: -13, y: 3 },
            { x: -9, y: 3 },
            { x: -9, y: -20 },
            { x: -13, y: -20 },
          ],
          [
            { x: 9, y: 3 },
            { x: 13, y: 3 },
            { x: 13, y: -20 },
            { x: 9, y: -20 },
          ],
          [
            { x: -15, y: -18 },
            { x: 15, y: -18 },
            { x: 15, y: -23 },
            { x: -15, y: -23 },
          ],
        ],
      },
      city: {
        bodyColor: '#e0cd9d',
        roofColor: '#76523c',
        doorColor: '#354d3a',
        body: [
          { x: -17, y: 0 },
          { x: 17, y: 0 },
          { x: 17, y: -29 },
          { x: -17, y: -29 },
        ],
        roof: [
          { x: -21, y: -29 },
          { x: -15, y: -41 },
          { x: 15, y: -41 },
          { x: 21, y: -29 },
        ],
      },
      tower: {
        bodyColor: '#d3c498',
        detailColor: '#3d513b',
        body: [
          { x: -10, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: -62 },
          { x: 6, y: -62 },
          { x: 6, y: -67 },
          { x: 2, y: -67 },
          { x: 2, y: -62 },
          { x: -2, y: -62 },
          { x: -2, y: -67 },
          { x: -6, y: -67 },
          { x: -6, y: -62 },
          { x: -10, y: -62 },
        ],
      },
      spring: { bodyColor: '#d3c498', waterColor: '#649caa', detailColor: '#c4e4df' },
      ruins: { bodyColor: '#d3c498', detailColor: '#3d513b' },
      stone_arch: {
        baseColor: '#a3a592',
        faceColor: '#d3ccaf',
        shadeColor: '#969783',
        lineColor: '#666c59',
      },
      front_statue: {
        bodyColor: '#b9b49a',
        shadeColor: '#969984',
        detailColor: '#626957',
        accentColor: '#d2c9ab',
        shapes: [
          [
            { x: -13, y: -5 },
            { x: 13, y: -5 },
            { x: 13, y: 0 },
            { x: -13, y: 0 },
          ],
          [
            { x: -12, y: -4 },
            { x: -11, y: -37 },
            { x: -9, y: -41 },
            { x: -5, y: -43 },
            { x: -4, y: -47 },
            { x: 4, y: -47 },
            { x: 5, y: -43 },
            { x: 9, y: -41 },
            { x: 11, y: -37 },
            { x: 12, y: -4 },
            { x: 8, y: -4 },
            { x: 7, y: -27 },
            { x: 5, y: -27 },
            { x: 5, y: -4 },
            { x: 1, y: -4 },
            { x: 0, y: -20 },
            { x: -1, y: -4 },
            { x: -5, y: -4 },
            { x: -5, y: -27 },
            { x: -7, y: -27 },
            { x: -8, y: -4 },
          ],
          [
            { x: 5, y: -43 },
            { x: 9, y: -41 },
            { x: 11, y: -37 },
            { x: 12, y: -4 },
            { x: 8, y: -4 },
            { x: 7, y: -27 },
            { x: 5, y: -27 },
            { x: 3, y: -33 },
          ],
          [
            { x: 7, y: -53 },
            { x: 6.1, y: -48 },
            { x: 3.5, y: -44.3 },
            { x: 0, y: -43 },
            { x: -3.5, y: -44.3 },
            { x: -6.1, y: -48 },
            { x: -7, y: -53 },
            { x: -6.1, y: -58 },
            { x: -3.5, y: -61.7 },
            { x: 0, y: -63 },
            { x: 3.5, y: -61.7 },
            { x: 6.1, y: -58 },
          ],
          [
            { x: -6, y: -41 },
            { x: 6, y: -41 },
            { x: 4, y: -37 },
            { x: -4, y: -37 },
          ],
          [
            { x: -4, y: -55 },
            { x: -1.7999999999999998, y: -55 },
            { x: -1.7999999999999998, y: -54 },
            { x: -4, y: -54 },
          ],
          [
            { x: 1.8, y: -55 },
            { x: 4, y: -55 },
            { x: 4, y: -54 },
            { x: 1.8, y: -54 },
          ],
          [
            { x: -0.7, y: -35 },
            { x: 0.7, y: -35 },
            { x: 1.2, y: -23 },
            { x: -1.2, y: -23 },
          ],
        ],
      },
      leaf_statue: {
        bodyColor: '#c3bfa1',
        shadeColor: '#8d997a',
        detailColor: '#5d7055',
        accentColor: '#3e6748',
        shapes: [
          [
            { x: -7, y: -3 },
            { x: -20, y: -11 },
            { x: -27, y: -31 },
            { x: -25, y: -52 },
            { x: -15, y: -44 },
            { x: -8, y: -29 },
          ],
          [
            { x: 7, y: -3 },
            { x: 20, y: -11 },
            { x: 27, y: -31 },
            { x: 25, y: -52 },
            { x: 15, y: -44 },
            { x: 8, y: -29 },
          ],
          [
            { x: -6, y: -3 },
            { x: -26, y: -8 },
            { x: -32, y: -23 },
            { x: -18, y: -22 },
            { x: -7, y: -14 },
          ],
          [
            { x: 6, y: -3 },
            { x: 26, y: -8 },
            { x: 32, y: -23 },
            { x: 18, y: -22 },
            { x: 7, y: -14 },
          ],
          [
            { x: -11, y: -4 },
            { x: 11, y: -4 },
            { x: 11, y: 0 },
            { x: -11, y: 0 },
          ],
          [
            { x: -8, y: -4 },
            { x: -7, y: -36 },
            { x: -4, y: -42 },
            { x: 4, y: -42 },
            { x: 7, y: -36 },
            { x: 8, y: -4 },
            { x: 3, y: -4 },
            { x: 0, y: -25 },
            { x: -3, y: -4 },
          ],
          [
            { x: 6, y: -47 },
            { x: 5.2, y: -43 },
            { x: 3, y: -40.1 },
            { x: 0, y: -39 },
            { x: -3, y: -40.1 },
            { x: -5.2, y: -43 },
            { x: -6, y: -47 },
            { x: -5.2, y: -51 },
            { x: -3, y: -53.9 },
            { x: 0, y: -55 },
            { x: 3, y: -53.9 },
            { x: 5.2, y: -51 },
          ],
          [
            { x: -19, y: -39 },
            { x: -18, y: -40 },
            { x: -7, y: -13 },
            { x: -8, y: -11 },
          ],
          [
            { x: 19, y: -39 },
            { x: 18, y: -40 },
            { x: 7, y: -13 },
            { x: 8, y: -11 },
          ],
          [
            { x: -3.5, y: -49 },
            { x: -1.7, y: -49 },
            { x: -1.7, y: -48.1 },
            { x: -3.5, y: -48.1 },
          ],
          [
            { x: 1.7, y: -49 },
            { x: 3.5, y: -49 },
            { x: 3.5, y: -48.1 },
            { x: 1.7, y: -48.1 },
          ],
        ],
      },
      dressed_tree: {
        bodyColor: '#838164',
        shadeColor: '#5b775b',
        detailColor: '#485b46',
        accentColor: '#b5aa85',
        shapes: [
          [
            { x: -7, y: 0 },
            { x: -4, y: -44 },
            { x: 4, y: -44 },
            { x: 7, y: 0 },
            { x: 2, y: -2 },
            { x: 0, y: -19 },
            { x: -2, y: -2 },
          ],
          [
            { x: 0, y: -28 },
            { x: -1.2, y: -20.6 },
            { x: -4.5, y: -14.7 },
            { x: -9.3, y: -11.4 },
            { x: -14.7, y: -11.4 },
            { x: -19.5, y: -14.7 },
            { x: -22.8, y: -20.6 },
            { x: -24, y: -28 },
            { x: -22.8, y: -35.4 },
            { x: -19.5, y: -41.3 },
            { x: -14.7, y: -44.6 },
            { x: -9.3, y: -44.6 },
            { x: -4.5, y: -41.3 },
            { x: -1.2, y: -35.4 },
          ],
          [
            { x: 24, y: -28 },
            { x: 22.8, y: -20.6 },
            { x: 19.5, y: -14.7 },
            { x: 14.7, y: -11.4 },
            { x: 9.3, y: -11.4 },
            { x: 4.5, y: -14.7 },
            { x: 1.2, y: -20.6 },
            { x: 0, y: -28 },
            { x: 1.2, y: -35.4 },
            { x: 4.5, y: -41.3 },
            { x: 9.3, y: -44.6 },
            { x: 14.7, y: -44.6 },
            { x: 19.5, y: -41.3 },
            { x: 22.8, y: -35.4 },
          ],
          [
            { x: -15, y: -12 },
            { x: -12, y: -41 },
            { x: -4, y: -43 },
            { x: 4, y: -43 },
            { x: 12, y: -41 },
            { x: 15, y: -12 },
            { x: 4, y: -10 },
            { x: 0, y: -18 },
            { x: -4, y: -10 },
          ],
          [
            { x: -5, y: -40 },
            { x: 0, y: -34 },
            { x: 5, y: -40 },
            { x: 3, y: -45 },
            { x: -3, y: -45 },
          ],
          [
            { x: -15, y: -48 },
            { x: -15, y: -51 },
            { x: -7, y: -51 },
            { x: -7, y: -61 },
            { x: 7, y: -61 },
            { x: 7, y: -51 },
            { x: 15, y: -51 },
            { x: 15, y: -48 },
          ],
          [
            { x: -7, y: -54 },
            { x: 7, y: -54 },
            { x: 7, y: -52 },
            { x: -7, y: -52 },
          ],
          [
            { x: -1, y: -33 },
            { x: 1, y: -33 },
            { x: 3, y: -23 },
            { x: 0, y: -20 },
            { x: -3, y: -23 },
          ],
        ],
      },
      front_bird: {
        bodyColor: '#8d9678',
        shadeColor: '#66755a',
        detailColor: '#435840',
        accentColor: '#bdb598',
        shapes: [
          [
            { x: -6, y: -17 },
            { x: -4, y: -17 },
            { x: -4, y: -2 },
            { x: -8, y: -1 },
            { x: -8, y: 0 },
            { x: -2, y: 0 },
            { x: -2, y: -17 },
          ],
          [
            { x: 6, y: -17 },
            { x: 4, y: -17 },
            { x: 4, y: -2 },
            { x: 8, y: -1 },
            { x: 8, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: -17 },
          ],
          [
            { x: -10, y: -19 },
            { x: -13, y: -28 },
            { x: -11, y: -42 },
            { x: -7, y: -49 },
            { x: 0, y: -52 },
            { x: 7, y: -49 },
            { x: 11, y: -42 },
            { x: 13, y: -28 },
            { x: 10, y: -19 },
            { x: 0, y: -13 },
          ],
          [
            { x: -11, y: -40 },
            { x: -16, y: -33 },
            { x: -17, y: -16 },
            { x: -11, y: -21 },
            { x: -5, y: -31 },
            { x: -5, y: -42 },
          ],
          [
            { x: 11, y: -40 },
            { x: 16, y: -33 },
            { x: 17, y: -16 },
            { x: 11, y: -21 },
            { x: 5, y: -31 },
            { x: 5, y: -42 },
          ],
          [
            { x: 7, y: -50 },
            { x: 6.1, y: -45.5 },
            { x: 3.5, y: -42.2 },
            { x: 0, y: -41 },
            { x: -3.5, y: -42.2 },
            { x: -6.1, y: -45.5 },
            { x: -7, y: -50 },
            { x: -6.1, y: -54.5 },
            { x: -3.5, y: -57.8 },
            { x: 0, y: -59 },
            { x: 3.5, y: -57.8 },
            { x: 6.1, y: -54.5 },
          ],
          [
            { x: -4, y: -48 },
            { x: 4, y: -48 },
            { x: 0, y: -43 },
          ],
          [
            { x: -4.5, y: -52 },
            { x: -2.7, y: -52 },
            { x: -2.7, y: -51 },
            { x: -4.5, y: -51 },
          ],
          [
            { x: 2.7, y: -52 },
            { x: 4.5, y: -52 },
            { x: 4.5, y: -51 },
            { x: 2.7, y: -51 },
          ],
          [
            { x: -4, y: -36 },
            { x: 0, y: -39 },
            { x: 4, y: -36 },
            { x: 4, y: -23 },
            { x: 0, y: -19 },
            { x: -4, y: -23 },
          ],
        ],
      },
      giant_flower: {
        bodyColor: '#6d895e',
        shadeColor: '#53714f',
        detailColor: '#7f7350',
        accentColor: '#bc784e',
        shapes: [
          [
            { x: -1.5, y: 0 },
            { x: 1.5, y: 0 },
            { x: 1, y: -53 },
            { x: -1, y: -53 },
          ],
          [
            { x: 0, y: -17 },
            { x: -9, y: -30 },
            { x: -23, y: -34 },
            { x: -19, y: -20 },
            { x: -7, y: -15 },
          ],
          [
            { x: 0, y: -26 },
            { x: 9, y: -40 },
            { x: 24, y: -41 },
            { x: 20, y: -27 },
            { x: 8, y: -23 },
          ],
          [
            { x: 7, y: -65 },
            { x: 6.1, y: -58.5 },
            { x: 3.5, y: -53.7 },
            { x: 0, y: -52 },
            { x: -3.5, y: -53.7 },
            { x: -6.1, y: -58.5 },
            { x: -7, y: -65 },
            { x: -6.1, y: -71.5 },
            { x: -3.5, y: -76.3 },
            { x: 0, y: -78 },
            { x: 3.5, y: -76.3 },
            { x: 6.1, y: -71.5 },
          ],
          [
            { x: 1, y: -58 },
            { x: -0.7, y: -54.5 },
            { x: -5.5, y: -51.9 },
            { x: -12, y: -51 },
            { x: -18.5, y: -51.9 },
            { x: -23.3, y: -54.5 },
            { x: -25, y: -58 },
            { x: -23.3, y: -61.5 },
            { x: -18.5, y: -64.1 },
            { x: -12, y: -65 },
            { x: -5.5, y: -64.1 },
            { x: -0.7, y: -61.5 },
          ],
          [
            { x: 25, y: -58 },
            { x: 23.3, y: -54.5 },
            { x: 18.5, y: -51.9 },
            { x: 12, y: -51 },
            { x: 5.5, y: -51.9 },
            { x: 0.7, y: -54.5 },
            { x: -1, y: -58 },
            { x: 0.7, y: -61.5 },
            { x: 5.5, y: -64.1 },
            { x: 12, y: -65 },
            { x: 18.5, y: -64.1 },
            { x: 23.3, y: -61.5 },
          ],
          [
            { x: 0, y: -48 },
            { x: -1.1, y: -42 },
            { x: -4, y: -37.6 },
            { x: -8, y: -36 },
            { x: -12, y: -37.6 },
            { x: -14.9, y: -42 },
            { x: -16, y: -48 },
            { x: -14.9, y: -54 },
            { x: -12, y: -58.4 },
            { x: -8, y: -60 },
            { x: -4, y: -58.4 },
            { x: -1.1, y: -54 },
          ],
          [
            { x: 16, y: -48 },
            { x: 14.9, y: -42 },
            { x: 12, y: -37.6 },
            { x: 8, y: -36 },
            { x: 4, y: -37.6 },
            { x: 1.1, y: -42 },
            { x: 0, y: -48 },
            { x: 1.1, y: -54 },
            { x: 4, y: -58.4 },
            { x: 8, y: -60 },
            { x: 12, y: -58.4 },
            { x: 14.9, y: -54 },
          ],
          [
            { x: 8, y: -58 },
            { x: 7.2, y: -54.5 },
            { x: 5, y: -51.7 },
            { x: 1.8, y: -50.2 },
            { x: -1.8, y: -50.2 },
            { x: -5, y: -51.7 },
            { x: -7.2, y: -54.5 },
            { x: -8, y: -58 },
            { x: -7.2, y: -61.5 },
            { x: -5, y: -64.3 },
            { x: -1.8, y: -65.8 },
            { x: 1.8, y: -65.8 },
            { x: 5, y: -64.3 },
            { x: 7.2, y: -61.5 },
          ],
          [
            { x: 4, y: -58 },
            { x: 3.5, y: -56 },
            { x: 2, y: -54.5 },
            { x: 0, y: -54 },
            { x: -2, y: -54.5 },
            { x: -3.5, y: -56 },
            { x: -4, y: -58 },
            { x: -3.5, y: -60 },
            { x: -2, y: -61.5 },
            { x: 0, y: -62 },
            { x: 2, y: -61.5 },
            { x: 3.5, y: -60 },
          ],
          [
            { x: -18, y: -29 },
            { x: -17, y: -30 },
            { x: -1, y: -19 },
            { x: -2, y: -18 },
          ],
          [
            { x: 19, y: -36 },
            { x: 18, y: -37 },
            { x: 1, y: -28 },
            { x: 2, y: -27 },
          ],
        ],
      },
      symmetric_tree: {
        bodyColor: '#827b5a',
        shadeColor: '#365e43',
        detailColor: '#435f45',
        accentColor: '#79935f',
        shapes: [
          [
            { x: -2, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: -46 },
            { x: -2, y: -46 },
          ],
          [
            { x: -1, y: -19 },
            { x: -15, y: -30 },
            { x: -14, y: -32 },
            { x: 1, y: -23 },
            { x: 14, y: -32 },
            { x: 15, y: -30 },
          ],
          [
            { x: -3, y: -23 },
            { x: -3.9, y: -18.4 },
            { x: -6.5, y: -14.5 },
            { x: -10.4, y: -11.9 },
            { x: -15, y: -11 },
            { x: -19.6, y: -11.9 },
            { x: -23.5, y: -14.5 },
            { x: -26.1, y: -18.4 },
            { x: -27, y: -23 },
            { x: -26.1, y: -27.6 },
            { x: -23.5, y: -31.5 },
            { x: -19.6, y: -34.1 },
            { x: -15, y: -35 },
            { x: -10.4, y: -34.1 },
            { x: -6.5, y: -31.5 },
            { x: -3.9, y: -27.6 },
          ],
          [
            { x: 27, y: -23 },
            { x: 26.1, y: -18.4 },
            { x: 23.5, y: -14.5 },
            { x: 19.6, y: -11.9 },
            { x: 15, y: -11 },
            { x: 10.4, y: -11.9 },
            { x: 6.5, y: -14.5 },
            { x: 3.9, y: -18.4 },
            { x: 3, y: -23 },
            { x: 3.9, y: -27.6 },
            { x: 6.5, y: -31.5 },
            { x: 10.4, y: -34.1 },
            { x: 15, y: -35 },
            { x: 19.6, y: -34.1 },
            { x: 23.5, y: -31.5 },
            { x: 26.1, y: -27.6 },
          ],
          [
            { x: 0, y: -40 },
            { x: -0.8, y: -35.8 },
            { x: -3.2, y: -32.2 },
            { x: -6.8, y: -29.8 },
            { x: -11, y: -29 },
            { x: -15.2, y: -29.8 },
            { x: -18.8, y: -32.2 },
            { x: -21.2, y: -35.8 },
            { x: -22, y: -40 },
            { x: -21.2, y: -44.2 },
            { x: -18.8, y: -47.8 },
            { x: -15.2, y: -50.2 },
            { x: -11, y: -51 },
            { x: -6.8, y: -50.2 },
            { x: -3.2, y: -47.8 },
            { x: -0.8, y: -44.2 },
          ],
          [
            { x: 22, y: -40 },
            { x: 21.2, y: -35.8 },
            { x: 18.8, y: -32.2 },
            { x: 15.2, y: -29.8 },
            { x: 11, y: -29 },
            { x: 6.8, y: -29.8 },
            { x: 3.2, y: -32.2 },
            { x: 0.8, y: -35.8 },
            { x: 0, y: -40 },
            { x: 0.8, y: -44.2 },
            { x: 3.2, y: -47.8 },
            { x: 6.8, y: -50.2 },
            { x: 11, y: -51 },
            { x: 15.2, y: -50.2 },
            { x: 18.8, y: -47.8 },
            { x: 21.2, y: -44.2 },
          ],
          [
            { x: 12, y: -54 },
            { x: 11.1, y: -49.4 },
            { x: 8.5, y: -45.5 },
            { x: 4.6, y: -42.9 },
            { x: 0, y: -42 },
            { x: -4.6, y: -42.9 },
            { x: -8.5, y: -45.5 },
            { x: -11.1, y: -49.4 },
            { x: -12, y: -54 },
            { x: -11.1, y: -58.6 },
            { x: -8.5, y: -62.5 },
            { x: -4.6, y: -65.1 },
            { x: 0, y: -66 },
            { x: 4.6, y: -65.1 },
            { x: 8.5, y: -62.5 },
            { x: 11.1, y: -58.6 },
          ],
          [
            { x: -24, y: -20 },
            { x: -20, y: -13 },
            { x: -13, y: -11 },
            { x: -7, y: -14 },
            { x: -10, y: -16 },
            { x: -17, y: -15 },
            { x: -21, y: -18 },
          ],
          [
            { x: 24, y: -20 },
            { x: 20, y: -13 },
            { x: 13, y: -11 },
            { x: 7, y: -14 },
            { x: 10, y: -16 },
            { x: 17, y: -15 },
            { x: 21, y: -18 },
          ],
          [
            { x: -7, y: -54 },
            { x: -5, y: -59 },
            { x: 0, y: -61 },
            { x: 5, y: -59 },
            { x: 7, y: -54 },
            { x: 4, y: -56 },
            { x: 0, y: -57 },
            { x: -4, y: -56 },
          ],
        ],
      },
      memo: { paperColor: '#fff8df', inkColor: '#5c624d', stoneColor: '#969783' },
      scenery: {
        bodyColor: '#a9aa91',
        leafColor: '#527453',
        clothColor: '#626d72',
        flowerColor: '#c9a47e',
        detailColor: '#404b3c',
      },
      atmosphere: {
        shadowColor: '#25372c',
        detailColor: '#485b43',
        shadowShape: [
          { x: -1, y: 0 },
          { x: -0.8, y: -0.65 },
          { x: -0.34, y: -0.5 },
          { x: -0.12, y: -0.95 },
          { x: 0.26, y: -1 },
          { x: 0.86, y: -0.4 },
          { x: 1, y: 0.12 },
          { x: 0.63, y: 0.83 },
          { x: 0.2, y: 0.56 },
          { x: -0.2, y: 0.9 },
          { x: -0.63, y: 0.69 },
          { x: -0.88, y: 0.52 },
          { x: -1, y: 0 },
        ],
        leafShape: [
          { x: -3, y: -2 },
          { x: 0, y: 3 },
          { x: 3, y: -2 },
        ],
        birdShape: [
          { x: -3, y: -2 },
          { x: 0, y: 0 },
          { x: 3, y: -2 },
        ],
      },
    },
    lines: {
      road: '#c7b181',
      roadEdge: '#766d5044',
      hidden: '#eeeade16',
      edge: '#4f633a44',
      eligible: '#75856b',
      detail: '#466039aa',
      outline: '48, 65, 40',
      blockedOutline: '168, 70, 58',
      openedOutline: '224, 244, 194',
    },
    shadows: { ground: '#62634c12', object: '#34452f18' },
    ui: {
      textColor: '#263d2e',
      surfaceColor: '#fffdf5',
      borderColor: '#778571',
      hoverColor: '#ecefdf',
      backdropColor: '#34403666',
      noticeTextColor: '#ffffff',
      noticeSurfaceColor: '#263d2e',
      mapColor: '#ddd6b4',
    },
    assets: {},
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = (value, min, max) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const color = (value) =>
    typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
  const opaque = (value) =>
    color(value) &&
    (value.length === 4 ||
      value.length === 7 ||
      (value.length === 5 && /f$/i.test(value)) ||
      (value.length === 9 && /ff$/i.test(value)));
  const uiColor = (key, value) => (key === 'backdropColor' ? color(value) : opaque(value));
  Object.assign(builtin.objects, {
    seated_statue: {
      bodyColor: '#b9b49a',
      shadeColor: '#969984',
      detailColor: '#626957',
      accentColor: '#d2c9ab',
      shapes: [
        [
          { x: -17, y: 2 },
          { x: 17, y: 2 },
          { x: 17, y: -5 },
          { x: -17, y: -5 },
        ],
        [
          { x: -12, y: -5 },
          { x: 12, y: -5 },
          { x: 12, y: -19 },
          { x: -12, y: -19 },
        ],
        [
          { x: -8, y: -19 },
          { x: 8, y: -19 },
          { x: 6, y: -40 },
          { x: -6, y: -40 },
        ],
        [
          { x: -5, y: -42 },
          { x: 5, y: -42 },
          { x: 7, y: -49 },
          { x: 4, y: -56 },
          { x: -4, y: -56 },
          { x: -7, y: -49 },
        ],
        [
          { x: -18, y: -18 },
          { x: -12, y: -18 },
          { x: -9, y: -36 },
          { x: -14, y: -33 },
        ],
        [
          { x: 12, y: -18 },
          { x: 18, y: -18 },
          { x: 14, y: -33 },
          { x: 9, y: -36 },
        ],
        [
          { x: -10, y: -5 },
          { x: -4, y: -5 },
          { x: -3, y: -17 },
          { x: -10, y: -17 },
        ],
        [
          { x: 4, y: -5 },
          { x: 10, y: -5 },
          { x: 10, y: -17 },
          { x: 3, y: -17 },
        ],
      ],
    },
    long_statue: {
      bodyColor: '#b9b49a',
      shadeColor: '#969984',
      detailColor: '#626957',
      accentColor: '#d2c9ab',
      shapes: [
        [
          { x: -14, y: 2 },
          { x: 14, y: 2 },
          { x: 14, y: -3 },
          { x: -14, y: -3 },
        ],
        [
          { x: -5, y: -3 },
          { x: 5, y: -3 },
          { x: 4, y: -49 },
          { x: -4, y: -49 },
        ],
        [
          { x: -9, y: -28 },
          { x: -5, y: -28 },
          { x: -3, y: -59 },
          { x: -7, y: -53 },
        ],
        [
          { x: 5, y: -28 },
          { x: 9, y: -28 },
          { x: 7, y: -53 },
          { x: 3, y: -59 },
        ],
        [
          { x: -5, y: -49 },
          { x: 5, y: -49 },
          { x: 7, y: -68 },
          { x: -7, y: -68 },
        ],
        [
          { x: -6, y: -70 },
          { x: 6, y: -70 },
          { x: 8, y: -80 },
          { x: 4, y: -88 },
          { x: -4, y: -88 },
          { x: -8, y: -80 },
        ],
        [
          { x: -3, y: -78 },
          { x: -1, y: -78 },
          { x: -1, y: -77 },
          { x: -3, y: -77 },
        ],
        [
          { x: 1, y: -78 },
          { x: 3, y: -78 },
          { x: 3, y: -77 },
          { x: 1, y: -77 },
        ],
      ],
    },
    paired_statue: {
      bodyColor: '#b9b49a',
      shadeColor: '#969984',
      detailColor: '#626957',
      accentColor: '#d2c9ab',
      shapes: [
        [
          { x: -24, y: 2 },
          { x: 24, y: 2 },
          { x: 24, y: -4 },
          { x: -24, y: -4 },
        ],
        [
          { x: -18, y: -4 },
          { x: -4, y: -4 },
          { x: -6, y: -36 },
          { x: -16, y: -36 },
        ],
        [
          { x: 4, y: -4 },
          { x: 18, y: -4 },
          { x: 16, y: -46 },
          { x: 6, y: -46 },
        ],
        [
          { x: -16, y: -38 },
          { x: -6, y: -38 },
          { x: -4, y: -47 },
          { x: -8, y: -54 },
          { x: -14, y: -54 },
          { x: -18, y: -47 },
        ],
        [
          { x: 6, y: -48 },
          { x: 16, y: -48 },
          { x: 18, y: -57 },
          { x: 14, y: -64 },
          { x: 8, y: -64 },
          { x: 4, y: -57 },
        ],
        [
          { x: -7, y: -30 },
          { x: 9, y: -36 },
          { x: 10, y: -32 },
          { x: -6, y: -26 },
        ],
        [
          { x: -14, y: -45 },
          { x: -10, y: -45 },
          { x: -10, y: -43 },
          { x: -14, y: -43 },
        ],
        [
          { x: 10, y: -55 },
          { x: 14, y: -55 },
          { x: 14, y: -53 },
          { x: 10, y: -53 },
        ],
      ],
    },
  });
  function luminance(value) {
    const hex = value.slice(1),
      short = hex.length <= 4;
    const channels = short
      ? [...hex.slice(0, 3)].map((n) => parseInt(n + n, 16) / 255)
      : [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const linear = channels.map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }
  function readablePair(foreground, background, lightText = false) {
    if (!opaque(foreground) || !opaque(background)) return false;
    const foregroundLight = luminance(foreground),
      backgroundLight = luminance(background);
    return (
      (Math.max(foregroundLight, backgroundLight) + 0.05) /
        (Math.min(foregroundLight, backgroundLight) + 0.05) >=
        4.5 && (lightText ? foregroundLight > backgroundLight : foregroundLight < backgroundLight)
    );
  }
  function repairUi(ui, base) {
    if (!readablePair(ui.textColor, ui.surfaceColor)) {
      ui.textColor = base.textColor;
      ui.surfaceColor = base.surfaceColor;
    }
    if (!readablePair(ui.textColor, ui.hoverColor)) {
      ui.textColor = base.textColor;
      ui.hoverColor = base.hoverColor;
    }
    // Restoring text after a bad hover override can affect a previously valid surface pair.
    if (!readablePair(ui.textColor, ui.surfaceColor)) {
      ui.textColor = base.textColor;
      ui.surfaceColor = base.surfaceColor;
    }
    if (!readablePair(ui.noticeTextColor, ui.noticeSurfaceColor, true)) {
      ui.noticeTextColor = base.noticeTextColor;
      ui.noticeSurfaceColor = base.noticeSurfaceColor;
    }
    return ui;
  }
  const rgb = (value) =>
    typeof value === 'string' &&
    /^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/.test(value) &&
    value.split(',').every((n) => Number(n) <= 255);
  const points = (value) =>
    Array.isArray(value) &&
    value.length >= 3 &&
    value.length <= 32 &&
    value.every((p) => plain(p) && finite(p.x, -512, 512) && finite(p.y, -512, 512));
  const hsl = (value) =>
    plain(value) && finite(value.h, 0, 360) && finite(value.s, 0, 70) && finite(value.l, 0, 100);
  const copyHsl = (value) => ({ h: value.h, s: value.s, l: value.l });
  const copyPoints = (value) => value.map((p) => ({ x: p.x, y: p.y }));
  const relativeAssetPath = (value) =>
    typeof value === 'string' &&
    value.length <= 240 &&
    /^[a-z\d_-][a-z\d_./-]*\.(?:png|jpe?g|webp|gif|svg)$/i.test(value) &&
    value.split('/').every((part) => part !== '.' && part !== '..' && part !== '');
  function asset(value) {
    return (
      plain(value) &&
      relativeAssetPath(value.path) &&
      finite(value.width, 1, 1024) &&
      finite(value.height, 1, 1024) &&
      finite(value.anchorX, 0, value.width) &&
      finite(value.anchorY, 0, value.height) &&
      (value.visualHeight === undefined || finite(value.visualHeight, 0, 512))
    );
  }
  // Validation copies only known data fields. Arbitrary code and unknown properties never reach rendering.
  function validate(input) {
    if (!plain(input) || input.formatVersion !== FORMAT_VERSION) return null;
    const result = { formatVersion: FORMAT_VERSION };
    if (plain(input.palette)) {
      result.palette = {};
      if (hsl(input.palette.hidden)) result.palette.hidden = copyHsl(input.palette.hidden);
      for (const state of ['preview', 'opened'])
        if (plain(input.palette[state])) {
          result.palette[state] = {};
          for (const id of terrainIds)
            if (hsl(input.palette[state][id]))
              result.palette[state][id] = copyHsl(input.palette[state][id]);
        }
    }
    for (const section of ['objects', 'lines', 'shadows', 'ui']) {
      if (!plain(input[section])) continue;
      result[section] = {};
      for (const [key, standard] of Object.entries(builtin[section])) {
        const value = input[section][key];
        if (section === 'objects') {
          if (!plain(value)) continue;
          const object = {};
          for (const [field, baseValue] of Object.entries(standard)) {
            const candidate = value[field];
            if (field === 'shapes') {
              if (
                Array.isArray(candidate) &&
                candidate.length === baseValue.length &&
                candidate.every(points)
              )
                object[field] = candidate.map(copyPoints);
            } else if (key === 'atmosphere' && field === 'shadowShape') {
              // One start point and exactly four groups of cubic control/end points.
              if (points(candidate) && candidate.length === baseValue.length)
                object[field] = copyPoints(candidate);
            } else if (Array.isArray(baseValue)) {
              if (points(candidate)) object[field] = copyPoints(candidate);
            } else if (color(candidate)) object[field] = candidate;
          }
          result[section][key] = object;
        } else if (
          section === 'ui'
            ? uiColor(key, value)
            : section === 'lines' && ['outline', 'blockedOutline', 'openedOutline'].includes(key)
              ? rgb(value)
              : color(value)
        )
          result[section][key] = value;
      }
    }
    if (plain(input.assets)) {
      result.assets = {};
      for (const [id, value] of Object.entries(input.assets))
        if (assetIds.has(id) && asset(value))
          result.assets[id] = {
            path: value.path,
            width: value.width,
            height: value.height,
            anchorX: value.anchorX,
            anchorY: value.anchorY,
            visualHeight: value.visualHeight ?? value.height,
          };
    }
    return result;
  }
  function merge(base, patch) {
    const result = clone(base);
    if (!patch) return result;
    function copy(target, source) {
      for (const [key, value] of Object.entries(source)) {
        if (key === 'assets') {
          Object.assign(target.assets, clone(value));
          continue;
        }
        if (plain(value) && plain(target[key])) copy(target[key], value);
        else target[key] = clone(value);
      }
    }
    copy(result, patch);
    // Keep the three exploration states readable even when a valid color is a poor override.
    if (result.palette.hidden.l < 10 || result.palette.hidden.l > 45)
      result.palette.hidden = clone(base.palette.hidden);
    for (const id of terrainIds) {
      const preview = result.palette.preview[id],
        opened = result.palette.opened[id];
      if (preview.l < 35 || preview.l > 60 || preview.l < result.palette.hidden.l + 6)
        result.palette.preview[id] = clone(base.palette.preview[id]);
      if (opened.l < 65 || opened.l > 85 || opened.l < result.palette.preview[id].l + 6)
        result.palette.opened[id] = clone(base.palette.opened[id]);
    }
    if (
      terrainIds.some(
        (id) =>
          result.palette.preview[id].l < result.palette.hidden.l + 6 ||
          result.palette.opened[id].l < result.palette.preview[id].l + 6,
      )
    )
      result.palette = clone(base.palette);
    repairUi(result.ui, base.ui);
    return result;
  }
  function applyUi(skin) {
    if (typeof document === 'undefined' || !document.documentElement?.style) return;
    const style = document.documentElement.style;
    for (const variable of Object.values(uiVariables)) style.removeProperty(variable);
    for (const [key, variable] of Object.entries(uiVariables))
      style.setProperty(variable, skin.ui[key]);
  }
  function selection() {
    try {
      const value = globalThis.localStorage?.getItem(SELECTION_KEY);
      return available.some((s) => s.id === value) ? value : null;
    } catch {
      return null;
    }
  }
  function select(id) {
    if (id !== null && !available.some((s) => s.id === id)) throw Error('Unknown bundled skin');
    if (!globalThis.localStorage) throw Error('Development settings cannot be saved');
    if (id === null) globalThis.localStorage.removeItem(SELECTION_KEY);
    else globalThis.localStorage.setItem(SELECTION_KEY, id);
  }
  const baseUrl = () =>
    typeof document !== 'undefined' && document.baseURI ? document.baseURI : 'http://localhost/';
  async function read(url, json) {
    if (typeof globalThis.fetch !== 'function') throw Error('Fetch unavailable');
    const response = await globalThis.fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw Error('Appearance file unavailable');
    return json ? response.json() : response.text();
  }
  function packageUrl(id, file) {
    return new URL(`skins/${id}/${file}`, baseUrl()).href;
  }
  function resolveAssets(patch, id) {
    if (patch?.assets)
      for (const descriptor of Object.values(patch.assets))
        descriptor.url = new URL(descriptor.path, packageUrl(id, 'skin.json')).href;
    return patch;
  }
  function imageFor(descriptor) {
    return new Promise((resolve, reject) => {
      if (typeof globalThis.Image !== 'function') {
        reject(Error('Image unavailable'));
        return;
      }
      const picture = new globalThis.Image();
      const timer = setTimeout(() => {
        picture.onload = picture.onerror = null;
        reject(Error('Image timed out'));
      }, 3000);
      picture.onload = () => {
        clearTimeout(timer);
        resolve(picture);
      };
      picture.onerror = () => {
        clearTimeout(timer);
        reject(Error('Image unavailable'));
      };
      picture.src = descriptor.url;
    });
  }
  async function loadAssets(skin, standard) {
    await Promise.all(
      Object.entries(skin.assets).map(async ([id, descriptor]) => {
        try {
          descriptor.image = await imageFor(descriptor);
        } catch {
          const fallback = standard.assets[id];
          if (fallback && fallback.url !== descriptor.url) {
            try {
              skin.assets[id] = { ...fallback, image: await imageFor(fallback) };
              return;
            } catch {}
          }
          delete skin.assets[id];
        }
      }),
    );
  }
  let pendingLoad;
  const api = {
    current: clone(builtin),
    available,
    selection,
    select,
    validate,
    merge,
    relativeAssetPath,
  };
  async function load() {
    const results = await Promise.allSettled([
      read(packageUrl('default', 'skin.json'), true),
      read(new URL('config/appearance.json', baseUrl()).href, true),
    ]);
    const standardPatch =
      results[0].status === 'fulfilled'
        ? resolveAssets(validate(results[0].value), 'default')
        : null;
    const standard = merge(builtin, standardPatch);
    const configured =
      results[1].status === 'fulfilled' && plain(results[1].value) ? results[1].value.skin : null;
    let id = selection() || (available.some((s) => s.id === configured) ? configured : 'default');
    let skin = standard;
    if (id !== 'default') {
      const files = await Promise.allSettled([read(packageUrl(id, 'skin.json'), true)]);
      const patch =
        files[0].status === 'fulfilled' ? resolveAssets(validate(files[0].value), id) : null;
      if (patch) {
        skin = merge(standard, patch);
      } else id = 'default';
    }
    skin.id = id;
    skin.label = available.find((s) => s.id === id).label;
    await loadAssets(skin, standard);
    api.current = skin;
    applyUi(skin);
    return skin;
  }
  api.load = () =>
    pendingLoad ||
    (pendingLoad = load().catch(() => {
      api.current = clone(builtin);
      applyUi(api.current);
      return api.current;
    }));
  globalThis.TapSkin = api;
})();
