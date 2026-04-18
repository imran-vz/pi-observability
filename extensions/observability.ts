/**
 * Agent Observability Extension
 *
 * Replaces the default footer with a live observability bar showing:
 * - Session input/output tokens & cost
 * - Live TPS during streaming (chunk-based estimate)
 * - Session runtime
 * - Current model & git branch
 * - Git diff stats (added/removed lines)
 * - Context usage (current/max)
 *
 * Commands:
 *   /obs          - Print full observability dashboard + last 10 sessions
 *   /obs-toggle   - Toggle the observability footer on/off
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";

/* ───── Types ───── */

interface TurnRecord {
	turnIndex: number;
	inputTokens: number;
	outputTokens: number;
	cost: number;
	durationMs: number;
	tps: number;
	model: string;
}

interface PersistedTurn {
	customType: "obs-turn";
	data: TurnRecord;
}

interface SessionState {
	startTime: number;
	turns: TurnRecord[];
	currentTurnStartTime: number | null;
	currentTurnUpdateCount: number;
	isStreaming: boolean;
	footerEnabled: boolean;
}

interface SessionSummary {
	endedAt: number;
	runtimeMs: number;
	turns: number;
	inputTokens: number;
	outputTokens: number;
	cost: number;
	model: string;
	cwd: string;
	branch: string | null;
}

/* ───── Helpers ───── */

function fmtDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) ms = 0;
	const s = Math.floor(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0)
		return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
	return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return `${n}`;
}

function shortenPath(p: string): string {
	const home = homedir();
	if (home && p.startsWith(home)) return p.replace(home, "~");
	return p;
}

function scanHistoricalTurns(ctx: ExtensionContext): TurnRecord[] {
	const turns: TurnRecord[] = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === "obs-turn") {
			turns.push((entry as unknown as PersistedTurn).data);
		}
	}
	return turns;
}

function getSessionStartTime(ctx: ExtensionContext): number {
	const entries = ctx.sessionManager.getBranch();
	for (const e of entries) {
		if (typeof e.timestamp === "number" && Number.isFinite(e.timestamp)) {
			return e.timestamp;
		}
	}
	return Date.now();
}

function alignCell(
	str: string,
	width: number,
	align: "left" | "right" = "left",
): string {
	const vis = visibleWidth(str);
	if (vis > width) return truncateToWidth(str, width);
	const pad = width - vis;
	return align === "right" ? " ".repeat(pad) + str : str + " ".repeat(pad);
}

/* ───── History persistence ───── */

const HISTORY_DIR = join(homedir(), ".pi", "agent", "observability");
const HISTORY_FILE = join(HISTORY_DIR, "history.jsonl");

async function loadHistory(): Promise<SessionSummary[]> {
	try {
		const text = await readFile(HISTORY_FILE, "utf8");
		const lines = text.split("\n").filter((l) => l.trim());
		return lines.map((l) => JSON.parse(l));
	} catch {
		return [];
	}
}

async function saveHistory(sessions: SessionSummary[]): Promise<void> {
	await mkdir(HISTORY_DIR, { recursive: true });
	const text = `${sessions.map((s) => JSON.stringify(s)).join("\n")}\n`;
	await writeFile(HISTORY_FILE, text, "utf8");
}

/* ───── Dashboard formatting ───── */

type Theme = {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
};

function buildDashboard(
	state: SessionState,
	ctx: ExtensionContext,
	branch: string | null,
	history: SessionSummary[],
	termWidth: number,
	theme: Theme,
): string[] {
	const runtime = Date.now() - state.startTime;
	const totalIn = state.turns.reduce((s, t) => s + t.inputTokens, 0);
	const totalOut = state.turns.reduce((s, t) => s + t.outputTokens, 0);
	const totalCost = state.turns.reduce((s, t) => s + t.cost, 0);

	const B = (s: string) => theme.fg("border", s);
	const lines: string[] = [];

	// ── Summary Card ──
	const summaryLines = [
		theme.bold("Agent Observability Dashboard"),
		`Runtime: ${fmtDuration(runtime)}    Dir: ${shortenPath(ctx.cwd)}`,
		branch
			? `Branch: ${branch}    Model: ${ctx.model?.id ?? "none"}`
			: `Model: ${ctx.model?.id ?? "none"}`,
		`Tokens: ↑${fmtTokens(totalIn)} ↓${fmtTokens(totalOut)}`,
		`Cost: $${totalCost.toFixed(6)}`,
	];
	const summaryW = Math.min(
		Math.max(...summaryLines.map((c) => visibleWidth(c))) + 4,
		termWidth,
	);
	const inner = summaryW - 4;
	const padSummary = (text: string) => {
		const safe = truncateToWidth(text, inner);
		const vis = visibleWidth(safe);
		const pad = Math.max(0, inner - vis);
		return B("│ ") + safe + B(`${" ".repeat(pad)} │`);
	};

	lines.push(B(`┌${"─".repeat(summaryW - 2)}┐`));
	lines.push(padSummary(summaryLines[0]));
	lines.push(B(`├${"─".repeat(summaryW - 2)}┤`));
	for (let i = 1; i < summaryLines.length; i++) {
		lines.push(padSummary(summaryLines[i]));
	}
	lines.push(B(`└${"─".repeat(summaryW - 2)}┘`));

	// ── Turns Table ──
	if (state.turns.length > 0) {
		lines.push("");
		lines.push(
			`  ${theme.bold(theme.fg("accent", `TURNS  (${state.turns.length})`))}`,
		);

		const headers = ["#", "Input", "Output", "Time", "TPS", "Cost", "Model"];
		const rows = state.turns.map((t, i) => [
			`${i + 1}`,
			`↑${fmtTokens(t.inputTokens)}`,
			`↓${fmtTokens(t.outputTokens)}`,
			fmtDuration(t.durationMs),
			`${t.tps.toFixed(1)}`,
			`$${t.cost.toFixed(2)}`,
			t.model,
		]);

		const colW = headers.map((h, i) =>
			Math.max(visibleWidth(h), ...rows.map((r) => visibleWidth(r[i]))),
		);
		const tableW = colW.reduce((a, b) => a + b, 0) + 2 * (colW.length - 1) + 2;
		if (tableW > termWidth && colW[colW.length - 1]! > 10) {
			colW[colW.length - 1] = Math.max(
				10,
				colW[colW.length - 1]! - (tableW - termWidth),
			);
		}

		const pad = "  ";
		const hdr = `  ${headers.map((h, i) => alignCell(h, colW[i]!)).join(pad)}`;
		lines.push(theme.fg("dim", hdr));
		lines.push(B(`  ${"─".repeat(visibleWidth(hdr) - 2)}`));
		for (const row of rows) {
			const cells = row.map((c, i) =>
				alignCell(c, colW[i]!, i === 0 || i >= 3 ? "left" : "right"),
			);
			lines.push(`  ${cells.join(pad)}`);
		}
	}

	// ── History Table ──
	if (history.length > 0) {
		lines.push("");
		lines.push(`  ${theme.bold(theme.fg("accent", "LAST 10 SESSIONS"))}`);

		const headers = [
			"When",
			"Duration",
			"Turns",
			"Input",
			"Output",
			"Cost",
			"Model",
		];
		const rows = history
			.slice()
			.reverse()
			.map((h) => {
				const date = new Date(h.endedAt).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				return [
					date,
					fmtDuration(h.runtimeMs),
					`${h.turns}`,
					`↑${fmtTokens(h.inputTokens)}`,
					`↓${fmtTokens(h.outputTokens)}`,
					`$${h.cost.toFixed(2)}`,
					h.model,
				];
			});

		const colW = headers.map((h, i) =>
			Math.max(visibleWidth(h), ...rows.map((r) => visibleWidth(r[i]))),
		);
		const tableW = colW.reduce((a, b) => a + b, 0) + 2 * (colW.length - 1) + 2;
		if (tableW > termWidth && colW[colW.length - 1]! > 10) {
			colW[colW.length - 1] = Math.max(
				10,
				colW[colW.length - 1]! - (tableW - termWidth),
			);
		}

		const pad = "  ";
		const hdr = `  ${headers.map((h, i) => alignCell(h, colW[i]!)).join(pad)}`;
		lines.push(theme.fg("dim", hdr));
		lines.push(B(`  ${"─".repeat(visibleWidth(hdr) - 2)}`));
		for (const row of rows) {
			const cells = row.map((c, i) =>
				alignCell(c, colW[i]!, i === 0 || i >= 2 ? "left" : "right"),
			);
			lines.push(`  ${cells.join(pad)}`);
		}
	}

	return lines;
}

/* ───── Extension ───── */

export default function (pi: ExtensionAPI) {
	const state: SessionState = {
		startTime: Date.now(),
		turns: [],
		currentTurnStartTime: null,
		currentTurnUpdateCount: 0,
		isStreaming: false,
		footerEnabled: true,
	};

	/* ─── Lifecycle ─── */

	pi.on("session_start", async (_event, ctx) => {
		state.startTime = getSessionStartTime(ctx);
		state.turns = scanHistoricalTurns(ctx);
		state.currentTurnStartTime = null;
		state.currentTurnUpdateCount = 0;
		state.isStreaming = false;

		if (state.footerEnabled && ctx.hasUI) {
			setupFooter(ctx);
		}
	});

	pi.on("turn_start", async (_event, _ctx) => {
		state.currentTurnStartTime = Date.now();
		state.currentTurnUpdateCount = 0;
		state.isStreaming = true;
	});

	pi.on("message_update", async (_event, _ctx) => {
		state.currentTurnUpdateCount++;
	});

	pi.on("turn_end", async (event, ctx) => {
		const duration = state.currentTurnStartTime
			? Date.now() - state.currentTurnStartTime
			: 0;

		let inputTokens = 0;
		let outputTokens = 0;
		let cost = 0;

		const branch = ctx.sessionManager.getBranch();
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type === "message" && entry.message.role === "assistant") {
				const m = entry.message as AssistantMessage;
				inputTokens = m.usage?.input ?? 0;
				outputTokens = m.usage?.output ?? 0;
				cost = m.usage?.cost?.total ?? 0;
				break;
			}
		}

		const tps =
			duration > 0 && outputTokens >= 0 ? outputTokens / (duration / 1000) : 0;

		const record: TurnRecord = {
			turnIndex: event.turnIndex,
			inputTokens,
			outputTokens,
			cost,
			durationMs: duration,
			tps,
			model: ctx.model?.id ?? "unknown",
		};

		state.turns.push(record);
		state.isStreaming = false;
		state.currentTurnStartTime = null;
		state.currentTurnUpdateCount = 0;

		pi.appendEntry("obs-turn", record);
	});

	pi.on("agent_end", async (_event, _ctx) => {
		state.isStreaming = false;
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		const totalIn = state.turns.reduce((s, t) => s + t.inputTokens, 0);
		const totalOut = state.turns.reduce((s, t) => s + t.outputTokens, 0);
		const totalCost = state.turns.reduce((s, t) => s + t.cost, 0);
		const runtime = Date.now() - state.startTime;

		let branch: string | null = null;
		try {
			const result = await pi.exec("git", ["branch", "--show-current"], {
				cwd: ctx.cwd,
			});
			branch = result.stdout?.trim() || null;
		} catch {
			branch = null;
		}

		const summary: SessionSummary = {
			endedAt: Date.now(),
			runtimeMs: runtime,
			turns: state.turns.length,
			inputTokens: totalIn,
			outputTokens: totalOut,
			cost: totalCost,
			model: ctx.model?.id ?? "unknown",
			cwd: ctx.cwd,
			branch,
		};

		const history = await loadHistory();
		history.push(summary);
		if (history.length > 10) history.splice(0, history.length - 10);
		await saveHistory(history);
	});

	/* ─── Footer ─── */

	function setupFooter(ctx: ExtensionContext) {
		ctx.ui.setFooter((tui, theme, footerData) => {
			let diffAdded = 0;
			let diffRemoved = 0;

			async function refreshDiff() {
				try {
					const result = await pi.exec("git", ["diff", "--numstat"], {
						cwd: ctx.cwd,
					});
					if (result.code !== 0 || !result.stdout) {
						diffAdded = 0;
						diffRemoved = 0;
						return;
					}
					let added = 0;
					let removed = 0;
					for (const line of result.stdout.split("\n")) {
						const parts = line.trim().split(/\s+/);
						if (parts.length >= 2) {
							const a = parseInt(parts[0], 10);
							const b = parseInt(parts[1], 10);
							if (!Number.isNaN(a)) added += a;
							if (!Number.isNaN(b)) removed += b;
						}
					}
					diffAdded = added;
					diffRemoved = removed;
				} catch {
					diffAdded = 0;
					diffRemoved = 0;
				}
			}

			refreshDiff();

			const unsubBranch = footerData.onBranchChange(() => {
				refreshDiff();
				tui.requestRender();
			});

			const timer = setInterval(() => {
				refreshDiff();
				tui.requestRender();
			}, 1000);

			return {
				dispose() {
					unsubBranch();
					clearInterval(timer);
				},
				invalidate() {},
				render(width: number): string[] {
					const totalIn = state.turns.reduce((s, t) => s + t.inputTokens, 0);
					const totalOut = state.turns.reduce((s, t) => s + t.outputTokens, 0);
					const totalCost = state.turns.reduce((s, t) => s + t.cost, 0);
					let runtime = Date.now() - state.startTime;
					if (!Number.isFinite(runtime) || runtime < 0) runtime = 0;

					const branch = footerData.getGitBranch();
					const model = ctx.model?.id ?? "no-model";
					const cwd = shortenPath(ctx.cwd);

					// ── Line 1: folder + branch + git diff stats ──
					const branchPart = branch ? ` (${branch})` : "";
					const diffPart =
						diffAdded > 0 || diffRemoved > 0
							? `  ${theme.fg("success", `+${diffAdded}`)} ${theme.fg("error", `-${diffRemoved}`)}`
							: "";
					const line1Raw = theme.fg("dim", `${cwd}${branchPart}`) + diffPart;
					const line1 = truncateToWidth(line1Raw, width);

					// ── Line 2: runtime, context, tokens, cost, TPS, model ──
					const segRuntime = theme.fg("dim", `⏱ ${fmtDuration(runtime)}`);

					const ctxUsage = ctx.getContextUsage();
					const segCtx = ctxUsage
						? theme.fg(
								"dim",
								`ctx ${fmtTokens(ctxUsage.tokens || 0)}/${fmtTokens(ctxUsage.contextWindow)}`,
							)
						: "";

					const segTokens = theme.fg(
						"dim",
						`↑${fmtTokens(totalIn)} ↓${fmtTokens(totalOut)}`,
					);
					const segCost = theme.fg("dim", `$${totalCost.toFixed(4)}`);

					let segTps = "";
					if (state.isStreaming && state.currentTurnStartTime) {
						const elapsed = (Date.now() - state.currentTurnStartTime) / 1000;
						const liveTps =
							elapsed > 0 ? state.currentTurnUpdateCount / elapsed : 0;
						segTps = theme.fg("accent", `⚡ ${liveTps.toFixed(1)} tok/s`);
					} else if (state.turns.length > 0) {
						const last = state.turns[state.turns.length - 1];
						segTps = theme.fg("accent", `⚡ ${last.tps.toFixed(1)} tok/s`);
					}

					const segModel = theme.fg("dim", model);

					const leftRaw = [segRuntime, segCtx, segTokens, segCost, segTps]
						.filter(Boolean)
						.join("  ");
					const leftW = visibleWidth(leftRaw);
					const rightW = visibleWidth(segModel);

					const gap = width - leftW - rightW;
					let line2: string;
					if (gap >= 1) {
						line2 = leftRaw + " ".repeat(gap) + segModel;
					} else {
						line2 = `${leftRaw} ${segModel}`;
					}
					line2 = truncateToWidth(line2, width);

					return [line1, line2];
				},
			};
		});
	}

	function teardownFooter(ctx: ExtensionContext) {
		ctx.ui.setFooter(undefined);
	}

	/* ─── Commands ─── */

	pi.registerCommand("obs", {
		description:
			"Show observability dashboard (tokens, cost, TPS, runtime, history)",
		handler: async (_args, ctx) => {
			const branchResult = await pi.exec("git", ["branch", "--show-current"], {
				cwd: ctx.cwd,
			});
			const branch = branchResult.stdout?.trim() || null;
			const history = await loadHistory();

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				let cachedWidth = 0;
				let cachedLines: string[] = [];

				return {
					invalidate() {
						cachedWidth = 0;
						cachedLines = [];
					},
					handleInput(data: string) {
						if (
							matchesKey(data, Key.escape) ||
							matchesKey(data, Key.enter) ||
							matchesKey(data, Key.space)
						) {
							done();
						}
					},
					render(width: number): string[] {
						if (cachedWidth === width && cachedLines.length > 0) {
							return cachedLines;
						}

						cachedLines = buildDashboard(
							state,
							ctx,
							branch,
							history,
							width,
							theme,
						);

						// Add hint at bottom
						const hint = theme.fg("dim", "Press ESC or Enter to close");
						const hintVisible = visibleWidth(hint);
						const pad = Math.max(0, width - hintVisible);
						cachedLines.push("");
						cachedLines.push(hint + " ".repeat(pad));

						cachedWidth = width;
						return cachedLines;
					},
				};
			});
		},
	});

	pi.registerCommand("obs-toggle", {
		description: "Toggle the observability footer on/off",
		handler: async (_args, ctx) => {
			state.footerEnabled = !state.footerEnabled;
			if (state.footerEnabled) {
				setupFooter(ctx);
				ctx.ui.notify("Observability footer enabled", "success");
			} else {
				teardownFooter(ctx);
				ctx.ui.notify("Observability footer disabled", "info");
			}
		},
	});
}
