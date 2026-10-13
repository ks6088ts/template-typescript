export type Log = (event: string, fields?: Record<string, unknown>) => void;

export function createLogger(output: Pick<NodeJS.WriteStream, "write"> = process.stdout): Log {
  return (event, fields = {}) => {
    output.write(`${JSON.stringify({ ...fields, timestamp: new Date().toISOString(), event })}\n`);
  };
}
