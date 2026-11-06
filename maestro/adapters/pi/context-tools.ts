/** Known context-compression providers; a marker identifies an installed provider. */
export const CONTEXT_COMPRESSION_PROVIDERS = [
	{
		id: "billion-context",
		marker: "compress",
		tools: ["compress", "decompress", "search_context", "acp_status"],
		optionalTools: ["acp_rule"],
	},
] as const;

/** Only return registered tools from installed providers, in registry order. */
export function resolveContextTools(registered: Iterable<string>): string[] {
	const available = new Set(registered);
	const resolved = new Set<string>();
	for (const provider of CONTEXT_COMPRESSION_PROVIDERS) {
		if (!available.has(provider.marker)) continue;
		for (const tool of [...provider.tools, ...provider.optionalTools]) {
			if (available.has(tool)) resolved.add(tool);
		}
	}
	return [...resolved];
}
