import {
  appearanceSettingsSchema,
  themePresetSchema,
  type Settings,
} from '@harness/contracts';
export function appearanceFrom(settings: Settings) {
  return appearanceSettingsSchema.parse(
    Object.fromEntries(
      Object.keys(appearanceSettingsSchema.shape).map((key) => [
        key,
        settings[key as keyof Settings],
      ]),
    ),
  );
}
export function exportTheme(settings: Settings) {
  return JSON.stringify(
    {
      format: 'axioden-theme',
      version: 1,
      appearance: appearanceFrom(settings),
    },
    null,
    2,
  );
}
export function importTheme(text: string) {
  if (new TextEncoder().encode(text).byteLength > 65536)
    throw new Error('Theme files must be smaller than 64 KiB.');
  return themePresetSchema.parse(JSON.parse(text)).appearance;
}
export function contrastRatio(first: string, second: string) {
  const luminance = (hex: string) => {
    const values = [1, 3, 5]
      .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return (
      (values[0] ?? 0) * 0.2126 +
      (values[1] ?? 0) * 0.7152 +
      (values[2] ?? 0) * 0.0722
    );
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
