// Local player ground position, published by Game each frame so other entities
// (e.g. NPC tank turrets) can orient toward it without a back-reference.
let lx = 0;
let lz = 0;

export function setLocalPos(x: number, z: number) {
  lx = x;
  lz = z;
}
export function getLocalPos(): { x: number; z: number } {
  return { x: lx, z: lz };
}
