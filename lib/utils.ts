type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function cn(...classes: ClassValue[]): string {
  return classes
    .flatMap((cls) => {
      if (!cls) return [];
      if (typeof cls === "string" || typeof cls === "number") return [String(cls)];
      if (Array.isArray(cls)) return [cn(...cls)];
      if (typeof cls === "object") {
        return Object.entries(cls)
          .filter(([, v]) => v)
          .map(([k]) => k);
      }
      return [];
    })
    .join(" ");
}
