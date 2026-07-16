import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner (the `cn` the UI-kit components expect). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
