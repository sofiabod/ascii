#version 300 es
precision highp float;

uniform sampler2D u_video;
uniform sampler2D u_asciiAtlas;

uniform vec2 u_resolution;
uniform vec2 u_charSize;
uniform vec2 u_gridSize;
uniform float u_numChars;

uniform bool u_colored;
uniform float u_blend;
uniform float u_highlight;
uniform float u_brightness;

uniform float u_audioLevel;
uniform float u_audioReactivity;
uniform float u_audioSensitivity;

uniform vec2 u_mouse;
uniform float u_mouseRadius;
uniform vec2 u_trail[18];
uniform int u_trailLength;

uniform vec4 u_ripples[8];
uniform float u_time;
uniform float u_rippleEnabled;
uniform float u_rippleSpeed;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 cellCoord = floor(v_texCoord * u_gridSize);
  vec2 thisCell = cellCoord;

  vec2 cellCenter = (cellCoord + 0.5) / u_gridSize;
  vec4 videoColor = texture(u_video, cellCenter);

  float baseBrightness = dot(videoColor.rgb, vec3(0.299, 0.587, 0.114));

  float minBrightness = mix(0.3, 0.0, u_audioSensitivity);
  float maxBrightness = mix(1.0, 5.0, u_audioSensitivity);
  float audioMultiplier = mix(minBrightness, maxBrightness, u_audioLevel);
  float audioModulated = baseBrightness * audioMultiplier;
  float brightness = mix(baseBrightness, audioModulated, u_audioReactivity);

  float cursorGlow = 0.0;
  float radius = 7.0;

  float aspect = u_charSize.x / u_charSize.y;
  vec2 mouseCell = floor(u_mouse * u_gridSize);
  vec2 diff = (thisCell - mouseCell) * vec2(aspect, 1.0);
  float cellDist = length(diff);
  if (u_mouse.x >= 0.0) {
    cursorGlow = smoothstep(radius, radius * 0.3, cellDist);
  }

  for (int i = 0; i < 18; i++) {
    if (i >= u_trailLength) break;
    vec2 trailPos = u_trail[i];
    if (trailPos.x < 0.0) continue;

    vec2 trailCell = floor(trailPos * u_gridSize);
    vec2 tDiff = (thisCell - trailCell) * vec2(aspect, 1.0);
    float trailDist = length(tDiff);
    float trailR = radius * 0.7;

    cursorGlow = max(cursorGlow, smoothstep(trailR, trailR * 0.3, trailDist));
  }

  float adjustedBrightness = pow(brightness, 1.0 / u_brightness);
  adjustedBrightness = clamp(adjustedBrightness, 0.0, 1.0);

  float visibleGlow = cursorGlow * u_mouseRadius;
  float cellId = dot(cellCoord, vec2(127.1, 311.7));
  float wave = sin(u_time * 0.8 + cellId) * sin(u_time * 1.3 + cellId * 0.7);
  float jitter = wave * 0.08 * (1.0 - visibleGlow);
  adjustedBrightness = clamp(adjustedBrightness + jitter, 0.0, 1.0);

  float charIndex = floor(adjustedBrightness * (u_numChars - 0.001));

  float atlasX = charIndex / u_numChars;
  vec2 cellPos = fract(v_texCoord * u_gridSize);
  vec2 atlasCoord = vec2(atlasX + cellPos.x / u_numChars, cellPos.y);
  vec4 charColor = texture(u_asciiAtlas, atlasCoord);

  float glow = cursorGlow * u_mouseRadius;

  vec3 baseColor;
  if (u_colored) {
    baseColor = videoColor.rgb;
  } else {
    baseColor = vec3(0.0, 1.0, 0.0);
  }

  float bgIntensity = 0.15 + u_highlight * 0.35;
  vec3 bgColor = baseColor * bgIntensity;
  vec3 textColor = baseColor * 1.2;
  vec3 finalColor = mix(bgColor, textColor, charColor.r);

  vec3 litBg = baseColor * 3.0;
  vec3 litText = baseColor * 8.0;
  vec3 litColor = mix(litBg, litText, charColor.r);
  finalColor = mix(finalColor, litColor, glow);

  vec3 blendedColor = mix(finalColor, videoColor.rgb, u_blend);

  fragColor = vec4(blendedColor, 1.0);
}
