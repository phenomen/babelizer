declare module "@foundryvtt/foundryvtt-cli" {
  export function extractPack(
    input: string,
    output: string,
    options?: { nedb?: boolean }
  ): Promise<void>;
}

