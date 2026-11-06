/**
 * Structural twin of pi-herdr-agents' AcquisitionUncertainError.
 *
 * The upstream launch boundary checks `code`/`uncertainty` structurally, so
 * the Rex adapter can report an uncertain command dispatch without importing a
 * node_modules TypeScript module at runtime (which Node's type stripper
 * refuses to load outside the extension host).
 */
export type RexUncertainty =
	| {
			kind: "surface-create";
			placement: "tab" | "split";
			observedSurfaceId?: string;
	  }
	| { kind: "command-dispatch"; surfaceId: string };

export class RexAcquisitionUncertainError extends Error {
	readonly code = "PIHA_ACQUISITION_UNCERTAIN";
	readonly uncertainty: RexUncertainty;

	constructor(
		message: string,
		uncertainty: RexUncertainty,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "AcquisitionUncertainError";
		this.uncertainty = uncertainty;
	}
}
