export const ASCII_CHARSETS = {
  code: {
    name: "Code",
    chars:
      " .',;:-_~`\"^!|il1\\/()[]{}<>+=?rtfj7vcxzsnu*eo325akIJYLCUTFEPSZ94GVhdbqpX0OQDAKH6wmRN#8WMg&%B@$",
  },
  standard: {
    name: "Standard",
    chars: " .:-=+*#%@",
  },
  blocks: {
    name: "Blocks",
    chars: " ░▒▓█",
  },
  minimal: {
    name: "Minimal",
    chars: " .oO@",
  },
  binary: {
    name: "Binary",
    chars: " █",
  },
  detailed: {
    name: "Detailed",
    chars:
      " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  },
  dots: {
    name: "Dots",
    chars: " ·•●",
  },
  arrows: {
    name: "Arrows",
    chars: " ←↙↓↘→↗↑↖",
  },
  emoji: {
    name: "Emoji",
    chars: "  ░▒▓🌑🌒🌓🌔🌕",
  },
} as const;

export type CharsetKey = keyof typeof ASCII_CHARSETS;

export const DEFAULT_CHARSET: CharsetKey = "code";

export function getCharArray(charset: CharsetKey): string[] {
  return [...ASCII_CHARSETS[charset].chars];
}

export function getCharsetName(charset: CharsetKey): string {
  return ASCII_CHARSETS[charset].name;
}
