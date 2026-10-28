import type { Plan } from './types'

/**
 * First draft traced from the rough hand sketch. Sizes are estimates and are meant
 * to be corrected in the editor.
 * Rectangles list their corners top-left, top-right, bottom-right, bottom-left, so
 * edge 0 = top, 1 = right, 2 = bottom, 3 = left.
 */
export const initialPlan: Plan = {
  wallHeight: 2.4,
  rooms: [
    {
      id: 'living',
      name: 'Living room & kitchen',
      color: '#F3D9B1',
      points: [
        { x: 0, y: 0 },
        { x: 5.6, y: 0 },
        { x: 5.6, y: 4.2 },
        { x: 0, y: 4.2 },
      ],
    },
    {
      id: 'bath',
      name: 'Bathroom',
      color: '#CFE0DC',
      points: [
        { x: -2, y: 2.2 },
        { x: 0, y: 2.2 },
        { x: 0, y: 4.2 },
        { x: -2, y: 4.2 },
      ],
    },
    {
      id: 'bedroom',
      name: 'Bedroom',
      color: '#DCE3C4',
      points: [
        { x: 0.6, y: 4.2 },
        { x: 3.7, y: 4.2 },
        { x: 3.7, y: 7.1 },
        { x: 0.6, y: 7.1 },
      ],
    },
    {
      id: 'hall',
      name: 'Entrance hall',
      color: '#EBD3C6',
      points: [
        { x: 3.7, y: 4.2 },
        { x: 4.6, y: 4.2 },
        { x: 4.6, y: 7.1 },
        { x: 3.7, y: 7.1 },
      ],
    },
  ],
  openings: [
    { id: 'd-bed', kind: 'door', roomId: 'bedroom', edge: 0, t: 0.22, width: 0.8 },
    { id: 'd-hall', kind: 'door', roomId: 'hall', edge: 0, t: 0.5, width: 0.8 },
    { id: 'd-entry', kind: 'door', roomId: 'hall', edge: 2, t: 0.5, width: 0.9 },
    { id: 'd-bath', kind: 'door', roomId: 'bath', edge: 1, t: 0.5, width: 0.7 },
    { id: 'w-kitchen', kind: 'window', roomId: 'living', edge: 0, t: 0.3, width: 1.0 },
    { id: 'w-living', kind: 'window', roomId: 'living', edge: 1, t: 0.4, width: 1.2 },
    { id: 'w-bed', kind: 'window', roomId: 'bedroom', edge: 3, t: 0.5, width: 1.0 },
    { id: 'w-bath', kind: 'window', roomId: 'bath', edge: 0, t: 0.5, width: 0.6 },
  ],
}
