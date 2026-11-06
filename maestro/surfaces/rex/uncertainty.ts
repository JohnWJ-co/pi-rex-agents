/**
 * Structural twin of the local core AcquisitionUncertainError.
 *
 * The launch boundary checks `code`/`uncertainty` structurally so the Rex
 * adapter can report uncertain dispatch without coupling the CLI surface
 * implementation to the orchestration core.
 */
export type RexUncertainty =
	| {
			kind: "surface-create";
			placement: "tab" | "split";
			observedSurfaceId?: string;
	  }
	| { kind: "command-dispatch"; surfaceId: string };

export class RexAcquisitionUncertainError extends Error {
	readonly code = "PIRA_ACQUISITION_UNCERTAIN";
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
