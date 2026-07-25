import * as THREE from 'three';

const SCRATCH = new THREE.Vector3();

/**
 * A strip of quads that follows the road: `rows` samples along the path by
 * `columns.length` lateral offsets. Positions are rewritten every frame (the
 * whole world scrolls past a stationary car), the index buffer is built once.
 *
 * `skipQuads` lists column indices whose quad to the right should be omitted —
 * used to leave a hole where another ribbon already covers the ground, and to
 * drop the zero-width quads between duplicated columns that give crisp edges.
 */
export class Ribbon {
  constructor({ columns, rows, material, skipQuads = [] }) {
    this.columns = columns;
    this.rows = rows;

    const vertexCount = rows * columns.length;
    this.positions = new Float32Array(vertexCount * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    // Flat-shaded materials derive normals in the fragment shader, but keep a
    // valid attribute around so the geometry works with any material.
    const normals = new Float32Array(vertexCount * 3);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    const skip = new Set(skipQuads);
    const indices = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < columns.length - 1; c++) {
        if (skip.has(c)) continue;
        const a = r * columns.length + c;
        const b = a + 1;
        const d = a + columns.length;
        const e = d + 1;
        indices.push(a, b, e, a, e, d);
      }
    }
    geometry.setIndex(indices);
    // The ribbon is rebuilt around the camera every frame; culling it against a
    // stale bounding volume would pop it out of view on corners.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000);

    this.geometry = geometry;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  /**
   * @param {PathFrame} frame anchored at the car's distance
   * @param {(row:number) => number} distanceForRow
   * @param {(w:number, s:number, row:number) => number} heightForColumn
   */
  update(frame, distanceForRow, heightForColumn) {
    const { columns, positions } = this;
    let p = 0;
    for (let r = 0; r < this.rows; r++) {
      const s = distanceForRow(r);
      frame.setRow(s);
      for (let c = 0; c < columns.length; c++) {
        const w = columns[c];
        frame.column(w, heightForColumn(w, s, r), SCRATCH);
        positions[p++] = SCRATCH.x;
        positions[p++] = SCRATCH.y;
        positions[p++] = SCRATCH.z;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
  }
}
