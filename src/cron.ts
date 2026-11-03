const RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
] as const;

export function parseCron(cron: string): void {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== RANGES.length)
    throw new Error("Cron must have five numeric fields");
  fields.forEach((field, index) => {
    const range = RANGES[index];
    if (!range) throw new Error("Unknown cron field");
    const [minimum, maximum] = range;
    for (const expression of field.split(",")) {
      const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(expression);
      if (!match?.[1]) throw new Error(`Invalid cron field: ${field}`);
      const step = Number(match[2] ?? 1);
      const bounds =
        match[1] === "*" ? [minimum, maximum] : match[1].split("-").map(Number);
      const start = bounds[0] ?? minimum;
      const end = bounds[1] ?? start;
      if (step < 1 || start < minimum || end > maximum || start > end)
        throw new Error(`Invalid cron range: ${field}`);
    }
  });
}
