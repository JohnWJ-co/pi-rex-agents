import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	PaneConfig,
	PaneMode,
} from "../../maestro/core/config/pane-config.ts";
import type { SurfaceInfo } from "../../maestro/core/surface-provider.ts";
import { AcquisitionUncertainError } from "../../maestro/core/surface-provider.ts";
import { createPiPlacementReservation } from "../../maestro/runtime/pi-placement.ts";

const config: PaneConfig = { mode: "split", direction: "right", maxPerTab: 2 };

function fixture() {
	const surfaces = new Map<string, SurfaceInfo>([
		["parent", { id: "parent", workspaceId: "parent-window" }],
	]);
	const registered = new Set<string>();
	const choices: PaneMode[] = [];
	const placement = createPiPlacementReservation(
		{ listSurfaces: () => [...surfaces.values()] },
		"parent",
		() => registered,
	);
	function create(mode: PaneMode) {
		choices.push(mode);
		const id = `child-${choices.length}`;
		const surface: SurfaceInfo = {
			id,
			workspaceId:
				mode === "split" || mode === "minimized"
					? "parent-window"
					: `window-${id}`,
		};
		if (mode === "minimized") surface.minimized = true;
		surfaces.set(id, surface);
		return id;
	}
	function register(id: string) {
		registered.add(id);
		placement.registered(id);
	}
	return { surfaces, registered, placement, choices, create, register };
}

test("Pi placement admits split, split, tab and reuses a closed child slot", async () => {
	const f = fixture();
	const first = await f.placement.acquire(config, undefined, f.create);
	f.register(first);
	f.register(await f.placement.acquire(config, "split", f.create));
	f.register(await f.placement.acquire(config, "split", f.create));
	assert.deepEqual(f.choices, ["split", "split", "tab"]);
	// The registry still has this child; provider liveness is authoritative.
	f.surfaces.delete(first);
	await f.placement.acquire(config, undefined, f.create);
	assert.deepEqual(f.choices, ["split", "split", "tab", "split"]);
});

test("Pi placement reserves a pending create before a concurrent launch inspects capacity", async () => {
	const f = fixture();
	let release!: () => void;
	let entered!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const limited = { ...config, maxPerTab: 1 };
	const first = f.placement.acquire(limited, undefined, async (mode) => {
		entered();
		await gate;
		return f.create(mode);
	});
	await started;
	const second = f.placement.acquire(limited, undefined, f.create);
	release();
	await Promise.all([first, second]);
	// Neither child was registered: readiness must not leave a second free slot.
	assert.deepEqual(f.choices, ["split", "tab"]);
});

test("Pi placement counts only this parent's live registered blocks in its current window", async () => {
	const f = fixture();
	f.surfaces.set("other-parent-child", {
		id: "other-parent-child",
		workspaceId: "parent-window",
	});
	f.surfaces.set("owned-tab", { id: "owned-tab", workspaceId: "other-window" });
	f.registered.add("owned-tab");
	f.registered.add("already-closed");
	await f.placement.acquire({ ...config, maxPerTab: 1 }, undefined, f.create);
	assert.deepEqual(f.choices, ["split"]);
	f.surfaces.set("parent", { id: "parent", workspaceId: "moved-parent" });
	await f.placement.acquire({ ...config, maxPerTab: 1 }, undefined, f.create);
	assert.deepEqual(f.choices, ["split", "split"]);
});

test("Pi placement creates minimized children outside split capacity and ignores them in the count", async () => {
	const f = fixture();
	const limited = { ...config, maxPerTab: 1 };
	const minimized = await f.placement.acquire(limited, "minimized", f.create);
	f.register(minimized);
	await f.placement.acquire(limited, "split", f.create);
	await f.placement.acquire(limited, "split", f.create);
	assert.deepEqual(f.choices, ["minimized", "split", "tab"]);
});

test("Pi placement honors explicit tab and split overrides independently of defaults", async () => {
	const f = fixture();
	await f.placement.acquire(config, "tab", f.create);
	await f.placement.acquire({ ...config, mode: "tab" }, "split", f.create);
	assert.deepEqual(f.choices, ["tab", "split"]);
	f.surfaces.delete("parent");
	await f.placement.acquire(config, "split", f.create);
	assert.deepEqual(f.choices, ["tab", "split", "tab"]);
});

test("Pi placement releases a rejected create and respects an aborted queued acquisition", async () => {
	const f = fixture();
	await assert.rejects(
		f.placement.acquire(config, undefined, () => {
			throw new Error("create rejected");
		}),
		/create rejected/,
	);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		f.placement.acquire(config, undefined, f.create, {
			signal: controller.signal,
		}),
		{ name: "AbortError" },
	);
	await f.placement.acquire(config, undefined, f.create);
	assert.deepEqual(f.choices, ["split"]);
});

test("Pi placement retains an observed uncertain split until the provider confirms it closed", async () => {
	const f = fixture();
	const limited = { ...config, maxPerTab: 1 };
	await assert.rejects(
		f.placement.acquire(limited, undefined, (mode) => {
			const id = f.create(mode);
			throw new AcquisitionUncertainError("lost create response", {
				kind: "surface-create",
				placement: "split",
				observedSurfaceId: id,
			});
		}),
		/lost create response/,
	);
	await f.placement.acquire(limited, undefined, f.create);
	assert.deepEqual(f.choices, ["split", "tab"]);
	f.surfaces.delete("child-1");
	await f.placement.acquire(limited, undefined, f.create);
	assert.deepEqual(f.choices, ["split", "tab", "split"]);
});
