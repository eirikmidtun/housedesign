// All plan coordinates are in meters. x grows to the right, y grows downward (as on screen).

export interface Point {
  x: number
  y: number
}

export interface Room {
  id: string
  name: string
  color: string
  /** Polygon corners in clockwise or counter-clockwise order. */
  points: Point[]
}

export type OpeningKind = 'door' | 'window'

/** A door or window that sits on one wall (edge) of a room. */
export interface Opening {
  id: string
  kind: OpeningKind
  roomId: string
  /** Index of the edge: from points[edge] to points[edge + 1]. */
  edge: number
  /** Position of the opening's center along the edge, 0..1. */
  t: number
  /** Width in meters. */
  width: number
  /** Which side the door swings to (doors only). */
  flip?: boolean
}

export interface BackgroundImage {
  dataUrl: string
  /** Position of the image's top-left corner, in meters. */
  x: number
  y: number
  /** How many meters one image pixel covers. */
  metersPerPixel: number
  opacity: number
  naturalWidth: number
  naturalHeight: number
}

export interface Plan {
  rooms: Room[]
  openings: Opening[]
  wallHeight: number
  background?: BackgroundImage
}
