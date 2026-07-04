export function truncateForTerminal(text: string, maxLines = 10): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  const hidden = lines.length - maxLines;
  return `${lines.slice(0, maxLines).join('\n')}\n... (${hidden} more line${hidden === 1 ? '' : 's'} truncated)`;
}
