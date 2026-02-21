export { VERTEX_SHADER, FRAGMENT_SHADER } from "./shaders";

export {
  compileShader,
  createProgram,
  createFullscreenQuad,
  createVideoTexture,
  createAsciiAtlas,
  calculateGridDimensions,
} from "./utils";

export {
  CHAR_WIDTH_RATIO,
  type AsciiStats,
  type UniformLocations,
  type VideoToAsciiProps,
} from "./types";
