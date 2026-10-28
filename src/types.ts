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

export type FurnitureKind =
  | 'sofa'
  | 'bed'
  | 'table'
  | 'chair'
  | 'shelf'
  | 'cabinet'
  | 'lamp'
  | 'plant'
  | 'rug'
  | 'box'

/** A piece of furniture standing on the floor. Sizes are in meters. */
export interface FurnitureItem {
  id: string
  name: string
  kind: FurnitureKind
  /** Center of the item on the floor plan. */
  x: number
  y: number
  /** Rotation around the vertical axis, in degrees. */
  rotation: number
  width: number
  depth: number
  height: number
  color: string
  /** Small copy of the photo the item was made from, as a data URL. */
  image?: string
  /** The product page or image link the item came from. */
  sourceUrl?: string
}

/** One floor of the home. The editor works on one of these at a time. */
export interface Plan {
  id: string
  name: string
  rooms: Room[]
  openings: Opening[]
  furniture?: FurnitureItem[]
  /** Ceiling height of this floor. */
  wallHeight: number
  /** The floor plan drawing traced on this floor. */
  background?: BackgroundImage
  /** Basements sit below the ground in the 3D view. */
  belowGround?: boolean
}

/** The whole home: its floors, listed from the bottom up. */
export interface Home {
  levels: Plan[]
}
