"use client";

import { useEffect } from "react";
import {
  installClientLocationHeader,
  startClientLocationWatch,
} from "../lib/clientLocation";

/** Mounted once in the root layout: asks for location and tags API calls with it. */
export function ClientLocationWatcher(): null {
  useEffect(() => {
    installClientLocationHeader();
    startClientLocationWatch();
  }, []);
  return null;
}
