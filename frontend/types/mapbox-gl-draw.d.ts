declare module "@mapbox/mapbox-gl-draw" {
  interface MapboxDrawOptions {
    displayControlsDefault?: boolean
    controls?: {
      polygon?: boolean
      trash?: boolean
      [key: string]: boolean | undefined
    }
  }

  export default class MapboxDraw {
    constructor(options?: MapboxDrawOptions)
    changeMode(mode: string): void
    deleteAll(): void
    getAll(): { features: Array<{ geometry?: { type?: string; coordinates?: number[][][] } }> }
  }
}
