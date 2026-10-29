import type { Plan } from './types'

/**
 * The apartment as sketched by the owner in the editor. Measurements were read off that
 * sketch and are still approximate.
 * Rectangles list their corners top-left, top-right, bottom-right, bottom-left, so
 * edge 0 = top, 1 = right, 2 = bottom, 3 = left (edge 2 runs right to left).
 */
export const initialPlan: Plan = {
  id: 'ground',
  name: 'Ground floor',
  wallHeight: 2.4,
  rooms: [
    {
      id: 'living',
      name: 'Stue og kjøkken',
      color: '#F3D9B1',
      points: [
        { x: 0, y: 0 },
        { x: 4.65, y: 0 },
        { x: 4.65, y: 4.2 },
        { x: 0, y: 4.2 },
      ],
    },
    {
      id: 'bath',
      name: 'Gang',
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
      name: 'Soverom',
      color: '#DCE3C4',
      points: [
        { x: 0, y: 4.2 },
        { x: 3.35, y: 4.2 },
        { x: 3.35, y: 6.95 },
        { x: 0, y: 6.95 },
      ],
    },
    {
      id: 'hall',
      name: 'Bad',
      color: '#EBD3C6',
      points: [
        { x: 3.35, y: 4.2 },
        { x: 4.65, y: 4.2 },
        { x: 4.65, y: 6.95 },
        { x: 3.35, y: 6.95 },
      ],
    },
  ],
  // The two small decks (platting) outside the doors, sizes guessed from the photos.
  outdoor: [
    {
      id: 'deck-front',
      name: 'Platting',
      kind: 'deck',
      height: 0.15,
      points: [
        { x: 1.3, y: -1.6 },
        { x: 3.3, y: -1.6 },
        { x: 3.3, y: 0 },
        { x: 1.3, y: 0 },
      ],
    },
    {
      id: 'deck-back',
      name: 'Platting 2',
      kind: 'deck',
      height: 0.15,
      points: [
        { x: -2, y: 4.2 },
        { x: 0, y: 4.2 },
        { x: 0, y: 5.6 },
        { x: -2, y: 5.6 },
      ],
    },
  ],
  openings: [
    { id: 'd-top', kind: 'door', roomId: 'living', edge: 0, t: 0.49, width: 0.8 },
    { id: 'd-bath', kind: 'door', roomId: 'bath', edge: 1, t: 0.5, width: 0.7 },
    { id: 'd-outside', kind: 'door', roomId: 'bath', edge: 2, t: 0.535, width: 0.8, flip: true },
    { id: 'd-bed', kind: 'door', roomId: 'bedroom', edge: 0, t: 0.22, width: 0.8 },
    { id: 'd-hall', kind: 'door', roomId: 'living', edge: 2, t: 0.11, width: 0.8, flip: true },
    { id: 'w-left', kind: 'window', roomId: 'living', edge: 3, t: 0.68, width: 0.75 },
    { id: 'w-living', kind: 'window', roomId: 'living', edge: 1, t: 0.4, width: 1.2 },
    { id: 'w-bed', kind: 'window', roomId: 'bedroom', edge: 3, t: 0.77, width: 1.0 },
  ],
}
