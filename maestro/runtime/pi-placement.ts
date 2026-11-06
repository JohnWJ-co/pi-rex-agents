import type { PaneConfig, PaneMode } from "../core/config/pane-config.ts";
import {
	isAcquisitionUncertainError,
	type AcquisitionControl,
	type SurfaceProvider,
} from "../core/surface-provider.ts";

/** One parent owns this queue across launches and extension reloads. */
export function createPiPlacementReservation(
	provider: Pick<SurfaceProvider, "listSurfaces">,
	parentSurfaceId: string | undefined,
	registeredSurfaces: () => Iterable<string>,
) {
	let queue = Promise.resolve();
	// A surface may exist before launch readiness registers its child owner.
	const pending = new Set<string>();

	return {
		registered(surface: string) {
			pending.delete(surface);
		},
		async acquire(
			config: PaneConfig,
			requested: PaneMode | undefined,
			create: (placement: PaneMode) => string | Promise<string>,
			control?: AcquisitionControl,
		): Promise<string> {
			const previous = queue;
			let release!: () => void;
			queue = new Promise<void>((resolve) => {
				release = resolve;
			});
			await previous;
			try {
				control?.signal?.throwIfAborted();
				let placement = requested ?? config.mode;
				if (placement === "split") {
					const surfaces = await provider.listSurfaces();
					control?.signal?.throwIfAborted();
					const parent = surfaces.find(
						(surface) => surface.id === parentSurfaceId,
					);
					const live = new Set(surfaces.map((surface) => surface.id));
					for (const surface of pending) {
						if (!live.has(surface)) pending.delete(surface);
					}
					const owned = new Set([...registeredSurfaces(), ...pending]);
					const count = surfaces.filter(
						(surface) =>
							surface.id !== parentSurfaceId &&
							owned.has(surface.id) &&
							surface.workspaceId === parent?.workspaceId,
					).length;
					// If the parent window cannot be verified, a fresh tab keeps the cap.
					if (!parent?.workspaceId || count >= config.maxPerTab)
						placement = "tab";
				}
				try {
					const surface = await create(placement);
					if (placement === "split") pending.add(surface);
					return surface;
				} catch (error) {
					// A lost create reply can still identify a real, not-yet-registered block.
					if (
						placement === "split" &&
						isAcquisitionUncertainError(error) &&
						error.uncertainty.kind === "surface-create" &&
						error.uncertainty.observedSurfaceId
					)
						pending.add(error.uncertainty.observedSurfaceId);
					throw error;
				}
			} finally {
				release();
			}
		},
	};
}

export type PiPlacementReservation = ReturnType<
	typeof createPiPlacementReservation
>;
