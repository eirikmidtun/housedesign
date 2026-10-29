import type { Plan } from './types'

/**
 * The apartment as measured by the owner (notebook, October 2026). Room outlines run along
 * the middle of the walls, so each rectangle is one wall thickness (12 cm) bigger than the
 * inside measurement: stue 4,54 × 3,17 m, soverom 2,65 × 3,20 m, bad 1,74 × 3,11 m and
 * gang 1,55 × 1,69 m. The kitchen (shortened from 2,67 m so the 72 cm cupboard fits beside it)
 * runs along the right wall of the living room. Ceiling height, door widths and the living room windows aren't measured yet.
 * Rectangles list their corners top-left, top-right, bottom-right, bottom-left, so
 * edge 0 = top, 1 = right, 2 = bottom, 3 = left (edge 2 runs right to left).
 */
export const initialPlan: Plan = {
  id: 'ground',
  name: 'Ground floor',
  wallHeight: 2.4,
  draftVersion: 4,
  rooms: [
    {
      id: 'living',
      name: 'Stue og kjøkken',
      color: '#F3D9B1',
      points: [
        { x: 0, y: 0 },
        { x: 4.66, y: 0 },
        { x: 4.66, y: 3.29 },
        { x: 0, y: 3.29 },
      ],
    },
    {
      id: 'bath',
      name: 'Gang',
      color: '#CFE0DC',
      points: [
        { x: -1.81, y: 1.62 },
        { x: 0, y: 1.62 },
        { x: 0, y: 3.29 },
        { x: -1.81, y: 3.29 },
      ],
    },
    {
      id: 'bedroom',
      name: 'Soverom',
      color: '#DCE3C4',
      points: [
        { x: 0, y: 3.29 },
        { x: 2.77, y: 3.29 },
        { x: 2.77, y: 6.61 },
        { x: 0, y: 6.61 },
      ],
    },
    {
      id: 'hall',
      name: 'Bad',
      color: '#EBD3C6',
      points: [
        { x: 2.77, y: 3.29 },
        { x: 4.66, y: 3.29 },
        { x: 4.66, y: 6.52 },
        { x: 2.77, y: 6.52 },
      ],
    },
  ],
  furniture: [
    { id: 'kitchen', name: 'Kjøkken', kind: 'cabinet', x: 4.3, y: 1.285, rotation: 90, width: 2.45, depth: 0.6, height: 0.9, color: '#F2EEE6' },
    // 140 × 200 cm, head against the bathroom-side corner so the cellar hatch stays free.
    { id: 'bed', name: 'Seng', kind: 'bed', x: 2.01, y: 5.55, rotation: 180, width: 1.4, depth: 2.0, height: 0.9, color: '#EDE7DD' },
    // Height not measured.
    { id: 'kitchen-cupboard', name: 'Skap', kind: 'cabinet', x: 4.4, y: 2.87, rotation: 90, width: 0.72, depth: 0.4, height: 2.0, color: '#F2EEE6' },
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
        { x: -1.81, y: 3.29 },
        { x: 0, y: 3.29 },
        { x: 0, y: 4.69 },
        { x: -1.81, y: 4.69 },
      ],
    },
  ],
  openings: [
    { id: 'd-top', kind: 'door', roomId: 'living', edge: 0, t: 0.49, width: 0.8 },
    { id: 'd-bath', kind: 'door', roomId: 'bath', edge: 1, t: 0.5, width: 0.7 },
    { id: 'd-outside', kind: 'door', roomId: 'bath', edge: 2, t: 0.535, width: 0.8, flip: true },
    // Close to the window wall: 10 cm from the corner, 1,04 m round the corner to the window.
    { id: 'd-bed', kind: 'door', roomId: 'bedroom', edge: 0, t: 0.202, width: 0.8 },
    { id: 'd-hall', kind: 'door', roomId: 'living', edge: 2, t: 0.249, width: 0.8, flip: true },
    { id: 'w-left', kind: 'window', roomId: 'living', edge: 3, t: 0.68, width: 0.75 },
    { id: 'w-living', kind: 'window', roomId: 'living', edge: 1, t: 0.4, width: 1.2 },
    { id: 'w-bed', kind: 'window', roomId: 'bedroom', edge: 3, t: 0.541, width: 1.05, sill: 0.775 },
    // On the outside long wall; the width and position along the wall are guesses.
    { id: 'w-bath', kind: 'window', roomId: 'hall', edge: 1, t: 0.5, width: 0.6, sill: 1.675 },
  ],
}

/**
 * The small wine cellar, 1,50 × 1,50 m inside, under the bedroom. Its stairs come up through
 * a hatch in the bedroom floor. Where under the bedroom it lies and how tall it is are guesses.
 */
export const initialCellar: Plan = {
  id: 'cellar',
  name: 'Kjeller',
  wallHeight: 2.0,
  belowGround: true,
  rooms: [
    {
      id: 'cellar',
      name: 'Vinkjeller',
      color: '#E8D5E4',
      points: [
        { x: 0.58, y: 4.14 },
        { x: 2.2, y: 4.14 },
        { x: 2.2, y: 5.76 },
        { x: 0.58, y: 5.76 },
      ],
    },
  ],
  openings: [],
  // A steep flight, since a regular one would not fit in the room.
  furniture: [{ id: 'cellar-stairs', name: 'Trapp', kind: 'stairs', x: 0.94, y: 4.8, rotation: 0, width: 0.6, depth: 1.2, height: 2.25, color: '#C9A27A' }],
}
